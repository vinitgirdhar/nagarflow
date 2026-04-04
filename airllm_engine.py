import sqlite3
import json
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
    import random
    try:
        complaints = int(prompt.split('Complaints: ')[1].split('.')[0])
        rain_val = prompt.split('Rain: ')[1].split('.')[0].strip().lower()
        hours = int(prompt.split('Last visited: ')[1].split(' ')[0])
    except Exception:
        complaints, rain_val, hours = 10, 'no', 10 # fail-safe
    
    # Check for explicit priority override (e.g. from call-based complaints)
    force_priority = "voice: yes" in prompt.lower()
    
    # Dynamic demand logic: Normalize massive complaint numbers (max ~45k) to a 0-70 scale 
    # so the UI isn't permanently red-zoned at 100%.
    normalized_complaints_score = min(70, (complaints / 45000.0) * 70)
    
    # Add dynamic volatility (noise) so the dashboard looks constantly active between predictions
    volatility = random.uniform(-4, 4)
    
    # Weather and unvisited gaps pile on top of the base demand
    raw_score = normalized_complaints_score + volatility + (20 if rain_val == 'yes' else 0) + min(15, (hours / 6.0))
    
    if force_priority:
        score = 100
    else:
        score = int(max(0, min(100, raw_score)))
    
    if score >= 75:
        p_type = "high"
        action = "Immediate Dispatch Required"
    elif score >= 50:
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

    return {
        "priority_score": score,
        "type": p_type,
        "action": action,
        "reason": reason
    }

def run_airllm_engine():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Clean old predictions to avoid clutter (for MVP)
    cursor.execute('DELETE FROM predictions')
    
    prompts = build_llm_payloads()
    print(f"\n[AiRLLM Engine] Simulating LLM JSON Inference for {len(prompts)} zones...")
    
    for p in prompts:
        zone = p['zone']
        # 1. Ask AiRLLM for priority, type, action, reason
        prediction = simulate_llm_inference(p)
        
        # 2. Parse and save JSON to predictions table
        cursor.execute('''
            INSERT INTO predictions (zone, priority_score, type, action, reason)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            zone, 
            prediction['priority_score'], 
            prediction['type'], 
            prediction['action'], 
            prediction['reason']
        ))
        
    conn.commit()
    conn.close()
    
    print("[AiRLLM Engine] Inference complete. Predictions JSON saved to database.")

if __name__ == '__main__':
    run_airllm_engine()
