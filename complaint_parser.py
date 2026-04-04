import os
import json
import sys
import google.generativeai as genai
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)

VALID_ZONES = [
    "Airoli", "Andheri", "Bandra", "Belapur", "Bhayander", "Borivali", 
    "CST", "Chembur", "Churchgate", "Colaba", "Dadar", "Dharavi", 
    "Fort", "Ghatkopar", "Goregaon", "Hiranandani", "Jogeshwari", 
    "Juhu", "Kandivali", "Kurla", "Lower Parel", "Malad", "Matunga", 
    "Mulund", "Parel", "Powai", "Santacruz", "Sion", "Thane", 
    "Versova", "Vikhroli", "Vile Parle", "Wadala", "Worli"
]

VALID_ISSUES = ["Garbage", "Drainage", "Roads", "Water"]


def _safe_log(message: str) -> None:
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    safe_text = str(message).encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe_text)

def extract_complaint_details(transcript: str) -> dict:
    """
    Uses Gemini 1.5/2.0 Flash to detect language, translate to English, 
    extract structured data, and generate a translated response.
    Unified prompt for maximum speed (low latency).
    """
    if not API_KEY:
        return {"error": "API Key not configured"}

    prompt = f"""
    You are professional AI Urban Dispatcher for NagarFlow, Mumbai.
    Your personality is helpful, polite, and efficient. You represent the city's commitment to excellence.

    ### Standard Zones:
    {', '.join(VALID_ZONES)}

    ### Standard Issues:
    {', '.join(VALID_ISSUES)}

    ### Your Core Mission:
    0. **High-Quality English Summary**: ALWAYS provide a clean, professional, 1-sentence English summary of the user's request. This will be the official city record.
    1. **Conversational Intelligence**: If the user asks general questions (e.g., "What is NagarFlow?", "Who are you?", "How does this help?"), answer them briefly and politely, then steer back to taking their complaint if they haven't finished.
    2. **Language Strictness**:
       - You MUST respond in either **Pure Hindi** (using Devnagari script if possible, or clean transliteration) or **Pure English**.
       - **Strictly FORBID Hinglish** (mixing languages) in your native response (`reply_text_native`). If the user speaks Hinglish, respond in the primary language they seem more comfortable with, but keep it pure.
    3. **Granular Extraction**:
       - **Zone**: Match the best Ward from the list.
       - **Specific Location**: Extract the most detailed landmark, street name, or sector mentioned (e.g., "Ghansoli Station Gate 2", "Sector 3 near hospital").
    4. **Smart Filing**: 
       - If a user mentions a specific area that is NOT in the Standard Zones list, capture it in `specific_location` and set `zone` to "Unknown".
       - **CRITICAL**: If a user mentions BOTH a ward (e.g., Andheri) and a specific locality (e.g., Chakala), the `specific_location` MUST be the detailed one (Chakala), while `zone` matches the ward.
       - As long as an `issue_type` is detected, we will file the complaint!

    ### Voice Transcript:
    "{transcript}"

    ### Output JSON Schema:
    {{
      "input_language": "Hindi" | "English",
      "is_english": boolean,
      "translated_input_en": "Standardized English version of the user request",
      "zone": "Match to one string from the Standard Zones list or 'Unknown'",
      "specific_location": "The MOST SPECIFIC neighborhood, street, or landmark name mentioned (e.g., 'Chakala', 'Gully No 4'). DO NOT just repeat the Ward name if a better sub-locality exists.",
      "issue_type": "Match to one string from the Standard Issues list or 'General'",
      "severity": "High" | "Medium" | "Low",
      "is_closing": boolean,
      "reply_text_en": "Response in English",
      "reply_text_native": "Response in Pure Hindi or Pure English (Match detected comfort level, NO Hinglish)"
    }}

    Return ONLY the valid JSON object.
    """

    try:
        # Use 'gemini-1.5-flash' for stable high-performance/low-latency
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        
        text = response.text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
            
        data = json.loads(text)
        
        # Logging for debugging without crashing Windows terminals on Unicode output
        _safe_log(
            f"Multilingual Engine: {data.get('input_language')} -> {data.get('translated_input_en')}"
        )
        
        return data
    except Exception as e:
        _safe_log(f"Gemini Multilingual Extraction Failed: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    # Test cases
    test_1 = "Dharavi area mein bohot kachra jama ho gaya hai, please utha lijiye"
    test_2 = "Bandra station ke paas pipe leak ho raha hai paani barbad ho raha hai"
    test_3 = "नमस्ते, धारावी में कचरा पड़ा है।"
    test_4 = "आप यहाँ कॉल खत्म कर सकते हो"
    test_5 = "ठीक है शुक्रिया, बस इतना ही"
    
    print("Test 1 (Hinglish Garbage):", extract_complaint_details(test_1))
    print("Test 2 (Hinglish Water):", extract_complaint_details(test_2))
    print("Test 3 (Hindi):", extract_complaint_details(test_3))
    print("Test 4 (Closing - Hindi command):", extract_complaint_details(test_4))
    print("Test 5 (Closing - Shukriya):", extract_complaint_details(test_5))
