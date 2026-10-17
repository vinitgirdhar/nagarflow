"""Validated municipal operations without prototype KPI fabrication."""
import json
import math
import sqlite3
import uuid
from contextlib import closing
from dispatch_service import transaction,DispatchError,timestamp
from dispatch_contract import valid_coordinates
from fleet_manager import ZONE_COORDS
from prediction_store import fetch_canonical_predictions


def simulate(path,data):
    allowed={'demand','failures','weather','duration','zone_filter'}
    if not isinstance(data,dict) or set(data)-allowed:raise DispatchError('Invalid simulation parameters.')
    for name,low,high in [('demand',-100,200),('failures',0,100),('weather',0,4),('duration',1,72)]:
        value=data.get(name,24 if name=='duration' else 0)
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not low<=value<=high:raise DispatchError('Simulation parameters are outside supported ranges.')
    zone=data.get('zone_filter','all')
    if not isinstance(zone,str) or len(zone)>120:raise DispatchError('Invalid zone filter.')
    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory=sqlite3.Row;baseline=fetch_canonical_predictions(conn.cursor())
    if zone!='all':baseline=[row for row in baseline if row['zone']==zone]
    before=[{'zone':r['zone'],'priority_score':r['priority_score'],'category':r['category']} for r in baseline]
    multiplier=1+data.get('demand',0)/100
    weather=data.get('weather',0);failures=data.get('failures',0);duration=data.get('duration',24)
    after=[dict(row,priority_score=round(min(100,max(0,row['priority_score']*multiplier+(weather*4+failures*.1)*(duration/24))),2)) for row in before]
    return {'before':before,'after':after,'stats':{'overloaded':sum(r['priority_score']>=75 for r in after),'average_priority':round(sum(r['priority_score'] for r in after)/len(after),2) if after else None},
        'notice':'Deterministic what-if score adjustment only. It does not predict coverage, response time or missed deployments, and does not update operational data.'}


def create_vehicle(path,data,actor):
    if not isinstance(data,dict) or set(data)!={'name','truck_type','lat','lon'}:raise DispatchError('Supply vehicle name, type and verified coordinates.')
    name=data['name'];kind=data['truck_type']
    if not isinstance(name,str) or not 1<=len(name.strip())<=80 or kind not in ('water','garbage') or not valid_coordinates(data['lat'],data['lon']):raise DispatchError('Invalid name, service type or coordinates.')
    with transaction(path) as conn:
        if conn.execute('SELECT 1 FROM trucks WHERE lower(name)=lower(?)',(name.strip(),)).fetchone():raise DispatchError('Vehicle name already exists.','duplicate_vehicle',409)
        identifier=conn.execute("INSERT INTO trucks (name,status,lat,lon,truck_type) VALUES (?,'idle',?,?,?)",(name.strip(),data['lat'],data['lon'],kind)).lastrowid
        conn.execute('INSERT INTO operation_events (actor_id,event,target_id,created_at) VALUES (?,?,?,?)',(actor,'vehicle_created',str(identifier),timestamp()))
    return identifier


def create_task(path,data,actor):
    if not isinstance(data,dict) or set(data)-{'zone','type','priority','complaint_id'}:raise DispatchError('Invalid task fields.')
    zone,kind,priority=data.get('zone'),data.get('type'),data.get('priority')
    if not isinstance(zone,str) or zone not in ZONE_COORDS or kind not in ('Garbage','Water','Road','Drain','General') or priority not in ('LOW','MEDIUM','HIGH'):raise DispatchError('Choose a known zone, service type and priority.')
    complaint=data.get('complaint_id')
    if complaint=='':complaint=None
    if complaint is not None and (not isinstance(complaint,str) or len(complaint)>100):raise DispatchError('Invalid complaint reference.')
    identifier='T-'+uuid.uuid4().hex
    with transaction(path) as conn:
        if complaint and not conn.execute('SELECT 1 FROM complaints WHERE id=? AND zone=?',(complaint,zone)).fetchone():raise DispatchError('Complaint does not belong to this zone.','not_found',404)
        if complaint:
            existing=conn.execute("SELECT id FROM maintenance_tasks WHERE complaint_id=? AND status!='COMPLETED'",(complaint,)).fetchone()
            if existing:return existing['id']
        conn.execute("INSERT INTO maintenance_tasks (id,zone,type,priority,status,reported_time,complaint_id) VALUES (?,?,?,?,'PENDING',?,?)",(identifier,zone,kind,priority,timestamp(),complaint))
        conn.execute('INSERT INTO operation_events (actor_id,event,target_id,created_at) VALUES (?,?,?,?)',(actor,'task_created',identifier,timestamp()))
    return identifier


def weather(path):
    with closing(sqlite3.connect(path)) as conn:
        row=conn.execute("SELECT value FROM global_status WHERE key='weather_snapshot'").fetchone()
    try:snapshot=json.loads(row[0]) if row else None
    except (ValueError,TypeError):snapshot=None
    return {'snapshot':snapshot,'notice':'No weather observations are synthesized. A separately configured poller supplies provider observations; confirm freshness and location before acting.'}


def classify_complaint(path,identifier,data,actor):
    from privacy import redact
    fields={'zone','locality','issue_type','severity','revision'}
    if not isinstance(data,dict) or set(data)!=fields:raise DispatchError('Supply classification and current revision only.')
    if not isinstance(data['zone'],str) or data['zone'] not in ZONE_COORDS or not isinstance(data['locality'],str) or len(data['locality'])>200 or data['issue_type'] not in ('Garbage','Water','Roads','Drainage','Electricity','Other','General') or data['severity'] not in ('Low','Medium','High','Critical') or not isinstance(data['revision'],int) or isinstance(data['revision'],bool):raise DispatchError('Invalid complaint classification.')
    with transaction(path) as conn:
        row=conn.execute('SELECT revision FROM complaints WHERE id=?',(identifier,)).fetchone()
        if not row:raise DispatchError('Complaint not found.','not_found',404)
        if row['revision']!=data['revision']:raise DispatchError('Complaint changed. Reload before saving.','revision_conflict',409)
        conn.execute('UPDATE complaints SET zone=?,locality=?,issue_type=?,severity=?,revision=revision+1 WHERE id=?',(data['zone'],redact(data['locality']),data['issue_type'],data['severity'],identifier))
        for event in conn.execute("SELECT id,result_json FROM ingestion_events WHERE status='REVIEW' AND result_json LIKE ?",('%'+identifier+'%',)).fetchall():
            items=json.loads(event['result_json']);ready=True
            for item in items:
                record=conn.execute('SELECT zone,issue_type FROM complaints WHERE id=?',(item['complaint_id'],)).fetchone()
                if not record or record['zone'] not in ZONE_COORDS or record['issue_type']=='General':ready=False
            if ready:conn.execute("UPDATE ingestion_events SET status='COMPLETED' WHERE id=?",(event['id'],))
        conn.execute('INSERT INTO operation_events (actor_id,event,target_id,created_at) VALUES (?,?,?,?)',(actor,'complaint_classified',identifier,timestamp()))
