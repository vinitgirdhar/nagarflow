import sqlite3
import math
from fleet_manager import get_zone_coordinates

DB_PATH = 'nagarflow.db'

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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Pull Top 5 Critical Surge zones marked by AiRLLM
    cursor.execute('''
        SELECT zone, priority_score, action, reason 
        FROM predictions 
        ORDER BY priority_score DESC 
        LIMIT 5
    ''')
    top_zones = cursor.fetchall()
    
    # Grab all Trucks tracking as 'idle' right now
    cursor.execute("SELECT id, name, lat, lon FROM trucks WHERE status = 'idle'")
    unassigned_trucks = [dict(t) for t in cursor.fetchall()]
    
    suggestions = []
    
    # Greedy Pairing Mechanism loop
    for tz in top_zones:
        if not unassigned_trucks:
            break # Network is fully active; no trucks available to route
            
        z_name = tz['zone']
        z_lat, z_lon = get_zone_coordinates(z_name)
        
        best_truck = None
        min_dist = float('inf')
        
        for tr in unassigned_trucks:
            dist = haversine(tr['lat'], tr['lon'], z_lat, z_lon)
            if dist < min_dist:
                min_dist = dist
                best_truck = tr
                
        if best_truck:
            # 30km/h realistic street traffic multiplier
            eta_mins = max(1, int((min_dist / 30.0) * 60)) 
            
            suggestions.append({
                "zone": z_name,
                "priority_score": tz['priority_score'],
                "reason": tz['reason'],
                "action": tz['action'],
                "truck_id": best_truck['id'],
                "truck_name": best_truck['name'],
                "distance_km": round(min_dist, 2),
                "eta_mins": eta_mins
            })
            # Remove from pool once deployed to block overlap
            unassigned_trucks.remove(best_truck)
            
    conn.close()
    return suggestions

if __name__ == '__main__':
    sg = generate_dispatch_suggestions()
    import json
    print("Test Dispatch Logic Output:")
    print(json.dumps(sg, indent=2))
