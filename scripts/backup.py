"""Back up privately or verify/restore to a new location. Stop writes for cross-store consistency."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import app
from backup_service import create,restore
parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
p=sub.add_parser('create');p.add_argument('--output',required=True)
p=sub.add_parser('restore');p.add_argument('--source',required=True);p.add_argument('--destination',required=True)
a=parser.parse_args()
with app.app_context():
    result=create(a.output) if a.command=='create' else restore(a.source,a.destination)
print('Verified backup operation completed. Old sessions are revoked on restore.' if a.command=='restore' else 'Private backup created. Keep its databases, media, manifest and MFA key together.')
