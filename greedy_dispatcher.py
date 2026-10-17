from database import data_path, DEFAULT_DB_PATH
import sqlite3
import math
from contextlib import closing
from fleet_manager import get_zone_coordinates, ZONE_COORDS
from dispatch_contract import prediction_version, valid_coordinates, valid_score
from prediction_store import fetch_canonical_predictions

DB_PATH = DEFAULT_DB_PATH
TRUCK_TYPE_LABELS = {
    "garbage": "Garbage Truck",
    "water": "Water Tanker",
}


def normalize_truck_type(truck_type):
    normalized = (truck_type or "").strip().lower()
    if normalized in TRUCK_TYPE_LABELS:
        return normalized
    return "garbage"


def issue_type_to_truck_type(issue_type):
    # Road and drainage work require maintenance crews, not water tankers or garbage trucks.
    mapping = {'water': 'water', 'garbage': 'garbage'}
    return mapping.get(str(issue_type or '').strip().casefold())


def resolve_zone_truck_type(cursor, zone_name):
    row = cursor.execute(
        '''
        SELECT issue_type, SUM(complaint_count) AS total_reports
        FROM complaints
        WHERE zone = ?
        GROUP BY issue_type
        ORDER BY total_reports DESC, issue_type ASC
        LIMIT 1
        ''',
        (zone_name,),
    ).fetchone()

    issue_type = row["issue_type"] if row else None
    truck_type = issue_type_to_truck_type(issue_type)
    return truck_type, TRUCK_TYPE_LABELS.get(truck_type, "Maintenance crew / unclassified")


def get_truck_marker_html(truck_type, is_busy=False):
    normalized_type = normalize_truck_type(truck_type)
    is_water = normalized_type == "water"
    accent = "#1f5fae" if is_water else "#C1440E"
    fill = "rgba(25,118,210,0.16)" if is_water else "rgba(193,68,14,0.14)"
    shadow = "rgba(25,118,210,0.45)" if is_water else "rgba(193,68,14,0.45)"
    size = "24px" if is_busy else "20px"
    glow = f"0 0 12px {shadow}" if is_busy else "0 2px 4px rgba(0,0,0,0.28)"
    icon_svg = (
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
        f'stroke="{accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        + (
            '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/>'
            '<path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>'
            if is_water
            else
            '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>'
            '<path d="M15 18H9"/>'
            '<path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>'
            '<circle cx="17" cy="18" r="2"/>'
            '<circle cx="7" cy="18" r="2"/>'
        )
        + "</svg>"
    )
    return (
        f'<div style="width:{size};height:{size};border-radius:999px;display:flex;align-items:center;justify-content:center;'
        f'background:{fill};border:1px solid {accent};box-shadow:{glow};color:{accent}">'
        f"{icon_svg}</div>"
    )

def haversine(lat1, lon1, lat2, lon2):
    """
    Mathematical calculation determining the direct distance line (KM) between two 
    global coordinates, accounting for Earth's curvature radius (6371.0 km).
    """
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def generate_dispatch_suggestions():
    """Maps highest AiRLLM priority predictions directly to closest idle trucks."""
    with closing(sqlite3.connect(data_path(DB_PATH))) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('BEGIN')
        cursor = conn.cursor()
    
        # Pull Top 5 Critical Surge zones marked by AiRLLM
        active_zones = {row['zone'] for row in cursor.execute("SELECT zone FROM dispatches WHERE status='EN_ROUTE'")}
        serviced_versions = {row['prediction_version'] for row in cursor.execute("SELECT prediction_version FROM dispatches WHERE status!='CANCELLED' AND prediction_version IS NOT NULL")}
        top_zones = [p for p in fetch_canonical_predictions(cursor)
                     if p['zone'] in ZONE_COORDS and p['zone'] not in active_zones
                     and valid_score(p['priority_score']) and prediction_version(p) not in serviced_versions]
    
        # Grab all Trucks tracking as 'idle' right now
        cursor.execute("SELECT id, name, lat, lon, truck_type FROM trucks WHERE status = 'idle'")
        unassigned_trucks = []
        for truck in cursor.fetchall():
            truck_data = dict(truck)
            if truck_data.get("truck_type") not in TRUCK_TYPE_LABELS:
                continue
            if valid_coordinates(truck_data['lat'], truck_data['lon']):
                unassigned_trucks.append(truck_data)
    
        suggestions = []
    
        # Greedy Pairing Mechanism loop
        for tz in top_zones:
            if not unassigned_trucks or len(suggestions) >= 5:
                break # Network is fully active; no trucks available to route
            
            z_name = tz['zone']
            z_lat, z_lon = get_zone_coordinates(z_name)
            preferred_truck_type, preferred_truck_type_label = resolve_zone_truck_type(cursor, z_name)
            if preferred_truck_type is None:
                continue
            candidate_trucks = [truck for truck in unassigned_trucks if truck['truck_type'] == preferred_truck_type]

            best_truck = None
            min_dist = float('inf')
        
            for tr in candidate_trucks:
                dist = haversine(tr['lat'], tr['lon'], z_lat, z_lon)
                if dist < min_dist:
                    min_dist = dist
                    best_truck = tr
                
            if best_truck:
                # 30km/h realistic street traffic multiplier
                eta_mins = max(1, int((min_dist / 30.0) * 60))
            
                suggestions.append({
                    "zone": z_name,
                    "prediction_id": tz["id"],
                    "prediction_version": prediction_version(tz),
                    "priority_score": tz['priority_score'],
                    "reason": tz['reason'],
                    "action": tz['action'],
                    "truck_id": best_truck['id'],
                    "truck_name": best_truck['name'],
                    "truck_type": best_truck['truck_type'],
                    "truck_type_label": TRUCK_TYPE_LABELS[best_truck['truck_type']],
                    "preferred_truck_type": preferred_truck_type,
                    "preferred_truck_type_label": preferred_truck_type_label,
                    "distance_km": round(min_dist, 2),
                    "eta_mins": eta_mins
                })
                # Remove from pool once deployed to block overlap
                unassigned_trucks.remove(best_truck)
            
        return suggestions

if __name__ == '__main__':
    sg = generate_dispatch_suggestions()
    import json
    print("Test Dispatch Logic Output:")
    print(json.dumps(sg, indent=2))
