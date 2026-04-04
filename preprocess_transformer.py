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
    # Detect if any complaint ID starts with 'VOICE-' to prioritize call-based reports
    cursor.execute('''
        SELECT zone, SUM(complaint_count), GROUP_CONCAT(DISTINCT issue_type),
               MAX(CASE WHEN id LIKE 'VOICE-%' THEN 1 ELSE 0 END) as carries_voice
        FROM complaints
        GROUP BY zone
    ''')
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
        
        # Fetch calculated hours
        hours_since = coverage_data.get(zone_name, 0)
        
        # Check if this zone has an emergency call
        has_voice = "yes" if row[3] == 1 else "no"
        
        # Construct the final prompt string matching the spec perfectly:
        prompt_text = f"Zone: {zone_name}. Complaints: {total_complaints}. Keywords: {keywords}. Rain: {rain_status}. Last visited: {hours_since} hours ago. Voice: {has_voice}."
        
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
