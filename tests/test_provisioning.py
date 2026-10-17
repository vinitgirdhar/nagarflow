import os
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ProvisioningTest(unittest.TestCase):
    def test_cli_initializes_tenant_and_provisions_without_exposing_password(self):
        with tempfile.TemporaryDirectory() as directory:
            env=os.environ|{'NAGARFLOW_DB_PATH':str(Path(directory)/'default.db'),'NAGARFLOW_AUTH_DB':str(Path(directory)/'auth.db'),'NAGARFLOW_TENANT_DATA_DIR':str(Path(directory)/'tenants')}
            def run(*args,input=None):
                result=subprocess.run([str(ROOT/'venv/bin/python'),str(ROOT/'scripts/manage_users.py'),*args],input=input,text=True,capture_output=True,cwd=ROOT,env=env)
                self.assertEqual(result.returncode,0,result.stderr);self.assertNotIn('Synthetic provisioning passphrase!',result.stdout);return result
            run('municipality','test-city','--name','Test City')
            run('create','--municipality','test-city','--email','admin@test.example','--name','Test administrator','--password-stdin',input='Synthetic provisioning passphrase!\n')
            with sqlite3.connect(env['NAGARFLOW_AUTH_DB']) as db:
                row=db.execute('SELECT municipality_id,role,must_change_password,password_hash FROM auth_users').fetchone()
                self.assertEqual(row[:3],('test-city','admin',1));self.assertTrue(row[3].startswith('scrypt:'))
            self.assertTrue((Path(directory)/'tenants/test-city/nagarflow.db').is_file())
            run('reset','--email','admin@test.example','--password-stdin',input='New synthetic provisioning passphrase!\n')
