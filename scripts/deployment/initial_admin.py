"""Optional trusted startup provisioning for hosts without an interactive shell.

Only a precomputed scrypt hash is accepted. No HTTP endpoint or default account
is added, and an existing account store is never changed by this bootstrap.
"""
from __future__ import annotations

import re
import uuid


def provision_initial_admin(environment: dict[str, str]) -> bool:
    email = environment.get('NAGARFLOW_INITIAL_ADMIN_EMAIL', '')
    password_hash = environment.get('NAGARFLOW_INITIAL_ADMIN_PASSWORD_HASH', '')
    if not email and not password_hash:
        return False
    name = environment.get('NAGARFLOW_INITIAL_ADMIN_NAME', 'Administrator')
    # Fixed work factors bound login cost; reject plaintext and arbitrary methods.
    if not re.fullmatch(r'scrypt:32768:8:1\$[a-zA-Z0-9]{16}\$[0-9a-f]{128}', password_hash):
        raise ValueError('Initial administrator provisioning requires a valid precomputed scrypt hash.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email.strip()) or len(email) > 254:
        raise ValueError('Initial administrator provisioning requires a valid email address.')
    if not 1 <= len(name.strip()) <= 80:
        raise ValueError('Initial administrator provisioning requires a display name.')

    # Import only after the deployment launcher configures storage and privileges.
    from backend.app import app
    from backend.auth.service import audit, auth_connection, now

    with app.app_context(), auth_connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        if connection.execute('SELECT 1 FROM auth_users LIMIT 1').fetchone():
            return False
        municipality = connection.execute("SELECT active FROM municipalities WHERE id='default'").fetchone()
        if not municipality or not municipality['active']:
            raise ValueError('Initial administrator provisioning requires an active default municipality.')
        identifier = uuid.uuid4().hex
        connection.execute(
            'INSERT INTO auth_users '
            '(id,email,display_name,password_hash,role,municipality_id,team_id,active,must_change_password,created_at) '
            "VALUES (?,?,?,?,'admin','default',NULL,1,1,?)",
            (identifier, email.strip().casefold(), name.strip(), password_hash, now()),
        )
        audit(connection, 'initial_admin_provisioned', target=identifier, municipality='default')
    return True
