"""Operational reports from confirmed events. Unknown values remain null."""
import datetime as dt
import sqlite3
from contextlib import closing


def operations_report(path):
    now = dt.datetime.now(dt.timezone.utc)
    days = [(now.date()-dt.timedelta(days=n)).isoformat() for n in range(6,-1,-1)]
    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('BEGIN')
        zones = {row[0] for row in conn.execute('''SELECT zone FROM complaints UNION SELECT zone FROM predictions
            UNION SELECT zone FROM zone_coverage UNION SELECT zone FROM dispatches''') if row[0]}
        visits = {}
        for row in conn.execute('''SELECT zone,arrived_at AS visited_at FROM dispatches WHERE status='ARRIVED'
            UNION ALL SELECT t.zone,t.completed_time FROM maintenance_tasks t
            WHERE t.status='COMPLETED' AND EXISTS (SELECT 1 FROM uploaded_evidence e WHERE e.task_id=t.id)'''):
            try:
                value = dt.datetime.fromisoformat(row['visited_at'].replace('Z','+00:00'))
                value = value.replace(tzinfo=dt.timezone.utc) if value.tzinfo is None else value
            except (TypeError,AttributeError,ValueError):
                continue
            if value <= now and (row['zone'] not in visits or value > visits[row['zone']]):
                visits[row['zone']] = value
        zone_coverage = [{'zone': zone, 'last_confirmed_visit': visits[zone].isoformat() if zone in visits else None,
                          'covered': zone in visits and now-visits[zone] <= dt.timedelta(hours=48)} for zone in sorted(zones)]
        coverage = round(100*sum(z['covered'] for z in zone_coverage)/len(zones),1) if zones else None
        observations = [dict(row) for row in conn.execute('''SELECT o.error_margin,o.actual_demand,o.predicted_score,o.timestamp,d.zone
            FROM prediction_outcomes o JOIN dispatches d ON d.id=o.dispatch_id
            WHERE o.is_simulated=0 AND d.status='ARRIVED' AND d.is_legacy=0
            AND o.predicted_score=d.predicted_score AND o.actual_demand=d.actual_demand
            ORDER BY o.id DESC''')]
        excluded = conn.execute('SELECT COUNT(*) FROM prediction_outcomes').fetchone()[0]-len(observations)
        counts = {row['status']: row['count'] for row in conn.execute('SELECT status,COUNT(*) AS count FROM dispatches GROUP BY status')}
        fleet = conn.execute("SELECT COUNT(*) AS total,SUM(status!='idle') AS busy FROM trucks").fetchone()
    recent = observations[:20]
    mean_error = round(sum(o['error_margin'] for o in observations)/len(observations),2) if observations else None
    recent_error = round(sum(o['error_margin'] for o in recent)/len(recent),2) if recent else None
    trend = []
    for day in days:
        sample = [o for o in observations if o['timestamp'][:10] == day]
        trend.append({'date': day, 'sample_count': len(sample), 'mean_absolute_error': round(sum(o['error_margin'] for o in sample)/len(sample),2) if sample else None})
    return {
        'generated_at': now.isoformat(),
        'kpis': {'accuracy': None, 'coverage': coverage, 'equity': None, 'efficiency': None},
        'score_comparison': {'observed_count': len(observations), 'excluded_legacy_or_simulated_count': excluded,
                             'mean_absolute_error': mean_error, 'recent_mean_absolute_error': recent_error,
                             'unit': 'score points (0–100)', 'source': 'operator-reported demand compared with dispatch-time priority score'},
        'fleet': {'total': fleet['total'], 'busy': fleet['busy'] or 0, 'en_route': counts.get('EN_ROUTE',0),
                  'arrived': counts.get('ARRIVED',0), 'cancelled': counts.get('CANCELLED',0)},
        'zone_coverage': zone_coverage, 'daily_score_comparison': trend,
        'trigger_retrain': False, 'recent_error_margin': recent_error,
        'chart_data': {'accuracy_trend': [], 'coverage_trend': []},
        'definitions': {'coverage': 'Known zones with an operator-confirmed arrival or evidence-approved task in the last 48 hours / all known zones. Legacy seeded coverage timestamps are excluded.',
                        'score_comparison': 'Priority and demand scores are operational proxies. Their difference is not validated forecasting accuracy and does not justify automatic retraining.',
                        'unavailable_kpis': 'Prediction accuracy, equity and fleet efficiency need validated definitions and data; no default values are substituted.'},
    }
