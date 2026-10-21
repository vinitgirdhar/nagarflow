"""Stable recommendation identities shared by the dispatcher and write service."""
import hashlib
import json
import math


def prediction_version(prediction):
    fields = {key: prediction.get(key) for key in
              ('id', 'zone', 'priority_score', 'timestamp', 'category', 'action', 'reason')}
    return hashlib.sha256(json.dumps(fields, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=True, allow_nan=False).encode()).hexdigest()


def valid_coordinates(lat, lon):
    return (isinstance(lat, (int, float)) and not isinstance(lat, bool) and math.isfinite(lat)
            and isinstance(lon, (int, float)) and not isinstance(lon, bool) and math.isfinite(lon)
            and -90 <= lat <= 90 and -180 <= lon <= 180)


def valid_score(value):
    return isinstance(value, (int,float)) and not isinstance(value,bool) and math.isfinite(value) and 0 <= value <= 100
