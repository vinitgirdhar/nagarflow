import sqlite3
import random

DB_PATH = 'nagarflow.db'

def force_active_demo():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Available Zones
    ZONES = ["Bandra", "Andheri", "Colaba", "Borivali", "Goregaon", "Juhu"]
    
    # Coordinates of some zones to place trucks FAR AWAY
    # Airoli (far away from Juhu/Colaba)
    AIROLI = (19.1579, 72.9935)
    
    cursor.execute("SELECT id FROM trucks")
    t_ids = [row[0] for row in cursor.fetchall()]
    
    if len(t_ids) < 6:
        print("Not enough trucks.")
        return

    # Reset all
    cursor.execute("UPDATE trucks SET status = 'idle'")
    
    # Pick 6 and set them FAR from their target
    active_ids = t_ids[:6]
    for i, t_id in enumerate(active_ids):
        zone = ZONES[i]
        status = f"en_route_to_{zone}"
        # Force them to Airoli first so they have to travel to Juhu/Bandra etc
        cursor.execute("UPDATE trucks SET status=?, lat=?, lon=? WHERE id=?", 
                       (status, AIROLI[0] + random.uniform(-0.01, 0.01), AIROLI[1] + random.uniform(-0.01, 0.01), t_id))
    
    conn.commit()
    conn.close()
    print("✅ Force-Seeded 6 Active Trucks (starting from Airoli). They should now be moving.")

if __name__ == "__main__":
    force_active_demo()
