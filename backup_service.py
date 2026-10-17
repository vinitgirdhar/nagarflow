"""Private SQLite/media backups and verified restore into a NEW directory only."""
import hashlib
import json
import shutil
import sqlite3
from contextlib import closing
from pathlib import Path
from flask import current_app,g
from auth_service import auth_connection
from database import data_path,MUNICIPALITY_ID

def checksum(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()


def create(output):
    output=Path(output).resolve();output.mkdir(mode=0o700,parents=True,exist_ok=False)
    files=[]
    def record(path):path.chmod(0o600);files.append({'path':str(path.relative_to(output)),'sha256':checksum(path)})
    def database(source,target):
        target.parent.mkdir(parents=True,exist_ok=True)
        with closing(sqlite3.connect(Path(source).resolve().as_uri()+'?mode=ro',uri=True)) as src,closing(sqlite3.connect(target)) as dst:src.backup(dst)
        record(target)
    with auth_connection() as conn:
        tenants=[row['id'] for row in conn.execute('SELECT id FROM municipalities ORDER BY id')]
        enabled=conn.execute('SELECT COUNT(*) FROM auth_users WHERE mfa_enabled=1').fetchone()[0]
    database(current_app.config['AUTH_DB_PATH'],output/'control.sqlite3')
    key=Path(str(current_app.config['AUTH_DB_PATH'])+'.mfa-key')
    if enabled and not key.is_file():raise RuntimeError('MFA key missing; backup is incomplete.')
    if key.exists():shutil.copyfile(key,output/'control.sqlite3.mfa-key');record(output/'control.sqlite3.mfa-key')
    previous=getattr(g,'municipality_id',None)
    try:
        for tenant in tenants:
            if not MUNICIPALITY_ID.fullmatch(tenant):raise ValueError('Invalid municipality registry entry')
            g.municipality_id=tenant;source=Path(data_path()).resolve();target=output/'municipalities'/tenant/'nagarflow.db'
            database(source,target)
            media=source.parent/'uploads'
            if media.exists():
                for item in media.rglob('*'):
                    if item.is_symlink():raise ValueError('Media symlinks are not supported in a backup.')
                    if not item.is_file():continue
                    destination=target.parent/'uploads'/item.relative_to(media);destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(item,destination);record(destination)
    finally:
        if previous is None:g.pop('municipality_id',None)
        else:g.municipality_id=previous
    manifest={'format':1,'municipalities':tenants,'consistency':'Each database is consistent individually. Stop API/worker writes during creation for cross-store consistency.','files':files}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2));(output/'manifest.json').chmod(0o600)
    return {'municipalities':len(tenants),'files':len(files)}


def restore(source,destination):
    source=Path(source).resolve();destination=Path(destination).resolve()
    if destination.exists():raise ValueError('Restore destination must not exist; live data is never overwritten.')
    manifest=json.loads((source/'manifest.json').read_text())
    if manifest.get('format')!=1 or not isinstance(manifest.get('files'),list):raise ValueError('Unsupported backup format')
    verified=[]
    for item in manifest['files']:
        relative=Path(item['path'])
        if relative.is_absolute() or '..' in relative.parts:raise ValueError('Unsafe backup path')
        path=source/relative
        if path.is_symlink() or not path.resolve().is_relative_to(source) or not path.is_file() or checksum(path)!=item['sha256']:raise ValueError('Backup integrity verification failed')
        if path.suffix in ('.db','.sqlite3'):
            with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as conn:
                if conn.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity verification failed')
        verified.append((path,relative))
    if not any(relative==Path('control.sqlite3') for _,relative in verified):raise ValueError('Backup control database is missing')
    paths={relative for _,relative in verified}
    with closing(sqlite3.connect((source/'control.sqlite3').as_uri()+'?mode=ro',uri=True)) as control:
        tenants=[row[0] for row in control.execute('SELECT id FROM municipalities')]
        enabled=control.execute('SELECT COUNT(*) FROM auth_users WHERE mfa_enabled=1').fetchone()[0]
    if any(not MUNICIPALITY_ID.fullmatch(tenant) or Path('municipalities')/tenant/'nagarflow.db' not in paths for tenant in tenants):raise ValueError('Backup is missing a municipality database')
    if enabled and Path('control.sqlite3.mfa-key') not in paths:raise ValueError('Backup is missing the MFA host key')
    destination.mkdir(mode=0o700,parents=True,exist_ok=False)
    for path,relative in verified:
        target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,target);target.chmod(0o600)
    # A restore invalidates old sessions; passwords, MFA and recovery data remain intact.
    with closing(sqlite3.connect(destination/'control.sqlite3')) as conn:
        conn.execute('DELETE FROM auth_sessions');conn.commit()
    return {'files':len(verified),'sessions_revoked':True}
