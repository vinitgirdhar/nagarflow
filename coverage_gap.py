import sqlite3
from datetime import datetime, timedelta

DB_PATH = 'nagarflow.db'

def setup_coverage_table():
    """Create the zone_coverage table to track when a truck last visited each area."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS zone_coverage (
            zone TEXT PRIMARY KEY,
            last_visited DATETIME,
            status TEXT DEFAULT 'OK'
        )
    ''')
    
    # Discover unique zones automatically from our complaint database
    cursor.execute('SELECT DISTINCT zone FROM complaints')
    zones = cursor.fetchall()
    
    now = datetime.now()
    seed_data = []
    
    count = 0
    for row in zones:
        zone = row[0]
        # Check if zone is already initialized in coverage table
        cursor.execute('SELECT zone FROM zone_coverage WHERE zone = ?', (zone,))
        if not cursor.fetchone():
            # For hackathon/demo purposes, artificially make every 4th zone "OVERDUE" (> 48h)
            # and the others visited within the last 12-24 hours
            hours_ago = 55 if count % 4 == 0 else (12 + (count % 10))
            last_visit = (now - timedelta(hours=hours_ago)).strftime('%Y-%m-%d %H:%M:%S')
            seed_data.append((zone, last_visit))
        count += 1
            
    if seed_data:
        cursor.executemany('''
            INSERT INTO zone_coverage (zone, last_visited) VALUES (?, ?)
        ''', seed_data)
        
    conn.commit()
    conn.close()

def compute_coverage_gaps():
    """Scan all zones to identify and flag those neglected for > 48 hours."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 48-hour silent zone threshold
    now = datetime.now()
    threshold = now - timedelta(hours=48)
    threshold_str = threshold.strftime('%Y-%m-%d %H:%M:%S')
    
    # Reset all to OK first
    cursor.execute("UPDATE zone_coverage SET status = 'OK'")
    
    # Update overdue zones
    cursor.execute('''
        UPDATE zone_coverage 
        SET status = 'OVERDUE' 
        WHERE last_visited < ?
    ''', (threshold_str,))
    
    # Fetch exactly what was marked overdue for printing
    cursor.execute('''
        SELECT zone, last_visited FROM zone_coverage 
        WHERE status = 'OVERDUE'
    ''')
    overdue_zones = cursor.fetchall()
    
    conn.commit()
    conn.close()
    
    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] Coverage Gap Scan Complete.")
    print(f"Found {len(overdue_zones)} Silent Zones marked as OVERDUE (>48h without a truck):")
    for z in overdue_zones[:10]: # Print top 10 so we don't spam the terminal
        print(f"  - {z[0]} (Last Visited: {z[1]})")
    if len(overdue_zones) > 10:
        print(f"  ... and {len(overdue_zones) - 10} more.")
        
    return overdue_zones

if __name__ == '__main__':
    print("Setting up Zone Coverage DB Layer...")
    setup_coverage_table()
    compute_coverage_gaps()
