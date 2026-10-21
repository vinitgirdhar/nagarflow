"""Explicit per-municipality provider poll; does not assume every tenant is Mumbai."""
import argparse
import sys
from pathlib import Path
from flask import g
from backend.app import app
from backend.auth.service import auth_connection
from backend.core.database import data_path
from backend.integrations.weather import poll_once
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--municipality',required=True);parser.add_argument('--latitude',required=True,type=float);parser.add_argument('--longitude',required=True,type=float);args=parser.parse_args()
with app.app_context():
    with auth_connection() as conn:
        if not conn.execute('SELECT 1 FROM municipalities WHERE id=? AND active=1',(args.municipality,)).fetchone():parser.error('Municipality not provisioned.')
    g.municipality_id=args.municipality;poll_once(data_path(),args.latitude,args.longitude)
print('Provider snapshot saved. Inspect its timestamp and location before operational use.')
