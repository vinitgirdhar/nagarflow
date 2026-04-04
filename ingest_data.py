import sqlite3
import csv
import os
import glob

DB_PATH = 'nagarflow.db'

def setup_database():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Complaints Table (Ingesting 311 Data)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS complaints (
            id TEXT PRIMARY KEY,
            zone TEXT,
            locality TEXT,
            issue_type TEXT,
            complaint_count INTEGER,
            population INTEGER,
            weather TEXT,
            timestamp TEXT,
            severity TEXT,
            description TEXT
        )
    ''')
    
    # 2. Trucks Table (For Greedy Dispatch)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trucks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            status TEXT DEFAULT 'idle',
            lat REAL,
            lon REAL,
            truck_type TEXT DEFAULT 'garbage'
        )
    ''')
    
    # 3. Predictions Table (AiRLLM Output)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone TEXT,
            priority_score INTEGER,
            type TEXT,
            action TEXT,
            reason TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 4. Outcomes Table (Validation & Feedback Loop)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS prediction_outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_id INTEGER,
            actual_demand INTEGER,
            error_margin REAL
        )
    ''')
    
    conn.commit()
    return conn

def ingest_all_csvs(conn):
    cursor = conn.cursor()
    csv_files = glob.glob('data/*.csv')
    
    if not csv_files:
        print("Error: No CSV files found in the data/ directory.")
        return
        
    total_count = 0
    # Clear existing data for fresh start as requested
    cursor.execute("DELETE FROM complaints")
    
    for file_path in csv_files:
        print(f"Ingesting 50k records from {file_path}...")
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            batch = []
            for row in reader:
                try:
                    batch.append((
                        row.get('Complaint_ID'),
                        row.get('Area'),
                        row.get('Locality'),
                        row.get('Complaint_Type'),
                        int(row.get('Complaint_Count', 0)),
                        int(row.get('Population', 0)),
                        row.get('Weather'),
                        row.get('Timestamp'),
                        row.get('Severity'),
                        row.get('Complaint_Description')
                    ))
                    if len(batch) >= 1000:
                        cursor.executemany('''
                            INSERT OR REPLACE INTO complaints 
                            (id, zone, locality, issue_type, complaint_count, population, weather, timestamp, severity, description)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', batch)
                        total_count += len(batch)
                        batch = []
                except Exception as e:
                    pass
            if batch:
                cursor.executemany('''
                    INSERT OR REPLACE INTO complaints 
                    (id, zone, locality, issue_type, complaint_count, population, weather, timestamp, severity, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', batch)
                total_count += len(batch)
                
    conn.commit()
    print(f"Successfully ingested {total_count} total complaints into the database.")

if __name__ == '__main__':
    print("Setting up Nagarflow Database Architecture...")
    conn = setup_database()
    ingest_all_csvs(conn)
    conn.close()
    print("Pre-processing and DB Setup Complete.")
