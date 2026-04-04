import sqlite3
from datetime import datetime

DB_PATH = 'nagarflow.db'

def get_current_weather(cursor):
    """Retrieve the global rain status from the database."""
    cursor.execute("SELECT value FROM global_status WHERE key='current_rain_status'")
    res = cursor.fetchone()
    # Handle potentially missing rows
    if res and res[0] == 'Yes':
        return 'yes'
    return 'no'

def get_zone_coverage(cursor):
    """Calculate the hours since the last truck visit for each zone."""
    cursor.execute("SELECT zone, last_visited FROM zone_coverage")
    coverage_data = {}
    now = datetime.now()
    
    for row in cursor.fetchall():
        zone, last_vis = row[0], row[1]
        try:
            lv_date = datetime.strptime(last_vis, '%Y-%m-%d %H:%M:%S')
            hours_diff = int((now - lv_date).total_seconds() / 3600)
        except Exception:
            hours_diff = 0
        coverage_data[zone] = hours_diff
        
    return coverage_data

def build_llm_payloads():
    """Aggregate data and build the exact text block for the LLM prompt."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    rain_status = get_current_weather(cursor)
    coverage_data = get_zone_coverage(cursor)
    
    # Aggregate complaints (total count and unique keywords) for each zone
    # Detect if any complaint ID starts with 'VOICE-' in the last 2 hours
    two_hours_ago = (datetime.now().replace(microsecond=0) - (datetime.now() - datetime.now())).strftime('%Y-%m-%d %H:%M:%S')
    # Actually, simpler:
    import datetime as dtbase
    recent_threshold = (datetime.now() - dtbase.timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S')

    cursor.execute('''
        SELECT zone, SUM(complaint_count), GROUP_CONCAT(DISTINCT issue_type),
               MAX(CASE WHEN id LIKE 'VOICE-%' AND timestamp >= ? THEN 1 ELSE 0 END) as carries_voice,
               GROUP_CONCAT(DISTINCT locality), AVG(population)
        FROM complaints
        GROUP BY zone
    ''', (recent_threshold,))
    zones_data = cursor.fetchall()
    
    prompts = []
    
    print("🚀 Nagarflow Preprocessing Transformer initialized!")
    print("Formatting cross-table data for AiRLLM...\n")
    
    for row in zones_data:
        zone_name = row[0]
        total_complaints = row[1]
        
        # Clean up issue types to format as keywords
        issue_raw = row[2]
        keywords = issue_raw.lower().replace(",", ", ") if issue_raw else "none"
        
        # New: Localities list with density context
        # Group by locality to find top 3 hotspots
        cursor.execute('''
            SELECT locality, SUM(complaint_count) as loc_count
            FROM complaints
            WHERE zone = ?
            GROUP BY locality
            ORDER BY loc_count DESC
            LIMIT 3
        ''', (zone_name,))
        top_locs = cursor.fetchall()
        locality_context = ", ".join([f"{l[0]} ({l[1]})" for l in top_locs]) if top_locs else "various"
        
        # New: Population
        avg_pop = int(row[5]) if row[5] else 0
        
        # Fetch calculated hours
        hours_since = coverage_data.get(zone_name, 0)
        
        # Check if this zone has an emergency call
        has_voice = "yes" if row[3] == 1 else "no"
        
        # Construct the final prompt string matching the spec perfectly:
        prompt_text = f"Zone: {zone_name}. Hotspots: {locality_context}. Total Complaints: {total_complaints}. Pop: {avg_pop}. Keywords: {keywords}. Rain: {rain_status}. Last visited: {hours_since} hours ago. Voice: {has_voice}."
        
        prompts.append({
            "zone": zone_name,
            "prompt": prompt_text
        })
        
    # Simulate saving or returning these payloads
    for p in prompts[:10]:
        print(p['prompt'])
        
    if len(prompts) > 10:
        print(f"... and {len(prompts) - 10} other zones formatted successfully.")
        
    conn.close()
    return prompts

if __name__ == '__main__':
    build_llm_payloads()
