"""Opaque server sessions, municipality/role authorization, and account administration."""
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from backend.core.database import DEFAULT_DB_PATH, MUNICIPALITY_ID, data_path
from backend.auth.prototype import DEMO_MUNICIPALITY, DEMO_BLOCKED_ENDPOINTS, public_details

auth = Blueprint('auth', __name__, url_prefix='/api/auth')
ROLES = {'admin', 'maintenance', 'worker'}
SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}
DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(32), method='scrypt')
PUBLIC_AUTH = {'auth.session_info', 'auth.sign_in', 'auth.sign_out'}
WEBHOOKS = {'whatsapp_complaint', 'vapi_webhook', 'image_complaint'}
ADMIN_ENDPOINTS = {
    'product.classify_complaint','product.create_vehicle','product.weather_status','product.operations','product.retry_receipt','product.knowledge_documents','product.knowledge_change','product.knowledge_query','product.forecasts',
    'get_predictions', 'get_weather_zones', 'get_dispatch', 'get_dashboard',
    'correct_dispatch_observation','accept_dispatch', 'arrive_dispatch', 'cancel_dispatch', 'get_dispatch_assignments', 'get_reports', 'get_agencies',
    'get_simulation_baseline', 'run_simulation', 'simulate_surge', 'get_complaints',
    'get_hotspots', 'agent_greet', 'agent_respond', 'agent_respond_text',
    'agent_respond_chat', 'get_upcoming_events', 'get_image_complaints',
    'update_image_complaint', 'image_media', 'query_knowledge', 'forecasts',
    'auth.accounts', 'auth.update_account', 'auth.reset_account_password', 'auth.audit_events', 'auth.create_team',
}
SUPERVISOR_ENDPOINTS = {'product.create_task','generate_maintenance_tasks', 'get_maintenance_data', 'assign_maintenance', 'complete_maintenance'}
TEAM_ENDPOINTS = {'worker_teams', 'worker_tasks', 'worker_upload', 'worker_update_status', 'serve_upload'}


def now():
    return int(time.time())


@contextmanager
def auth_connection():
    path = Path(current_app.config['AUTH_DB_PATH'])
    path.parent.mkdir(parents=True, exist_ok=True)
    new_file = not path.exists()
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS municipalities (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS auth_users (
                id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','maintenance','worker')),
                municipality_id TEXT NOT NULL REFERENCES municipalities(id), team_id TEXT,
                active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES auth_users(id),
                created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
            CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
            CREATE TABLE IF NOT EXISTS auth_login_limits (
                key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS auth_audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, municipality_id TEXT,
                actor_id TEXT, target_id TEXT, event TEXT NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS auth_recovery_codes (user_id TEXT NOT NULL REFERENCES auth_users(id), code_hash TEXT NOT NULL, PRIMARY KEY(user_id,code_hash));
            CREATE TABLE IF NOT EXISTS auth_webhook_receipts (
                signature TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
        ''')
        columns={row[1] for row in conn.execute('PRAGMA table_info(auth_users)')}
        for name,definition in {'mfa_enabled':'INTEGER NOT NULL DEFAULT 0','mfa_nonce':'TEXT','mfa_last_counter':'INTEGER NOT NULL DEFAULT -1'}.items():
            if name not in columns:conn.execute(f'ALTER TABLE auth_users ADD COLUMN {name} {definition}')
        conn.execute("INSERT OR IGNORE INTO municipalities (id,name) VALUES ('default','Default municipality')")
        conn.commit()
        if new_file:
            path.chmod(0o600)
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def audit(conn, event, actor=None, target=None, municipality=None):
    user = getattr(g, 'user', None)
    conn.execute('INSERT INTO auth_audit_events (municipality_id,actor_id,target_id,event,created_at) VALUES (?,?,?,?,?)',
                 (municipality or (user['municipality_id'] if user else None),
                  actor or (user['id'] if user else None), target, event, now()))


def _digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _cookie_name():
    return '__Host-nagarflow_session' if current_app.config['AUTH_COOKIE_SECURE'] else 'nagarflow_session'


def _csrf(token):
    return hmac.new(token.encode(), b'nagarflow-csrf-v1', hashlib.sha256).hexdigest()


def _set_cookie(response, token, ttl):
    response.set_cookie(_cookie_name(), token, max_age=ttl, httponly=True,
                        secure=current_app.config['AUTH_COOKIE_SECURE'], samesite='Lax', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return response


def _clear_cookie(response):
    response.delete_cookie(_cookie_name(), secure=current_app.config['AUTH_COOKIE_SECURE'],
                           httponly=True, samesite='Lax', path='/')
    return response


def _load_session():
    token = request.cookies.get(_cookie_name(), '')
    if not token or len(token) > 128:
        return None
    with auth_connection() as conn:
        row = conn.execute('''SELECT s.token_hash, s.user_id, s.expires_at, s.last_seen,
            u.id, u.email, u.display_name, u.role, u.team_id, u.municipality_id,
            u.active AS user_active, u.must_change_password, u.mfa_enabled, m.name AS municipality_name,
            m.active AS municipality_active FROM auth_sessions s
            LEFT JOIN auth_users u ON u.id=s.user_id
            LEFT JOIN municipalities m ON m.id=u.municipality_id WHERE s.token_hash=?''', (_digest(token),)).fetchone()
        if not row:
            return None
        expired = row['expires_at'] <= now() or row['last_seen'] + current_app.config['AUTH_IDLE_TTL'] <= now()
        disabled = row['user_id'] and (not row['user_active'] or not row['municipality_active'] or
            (row['municipality_id'] == DEMO_MUNICIPALITY and not current_app.config.get('AUTH_DEMO_ENABLED')))
        if expired or disabled:
            conn.execute('DELETE FROM auth_sessions WHERE token_hash=?', (row['token_hash'],))
            return None
        if now() - row['last_seen'] >= 30:
            conn.execute('UPDATE auth_sessions SET last_seen=? WHERE token_hash=?', (now(), row['token_hash']))
        return {**dict(row), 'raw_token': token}


def _public_user(row):
    demo = row['municipality_id'] == DEMO_MUNICIPALITY
    mfa_available = bool(current_app.config.get('AUTH_MFA_ENABLED') and not demo)
    mfa_policy = bool(mfa_available and current_app.config.get('AUTH_REQUIRE_ADMIN_MFA') and row['role'] == 'admin')
    return {key: row[key] for key in ('id', 'email', 'display_name', 'role', 'team_id', 'municipality_id', 'municipality_name')} | {
        'demo': demo, 'mfa_available': mfa_available,
        'mfa_policy_required': mfa_policy, 'mfa_required': bool(mfa_policy and not row.get('mfa_enabled', 0)),
        'mfa_enabled': bool(mfa_available and row.get('mfa_enabled', 0)),
        'must_change_password': bool(row['must_change_password']), 'active': bool(row.get('user_active', row.get('active', 1)))}


def _new_session(conn, user_id=None):
    token = secrets.token_urlsafe(32)
    ttl = current_app.config['AUTH_SESSION_TTL'] if user_id else 600
    conn.execute('DELETE FROM auth_sessions WHERE expires_at<=?', (now(),))
    conn.execute('INSERT INTO auth_sessions VALUES (?,?,?,?,?)', (_digest(token), user_id, now(), now()+ttl, now()))
    return token, ttl


def _consume_limit(conn, key, maximum, window):
    timestamp = now()
    row = conn.execute('SELECT window_start,attempts FROM auth_login_limits WHERE key=?', (key,)).fetchone()
    if row and row['window_start'] + window > timestamp:
        if row['attempts'] >= maximum:
            return row['window_start'] + window - timestamp
        conn.execute('UPDATE auth_login_limits SET attempts=attempts+1 WHERE key=?', (key,))
    else:
        conn.execute('INSERT INTO auth_login_limits VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start, attempts=1', (key, timestamp))
    conn.execute('DELETE FROM auth_login_limits WHERE window_start<?', (timestamp-3600,))
    return 0


def _csrf_error(session):
    origin = request.headers.get('Origin')
    if origin and origin not in current_app.config['AUTH_TRUSTED_ORIGINS']:
        return jsonify({'error': 'This request origin is not allowed.', 'code': 'csrf_failed'}), 403
    supplied = request.headers.get('X-CSRF-Token', '')
    if not session or not re.fullmatch(r'[0-9a-f]{64}', supplied) or not hmac.compare_digest(supplied, _csrf(session['raw_token'])):
        return jsonify({'error': 'Your security token has expired. Refresh and try again.', 'code': 'csrf_failed'}), 403
    return None


def _payload():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _password_error(password):
    if not isinstance(password, str) or not 15 <= len(password) <= 128 or not password.strip() or '\n' in password or '\r' in password:
        return 'Use a passphrase between 15 and 128 characters.'
    return None


def _user_fields(data):
    email = data.get('email', '')
    name = data.get('display_name', '')
    role = data.get('role', '')
    team_id = data.get('team_id') or None
    if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email.strip()):
        raise ValueError('Enter a valid email address.')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80 or not isinstance(role, str) or role not in ROLES:
        raise ValueError('A display name and valid role are required.')
    if role == 'worker':
        if not isinstance(team_id, str):
            raise ValueError('Workers must be assigned to a team.')
        with sqlite3.connect(data_path()) as conn:
            if not conn.execute('SELECT 1 FROM teams WHERE id=?', (team_id,)).fetchone():
                raise ValueError('The selected team does not belong to this municipality.')
    elif team_id is not None:
        raise ValueError('Only worker accounts can have an assigned team.')
    return email.strip().casefold(), name.strip(), role, team_id


def create_user(email, display_name, password, role, municipality_id='default', team_id=None, must_change_password=True):
    """Trusted deployment CLI/test entry point; the HTTP endpoint supplies its own municipality."""
    if not MUNICIPALITY_ID.fullmatch(municipality_id):
        raise ValueError('Invalid municipality identifier.')
    error = _password_error(password)
    if error:
        raise ValueError(error)
    previous = getattr(g, 'municipality_id', None)
    g.municipality_id = municipality_id
    try:
        email, display_name, role, team_id = _user_fields(locals())
        password_hash = generate_password_hash(password, method='scrypt')
        identifier = uuid.uuid4().hex
        with auth_connection() as conn:
            conn.execute('BEGIN IMMEDIATE')
            actor = getattr(g, 'user', None)
            if actor and not conn.execute("SELECT 1 FROM auth_users WHERE id=? AND municipality_id=? AND role='admin' AND active=1", (actor['id'],municipality_id)).fetchone():
                raise ValueError('Administrator permission is required.')
            if not conn.execute('SELECT 1 FROM municipalities WHERE id=? AND active=1', (municipality_id,)).fetchone():
                raise ValueError('Municipality is not provisioned.')
            conn.execute('INSERT INTO auth_users (id,email,display_name,password_hash,role,municipality_id,team_id,active,must_change_password,created_at) VALUES (?,?,?,?,?,?,?,1,?,?)',
                         (identifier, email, display_name, password_hash, role, municipality_id, team_id, int(must_change_password), now()))
            audit(conn, 'account_created', target=identifier, municipality=municipality_id)
        return identifier
    finally:
        if previous is None:
            g.pop('municipality_id', None)
        else:
            g.municipality_id = previous


@auth.get('/session')
def session_info():
    options = {'mfa_available': bool(current_app.config.get('AUTH_MFA_ENABLED')), 'demo': public_details(current_app)}
    session = _load_session()
    if session:
        return jsonify({**options, 'authenticated': bool(session['user_id']),
                        'user': _public_user(session) if session['user_id'] else None,
                        'csrf_token': _csrf(session['raw_token']), 'expires_at': session['expires_at']})
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        retry = _consume_limit(conn, 'challenge:'+_digest(request.remote_addr or ''), 60, 60)
        if retry:
            return jsonify({'error': 'Too many requests. Try again shortly.'}), 429, {'Retry-After': str(retry)}
        token, ttl = _new_session(conn)
        setup_required = conn.execute('SELECT COUNT(*) FROM auth_users').fetchone()[0] == 0
    return _set_cookie(jsonify({**options, 'authenticated': False, 'user': None, 'csrf_token': _csrf(token),
                               'setup_required': setup_required, 'expires_at': now()+ttl}), token, ttl)


@auth.post('/login')
def sign_in():
    if request.content_length and request.content_length > 16384:
        return jsonify({'error': 'Sign-in request is too large.'}), 413
    old = _load_session()
    error = _csrf_error(old)
    if error:
        return error
    payload = _payload()
    email, password = payload.get('email'), payload.get('password')
    if not isinstance(email, str) or not isinstance(password, str) or len(email) > 254 or not 1 <= len(password) <= 128:
        return jsonify({'error': 'Invalid email or password.'}), 401
    email = email.strip().casefold()
    account_key = 'account:'+_digest(email)
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        retry = _consume_limit(conn, 'login-ip:'+_digest(request.remote_addr or ''), 60, 900)
        retry = retry or _consume_limit(conn, account_key, 5, 900)
        if retry:
            return jsonify({'error': 'Too many sign-in attempts. Try again later.', 'code': 'rate_limited'}), 429, {'Retry-After': str(retry)}
        user = conn.execute('SELECT u.*, m.name AS municipality_name,m.active AS municipality_active FROM auth_users u JOIN municipalities m ON m.id=u.municipality_id WHERE email=?', (email,)).fetchone()
    valid = check_password_hash(user['password_hash'] if user else DUMMY_HASH, password)
    if not valid or not user or not user['active'] or not user['municipality_active'] or (
            user['municipality_id'] == DEMO_MUNICIPALITY and not current_app.config.get('AUTH_DEMO_ENABLED')):
        with auth_connection() as conn:
            audit(conn, 'login_failed', target=user['id'] if user else None, municipality=user['municipality_id'] if user else None)
        return jsonify({'error': 'Invalid email or password.'}), 401
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        current = conn.execute('SELECT u.*,m.name AS municipality_name,m.active AS municipality_active FROM auth_users u JOIN municipalities m ON m.id=u.municipality_id WHERE u.id=?', (user['id'],)).fetchone()
        if not current['active'] or not current['municipality_active'] or current['password_hash'] != user['password_hash']:
            return jsonify({'error': 'Invalid email or password.'}), 401
        if current_app.config.get('AUTH_MFA_ENABLED') and current['mfa_enabled'] and current['municipality_id'] != DEMO_MUNICIPALITY:
            from backend.auth.mfa import verify
            if not verify(conn,current,payload.get('otp',''),now()):
                audit(conn,'mfa_login_failed',actor=current['id'],municipality=current['municipality_id'])
                return jsonify({'error':'Enter a current authenticator code or an unused recovery code.','code':'mfa_required'}),401
        conn.execute('DELETE FROM auth_sessions WHERE token_hash=?', (old['token_hash'],))
        token, ttl = _new_session(conn, current['id'])
        conn.execute('DELETE FROM auth_login_limits WHERE key=?', (account_key,))
        audit(conn, 'login_succeeded', actor=current['id'], municipality=current['municipality_id'])
    return _set_cookie(jsonify({'authenticated': True, 'user': _public_user(dict(current)),
                               'csrf_token': _csrf(token), 'expires_at': now()+ttl}), token, ttl)


@auth.post('/logout')
def sign_out():
    session = _load_session()
    error = _csrf_error(session)
    if error:
        return error
    with auth_connection() as conn:
        conn.execute('DELETE FROM auth_sessions WHERE token_hash=?', (session['token_hash'],))
        audit(conn, 'logout', actor=session['user_id'], municipality=session['municipality_id'])
    return _clear_cookie(jsonify({'authenticated': False}))


@auth.post('/password')
def change_password():
    payload = _payload()
    password, new_password = payload.get('current_password'), payload.get('new_password')
    error = _password_error(new_password)
    if error:
        return jsonify({'error': error}), 400
    if not isinstance(password, str) or not 1 <= len(password) <= 128:
        return jsonify({'error': 'Current password is incorrect.'}), 400
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        retry = _consume_limit(conn, 'password:'+g.user['id'], 5, 900)
        if retry:
            return jsonify({'error': 'Too many attempts. Try again later.'}), 429, {'Retry-After': str(retry)}
        user = conn.execute('SELECT password_hash FROM auth_users WHERE id=? AND active=1', (g.user['id'],)).fetchone()
        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'error': 'Current password is incorrect.'}), 400
        if check_password_hash(user['password_hash'], new_password):
            return jsonify({'error': 'Choose a different passphrase.'}), 400
        conn.execute('UPDATE auth_users SET password_hash=?,must_change_password=0 WHERE id=?',
                     (generate_password_hash(new_password, method='scrypt'), g.user['id']))
        conn.execute('DELETE FROM auth_sessions WHERE user_id=?', (g.user['id'],))
        audit(conn, 'password_changed', target=g.user['id'])
    return _clear_cookie(jsonify({'authenticated': False, 'message': 'Password changed. Sign in again on each device.'}))


def _mfa_password(conn,payload):
    retry=_consume_limit(conn,'mfa:'+g.user['id'],5,900)
    if retry:return None,(jsonify({'error':'Too many security attempts. Try later.'}),429,{'Retry-After':str(retry)})
    user=conn.execute('SELECT * FROM auth_users WHERE id=? AND active=1',(g.user['id'],)).fetchone()
    password=payload.get('current_password')
    if not user or not isinstance(password,str) or not 1<=len(password)<=128 or not check_password_hash(user['password_hash'],password):
        return None,(jsonify({'error':'Current password is incorrect.'}),400)
    return user,None


@auth.post('/mfa/enroll')
def mfa_enroll():
    from backend.auth.mfa import seed
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE');user,error=_mfa_password(conn,_payload())
        if error:return error
        if user['mfa_enabled']:return jsonify({'error':'Authenticator is already enabled.'}),409
        nonce=secrets.token_hex(16);secret=seed(conn,user['id'],nonce)
        conn.execute('UPDATE auth_users SET mfa_nonce=?,mfa_last_counter=-1 WHERE id=?',(nonce,user['id']))
        audit(conn,'mfa_enrollment_started',target=user['id'])
    return jsonify({'secret':secret,'issuer':'NagarFlow','account':g.user['email']})


@auth.post('/mfa/confirm')
def mfa_confirm():
    from backend.auth.mfa import verify,recovery_codes
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE');user,error=_mfa_password(conn,_payload())
        if error:return error
        if user['mfa_enabled'] or not user['mfa_nonce']:return jsonify({'error':'Start a new authenticator enrollment.'}),409
        if not verify(conn,user,_payload().get('otp',''),now(),allow_recovery=False):return jsonify({'error':'Invalid or already used authenticator code.'}),400
        conn.execute('UPDATE auth_users SET mfa_enabled=1 WHERE id=?',(user['id'],))
        codes=recovery_codes(conn,user['id'])
        conn.execute('DELETE FROM auth_sessions WHERE user_id=? AND token_hash!=?',(user['id'],_digest(request.cookies.get(_cookie_name(),''))))
        audit(conn,'mfa_enabled',target=user['id'])
    return jsonify({'enabled':True,'recovery_codes':codes})


@auth.post('/mfa/disable')
def mfa_disable():
    if current_app.config.get('AUTH_REQUIRE_ADMIN_MFA') and g.user['role']=='admin':return jsonify({'error':'Your administrator policy requires an authenticator.'}),403
    from backend.auth.mfa import verify
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE');user,error=_mfa_password(conn,_payload())
        if error:return error
        if not user['mfa_enabled'] or not verify(conn,user,_payload().get('otp',''),now()):return jsonify({'error':'A current authenticator or unused recovery code is required.'}),400
        conn.execute('UPDATE auth_users SET mfa_enabled=0,mfa_nonce=NULL,mfa_last_counter=-1 WHERE id=?',(user['id'],))
        conn.execute('DELETE FROM auth_recovery_codes WHERE user_id=?',(user['id'],))
        conn.execute('DELETE FROM auth_sessions WHERE user_id=? AND token_hash!=?',(user['id'],_digest(request.cookies.get(_cookie_name(),''))))
        audit(conn,'mfa_disabled',target=user['id'])
    return jsonify({'enabled':False})


@auth.route('/users', methods=['GET', 'POST'])
def accounts():
    if request.method == 'POST':
        payload = _payload()
        if payload.get('municipality_id', g.user['municipality_id']) != g.user['municipality_id']:
            return jsonify({'error': 'Accounts can only be created in your municipality.'}), 403
        try:
            identifier = create_user(payload.get('email'), payload.get('display_name'), payload.get('password'),
                                     payload.get('role'), g.user['municipality_id'], payload.get('team_id'))
            return jsonify({'id': identifier}), 201
        except ValueError as error:
            return jsonify({'error': str(error)}), 400
        except sqlite3.IntegrityError:
            return jsonify({'error': 'An account cannot be created with these details.'}), 409
    with auth_connection() as conn:
        rows = conn.execute('''SELECT u.id,u.email,u.display_name,u.role,u.team_id,u.active,u.must_change_password,u.mfa_enabled,
            u.municipality_id,m.name AS municipality_name FROM auth_users u JOIN municipalities m ON m.id=u.municipality_id
            WHERE u.municipality_id=? ORDER BY u.display_name,u.id''', (g.user['municipality_id'],)).fetchall()
    return jsonify({'users': [_public_user(dict(row)) for row in rows]})


@auth.patch('/users/<user_id>')
def update_account(user_id):
    payload = _payload()
    if not payload or set(payload)-{'display_name','role','team_id','active'}:
        return jsonify({'error': 'Only name, role, team, and active status can be updated.'}), 400
    if 'active' in payload and not isinstance(payload['active'], bool):
        return jsonify({'error': 'active must be a boolean.'}), 400
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        actor = conn.execute("SELECT 1 FROM auth_users WHERE id=? AND active=1 AND role='admin'", (g.user['id'],)).fetchone()
        if not actor:
            return jsonify({'error': 'Administrator permission is required.'}), 403
        row = conn.execute('SELECT * FROM auth_users WHERE id=? AND municipality_id=?', (user_id,g.user['municipality_id'])).fetchone()
        if not row:
            return jsonify({'error': 'Account not found.'}), 404
        changes = dict(row) | payload
        if changes['role'] != 'worker':
            changes['team_id'] = None
        try:
            _, name, role, team = _user_fields(changes)
        except ValueError as error:
            return jsonify({'error': str(error)}), 400
        removing_admin = row['role']=='admin' and (role!='admin' or not changes['active'])
        if removing_admin:
            count = conn.execute("SELECT COUNT(*) FROM auth_users WHERE municipality_id=? AND active=1 AND role='admin'", (g.user['municipality_id'],)).fetchone()[0]
            if user_id==g.user['id'] or count<=1:
                return jsonify({'error': 'You cannot remove your own administrator access or the last active administrator.'}), 409
        conn.execute('UPDATE auth_users SET display_name=?,role=?,team_id=?,active=? WHERE id=?', (name,role,team,int(changes['active']),user_id))
        if role!=row['role'] or team!=row['team_id'] or changes['active']!=bool(row['active']):
            conn.execute('DELETE FROM auth_sessions WHERE user_id=?', (user_id,))
        audit(conn, 'account_updated', target=user_id)
    return jsonify({'success': True})


@auth.post('/users/<user_id>/password')
def reset_account_password(user_id):
    if user_id==g.user['id']:
        return jsonify({'error': 'Use Change password for your own account.'}), 400
    password = _payload().get('new_password')
    error = _password_error(password)
    if error:
        return jsonify({'error': error}), 400
    with auth_connection() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if not conn.execute("SELECT 1 FROM auth_users WHERE id=? AND role='admin' AND active=1", (g.user['id'],)).fetchone():
            return jsonify({'error': 'Administrator permission is required.'}), 403
        row = conn.execute('SELECT id FROM auth_users WHERE id=? AND municipality_id=?', (user_id,g.user['municipality_id'])).fetchone()
        if not row:
            return jsonify({'error': 'Account not found.'}), 404
        conn.execute('UPDATE auth_users SET password_hash=?,must_change_password=1 WHERE id=?', (generate_password_hash(password,method='scrypt'),user_id))
        conn.execute('DELETE FROM auth_sessions WHERE user_id=?', (user_id,))
        audit(conn, 'password_reset', target=user_id)
    return jsonify({'success': True, 'must_change_password': True})


@auth.get('/audit')
def audit_events():
    with auth_connection() as conn:
        rows = conn.execute('SELECT id,actor_id,target_id,event,created_at FROM auth_audit_events WHERE municipality_id=? ORDER BY id DESC LIMIT 100', (g.user['municipality_id'],)).fetchall()
    return jsonify({'events': [dict(row) for row in rows]})


@auth.post('/teams')
def create_team():
    payload = _payload()
    identifier, name = payload.get('id'), payload.get('name')
    kind, members = payload.get('type'), payload.get('member_count', 1)
    if not isinstance(identifier,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,50}',identifier) or not isinstance(name,str) or not 1<=len(name.strip())<=80:
        return jsonify({'error': 'A team identifier and name are required.'}), 400
    if kind not in ('Garbage','Water','Road','Drain','General') or isinstance(members,bool) or not isinstance(members,int) or not 1<=members<=100:
        return jsonify({'error': 'Select a valid team type and member count from 1 to 100.'}), 400
    try:
        with sqlite3.connect(data_path()) as conn:
            conn.execute("INSERT INTO teams VALUES (?,?,?,?,'Idle',NULL)", (identifier,name.strip(),members,kind))
    except sqlite3.IntegrityError:
        return jsonify({'error': 'A team with this identifier already exists.'}), 409
    with auth_connection() as conn:
        audit(conn, 'team_created', target=identifier)
    return jsonify({'id': identifier}), 201


def _verify_webhook():
    secret = os.getenv('NAGARFLOW_WEBHOOK_SECRET')
    if not secret:
        return jsonify({'error': 'Webhook authentication is not configured.'}), 503
    stamp = request.headers.get('X-Nagarflow-Timestamp', '')
    event_id = request.headers.get('X-Nagarflow-Event-ID', '')
    signature = request.headers.get('X-Nagarflow-Signature', '')
    try:
        if len(stamp)>20 or abs(now()-int(stamp))>300:raise ValueError
    except ValueError:
        return jsonify({'error':'Invalid webhook timestamp.'}),401
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,200}',event_id):
        return jsonify({'error':'A stable X-Nagarflow-Event-ID is required.'}),400
    expected=hmac.new(secret.encode(),stamp.encode()+b'.'+event_id.encode()+b'.'+request.get_data(),hashlib.sha256).hexdigest()
    if not re.fullmatch(r'[0-9a-f]{64}',signature) or not hmac.compare_digest(signature,expected):
        return jsonify({'error':'Invalid webhook signature.'}),401
    municipality=current_app.config['WEBHOOK_MUNICIPALITY']
    with auth_connection() as conn:
        if not conn.execute('SELECT 1 FROM municipalities WHERE id=? AND active=1',(municipality,)).fetchone():
            return jsonify({'error':'Webhook municipality unavailable.'}),503
    if not isinstance(request.get_json(silent=True),dict):return jsonify({'error':'A JSON object is required.'}),400
    g.municipality_id = municipality
    return None


def install_auth(app):
    root = Path(app.root_path)
    production = os.getenv('NAGARFLOW_ENV') == 'production'
    origins = os.getenv('NAGARFLOW_TRUSTED_ORIGINS', '')
    if production and not origins:
        raise RuntimeError('Production requires NAGARFLOW_TRUSTED_ORIGINS.')
    app.config.update(
        AUTH_DB_PATH=os.getenv('NAGARFLOW_AUTH_DB', str(root/'.cache'/'auth.sqlite3')),
        DATA_DB_PATH=DEFAULT_DB_PATH,
        TENANT_DATA_DIR=os.getenv('NAGARFLOW_TENANT_DATA_DIR', str(root/'.cache'/'municipalities')),
        AUTH_COOKIE_SECURE=production or os.getenv('NAGARFLOW_COOKIE_SECURE', 'true') != 'false',
        AUTH_TRUSTED_ORIGINS={origin.strip() for origin in (origins or 'http://localhost:3000,http://127.0.0.1:3000').split(',') if origin.strip()},
        AUTH_REQUIRE_ADMIN_MFA=os.getenv('NAGARFLOW_REQUIRE_ADMIN_MFA','true' if production else 'false')=='true',
        AUTH_MFA_ENABLED=os.getenv('NAGARFLOW_MFA_ENABLED', 'false') == 'true',
        AUTH_DEMO_ENABLED=os.getenv('NAGARFLOW_DEMO_ENABLED', 'false') == 'true',
        AUTH_SESSION_TTL=8*3600, AUTH_IDLE_TTL=1800,
        WEBHOOK_MUNICIPALITY=os.getenv('NAGARFLOW_WEBHOOK_MUNICIPALITY', 'default'),
    )
    app.register_blueprint(auth)

    @app.before_request
    def authorize_request():
        protected = request.path.startswith('/api/') or request.path.startswith('/uploads/') or request.path.startswith('/static/uploads/')
        if not protected or request.path=='/api/health' or request.endpoint in PUBLIC_AUTH:
            return None
        if request.method=='OPTIONS':
            return '', 204
        if request.endpoint in WEBHOOKS or (request.endpoint=='get_image_complaints' and request.method=='POST'):
            return _verify_webhook()
        session = _load_session()
        if not session or not session['user_id']:
            return _clear_cookie(jsonify({'error': 'Sign in to continue.', 'code': 'authentication_required'})), 401
        g.user = _public_user(session)
        g.municipality_id = g.user['municipality_id']
        if request.method not in SAFE_METHODS:
            error = _csrf_error(session)
            if error:
                return error
            if request.is_json and not isinstance(request.get_json(silent=True), dict):
                return jsonify({'error': 'A valid JSON object is required.'}), 400
        if g.user['must_change_password'] and request.endpoint!='auth.change_password':
            return jsonify({'error': 'Change your temporary password before continuing.', 'code': 'password_change_required'}), 403
        if g.user['mfa_required'] and request.endpoint not in {'auth.change_password','auth.mfa_enroll','auth.mfa_confirm'}:
            return jsonify({'error':'Set up an authenticator before accessing this workspace.','code':'mfa_enrollment_required'}),403
        if request.endpoint in {'auth.mfa_enroll','auth.mfa_confirm','auth.mfa_disable'} and not current_app.config.get('AUTH_MFA_ENABLED'):
            return jsonify({'error': 'Authenticator setup is unavailable for this prototype.'}), 404
        if g.user['demo'] and (request.endpoint in DEMO_BLOCKED_ENDPOINTS or
                (request.endpoint == 'auth.accounts' and request.method != 'GET')):
            return jsonify({'error': 'This shared demo does not change account credentials or contact external providers.', 'code': 'demo_restricted'}), 403
        if request.endpoint in {'auth.change_password','auth.mfa_enroll','auth.mfa_confirm','auth.mfa_disable'}:
            return None
        allowed = set()
        if request.endpoint in ADMIN_ENDPOINTS:
            allowed = {'admin'}
        elif request.endpoint in SUPERVISOR_ENDPOINTS:
            allowed = {'admin','maintenance'}
        elif request.endpoint in {'worker_upload','worker_update_status'}:
            allowed = {'admin','worker'}
        elif request.endpoint in TEAM_ENDPOINTS:
            allowed = ROLES
        if request.endpoint is None:
            return None
        if g.user['role'] not in allowed:
            with auth_connection() as conn:
                audit(conn, 'permission_denied')
            return jsonify({'error': 'You do not have permission for this action.', 'code': 'permission_denied'}), 403
        return None

    @app.after_request
    def protect_auth_responses(response):
        if request.path.startswith(('/api/', '/uploads/', '/static/uploads/')):
            response.headers['Cache-Control'] = 'no-store'
            response.headers['X-Content-Type-Options'] = 'nosniff'
        return response
