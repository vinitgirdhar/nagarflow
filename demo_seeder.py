import sqlite3
import random
from datetime import datetime, timedelta

DB_PATH = 'nagarflow.db'

def seed_hackathon_demo():
    print("Setting up Hackathon Validation Seed...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM prediction_outcomes")
    
    try:
        cursor.execute("ALTER TABLE prediction_outcomes ADD COLUMN timestamp TEXT")
    except:
        pass # already exists
        
    outcomes = []
    base_time = datetime.now() - timedelta(days=7)
    
    print(" Injecting 50 Stable Prediction Histories (Days 1-5)")
    for i in range(50):
        t = base_time + timedelta(hours=i*2)
        err = random.uniform(2.0, 15.0) # Model working perfectly
        outcomes.append((100+i, 80, err, t.strftime('%Y-%m-%d %H:%M:%S')))
        
    print(" Injecting 20 Highly Hallucinated Predictions (Days 6-7)")
    for i in range(20):
        t = base_time + timedelta(hours=(50+i)*2)
        err = random.uniform(35.0, 60.0) # Model drift causing huge errors
        outcomes.append((200+i, 40, err, t.strftime('%Y-%m-%d %H:%M:%S')))
        
    cursor.executemany('''
        INSERT INTO prediction_outcomes (prediction_id, actual_demand, error_margin, timestamp)
        VALUES (?, ?, ?, ?)
    ''', outcomes)
    
    conn.commit()
    conn.close()
    print("✅ Model Drift Successfully Seeded! 70 Outcomes saved.")

if __name__ == '__main__':
    seed_hackathon_demo()
