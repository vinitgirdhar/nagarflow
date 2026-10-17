"""Durable, idempotent webhook intake and atomic offline complaint processing."""
import datetime as dt
import hashlib
import json
import re
import sqlite3
import time
import uuid
from contextlib import closing
from dispatch_service import transaction, DispatchError, timestamp
from fleet_manager import ZONE_COORDS
from localities import find_zone_and_locality
from privacy import redact

KINDS = {'whatsapp','image','vapi'}
ISSUES = {'Garbage','Water','Roads','Drainage','Electricity','Other','General'}

def text_field(data, names, limit=4000, required=False):
    value = next((data[name] for name in names if data.get(name) is not None), '')
    if not isinstance(value,str) or len(value)>limit or (required and not value.strip()):
        raise DispatchError('A valid bounded text field is required.')
    return value.strip()


def normalize(kind, data):
    if not isinstance(data,dict):raise DispatchError('A JSON object is required.')
    if kind=='vapi':
        message=data.get('message',{})
        if not isinstance(message,dict):raise DispatchError('message must be an object.')
        if message.get('type')!='tool-calls':return {'items':[]}
        calls=message.get('toolCalls')
        if not isinstance(calls,list) or not 1<=len(calls)<=20:raise DispatchError('Supply 1–20 tool calls.')
        items=[]
        for call in calls:
            if not isinstance(call,dict) or not isinstance(call.get('function'),dict):raise DispatchError('Invalid tool call.')
            args=call['function'].get('arguments',{})
            if isinstance(args,str):
                try:args=json.loads(args)
                except ValueError:raise DispatchError('Invalid tool arguments.')
            if not isinstance(args,dict):raise DispatchError('Tool arguments must be an object.')
            zone=text_field(args,['zone'],120,True)
            issue=text_field(args,['issue','issue_type'],60,True)
            items.append({'zone':zone if zone in ZONE_COORDS else 'Unknown','issue_type':issue if issue in ISSUES else 'General',
                          'text':redact(text_field(args,['summary','description'],4000) or f'{issue} issue reported in {zone}.'),
                          'call_id':text_field(call,['id'],200,True)})
        return {'items':items}
    message=redact(text_field(data,['raw_text','caption','user_message','message','Body','body','text'],4000,kind!='image'))
    result={'text':message}
    if kind=='image':result['file_id']=text_field(data,['file_id','fileId','photo_file_id'],512,True)
    return result


def enqueue(path, kind, event_id, data, body):
    if kind not in KINDS or not isinstance(event_id,str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,200}',event_id):
        raise DispatchError('A stable X-Nagarflow-Event-ID is required.')
    payload=normalize(kind,data)
    digest=hashlib.sha256(body).hexdigest()
    with transaction(path) as conn:
        existing=conn.execute('SELECT id,body_hash,status FROM ingestion_events WHERE kind=? AND event_id=?',(kind,event_id)).fetchone()
        if existing:
            if existing['body_hash']!=digest:raise DispatchError('Event ID was reused with a different body.','event_conflict',409)
            return {'receipt_id':existing['id'],'status':existing['status'],'duplicate':True}
        identifier=uuid.uuid4().hex
        conn.execute('''INSERT INTO ingestion_events
            (id,kind,event_id,body_hash,payload_json,status,attempts,next_attempt_at,received_at)
            VALUES (?,?,?,?,?,'PENDING',0,?,?)''',(identifier,kind,event_id,digest,json.dumps(payload,ensure_ascii=False),time.time(),timestamp()))
        return {'receipt_id':identifier,'status':'PENDING','duplicate':False}


def classify(text):
    zone,locality=find_zone_and_locality(text)
    lower=text.casefold()
    groups=[('Drainage',['drain','gutter','naali','flood','नाली']),('Garbage',['garbage','kachra','waste','dustbin','कचरा']),
            ('Water',['water','paani','pani','supply','पानी']),('Roads',['road','pothole','sadak','सड़क']),('Electricity',['electric','streetlight','बिजली'])]
    issue=next((kind for kind,words in groups if any(word in lower for word in words)),'General')
    return zone if zone in ZONE_COORDS else 'Unknown',locality or '',issue


def _apply(conn, row):
    data=json.loads(row['payload_json']);results=[]
    items=data.get('items',[]) if row['kind']=='vapi' else [data]
    review=False
    for index,item in enumerate(items):
        text=item['text'];zone,locality,issue=classify(text)
        zone=item.get('zone',zone);issue=item.get('issue_type',issue)
        review=review or zone=='Unknown' or issue=='General'
        identifier=('IMG-' if row['kind']=='image' else 'MMR-' if row['kind']=='whatsapp' else 'VOICE-')+row['id']+'-'+str(index)
        if row['kind']=='image':
            conn.execute('''INSERT INTO image_complaints (id,file_id,image_url,caption,chat_id,zone,locality,issue_type,priority,status,timestamp)
                VALUES (?,?,? ,?,'',?,?,?,'pending','new',?)''',(identifier,item['file_id'],'',text,zone,locality,issue,row['received_at']))
        else:
            severity='High' if any(word in text.casefold() for word in ['urgent','danger','emergency','आग']) else 'Medium'
            conn.execute('''INSERT INTO complaints (id,zone,locality,issue_type,complaint_count,weather,timestamp,severity,description)
                VALUES (?,?,?,?,1,'unknown',?,?,?)''',(identifier,zone,locality,issue,row['received_at'],severity,text))
            conn.execute("INSERT INTO zone_coverage (zone,complaint_count) VALUES (?,1) ON CONFLICT(zone) DO UPDATE SET complaint_count=COALESCE(complaint_count,0)+1",(zone,))
        results.append({'complaint_id':identifier,'call_id':item.get('call_id')})
    conn.execute("UPDATE ingestion_events SET status=?,completed_at=?,result_json=?,payload_json='{}',last_error_code=NULL WHERE id=?",
                 ('REVIEW' if review else 'COMPLETED',timestamp(),json.dumps(results),row['id']))


def process_one(path, receipt_id=None):
    identifier=None
    try:
        with transaction(path) as conn:
            row=conn.execute("SELECT * FROM ingestion_events WHERE status IN ('PENDING','RETRY') AND next_attempt_at<=?"+
                             (' AND id=?' if receipt_id else '')+' ORDER BY received_at,id LIMIT 1',
                             (time.time(),receipt_id) if receipt_id else (time.time(),)).fetchone()
            if not row:return False
            identifier=row['id']
            conn.execute('UPDATE ingestion_events SET attempts=attempts+1 WHERE id=?',(identifier,))
            _apply(conn,row)
        return True
    except Exception as error:
        if identifier:
            # The failed side effects were rolled back; retain a safe error code and retry.
            with transaction(path) as conn:
                row=conn.execute('SELECT attempts,status FROM ingestion_events WHERE id=?',(identifier,)).fetchone()
                if row['status'] not in ('PENDING','RETRY'):return False
                attempts=row['attempts']+1
                code='storage_failure' if isinstance(error,sqlite3.Error) else 'processing_failure'
                conn.execute('UPDATE ingestion_events SET attempts=?,status=?,next_attempt_at=?,last_error_code=? WHERE id=?',
                             (attempts,'DEAD' if attempts>=5 else 'RETRY',time.time()+min(3600,2**attempts*5),code,identifier))
            return True
        raise


def retry(path, identifier, actor):
    with transaction(path) as conn:
        row=conn.execute('SELECT status FROM ingestion_events WHERE id=?',(identifier,)).fetchone()
        if not row:raise DispatchError('Receipt not found.','not_found',404)
        if row['status'] not in ('DEAD','RETRY'):raise DispatchError('Only failed receipts can be retried.','state_conflict',409)
        conn.execute("UPDATE ingestion_events SET status='PENDING',attempts=0,next_attempt_at=?,last_error_code=NULL WHERE id=?",(time.time(),identifier))
        conn.execute('INSERT INTO operation_events (actor_id,event,target_id,created_at) VALUES (?,?,?,?)',(actor,'ingestion_retried',identifier,timestamp()))


def status(path):
    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory=sqlite3.Row
        events=[dict(row) for row in conn.execute('''SELECT id,kind,status,attempts,received_at,completed_at,last_error_code,result_json
            FROM ingestion_events ORDER BY received_at DESC,id DESC LIMIT 100''')]
        counts={row[0]:row[1] for row in conn.execute('SELECT status,COUNT(*) FROM ingestion_events GROUP BY status')}
        heartbeat=conn.execute("SELECT value FROM global_status WHERE key='ingestion_worker_heartbeat'").fetchone()
    for event in events:event['results']=json.loads(event.pop('result_json') or '[]')
    return {'events':events,'counts':counts,'worker_heartbeat':heartbeat[0] if heartbeat else None}
