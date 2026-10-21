"""Migrate every provisioned municipality; demo data requires explicit opt-in."""
import argparse
import sys
from pathlib import Path
from backend.app import app, ensure_tables_exist
from backend.auth.service import auth_connection
from flask import g

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--demo',action='store_true',help='Seed synthetic data in the default development municipality only; no accounts are created')
args=parser.parse_args()
with app.app_context():
    with auth_connection() as conn:
        municipalities=[row['id'] for row in conn.execute('SELECT id FROM municipalities ORDER BY id')]
    for municipality in municipalities:
        g.municipality_id=municipality
        ensure_tables_exist(seed_demo=args.demo and municipality=='default')
print(f'Database schemas ready for {len(municipalities)} municipalities. No default login credentials are created.')
