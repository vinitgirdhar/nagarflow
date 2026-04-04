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
    You are an AI Urban Dispatcher for Mumbai City (NagarFlow).
    Your task is to analyze a user's voice transcript or message.

    ### Standard Zones:
    {', '.join(VALID_ZONES)}

    ### Standard Issues:
    {', '.join(VALID_ISSUES)}

    ### Instruction Details:
    1. **Detect Language**: Identify the input language (Hindi, Marathi, English, Hinglish, etc.).
    2. **English Translation**: Translate the core complaint into a clean 1-sentence English summary.
    3. **Data Extraction**: Extract the target Zone and Issue Type based on standard lists.
    4. **Response Generation**: 
       - Generate a polite, short confirmation in English.
       - Translate that exact confirmation back to the User's Original Language.

    ### Voice Transcript:
    "{transcript}"

    ### Output JSON Schema:
    {{
      "input_language": "string",
      "is_english": boolean,
      "translated_input_en": "Standardized English version of the user request",
      "zone": "Match to one string from the Standard Zones list or 'Unknown'",
      "issue_type": "Match to one string from the Standard Issues list or 'General'",
      "severity": "High" | "Medium" | "Low",
      "is_closing": boolean (true if user says goodbye, no more issues, or bas/that's it/shukriya/dhanyavad. Also true for Hindi commands like 'कॉल खत्म करो', 'बस इतना ही', or 'आप यहाँ कॉल खत्म कर सकते हो'),
      "reply_text_en": "Response in English",
      "reply_text_native": "Response translated back to the user's detected language"
    }}

    Return ONLY the valid JSON object. No markdown, no filler.
    """

    try:
        # Use 'gemini-2.5-flash' for latest high-performance/low-latency
        model = genai.GenerativeModel("gemini-2.5-flash")
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
