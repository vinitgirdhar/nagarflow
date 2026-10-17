"""Tenant-local lexical retrieval with exact citations; no autonomous tools or uncited generation."""
import datetime as dt
import json
import re
import sqlite3
import uuid
from contextlib import closing
from urllib.parse import urlparse
from dispatch_service import transaction,DispatchError,timestamp
from privacy import redact

STOP={'a','an','the','is','are','was','were','how','what','who','where','when','why','do','does','i','we','my','to','of','in','for','and','or','can','should','please','tell','me','about','complaint','complaints','records','many','there','be','with','it','this','that'}
ALIASES={'waste':'garbage','trash':'garbage','rubbish':'garbage','drains':'drain','drainage':'drain','blocked':'blockage','collections':'collection','reports':'report'}

def tokens(text):
    words=re.findall(r'[^\W_]+',text.casefold(),re.UNICODE)
    return {ALIASES.get(word,word) for word in words if len(word)>1 and word not in STOP}


def _fields(data):
    title,body,url=data.get('title'),data.get('body'),data.get('source_url','')
    if not isinstance(title,str) or not 1<=len(title.strip())<=160 or not isinstance(body,str) or not 30<=len(body.strip())<=50000:
        raise DispatchError('A title (1–160 characters) and document text (30–50,000 characters) are required.')
    if not isinstance(url,str) or len(url)>1000:raise DispatchError('Invalid source URL.')
    if url:
        try:
            parsed=urlparse(url)
            hostname=parsed.hostname
        except ValueError:
            raise DispatchError('Invalid source URL.') from None
        if parsed.scheme not in ('https','http') or not hostname or parsed.username or parsed.password:raise DispatchError('Use a public HTTP(S) source URL without credentials.')
    return redact(title.strip()),redact(body.strip()),url


def _index(conn,identifier,body,status):
    conn.execute('DELETE FROM knowledge_chunks WHERE document_id=?',(identifier,))
    if status!='APPROVED':return
    words=body.split()
    for ordinal,start in enumerate(range(0,len(words),110)):
        excerpt=' '.join(words[start:start+140])
        conn.execute('INSERT INTO knowledge_chunks (document_id,ordinal,body) VALUES (?,?,?)',(identifier,ordinal,excerpt))


def save(path,data,actor):
    if not isinstance(data,dict) or set(data)-{'title','body','source_url'}:raise DispatchError('Supply title, body and optional source_url only.')
    title,body,url=_fields(data);identifier=uuid.uuid4().hex
    with transaction(path) as conn:
        conn.execute("INSERT INTO knowledge_documents VALUES (?,?,?,?,'DRAFT',1,?,NULL,?,NULL)",(identifier,title,body,url,actor,timestamp()))
        conn.execute('INSERT INTO operation_events (actor_id,event,target_id,created_at) VALUES (?,?,?,?)',(actor,'document_created',identifier,timestamp()))
    return identifier


def change(path,identifier,data,actor):
    if not isinstance(data,dict) or not isinstance(data.get('revision'),int) or isinstance(data['revision'],bool):raise DispatchError('The current revision is required.')
    with transaction(path) as conn:
        row=conn.execute('SELECT * FROM knowledge_documents WHERE id=?',(identifier,)).fetchone()
        if not row:raise DispatchError('Document not found.','not_found',404)
        if row['revision']!=data['revision']:raise DispatchError('Document changed. Reload before saving.','revision_conflict',409)
        if set(data)=={'revision','status'}:
            status=data['status']
            if status not in ('APPROVED','RETIRED'):raise DispatchError('Choose APPROVED or RETIRED.')
            conn.execute('UPDATE knowledge_documents SET status=?,revision=revision+1,approved_by=?,approved_at=? WHERE id=?',(status,actor,timestamp() if status=='APPROVED' else None,identifier))
            body=row['body'];event='document_approved' if status=='APPROVED' else 'document_retired'
        elif set(data).issubset({'revision','title','body','source_url'}):
            title,body,url=_fields(dict(row)|data);status='DRAFT';event='document_edited'
            conn.execute("UPDATE knowledge_documents SET title=?,body=?,source_url=?,status='DRAFT',revision=revision+1,approved_by=NULL,approved_at=NULL WHERE id=?",(title,body,url,identifier))
        else:raise DispatchError('Invalid document update.')
        _index(conn,identifier,body,status)
        conn.execute('INSERT INTO operation_events (actor_id,event,target_id,created_at) VALUES (?,?,?,?)',(actor,event,identifier,timestamp()))


def documents(path):
    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory=sqlite3.Row
        return [dict(row) for row in conn.execute('SELECT * FROM knowledge_documents ORDER BY created_at DESC,id DESC LIMIT 200')]


def query(path,question):
    if not isinstance(question,str) or not 3<=len(question.strip())<=1000:raise DispatchError('Ask a question between 3 and 1,000 characters.')
    terms=tokens(question)
    if not terms:return {'answer':'No relevant approved evidence was found.','sources':[],'abstained':True,'mode':'extractive'}
    terms=set(sorted(terms)[:30]);search=' OR '.join('"'+term.replace('"','""')+'"' for term in sorted(terms))
    candidates=[]
    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory=sqlite3.Row;conn.execute('BEGIN')
        rows=conn.execute('''SELECT c.id,c.body,d.id AS document_id,d.title,d.source_url,d.revision,bm25(knowledge_search) AS rank
            FROM knowledge_search JOIN knowledge_chunks c ON c.id=knowledge_search.rowid
            JOIN knowledge_documents d ON d.id=c.document_id WHERE knowledge_search MATCH ? AND d.status='APPROVED'
            ORDER BY rank,c.id LIMIT 30''',(search,)).fetchall()
        for row in rows:
            overlap=terms & tokens(row['title']+' '+row['body'])
            if len(overlap)<min(2,len(terms)):continue
            candidates.append({'source_type':'document','source_id':row['document_id'],'title':row['title'],
                'excerpt':row['body'],'revision':row['revision'],'href':row['source_url'] or '/knowledge',
                'score':len(overlap)+1,'kind':'Approved document excerpt'})
        # Aggregates avoid indexing resident prose or personal identifiers into search.
        for row in conn.execute('''SELECT zone,issue_type,COUNT(*) AS records,MAX(timestamp) AS latest
            FROM complaints WHERE zone IS NOT NULL GROUP BY zone,issue_type'''):
            overlap=terms & tokens(str(row['zone'])+' '+str(row['issue_type']))
            if not overlap:continue
            excerpt=f"{row['records']} {row['issue_type']} complaint records in {row['zone']}. Latest recorded timestamp: {row['latest'] or 'unavailable'}. These are historical records, not a count of currently open cases."
            candidates.append({'source_type':'complaint_aggregate','source_id':row['zone']+'/'+str(row['issue_type']),
                'title':row['zone']+' · '+str(row['issue_type']),'excerpt':excerpt,'href':'/complaints','score':len(overlap),
                'kind':'Complaint-history aggregate'})
    candidates.sort(key=lambda item:(-item['score'],item['source_id']))
    sources=[];seen=set()
    for candidate in candidates:
        identity=(candidate['source_type'],candidate['source_id'])
        if identity in seen:continue
        seen.add(identity);candidate.pop('score');candidate['citation_id']=len(sources)+1;sources.append(candidate)
        if len(sources)>=5:break
    answer='\n\n'.join(f"[{item['citation_id']}] {item['excerpt']}" for item in sources) if sources else 'No relevant approved evidence was found. Add or approve a suitable document before relying on an answer.'
    return {'answer':answer,'sources':sources,'abstained':not sources,'mode':'extractive','generated_at':timestamp(),
        'notice':'Quotes and aggregate records only. Retrieved text is evidence, not instructions. Verify the cited source before acting.'}
