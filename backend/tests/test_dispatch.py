import datetime as dt
import sqlite3
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import backend.app as m
from backend.tests.auth_helpers import authenticate, PASSWORD
from backend.auth.service import auth_connection, create_user
from backend.core.database import data_path
from backend.operations.dispatch_contract import prediction_version
from backend.operations.dispatch import accept, finish, DispatchError
from flask import g
from backend.core.schema import initialize_database


class DispatchTest(unittest.TestCase):
    def setUp(self):
        self.client = m.app.test_client()
        authenticate(self)
        self.path = m.app.config['DATA_DB_PATH']
        with sqlite3.connect(self.path) as conn:
            conn.executemany("INSERT INTO trucks (id,name,status,lat,lon,truck_type) VALUES (?,?,'idle',19.04,72.85,?)",
                             [(1,'Truck Alpha','garbage'),(2,'Truck Beta','garbage'),(3,'Tanker Gamma','water')])
            conn.executemany("INSERT INTO predictions (zone,priority_score,category,action,reason,timestamp) VALUES (?,80,'General','Dispatch','Test need','2026-10-17')",
                             [('Dharavi',),('Bandra',),('Kurla',),('Andheri',)])
            conn.executemany("INSERT INTO complaints (id,zone,issue_type,complaint_count) VALUES (?,?,?,10)",
                             [('c1','Dharavi','Garbage'),('c2','Bandra','Garbage'),('c3','Kurla','Water'),('c4','Andheri','Drainage')])
        with sqlite3.connect(self.path) as conn:
            conn.execute("UPDATE predictions SET priority_score=70 WHERE zone!='Dharavi'")
        self.suggestion = next(s for s in self.client.get('/api/dispatch').json if s['zone']=='Dharavi')
        self.payload = {k:self.suggestion[k] for k in ('truck_id','zone','prediction_id','prediction_version')}
    def post(self,route,payload,key=None,client=None):
        return (client or self.client).post('/api/dispatch/'+route,json=payload,headers={'Idempotency-Key':key or uuid.uuid4().hex})
    def accepted(self):
        response=self.post('accept',self.payload);self.assertEqual(response.status_code,200,response.json);return response.json['dispatch']
    def query(self,sql,params=()):
        with sqlite3.connect(self.path) as conn:return conn.execute(sql,params).fetchall()
    def test_accept_is_durable_and_suggestions_exclude_the_zone(self):
        row=self.accepted();self.assertEqual(row['status'],'EN_ROUTE');self.assertEqual(row['predicted_score'],80)
        self.assertEqual(self.query('SELECT status FROM trucks WHERE id=?',(row['truck_id'],))[0][0],'en_route_to_Dharavi')
        self.assertNotIn('Dharavi',[s['zone'] for s in self.client.get('/api/dispatch').json])
        self.assertEqual(self.client.get('/api/dispatch/assignments').json['dispatches'][0]['id'],row['id'])
        self.assertEqual(self.query('SELECT event FROM dispatch_events'),[('accepted',)])
    def test_accept_retries_and_key_payload_conflicts(self):
        key=uuid.uuid4().hex;first=self.post('accept',self.payload,key);second=self.post('accept',self.payload,key)
        self.assertEqual(second.status_code,200);self.assertTrue(second.json['replayed']);self.assertEqual(first.json['dispatch']['id'],second.json['dispatch']['id'])
        self.assertEqual(self.post('accept',self.payload).json['dispatch']['id'],first.json['dispatch']['id'])
        self.assertEqual(self.post('accept',self.payload|{'truck_id':2},key).status_code,409)
        self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],1)
    def test_busy_truck_and_busy_zone_cannot_be_overwritten(self):
        row=self.accepted()
        other=next(s for s in self.client.get('/api/dispatch').json if s['zone']=='Bandra')
        payload={k:other[k] for k in self.payload};payload['truck_id']=row['truck_id']
        self.assertEqual(self.post('accept',payload).status_code,409)
        self.assertEqual(self.post('accept',self.payload|{'truck_id':2}).status_code,409)
        self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],1)
    def test_stale_version_in_place_edit_and_missing_vehicle_are_rejected(self):
        with sqlite3.connect(self.path) as conn:conn.execute("UPDATE predictions SET priority_score=90 WHERE zone='Dharavi'")
        self.assertEqual(self.post('accept',self.payload).json['code'],'stale_recommendation')
        self.assertEqual(self.post('accept',self.payload|{'truck_id':999}).status_code,404)
        self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],0)
    def test_invalid_types_missing_key_and_bad_fields_have_no_side_effects(self):
        for changes in [{'truck_id':True},{'truck_id':1.5},{'truck_id':[]},{'zone':{}},{'zone':' Unknown '},{'prediction_id':False},{'prediction_version':'é'*64},{'untrusted':'extra'}]:
            self.assertEqual(self.post('accept',self.payload|changes).status_code,400)
        self.assertEqual(self.client.post('/api/dispatch/accept',json=self.payload).status_code,400)
        self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],0)
    def test_only_compatible_vehicles_and_verified_coordinates_are_recommended(self):
        self.assertNotIn('Andheri',[s['zone'] for s in self.client.get('/api/dispatch').json])
        self.assertEqual(self.post('accept',self.payload|{'truck_id':3}).json['code'],'vehicle_type_conflict')
        with sqlite3.connect(self.path) as conn:conn.execute('UPDATE trucks SET lat=999 WHERE id=1')
        self.assertEqual(self.post('accept',self.payload).json['code'],'invalid_coordinates')
        self.assertNotIn(1,[s['truck_id'] for s in self.client.get('/api/dispatch').json])
    def test_arrival_without_observation_updates_destination_and_coverage_only_once(self):
        row=self.accepted();payload={'dispatch_id':row['id']}
        first=self.post('arrive',payload);second=self.post('arrive',payload)
        self.assertEqual(first.status_code,200,first.json);self.assertTrue(second.json['replayed'])
        self.assertEqual(first.json['dispatch']['arrived_at'],second.json['dispatch']['arrived_at'])
        self.assertEqual(self.query('SELECT status,lat,lon FROM trucks WHERE id=?',(row['truck_id'],)),[('idle',19.0408,72.8540)])
        self.assertEqual(self.query('SELECT count(*) FROM prediction_outcomes')[0][0],0)
        self.assertEqual(self.query('SELECT count(*) FROM zone_coverage')[0][0],1)
        self.assertEqual(self.query("SELECT count(*) FROM dispatch_events WHERE event='arrival_confirmed'")[0][0],1)
    def test_measured_arrival_uses_acceptance_snapshot_and_excludes_old_synthetic_data(self):
        row=self.accepted()
        with sqlite3.connect(self.path) as conn:
            conn.execute("UPDATE predictions SET priority_score=15 WHERE zone='Dharavi'")
            conn.execute('INSERT INTO prediction_outcomes (actual_demand,error_margin,is_simulated) VALUES (0,99,1)')
            conn.execute('INSERT INTO prediction_outcomes (actual_demand,error_margin,is_simulated) VALUES (0,88,0)')
        r=self.post('arrive',{'dispatch_id':row['id'],'actual_demand':65,'notes':'Operator observation'});self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(self.query('SELECT actual_demand,error_margin,predicted_score,is_simulated FROM prediction_outcomes WHERE dispatch_id=?',(row['id'],)),[(65,15,80,0)])
        report=self.client.get('/api/reports').json
        self.assertEqual(report['score_comparison']['observed_count'],1);self.assertEqual(report['score_comparison']['mean_absolute_error'],15)
        self.assertEqual(report['score_comparison']['excluded_legacy_or_simulated_count'],2)
        self.assertIsNone(report['kpis']['accuracy']);self.assertIsNone(report['kpis']['equity']);self.assertFalse(report['trigger_retrain'])
        self.assertEqual(report['kpis']['coverage'],25)
    def test_invalid_observations_and_wrong_legacy_arrival_shape_are_rejected(self):
        row=self.accepted()
        for value in [True,'10',[],{},-1,101,float('inf'),float('nan')]:
            self.assertEqual(self.post('arrive',{'dispatch_id':row['id'],'actual_demand':value}).status_code,400)
        self.assertEqual(self.post('arrive',{'truck_id':row['truck_id'],'zone':'Bandra'}).status_code,400)
        self.assertEqual(self.query('SELECT status FROM dispatches'),[('EN_ROUTE',)])
    def test_old_retries_never_release_a_new_assignment(self):
        row=self.accepted();accept_key=uuid.uuid4().hex;self.post('accept',self.payload,accept_key)
        arrive_key=uuid.uuid4().hex;self.post('arrive',{'dispatch_id':row['id']},arrive_key)
        other=next(s for s in self.client.get('/api/dispatch').json if s['zone']=='Bandra');payload={k:other[k] for k in self.payload};payload['truck_id']=row['truck_id']
        new=self.post('accept',payload);self.assertEqual(new.status_code,200,new.json)
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id']},arrive_key).status_code,200)
        self.assertEqual(self.post('accept',self.payload,accept_key).json['dispatch']['status'],'ARRIVED')
        self.assertEqual(self.query('SELECT status FROM trucks WHERE id=?',(row['truck_id'],))[0][0],'en_route_to_Bandra')
    def test_serviced_prediction_is_not_reoffered_until_it_changes(self):
        row=self.accepted();self.post('arrive',{'dispatch_id':row['id']})
        self.assertNotIn('Dharavi',[s['zone'] for s in self.client.get('/api/dispatch').json])
        self.assertEqual(self.post('accept',self.payload).json['code'],'recommendation_serviced')
        with sqlite3.connect(self.path) as conn:conn.execute("UPDATE predictions SET timestamp='2026-10-18' WHERE zone='Dharavi'")
        self.assertIn('Dharavi',[s['zone'] for s in self.client.get('/api/dispatch').json])
    def test_cancel_is_audited_and_never_marks_coverage_or_demand(self):
        row=self.accepted();data={'dispatch_id':row['id'],'reason':'Vehicle unavailable'}
        self.assertEqual(self.post('cancel',data).status_code,200);self.assertTrue(self.post('cancel',data).json['replayed'])
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id']}).status_code,409)
        self.assertEqual(self.query('SELECT count(*) FROM zone_coverage')[0][0],0)
        self.assertEqual(self.query('SELECT count(*) FROM prediction_outcomes')[0][0],0)
        self.assertEqual(self.query('SELECT status FROM trucks WHERE id=?',(row['truck_id'],))[0][0],'idle')
        self.assertEqual(self.post('accept',self.payload).status_code,200)
    def test_transaction_rolls_back_if_any_write_fails(self):
        row=self.accepted()
        with sqlite3.connect(self.path) as conn:conn.execute("CREATE TRIGGER break_outcomes BEFORE INSERT ON prediction_outcomes BEGIN SELECT RAISE(ABORT,'test failure'); END")
        with self.assertLogs(m.app.logger.name,level='ERROR'):
            response=self.post('arrive',{'dispatch_id':row['id'],'actual_demand':55})
        self.assertEqual(response.status_code,503)
        self.assertEqual(self.query('SELECT status FROM dispatches'),[('EN_ROUTE',)])
        self.assertEqual(self.query('SELECT count(*) FROM zone_coverage')[0][0],0)
        self.assertEqual(self.query('SELECT count(*) FROM dispatch_requests WHERE operation=\'arrive\'')[0][0],0)
        with sqlite3.connect(self.path) as conn:conn.execute('DROP TRIGGER break_outcomes')
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id'],'actual_demand':55}).status_code,200)
    def race(self,functions):
        gate=threading.Barrier(len(functions))
        def run(fn):
            gate.wait()
            try:return fn()
            except DispatchError as e:return e.code
        with ThreadPoolExecutor(max_workers=len(functions)) as pool:return list(pool.map(run,functions))
    def test_concurrent_acceptance_cannot_double_allocate_vehicle_or_zone(self):
        for kind in ['truck','zone']:
            with self.subTest(kind=kind):
                with sqlite3.connect(self.path) as conn:
                    conn.execute('DELETE FROM dispatch_requests');conn.execute('DELETE FROM dispatch_events');conn.execute('DELETE FROM dispatches');conn.execute("UPDATE trucks SET status='idle'")
                alternative=self.payload|{'truck_id':2}
                if kind=='truck':
                    bandra=next(s for s in self.client.get('/api/dispatch').json if s['zone']=='Bandra');alternative={k:bandra[k] for k in self.payload}|{'truck_id':self.payload['truck_id']}
                result=self.race([lambda:accept(self.path,self.payload,uuid.uuid4().hex,'actor'),lambda:accept(self.path,alternative,uuid.uuid4().hex,'actor')])
                self.assertEqual(sum(isinstance(r,dict) for r in result),1,result)
                self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],1)
    def test_concurrent_arrivals_record_one_observation(self):
        row=self.accepted();payload={'dispatch_id':row['id'],'actual_demand':40}
        result=self.race([lambda:finish(self.path,payload,uuid.uuid4().hex,'actor') for _ in range(2)])
        self.assertTrue(all(isinstance(r,dict) for r in result),result)
        self.assertEqual(self.query('SELECT count(*) FROM prediction_outcomes')[0][0],1)
    def test_municipality_and_role_boundaries_cover_all_dispatch_writes(self):
        row=self.accepted()
        with m.app.app_context():
            with auth_connection() as db:db.execute("INSERT INTO municipalities VALUES ('other','Other',1)")
            g.municipality_id='other';initialize_database(data_path());create_user('other@test.example','Other administrator',PASSWORD,'admin','other',must_change_password=False)
            g.municipality_id='default';create_user('supervisor@test.example','Supervisor',PASSWORD,'maintenance',must_change_password=False)
        for email in ['other@test.example','supervisor@test.example']:
            client=m.app.test_client();token=client.get('/api/auth/session').json['csrf_token'];r=client.post('/api/auth/login',json={'email':email,'password':PASSWORD},headers={'X-CSRF-Token':token});client.environ_base['HTTP_X_CSRF_TOKEN']=r.json['csrf_token']
            expected=404 if email.startswith('other') else 403
            self.assertEqual(self.post('arrive',{'dispatch_id':row['id']},client=client).status_code,expected)
        self.assertEqual(self.query('SELECT status FROM dispatches'),[('EN_ROUTE',)])
    def test_legacy_routes_are_migrated_once_without_fabricated_history(self):
        with sqlite3.connect(self.path) as conn:conn.execute("UPDATE trucks SET status='en_route_to_Dharavi' WHERE id=1")
        initialize_database(self.path);initialize_database(self.path)
        row=self.client.get('/api/dispatch/assignments').json['dispatches'][0]
        self.assertEqual(row['is_legacy'],1);self.assertIsNone(row['accepted_at']);self.assertIsNone(row['predicted_score'])
        self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],1)
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id'],'actual_demand':60}).status_code,200)
        self.assertEqual(self.query('SELECT count(*) FROM prediction_outcomes')[0][0],0)
    def test_reports_never_invent_trends_or_reuse_seeded_coverage(self):
        with sqlite3.connect(self.path) as conn:conn.execute("INSERT INTO zone_coverage (zone,last_visited,status) VALUES ('Dharavi',?,'OK')",(dt.datetime.now(dt.timezone.utc).isoformat(),))
        report=self.client.get('/api/reports').json
        self.assertEqual(report['kpis']['coverage'],0);self.assertEqual(report['score_comparison']['observed_count'],0)
        self.assertTrue(all(day['mean_absolute_error'] is None and day['sample_count']==0 for day in report['daily_score_comparison']))
        self.assertFalse(report['chart_data']['accuracy_trend'])
    def test_concurrent_cancel_and_arrival_have_one_terminal_state(self):
        row=self.accepted()
        results=self.race([lambda:finish(self.path,{'dispatch_id':row['id'],'actual_demand':20},uuid.uuid4().hex,'actor'),lambda:finish(self.path,{'dispatch_id':row['id'],'reason':'Stop assignment'},uuid.uuid4().hex,'actor',cancel=True)])
        self.assertEqual(sum(isinstance(result,dict) for result in results),1,results)
        state=self.query('SELECT status FROM dispatches')[0][0]
        self.assertEqual(self.query('SELECT count(*) FROM prediction_outcomes')[0][0],1 if state=='ARRIVED' else 0)
        self.assertEqual(self.query('SELECT status FROM trucks WHERE id=?',(row['truck_id'],))[0][0],'idle')
    def test_same_key_concurrent_acceptance_records_one_assignment_and_event(self):
        key=uuid.uuid4().hex
        results=self.race([lambda:accept(self.path,self.payload,key,'actor') for _ in range(2)])
        self.assertTrue(all(isinstance(result,dict) for result in results),results)
        self.assertEqual(self.query('SELECT count(*) FROM dispatch_requests')[0][0],1)
        self.assertEqual(self.query('SELECT count(*) FROM dispatch_events')[0][0],1)
    def test_completed_observation_cannot_be_silently_changed_by_retry(self):
        row=self.accepted();key=uuid.uuid4().hex
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id'],'actual_demand':20},key).status_code,200)
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id'],'actual_demand':30},key).json['code'],'idempotency_conflict')
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id'],'actual_demand':30}).json['code'],'completion_conflict')
        self.assertEqual(self.query('SELECT actual_demand FROM prediction_outcomes'),[(20,)])
    def test_unknown_zone_and_unsupported_service_are_not_dispatchable(self):
        from backend.core.predictions import fetch_canonical_predictions
        with sqlite3.connect(self.path) as conn:
            conn.execute("INSERT INTO predictions (zone,priority_score) VALUES ('Unknown district',50)")
            conn.row_factory=sqlite3.Row
            entries=fetch_canonical_predictions(conn.cursor())
        for zone in ['Unknown district','Andheri']:
            prediction=next(p for p in entries if p['zone']==zone)
            payload={'truck_id':1,'zone':zone,'prediction_id':prediction['id'],'prediction_version':prediction_version(prediction)}
            self.assertEqual(self.post('accept',payload).status_code,409)
        self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],0)
    def test_coverage_uses_48_hour_window_and_unobserved_days_are_null(self):
        row=self.accepted();self.post('arrive',{'dispatch_id':row['id'],'actual_demand':20})
        old=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=49)).isoformat()
        with sqlite3.connect(self.path) as conn:conn.execute('UPDATE dispatches SET arrived_at=?',(old,))
        report=self.client.get('/api/reports').json
        self.assertEqual(report['kpis']['coverage'],0)
        self.assertEqual(sum(day['sample_count'] for day in report['daily_score_comparison']),1)
        self.assertTrue(any(day['mean_absolute_error'] is None for day in report['daily_score_comparison']))
    def test_busy_legacy_route_without_destination_can_only_be_cancelled(self):
        with sqlite3.connect(self.path) as conn:conn.execute("UPDATE trucks SET status='en_route_to_Missing zone' WHERE id=1")
        initialize_database(self.path);row=self.client.get('/api/dispatch/assignments').json['dispatches'][0]
        self.assertEqual(self.post('arrive',{'dispatch_id':row['id']}).json['code'],'invalid_coordinates')
        self.assertEqual(self.post('cancel',{'dispatch_id':row['id'],'reason':'Correct unknown destination'}).status_code,200)
    def test_hotspots_handle_missing_localities_without_breaking_fleet_views(self):
        response=self.client.get('/api/hotspots');self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.json),4)
        self.assertTrue(all(item['locality']=='Unspecified locality' for item in response.json))
    def test_demo_mutations_are_disabled(self):
        self.assertEqual(self.client.post('/api/simulate-surge').status_code,403)
        self.assertEqual(self.query("SELECT priority_score FROM predictions WHERE zone='Dharavi'")[0][0],80)
    def test_accept_rolls_back_when_request_or_audit_writes_fail(self):
        for table in ['dispatch_requests','dispatch_events']:
            with self.subTest(table=table):
                with sqlite3.connect(self.path) as conn:conn.execute(f"CREATE TRIGGER break_accept BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'test failure'); END")
                with self.assertLogs(m.app.logger.name,level='ERROR'):
                    response=self.post('accept',self.payload)
                self.assertEqual(response.status_code,503)
                self.assertEqual(self.query('SELECT count(*) FROM dispatches')[0][0],0)
                self.assertEqual(self.query('SELECT count(*) FROM dispatch_requests')[0][0],0)
                self.assertEqual(self.query('SELECT status FROM trucks WHERE id=?',(self.payload['truck_id'],))[0][0],'idle')
                with sqlite3.connect(self.path) as conn:conn.execute('DROP TRIGGER break_accept')
    def test_unsupported_high_priority_work_does_not_hide_eligible_fleet_suggestions(self):
        with sqlite3.connect(self.path) as conn:
            for number,zone in enumerate(['Airoli','Colaba','Fort','Churchgate','CST','Thane']):
                conn.execute("INSERT INTO predictions (zone,priority_score,category) VALUES (?,95,'Roads')",(zone,))
                conn.execute("INSERT INTO complaints (id,zone,issue_type,complaint_count) VALUES (?,?,'Roads',10)",('road-'+str(number),zone))
        suggestions=self.client.get('/api/dispatch').json
        self.assertIn('Dharavi',[item['zone'] for item in suggestions])
        self.assertTrue(all(item['zone'] in ['Dharavi','Bandra','Kurla'] for item in suggestions))
    def test_observation_corrections_are_versioned_audited_and_idempotent(self):
        row=self.accepted();self.post('arrive',{'dispatch_id':row['id'],'actual_demand':20})
        payload={'dispatch_id':row['id'],'expected_revision':0,'actual_demand':55,'reason':'Corrected from the field record'};key=uuid.uuid4().hex
        first=self.post('observation',payload,key);self.assertEqual(first.status_code,200,first.json)
        self.assertEqual(self.post('observation',payload,key).status_code,200)
        self.assertEqual(self.post('observation',payload).json['code'],'revision_conflict')
        self.assertEqual(self.query('SELECT previous_value,new_value,revision FROM observation_corrections'),[(20,55,1)])
        self.assertEqual(self.query('SELECT actual_demand,error_margin FROM prediction_outcomes'),[(55,25)])
        self.assertEqual(self.post('observation',payload|{'expected_revision':1,'actual_demand':None}).status_code,200)
        self.assertEqual(self.query('SELECT count(*) FROM prediction_outcomes')[0][0],0)
        self.assertEqual(self.query('SELECT status FROM trucks WHERE id=?',(row['truck_id'],))[0][0],'idle')
