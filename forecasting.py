"""Daily complaint-volume baselines with rolling-origin validation and explicit freshness."""
import datetime as dt
import math
import sqlite3
from contextlib import closing
from statistics import mean
from dispatch_service import DispatchError,timestamp

MODELS=('weekly_seasonal_naive','seven_day_mean','ridge_lag_regression')

def _solve(matrix,target):
    n=len(target);a=[list(row)+[target[i]] for i,row in enumerate(matrix)]
    for k in range(n):
        pivot=max(range(k,n),key=lambda i:abs(a[i][k]));a[k],a[pivot]=a[pivot],a[k]
        value=a[k][k]
        if abs(value)<1e-12:return None
        a[k]=[number/value for number in a[k]]
        for i in range(n):
            if i==k:continue
            factor=a[i][k];a[i]=[a[i][j]-factor*a[k][j] for j in range(n+1)]
    return [a[i][-1] for i in range(n)]


def _predict(history,model):
    if model=='weekly_seasonal_naive':return history[-7]
    if model=='seven_day_mean':return mean(history[-7:])
    scale=max(max(history),1)
    features=lambda past:[1,past[-1]/scale,past[-7]/scale,mean(past[-7:])/scale]
    rows=[(features(history[:i]),history[i]/scale) for i in range(7,len(history))]
    matrix=[[sum(x[i]*x[j] for x,y in rows)+(0.1 if i==j and i else 0) for j in range(4)] for i in range(4)]
    target=[sum(x[i]*y for x,y in rows) for i in range(4)]
    coefficients=_solve(matrix,target)
    if coefficients is None:return mean(history[-7:])
    return max(0,sum(a*b for a,b in zip(coefficients,features(history)))*scale)


def evaluate(history):
    result=[]
    for model in MODELS:
        errors=[];total=0
        for index in range(len(history)-7,len(history)):
            predicted=_predict(history[:index],model);errors.append(abs(predicted-history[index]));total+=history[index]
        result.append({'model':model,'mae':round(mean(errors),3),'wape':round(sum(errors)/total,4) if total else None,'samples':7,'errors':errors})
    return sorted(result,key=lambda item:(item['mae'],MODELS.index(item['model'])))


def forecast(path,as_of=None,zone=None):
    today=dt.datetime.now(dt.timezone.utc).date()
    try:cutoff=dt.date.fromisoformat(as_of) if as_of else today-dt.timedelta(days=1)
    except (ValueError,TypeError):raise DispatchError('as_of must be an ISO date.')
    if cutoff>today or cutoff<dt.date(2000,1,1):raise DispatchError('Choose a date from 2000 through today.')
    if zone is not None and (not isinstance(zone,str) or not 1<=len(zone)<=120):raise DispatchError('Invalid zone.')
    first=cutoff-dt.timedelta(days=179)
    grouped={};latest_global=None;ignored=0
    with closing(sqlite3.connect(path)) as conn:
        rows=conn.execute('SELECT zone,timestamp,complaint_count FROM complaints'+(' WHERE zone=?' if zone else ''),(zone,) if zone else ())
        for name,stamp,count in rows:
            try:
                parsed=dt.datetime.fromisoformat(str(stamp).replace('Z','+00:00'))
                day=(parsed.astimezone(dt.timezone.utc) if parsed.tzinfo else parsed).date()
                if isinstance(count,bool) or not isinstance(count,(int,float)) or not math.isfinite(count) or not 0<=count<=1000000:raise ValueError
            except (ValueError,TypeError,OverflowError):ignored+=1;continue
            if day>cutoff:continue
            latest_global=max(latest_global,day) if latest_global else day
            if day<first or not name:continue
            grouped.setdefault(name,{})[day]=grouped.setdefault(name,{}).get(day,0)+count
    results=[]
    for name,days in sorted(grouped.items()):
        start=min(days);last=max(days);span=(cutoff-start).days+1
        record={'zone':name,'observed_days':len(days),'calendar_days':span,'last_recorded_date':last.isoformat()}
        if (cutoff-last).days>2:record.update(status='STALE',forecast=[],evaluation=[])
        elif span<28 or len(days)<14:record.update(status='INSUFFICIENT_DATA',forecast=[],evaluation=[])
        else:
            history=[days.get(start+dt.timedelta(days=i),0) for i in range(span)]
            evaluation=evaluate(history);selected=evaluation[0];errors=sorted(selected['errors']);radius=errors[min(len(errors)-1,math.ceil(0.8*len(errors))-1)]
            future=[];rolling=list(history)
            for step in range(1,3):
                estimate=_predict(rolling,selected['model']);rolling.append(estimate)
                future.append({'date':(cutoff+dt.timedelta(days=step)).isoformat(),'expected_complaint_volume':round(estimate,2),'residual_range_low':round(max(0,estimate-radius),2),'residual_range_high':round(estimate+radius,2)})
            record.update(status='AVAILABLE',selected_model=selected['model'],forecast=future,evaluation=[{k:v for k,v in model.items() if k!='errors'} for model in evaluation],missing_calendar_days=span-len(days))
        results.append(record)
    return {'as_of':cutoff.isoformat(),'generated_at':timestamp(),'data_last_date':latest_global.isoformat() if latest_global else None,'ignored_invalid_records':ignored,
        'status':'AVAILABLE' if any(r['status']=='AVAILABLE' for r in results) else 'NO_USABLE_RECENT_HISTORY','zones':results,
        'methodology':{'target':'Sum of complaint_count per zone per UTC calendar day; not a priority or probability score.',
            'validation':'Seven rolling-origin one-day forecasts per model, fitted only on preceding data. Model selection uses this same backtest; no independent holdout claim.',
            'missing_days':'Dates without records within a zone history are assumed zero. Ingestion outages can invalidate this assumption.',
            'uncertainty':'Range uses the 80th percentile of seven historical absolute residuals. It is not a calibrated prediction interval or a guaranteed confidence level.',
            'deployment':'Decision support only. Stale or short histories suppress forecasts. No automatic dispatch or production model-accuracy claims.'}}
