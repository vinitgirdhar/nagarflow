import datetime as dt
import sqlite3
import unittest
import backend.app as m
from backend.tests.auth_helpers import authenticate
from backend.intelligence.forecasting import forecast,evaluate
class ForecastTest(unittest.TestCase):
    def setUp(self):
        self.client=m.app.test_client();authenticate(self);self.path=m.app.config['DATA_DB_PATH'];self.cutoff=dt.date(2026,10,16)
    def history(self,count=42):
        with sqlite3.connect(self.path) as conn:
            for i in range(count):
                day=self.cutoff-dt.timedelta(days=count-i-1)
                conn.execute('INSERT INTO complaints (id,zone,timestamp,complaint_count) VALUES (?,?,?,?)',('history-'+str(i),'Dharavi',day.isoformat(),[8,12,10,15,20,4,2][i%7]))
    def test_seasonal_baseline_validation_is_exact_on_weekly_series(self):
        self.history();result=forecast(self.path,self.cutoff.isoformat());zone=result['zones'][0]
        self.assertEqual(zone['status'],'AVAILABLE');self.assertEqual(zone['selected_model'],'weekly_seasonal_naive');self.assertEqual(zone['evaluation'][0]['mae'],0)
        self.assertEqual(len(zone['forecast']),2);self.assertEqual(zone['forecast'][0]['date'],'2026-10-17')
        self.assertTrue(all(item['expected_complaint_volume']>=0 for item in zone['forecast']))
    def test_future_rows_cannot_leak_into_historical_training(self):
        self.history();before=forecast(self.path,self.cutoff.isoformat())['zones']
        with sqlite3.connect(self.path) as conn:conn.execute("INSERT INTO complaints (id,zone,timestamp,complaint_count) VALUES ('future','Dharavi','2026-10-17',100000)")
        self.assertEqual(before,forecast(self.path,self.cutoff.isoformat())['zones'])
    def test_short_and_stale_histories_never_produce_forecasts(self):
        self.history(10);self.assertEqual(forecast(self.path,self.cutoff.isoformat())['zones'][0]['status'],'INSUFFICIENT_DATA')
        with sqlite3.connect(self.path) as conn:conn.execute("UPDATE complaints SET timestamp='2026-09-01'")
        self.assertEqual(forecast(self.path,self.cutoff.isoformat())['zones'][0]['status'],'STALE')
    def test_invalid_counts_and_dates_are_excluded(self):
        with sqlite3.connect(self.path) as conn:
            conn.executemany('INSERT INTO complaints (id,zone,timestamp,complaint_count) VALUES (?,?,?,?)',[('bad1','Dharavi','invalid',3),('bad2','Dharavi','2026-10-16',-2),('bad3','Dharavi','2026-10-16','bad')])
        result=forecast(self.path,self.cutoff.isoformat());self.assertEqual(result['ignored_invalid_records'],3);self.assertEqual(result['zones'],[])
    def test_ridge_is_a_real_candidate_and_comparison_is_deterministic(self):
        history=[10+i*.5+(i%7) for i in range(50)]
        result=evaluate(history);self.assertEqual({r['model'] for r in result},{'ridge_lag_regression','seven_day_mean','weekly_seasonal_naive'})
        self.assertEqual(result,evaluate(history));self.assertTrue(all(r['samples']==7 for r in result))
    def test_invalid_cutoff_and_unknown_parameters_are_rejected(self):
        self.assertEqual(self.client.get('/api/forecasts?as_of=bad').status_code,400)
        self.assertEqual(self.client.get('/api/forecasts?as_of=2099-01-01').status_code,400)
        self.assertEqual(self.client.get('/api/forecasts?municipality=other').status_code,400)
