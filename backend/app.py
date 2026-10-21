import os
import re
import sqlite3
import datetime
import unicodedata
import json
import sys
import uuid
from typing import Optional, List, Dict, Any

import threading
import time
from flask import Flask, jsonify, request, g
import requests
from dotenv import load_dotenv
from backend.core.paths import PROJECT_ROOT, STATIC_ROOT, DATA_ROOT

# Keep local configuration at the project root after packaging the backend.
env_path = PROJECT_ROOT / '.env'
load_dotenv(dotenv_path=env_path)
from backend.core.database import data_path, DEFAULT_DB_PATH
from backend.operations.fleet import get_zone_coordinates

from backend.integrations.agencies import get_agency_registry
from backend.operations.allocator import generate_dispatch_suggestions
from backend.core.predictions import deduplicate_predictions_table, fetch_canonical_predictions
from backend.operations.dispatch import DispatchError
from backend.auth.mfa import SecurityUnavailable
from backend.integrations.sarvam import SarvamError, speech_to_text, text_to_speech, translate_to_english
from backend.intake.parser import extract_complaint_details
from backend.intake.localities import find_zone_and_locality

app = Flask(__name__, root_path=str(PROJECT_ROOT), static_folder=str(STATIC_ROOT))
from backend.core.observability import install_observability
install_observability(app)
from backend.auth.service import install_auth
install_auth(app)
from backend.api.product import product
app.register_blueprint(product)
app.config['MAX_CONTENT_LENGTH'] = 12 * 1024 * 1024
DB_PATH = DEFAULT_DB_PATH
UPLOAD_FOLDER = str(STATIC_ROOT / 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.errorhandler(SecurityUnavailable)
def security_unavailable(error):
    app.logger.error('Authenticator verification unavailable: host-key configuration')
    return jsonify({'error':'Authenticator verification is unavailable. Use a recovery code or contact your administrator.'}),503


@app.errorhandler(sqlite3.Error)
def database_unavailable(error):
    app.logger.exception('Database request failed: %s', type(error).__name__)
    return jsonify({'error': 'The data service could not complete this request.'}), 503


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({'error': 'The upload exceeds the 12 MB request limit.'}), 413


@app.get('/api/health')
def health():
    if not os.path.isfile(data_path(DB_PATH)):
        return jsonify({'status': 'unavailable'}), 503
    try:
        with sqlite3.connect(data_path(DB_PATH)) as conn:
            conn.execute('SELECT id FROM complaints LIMIT 1')
        from backend.auth.service import auth_connection
        with auth_connection() as conn:
            conn.execute('SELECT id FROM municipalities LIMIT 1')
            if conn.execute('SELECT 1 FROM auth_users WHERE mfa_enabled=1 LIMIT 1').fetchone():
                from backend.auth.mfa import _master
                _master(conn)
        return jsonify({'status': 'ok'})
    except (sqlite3.Error,SecurityUnavailable):
        return jsonify({'status': 'unavailable'}), 503

# Optimized Professional Voice Scripts (Pure Hindi/English - Rahul Persona)
AGENT_GREETING_TEXT = (
    "Namaste! Main NagarFlow AI Agent hoon. "
    "Aap Mumbai mein kisi bhi civic problem ke baare mein mujhe bata sakte hain — "
    "chahe garbage ho, paani ki dikkat ho, sadak ho ya drainage. "
    "Bas apna area aur problem batayein, main abhi register kar deta hoon."
)
AGENT_CONFIRMATION_TEXT = (
    "Bilkul, maine aapki complaint darj kar li hai. "
    "Hamare field team ko alert bhej diya gaya hai — woh jald kaam shuru karenge. "
    "Kya kuch aur hai jisme main aapki help kar sakta hoon?"
)
AGENT_RETRY_TEXT = (
    "Sorry, mujhe thoda samajhne mein dikkat hui. "
    "Kya aap apna area aur problem thoda aur clearly bata sakte hain? "
    "For example — 'Andheri mein garbage nahi utha' ya 'Bandra mein pipe leak hai'."
)
AGENT_CLOSING_TEXT = (
    "Theek hai, dhanyavaad call karne ke liye. "
    "Aapki complaint hamare system mein safe hai. "
    "NagarFlow hamesha aapki seva mein hai. Aapka din achha jaaye!"
)
MAX_AUDIO_BYTES = 10 * 1024 * 1014
MAX_TRANSCRIPT_LENGTH = 500
SOURCE_ID_PREFIXES = {
    "voice_call": "VOICE",
    "text_chat": "TEXT",
}
TRUCK_TYPE_LABELS = {
    "garbage": "Garbage Truck",
    "water": "Water Tanker",
}
ALLOWED_AUDIO_MIME_TYPES = {
    "application/octet-stream",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/ogg",
    "audio/opus",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
    "video/webm",
}

_builtin_print = print


def _safe_log(message: str) -> None:
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    safe_text = str(message).encode(encoding, errors="replace").decode(encoding, errors="replace")
    _builtin_print(safe_text)


print = _safe_log


ZONE_ALIAS_MAP = {
    "Airoli": ["ऐरोली", "airoli station"],
    "Andheri": ["अंधेरी", "andari", "andheri east", "andheri west"],
    "Bandra": ["बांद्रा", "bandra west", "bandra east", "banra"],
    "Belapur": ["बेलापुर"],
    "Bhayander": ["भायंदर", "bhayandar"],
    "Borivali": ["बोरीवली", "borivli", "borivali west", "borivali east"],
    "CST": ["csmt", "vt", "वीटी", "छत्रपति शिवाजी टर्मिनस", "cst station"],
    "Chembur": ["चेंबूर"],
    "Churchgate": ["church gate", "चर्चगेट"],
    "Colaba": ["कुलाबा", "kolaba"],
    "Dadar": ["दादर"],
    "Dharavi": ["धारावी"],
    "Fort": ["फोर्ट"],
    "Ghatkopar": ["घाटकोपर"],
    "Goregaon": ["गोरेगांव", "गोरगांव"],
    "Hiranandani": ["हिरानंदानी", "hiranandani gardens"],
    "Jogeshwari": ["जोगेश्वरी"],
    "Juhu": ["जुहू"],
    "Kandivali": ["कांदिवली", "kandivli"],
    "Kurla": ["कुर्ला", "kula"],
    "Lower Parel": ["लोअर परेल"],
    "Malad": ["मालाड"],
    "Matunga": ["माटुंगा"],
    "Mulund": ["मुलुंड"],
    "Parel": ["परेल"],
    "Powai": ["पवई"],
    "Santacruz": ["सांताक्रूज़", "santacruz east", "santacruz west"],
    "Sion": ["सायन", "shion"],
    "Thane": ["ठाणे"],
    "Versova": ["वर्सोवा"],
    "Vikhroli": ["विक्रोली"],
    "Vile Parle": ["विले पार्ले", "vile parle east", "vile parle west"],
    "Wadala": ["वडाला"],
    "Worli": ["वरली"],
}
ISSUE_KEYWORDS = {
    "Garbage": [
        "garbage",
        "garbage pile",
        "trash",
        "waste",
        "kachra",
        "कचरा",
        "कूड़ा",
        "कुड़ा",
        "bin overflow",
        "dustbin",
    ],
    "Drainage": [
        "drainage",
        "drain",
        "nala",
        "naala",
        "gutter",
        "sewer",
        "overflowing drain",
        "waterlogging",
        "water logging",
        "नाली",
        "नाला",
        "गटर",
        "सीवर",
        "जलभराव",
    ],
    "Roads": [
        "road",
        "roads",
        "street",
        "pothole",
        "crack",
        "collapsed road",
        "road collapse",
        "गड्ढा",
        "गड्डा",
        "सड़क",
        "रोड",
        "रास्ता",
    ],
    "Water": [
        "water",
        "water supply",
        "pipeline",
        "pipe",
        "leak",
        "tanker",
        "tap water",
        "पानी",
        "जल",
        "पाइप",
        "लीक",
        "टैंकर",
        "नल",
    ],
}
def ensure_tables_exist(seed_demo=False):
    from backend.core.schema import initialize_database
    initialize_database(data_path(DB_PATH))
    if seed_demo:
        _initialize_demo_data()
        initialize_database(data_path(DB_PATH))


def _initialize_demo_data():
    """Ensure all required database tables exist with correct schema."""
    conn = sqlite3.connect(data_path(DB_PATH))
    cursor = conn.cursor()
    
    # Complaints Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS complaints 
                      (id TEXT PRIMARY KEY, zone TEXT, locality TEXT, issue_type TEXT, 
                       complaint_count INTEGER, population INTEGER, weather TEXT, timestamp TEXT, 
                       severity TEXT, description TEXT)''')
    
    # Simple migration for existing databases
    try: cursor.execute("ALTER TABLE complaints ADD COLUMN locality TEXT")
    except: pass
    try: cursor.execute("ALTER TABLE complaints ADD COLUMN population INTEGER")
    except: pass
    try: cursor.execute("ALTER TABLE complaints ADD COLUMN description TEXT")
    except: pass
    
    # Trucks Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS trucks 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, 
                       status TEXT, lat REAL, lon REAL, truck_type TEXT DEFAULT 'garbage')''')
    
    # Simple migration for existing databases
    try: cursor.execute("ALTER TABLE trucks ADD COLUMN truck_type TEXT DEFAULT 'garbage'")
    except: pass
    cursor.execute("SELECT id, name, truck_type FROM trucks ORDER BY id")
    truck_rows = cursor.fetchall()
    water_trucks_present = False
    for truck_id, truck_name, truck_type in truck_rows:
        normalized_type = _normalize_truck_type(truck_type)
        if normalized_type == "water":
            water_trucks_present = True
        elif not truck_type:
            normalized_type = _infer_default_truck_type(truck_id, truck_name)
            if normalized_type == "water":
                water_trucks_present = True
            cursor.execute(
                "UPDATE trucks SET truck_type = ? WHERE id = ?",
                (normalized_type, truck_id),
            )

        if normalized_type == "water" and not (truck_name or "").lower().startswith("tanker-"):
            cursor.execute(
                "UPDATE trucks SET name = ? WHERE id = ?",
                (f"Tanker-{truck_id:02d}", truck_id),
            )

    # If an older fleet snapshot has no water tankers yet, rebalance it so the
    # hackathon demo shows both truck classes immediately.
    if truck_rows and not water_trucks_present:
        for index, (truck_id, _truck_name, _truck_type) in enumerate(truck_rows):
            rebalance_type = "water" if index % 3 == 2 else "garbage"
            rebalance_name = f"Tanker-{truck_id:02d}" if rebalance_type == "water" else f"Truck-{truck_id:02d}"
            cursor.execute(
                "UPDATE trucks SET truck_type = ?, name = ? WHERE id = ?",
                (rebalance_type, rebalance_name, truck_id),
            )
    
    # Predictions Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS predictions 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, zone TEXT, 
                       priority_score REAL, type TEXT, action TEXT, 
                       reason TEXT, lat REAL, lon REAL, category TEXT DEFAULT 'General')''')
    
    # Simple migration for existing databases
    try: cursor.execute("ALTER TABLE predictions ADD COLUMN category TEXT DEFAULT 'General'")
    except: pass
    deduplicate_predictions_table(conn)
    
    # Prediction Outcomes Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS prediction_outcomes 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, prediction_id INTEGER, 
                       actual_demand REAL, error_margin REAL, timestamp TEXT)''')
    
    # Zone Coverage Table (Crucial for Reports API)
    cursor.execute('''CREATE TABLE IF NOT EXISTS zone_coverage 
                      (zone TEXT PRIMARY KEY, last_visited TEXT, status TEXT)''')
    
    # Auto-Seed Wards from Metadata if empty
    cursor.execute("SELECT count(*) FROM zone_coverage")
    if cursor.fetchone()[0] == 0:
        wards = [(w, None, 'OVERDUE') for w in ZONE_ALIAS_MAP.keys()]
        cursor.executemany("INSERT INTO zone_coverage (zone, last_visited, status) VALUES (?, ?, ?)", wards)
        print(f"🏙️  City Map Instrumented: {len(wards)} wards seeded into Coverage Engine.")
    
    # Seed mock outcome data if empty (to avoid empty graph errors)
    cursor.execute("SELECT count(*) FROM prediction_outcomes")
    if cursor.fetchone()[0] == 0:
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        mock_outcomes = [
            (0, 10.5, 4.2, now),
            (0, 15.0, 3.8, now),
            (0, 8.2, 5.1, now)
        ]
        cursor.executemany("INSERT INTO prediction_outcomes (prediction_id, actual_demand, error_margin, timestamp) VALUES (?, ?, ?, ?)", mock_outcomes)

    # Agencies Table (Persistent Directory)
    cursor.execute('''CREATE TABLE IF NOT EXISTS agencies 
                      (id TEXT PRIMARY KEY, agency_name TEXT, category TEXT, 
                       city TEXT, municipal_body TEXT, description TEXT, 
                       source_url TEXT, source_label TEXT, dashboard_url TEXT, 
                       source_status TEXT, source_status_code INTEGER, 
                       source_title TEXT, source_description TEXT, 
                       last_checked TEXT, services_json TEXT, contact_json TEXT)''')
    
    # Teams Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS teams 
                      (id TEXT PRIMARY KEY, name TEXT, member_count INTEGER, 
                       type TEXT, status TEXT, current_zone TEXT)''')
    
    # Maintenance Tasks Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS maintenance_tasks
                      (id TEXT PRIMARY KEY, zone TEXT, type TEXT,
                       priority TEXT, status TEXT, assigned_team_id TEXT,
                       reported_time TEXT, completed_time TEXT,
                       image_url TEXT, worker_notes TEXT)''')
    
    # Migration for proof of work
    try: cursor.execute("ALTER TABLE maintenance_tasks ADD COLUMN image_url TEXT")
    except: pass
    try: cursor.execute("ALTER TABLE maintenance_tasks ADD COLUMN worker_notes TEXT")
    except: pass

    # Image Complaints Table (Telegram bot photo complaints)
    cursor.execute('''CREATE TABLE IF NOT EXISTS image_complaints
                      (id TEXT PRIMARY KEY, file_id TEXT, image_url TEXT,
                       caption TEXT, chat_id TEXT,
                       zone TEXT DEFAULT 'Unknown',
                       locality TEXT DEFAULT '',
                       issue_type TEXT DEFAULT 'General',
                       priority TEXT DEFAULT 'pending',
                       status TEXT DEFAULT 'new',
                       timestamp TEXT)''')
    
    # Maintenance Task seeding for demo
    cursor.execute("SELECT count(*) FROM maintenance_tasks")
    if cursor.fetchone()[0] == 0:
        import uuid as _uuid
        now = datetime.datetime.now()
        def ts(h): return (now - datetime.timedelta(hours=h)).strftime('%Y-%m-%d %H:%M:%S')
        tasks = [
            # Alpha-1
            ('MT-101',   'Dharavi',      'Garbage', 'HIGH',   'PENDING',              'Alpha-1',   ts(2),  None,    None, None),
            ('MT-103',   'Bandra',       'Road',    'HIGH',   'ON GROUND',            'Alpha-1',   ts(1),  None,    None, None),
            ('MT-104',   'Colaba',       'Drain',   'LOW',    'PENDING',              'Alpha-1',   ts(6),  None,    None, None),
            ('MT-106',   'Dadar',        'Drain',   'HIGH',   'COMPLETED_UNVERIFIED', 'Alpha-1',   ts(5),  ts(1),   None, 'Drain unblocked and cleaned. Area clear.'),
            # Alpha-2
            ('MT-A2-01', 'Sion',         'Garbage', 'MEDIUM', 'PENDING',              'Alpha-2',   ts(3),  None,    None, None),
            ('MT-A2-02', 'Matunga',      'Garbage', 'HIGH',   'ON GROUND',            'Alpha-2',   ts(1),  None,    None, None),
            # Bravo-1
            ('MT-102',   'Andheri',      'Water',   'MEDIUM', 'PENDING',              'Bravo-1',   ts(4),  None,    None, None),
            ('MT-105',   'Kurla',        'Garbage', 'MEDIUM', 'COMPLETED_UNVERIFIED', 'Bravo-1',   ts(3),  ts(0.5), None, 'Cleared all garbage bags from main road junction.'),
            # Bravo-2
            ('MT-B2-01', 'Mulund',       'Water',   'HIGH',   'PENDING',              'Bravo-2',   ts(2),  None,    None, None),
            ('MT-B2-02', 'Thane West',   'Water',   'MEDIUM', 'COMPLETED_UNVERIFIED', 'Bravo-2',   ts(4),  ts(0.5), None, 'Water line flushed and pressure restored.'),
            # Charlie-1
            ('MT-C1-01', 'Goregaon',     'Road',    'HIGH',   'PENDING',              'Charlie-1', ts(5),  None,    None, None),
            ('MT-C1-02', 'Malad',        'Road',    'MEDIUM', 'ON GROUND',            'Charlie-1', ts(2),  None,    None, None),
            # Charlie-2
            ('MT-C2-01', 'Kandivali',    'Road',    'LOW',    'PENDING',              'Charlie-2', ts(6),  None,    None, None),
            ('MT-C2-02', 'Borivali',     'Road',    'HIGH',   'COMPLETED_UNVERIFIED', 'Charlie-2', ts(3),  ts(1),   None, 'Pothole filled and surface levelled.'),
            # Delta-1
            ('MT-D1-01', 'Ghatkopar',    'Drain',   'MEDIUM', 'PENDING',              'Delta-1',   ts(4),  None,    None, None),
            ('MT-D1-02', 'Vikhroli',     'Drain',   'HIGH',   'ON GROUND',            'Delta-1',   ts(1),  None,    None, None),
            # Delta-2
            ('MT-D2-01', 'Mankhurd',     'Garbage', 'LOW',    'PENDING',              'Delta-2',   ts(7),  None,    None, None),
            ('MT-D2-02', 'Chembur West', 'Road',    'MEDIUM', 'COMPLETED_UNVERIFIED', 'Delta-2',   ts(5),  ts(2),   None, 'Road markings repainted and potholes patched.'),
        ]
        cursor.executemany("INSERT INTO maintenance_tasks (id, zone, type, priority, status, assigned_team_id, reported_time, completed_time, image_url, worker_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", tasks)
        print(f"🛠️  Maintenance Engine: {len(tasks)} field tasks queued.")
    else:
        # Ensure all-squad demo tasks exist on existing DBs
        now = datetime.datetime.now()
        def ts2(h): return (now - datetime.timedelta(hours=h)).strftime('%Y-%m-%d %H:%M:%S')
        for row in [
            ('MT-A2-01', 'Sion',         'Garbage', 'MEDIUM', 'PENDING',              'Alpha-2',   ts2(3), None,    None, None),
            ('MT-A2-02', 'Matunga',      'Garbage', 'HIGH',   'ON GROUND',            'Alpha-2',   ts2(1), None,    None, None),
            ('MT-B2-01', 'Mulund',       'Water',   'HIGH',   'PENDING',              'Bravo-2',   ts2(2), None,    None, None),
            ('MT-B2-02', 'Thane West',   'Water',   'MEDIUM', 'COMPLETED_UNVERIFIED', 'Bravo-2',   ts2(4), ts2(0.5), None, 'Water line flushed and pressure restored.'),
            ('MT-C1-01', 'Goregaon',     'Road',    'HIGH',   'PENDING',              'Charlie-1', ts2(5), None,    None, None),
            ('MT-C1-02', 'Malad',        'Road',    'MEDIUM', 'ON GROUND',            'Charlie-1', ts2(2), None,    None, None),
            ('MT-C2-01', 'Kandivali',    'Road',    'LOW',    'PENDING',              'Charlie-2', ts2(6), None,    None, None),
            ('MT-C2-02', 'Borivali',     'Road',    'HIGH',   'COMPLETED_UNVERIFIED', 'Charlie-2', ts2(3), ts2(1),  None, 'Pothole filled and surface levelled.'),
            ('MT-D1-01', 'Ghatkopar',    'Drain',   'MEDIUM', 'PENDING',              'Delta-1',   ts2(4), None,    None, None),
            ('MT-D1-02', 'Vikhroli',     'Drain',   'HIGH',   'ON GROUND',            'Delta-1',   ts2(1), None,    None, None),
            ('MT-D2-01', 'Mankhurd',     'Garbage', 'LOW',    'PENDING',              'Delta-2',   ts2(7), None,    None, None),
            ('MT-D2-02', 'Chembur West', 'Road',    'MEDIUM', 'COMPLETED_UNVERIFIED', 'Delta-2',   ts2(5), ts2(2),  None, 'Road markings repainted and potholes patched.'),
            ('MT-105',   'Kurla',        'Garbage', 'MEDIUM', 'COMPLETED_UNVERIFIED', 'Bravo-1',   ts2(3), ts2(0.5), None, 'Cleared all garbage bags from main road junction.'),
            ('MT-106',   'Dadar',        'Drain',   'HIGH',   'COMPLETED_UNVERIFIED', 'Alpha-1',   ts2(5), ts2(1),  None, 'Drain unblocked and cleaned. Area clear.'),
        ]:
            cursor.execute("INSERT OR IGNORE INTO maintenance_tasks (id, zone, type, priority, status, assigned_team_id, reported_time, completed_time, image_url, worker_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row)
    # Add locality column if upgrading from older schema
    try:
        cursor.execute("ALTER TABLE image_complaints ADD COLUMN locality TEXT DEFAULT ''")
    except Exception:
        pass

    # Fix any blank / placeholder captions left by the Telegram bot path
    cursor.execute("""
        UPDATE image_complaints SET
            zone        = CASE id
                WHEN 'IMG-7473B00A' THEN 'Dharavi'   WHEN 'IMG-4F35DCBE' THEN 'Andheri'
                WHEN 'IMG-3E2DDEB1' THEN 'Ghatkopar' WHEN 'IMG-EE55EAA6' THEN 'Borivali'
                WHEN 'IMG-5723A295' THEN 'Malad'     WHEN 'IMG-170D71C4' THEN 'Kandivali'
                WHEN 'IMG-F483B94B' THEN 'Kurla'     ELSE zone END,
            locality    = CASE id
                WHEN 'IMG-7473B00A' THEN '90 Feet Road'      WHEN 'IMG-4F35DCBE' THEN 'Andheri West'
                WHEN 'IMG-3E2DDEB1' THEN 'Ghatkopar East'    WHEN 'IMG-EE55EAA6' THEN 'Borivali Market'
                WHEN 'IMG-5723A295' THEN 'Malad West'        WHEN 'IMG-170D71C4' THEN 'Kandivali East'
                WHEN 'IMG-F483B94B' THEN 'Kurla West'        ELSE locality END,
            issue_type  = CASE id
                WHEN 'IMG-7473B00A' THEN 'Garbage'    WHEN 'IMG-4F35DCBE' THEN 'Roads'
                WHEN 'IMG-3E2DDEB1' THEN 'Water'      WHEN 'IMG-EE55EAA6' THEN 'Drainage'
                WHEN 'IMG-5723A295' THEN 'Garbage'    WHEN 'IMG-170D71C4' THEN 'Electricity'
                WHEN 'IMG-F483B94B' THEN 'General'    ELSE issue_type END,
            priority    = CASE id
                WHEN 'IMG-7473B00A' THEN 'high'     WHEN 'IMG-4F35DCBE' THEN 'critical'
                WHEN 'IMG-3E2DDEB1' THEN 'critical' WHEN 'IMG-EE55EAA6' THEN 'medium'
                WHEN 'IMG-5723A295' THEN 'high'     WHEN 'IMG-170D71C4' THEN 'medium'
                WHEN 'IMG-F483B94B' THEN 'low'      ELSE priority END,
            caption     = CASE id
                WHEN 'IMG-7473B00A' THEN 'Overflowing garbage bins near Dharavi junction, waste spilling onto road'
                WHEN 'IMG-4F35DCBE' THEN 'Massive pothole on main road outside Andheri station causing accidents'
                WHEN 'IMG-3E2DDEB1' THEN 'Broken water pipeline flooding footpath in Ghatkopar East'
                WHEN 'IMG-EE55EAA6' THEN 'Clogged drain overflowing onto street near Borivali market area'
                WHEN 'IMG-5723A295' THEN 'Uncollected garbage pile outside Malad West school for 3 days'
                WHEN 'IMG-170D71C4' THEN 'Street light pole fallen on road in Kandivali, blocking traffic'
                WHEN 'IMG-F483B94B' THEN 'Illegal construction debris dumped on footpath in Kurla'
                ELSE caption END
        WHERE caption IN ('No caption', 'No description available', '') OR zone = 'Unknown'
    """)

    # Seed mock image complaints if table is nearly empty (for demo)
    cursor.execute("SELECT COUNT(*) FROM image_complaints")
    img_count = cursor.fetchone()[0]
    if img_count < 5:
        import uuid as _uuid
        now = datetime.datetime.now()
        mock_img = [
            (_uuid.uuid4().hex[:8].upper(), 'Garbage bags overflowing on street corner in Dharavi',
             'Dharavi', '90 Feet Road', 'Garbage', 'high', 'new',
             (now - datetime.timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S')),
            (_uuid.uuid4().hex[:8].upper(), 'Road completely broken near Andheri station entrance',
             'Andheri', 'Andheri Station', 'Roads', 'critical', 'under_review',
             (now - datetime.timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S')),
            (_uuid.uuid4().hex[:8].upper(), 'Water pipeline burst flooding entire lane in Kandivali',
             'Kandivali', 'Charkop', 'Water', 'critical', 'in_progress',
             (now - datetime.timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S')),
            (_uuid.uuid4().hex[:8].upper(), 'Open drainage causing bad smell near Borivali market',
             'Borivali', 'Borivali Market', 'Drainage', 'medium', 'new',
             (now - datetime.timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S')),
            (_uuid.uuid4().hex[:8].upper(), 'Street light not working for 5 days in Malad West',
             'Malad', 'Malad West', 'Electricity', 'low', 'resolved',
             (now - datetime.timedelta(hours=5)).strftime('%Y-%m-%d %H:%M:%S')),
            (_uuid.uuid4().hex[:8].upper(), 'Illegal dumping near school in Ghatkopar',
             'Ghatkopar', 'Ghatkopar East', 'Garbage', 'high', 'under_review',
             (now - datetime.timedelta(hours=6)).strftime('%Y-%m-%d %H:%M:%S')),
        ]
        for m in mock_img:
            cid = f"IMG-{m[0]}"
            cursor.execute("""
                INSERT OR IGNORE INTO image_complaints
                (id, file_id, image_url, caption, chat_id, zone, locality, issue_type, priority, status, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (cid, '', '', m[1], 'mock', m[2], m[3], m[4], m[5], m[6], m[7]))

    # Seed Teams if empty
    cursor.execute("SELECT count(*) FROM teams")
    if cursor.fetchone()[0] == 0:
        teams = [
            ('Alpha-1', 'Alpha-1', 4, 'Garbage', 'Idle', None),
            ('Alpha-2', 'Alpha-2', 3, 'Garbage', 'Idle', None),
            ('Bravo-1', 'Bravo-1', 5, 'Water', 'Idle', None),
            ('Bravo-2', 'Bravo-2', 3, 'Water', 'Idle', None),
            ('Charlie-1', 'Charlie-1', 4, 'Road', 'Idle', None),
            ('Charlie-2', 'Charlie-2', 3, 'Road', 'Idle', None),
            ('Delta-1', 'Delta-1', 4, 'General', 'Idle', None),
            ('Delta-2', 'Delta-2', 5, 'General', 'Idle', None)
        ]
        cursor.executemany("INSERT INTO teams (id, name, member_count, type, status, current_zone) VALUES (?, ?, ?, ?, ?, ?)", teams)
        print(f"👷  BMC Workforce Initialized: {len(teams)} teams registered.")

    conn.commit()
    # Startup must not contact external providers while initializing the schema.
    cursor.execute("SELECT count(*) FROM agencies")
    if cursor.fetchone()[0] == 0:
        print("📥  Initial Agency Sync: Building local Municipal Registry...")
        try:
            # We will use a local function to avoid circular imports if needed, 
            # but agencies_scraper is already imported at top
            from backend.integrations.agencies import get_seed_registry
            payload = get_seed_registry()
            _persist_agencies_to_db(payload.get('agencies', []))
        except Exception as e:
            print(f"⚠️  Initial Agency Sync failed: {type(e).__name__}")

    conn.commit()
    conn.close()


def _persist_agencies_to_db(agencies: List[Dict[str, Any]]):
    """Save scraped agency records into the SQLite database."""
    conn = sqlite3.connect(data_path(DB_PATH))
    cursor = conn.cursor()
    for a in agencies:
        cursor.execute('''
            INSERT OR REPLACE INTO agencies (
                id, agency_name, category, city, municipal_body, description,
                source_url, source_label, dashboard_url, source_status, 
                source_status_code, source_title, source_description, 
                last_checked, services_json, contact_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            a['id'], a['agency_name'], a['category'], a['city'], a['municipal_body'], a['description'],
            a['source_url'], a['source_label'], a['dashboard_url'], a['source_status'],
            a.get('source_status_code'), a['source_title'], a['source_description'],
            a['last_checked'], json.dumps(a['services']), json.dumps(a['contact'])
        ))
    conn.commit()
    conn.close()


HIGH_SEVERITY_KEYWORDS = [
    "urgent",
    "immediately",
    "danger",
    "flood",
    "overflowing",
    "collapsed",
    "critical",
    "emergency",
    "तुरंत",
    "जल्दी",
    "बहुत ज्यादा",
    "खतरा",
    "बाढ़",
]
CALL_END_EXACT_PHRASES = {
    "no",
    "nope",
    "nah",
    "nothing else",
    "that is all",
    "thats all",
    "that's all",
    "thank you",
    "thanks",
    "thank you so much",
    "thanks a lot",
    "ok thank you",
    "okay thank you",
    "ok thanks",
    "goodbye",
    "bye",
    "bye bye",
    "nahi",
    "nahin",
    "nahi hai",
    "bas",
    "shukriya",
    "dhanyawad",
    "dhanyavaad",
    "dhanyabad",
    "theek hai shukriya",
    "ok shukriya",
    "बस",
    "नहीं",
    "नही",
    "शुक्रिया",
    "धन्यवाद",
    "ठीक है",
    "अलविदा",
}
CALL_END_CONTAINS_PHRASES = [
    "aur nahi",
    "aur kuch nahi",
    "no more issue",
    "no other issue",
    "nothing more",
    "thank you",
    "thanks",
    "shukriya",
    "dhanyawad",
    "dhanyavaad",
    "bas itna hi",
    "bas itna",
    "और नहीं",
    "और कुछ नहीं",
    "शुक्रिया",
    "धन्यवाद",
]

def _normalize_truck_type(truck_type: Optional[str]) -> str:
    normalized = (truck_type or "").strip().lower()
    if normalized in TRUCK_TYPE_LABELS:
        return normalized
    return "garbage"


def _truck_type_label(truck_type: Optional[str]) -> str:
    return TRUCK_TYPE_LABELS[_normalize_truck_type(truck_type)]


def _infer_default_truck_type(seed_value: Any, name: Optional[str] = None) -> str:
    seed_text = f"{seed_value} {name or ''}".lower()
    if any(token in seed_text for token in ("water", "tanker", "hydrant")):
        return "water"
    if any(token in seed_text for token in ("garbage", "waste")):
        return "garbage"

    digits = "".join(ch for ch in str(seed_value) if ch.isdigit())
    seed_number = int(digits) if digits else 0
    return "water" if seed_number % 3 == 0 else "garbage"


# Simple CORS setup to completely allow the frontend Next.js queries
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin in app.config['AUTH_TRUSTED_ORIGINS']:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers.add('Vary', 'Origin')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token,Idempotency-Key')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS')
    return response

@app.route('/api/predictions', methods=['GET'])
def get_predictions():
    if not os.path.exists(data_path(DB_PATH)):
        return jsonify({"error": "Database not initialized"}), 500
        
    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    from backend.operations.fleet import get_zone_coordinates
    predictions = fetch_canonical_predictions(cursor)
    
    # Formatting for Next.js expectations
    formatted = []
    for p in predictions:
        lat, lon = get_zone_coordinates(p['zone'])
        formatted.append({
            'name': p['zone'],
            'demand': p['priority_score'],
            'type': p['type'],
            'action': p['action'],
            'reason': p['reason'],
            'lat': lat,
            'lon': lon,
            'category': p['category']
        })
        
    conn.close()
    return jsonify(formatted)

@app.route('/api/weather/zones', methods=['GET'])
def get_weather_zones():
    return jsonify([])  # No verified per-zone observations are configured.

@app.route('/api/dispatch', methods=['GET'])
def get_dispatch():
    return jsonify(generate_dispatch_suggestions())

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, status, lat, lon, truck_type FROM trucks")
    trucks = []
    for truck in cursor.fetchall():
        truck_data = dict(truck)
        truck_data["truck_type"] = _normalize_truck_type(truck_data.get("truck_type"))
        truck_data["truck_type_label"] = _truck_type_label(truck_data["truck_type"])
        trucks.append(truck_data)
    predictions = fetch_canonical_predictions(cursor)
    from backend.operations.fleet import get_zone_coordinates
    dashboard_predictions = []
    for p in predictions:
        lat, lon = get_zone_coordinates(p['zone'])
        dashboard_predictions.append({
            "zone": p["zone"],
            "priority_score": p["priority_score"],
            "action": p["action"],
            "reason": p["reason"],
            "lat": lat,
            "lon": lon,
        })
    conn.close()
    return jsonify({"trucks": trucks, "predictions": dashboard_predictions})

@app.errorhandler(DispatchError)
def dispatch_error(error):
    return jsonify({'error': str(error), 'code': error.code}), error.status


@app.get('/api/dispatch/assignments')
def get_dispatch_assignments():
    from backend.operations.dispatch import list_dispatches
    return jsonify({'dispatches': list_dispatches(data_path(DB_PATH))})


@app.post('/api/dispatch/accept')
def accept_dispatch():
    from backend.operations.dispatch import accept
    return jsonify(accept(data_path(DB_PATH), request.get_json(silent=True),
                          request.headers.get('Idempotency-Key'), g.user['id']))


@app.post('/api/dispatch/arrive')
def arrive_dispatch():
    from backend.operations.dispatch import finish
    return jsonify(finish(data_path(DB_PATH), request.get_json(silent=True),
                          request.headers.get('Idempotency-Key'), g.user['id']))


@app.post('/api/dispatch/cancel')
def cancel_dispatch():
    from backend.operations.dispatch import finish
    return jsonify(finish(data_path(DB_PATH), request.get_json(silent=True),
                          request.headers.get('Idempotency-Key'), g.user['id'], cancel=True))


@app.post('/api/dispatch/observation')
def correct_dispatch_observation():
    from backend.operations.dispatch import correct_observation
    return jsonify(correct_observation(data_path(DB_PATH),request.get_json(silent=True),request.headers.get('Idempotency-Key'),g.user['id']))


@app.route('/api/reports', methods=['GET'])
def get_reports():
    from backend.operations.reporting import operations_report
    return jsonify(operations_report(data_path(DB_PATH)))


@app.route('/api/agencies', methods=['GET'])
def get_agencies():
    force_refresh = request.args.get('refresh') == '1'

    if force_refresh:
        try:
            payload = get_agency_registry(force_refresh=True)
            _persist_agencies_to_db(payload.get('agencies', []))
        except Exception as e:
            print(f"⚠️  Manual Agency Refresh failed: {type(e).__name__}")

    # Serving from Database (Fast Path)
    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    rows = cursor.execute("SELECT * FROM agencies").fetchall()
    
    agencies = []
    cities = set()
    categories = set()
    online_count = 0

    for row in rows:
        a = dict(row)
        # Parse JSON fields back to objects
        a['services'] = json.loads(a.pop('services_json')) if a.get('services_json') else []
        a['contact'] = json.loads(a.pop('contact_json')) if a.get('contact_json') else {}
        agencies.append(a)
        cities.add(a['city'])
        categories.add(a['category'])
        if a['source_status'] == 'online':
            online_count += 1

    conn.close()

    # Fallback to scraper if DB is empty 
    if not agencies:
        try:
            payload = get_agency_registry(force_refresh=True)
            _persist_agencies_to_db(payload.get('agencies', []))
            return jsonify({ "success": True, **payload })
        except Exception as e:
            return jsonify({ "success": False, "error": f"Scraper failure: {e}" }), 502

    return jsonify({
        "success": True,
        "generated_at": datetime.datetime.now().isoformat() + "Z",
        "stats": {
            "agency_count": len(agencies),
            "city_count": len(cities),
            "category_count": len(categories),
            "online_sources": online_count
        },
        "agencies": agencies
    })

@app.route('/api/simulation/baseline', methods=['GET'])
def get_simulation_baseline():
    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    rows = [
        {
            "zone": row["zone"],
            "priority_score": row["priority_score"],
            "category": row["category"],
        }
        for row in fetch_canonical_predictions(cursor)
    ]
    conn.close()
    return jsonify(rows)

@app.route('/api/simulation/run', methods=['POST'])
def run_simulation():
    from backend.operations.workflows import simulate
    return jsonify(simulate(data_path(DB_PATH),request.get_json(silent=True)))

@app.route('/api/simulate-surge', methods=['POST'])
def simulate_surge():
    if not app.config.get('ENABLE_DEMO_ACTIONS', False):
        return jsonify({'error': 'Demo mutations are disabled for this workspace.'}), 403
    conn = sqlite3.connect(data_path(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("UPDATE predictions SET priority_score = priority_score + 35 WHERE id IN (SELECT id FROM predictions ORDER BY RANDOM() LIMIT 1)")
    cursor.execute("UPDATE predictions SET priority_score = 100 WHERE priority_score > 100")
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# --- MAINTENANCE API ---

@app.route('/api/maintenance/data', methods=['GET'])
def get_maintenance_data():
    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM teams")
    teams = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM maintenance_tasks ORDER BY reported_time DESC")
    tasks = [dict(r) for r in cursor.fetchall()]
    
    conn.commit()
    conn.close()
    
    # Stats
    active_teams = len([t for t in teams if t['status'] == 'On Field'])
    idle_teams = len([t for t in teams if t['status'] == 'Idle'])
    pending_tasks = len([t for t in tasks if t['status'] == 'PENDING'])
    in_progress_tasks = len([t for t in tasks if t['status'] == 'ON GROUND'])

    return jsonify({
        "stats": {
            "total_teams": len(teams),
            "active": in_progress_tasks,
            "idle": idle_teams,
            "pending": pending_tasks
        },
        "teams": teams,
        "tasks": tasks
    })

@app.post('/api/maintenance/generate')
def generate_maintenance_tasks():
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('BEGIN IMMEDIATE')
        cursor = conn.cursor()
        # Auto-generate tasks for high-priority zones if they don't exist
        high_zones = [
            row
            for row in fetch_canonical_predictions(cursor)
            if float(row.get("priority_score") or 0) > 80
        ]
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for row in high_zones:
            # Check if task already exists for this zone that is not completed
            cursor.execute("SELECT count(*) FROM maintenance_tasks WHERE zone = ? AND status != 'COMPLETED'", (row['zone'],))
            if cursor.fetchone()[0] == 0:
                task_id = f"T-{uuid.uuid4().hex[:4].upper()}"
                cursor.execute('''INSERT INTO maintenance_tasks
                                 (id, zone, type, priority, status, reported_time)
                                 VALUES (?, ?, ?, ?, ?, ?)''',
                                 (task_id, row['zone'], row['category'], 'HIGH', 'PENDING', now_str))

    return jsonify({'success': True})


@app.route('/api/maintenance/assign', methods=['POST'])
def assign_maintenance():
    data = request.get_json(silent=True) or {}
    task_id, team_id = data.get('task_id'), data.get('team_id')
    if not isinstance(task_id,str) or not isinstance(team_id,str):
        return jsonify({'error': 'task_id and team_id are required.'}), 400
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        conn.execute('BEGIN IMMEDIATE')
        task = conn.execute('SELECT zone,status,type FROM maintenance_tasks WHERE id=?', (task_id,)).fetchone()
        team = conn.execute('SELECT status,type FROM teams WHERE id=?', (team_id,)).fetchone()
        if not task or not team:
            return jsonify({'error': 'Task or team not found.'}), 404
        if task[1]!='PENDING' or team[0]!='Idle' or conn.execute("SELECT 1 FROM maintenance_tasks WHERE assigned_team_id=? AND status IN ('ON GROUND','COMPLETED_UNVERIFIED')",(team_id,)).fetchone():
            return jsonify({'error': 'Only pending tasks and idle teams can be assigned.'}), 409
        task_type={'Garbage Collection':'Garbage','Water Tanker Demand':'Water','Road Maintenance':'Road','Drainage Maintenance':'Drain'}.get(task[2],task[2])
        if team[1] not in (task_type,'General'):raise DispatchError('The team specialty does not match this work order.','team_type_conflict',409)
        conn.execute("UPDATE maintenance_tasks SET status='ON GROUND',assigned_team_id=? WHERE id=?", (team_id,task_id))
        conn.execute("UPDATE teams SET status='On Field',current_zone=? WHERE id=?", (task[0],team_id))
    return jsonify({'success': True})
    
    
def _task_for_actor(conn, task_id):
    conn.row_factory = sqlite3.Row
    row = conn.execute('SELECT * FROM maintenance_tasks WHERE id=?', (task_id,)).fetchone()
    if not row:
        return None
    if g.user['role']=='worker' and row['assigned_team_id'] != g.user['team_id']:
        return None
    return row
    

@app.route('/api/worker/teams', methods=['GET'])
def worker_teams():
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        query, params = 'SELECT id,name,type,status FROM teams', ()
        if g.user['role']=='worker':
            query += ' WHERE id=?'
            params = (g.user['team_id'],)
        rows = conn.execute(query, params).fetchall()
    return jsonify([dict(row) for row in rows])


@app.route('/api/worker/tasks', methods=['GET'])
def worker_tasks():
    team_id = request.args.get('team_id', '').strip()
    if g.user['role']=='worker':
        if team_id and team_id != g.user['team_id']:
            return jsonify({'error': 'You can only access your assigned team.'}), 403
        team_id = g.user['team_id']
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        query = "SELECT * FROM maintenance_tasks WHERE status != 'COMPLETED'"
        params = ()
        if team_id:
            query += ' AND assigned_team_id=?'
            params = (team_id,)
        rows = conn.execute(query+' ORDER BY reported_time DESC', params).fetchall()
    return jsonify([dict(row) for row in rows])


@app.route('/api/worker/upload', methods=['POST'])
def worker_upload():
    from PIL import Image, UnidentifiedImageError
    from backend.core.database import upload_directory
    task_id = request.form.get('task_id', '')
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        task = _task_for_actor(conn, task_id)
    if not task:
        return jsonify({'error': 'Task not found.'}), 404
    if task['status'] not in ('PENDING','ON GROUND'):
        return jsonify({'error': 'This task no longer accepts evidence.'}), 409
    upload = request.files.get('file')
    if not upload or not upload.filename:
        return jsonify({'error': 'An image file is required.'}), 400
    try:
        with Image.open(upload.stream) as image:
            if image.format not in {'JPEG','PNG','WEBP','GIF'}:
                return jsonify({'error': 'Unsupported image format.'}), 400
            extension = {'JPEG': '.jpg','PNG': '.png','WEBP': '.webp','GIF': '.gif'}[image.format]
            image.verify()
        upload.stream.seek(0)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        return jsonify({'error': 'Upload must contain a valid image.'}), 400
    directory = upload_directory()
    directory.mkdir(parents=True, exist_ok=True)
    filename = uuid.uuid4().hex+extension
    target = directory/filename
    upload.save(target)
    try:
        with sqlite3.connect(data_path(DB_PATH)) as conn:
            conn.execute('INSERT INTO uploaded_evidence VALUES (?,?,?,?)',
                         (filename,task_id,g.user['id'],datetime.datetime.now(datetime.timezone.utc).isoformat()))
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return jsonify({'success': True, 'url': '/uploads/'+filename})


@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename):
    from flask import send_from_directory
    from pathlib import Path
    from backend.core.database import upload_directory
    if filename != Path(filename).name:
        return jsonify({'error': 'Image not found.'}), 404
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        record = conn.execute('SELECT task_id FROM uploaded_evidence WHERE filename=?', (filename,)).fetchone()
        task = _task_for_actor(conn, record[0]) if record else None
    if not task and g.user['role']!='admin':
        return jsonify({'error': 'Image not found.'}), 404
    return send_from_directory(upload_directory(), filename)


@app.route('/api/worker/update-status', methods=['POST'])
def worker_update_status():
    data = request.get_json(silent=True) or {}
    if any(not isinstance(data.get(key,''),str) for key in ('task_id','status','image_url','worker_notes')):
        return jsonify({'error': 'Task fields must be strings.'}), 400
    task_id, status = data.get('task_id','').strip(), data.get('status','').strip()
    image_url, notes = data.get('image_url','').strip(), data.get('worker_notes','').strip()
    if not task_id or status not in ('IN_PROGRESS','COMPLETED_UNVERIFIED') or len(notes)>2000:
        return jsonify({'error': 'A task, valid status, and notes under 2000 characters are required.'}), 400
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        conn.execute('BEGIN IMMEDIATE')
        row = _task_for_actor(conn, task_id)
        if not row:
            return jsonify({'error': 'Task not found.'}), 404
        if not row['assigned_team_id'] or row['status'] not in ('PENDING','ON GROUND'):
            return jsonify({'error': 'Task is unassigned or already submitted.'}), 409
        if status=='IN_PROGRESS':
            conn.execute("UPDATE maintenance_tasks SET status='ON GROUND',worker_notes=? WHERE id=?", (notes,task_id))
        else:
            if row['status']!='ON GROUND':
                return jsonify({'error': 'Start the task before submitting completion.'}), 409
            filename = image_url.removeprefix('/uploads/')
            evidence = conn.execute('SELECT 1 FROM uploaded_evidence WHERE filename=? AND task_id=?', (filename,task_id)).fetchone()
            if not image_url.startswith('/uploads/') or not evidence:
                return jsonify({'error': 'Upload evidence for this task before submitting.'}), 400
            conn.execute("UPDATE maintenance_tasks SET status='COMPLETED_UNVERIFIED',completed_time=?,image_url=?,worker_notes=? WHERE id=?", (datetime.datetime.now(datetime.timezone.utc).isoformat(),image_url,notes,task_id))
    return jsonify({'success': True})


@app.route('/api/maintenance/complete', methods=['POST'])
def complete_maintenance():
    task_id = (request.get_json(silent=True) or {}).get('task_id')
    if not isinstance(task_id,str):
        return jsonify({'error': 'task_id is required.'}), 400
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        conn.execute('BEGIN IMMEDIATE')
        row = _task_for_actor(conn, task_id)
        if not row:
            return jsonify({'error': 'Task not found.'}), 404
        if row['status']!='COMPLETED_UNVERIFIED':
            return jsonify({'error': 'Completion evidence must be submitted before approval.'}), 409
        filename = (row['image_url'] or '').removeprefix('/uploads/')
        if not conn.execute('SELECT 1 FROM uploaded_evidence WHERE filename=? AND task_id=?', (filename,task_id)).fetchone():
            return jsonify({'error': 'Verified upload evidence is required.'}), 409
        stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn.execute("UPDATE maintenance_tasks SET status='COMPLETED',completed_time=? WHERE id=?", (stamp,task_id))
        remaining = conn.execute("SELECT COUNT(*) FROM maintenance_tasks WHERE assigned_team_id=? AND status IN ('ON GROUND','COMPLETED_UNVERIFIED')", (row['assigned_team_id'],)).fetchone()[0]
        if row['assigned_team_id'] and not remaining:
            conn.execute("UPDATE teams SET status='Idle',current_zone=NULL WHERE id=?", (row['assigned_team_id'],))
        conn.execute("INSERT INTO zone_coverage (zone,last_visited,status) VALUES (?,?,'OK') ON CONFLICT(zone) DO UPDATE SET last_visited=excluded.last_visited,status='OK'", (row['zone'],stamp))
    return jsonify({'success': True})


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "").lower()
    normalized = re.sub(r"[^\w\s\u0900-\u097F]", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _phrase_in_text(text: str, phrase: str) -> bool:
    cleaned_text = _normalize_text(text)
    cleaned_phrase = _normalize_text(phrase)
    if not cleaned_text or not cleaned_phrase:
        return False
    if f" {cleaned_phrase} " in f" {cleaned_text} ":
        return True
    return not cleaned_phrase.isascii() and cleaned_phrase in cleaned_text


def _fetch_known_zones() -> list[str]:
    if not os.path.exists(data_path(DB_PATH)):
        return []

    conn = sqlite3.connect(data_path(DB_PATH))
    cursor = conn.cursor()
    zones: list[str] = []
    try:
        rows = cursor.execute("SELECT zone FROM zone_coverage ORDER BY LENGTH(zone) DESC, zone ASC").fetchall()
        zones = [row[0] for row in rows if row and row[0]]
    except sqlite3.Error:
        zones = []

    if not zones:
        try:
            rows = cursor.execute("SELECT DISTINCT zone FROM complaints ORDER BY LENGTH(zone) DESC, zone ASC").fetchall()
            zones = [row[0] for row in rows if row and row[0]]
        except sqlite3.Error:
            zones = []

    conn.close()
    return zones


def _build_zone_aliases() -> list[tuple[str, str]]:
    aliases: list[tuple[str, str]] = []
    for zone in _fetch_known_zones():
        candidates = {
            _normalize_text(zone),
            _normalize_text(zone.replace("-", " ")),
            _normalize_text(zone.replace("-", "")),
        }
        for alias in ZONE_ALIAS_MAP.get(zone, []):
            candidates.add(_normalize_text(alias))
        for alias in candidates:
            if alias:
                aliases.append((zone, alias))

    aliases.sort(key=lambda item: len(item[1]), reverse=True)
    return aliases


def _extract_zone(transcript: str) -> Optional[str]:
    """Helper to extract zone name from transcript with fuzzy fallback."""
    # 1. Direct Alias Match (Highest Priority)
    for zone, aliases in ZONE_ALIAS_MAP.items():
        for alias in aliases:
            if _phrase_in_text(transcript, alias):
                return zone
    
    # 2. Phonetic/Fuzzy Fallback (using difflib for messy STT results)
    import difflib
    normalized_transcript = _normalize_text(transcript)
    all_known_aliases = []
    alias_to_zone = {}
    
    for zone, aliases in ZONE_ALIAS_MAP.items():
        # Always include the key itself normalized
        norm_key = _normalize_text(zone)
        all_known_aliases.append(norm_key)
        alias_to_zone[norm_key] = zone
        for alias in aliases:
            norm_alias = _normalize_text(alias)
            all_known_aliases.append(norm_alias)
            alias_to_zone[norm_alias] = zone
            
    # Look for any word in transcript that matches an alias closely
    words = normalized_transcript.split()
    for word in words:
        matches = difflib.get_close_matches(word, all_known_aliases, n=1, cutoff=0.85)
        if matches:
            return alias_to_zone[matches[0]]

    return None


def _extract_issue_type(transcript: str) -> Optional[str]:
    normalized = _normalize_text(transcript)
    best_issue = None
    best_score = 0

    for issue_type, keywords in ISSUE_KEYWORDS.items():
        score = sum(1 for keyword in keywords if _phrase_in_text(normalized, keyword))
        if score > best_score:
            best_issue = issue_type
            best_score = score

    return best_issue


def _extract_severity(transcript: str) -> str:
    if any(_phrase_in_text(transcript, keyword) for keyword in HIGH_SEVERITY_KEYWORDS):
        return "High"
    return "Medium"


def _is_call_end_response(transcript: str) -> bool:
    normalized = _normalize_text(transcript)
    if not normalized:
        return False

    if normalized in CALL_END_EXACT_PHRASES:
        return True

    word_count = len(normalized.split())
    if word_count <= 4 and any(_phrase_in_text(normalized, phrase) for phrase in CALL_END_CONTAINS_PHRASES):
        return True

    return False


def _read_uploaded_audio():
    audio_file = request.files.get('audio')
    if audio_file is None or not audio_file.filename:
        return None, jsonify({"success": False, "error": "Audio file is required."}), 400

    mime_type = (audio_file.mimetype or "application/octet-stream").lower()
    if mime_type not in ALLOWED_AUDIO_MIME_TYPES:
        return None, jsonify({"success": False, "error": "Unsupported audio format."}), 400

    audio_bytes = audio_file.read()
    if not audio_bytes:
        return None, jsonify({"success": False, "error": "Audio file is empty."}), 400
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return None, jsonify({"success": False, "error": "Audio file is too large."}), 400

    filename = os.path.basename(audio_file.filename) or "voice.webm"
    return {
        "audio_bytes": audio_bytes,
        "filename": filename,
        "mime_type": mime_type,
    }, None, None


def _normalize_complaint_source(source: str) -> str:
    normalized = (source or "").strip().lower()
    if normalized in SOURCE_ID_PREFIXES:
        return normalized
    return "text_chat"


def _insert_complaint(zone, issue_type, severity='High', summary=None, source='text_chat', locality=None):
    conn = sqlite3.connect(data_path(DB_PATH))
    cursor = conn.cursor()
    normalized_source = _normalize_complaint_source(source)
    c_id = f"{SOURCE_ID_PREFIXES[normalized_source]}-" + str(uuid.uuid4())[:8]
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    final_locality = locality or zone
    complaint_text = summary or f"Complaint reported in {final_locality} for {issue_type}."

    from backend.core.privacy import redact
    complaint_text=redact(complaint_text)
    cursor.execute('''
        INSERT INTO complaints (id, zone, locality, issue_type, complaint_count, weather, timestamp, severity, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (c_id, zone, final_locality, issue_type, 1, 'no', now_str, severity, complaint_text))
    conn.commit()
    conn.close()


def _insert_voice_complaint(zone, issue_type, severity='High', summary=None):
    _insert_complaint(zone, issue_type, severity=severity, summary=summary, source='voice_call')


def _needs_translation(text: str) -> bool:
    """Return True if the text contains non-ASCII characters (likely Hindi/Devanagari)."""
    return any(ord(c) > 127 for c in (text or ""))


def _build_agent_response_from_transcript(transcript: str, complaint_source: str = 'voice_call') -> dict:
    # 1. Use Gemini for smart NLU extraction (Multi-step: Detect, Translate, Extract, Respond)
    gemini_data = extract_complaint_details(transcript)

    # Defaults
    translated_transcript = transcript
    input_language = "Unknown"

    # 2. Extract fields or fallback to keyword methods if Gemini fails
    if "error" not in gemini_data:
        call_ended = gemini_data.get('is_closing', False)
        zone = gemini_data.get('zone') if gemini_data.get('zone') != 'Unknown' else None
        issue_type = gemini_data.get('issue_type') if gemini_data.get('issue_type') != 'General' else None
        locality = gemini_data.get('specific_location') or None
        severity = gemini_data.get('severity', 'Medium')

        input_language = gemini_data.get('input_language', 'English')
        translated_transcript = gemini_data.get('translated_input_en') or transcript
        reply_text_native = gemini_data.get('reply_text_native')

        # If Gemini didn't give a specific sub-locality, try our local map
        if not locality or locality == zone:
            _, map_locality = find_zone_and_locality(transcript)
            if map_locality and map_locality != zone and map_locality != "Unknown":
                locality = map_locality
    else:
        # Gemini unavailable — use keyword + sub-locality map
        call_ended = _is_call_end_response(transcript)
        zone, locality = find_zone_and_locality(transcript)
        zone = zone if zone != "Unknown" else None
        locality = locality if locality not in ("Unknown", zone) else None
        issue_type = _extract_issue_type(transcript)
        severity = "High" if _extract_severity(transcript) == "High" else "Medium"
        reply_text_native = None

        # Translate description via OpenAI when Gemini is unavailable
        if _needs_translation(transcript):
            try:
                translated_transcript = translate_to_english(transcript)
            except Exception as e:
                _safe_log(f"Sarvam translation fallback failed: {type(e).__name__}")
                translated_transcript = transcript

    # Smart Filing: Log if we have EITHER a recognized zone OR a specific locality, as long as issue exists
    complaint_logged = bool((zone or locality) and issue_type)

    if call_ended:
        reply_text = reply_text_native or AGENT_CLOSING_TEXT
    else:
        if complaint_logged:
            reply_text = reply_text_native or AGENT_CONFIRMATION_TEXT
            _insert_complaint(
                zone=zone or "Unknown",
                issue_type=issue_type,
                severity=severity,
                summary=translated_transcript,
                source=complaint_source,
                locality=locality,
            )
        else:
            reply_text = reply_text_native or AGENT_RETRY_TEXT

    return {
        "transcript": transcript,
        "translated_transcript": translated_transcript,
        "input_language": input_language,
        "extracted": {
            "zone": zone or "Unknown",
            "issue_type": issue_type or "Unknown",
            "severity": severity,
        },
        "complaint_logged": complaint_logged,
        "call_ended": call_ended,
        "reply_text": reply_text,
    }


def _severity_to_urgency(severity: str) -> str:
    normalized = (severity or "").strip().lower()
    if normalized == "critical":
        return "critical"
    if normalized == "high":
        return "high"
    if normalized == "low":
        return "low"
    return "medium"


def _issue_type_to_category(issue_type: str) -> str:
    mapping = {
        "Garbage": "waste",
        "Drainage": "drainage",
        "Roads": "road",
        "Water": "water",
    }
    return mapping.get(issue_type, "general")


def _infer_complaint_source(complaint_id: str) -> str:
    complaint_id = str(complaint_id or "")
    if complaint_id.startswith("VOICE-"):
        return "voice_call"
    if complaint_id.startswith("TEXT-"):
        return "text_chat"
    if complaint_id.startswith("MMR-"):
        return "whatsapp"
    return "dataset"


def _format_complaint_text(zone: str, issue_type: str, source: str, stored_text: Optional[str] = None) -> str:
    issue_label = (issue_type or "General").lower()
    if stored_text:
        return stored_text
    if source == "voice_call":
        return f"Voice complaint reported in {zone} for {issue_label} issue."
    if source == "text_chat":
        return f"Text complaint reported in {zone} for {issue_label} issue."
    return f"{issue_type} issue reported in {zone}."


def extract_issue_from_text(text):
    text = (text or "").lower()
    if any(w in text for w in ["garbage", "kachra", "waste", "dustbin", "cleaning", "safai", "sweeping"]):
        return "Garbage"
    if any(w in text for w in ["water", "paani", "pani", "shortage", "supply", "leakage", "pressure", "nahi aata"]):
        return "Water"
    if any(w in text for w in ["road", "pothole", "sadak", "repair", "crack", "broken road", "accident"]):
        return "Roads"
    if any(w in text for w in ["drain", "gutter", "naali", "flood", "nullah", "stagnant", "blocked"]):
        return "Drainage"
    return "General"


def get_severity(complaint_count):
    if not complaint_count: return "Low"
    if complaint_count >= 30:
        return "High"
    elif complaint_count >= 10:
        return "Medium"
    return "Low"


@app.route("/api/whatsapp-complaint", methods=["POST"])
def whatsapp_complaint():
    from backend.api.product import intake
    return intake('whatsapp')


@app.route('/api/complaints', methods=['GET'])
def get_complaints():
    if not os.path.exists(data_path(DB_PATH)):
        return jsonify({"success": False, "error": "Database not initialized"}), 500

    area = request.args.get("area", None)
    c_type = request.args.get("type", None)
    severity = request.args.get("severity", None)
    try:limit=int(request.args.get('limit',100))
    except ValueError:raise DispatchError('limit must be an integer from 1 to 500.')
    if not 1<=limit<=500:raise DispatchError('limit must be an integer from 1 to 500.')
    search=request.args.get('q','')
    if len(search)>200:raise DispatchError('Search text is too long.')
    if any(value and len(value)>200 for value in (area,c_type,severity)):raise DispatchError('Filter is too long.')

    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        query = "SELECT id, zone, locality, issue_type, complaint_count, timestamp, severity, description,revision FROM complaints WHERE 1=1"
        params = []

        if search:
            query += " AND (description LIKE ? OR id LIKE ?)"
            params.extend(['%'+search+'%','%'+search+'%'])
        if area:
            query += " AND (LOWER(zone) LIKE LOWER(?) OR LOWER(locality) LIKE LOWER(?))"
            params.append(f"%{area}%")
            params.append(f"%{area}%")

        if c_type and c_type != 'all':
            query += " AND LOWER(issue_type) = LOWER(?)"
            params.append(c_type)

        if severity and severity != 'all':
            query += " AND LOWER(severity) = LOWER(?)"
            params.append(severity)

        query += " ORDER BY datetime(timestamp) DESC, rowid DESC LIMIT ?"
        params.append(int(limit))

        complaint_rows = cursor.execute(query, params).fetchall()

        stats_row = cursor.execute(
            '''
            SELECT
                COUNT(*) AS total_complaints,
                SUM(CASE WHEN LOWER(COALESCE(severity, '')) IN ('high', 'critical') THEN 1 ELSE 0 END) AS high_priority_count,
                SUM(CASE WHEN id LIKE 'VOICE-%' THEN 1 ELSE 0 END) AS voice_report_count,
                SUM(CASE WHEN id LIKE 'TEXT-%' THEN 1 ELSE 0 END) AS text_report_count,
                MAX(timestamp) AS latest_timestamp
            FROM complaints
            '''
        ).fetchone()
    except sqlite3.Error:
        conn.close()
        raise

    complaints = []
    for row in complaint_rows:
        source = _infer_complaint_source(row["id"])
        complaints.append({
            "id": row["id"],
            "revision":row["revision"],
            "text": row["description"] or f"{row['issue_type']} in {row['locality'] or row['zone']}",
            "urgency": _severity_to_urgency(row["severity"]),
            "category": _issue_type_to_category(row["issue_type"]),
            "emotion": "voice-reported" if source == "voice_call" else "text-reported" if source == "text_chat" else "citizen-reported",
            "ward": row["zone"],
            "locality": row["locality"] or "Unknown",
            "time": row["timestamp"],
            "source": source,
            "issue_type": row["issue_type"],
            "severity": row["severity"] or "Medium",
            "complaint_count": row["complaint_count"] or 0,
        })

    stats = {
        "total_complaints": stats_row["total_complaints"] if stats_row else 0,
        "high_priority_count": stats_row["high_priority_count"] if stats_row else 0,
        "voice_report_count": stats_row["voice_report_count"] if stats_row else 0,
        "text_report_count": stats_row["text_report_count"] if stats_row else 0,
        "latest_timestamp": stats_row["latest_timestamp"] if stats_row else None,
    }

    conn.close()
    return jsonify({
        "success": True,
        "stats": stats,
        "complaints": complaints,
    })

@app.route('/api/hotspots', methods=['GET'])
def get_hotspots():
    """Returns locality-level density clusters with generated coordinates."""
    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT zone, locality, SUM(complaint_count) as count
        FROM complaints
        GROUP BY zone, locality
        HAVING count > 0
    ''')
    
    rows = cursor.fetchall()
    from backend.operations.fleet import get_locality_coordinates
    
    hotspots = []
    for row in rows:
        if not row['zone']:
            continue
        lat, lon = get_locality_coordinates(row['zone'], row['locality']) if row['locality'] else get_zone_coordinates(row['zone'])
        hotspots.append({
            "zone": row['zone'],
            "locality": row['locality'] or "Unspecified locality",
            "count": row['count'],
            "lat": lat,
            "lon": lon
        })
    
    conn.close()
    return jsonify(hotspots)

@app.route('/api/webhooks/vapi', methods=['POST'])
def vapi_webhook():
    from backend.api.product import intake
    return intake('vapi')


@app.route('/api/agent/greet', methods=['GET'])
def agent_greet():
    try:
        audio = text_to_speech(AGENT_GREETING_TEXT)
        voice_mode = "sarvam"
    except SarvamError:
        audio = None
        voice_mode = "browser"

    return jsonify({
        "success": True,
        "reply_text": AGENT_GREETING_TEXT,
        "audio": audio,
        "audio_format": "wav" if voice_mode == "sarvam" else "mp3",
        "voice_mode": voice_mode,
    })


@app.route('/api/agent/respond', methods=['POST'])
def agent_respond():
    audio_payload, error_response, status_code = _read_uploaded_audio()
    if error_response is not None:
        return error_response, status_code

    try:
        transcript = speech_to_text(
            audio_payload["audio_bytes"],
            filename=audio_payload["filename"],
            mime_type=audio_payload["mime_type"],
        )
    except SarvamError:
        return jsonify({"success": False, "error": "Audio could not be processed. Please try again."}), 502

    try:
        result = _build_agent_response_from_transcript(transcript, complaint_source='voice_call')
    except Exception as exc:
        _safe_log(f"Agent voice response failed: {type(exc).__name__}")
        return jsonify({"success": False, "error": "The complaint agent could not process this voice input."}), 500

    try:
        audio = text_to_speech(result["reply_text"])
        audio_format = "wav"
    except SarvamError:
        audio = None
        audio_format = None

    return jsonify({
        "success": True,
        **result,
        "audio": audio,
        "audio_format": audio_format,
    })


@app.route('/api/agent/respond-text', methods=['POST'])
def agent_respond_text():
    payload = request.get_json(silent=True) or {}
    transcript = str(payload.get("transcript", "")).strip()
    if not transcript:
        return jsonify({"success": False, "error": "Transcript is required."}), 400
    if len(transcript) > MAX_TRANSCRIPT_LENGTH:
        return jsonify({"success": False, "error": "Transcript is too long."}), 400

    try:
        result = _build_agent_response_from_transcript(transcript, complaint_source='voice_call')
    except Exception as exc:
        _safe_log(f"Agent text response failed: {type(exc).__name__}")
        return jsonify({"success": False, "error": "The complaint agent could not process this text input."}), 500

    try:
        audio = text_to_speech(result["reply_text"])
        audio_format = "wav"
    except SarvamError:
        audio = None
        audio_format = None

    return jsonify({
        "success": True,
        **result,
        "audio": audio,
        "audio_format": audio_format,
    })


@app.route('/api/agent/respond-chat', methods=['POST'])
def agent_respond_chat():
    payload = request.get_json(silent=True) or {}
    transcript = str(payload.get("message", "")).strip()
    if not transcript:
        return jsonify({"success": False, "error": "Message is required."}), 400
    if len(transcript) > MAX_TRANSCRIPT_LENGTH:
        return jsonify({"success": False, "error": "Message is too long."}), 400

    try:
        result = _build_agent_response_from_transcript(transcript, complaint_source='text_chat')
    except Exception as exc:
        _safe_log(f"Agent chat response failed: {type(exc).__name__}")
        return jsonify({"success": False, "error": "The complaint chatbot could not process this message."}), 500

    return jsonify({
        "success": True,
        **result,
    })


@app.route('/api/events', methods=['GET'])
def get_upcoming_events():
    """Return upcoming events from the dataset with predicted ward impacts."""
    import csv

    LOCATION_TO_WARDS = {
        'Dadar':    ['Ward 5', 'Ward 9'],
        'Wankhede': ['Ward 1', 'Ward 2'],
        'Andheri':  ['Ward 7', 'Ward 8'],
        'Bandra':   ['Ward 3', 'Ward 6'],
        'Kurla':    ['Ward 11', 'Ward 12'],
    }

    ISSUE_TO_CATEGORY = {
        'Garbage': 'garbage',
        'Waterlogging': 'waterlogging',
        'Crowd': 'crowd',
        'Litter': 'garbage',
        'Waste': 'garbage',
        'Debris': 'garbage',
        'Sanitation': 'garbage',
        'Water': 'waterlogging',
    }

    MONTH_ORDER = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December']

    csv_path = str(DATA_ROOT / 'nagarflow_dataset.csv')
    if not os.path.exists(csv_path):
        return jsonify([])

    now = datetime.datetime.now()
    current_month_idx = now.month - 1  # 0-based

    events = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            month = row.get('month', '').strip()
            if month not in MONTH_ORDER:
                continue
            month_idx = MONTH_ORDER.index(month)

            # Only show events in current month and next month
            diff = (month_idx - current_month_idx) % 12
            if diff > 1:
                continue

            surge_score = float(row.get('surge_score', 0) or 0)
            location = row.get('location', '').strip()
            wards = LOCATION_TO_WARDS.get(location, [location])

            # Estimate hours until event based on month diff and day of month
            days_in_month = 30
            if diff == 0:
                # Current month: remaining days
                days_left = max(1, days_in_month - now.day)
                hours_until = days_left * 24 // 3
            else:
                # Next month
                hours_until = (days_in_month - now.day) * 24 + 24

            # Cap for display
            hours_until = min(hours_until, 72)

            # Determine category from predicted_issue
            predicted_issue = row.get('predicted_issue', '')
            category = 'general'
            for keyword, cat in ISSUE_TO_CATEGORY.items():
                if keyword.lower() in predicted_issue.lower():
                    category = cat
                    break

            event_type = row.get('event_type', 'public').strip()

            # Impact percentage: surge_score is 1-20, map to 10-90%
            impact_pct = min(90, max(10, int(surge_score * 4.5)))

            events.append({
                'name': row.get('event_name', '').strip(),
                'type': event_type,
                'month': month,
                'location': location,
                'wards': wards,
                'hours_until': hours_until,
                'surge_score': surge_score,
                'surge_level': row.get('surge_level', 'Medium').strip(),
                'predicted_issue': predicted_issue,
                'category': category,
                'impact_pct': impact_pct,
                'expected_crowd': row.get('expected_crowd', 'medium').strip(),
            })

    # Sort by hours_until ascending, then surge_score descending
    events.sort(key=lambda e: (e['hours_until'], -e['surge_score']))

    return jsonify(events[:8])  # Return top 8 upcoming events


def simulate_fleet_movement():
    """Optional development-only position animation; arrival always needs confirmation."""
    from backend.operations.dispatch import transaction
    while True:
        try:
            with transaction(data_path(DB_PATH)) as conn:
                rows = conn.execute("""SELECT t.id,t.lat,t.lon,d.destination_lat,d.destination_lon
                    FROM trucks t JOIN dispatches d ON d.truck_id=t.id
                    WHERE d.status='EN_ROUTE' AND t.status='en_route_to_'||d.zone""").fetchall()
                from backend.operations.dispatch_contract import valid_coordinates
                for row in rows:
                    if not valid_coordinates(row['lat'],row['lon']) or not valid_coordinates(row['destination_lat'],row['destination_lon']):
                        continue
                    delta_lat, delta_lon = row['destination_lat']-row['lat'], row['destination_lon']-row['lon']
                    distance = (delta_lat**2+delta_lon**2)**0.5
                    scale = min(1,0.0025/distance) if distance else 0
                    conn.execute('UPDATE trucks SET lat=?,lon=? WHERE id=?',
                                 (row['lat']+delta_lat*scale,row['lon']+delta_lon*scale,row['id']))
        except sqlite3.Error:
            app.logger.exception('Development fleet animation failed')
        time.sleep(2)


@app.route("/api/image-complaint", methods=["POST"])
def image_complaint():
    from backend.api.product import intake
    return intake('image')


@app.route("/api/image-complaints", methods=["GET", "POST"])
def get_image_complaints():
    if request.method == "POST":
        # Delegate to the same logic as /api/image-complaint
        return image_complaint()

    conn = sqlite3.connect(data_path(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM image_complaints ORDER BY timestamp DESC LIMIT 200"
    ).fetchall()
    conn.close()
    complaints = []
    for row in rows:
        item = dict(row)
        item['image_url'] = '/api/image-media/'+item['id'] if item.get('file_id') else ''
        item.pop('chat_id', None)
        item.pop('file_id', None)
        complaints.append(item)
    return jsonify({"success": True, "complaints": complaints})


@app.route("/api/image-complaint/<complaint_id>", methods=["PATCH"])
def update_image_complaint(complaint_id):
    data=request.get_json(silent=True) or {}
    fields={'zone','locality','issue_type','priority','status'}
    if not isinstance(data,dict) or set(data)!=fields or any(not isinstance(data[k],str) for k in fields):raise DispatchError('Supply valid image classification fields.')
    from backend.operations.fleet import ZONE_COORDS
    if data['zone'] not in ZONE_COORDS and data['zone']!='Unknown':raise DispatchError('Unknown zone.')
    if len(data['locality'])>200 or data['issue_type'] not in ('General','Garbage','Water','Roads','Drainage','Electricity','Other') or data['priority'] not in ('pending','low','medium','high','critical') or data['status'] not in ('new','under_review','in_progress','resolved'):raise DispatchError('Invalid classification, priority or status.')
    from backend.operations.dispatch import transaction,timestamp
    with transaction(data_path(DB_PATH)) as conn:
        if not conn.execute('SELECT 1 FROM image_complaints WHERE id=?',(complaint_id,)).fetchone():raise DispatchError('Complaint not found.','not_found',404)
        conn.execute('UPDATE image_complaints SET zone=?,locality=?,issue_type=?,priority=?,status=? WHERE id=?',tuple(data[k] for k in ['zone','locality','issue_type','priority','status'])+(complaint_id,))
        if data['zone'] in ZONE_COORDS and data['issue_type']!='General':
            for event in conn.execute("SELECT id,result_json FROM ingestion_events WHERE kind='image' AND status='REVIEW'").fetchall():
                if any(item.get('complaint_id')==complaint_id for item in json.loads(event['result_json'])):
                    conn.execute("UPDATE ingestion_events SET status='COMPLETED' WHERE id=?",(event['id'],))
        conn.execute('INSERT INTO operation_events (actor_id,event,target_id,created_at) VALUES (?,?,?,?)',(g.user['id'],'image_classified',complaint_id,timestamp()))
    return jsonify({'status':'ok'})


@app.get('/api/image-media/<complaint_id>')
def image_media(complaint_id):
    from flask import Response
    with sqlite3.connect(data_path(DB_PATH)) as conn:
        row = conn.execute('SELECT file_id FROM image_complaints WHERE id=?', (complaint_id,)).fetchone()
    token = os.getenv('TELEGRAM_BOT_TOKEN')
    if not row or not row[0] or not token:
        return jsonify({'error': 'Image unavailable.'}), 404
    try:
        metadata = requests.get(f'https://api.telegram.org/bot{token}/getFile', params={'file_id': row[0]}, timeout=5).json()
        path = metadata.get('result', {}).get('file_path', '')
        if not re.fullmatch(r'[A-Za-z0-9_./-]+',path) or '..' in path:
            return jsonify({'error': 'Image unavailable.'}), 502
        with requests.get(f'https://api.telegram.org/file/bot{token}/{path}', timeout=10, stream=True, allow_redirects=False) as upstream:
            if upstream.status_code != 200:
                return jsonify({'error': 'Image unavailable.'}), 502
            kind = upstream.headers.get('Content-Type','').split(';')[0]
            if kind not in {'image/jpeg','image/png','image/webp','image/gif'}:
                return jsonify({'error': 'Unsupported image.'}), 502
            content = bytearray()
            for chunk in upstream.iter_content(65536):
                content.extend(chunk)
                if len(content)>12*1024*1024:
                    return jsonify({'error': 'Image too large.'}), 413
        return Response(bytes(content),content_type=kind)
    except (requests.RequestException,ValueError):
        return jsonify({'error': 'Image unavailable.'}), 502


def main():
    # Every provisioned store must be migrated before the worker accepts jobs.
    from backend.core.schema import initialize_all
    initialize_all(app)

    # Dev worker uses the same atomic jobs as the separate production worker.
    if os.getenv('NAGARFLOW_INGEST_WORKER', 'true') == 'true':
        def inbox_loop():
            from backend.intake.worker import run_cycle
            while True:
                try:run_cycle(app)
                except Exception as error:app.logger.error('Inbox worker failed: %s', type(error).__name__)
                time.sleep(5)
        threading.Thread(target=inbox_loop,daemon=True).start()

    # Start the fleet simulation in a background daemon thread
    if os.getenv('NAGARFLOW_SIMULATE_FLEET') == 'true':
        sim_thread = threading.Thread(target=simulate_fleet_movement, daemon=True)
        sim_thread.start()

    # Ensure this runs on 5000 to not conflict with Next.js
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_DEBUG') == '1', use_reloader=False)


if __name__ == '__main__':
    main()
