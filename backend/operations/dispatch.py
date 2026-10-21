"""Transactional dispatch state. Every write is confined to the caller's municipality DB."""
import datetime as dt
import hashlib
import json
import math
import re
import sqlite3
import uuid
from contextlib import contextmanager, closing

from backend.operations.dispatch_contract import prediction_version, valid_coordinates, valid_score
from backend.operations.fleet import ZONE_COORDS
from backend.operations.allocator import resolve_zone_truck_type
from backend.core.predictions import fetch_canonical_predictions


class DispatchError(Exception):
    def __init__(self, message, code='invalid_request', status=400):
        super().__init__(message)
        self.code, self.status = code, status


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


@contextmanager
def transaction(path):
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('BEGIN IMMEDIATE')
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _validate_key(key):
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', key):
        raise DispatchError('Send a unique Idempotency-Key (16–128 letters, numbers, hyphens or underscores).')


def _payload(data, fields, required):
    if not isinstance(data, dict) or set(data)-fields or not required.issubset(data):
        raise DispatchError('Supply the required dispatch fields only.')


def _positive_integer(value):
    return isinstance(value, int) and not isinstance(value, bool) and 0 < value < 2**63


def _fingerprint(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False).encode()).hexdigest()


def _existing(conn, operation, key, fingerprint):
    row = conn.execute('SELECT fingerprint,dispatch_id FROM dispatch_requests WHERE operation=? AND request_key=?',
                       (operation, key)).fetchone()
    if not row:
        return None
    if row['fingerprint'] != fingerprint:
        raise DispatchError('This request key was already used with different details.', 'idempotency_conflict', 409)
    return dict(conn.execute('SELECT * FROM dispatches WHERE id=?', (row['dispatch_id'],)).fetchone())


def _remember(conn, operation, key, fingerprint, identifier):
    conn.execute('INSERT INTO dispatch_requests VALUES (?,?,?,?,?)',
                 (operation, key, fingerprint, identifier, timestamp()))


def _event(conn, dispatch_id, actor, event):
    conn.execute('INSERT INTO dispatch_events (dispatch_id,actor_id,event,created_at) VALUES (?,?,?,?)',
                 (dispatch_id, actor, event, timestamp()))


def _result(row, replayed=False):
    return {'success': True, 'dispatch': dict(row), 'replayed': replayed}


def accept(path, data, key, actor):
    _validate_key(key)
    fields = {'truck_id', 'zone', 'prediction_id', 'prediction_version'}
    _payload(data, fields, fields)
    if not _positive_integer(data['truck_id']) or not _positive_integer(data['prediction_id']):
        raise DispatchError('truck_id and prediction_id must be positive integers.')
    if not isinstance(data['zone'], str) or not 1 <= len(data['zone']) <= 120 or data['zone'] != data['zone'].strip():
        raise DispatchError('Supply the exact recommended zone.')
    if not isinstance(data['prediction_version'], str) or not re.fullmatch(r'[a-f0-9]{64}', data['prediction_version']):
        raise DispatchError('Supply the recommendation version from the dispatch feed.')
    fingerprint = _fingerprint(data)
    with transaction(path) as conn:
        replay = _existing(conn, 'accept', key, fingerprint)
        if replay:
            return _result(replay, True)
        truck = conn.execute('SELECT * FROM trucks WHERE id=?', (data['truck_id'],)).fetchone()
        if not truck:
            raise DispatchError('Vehicle not found.', 'not_found', 404)
        active = conn.execute("SELECT * FROM dispatches WHERE status='EN_ROUTE' AND (truck_id=? OR zone=?)",
                              (data['truck_id'], data['zone'])).fetchall()
        for row in active:
            if (row['truck_id'] == data['truck_id'] and row['zone'] == data['zone']
                    and row['prediction_version'] == data['prediction_version']):
                _remember(conn, 'accept', key, fingerprint, row['id'])
                return _result(row, True)
        if active or truck['status'] != 'idle':
            raise DispatchError('The vehicle or zone already has an active assignment. Refresh dispatch suggestions.', 'assignment_conflict', 409)
        prediction = next((p for p in fetch_canonical_predictions(conn.cursor()) if p['zone'] == data['zone']), None)
        if prediction and not valid_score(prediction['priority_score']):
            raise DispatchError('The recommendation score is invalid.', 'invalid_recommendation', 409)
        if (not prediction or prediction['id'] != data['prediction_id']
                or prediction_version(prediction) != data['prediction_version']):
            raise DispatchError('The recommendation has changed. Refresh before dispatching.', 'stale_recommendation', 409)
        if conn.execute("SELECT 1 FROM dispatches WHERE prediction_version=? AND status!='CANCELLED'",
                        (data['prediction_version'],)).fetchone():
            raise DispatchError('This recommendation has already been serviced.', 'recommendation_serviced', 409)
        destination = ZONE_COORDS.get(data['zone'])
        if not destination or not valid_coordinates(truck['lat'], truck['lon']):
            raise DispatchError('Verified vehicle and destination coordinates are required.', 'invalid_coordinates', 409)
        preferred, _ = resolve_zone_truck_type(conn.cursor(), data['zone'])
        if preferred is None or truck['truck_type'] != preferred:
            raise DispatchError('The vehicle type does not match this zone’s service need.', 'vehicle_type_conflict', 409)
        identifier = uuid.uuid4().hex
        conn.execute('''INSERT INTO dispatches
            (id,truck_id,truck_name,zone,prediction_id,prediction_version,predicted_score,
             destination_lat,destination_lon,status,accepted_at,accepted_by,is_legacy)
            VALUES (?,?,?,?,?,?,?,?,?,'EN_ROUTE',?,?,0)''',
            (identifier,truck['id'],truck['name'],data['zone'],prediction['id'],data['prediction_version'],
             prediction['priority_score'],*destination,timestamp(),actor))
        updated = conn.execute("UPDATE trucks SET status=? WHERE id=? AND status='idle'",
                               ('en_route_to_'+data['zone'],truck['id']))
        if updated.rowcount != 1:
            raise DispatchError('The vehicle is no longer idle.', 'assignment_conflict', 409)
        _remember(conn, 'accept', key, fingerprint, identifier)
        _event(conn, identifier, actor, 'accepted')
        return _result(conn.execute('SELECT * FROM dispatches WHERE id=?', (identifier,)).fetchone())


def finish(path, data, key, actor, *, cancel=False):
    _validate_key(key)
    fields = {'dispatch_id', 'reason'} if cancel else {'dispatch_id', 'actual_demand', 'notes'}
    _payload(data, fields, {'dispatch_id', 'reason'} if cancel else {'dispatch_id'})
    if not isinstance(data['dispatch_id'], str) or not re.fullmatch(r'[a-f0-9]{32}', data['dispatch_id']):
        raise DispatchError('Supply a valid dispatch_id.')
    if cancel:
        reason = data['reason']
        if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 1000:
            raise DispatchError('A cancellation reason (1–1000 characters) is required.')
        normalized = {'dispatch_id': data['dispatch_id'], 'reason': reason.strip()}
    else:
        notes = data.get('notes', '')
        actual = data.get('actual_demand')
        if not isinstance(notes,str) or len(notes) > 2000:
            raise DispatchError('Notes must be text up to 2000 characters.')
        if actual is not None and (isinstance(actual,bool) or not isinstance(actual,(int,float)) or not math.isfinite(actual) or not 0 <= actual <= 100):
            raise DispatchError('Observed demand must be a finite number from 0 to 100, or omitted.')
        normalized = {'dispatch_id': data['dispatch_id'], 'actual_demand': float(actual) if actual is not None else None, 'notes': notes.strip()}
    fingerprint = _fingerprint(normalized)
    operation, target = ('cancel','CANCELLED') if cancel else ('arrive','ARRIVED')
    with transaction(path) as conn:
        replay = _existing(conn, operation, key, fingerprint)
        if replay:
            return _result(replay, True)
        row = conn.execute('SELECT * FROM dispatches WHERE id=?', (data['dispatch_id'],)).fetchone()
        if not row:
            raise DispatchError('Dispatch not found.', 'not_found', 404)
        if row['status'] == target:
            same = (row['cancel_reason'] == normalized['reason']) if cancel else (row['actual_demand'] == normalized['actual_demand'] and (row['arrival_notes'] or '') == normalized['notes'])
            if not same:
                raise DispatchError('This dispatch was already closed with different details.', 'completion_conflict', 409)
            _remember(conn, operation, key, fingerprint, row['id'])
            return _result(row, True)
        if row['status'] != 'EN_ROUTE':
            raise DispatchError('This dispatch is already closed.', 'dispatch_closed', 409)
        truck = conn.execute('SELECT status FROM trucks WHERE id=?', (row['truck_id'],)).fetchone()
        if not truck or truck['status'] != 'en_route_to_'+row['zone']:
            raise DispatchError('Fleet state is inconsistent. Resolve it before closing the dispatch.', 'fleet_state_conflict', 409)
        stamp = timestamp()
        if cancel:
            conn.execute("UPDATE dispatches SET status='CANCELLED',cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE id=?",
                         (stamp,actor,normalized['reason'],row['id']))
            conn.execute("UPDATE trucks SET status='idle' WHERE id=?", (row['truck_id'],))
        else:
            if not valid_coordinates(row['destination_lat'], row['destination_lon']):
                raise DispatchError('This legacy route has no verified destination. Cancel and redispatch after correcting the zone.', 'invalid_coordinates', 409)
            conn.execute("UPDATE dispatches SET status='ARRIVED',arrived_at=?,arrived_by=?,actual_demand=?,arrival_notes=? WHERE id=?",
                         (stamp,actor,normalized['actual_demand'],normalized['notes'],row['id']))
            conn.execute("UPDATE trucks SET status='idle',lat=?,lon=? WHERE id=?", (row['destination_lat'],row['destination_lon'],row['truck_id']))
            conn.execute("INSERT INTO zone_coverage (zone,last_visited,status) VALUES (?,?,'OK') ON CONFLICT(zone) DO UPDATE SET last_visited=excluded.last_visited,status='OK'", (row['zone'],stamp))
            if normalized['actual_demand'] is not None and row['predicted_score'] is not None:
                conn.execute('''INSERT INTO prediction_outcomes
                    (prediction_id,actual_demand,error_margin,timestamp,is_simulated,dispatch_id,predicted_score)
                    VALUES (?,?,?,?,0,?,?)''', (row['prediction_id'],normalized['actual_demand'],
                    abs(row['predicted_score']-normalized['actual_demand']),stamp,row['id'],row['predicted_score']))
        _remember(conn, operation, key, fingerprint, row['id'])
        _event(conn, row['id'], actor, 'cancelled' if cancel else 'arrival_confirmed')
        return _result(conn.execute('SELECT * FROM dispatches WHERE id=?', (row['id'],)).fetchone())


def list_dispatches(path):
    with closing(sqlite3.connect(path)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""SELECT * FROM dispatches WHERE status='EN_ROUTE' OR id IN (
            SELECT id FROM dispatches WHERE status!='EN_ROUTE'
            ORDER BY COALESCE(arrived_at,cancelled_at,accepted_at,'') DESC,id DESC LIMIT 100)
            ORDER BY (status='EN_ROUTE') DESC,COALESCE(accepted_at,'') DESC,id DESC""").fetchall()
    return [dict(row) for row in rows]


def correct_observation(path,data,key,actor):
    _validate_key(key)
    fields={'dispatch_id','expected_revision','actual_demand','reason'}
    _payload(data,fields,fields)
    actual=data['actual_demand'];revision=data['expected_revision'];reason=data['reason']
    if not isinstance(data['dispatch_id'],str) or not re.fullmatch(r'[a-f0-9]{32}',data['dispatch_id']):raise DispatchError('Invalid dispatch ID.')
    if isinstance(revision,bool) or not isinstance(revision,int) or not 0<=revision<2**31:raise DispatchError('The current observation revision is required.')
    if actual is not None and not valid_score(actual):raise DispatchError('Supply a finite 0–100 score or null to withdraw it.')
    if not isinstance(reason,str) or not 5<=len(reason.strip())<=1000:raise DispatchError('A correction reason (5–1000 characters) is required.')
    from backend.core.privacy import redact
    normalized=dict(data,actual_demand=float(actual) if actual is not None else None,reason=redact(reason.strip()));fingerprint=_fingerprint(normalized)
    with transaction(path) as conn:
        replay=_existing(conn,'observation',key,fingerprint)
        if replay:return _result(replay,True)
        row=conn.execute('SELECT * FROM dispatches WHERE id=?',(data['dispatch_id'],)).fetchone()
        if not row:raise DispatchError('Dispatch not found.','not_found',404)
        if row['status']!='ARRIVED' or row['is_legacy'] or row['predicted_score'] is None:raise DispatchError('Only arrived, recorded prediction snapshots can be corrected.','state_conflict',409)
        if row['observation_revision']!=revision:raise DispatchError('Observation changed. Reload before correcting it.','revision_conflict',409)
        if row['actual_demand']==normalized['actual_demand']:raise DispatchError('The supplied observation is unchanged.')
        conn.execute('UPDATE dispatches SET actual_demand=?,observation_revision=observation_revision+1 WHERE id=?',(normalized['actual_demand'],row['id']))
        if actual is None:conn.execute('DELETE FROM prediction_outcomes WHERE dispatch_id=?',(row['id'],))
        else:
            existing=conn.execute('SELECT id FROM prediction_outcomes WHERE dispatch_id=?',(row['id'],)).fetchone()
            if existing:conn.execute('UPDATE prediction_outcomes SET actual_demand=?,error_margin=?,is_simulated=0 WHERE dispatch_id=?',(actual,abs(actual-row['predicted_score']),row['id']))
            else:conn.execute('INSERT INTO prediction_outcomes (prediction_id,actual_demand,error_margin,timestamp,is_simulated,dispatch_id,predicted_score) VALUES (?,?,?,?,0,?,?)',(row['prediction_id'],actual,abs(actual-row['predicted_score']),row['arrived_at'],row['id'],row['predicted_score']))
        conn.execute('INSERT INTO observation_corrections (dispatch_id,previous_value,new_value,revision,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?)',(row['id'],row['actual_demand'],actual,revision+1,normalized['reason'],actor,timestamp()))
        _remember(conn,'observation',key,fingerprint,row['id']);_event(conn,row['id'],actor,'observation_corrected')
        return _result(conn.execute('SELECT * FROM dispatches WHERE id=?',(row['id'],)).fetchone())
