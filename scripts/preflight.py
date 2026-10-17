"""Read-only deployment checks. Reports names/counts, never credentials or resident data."""
import argparse
import json
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import app
from database import data_path
from flask import g
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--production',action='store_true');args=parser.parse_args();errors=[];warnings=[]
with app.app_context():
    if args.production:
        if not app.config['AUTH_COOKIE_SECURE']:errors.append('Secure cookies must be enabled.')
        origins=app.config['AUTH_TRUSTED_ORIGINS']
        if not origins or any(not origin.startswith('https://') for origin in origins):errors.append('Configure exact HTTPS trusted origins.')
        for name in ['NAGARFLOW_AUTH_DB','NAGARFLOW_DB_PATH','NAGARFLOW_TENANT_DATA_DIR']:
            if not os.getenv(name) or not Path(os.getenv(name,'')).is_absolute():errors.append(name+' must reference an absolute persistent path.')
    control_path=Path(app.config['AUTH_DB_PATH']).resolve()
    tenants=[];administrators=0;unenrolled=0
    if not control_path.is_file():errors.append('Initialize the control database before deployment checks.')
    else:
        try:
            with closing(sqlite3.connect(control_path.as_uri()+'?mode=ro',uri=True)) as control:
                if control.execute('PRAGMA integrity_check').fetchone()[0]!='ok':errors.append('Control database integrity check failed.')
                tenants=[row[0] for row in control.execute('SELECT id FROM municipalities')]
                administrators=control.execute("SELECT COUNT(*) FROM auth_users WHERE role='admin' AND active=1").fetchone()[0]
                unenrolled=control.execute("SELECT COUNT(*) FROM auth_users WHERE role='admin' AND active=1 AND mfa_enabled=0").fetchone()[0]
        except sqlite3.Error:errors.append('Migrate the control database before checking deployment readiness.')
    if not administrators:(errors if args.production else warnings).append('Provision the initial administrator privately using manage_users.py.')
    if unenrolled:warnings.append('Some active administrators must finish authenticator enrollment.')
    for tenant in tenants:
        g.municipality_id=tenant;path=Path(data_path()).resolve()
        if not path.is_file():errors.append('A registered municipality database is missing.');continue
        with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as conn:
            if conn.execute('PRAGMA integrity_check').fetchone()[0]!='ok':errors.append('A municipality database failed its integrity check.')
            tables={row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {'dispatches','ingestion_events','knowledge_documents','knowledge_search'}.issubset(tables):errors.append('Migrate all municipality schemas before startup.');continue
            inconsistent=conn.execute("SELECT count(*) FROM dispatches d LEFT JOIN trucks t ON t.id=d.truck_id WHERE d.status='EN_ROUTE' AND (t.id IS NULL OR t.status!='en_route_to_'||d.zone)").fetchone()[0]
            if inconsistent:errors.append('An active dispatch disagrees with fleet state.')
print(json.dumps({'ok':not errors,'errors':errors,'warnings':warnings,'scope':'Local configuration/storage only; provider delivery, HTTPS routing and restore operations require separate deployment validation.'},indent=2))
raise SystemExit(1 if errors else 0)
