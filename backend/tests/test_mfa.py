import base64
import unittest
from unittest.mock import patch
import backend.app as m
from backend.tests.auth_helpers import authenticate,PASSWORD
from backend.auth.service import auth_connection
from backend.auth.mfa import totp

class MfaTest(unittest.TestCase):
    def setUp(self):self.client=m.app.test_client();authenticate(self);m.app.config['AUTH_MFA_ENABLED']=True;self.mfa_time=(int(__import__('time').time())//30)*30
    def enroll(self):
        r=self.client.post('/api/auth/mfa/enroll',json={'current_password':PASSWORD});self.assertEqual(r.status_code,200,r.json);secret=r.json['secret']
        with patch('backend.auth.service.now',return_value=self.mfa_time):
            response=self.client.post('/api/auth/mfa/confirm',json={'current_password':PASSWORD,'otp':totp(secret,self.mfa_time)})
        self.assertEqual(response.status_code,200,response.json);return secret,response.json['recovery_codes']
    def login(self,otp=''):
        client=m.app.test_client();token=client.get('/api/auth/session').json['csrf_token']
        return client,client.post('/api/auth/login',json={'email':'test@example.test','password':PASSWORD,'otp':otp},headers={'X-CSRF-Token':token})
    def test_rfc_6238_sha1_reference_vectors(self):
        secret=base64.b32encode(b'12345678901234567890').decode().rstrip('=')
        for seconds,expected in [(59,'94287082'),(1111111109,'07081804'),(1111111111,'14050471'),(1234567890,'89005924'),(2000000000,'69279037'),(20000000000,'65353130')]:self.assertEqual(totp(secret,seconds,8),expected)
    def test_enrollment_requires_password_and_valid_code(self):
        self.assertEqual(self.client.post('/api/auth/mfa/enroll',json={'current_password':'wrong'}).status_code,400)
        r=self.client.post('/api/auth/mfa/enroll',json={'current_password':PASSWORD});self.assertEqual(r.status_code,200)
        self.assertEqual(self.client.post('/api/auth/mfa/confirm',json={'current_password':PASSWORD,'otp':'bad'}).status_code,400)
        self.assertFalse(self.client.get('/api/auth/session').json['user']['mfa_enabled'])
    def test_second_factor_and_recovery_replay_are_enforced(self):
        secret,codes=self.enroll()
        with patch('backend.auth.service.now',return_value=self.mfa_time+30):
            c,response=self.login();self.assertEqual(response.status_code,401);self.assertEqual(response.json['code'],'mfa_required')
            c,response=self.login(totp(secret,self.mfa_time+30));self.assertEqual(response.status_code,200,response.json)
            self.assertEqual(self.login(totp(secret,self.mfa_time+30))[1].status_code,401)
            c,response=self.login(codes[0]);self.assertEqual(response.status_code,200,response.json)
            self.assertEqual(self.login(codes[0])[1].status_code,401)
    def test_recovery_codes_are_hashes_and_setup_material_not_public(self):
        secret,codes=self.enroll()
        with m.app.app_context(),auth_connection() as conn:
            hashes=[row[0] for row in conn.execute('SELECT code_hash FROM auth_recovery_codes')]
        self.assertEqual(len(hashes),8);self.assertTrue(all(len(code)==64 for code in hashes));self.assertNotIn(codes[0],hashes)
        response=self.client.get('/api/auth/session').get_data(as_text=True)+self.client.get('/api/auth/users').get_data(as_text=True)
        self.assertNotIn(secret,response);self.assertNotIn('mfa_nonce',response)
    def test_disable_requires_second_factor_and_revokes_old_session(self):
        secret,codes=self.enroll()
        self.assertEqual(self.client.post('/api/auth/mfa/disable',json={'current_password':PASSWORD,'otp':'000000'}).status_code,400)
        response=self.client.post('/api/auth/mfa/disable',json={'current_password':PASSWORD,'otp':codes[0]});self.assertEqual(response.status_code,200,response.json)
        self.assertFalse(self.client.get('/api/auth/session').json['user']['mfa_enabled'])
        self.assertEqual(self.login()[1].status_code,200)
    def test_admin_mfa_policy_blocks_workspace_until_enrollment(self):
        m.app.config['AUTH_REQUIRE_ADMIN_MFA']=True
        response=self.client.get('/api/dashboard');self.assertEqual(response.status_code,403);self.assertEqual(response.json['code'],'mfa_enrollment_required')
        secret,codes=self.enroll();self.assertEqual(self.client.get('/api/dashboard').status_code,200)
        self.assertEqual(self.client.post('/api/auth/mfa/disable',json={'current_password':PASSWORD,'otp':codes[0]}).status_code,403)
    def test_missing_host_key_does_not_silently_generate_a_different_key(self):
        from pathlib import Path
        secret,codes=self.enroll();path=Path(str(m.app.config['AUTH_DB_PATH'])+'.mfa-key');path.unlink()
        with patch('backend.auth.service.now',return_value=self.mfa_time+30):
            self.assertEqual(self.login(totp(secret,self.mfa_time+30))[1].status_code,503)
            self.assertFalse(path.exists());self.assertEqual(self.login(codes[0])[1].status_code,200)
