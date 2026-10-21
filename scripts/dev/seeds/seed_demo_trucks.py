import sqlite3
import random

DB_PATH = 'nagarflow.db'

def seed_active_trucks():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Get some valid zones
    VALID_ZONES = [
        "Airoli", "Andheri", "Bandra", "Belapur", "Bhayander", "Borivali", 
        "CST", "Chembur", "Churchgate", "Colaba", "Dadar", "Dharamvi", 
        "Fort", "Ghatkopar", "Goregaon", "Hiranandani", "Jogeshwari", 
        "Juhu", "Kandivali", "Kurla", "Lower Parel", "Malad", "Matunga", 
        "Mulund", "Parel", "Powai", "Santacruz", "Sion", "Thane", 
        "Versova", "Vikhroli", "Vile Parle", "Wadala", "Worli"
    ]
    
    # 2. Reset all trucks to idle first (optional, but cleaner for demo)
    cursor.execute("UPDATE trucks SET status = 'idle'")
    
    # 3. Pick 6 random trucks and 6 random zones
    cursor.execute("SELECT id FROM trucks LIMIT 15")
    truck_ids = [row[0] for row in cursor.fetchall()]
    
    if not truck_ids:
        print("❌ No trucks found in DB. Please run app.py once to seed initial trucks.")
        return

    active_trucks = random.sample(truck_ids, min(6, len(truck_ids)))
    assigned_zones = random.sample(VALID_ZONES, 6)
    
    for i, t_id in enumerate(active_trucks):
        zone = assigned_zones[i]
        status = f"en_route_to_{zone}"
        cursor.execute("UPDATE trucks SET status = ? WHERE id = ?", (status, t_id))
        print(f"🚚 Truck {t_id} is now active and heading to {zone}")
        
    conn.commit()
    conn.close()
    print("✅ Demo seeding complete: 6 trucks are now active.")

if __name__ == "__main__":
    seed_active_trucks()
