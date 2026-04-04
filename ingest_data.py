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
            issue_type TEXT,
            complaint_count INTEGER,
            weather TEXT,
            timestamp TEXT,
            severity TEXT
        )
    ''')
    
    # 2. Trucks Table (For Greedy Dispatch)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trucks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            status TEXT DEFAULT 'idle',
            lat REAL,
            lon REAL
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
    for file_path in csv_files:
        print(f"Reading data from {file_path}...")
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            count = 0
            for row in reader:
                try:
                    cursor.execute('''
                        INSERT OR REPLACE INTO complaints 
                        (id, zone, issue_type, complaint_count, weather, timestamp, severity)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        row['Complaint_ID'],
                        row['Area'],
                        row['Complaint_Type'],
                        int(row['Complaint_Count']),
                        row['Weather'],
                        row['Timestamp'],
                        row['Severity']
                    ))
                    count += 1
                except Exception as e:
                    pass
            total_count += count
                
    conn.commit()
    print(f"Successfully ingested {total_count} total complaints into the database.")

if __name__ == '__main__':
    print("Setting up Nagarflow Database Architecture...")
    conn = setup_database()
    ingest_all_csvs(conn)
    conn.close()
    print("Pre-processing and DB Setup Complete.")
