import sqlite3
import random
import hashlib

DB_PATH = 'nagarflow.db'
TRUCK_TYPE_SEQUENCE = ['garbage', 'garbage', 'water']

# Hard boundary constraints to ensure nothing leaks into Arabian Sea
# Using distinct land clusters to avoid the Thane Creek / Mumbai Harbour water bodies.
LAND_CLUSTERS = [
    (18.92, 18.99, 72.80, 72.84), # South Mumbai
    (19.05, 19.20, 72.82, 72.86), # Western Suburbs (Bandra to Borivali)
    (19.00, 19.09, 72.84, 72.88), # Central Suburbs (Dadar to Ghatkopar)
    (19.00, 19.10, 73.00, 73.05)  # Navi Mumbai (Vashi/Nerul)
]

def get_zone_coordinates(zone_name):
    """
    Mock Geocoding Dictionary.
    Hashes the zone text string to reliably generate an exact offsetting coordinate.
    This guarantees every run creates an identical geo-grid locked onto actual land mass.
    """
    h = int(hashlib.md5(zone_name.encode('utf-8')).hexdigest(), 16)
    
    # Select a land cluster based on hash
    cluster = LAND_CLUSTERS[h % len(LAND_CLUSTERS)]
    min_lat, max_lat, min_lon, max_lon = cluster
    
    # Deterministically pick a point inside the selected land cluster
    lat = min_lat + ((h % 1000) / 1000.0) * (max_lat - min_lat)
    lon = min_lon + (((h // 1000) % 1000) / 1000.0) * (max_lon - min_lon)
    return lat, lon

def get_locality_coordinates(zone_name, locality_name):
    """
    Generates a deterministic offset from the parent zone's center.
    This creates a 'Hotspot' effect around the main ward marker.
    """
    base_lat, base_lon = get_zone_coordinates(zone_name)
    h = int(hashlib.md5(locality_name.encode('utf-8')).hexdigest(), 16)
    
    # Small jitter (±0.003 degrees, ~300 meters) to scatter hotspots
    offset_lat = ((h % 100) - 50) / 15000.0
    offset_lon = (((h // 100) % 100) - 50) / 15000.0
    
    return base_lat + offset_lat, base_lon + offset_lon

def initialize_fleet(num_trucks=15):
    """Generates the idle truck fleet scattered across the operation grid."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM trucks")
    
    random.seed(42) # Locked random seed for visualization consistency
    
    trucks = []
    for i in range(1, num_trucks + 1):
        # Securely lock initialized trucks ON land (no water spawns)
        cluster = random.choice(LAND_CLUSTERS)
        min_lat, max_lat, min_lon, max_lon = cluster
        
        lat = min_lat + random.random() * (max_lat - min_lat)
        lon = min_lon + random.random() * (max_lon - min_lon)
        truck_type = TRUCK_TYPE_SEQUENCE[(i - 1) % len(TRUCK_TYPE_SEQUENCE)]
        truck_name = f"Tanker-{i:02d}" if truck_type == 'water' else f"Truck-{i:02d}"
        trucks.append((truck_name, 'idle', lat, lon, truck_type))
        
    cursor.executemany('''
        INSERT INTO trucks (name, status, lat, lon, truck_type)
        VALUES (?, ?, ?, ?, ?)
    ''', trucks)
    
    conn.commit()
    conn.close()
    print(f"🚀 Integrated Tracking: {num_trucks} 'idle' trucks successfully seeded natively across the MMR geo-grid on solid land.")

if __name__ == '__main__':
    initialize_fleet()
