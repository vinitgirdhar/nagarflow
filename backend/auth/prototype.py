"""Explicitly public sample accounts, isolated from the owner's municipality."""
from contextlib import closing
import sqlite3
import uuid

from flask import g
from werkzeug.security import generate_password_hash

DEMO_MUNICIPALITY = 'prototype-demo'
DEMO_EMAIL = 'demo@nagarflow.app'
DEMO_PASSWORD = 'NagarFlow Demo 2026!'
DEMO_ACCOUNTS = (
    {'email': DEMO_EMAIL, 'role': 'admin', 'label': 'Administrator', 'team_id': None},
    {'email': 'supervisor@nagarflow.app', 'role': 'maintenance', 'label': 'Supervisor', 'team_id': None},
    {'email': 'worker@nagarflow.app', 'role': 'worker', 'label': 'Field worker', 'team_id': 'sample-team'},
)
DEMO_BLOCKED_ENDPOINTS = {
    'auth.change_password', 'auth.update_account', 'auth.reset_account_password',
    'auth.mfa_enroll', 'auth.mfa_confirm', 'auth.mfa_disable',
    'agent_greet', 'agent_respond', 'agent_respond_text', 'agent_respond_chat',
    'product.retry_receipt',
}


def public_details(app):
    if not app.config.get('AUTH_DEMO_ENABLED'):
        return None
    return {'email': DEMO_EMAIL, 'password': DEMO_PASSWORD,
            'accounts': [{key: account[key] for key in ('email', 'role', 'label')} for account in DEMO_ACCOUNTS]}


def _seed_sample(path):
    """Add one small, versioned sample; preserve all subsequent visitor changes."""
    with closing(sqlite3.connect(path)) as sample, sample:
        if sample.execute("SELECT 1 FROM global_status WHERE key='prototype_sample_v2'").fetchone():
            return False
        sample.executemany(
            'INSERT OR IGNORE INTO complaints (id,zone,issue_type,complaint_count,severity,description,timestamp) '
            "VALUES (?,?,?,?,'Medium','Synthetic prototype example; not a resident report.',CURRENT_TIMESTAMP)",
            [('demo-garbage', 'Dharavi', 'Garbage', 8), ('demo-water', 'Kurla', 'Water', 4),
             ('demo-road', 'Bandra', 'Road', 3)],
        )
        sample.executemany(
            "INSERT OR IGNORE INTO trucks (id,name,status,lat,lon,truck_type) VALUES (?,?,'idle',?,?,?)",
            [(1, 'Sample sanitation truck', 19.0408, 72.854, 'garbage'),
             (2, 'Sample water tanker', 19.0726, 72.8795, 'water')],
        )
        sample.execute("INSERT OR IGNORE INTO teams VALUES ('sample-team','Sample field team',3,'Garbage','Busy','Dharavi')")
        sample.execute("INSERT OR IGNORE INTO teams VALUES ('sample-standby','Sample standby team',2,'Road','Idle',NULL)")
        sample.execute(
            'INSERT OR IGNORE INTO maintenance_tasks (id,zone,type,priority,status,reported_time) '
            "VALUES ('sample-task','Bandra','Road','High','PENDING',CURRENT_TIMESTAMP)",
        )
        if not sample.execute("SELECT 1 FROM maintenance_tasks WHERE assigned_team_id='sample-team' AND status IN ('ON GROUND','COMPLETED_UNVERIFIED')").fetchone():
            sample.execute(
                'INSERT OR IGNORE INTO maintenance_tasks '
                '(id,zone,type,priority,status,assigned_team_id,reported_time,worker_notes) '
                "VALUES ('sample-assigned-task','Dharavi','Garbage','High','ON GROUND','sample-team',CURRENT_TIMESTAMP,"
                "'Sample work order: inspect a missed collection. This is a prototype example.')",
            )
            sample.execute("UPDATE teams SET status='Busy',current_zone='Dharavi' WHERE id='sample-team'")
        sample.executemany(
            'INSERT OR IGNORE INTO predictions (id,zone,priority_score,type,category,action,reason,lat,lon,timestamp) '
            "VALUES (?,?,?,'Resource demand',?,'Dispatch','Illustrative demo priority; not a live model forecast.',?,?,CURRENT_TIMESTAMP)",
            [(10001, 'Dharavi', 82, 'Garbage', 19.0408, 72.854),
             (10002, 'Kurla', 68, 'Water', 19.0726, 72.8795)],
        )
        sample.execute("INSERT INTO global_status (key,value) VALUES ('prototype_sample_v2','synthetic')")
    return True


def provision(app):
    """Trusted startup provisions or upgrades the sample, never owner records."""
    if not app.config.get('AUTH_DEMO_ENABLED'):
        return False
    from backend.auth.service import auth_connection, audit, now
    from backend.core.database import data_path
    from backend.core.schema import initialize_database

    with app.app_context(), auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        existing = {}
        for account in DEMO_ACCOUNTS:
            row = conn.execute('SELECT municipality_id FROM auth_users WHERE email=?', (account['email'],)).fetchone()
            if row and row['municipality_id'] != DEMO_MUNICIPALITY:
                raise ValueError('Public demo email is already assigned outside the sample workspace.')
            existing[account['email']] = row
        municipality = conn.execute('SELECT 1 FROM municipalities WHERE id=?', (DEMO_MUNICIPALITY,)).fetchone()
        if municipality and not existing[DEMO_EMAIL]:
            raise ValueError('The sample workspace identifier is already in use.')
        if not municipality:
            conn.execute('INSERT INTO municipalities (id,name) VALUES (?,?)',
                         (DEMO_MUNICIPALITY, 'NagarFlow shared prototype'))
        g.municipality_id = DEMO_MUNICIPALITY
        path = data_path()
        initialize_database(path)
        changed = _seed_sample(path)
        for account in DEMO_ACCOUNTS:
            if existing[account['email']]:
                continue
            identifier = uuid.uuid4().hex
            conn.execute(
                'INSERT INTO auth_users (id,email,display_name,password_hash,role,municipality_id,team_id,active,must_change_password,created_at) '
                'VALUES (?,?,?,?,?,?,?,1,0,?)',
                (identifier, account['email'], account['label'] + ' demo',
                 generate_password_hash(DEMO_PASSWORD, method='scrypt'), account['role'],
                 DEMO_MUNICIPALITY, account['team_id'], now()),
            )
            audit(conn, 'prototype_account_provisioned', target=identifier, municipality=DEMO_MUNICIPALITY)
            changed = True
    return changed
