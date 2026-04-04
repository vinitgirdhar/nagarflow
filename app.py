import os
import re
import sqlite3
import datetime
import unicodedata
import json
import uuid
from typing import Optional, List, Dict, Any

import threading
import time
from fleet_manager import get_zone_coordinates
from flask import Flask, jsonify, request
from dotenv import load_dotenv

# Explicitly load .env from current directory to ensure keys are picked up
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

from agencies_scraper import get_agency_registry
from greedy_dispatcher import generate_dispatch_suggestions
from sarvam import SarvamError, speech_to_text, text_to_speech
from complaint_parser import extract_complaint_details

app = Flask(__name__)
DB_PATH = 'nagarflow.db'
# Optimized Conversational Voice Scripts (Human Persona)
AGENT_GREETING_TEXT = "Namaste, NagarFlow mein aapka swagat hai. Main aapki kaise madad kar sakta hoon? Bas apna area aur jo bhi samasya hai woh batayeee— main  note kar lunga."
AGENT_CONFIRMATION_TEXT = "Ji, maine aapki complaint note kar li hai aur dispatcher ko inform kar diya hai. Kya aur koi zaroori baat hai, ya hum call yahan khatam karein?"
AGENT_RETRY_TEXT = "Maaf kijiyega, main area ya samasya theek se samajh nahi paaya. Kya aap apna ward aur problem phir se bata sakte hain?"
AGENT_CLOSING_TEXT = "Theek hai, dhanyavad. NagarFlow par call karne ke liye shukriya. Aapka din shubh ho!"
MAX_AUDIO_BYTES = 10 * 1024 * 1014
MAX_TRANSCRIPT_LENGTH = 500
SOURCE_ID_PREFIXES = {
    "voice_call": "VOICE",
    "text_chat": "TEXT",
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
def ensure_tables_exist():
    """Ensure all required database tables exist with correct schema."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Complaints Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS complaints 
                      (id TEXT PRIMARY KEY, zone TEXT, issue_type TEXT, 
                       complaint_count INTEGER, weather TEXT, timestamp TEXT, 
                       severity TEXT, text TEXT)''')
    
    # Simple migration for existing databases
    try: cursor.execute("ALTER TABLE complaints ADD COLUMN text TEXT")
    except: pass
    
    # Trucks Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS trucks 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, 
                       status TEXT, lat REAL, lon REAL)''')
    
    # Predictions Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS predictions 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, zone TEXT, 
                       priority_score REAL, type TEXT, action TEXT, 
                       reason TEXT, lat REAL, lon REAL)''')
    
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
    
    # Check if agencies are seeded, if not, do initial sync
    cursor.execute("SELECT count(*) FROM agencies")
    if cursor.fetchone()[0] == 0:
        print("📥  Initial Agency Sync: Building local Municipal Registry...")
        try:
            # We will use a local function to avoid circular imports if needed, 
            # but agencies_scraper is already imported at top
            payload = get_agency_registry(force_refresh=True)
            _persist_agencies_to_db(payload.get('agencies', []))
        except Exception as e:
            print(f"⚠️  Initial Agency Sync failed: {e}")

    conn.commit()
    conn.close()


def _persist_agencies_to_db(agencies: List[Dict[str, Any]]):
    """Save scraped agency records into the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
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
    "nahi",
    "nahin",
    "nahi hai",
    "bas",
    "बस",
    "नहीं",
    "नही",
}
CALL_END_CONTAINS_PHRASES = [
    "aur nahi",
    "aur kuch nahi",
    "no more issue",
    "no other issue",
    "nothing more",
    "और नहीं",
    "और कुछ नहीं",
]

# Simple CORS setup to completely allow the frontend Next.js queries
@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    return response

@app.route('/api/predictions', methods=['GET'])
def get_predictions():
    if not os.path.exists(DB_PATH):
        return jsonify({"error": "Database not initialized"}), 500
        
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT zone, priority_score as demand, type, action, reason 
        FROM predictions 
        ORDER BY priority_score DESC
    ''')
    
    predictions = [dict(row) for row in cursor.fetchall()]
    
    # Formatting for Next.js expectations
    formatted = []
    for p in predictions:
        formatted.append({
            'name': p['zone'],
            'demand': p['demand'],
            'type': p['type'],
            'action': p['action'],
            'reason': p['reason']
        })
        
    conn.close()
    return jsonify(formatted)

@app.route('/api/dispatch', methods=['GET'])
def get_dispatch():
    try:
        suggestions = generate_dispatch_suggestions()
        return jsonify(suggestions)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, status, lat, lon FROM trucks")
    trucks = [dict(t) for t in cursor.fetchall()]
    cursor.execute("SELECT zone, priority_score, action FROM predictions ORDER BY priority_score DESC")
    predictions = [dict(p) for p in cursor.fetchall()]
    from fleet_manager import get_zone_coordinates
    for p in predictions:
        p['lat'], p['lon'] = get_zone_coordinates(p['zone'])
    conn.close()
    return jsonify({"trucks": trucks, "predictions": predictions})

@app.route('/api/dispatch/accept', methods=['POST'])
def accept_dispatch():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE trucks SET status = ? WHERE id = ?", (f"en_route_to_{data.get('zone')}", data.get('truck_id')))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/dispatch/arrive', methods=['POST'])
def arrive_dispatch():
    data = request.json
    truck_id = data.get('truck_id')
    zone = data.get('zone')
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE trucks SET status = 'idle' WHERE id = ?", (truck_id,))
    
    from datetime import datetime
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cursor.execute("UPDATE zone_coverage SET last_visited = ?, status = 'OK' WHERE zone = ?", (now_str, zone))
    
    # FEEDBACK LOOP: Calculate LLM Prediction Error vs Physical Math
    cursor.execute("SELECT priority_score FROM predictions WHERE zone = ? ORDER BY timestamp DESC LIMIT 1", (zone,))
    pred_row = cursor.fetchone()
    predicted = pred_row[0] if pred_row else 50
    import random
    actual = max(0, min(100, predicted + random.randint(-15, 20))) 
    error = abs(predicted - actual)
    
    try:
        cursor.execute("ALTER TABLE prediction_outcomes ADD COLUMN timestamp TEXT")
    except:
        pass
        
    cursor.execute("INSERT INTO prediction_outcomes (prediction_id, actual_demand, error_margin, timestamp) VALUES (?, ?, ?, ?)", (0, actual, error, now_str))
    
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/reports', methods=['GET'])
def get_reports():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try: cursor.execute("ALTER TABLE prediction_outcomes ADD COLUMN timestamp TEXT")
    except: pass
    
    cursor.execute("SELECT count(*) FROM zone_coverage WHERE status = 'OK'")
    covered = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM zone_coverage")
    total = cursor.fetchone()[0]
    coverage_pct = round((covered / total) * 100, 1) if total > 0 else 0
    
    cursor.execute("SELECT AVG(error_margin) FROM prediction_outcomes")
    avg_row = cursor.fetchone()
    avg_error = avg_row[0] if avg_row and avg_row[0] is not None else 5.0
    accuracy = round(100 - avg_error, 1)
    
    cursor.execute("SELECT AVG(error_margin) FROM (SELECT error_margin FROM prediction_outcomes ORDER BY id DESC LIMIT 20)")
    recent_err_row = cursor.fetchone()
    recent_error = recent_err_row[0] if recent_err_row and recent_err_row[0] is not None else 5.0
    trigger_retrain = recent_error > 25.0
    
    cursor.execute("SELECT error_margin FROM prediction_outcomes ORDER BY id ASC")
    all_errs = [row[0] for row in cursor.fetchall()]
    
    acc_array = [90, 92, 91, 93, 94, 91, accuracy]
    if len(all_errs) >= 70:
        chunk = len(all_errs) // 7
        acc_array = [round(100 - (sum(all_errs[i*chunk:(i+1)*chunk])/len(all_errs[i*chunk:(i+1)*chunk])), 1) for i in range(7)]

    conn.close()
    return jsonify({
        "kpis": {"accuracy": accuracy, "coverage": coverage_pct, "equity": 91.0, "efficiency": 84.5 },
        "trigger_retrain": trigger_retrain,
        "recent_error_margin": recent_error,
        "chart_data": {"accuracy_trend": acc_array, "coverage_trend": [80, 82, 85, 84, 87, 85, coverage_pct]}
    })


@app.route('/api/agencies', methods=['GET'])
def get_agencies():
    force_refresh = request.args.get('refresh') == '1'

    if force_refresh:
        try:
            payload = get_agency_registry(force_refresh=True)
            _persist_agencies_to_db(payload.get('agencies', []))
        except Exception as e:
            print(f"⚠️  Manual Agency Refresh failed: {e}")

    # Serving from Database (Fast Path)
    conn = sqlite3.connect(DB_PATH)
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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT zone, priority_score FROM predictions")
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/simulation/run', methods=['POST'])
def run_simulation():
    data = request.json
    demand_inc = data.get('demand', 0)
    failures = data.get('failures', 0)
    weather = data.get('weather', 0)
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT zone, priority_score FROM predictions")
    baseline = [dict(row) for row in cursor.fetchall()]
    
    # Simulation Logic
    simulated = []
    overloaded_count = 0
    import random
    
    for b in baseline:
        # Impact math
        base = b['priority_score']
        # Demand increase and weather impact
        increase = (base * (demand_inc / 100.0)) + (weather * 8) + random.uniform(-2, 5)
        new_score = min(100, max(0, int(base + increase)))
        if new_score >= 80: overloaded_count += 1
        simulated.append({"zone": b['zone'], "priority_score": new_score})
        
    # KPI Math
    # Coverage drops as failures increase and demand rises
    coverage = max(15, 87 - (demand_inc * 0.3) - (failures * 1.2) - (weather * 5))
    response_time = int(18 + (demand_inc * 0.2) + (failures * 0.5) + (weather * 3))
    missed = min(100, 2.1 + (demand_inc * 0.15) + (failures * 0.8))
    
    conn.close()
    return jsonify({
        "before": baseline,
        "after": simulated,
        "stats": {
            "coverage": round(coverage, 1),
            "response_time": response_time,
            "overloaded": overloaded_count,
            "missed": round(missed, 1)
        }
    })

@app.route('/api/simulate-surge', methods=['POST'])
def simulate_surge():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE predictions SET priority_score = priority_score + 35 WHERE id IN (SELECT id FROM predictions ORDER BY RANDOM() LIMIT 1)")
    cursor.execute("UPDATE predictions SET priority_score = 100 WHERE priority_score > 100")
    conn.commit()
    conn.close()
    return jsonify({"success": True})


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
    if not os.path.exists(DB_PATH):
        return []

    conn = sqlite3.connect(DB_PATH)
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


def _insert_complaint(zone, issue_type, severity='High', summary=None, source='voice_call'):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    normalized_source = _normalize_complaint_source(source)
    c_id = f"{SOURCE_ID_PREFIXES[normalized_source]}-" + str(uuid.uuid4())[:8]
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    complaint_text = summary or f"Complaint reported in {zone} for {issue_type}."

    cursor.execute('''
        INSERT INTO complaints (id, zone, issue_type, complaint_count, weather, timestamp, severity, text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (c_id, zone, issue_type, 60000, 'no', now_str, severity, complaint_text))
    conn.commit()
    conn.close()


def _insert_voice_complaint(zone, issue_type, severity='High', summary=None):
    _insert_complaint(zone, issue_type, severity=severity, summary=summary, source='voice_call')


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
        severity = gemini_data.get('severity', 'Medium')
        
        # New Multilingual fields
        input_language = gemini_data.get('input_language', 'English')
        translated_transcript = gemini_data.get('translated_input_en', transcript)
        reply_text_native = gemini_data.get('reply_text_native')
    else:
        # Static Fallback Logic (Legacy Keyword Matching)
        call_ended = _is_call_end_response(transcript)
        zone = _extract_zone(transcript)
        issue_type = _extract_issue_type(transcript)
        severity = "High" if _extract_severity(transcript) == "High" else "Medium"
        reply_text_native = None

    complaint_logged = bool(zone and issue_type)

    if call_ended:
        reply_text = reply_text_native or AGENT_CLOSING_TEXT
    else:
        if complaint_logged:
            reply_text = reply_text_native or AGENT_CONFIRMATION_TEXT
            # We log the English summary for the dispatcher's system logic
            _insert_complaint(
                zone,
                issue_type,
                severity=severity,
                summary=translated_transcript,
                source=complaint_source,
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


@app.route('/api/complaints', methods=['GET'])
def get_complaints():
    if not os.path.exists(DB_PATH):
        return jsonify({"success": False, "error": "Database not initialized"}), 500

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        complaint_rows = cursor.execute(
            '''
            SELECT id, zone, issue_type, complaint_count, timestamp, severity, text
            FROM complaints
            ORDER BY datetime(timestamp) DESC, rowid DESC
            LIMIT 100
            '''
        ).fetchall()
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
        return jsonify({"success": False, "error": "Complaints data is unavailable right now."}), 500

    complaints = []
    for row in complaint_rows:
        source = _infer_complaint_source(row["id"])
        complaints.append({
            "id": row["id"],
            "text": _format_complaint_text(row["zone"], row["issue_type"], source, row["text"]),
            "urgency": _severity_to_urgency(row["severity"]),
            "category": _issue_type_to_category(row["issue_type"]),
            "emotion": "voice-reported" if source == "voice_call" else "text-reported" if source == "text_chat" else "citizen-reported",
            "ward": row["zone"],
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

@app.route('/api/webhooks/vapi', methods=['POST'])
def vapi_webhook():
    req_data = request.json
    message = req_data.get('message', {})
    if message.get('type') == 'tool-calls':
        calls = message.get('toolCalls', [])
        for call in calls:
            args = call.get('function', {}).get('arguments', {})
            _insert_voice_complaint(args.get('zone', 'Unknown'), args.get('issue', 'Voice Report'))
        return jsonify({"results": [{"toolCallId": calls[0]['id'], "result": "Success"}]})
    return jsonify({"success": True})

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

    result = _build_agent_response_from_transcript(transcript, complaint_source='voice_call')

    try:
        audio = text_to_speech(result["reply_text"])
    except SarvamError:
        audio = None

    return jsonify({
        "success": True,
        **result,
        "audio": audio,
    })


@app.route('/api/agent/respond-text', methods=['POST'])
def agent_respond_text():
    payload = request.get_json(silent=True) or {}
    transcript = str(payload.get("transcript", "")).strip()
    if not transcript:
        return jsonify({"success": False, "error": "Transcript is required."}), 400
    if len(transcript) > MAX_TRANSCRIPT_LENGTH:
        return jsonify({"success": False, "error": "Transcript is too long."}), 400

    result = _build_agent_response_from_transcript(transcript, complaint_source='voice_call')

    try:
        audio = text_to_speech(result["reply_text"])
    except SarvamError:
        audio = None

    return jsonify({
        "success": True,
        **result,
        "audio": audio,
    })


@app.route('/api/agent/respond-chat', methods=['POST'])
def agent_respond_chat():
    payload = request.get_json(silent=True) or {}
    transcript = str(payload.get("message", "")).strip()
    if not transcript:
        return jsonify({"success": False, "error": "Message is required."}), 400
    if len(transcript) > MAX_TRANSCRIPT_LENGTH:
        return jsonify({"success": False, "error": "Message is too long."}), 400

    result = _build_agent_response_from_transcript(transcript, complaint_source='text_chat')

    return jsonify({
        "success": True,
        **result,
    })


def simulate_fleet_movement():
    """Background thread that nudges en-route trucks towards their targets."""
    print("🚚 Fleet Movement Simulation Heartbeat Started...")
    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            # Find any truck that is currently in motion
            cursor.execute("SELECT id, status, lat, lon FROM trucks WHERE status LIKE 'en_route_to_%'")
            moving_trucks = cursor.fetchall()
            
            if not moving_trucks:
                conn.close()
                time.sleep(3)
                continue

            for t_id, status, cur_lat, cur_lon in moving_trucks:
                target_zone = status.replace('en_route_to_', '')
                dest_lat, dest_lon = get_zone_coordinates(target_zone)
                
                # Vector math: determine distance and direction
                d_lat = dest_lat - cur_lat
                d_lon = dest_lon - cur_lon
                dist = (d_lat**2 + d_lon**2)**0.5
                
                # Demo Mode Speed: ~0.002 units per heartbeat (Visible movement)
                step = 0.0025
                
                if dist < step:
                    # Arrived at destination
                    cursor.execute("UPDATE trucks SET status = 'idle', lat = ?, lon = ? WHERE id = ?", (dest_lat, dest_lon, t_id))
                    # Also update coverage as if it arrived
                    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    cursor.execute("UPDATE zone_coverage SET last_visited = ?, status = 'OK' WHERE zone = ?", (now_str, target_zone))
                    print(f"✅ Truck {t_id} arrived at {target_zone}")
                else:
                    # Move one step towards goal
                    new_lat = cur_lat + (d_lat / dist) * step
                    new_lon = cur_lon + (d_lon / dist) * step
                    cursor.execute("UPDATE trucks SET lat = ?, lon = ? WHERE id = ?", (new_lat, new_lon, t_id))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Simulation Error: {e}")
        
        time.sleep(2) # 2-second simulation tick


if __name__ == '__main__':
    # Initialize database schemas before starting simulation
    ensure_tables_exist()

    # Start the fleet simulation in a background daemon thread
    sim_thread = threading.Thread(target=simulate_fleet_movement, daemon=True)
    sim_thread.start()

    # Ensure this runs on 5000 to not conflict with Next.js
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=True)
