import json
import math
import random
import hashlib
from preprocess_transformer import build_llm_payloads

import os
import requests

DB_PATH = 'nagarflow.db'
# Configure your endpoint or keep blank to use the local smart simulator fallback
AIRLLM_API_ENDPOINT = os.getenv("AIRLLM_API_ENDPOINT", "")

def simulate_llm_inference(prompt_data):
    """
    Attempts to query a live LLM endpoint or local AirLLM library.
    Falls back to a heuristic simulator if not configured, guaranteeing the UI never breaks.
    """
    prompt = prompt_data['prompt']
    
    if AIRLLM_API_ENDPOINT:
        try:
            sys_prompt = {"prompt": f"Analyze the following urban zone data and return ONLY a valid JSON object matching this schema: {{\"priority_score\": int (0-100), \"type\": \"high\"|\"medium\"|\"low\", \"action\": string, \"reason\": string}}. Data: {prompt}", "max_tokens": 200}
            response = requests.post(f"{AIRLLM_API_ENDPOINT}/v1/chat", json=sys_prompt, timeout=10)
            if response.status_code == 200:
                # Example parser for OpenAI-style or raw text endpoints
                response_data = response.json()
                res_text = response_data.get('choices', [{}])[0].get('text', '') or str(response_data)
                
                # Extract JSON block
                import re
                match = re.search(r'\{.*\}', res_text, re.DOTALL)
                if match:
                    return json.loads(match.group(0))
        except Exception as e:
            print(f"⚠️ Live LLM API Error ({e}). Falling back to local heuristic simulator...")

    # Optional local python library stub (if running airllm natively instead of API):
    # try:
    #     from airllm import AirLLMLlama2
    #     model = AirLLMLlama2("model-name")
    #     response = model.generate(prompt)
    #     # parse response here...
    # except ImportError:
    #     pass

    # --- Heuristics extraction for realism fallback ---
    try:
        complaints = int(prompt.split('Complaints: ')[1].split('.')[0])
        rain_val = prompt.split('Rain: ')[1].split('.')[0].strip().lower()
        hours = int(prompt.split('Last visited: ')[1].split(' ')[0])
    except Exception:
        complaints, rain_val, hours = 10, 'no', 10 # fail-safe
    
    # Check for explicit priority override (e.g. from call-based complaints)
    force_priority = "voice: yes" in prompt.lower()
    
    # 1. Logarithmic Complaint Scaling (Prevents clumping in heavy wards)
    log_complaints = math.log10(max(1, complaints))
    
    # 2. Zone Stability Seed (Unique but consistent personality per ward)
    seed_hash = int(hashlib.md5(prompt_data['zone'].encode()).hexdigest(), 16)
    random_gen = random.Random(seed_hash)
    zone_volatility = random_gen.uniform(-5, 5)
    
    # 3. Base Raw Score Calculation
    # Factors: Complaints (Log), Rain, Gaps, and Stability Seed
    raw_score = (log_complaints * 10) + zone_volatility + (20 if rain_val == 'yes' else 0) + min(15, (hours / 4.0))
    
    # Heuristic Assignment (Will be refined by global normalization later)
    if raw_score >= 60 or force_priority:
        p_type = "high"
        action = "Immediate Dispatch Required"
    elif raw_score >= 40:
        p_type = "medium"
        action = "Schedule Next Available Truck"
    else:
        p_type = "low"
        action = "Monitor Zone"

    reason = f"{complaints} complaints"
    if force_priority:
        reason = "Emergency Voice Report"
    elif rain_val == 'yes':
        reason += ", Heavy Rain Alert"
    if hours > 48 and not force_priority:
        reason += f", Overdue by {hours}hrs silent gap"

    # Categorization Heuristics
    if force_priority:
        category = "Emergency Response"
    elif rain_val == 'yes':
        category = "Drainage Maintenance"
    elif complaints > 25000:
        category = "Garbage Collection"
    elif hours > 60:
        category = "Utility Inspection"
    else:
        # Use deterministic random for stable category
        category = random_gen.choice(["Garbage Collection", "Water Tanker Demand", "Road Maintenance"])

    return {
        "raw_score": raw_score,
        "force_priority": force_priority,
        "type": p_type,
        "action": action,
        "reason": reason,
        "category": category
    }

def run_airllm_engine():
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM predictions')
    prompts = build_llm_payloads()
    print(f"\n[AiRLLM Engine] Calculating Logarithmic City Heartbeat for {len(prompts)} zones...")
    
    results = []
    for p in prompts:
        pred = simulate_llm_inference(p)
        results.append({'zone': p['zone'], **pred})
        
    # --- Global Normalization Pass (Professional 30-90% Range) ---
    raws = [r['raw_score'] for r in results]
    min_raw = min(raws)
    max_raw = max(raws)
    range_raw = max_raw - min_raw if max_raw != min_raw else 1
    
    for r in results:
        # Scale base score between 30 and 82
        scaled = 30 + ((r['raw_score'] - min_raw) / range_raw) * 52
        
        # If force priority, bump to emergency band (84-90)
        if r['force_priority']:
            r['priority_score'] = random.randint(84, 90)
            r['type'] = "high"
        else:
            r['priority_score'] = int(scaled)
            # Re-classify type based on normalized score for consistency
            if r['priority_score'] >= 80: r['type'] = "high"
            elif r['priority_score'] >= 55: r['type'] = "medium"
            else: r['type'] = "low"
            
        cursor.execute('''
            INSERT INTO predictions (zone, priority_score, type, action, reason, category)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            r['zone'], 
            r['priority_score'], 
            r['type'], 
            r['action'], 
            r['reason'],
            r['category']
        ))
        
    conn.commit()
    conn.close()
    print("[AiRLLM Engine] Normalization complete. Diversified city state saved.")

if __name__ == '__main__':
    run_airllm_engine()
