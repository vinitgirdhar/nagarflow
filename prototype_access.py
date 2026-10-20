"""Explicitly public prototype access, isolated from the owner's municipality.

These are published demonstration credentials, never an owner/provider secret.
Only trusted startup provisions the account; HTTP cannot choose its tenant.
"""
from contextlib import closing
import sqlite3
import uuid

from flask import g
from werkzeug.security import generate_password_hash

DEMO_MUNICIPALITY = 'prototype-demo'
DEMO_EMAIL = 'demo@nagarflow.app'
DEMO_PASSWORD = 'NagarFlow Demo 2026!'

# Keep shared credentials stable and prevent real external provider usage.
DEMO_BLOCKED_ENDPOINTS = {
    'auth.change_password', 'auth.update_account', 'auth.reset_account_password',
    'auth.mfa_enroll', 'auth.mfa_confirm', 'auth.mfa_disable',
    'agent_greet', 'agent_respond', 'agent_respond_text', 'agent_respond_chat',
    'product.retry_receipt',
}


def public_details(app):
    if not app.config.get('AUTH_DEMO_ENABLED'):
        return None
    return {'email': DEMO_EMAIL, 'password': DEMO_PASSWORD}


def provision(app):
    """Create one opt-in sample tenant; never overwrite accounts or records."""
    if not app.config.get('AUTH_DEMO_ENABLED'):
        return False
    from auth_service import auth_connection, audit, now
    from database import data_path
    from schema import initialize_database

    with app.app_context(), auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        existing = conn.execute('SELECT municipality_id FROM auth_users WHERE email=?', (DEMO_EMAIL,)).fetchone()
        if existing:
            if existing['municipality_id'] != DEMO_MUNICIPALITY:
                raise ValueError('Public demo email is already assigned outside the sample workspace.')
            return False
        # Reserve this namespace; do not repurpose an existing municipality.
        if conn.execute('SELECT 1 FROM municipalities WHERE id=?', (DEMO_MUNICIPALITY,)).fetchone():
            raise ValueError('The sample workspace identifier is already in use.')
        conn.execute('INSERT INTO municipalities (id,name) VALUES (?,?)',
                     (DEMO_MUNICIPALITY, 'NagarFlow shared prototype'))
        g.municipality_id = DEMO_MUNICIPALITY
        path = data_path()
        initialize_database(path)
        with closing(sqlite3.connect(path)) as sample, sample:
            sample.executemany(
                'INSERT INTO complaints (id,zone,issue_type,complaint_count,severity,description,timestamp) '
                "VALUES (?,?,?,?,'Medium','Synthetic prototype example; not a resident report.',CURRENT_TIMESTAMP)",
                [('demo-garbage', 'Dharavi', 'Garbage', 8), ('demo-water', 'Kurla', 'Water', 4),
                 ('demo-road', 'Bandra', 'Road', 3)],
            )
            sample.executemany(
                "INSERT INTO trucks (name,status,lat,lon,truck_type) VALUES (?,'idle',?,?,?)",
                [('Sample sanitation truck', 19.0408, 72.854, 'garbage'),
                 ('Sample water tanker', 19.0726, 72.8795, 'water')],
            )
            sample.execute("INSERT INTO teams VALUES ('sample-team','Sample field team',3,'Garbage','Idle',NULL)")
            sample.execute(
                'INSERT INTO maintenance_tasks (id,zone,type,priority,status,reported_time) '
                "VALUES ('sample-task','Dharavi','Garbage','High','PENDING',CURRENT_TIMESTAMP)",
            )
        identifier = uuid.uuid4().hex
        conn.execute(
            'INSERT INTO auth_users (id,email,display_name,password_hash,role,municipality_id,active,must_change_password,created_at) '
            "VALUES (?,?,?,?,'admin',?,1,0,?)",
            (identifier, DEMO_EMAIL, 'Prototype visitor', generate_password_hash(DEMO_PASSWORD, method='scrypt'),
             DEMO_MUNICIPALITY, now()),
        )
        audit(conn, 'prototype_account_provisioned', target=identifier, municipality=DEMO_MUNICIPALITY)
    return True
