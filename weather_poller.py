"""Optional Open-Meteo observations. Failures remain unknown, never fabricated clear weather."""
import datetime as dt
import json
import requests
from database import data_path,DEFAULT_DB_PATH
from dispatch_contract import valid_coordinates
from dispatch_service import transaction
WEATHER_API_URL='https://api.open-meteo.com/v1/forecast'
DB_PATH=DEFAULT_DB_PATH
LATITUDE,LONGITUDE=19.076,72.8777
RAIN_CODES={61,63,65,66,67,80,81,82,95,96,99}

def poll_once(path,latitude,longitude):
    if not valid_coordinates(latitude,longitude):raise ValueError('Invalid weather location')
    response=requests.get(WEATHER_API_URL,params={'latitude':latitude,'longitude':longitude,'current_weather':True,'timezone':'UTC'},timeout=10)
    response.raise_for_status();current=response.json().get('current_weather',{})
    for key in ['temperature','windspeed','weathercode','time']:
        if key not in current:raise ValueError('Provider response lacks required observations')
    import math
    for key in ['temperature','windspeed','weathercode']:
        if isinstance(current[key],bool) or not isinstance(current[key],(int,float)) or not math.isfinite(current[key]):raise ValueError('Invalid provider observation')
    observed=dt.datetime.fromisoformat(current['time']).replace(tzinfo=dt.timezone.utc)
    snapshot={'temperature':current['temperature'],'wind_speed':current['windspeed'],'weather_code':current['weathercode'],
              'observed_at':observed.isoformat(),'latitude':latitude,'longitude':longitude,'source':'Open-Meteo'}
    with transaction(path) as conn:
        for key,value in [('weather_snapshot',json.dumps(snapshot)),('current_rain_status','Yes' if current['weathercode'] in RAIN_CODES else 'No')]:
            conn.execute('INSERT INTO global_status (key,value,last_updated) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,last_updated=excluded.last_updated',(key,value))
    return snapshot

def check_heavy_rain():
    try:return 'Yes' if poll_once(data_path(DB_PATH),LATITUDE,LONGITUDE)['weather_code'] in RAIN_CODES else 'No'
    except (requests.RequestException,ValueError,KeyError):return 'Unknown'

if __name__=='__main__':
    print('Provider observation saved.' if check_heavy_rain()!='Unknown' else 'Weather unavailable; existing snapshot was preserved.')
