import os
import json
import sys
from groq import Groq
from dotenv import load_dotenv
from localities import get_locality_context_for_prompt, find_zone_and_locality

load_dotenv()

API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=API_KEY) if API_KEY else None

VALID_ZONES = [
    "Airoli", "Andheri", "Bandra", "Belapur", "Bhayander", "Borivali",
    "CST", "Chembur", "Churchgate", "Colaba", "Dadar", "Dharavi",
    "Fort", "Ghatkopar", "Goregaon", "Hiranandani", "Jogeshwari",
    "Juhu", "Kandivali", "Kurla", "Lower Parel", "Malad", "Matunga",
    "Mulund", "Parel", "Powai", "Santacruz", "Sion", "Thane",
    "Versova", "Vikhroli", "Vile Parle", "Wadala", "Worli"
]

VALID_ISSUES = ["Garbage", "Drainage", "Roads", "Water"]

# Pre-built locality context injected into every prompt
_LOCALITY_CONTEXT = get_locality_context_for_prompt()


def _safe_log(message: str) -> None:
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    safe_text = str(message).encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe_text)


def extract_complaint_details(transcript: str) -> dict:
    """
    Uses Groq (llama-3.3-70b-versatile) to detect language, translate to English,
    extract structured data, and generate a translated response.
    """
    if not client:
        return {"error": "GROQ_API_KEY not configured"}

    prompt = f"""
    You are the NagarFlow AI Agent, a warm and conversational male civic helpline agent for NagarFlow, Mumbai.
    You speak like a real human call-center agent — empathetic, natural, and never robotic.
    You refer to yourself using male Hindi grammar (e.g., "main kar sakta hoon", "kar deta hoon", "darj kar diya").
    You care about the resident's problem and make them feel heard.

    ### Standard Zones:
    {', '.join(VALID_ZONES)}

    ### Standard Issues:
    {', '.join(VALID_ISSUES)}

    ### Mumbai Sub-Locality Reference (Zone → known neighbourhoods):
    Use this map to resolve vague mentions like "near lokhandwala", "mindspace area", "bkc side".
    If a sub-locality is mentioned, set `zone` to its parent zone and `specific_location` to the sub-locality name.
{_LOCALITY_CONTEXT}

    ### Your Core Mission:
    0. **High-Quality English Summary**: ALWAYS provide a clean, 1-sentence English summary for the official city record.
    1. **Human-like Conversation**: Sound warm and real. Acknowledge the problem before confirming it.
       - Good: "Oh, Andheri mein itna garbage — samajh sakta hoon kitna frustrating hoga. Maine complaint darj kar di."
       - Bad: "Your complaint has been registered."
       If the user asks general questions ("Who are you?", "What is NagarFlow?"), answer briefly and naturally, then guide back.
    2. **Language**:
       - Match the user's language — Hindi speakers get Hindi, English speakers get English.
       - Hinglish input → respond in the dominant language (usually Hindi), but keep `reply_text_native` pure (no mixing).
    3. **Granular Extraction**:
       - **Zone**: Best match from the Standard Zones list.
       - **Specific Location**: Most detailed landmark/street/sector mentioned (e.g., "Chakala Station Road", "Sector 9 near school").
    4. **Smart Filing**:
       - Unknown area → put it in `specific_location`, set `zone` to "Unknown".
       - Both ward + locality mentioned → `zone` = ward, `specific_location` = locality.
       - File the complaint as long as `issue_type` is detected.
    5. **Call Closing Detection** (`is_closing: true`) when the user says any of:
       - Thank you, thanks, shukriya, dhanyawad, dhanyavaad, शुक्रिया, धन्यवाद
       - Goodbye, bye, theek hai, okay bye, bas, bas itna hi, nothing else, that's all
       - Any short polite farewell — even mid-sentence like "ok shukriya bas".

    ### Voice Transcript:
    "{transcript}"

    ### Output JSON Schema:
    {{
      "input_language": "Hindi" | "English",
      "is_english": boolean,
      "translated_input_en": "Standardized English version of the user request",
      "zone": "Match to one string from the Standard Zones list or 'Unknown'",
      "specific_location": "The MOST SPECIFIC neighborhood, street, or landmark name mentioned. DO NOT just repeat the Ward name if a better sub-locality exists.",
      "issue_type": "Match to one string from the Standard Issues list or 'General'",
      "severity": "High" | "Medium" | "Low",
      "is_closing": boolean,
      "reply_text_en": "Response in English",
      "reply_text_native": "Response in Pure Hindi or Pure English (Match detected comfort level, NO Hinglish)"
    }}

    Return ONLY the valid JSON object, no markdown, no explanation.
    """

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1024,
        )

        text = response.choices[0].message.content.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        data = json.loads(text)

        # Post-process: if Groq couldn't resolve zone/locality, run local lookup
        if data.get("zone", "Unknown") == "Unknown" or not data.get("specific_location"):
            local_zone, local_locality = find_zone_and_locality(transcript)
            if local_zone != "Unknown":
                if data.get("zone", "Unknown") == "Unknown":
                    data["zone"] = local_zone
                if not data.get("specific_location"):
                    data["specific_location"] = local_locality

        _safe_log(
            f"Groq Extraction: [{data.get('input_language')}] "
            f"{data.get('zone')} / {data.get('specific_location')} → "
            f"{data.get('translated_input_en')}"
        )
        return data

    except Exception as e:
        _safe_log(f"Groq Extraction Failed: {e}")
        return {"error": str(e)}


if __name__ == "__main__":
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
