"""Isolated synthetic browser fixture; never imported by application startup."""
import sys
import tempfile
import sqlite3
import datetime as dt
from pathlib import Path
from backend.app import app
from backend.auth.service import create_user
from backend.core.schema import initialize_database
with tempfile.TemporaryDirectory(prefix='nagarflow-browser-') as directory:
    root=Path(directory);db=root/'data.db';initialize_database(db)
    app.config.update(AUTH_DB_PATH=str(root/'auth.db'),DATA_DB_PATH=str(db),TENANT_DATA_DIR=str(root/'tenants'),AUTH_COOKIE_SECURE=False,AUTH_TRUSTED_ORIGINS={'http://127.0.0.1:3002'},AUTH_MFA_ENABLED=False,AUTH_DEMO_ENABLED=True)
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO teams VALUES ('test-team','Test team',2,'Garbage','Idle',NULL)")
        conn.execute("INSERT INTO maintenance_tasks (id,zone,type,priority,status,assigned_team_id) VALUES ('test-task','Dharavi','Garbage','High','ON GROUND','test-team')")
        conn.executemany("INSERT INTO trucks (id,name,status,lat,lon,truck_type) VALUES (?,?,'idle',?,?,?)",[(1,'Fleet Alpha',19.0408,72.854,'garbage'),(2,'Fleet Beta',19.0544,72.8402,'garbage'),(3,'Fleet Tanker',19.0726,72.8795,'water')])
        conn.executemany("INSERT INTO predictions (id,zone,priority_score,category,action,reason,timestamp) VALUES (?,?,?,'General','Dispatch','Browser fixture need','2026-10-17')",[(1,'Dharavi',90),(2,'Bandra',80),(3,'Kurla',70)])
        conn.executemany("INSERT INTO complaints (id,zone,issue_type,complaint_count) VALUES (?,?,?,10)",[('fleet-c1','Dharavi','Garbage'),('fleet-c2','Bandra','Garbage'),('fleet-c3','Kurla','Water')])
        conn.execute("INSERT INTO teams VALUES ('flow-team','Flow team',2,'Garbage','Idle',NULL)")
        conn.execute("INSERT INTO maintenance_tasks (id,zone,type,priority,status) VALUES ('handoff-task','Nerul','Garbage','High','PENDING')")
        conn.execute("UPDATE maintenance_tasks SET reported_time=CURRENT_TIMESTAMP")
        cutoff=dt.datetime.now(dt.timezone.utc).date()-dt.timedelta(days=1)
        for day in range(42):
            conn.execute('INSERT INTO complaints (id,zone,issue_type,complaint_count,timestamp,description) VALUES (?,?,?,?,?,?)',('forecast-'+str(day),'Powai','Garbage',[8,12,10,15,20,4,2][day%7],(cutoff-dt.timedelta(days=41-day)).isoformat(),'Synthetic historical browser fixture'))
    with app.app_context():
        for role in ['admin','maintenance','worker']:
            create_user(role+'@example.test',role,'Synthetic browser passphrase!',role,team_id='test-team' if role=='worker' else None,must_change_password=False)
        create_user('security@example.test','Security tester','Synthetic browser passphrase!','admin',must_change_password=False)
        create_user('flow@example.test','Flow worker','Synthetic browser passphrase!','worker',team_id='flow-team',must_change_password=False)
        create_user('temporary@example.test','New operator','Synthetic browser passphrase!','maintenance')
    from backend.auth.prototype import provision
    provision(app)
    app.run(host='127.0.0.1',port=5002,debug=False,use_reloader=False)
