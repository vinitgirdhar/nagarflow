import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
import backend.app as m
from backend.tests.auth_helpers import authenticate
from backend.core.backup import create,restore
from backend.auth.service import auth_connection
from backend.auth.mfa import seed
class BackupTest(unittest.TestCase):
    def setUp(self):self.client=m.app.test_client();authenticate(self)
    def test_verified_restore_preserves_data_and_mfa_material_but_revokes_sessions(self):
        with tempfile.TemporaryDirectory() as directory,m.app.app_context():
            root=Path(directory);backup=root/'backup';destination=root/'restored'
            with auth_connection() as conn:
                user=conn.execute('SELECT id FROM auth_users').fetchone()[0];secret=seed(conn,user,'synthetic-nonce')
                conn.execute("UPDATE auth_users SET mfa_enabled=1,mfa_nonce='synthetic-nonce'")
            with sqlite3.connect(m.app.config['DATA_DB_PATH']) as conn:conn.execute("INSERT INTO complaints (id,zone) VALUES ('preserved','Dharavi')")
            create(backup);result=restore(backup,destination);self.assertTrue(result['sessions_revoked'])
            with sqlite3.connect(destination/'municipalities/default/nagarflow.db') as conn:self.assertEqual(conn.execute('SELECT id FROM complaints').fetchall(),[('preserved',)])
            with sqlite3.connect(destination/'control.sqlite3') as conn:self.assertEqual(conn.execute('SELECT count(*) FROM auth_sessions').fetchone()[0],0)
            old=m.app.config['AUTH_DB_PATH'];m.app.config['AUTH_DB_PATH']=str(destination/'control.sqlite3')
            try:
                with auth_connection() as conn:self.assertEqual(seed(conn,user,'synthetic-nonce'),secret)
            finally:m.app.config['AUTH_DB_PATH']=old
    def test_restore_refuses_overwrite_and_detects_corruption(self):
        with tempfile.TemporaryDirectory() as directory,m.app.app_context():
            root=Path(directory);create(root/'backup')
            with self.assertRaises(ValueError):restore(root/'backup',root)
            with open(root/'backup/control.sqlite3','ab') as stream:stream.write(b'corrupt')
            with self.assertRaises(ValueError):restore(root/'backup',root/'new')
            self.assertFalse((root/'new').exists())
