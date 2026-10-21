"""Background inbox processing across server-registered active municipalities."""
from flask import g
from backend.auth.service import auth_connection
from backend.core.database import data_path
from backend.operations.dispatch import transaction,timestamp
from backend.intake.ingestion import process_one

def run_cycle(app,limit=100):
    processed=0
    with app.app_context():
        with auth_connection() as conn:
            municipalities=[row['id'] for row in conn.execute('SELECT id FROM municipalities WHERE active=1 ORDER BY id')]
        for municipality in municipalities:
            g.municipality_id=municipality;path=data_path()
            for _ in range(limit):
                if not process_one(path):break
                processed+=1
            with transaction(path) as conn:
                conn.execute("INSERT INTO global_status (key,value) VALUES ('ingestion_worker_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(timestamp(),))
    return processed
