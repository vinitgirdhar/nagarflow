"""RFC 6238 authenticator verification with per-user keys derived from a private host key."""
import base64
import hashlib
import hmac
import os
import re
import secrets
import struct
from pathlib import Path
from flask import current_app


class SecurityUnavailable(RuntimeError):
    pass


def totp(secret,seconds,digits=6):
    key=base64.b32decode(secret+'='*((8-len(secret)%8)%8),casefold=True)
    digest=hmac.new(key,struct.pack('>Q',int(seconds)//30),hashlib.sha1).digest();offset=digest[-1]&15
    number=struct.unpack('>I',digest[offset:offset+4])[0]&0x7fffffff
    return str(number%(10**digits)).zfill(digits)


def _master(conn):
    path=Path(str(current_app.config['AUTH_DB_PATH'])+'.mfa-key')
    if not path.exists():
        if conn.execute('SELECT 1 FROM auth_users WHERE mfa_enabled=1 LIMIT 1').fetchone():raise SecurityUnavailable('MFA host key is missing; restore it from the protected backup.')
        try:
            descriptor=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(descriptor,'wb') as stream:stream.write(secrets.token_bytes(32))
        except FileExistsError:pass
    if path.stat().st_mode&0o077:raise SecurityUnavailable('MFA host key must have owner-only permissions.')
    key=path.read_bytes()
    if len(key)!=32:raise SecurityUnavailable('MFA host key is invalid.')
    return key


def seed(conn,user_id,nonce):
    raw=hmac.new(_master(conn),('nagarflow-totp-v1:'+user_id+':'+nonce).encode(),hashlib.sha256).digest()[:20]
    return base64.b32encode(raw).decode().rstrip('=')


def verify(conn,user,code,seconds,allow_recovery=True):
    if not isinstance(code,str):return False
    normal=code.replace('-','').strip().casefold()
    if allow_recovery and re.fullmatch(r'[a-f0-9]{24}',normal):
        digest=hashlib.sha256(normal.encode()).hexdigest()
        result=conn.execute('DELETE FROM auth_recovery_codes WHERE user_id=? AND code_hash=?',(user['id'],digest))
        return result.rowcount==1
    if not re.fullmatch(r'[0-9]{6}',code) or not user['mfa_nonce']:return False
    secret=seed(conn,user['id'],user['mfa_nonce']);counter=int(seconds)//30
    for candidate in (counter,counter-1,counter+1):
        if candidate<=user['mfa_last_counter']:continue
        if hmac.compare_digest(totp(secret,candidate*30),code):
            conn.execute('UPDATE auth_users SET mfa_last_counter=? WHERE id=?',(candidate,user['id']))
            return True
    return False


def recovery_codes(conn,user_id):
    conn.execute('DELETE FROM auth_recovery_codes WHERE user_id=?',(user_id,));codes=[secrets.token_hex(12) for _ in range(8)]
    conn.executemany('INSERT INTO auth_recovery_codes VALUES (?,?)',[(user_id,hashlib.sha256(code.encode()).hexdigest()) for code in codes])
    return codes
