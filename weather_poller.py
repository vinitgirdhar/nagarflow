import sqlite3
import requests
import time
from datetime import datetime

# Open-Meteo allows free access to NOAA / global forecast models without an API key
WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"
DB_PATH = "nagarflow.db"

# Coordinates for Mumbai (Central point used for MVP logic)
LATITUDE = 19.0760
LONGITUDE = 72.8777

def check_heavy_rain():
    """Ping weather API to check if it's currently raining."""
    try:
        response = requests.get(WEATHER_API_URL, params={
            "latitude": LATITUDE,
            "longitude": LONGITUDE,
            "current_weather": True
        })
        data = response.json()
        current = data.get("current_weather", {})
        
        # WMO Weather interpretation codes indicating rain/showers/thunderstorm
        # 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99 indicate precipitation
        weather_code = current.get("weathercode", 0)
        rain_codes = [61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]
        
        is_raining = weather_code in rain_codes
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Weather Code: {weather_code} | Rain Detected: {is_raining}")
        return 'Yes' if is_raining else 'No'
    except Exception as e:
        print(f"Error fetching weather data: {e}")
        return 'Unknown'

def update_weather_db(weather_status):
    """Save the global weather status to the database for AiRLLM preprocessing."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Ensure a global_status table exists to hold the live weather state
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS global_status (
            key TEXT PRIMARY KEY,
            value TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        INSERT OR REPLACE INTO global_status (key, value, last_updated)
        VALUES ('current_rain_status', ?, CURRENT_TIMESTAMP)
    ''', (weather_status,))
    
    conn.commit()
    conn.close()

def start_polling(interval_minutes=15):
    print(f"Starting NOAA/Open-Meteo Weather Poller. Polling every {interval_minutes} minutes...")
    # First instant execution so we don't have to wait 15 minutes
    weather_status = check_heavy_rain()
    update_weather_db(weather_status)
    print(f"Local Database Updated with global weather state: Rain = {weather_status}")
    print("Waiting for next polling cycle...\n")
    
    # Then loop (temporarily disabled for safe script execution so terminal doesn't lock up)
    # To run permanently, uncomment the loop below:
    # while True:
    #     time.sleep(interval_minutes * 60)
    #     weather_status = check_heavy_rain()
    #     update_weather_db(weather_status)
    #     print("Database updated. Waiting for next polling cycle...\n")

if __name__ == "__main__":
    start_polling(interval_minutes=15)
