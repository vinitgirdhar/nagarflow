import hashlib
import hmac
import io
import os
import sqlite3
import unittest
from unittest.mock import patch
from flask import g
from PIL import Image
import backend.app as m
from backend.tests.auth_helpers import authenticate, PASSWORD
from backend.auth.service import auth_connection, create_user, now
from backend.core.database import data_path
from backend.core.schema import initialize_database

class AuthenticationTest(unittest.TestCase):
    def setUp(self):
        self.client=m.app.test_client();authenticate(self)
        self.admin=self.client
        with sqlite3.connect(m.app.config['DATA_DB_PATH']) as c:
            c.executemany("INSERT INTO teams VALUES (?,?,1,'Garbage','Idle',NULL)",[('a','Alpha'),('b','Beta')])
            c.executemany("INSERT INTO maintenance_tasks (id,zone,type,status,assigned_team_id) VALUES (?,?,'Garbage','ON GROUND',?)",[('ta','Dharavi','a'),('tb','Andheri','b'),('ta2','Dharavi','a')])
        with m.app.app_context():
            self.worker_id=create_user('worker@example.test','Worker',PASSWORD,'worker',team_id='a',must_change_password=False)
            self.supervisor_id=create_user('supervisor@example.test','Supervisor',PASSWORD,'maintenance',must_change_password=False)
    def login(self,email='worker@example.test',password=PASSWORD):
        c=m.app.test_client();token=c.get('/api/auth/session').json['csrf_token']
        r=c.post('/api/auth/login',json={'email':email,'password':password},headers={'X-CSRF-Token':token})
        self.assertEqual(r.status_code,200,r.json);c.environ_base['HTTP_X_CSRF_TOKEN']=r.json['csrf_token'];return c
    def test_anonymous_and_role_spoof_are_denied(self):
        c=m.app.test_client();self.assertEqual(c.get('/api/dashboard',headers={'X-Role':'admin'}).status_code,401)
        c=self.login();self.assertEqual(c.get('/api/dashboard',headers={'X-Role':'admin'}).status_code,403)
        self.assertEqual(c.get('/api/auth/users').status_code,403)
    def test_team_scope_cannot_be_changed_by_request(self):
        c=self.login();self.assertEqual([t['id'] for t in c.get('/api/worker/teams').json],['a'])
        self.assertEqual({t['id'] for t in c.get('/api/worker/tasks').json},{'ta','ta2'})
        self.assertEqual(c.get('/api/worker/tasks?team_id=b').status_code,403)
        self.assertEqual(c.post('/api/worker/update-status',json={'task_id':'tb','status':'IN_PROGRESS'}).status_code,404)
    def test_csrf_and_origin_required_for_writes(self):
        for headers in ({'X-CSRF-Token':''},{'X-CSRF-Token':'é'*64},{'Origin':'https://evil.example'}):
            r=self.admin.post('/api/auth/teams',json={'id':'evil'},headers=headers);self.assertEqual(r.status_code,403)
        c=m.app.test_client();c.get('/api/auth/session');self.assertEqual(c.post('/api/auth/login',json={'email':'x','password':'x'}).status_code,403)
    def test_login_rotates_and_logout_revokes_session(self):
        c=m.app.test_client();d=c.get('/api/auth/session').json;old=c.get_cookie('nagarflow_session').value
        r=c.post('/api/auth/login',json={'email':'worker@example.test','password':PASSWORD},headers={'X-CSRF-Token':d['csrf_token']})
        new=c.get_cookie('nagarflow_session').value;self.assertNotEqual(old,new)
        self.assertIn('HttpOnly',r.headers['Set-Cookie']);self.assertIn('SameSite=Lax',r.headers['Set-Cookie'])
        c.post('/api/auth/logout',headers={'X-CSRF-Token':r.json['csrf_token']});c.set_cookie('nagarflow_session',new)
        self.assertEqual(c.get('/api/worker/tasks').status_code,401)
        c.set_cookie('nagarflow_session',old);self.assertEqual(c.get('/api/worker/tasks').status_code,401)
    def test_wrong_credentials_generic_and_rate_limited(self):
        c=m.app.test_client();token=c.get('/api/auth/session').json['csrf_token'];h={'X-CSRF-Token':token}
        errors=[]
        for email in ['missing@example.test','worker@example.test']:
            r=c.post('/api/auth/login',json={'email':email,'password':'wrong'},headers=h);self.assertEqual(r.status_code,401);errors.append(r.json)
        self.assertEqual(errors[0]['error'],errors[1]['error'])
        for _ in range(4):c.post('/api/auth/login',json={'email':'worker@example.test','password':'wrong'},headers=h)
        r=c.post('/api/auth/login',json={'email':'worker@example.test','password':PASSWORD},headers=h)
        self.assertEqual(r.status_code,429);self.assertIn('Retry-After',r.headers)
    def test_session_expires_for_idle_and_absolute_limit(self):
        for idle in (True,False):
            c=self.login()
            with m.app.app_context(),auth_connection() as db:
                db.execute('UPDATE auth_sessions SET '+('last_seen' if idle else 'expires_at')+'=? WHERE user_id=?',(now()-4000,self.worker_id))
            self.assertEqual(c.get('/api/worker/tasks').status_code,401)
    def test_suspend_revokes_sessions_and_last_admin_protected(self):
        c=self.login();r=self.admin.patch('/api/auth/users/'+self.worker_id,json={'active':False});self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(c.get('/api/worker/tasks').status_code,401)
        me=self.admin.get('/api/auth/session').json['user']['id']
        self.assertEqual(self.admin.patch('/api/auth/users/'+me,json={'active':False}).status_code,409)
    def test_password_reset_forces_change_and_revokes_all_sessions(self):
        c=self.login();other=self.login();new='Replacement temporary passphrase!'
        r=self.admin.post('/api/auth/users/'+self.worker_id+'/password',json={'new_password':new});self.assertEqual(r.status_code,200,r.json)
        for client in (c,other):self.assertEqual(client.get('/api/worker/tasks').status_code,401)
        c=self.login(password=new);r=c.get('/api/worker/tasks');self.assertEqual(r.status_code,403);self.assertEqual(r.json['code'],'password_change_required')
        r=c.post('/api/auth/password',json={'current_password':new,'new_password':'My permanent long passphrase!'});self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(c.get('/api/worker/tasks').status_code,401)
        self.assertEqual(self.login(password='My permanent long passphrase!').get('/api/worker/tasks').status_code,200)
    def test_municipality_read_write_and_accounts_are_isolated(self):
        with m.app.app_context():
            with auth_connection() as db:db.execute("INSERT INTO municipalities VALUES ('other','Other city',1)")
            g.municipality_id='other';initialize_database(data_path())
            create_user('other@example.test','Other admin',PASSWORD,'admin','other',must_change_password=False)
        other=self.login('other@example.test');self.assertEqual(other.get('/api/worker/tasks').json,[])
        self.assertEqual(other.post('/api/maintenance/complete',json={'task_id':'ta'}).status_code,404)
        self.assertEqual([u['email'] for u in other.get('/api/auth/users').json['users']],['other@example.test'])
        self.assertEqual(other.patch('/api/auth/users/'+self.worker_id,json={'active':False}).status_code,404)
        self.assertEqual(other.post('/api/auth/users',json={'municipality_id':'default'}).status_code,403)
    def test_completion_requires_bound_image_and_supervisor(self):
        c=self.login();img=io.BytesIO();Image.new('RGB',(2,2)).save(img,'PNG');img.seek(0)
        r=c.post('/api/worker/upload',data={'task_id':'ta','file':(img,'proof.png')});self.assertEqual(r.status_code,200,r.json);url=r.json['url']
        payload={'task_id':'ta2','status':'COMPLETED_UNVERIFIED','image_url':url}
        self.assertEqual(c.post('/api/worker/update-status',json=payload).status_code,400)
        payload['task_id']='ta';self.assertEqual(c.post('/api/worker/update-status',json=payload).status_code,200)
        self.assertEqual(c.post('/api/maintenance/complete',json={'task_id':'ta'}).status_code,403)
        response=c.get(url);self.assertEqual(response.status_code,200);response.close()
        supervisor=self.login('supervisor@example.test');self.assertEqual(supervisor.post('/api/maintenance/complete',json={'task_id':'ta'}).status_code,200)
    def test_other_team_cannot_download_evidence(self):
        c=self.login();img=io.BytesIO();Image.new('RGB',(2,2)).save(img,'PNG');img.seek(0)
        url=c.post('/api/worker/upload',data={'task_id':'ta','file':(img,'proof.png')}).json['url']
        with m.app.app_context():create_user('beta@example.test','Beta',PASSWORD,'worker',team_id='b',must_change_password=False)
        self.assertEqual(self.login('beta@example.test').get(url).status_code,404)
        self.assertEqual(m.app.test_client().get(url).status_code,401)
    def test_invalid_image_rejected(self):
        c=self.login();r=c.post('/api/worker/upload',data={'task_id':'ta','file':(io.BytesIO(b'<svg/>'),'fake.png')});self.assertEqual(r.status_code,400)
    def test_no_hashes_or_session_tokens_in_account_responses(self):
        body=self.admin.get('/api/auth/users').get_data(as_text=True)+self.admin.get('/api/auth/audit').get_data(as_text=True)
        self.assertNotIn('scrypt',body);self.assertNotIn('token_hash',body);self.assertNotIn(PASSWORD,body)
    def test_signed_webhooks_required_and_stable_receipts_replayed(self):
        c=m.app.test_client()
        with patch.dict(os.environ,{'NAGARFLOW_WEBHOOK_SECRET':''}):self.assertEqual(c.post('/api/image-complaint',json={}).status_code,503)
        body=b'{"file_id":"provider-file","caption":"Dharavi garbage"}';stamp=str(now());event='event-123'
        signature=hmac.new(b'test-gateway-secret',stamp.encode()+b'.'+event.encode()+b'.'+body,hashlib.sha256).hexdigest()
        headers={'X-Nagarflow-Timestamp':stamp,'X-Nagarflow-Event-ID':event,'X-Nagarflow-Signature':signature}
        with patch.dict(os.environ,{'NAGARFLOW_WEBHOOK_SECRET':'test-gateway-secret'}):
            self.assertEqual(c.post('/api/image-complaints',data=body,content_type='application/json').status_code,401)
            first=c.post('/api/image-complaints',data=body,content_type='application/json',headers=headers);self.assertEqual(first.status_code,202,first.json)
            second=c.post('/api/image-complaints',data=body,content_type='application/json',headers=headers);self.assertEqual(second.status_code,202);self.assertTrue(second.json['duplicate']);self.assertEqual(first.json['receipt_id'],second.json['receipt_id'])
    def test_production_cookie_is_secure_and_host_scoped(self):
        m.app.config['AUTH_COOKIE_SECURE']=True
        response=m.app.test_client().get('/api/auth/session',base_url='https://civic.example')
        cookie=response.headers['Set-Cookie']
        for expected in ['__Host-nagarflow_session=','Secure','HttpOnly','SameSite=Lax','Path=/']:self.assertIn(expected,cookie)
        self.assertNotIn('Domain=',cookie)
    def test_invalid_account_payloads_return_validation_errors(self):
        for data in [{'email':[]},{'role':[],'email':'valid@example.test','display_name':'Test','password':PASSWORD}]:
            self.assertEqual(self.admin.post('/api/auth/users',json=data).status_code,400)
        self.assertEqual(self.admin.patch('/api/auth/users/'+self.worker_id,json={'active':'false'}).status_code,400)
    def test_maintenance_reads_do_not_create_tasks(self):
        with sqlite3.connect(m.app.config['DATA_DB_PATH']) as db:
            db.execute("INSERT INTO predictions (zone,priority_score,category) VALUES ('Bandra',95,'Garbage')")
        self.admin.get('/api/maintenance/data')
        self.assertNotIn('Bandra',{t['zone'] for t in self.admin.get('/api/maintenance/data').json['tasks']})
        self.assertEqual(self.admin.post('/api/maintenance/generate').status_code,200)
        self.admin.post('/api/maintenance/generate')
        self.assertEqual(sum(t['zone']=='Bandra' for t in self.admin.get('/api/maintenance/data').json['tasks']),1)
    def test_team_reassignment_revokes_existing_worker_session(self):
        c=self.login();r=self.admin.patch('/api/auth/users/'+self.worker_id,json={'team_id':'b'});self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(c.get('/api/worker/tasks').status_code,401)
        self.assertEqual([t['id'] for t in self.login().get('/api/worker/tasks').json],['tb'])
