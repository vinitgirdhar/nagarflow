"""Reproducible offline evaluation using synthetic fixtures and the bundled historical dataset."""
from backend.core.paths import PROJECT_ROOT
import argparse
import csv
import hashlib
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path
from backend.core.schema import initialize_database
from backend.operations.dispatch import transaction
from backend.intelligence.knowledge import save,change,query
from backend.intelligence.forecasting import forecast
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',default='.cache/intelligence-evaluation.json');args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='nagarflow-evaluation-') as directory:
    path=str(Path(directory)/'evaluation.db');initialize_database(path)
    docs=[('Sanitation reporting','Report a missed garbage collection to the sanitation desk. Include the collection date and municipal zone.'),('Drain inspection','Blocked drains require drainage crew inspection. Keep the location clear and record the blockage for the maintenance supervisor.'),('Water reporting','Water supply interruptions should be reported to the water department with the zone and incident date.')]
    ids=[]
    for title,body in docs:
        identifier=save(path,{'title':title,'body':body},'synthetic-evaluator');change(path,identifier,{'revision':1,'status':'APPROVED'},'synthetic-evaluator');ids.append(identifier)
    cases=[('How do I report missed garbage collection?',ids[0]),('Who inspects blocked drains?',ids[1]),('Where are water supply interruptions reported?',ids[2]),('What is the private authentication secret?',None),('Explain planetary orbital mechanics',None)]
    results=[]
    for question,expected in cases:
        answer=query(path,question);hit=answer['abstained'] if expected is None else bool(answer['sources']) and answer['sources'][0]['source_id']==expected
        results.append({'question':question,'expected': 'abstain' if expected is None else 'document','passed':hit})
    dataset=PROJECT_ROOT/'data/mmr_311_complaints_50k.csv';last=None
    with dataset.open() as stream,transaction(path) as conn:
        reader=csv.DictReader(stream)
        for row in reader:
            conn.execute('INSERT INTO complaints (id,zone,timestamp,complaint_count,issue_type) VALUES (?,?,?,?,?)',(row['Complaint_ID'],row['Area'],row['Timestamp'],int(row['Complaint_Count']),row['Complaint_Type']))
            last=max(last,row['Timestamp'][:10]) if last else row['Timestamp'][:10]
    report=forecast(path,last);available=[z for z in report['zones'] if z['status']=='AVAILABLE'];models=Counter(z['selected_model'] for z in available)
    metrics={}
    for model in ['weekly_seasonal_naive','seven_day_mean','ridge_lag_regression']:
        values=[item['mae'] for z in available for item in z['evaluation'] if item['model']==model]
        metrics[model]={'mean_zone_mae':round(sum(values)/len(values),3) if values else None,'zones':len(values)}
    result={'retrieval':{'synthetic_cases':results,'passed':sum(r['passed'] for r in results),'total':len(results)},
            'forecasting':{'dataset':'Bundled synthetic 311 complaints; not verified live operations','sha256':hashlib.sha256(dataset.read_bytes()).hexdigest(),'as_of':last,'available_zones':len(available),'selected_models':dict(models),'candidate_metrics':metrics,'validation':report['methodology']['validation'],'limitation':'Synthetic benchmark and model-selection backtest; no independent production accuracy claim.'}}
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2));output.chmod(0o600)
    print(json.dumps({'retrieval_passed':result['retrieval']['passed'],'retrieval_total':len(results),'forecast_zones':len(available),'selected_models':dict(models),'candidate_metrics':metrics}))
    if not all(r['passed'] for r in results):raise SystemExit(1)
