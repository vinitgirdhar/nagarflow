import sqlite3
import random
import datetime

DB_PATH = 'nagarflow.db'

def seed_mock_data():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get all unique zones and localities to distribute mock data
    cursor.execute("SELECT DISTINCT zone, locality FROM complaints WHERE zone IS NOT NULL AND locality IS NOT NULL")
    locations = cursor.fetchall()
    
    if not locations:
        print("No existing locations found in DB. Seeding aborted.")
        return

    now = datetime.datetime.now()
    
    # 1. Seed Voice Reports (986)
    voice_count = 986
    print(f"Seeding {voice_count} Voice Reports...")
    voice_batch = []
    for i in range(voice_count):
        zone, locality = random.choice(locations)
        voice_batch.append((
            f"VOICE-{i+5000}", # Unique ID
            zone,
            locality,
            random.choice(["Waste management", "Water leakage", "Road Pothole", "Drainage blockage"]),
            1, # complaint_count
            50000, # population
            "Clear",
            (now - datetime.timedelta(minutes=random.randint(5, 600))).strftime('%Y-%m-%d %H:%M:%S'),
            "High",
            "Urgent voice report from Sarvam AI agent."
        ))
        
    cursor.executemany('''
        INSERT OR REPLACE INTO complaints 
        (id, zone, locality, issue_type, complaint_count, population, weather, timestamp, severity, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', voice_batch)

    # 2. Seed Text Reports (438)
    text_count = 438
    print(f"Seeding {text_count} Text Reports...")
    text_batch = []
    for i in range(text_count):
        zone, locality = random.choice(locations)
        text_batch.append((
            f"TEXT-{i+8000}", # Unique ID
            zone,
            locality,
            random.choice(["Illegal dumping", "Street light non-functional", "Traffic congestion", "Water supply interrupted"]),
            1, # complaint_count
            30000, # population
            "Cloudy",
            (now - datetime.timedelta(minutes=random.randint(10, 1000))).strftime('%Y-%m-%d %H:%M:%S'),
            "Medium",
            "Text complaint logged via simulator chat."
        ))
        
    cursor.executemany('''
        INSERT OR REPLACE INTO complaints 
        (id, zone, locality, issue_type, complaint_count, population, weather, timestamp, severity, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', text_batch)

    conn.commit()
    conn.close()
    print("Database seeding complete.")

if __name__ == '__main__':
    seed_mock_data()
