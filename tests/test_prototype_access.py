"""Public prototype credentials never grant access to the owner's municipality."""
import sqlite3
import unittest
import gc

import app as m
from auth_helpers import authenticate, PASSWORD
from auth_service import auth_connection


class PrototypeAccessTest(unittest.TestCase):
    def setUp(self):
        self.client = m.app.test_client()
        authenticate(self)
        self.addCleanup(gc.collect)
        m.app.config.update(AUTH_MFA_ENABLED=False, AUTH_REQUIRE_ADMIN_MFA=True,
                            AUTH_DEMO_ENABLED=True)

    def provision(self):
        from prototype_access import provision
        provision(m.app)

    def login_demo(self):
        from prototype_access import DEMO_EMAIL, DEMO_PASSWORD
        client = m.app.test_client()
        challenge = client.get('/api/auth/session').json
        response = client.post('/api/auth/login', json={
            'email': DEMO_EMAIL, 'password': DEMO_PASSWORD,
        }, headers={'X-CSRF-Token': challenge['csrf_token']})
        self.assertEqual(response.status_code, 200, response.json)
        client.environ_base['HTTP_X_CSRF_TOKEN'] = response.json['csrf_token']
        return client, response.json['user']

    def test_disabled_authenticator_never_blocks_an_existing_account(self):
        with m.app.app_context(), auth_connection() as conn:
            conn.execute("UPDATE auth_users SET mfa_enabled=1,mfa_nonce='old-enrollment'")
        client = m.app.test_client()
        token = client.get('/api/auth/session').json['csrf_token']
        response = client.post('/api/auth/login', json={
            'email': 'test@example.test', 'password': PASSWORD,
        }, headers={'X-CSRF-Token': token})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertFalse(response.json['user']['mfa_required'])
        self.assertFalse(response.json['user']['mfa_enabled'])
        self.assertEqual(client.get('/api/dashboard').status_code, 200)

    def test_disabled_authenticator_cannot_be_enrolled(self):
        response = self.client.post('/api/auth/mfa/enroll', json={'current_password': PASSWORD})
        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.client.get('/api/auth/session').json['mfa_available'])

    def test_demo_is_opt_in_and_disappears_when_disabled(self):
        from prototype_access import provision
        m.app.config['AUTH_DEMO_ENABLED'] = False
        self.assertFalse(provision(m.app))
        self.assertIsNone(self.client.get('/api/auth/session').json['demo'])
        m.app.config['AUTH_DEMO_ENABLED'] = True
        self.provision()
        client, _ = self.login_demo()
        m.app.config['AUTH_DEMO_ENABLED'] = False
        self.assertEqual(client.get('/api/dashboard').status_code, 401)
        challenge = client.get('/api/auth/session').json
        from prototype_access import DEMO_EMAIL, DEMO_PASSWORD
        response = client.post('/api/auth/login', json={'email': DEMO_EMAIL, 'password': DEMO_PASSWORD},
                               headers={'X-CSRF-Token': challenge['csrf_token']})
        self.assertEqual(response.status_code, 401)

    def test_public_credentials_open_only_the_sample_workspace(self):
        self.provision()
        client, user = self.login_demo()
        self.assertTrue(user['demo'])
        self.assertFalse(user['must_change_password'])
        self.assertFalse(user['mfa_required'])
        self.assertEqual(user['municipality_id'], 'prototype-demo')
        self.assertEqual(client.get('/api/dashboard').status_code, 200)
        accounts = client.get('/api/auth/users').json['users']
        self.assertEqual(len(accounts), 1)
        self.assertNotEqual(accounts[0]['email'], 'test@example.test')
        # Normal operational writes remain usable, but only in the sample tenant.
        response = client.post('/api/fleet/vehicles', json={
            'name': 'Visitor sample truck', 'truck_type': 'garbage', 'lat': 19.04, 'lon': 72.85,
        })
        self.assertEqual(response.status_code, 201, response.json)
        with sqlite3.connect(m.app.config['DATA_DB_PATH']) as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM trucks').fetchone()[0], 0)

    def test_visitors_cannot_change_public_credentials_or_manage_accounts(self):
        self.provision()
        client, user = self.login_demo()
        for method, path, body in [
            ('post', '/api/auth/password', {'current_password': 'anything', 'new_password': 'Changed public passphrase!'}),
            ('post', '/api/auth/users', {}),
            ('patch', '/api/auth/users/' + user['id'], {'active': False}),
            ('post', '/api/auth/users/' + user['id'] + '/password', {}),
            ('post', '/api/auth/mfa/enroll', {}),
            ('post', '/api/agent/chat', {}),
        ]:
            with self.subTest(path=path):
                self.assertIn(getattr(client, method)(path, json=body).status_code, (403, 404))
        self.login_demo()
        self.assertEqual(client.post('/api/auth/logout').status_code, 200)

    def test_startup_is_repeatable_and_preserves_owner_and_visitor_changes(self):
        self.provision()
        client, _ = self.login_demo()
        with m.app.app_context(), auth_connection() as conn:
            original = dict(conn.execute("SELECT * FROM auth_users WHERE email='test@example.test'").fetchone())
        response = client.post('/api/fleet/vehicles', json={
            'name': 'Keep sample change', 'truck_type': 'water', 'lat': 19.04, 'lon': 72.85,
        })
        self.assertEqual(response.status_code, 201, response.json)
        self.provision()
        with m.app.app_context(), auth_connection() as conn:
            self.assertEqual(original, dict(conn.execute("SELECT * FROM auth_users WHERE email='test@example.test'").fetchone()))
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM auth_users').fetchone()[0], 2)
        self.assertEqual(client.get('/api/dashboard').status_code, 200)


if __name__ == '__main__':
    unittest.main()
