"""Trusted startup provisioning uses temporary stores and no HTTP signup route."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

from werkzeug.security import check_password_hash, generate_password_hash

from backend.app import app
from backend.auth.service import auth_connection, create_user
from scripts.deployment.initial_admin import provision_initial_admin
from scripts.deployment import render_service


class InitialAdministratorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password = 'Synthetic initial passphrase 42!'
        cls.password_hash = generate_password_hash(cls.password, method='scrypt:32768:8:1')

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        previous = app.config.copy()
        self.addCleanup(lambda: (app.config.clear(), app.config.update(previous)))
        app.config.update(
            AUTH_DB_PATH=str(self.root / 'control.sqlite3'),
            DATA_DB_PATH=str(self.root / 'data.sqlite3'),
            TENANT_DATA_DIR=str(self.root / 'tenants'),
        )
        self.environment = {
            'NAGARFLOW_INITIAL_ADMIN_EMAIL': 'Owner@Example.test',
            'NAGARFLOW_INITIAL_ADMIN_NAME': 'Initial administrator',
            'NAGARFLOW_INITIAL_ADMIN_PASSWORD_HASH': self.password_hash,
        }

    def test_absent_configuration_creates_no_account_or_store(self):
        self.assertFalse(provision_initial_admin({}))
        self.assertFalse(Path(app.config['AUTH_DB_PATH']).exists())

    def test_partial_configuration_and_unsafe_hashes_fail_before_writes(self):
        for changes in (
            {'NAGARFLOW_INITIAL_ADMIN_EMAIL': ''},
            {'NAGARFLOW_INITIAL_ADMIN_EMAIL': 'invalid'},
            {'NAGARFLOW_INITIAL_ADMIN_NAME': ' '},
            {'NAGARFLOW_INITIAL_ADMIN_PASSWORD_HASH': ''},
            {'NAGARFLOW_INITIAL_ADMIN_PASSWORD_HASH': self.password},
            {'NAGARFLOW_INITIAL_ADMIN_PASSWORD_HASH': self.password_hash.replace('32768', '1048576')},
            {'NAGARFLOW_INITIAL_ADMIN_PASSWORD_HASH': self.password_hash + '\n'},
        ):
            with self.subTest(changes=list(changes)), self.assertRaises(ValueError):
                provision_initial_admin({**self.environment, **changes})
            self.assertFalse(Path(app.config['AUTH_DB_PATH']).exists())

    def test_creates_only_initial_admin_with_hash_and_required_password_change(self):
        self.assertTrue(provision_initial_admin(self.environment))
        with app.app_context(), auth_connection() as connection:
            user = connection.execute('SELECT * FROM auth_users').fetchone()
            self.assertEqual(user['email'], 'owner@example.test')
            self.assertEqual(user['role'], 'admin')
            self.assertEqual(user['municipality_id'], 'default')
            self.assertEqual(user['must_change_password'], 1)
            self.assertEqual(user['mfa_enabled'], 0)
            self.assertEqual(user['password_hash'], self.password_hash)
            self.assertTrue(check_password_hash(user['password_hash'], self.password))
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM auth_sessions').fetchone()[0], 0)
        self.assertFalse(provision_initial_admin(self.environment))

    def test_never_overwrites_or_adds_accounts_to_an_existing_store(self):
        with app.app_context():
            identifier = create_user('existing@example.test', 'Existing administrator', self.password, 'admin', must_change_password=False)
            with auth_connection() as connection:
                original = dict(connection.execute('SELECT * FROM auth_users WHERE id=?', (identifier,)).fetchone())
        self.assertFalse(provision_initial_admin(self.environment))
        with app.app_context(), auth_connection() as connection:
            rows = connection.execute('SELECT * FROM auth_users').fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(dict(rows[0]), original)

    def test_fresh_ephemeral_store_recreates_only_the_initial_account(self):
        self.assertTrue(provision_initial_admin(self.environment))
        app.config['AUTH_DB_PATH'] = str(self.root / 'fresh' / 'control.sqlite3')
        self.assertTrue(provision_initial_admin(self.environment))
        with app.app_context(), auth_connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM auth_users').fetchone()[0], 1)
            self.assertEqual(connection.execute('SELECT must_change_password FROM auth_users').fetchone()[0], 1)

    def test_backend_only_commands_bind_public_port_and_keep_worker_colocated(self):
        commands = dict(render_service.service_commands({'PORT': '10000'}, api_only=True))
        self.assertEqual(set(commands), {'api', 'worker'})
        self.assertIn('0.0.0.0:10000', commands['api'])
        self.assertNotIn('node', commands['api'])
        full = dict(render_service.service_commands({'PORT': '10000'}))
        self.assertIn('web', full)
        self.assertIn('127.0.0.1:5000', full['api'])

    @unittest.skipUnless(os.name == 'posix', 'Hosted launcher requires POSIX')
    def test_real_backend_launcher_initializes_account_and_serves_api(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        environment = {
            **os.environ,
            **self.environment,
            'PORT': str(port),
            'NAGARFLOW_STORAGE_DIR': str(self.root / 'hosted'),
            'NAGARFLOW_AUTH_DB': str(self.root / 'hosted' / 'auth' / 'control.sqlite3'),
            'NAGARFLOW_DB_PATH': str(self.root / 'hosted' / 'default' / 'data.sqlite3'),
            'NAGARFLOW_TENANT_DATA_DIR': str(self.root / 'hosted' / 'municipalities'),
            'NAGARFLOW_TRUSTED_ORIGINS': 'https://frontend.example.test',
        }
        process = subprocess.Popen(
            [sys.executable, '-m', 'scripts.deployment.render_service', 'serve-api'],
            cwd=render_service.ROOT, env=environment,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline and process.poll() is None:
                try:
                    with opener.open(f'http://127.0.0.1:{port}/api/health', timeout=1) as response:
                        self.assertEqual(json.load(response), {'status': 'ok'})
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.1)
            else:
                self.fail('Backend-only startup did not become healthy')
            with opener.open(f'http://127.0.0.1:{port}/api/auth/session', timeout=2) as response:
                payload = json.load(response)
                self.assertFalse(payload['setup_required'])
                self.assertFalse(payload['authenticated'])
                self.assertIn('Secure', response.headers['Set-Cookie'])
                self.assertIn('HttpOnly', response.headers['Set-Cookie'])
                self.assertIn('no-store', response.headers['Cache-Control'])
        finally:
            process.terminate()
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate(timeout=5)

if __name__ == '__main__':
    unittest.main()
