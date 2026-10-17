"""Repeatable data migrations; demo seeding is an explicit separate operation."""
import sqlite3
import uuid
from pathlib import Path

from prediction_store import deduplicate_predictions_table


TABLES = [
    '''CREATE TABLE IF NOT EXISTS complaints (id TEXT PRIMARY KEY, zone TEXT, locality TEXT,
       issue_type TEXT, complaint_count INTEGER, population INTEGER, weather TEXT,
       timestamp TEXT, severity TEXT, description TEXT)''',
    '''CREATE TABLE IF NOT EXISTS trucks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT,
       status TEXT DEFAULT 'idle', lat REAL, lon REAL, truck_type TEXT DEFAULT 'garbage')''',
    '''CREATE TABLE IF NOT EXISTS predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, zone TEXT,
       priority_score REAL, type TEXT, action TEXT, reason TEXT, lat REAL, lon REAL,
       category TEXT DEFAULT 'General', timestamp TEXT DEFAULT CURRENT_TIMESTAMP)''',
    '''CREATE TABLE IF NOT EXISTS prediction_outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT,
       prediction_id INTEGER, actual_demand REAL, error_margin REAL, timestamp TEXT,
       is_simulated INTEGER DEFAULT 1)''',
    '''CREATE TABLE IF NOT EXISTS zone_coverage (zone TEXT PRIMARY KEY, last_visited TEXT,
       status TEXT, complaint_count INTEGER DEFAULT 0)''',
    '''CREATE TABLE IF NOT EXISTS agencies (id TEXT PRIMARY KEY, agency_name TEXT, category TEXT,
       city TEXT, municipal_body TEXT, description TEXT, source_url TEXT, source_label TEXT,
       dashboard_url TEXT, source_status TEXT, source_status_code INTEGER, source_title TEXT,
       source_description TEXT, last_checked TEXT, services_json TEXT, contact_json TEXT)''',
    '''CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT, member_count INTEGER,
       type TEXT, status TEXT, current_zone TEXT)''',
    '''CREATE TABLE IF NOT EXISTS maintenance_tasks (id TEXT PRIMARY KEY, zone TEXT, type TEXT,
       priority TEXT, status TEXT, assigned_team_id TEXT, reported_time TEXT, completed_time TEXT,
       image_url TEXT, worker_notes TEXT)''',
    '''CREATE TABLE IF NOT EXISTS image_complaints (id TEXT PRIMARY KEY, file_id TEXT, image_url TEXT,
       caption TEXT, chat_id TEXT, zone TEXT DEFAULT 'Unknown', locality TEXT DEFAULT '',
       issue_type TEXT DEFAULT 'General', priority TEXT DEFAULT 'pending', status TEXT DEFAULT 'new', timestamp TEXT)''',
    '''CREATE TABLE IF NOT EXISTS global_status (key TEXT PRIMARY KEY, value TEXT,
       last_updated TEXT DEFAULT CURRENT_TIMESTAMP)''',
    '''CREATE TABLE IF NOT EXISTS uploaded_evidence (filename TEXT PRIMARY KEY, task_id TEXT NOT NULL,
       owner_user_id TEXT NOT NULL, created_at TEXT NOT NULL)''',
    """CREATE TABLE IF NOT EXISTS dispatches (
        id TEXT PRIMARY KEY, truck_id INTEGER NOT NULL, truck_name TEXT NOT NULL,
        zone TEXT NOT NULL, prediction_id INTEGER, prediction_version TEXT, predicted_score REAL,
        destination_lat REAL, destination_lon REAL,
        status TEXT NOT NULL CHECK(status IN ('EN_ROUTE','ARRIVED','CANCELLED')),
        accepted_at TEXT, accepted_by TEXT, arrived_at TEXT, arrived_by TEXT,
        actual_demand REAL CHECK(actual_demand IS NULL OR actual_demand BETWEEN 0 AND 100),
        arrival_notes TEXT, cancelled_at TEXT, cancelled_by TEXT, cancel_reason TEXT,
        is_legacy INTEGER NOT NULL DEFAULT 0)""",
    """CREATE UNIQUE INDEX IF NOT EXISTS dispatch_active_truck ON dispatches(truck_id) WHERE status='EN_ROUTE'""",
    """CREATE UNIQUE INDEX IF NOT EXISTS dispatch_active_zone ON dispatches(zone) WHERE status='EN_ROUTE' AND is_legacy=0""",
    """CREATE UNIQUE INDEX IF NOT EXISTS dispatch_prediction_serviced ON dispatches(prediction_version)
        WHERE prediction_version IS NOT NULL AND status!='CANCELLED'""",
    """CREATE TABLE IF NOT EXISTS dispatch_requests (
        operation TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
        dispatch_id TEXT NOT NULL REFERENCES dispatches(id), created_at TEXT NOT NULL,
        PRIMARY KEY(operation,request_key))""",
    """CREATE TABLE IF NOT EXISTS dispatch_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dispatch_id TEXT NOT NULL REFERENCES dispatches(id),
        actor_id TEXT NOT NULL, event TEXT NOT NULL, created_at TEXT NOT NULL)""",

    """CREATE TABLE IF NOT EXISTS ingestion_events (
        id TEXT PRIMARY KEY,kind TEXT NOT NULL,event_id TEXT NOT NULL,body_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL,next_attempt_at REAL NOT NULL,
        received_at TEXT NOT NULL,completed_at TEXT,result_json TEXT,last_error_code TEXT,UNIQUE(kind,event_id))""",
    """CREATE INDEX IF NOT EXISTS ingestion_pending ON ingestion_events(status,next_attempt_at)""",
    """CREATE TABLE IF NOT EXISTS operation_events (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,
        event TEXT NOT NULL,target_id TEXT NOT NULL,created_at TEXT NOT NULL)""",

    """CREATE TABLE IF NOT EXISTS knowledge_documents (id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,
        source_url TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,created_by TEXT NOT NULL,
        approved_by TEXT,created_at TEXT NOT NULL,approved_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS knowledge_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES knowledge_documents(id),ordinal INTEGER NOT NULL,body TEXT NOT NULL)""",
    """CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_search USING fts5(body,tokenize='unicode61')""",
    """CREATE TRIGGER IF NOT EXISTS knowledge_insert AFTER INSERT ON knowledge_chunks BEGIN
        INSERT INTO knowledge_search (rowid,body) VALUES (new.id,new.body); END""",
    """CREATE TRIGGER IF NOT EXISTS knowledge_delete AFTER DELETE ON knowledge_chunks BEGIN
        DELETE FROM knowledge_search WHERE rowid=old.id; END""",

    """CREATE TABLE IF NOT EXISTS observation_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispatch_id TEXT NOT NULL REFERENCES dispatches(id),previous_value REAL,new_value REAL,revision INTEGER NOT NULL,
        reason TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL)""",

]


def initialize_database(path):
    Path(path).resolve().parent.mkdir(parents=True, exist_ok=True)
    created = not Path(path).exists()
    with sqlite3.connect(path) as conn:
        if created:Path(path).chmod(0o600)
        for statement in TABLES:
            conn.execute(statement)
        additions = {
            'complaints': {'revision':'INTEGER NOT NULL DEFAULT 1','locality': 'TEXT', 'population': 'INTEGER', 'description': 'TEXT'},
            'trucks': {'truck_type': "TEXT DEFAULT 'garbage'"},
            'predictions': {'timestamp': 'TEXT', 'category': "TEXT DEFAULT 'General'", 'lat': 'REAL', 'lon': 'REAL'},
            'prediction_outcomes': {'timestamp': 'TEXT', 'is_simulated': 'INTEGER DEFAULT 1', 'dispatch_id': 'TEXT', 'predicted_score': 'REAL'},
            'zone_coverage': {'complaint_count': 'INTEGER DEFAULT 0'},
            'dispatches': {'observation_revision':'INTEGER NOT NULL DEFAULT 0'},
            'maintenance_tasks': {'image_url': 'TEXT', 'worker_notes': 'TEXT', 'complaint_id':'TEXT'},
        }
        for table, columns in additions.items():
            existing = {row[1] for row in conn.execute(f'PRAGMA table_info({table})')}
            for name, definition in columns.items():
                if name not in existing:
                    conn.execute(f'ALTER TABLE {table} ADD COLUMN {name} {definition}')
                    if name == 'is_simulated':
                        conn.execute('UPDATE prediction_outcomes SET is_simulated=1')
        deduplicate_predictions_table(conn)

        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS outcome_dispatch_unique ON prediction_outcomes(dispatch_id) WHERE dispatch_id IS NOT NULL")
        # Preserve legacy busy routes without inventing an acceptance time or observations.
        from fleet_manager import ZONE_COORDS
        busy = conn.execute("SELECT id,name,status FROM trucks WHERE status LIKE 'en_route_to_%' AND id NOT IN (SELECT truck_id FROM dispatches WHERE status='EN_ROUTE')").fetchall()
        for truck_id, name, status in busy:
            zone = status.removeprefix('en_route_to_')
            lat, lon = ZONE_COORDS.get(zone, (None,None))
            conn.execute("""INSERT INTO dispatches
                (id,truck_id,truck_name,zone,destination_lat,destination_lon,status,is_legacy)
                VALUES (?,?,?,?,?,?,'EN_ROUTE',1)""", (uuid.uuid4().hex,truck_id,name or str(truck_id),zone,lat,lon))


def initialize_all(app):
    from flask import g
    from auth_service import auth_connection
    from database import data_path
    with app.app_context():
        with auth_connection() as conn:municipalities=[row['id'] for row in conn.execute('SELECT id FROM municipalities ORDER BY id')]
        for municipality in municipalities:
            g.municipality_id=municipality;initialize_database(data_path())
    return len(municipalities)
