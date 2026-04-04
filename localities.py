import re
import unicodedata

ZONE_ALIAS_MAP = {
    "Airoli": ["ऐरोली", "airoli station"],
    "Andheri": ["अंधेरी", "andari", "andheri east", "andheri west"],
    "Bandra": ["बांद्रा", "bandra west", "bandra east", "banra"],
    "Belapur": ["बेलापुर"],
    "Bhayander": ["भायंदर", "bhayandar"],
    "Borivali": ["बोरीवली", "borivli", "borivali west", "borivali east"],
    "CST": ["csmt", "vt", "वीटी", "छत्रपति शिवाजी टर्मिनस", "cst station"],
    "Chembur": ["चेंबूर"],
    "Churchgate": ["church gate", "चर्चगेट"],
    "Colaba": ["कुलाबा", "kolaba"],
    "Dadar": ["दादर"],
    "Dharavi": ["धारावी"],
    "Fort": ["फोर्ट"],
    "Ghatkopar": ["घाटकोपर"],
    "Goregaon": ["गोरेगांव", "गोरगांव"],
    "Hiranandani": ["हिरानंदानी", "hiranandani gardens"],
    "Jogeshwari": ["जोगेश्वरी"],
    "Juhu": ["जुहू"],
    "Kandivali": ["कांदिवली", "kandivli"],
    "Kurla": ["कुर्ला", "kula"],
    "Lower Parel": ["लोअर परेल"],
    "Malad": ["मालाड"],
    "Matunga": ["माटुंगा"],
    "Mulund": ["मुलुंड"],
    "Parel": ["परेल"],
    "Powai": ["पवई"],
    "Santacruz": ["सांताक्रूज़", "santacruz east", "santacruz west"],
    "Sion": ["सायन", "shion"],
    "Thane": ["ठाणे"],
    "Versova": ["वर्सोवा"],
    "Vikhroli": ["विक्रोली"],
    "Vile Parle": ["विले पार्ले", "vile parle east", "vile parle west"],
    "Wadala": ["वडाला"],
    "Worli": ["वरली"],
}

def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "").lower()
    normalized = re.sub(r"[^\w\s\u0900-\u097F]", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()

def find_zone_and_locality(text: str):
    """
    Standard logic to find a zone and a sub-locality.
    Returns (zone, locality) or ("Unknown", "Unknown").
    """
    normalized = _normalize_text(text)
    detected_zone = "Unknown"
    detected_locality = "General"

    # 1. Look for Wards (Zones)
    for zone, aliases in ZONE_ALIAS_MAP.items():
        all_aliases = [zone.lower()] + [a.lower() for a in aliases]
        for alias in all_aliases:
            if re.search(rf"\b{re.escape(alias)}\b", normalized):
                detected_zone = zone
                break
        if detected_zone != "Unknown":
            break

    # 2. Extract Locality (Simplified: look for common residential suffixes)
    # This is a heuristic for now; for production, we use the specific_location from Gemini.
    # In this script, we'll just try to pick up phrases near the zone.
    words = normalized.split()
    for i, word in enumerate(words):
        if word in ["nagar", "colony", "station", "road", "gully", "sector", "society", "complex"]:
            if i > 0:
                detected_locality = f"{words[i-1].capitalize()} {word.capitalize()}"
                break
    
    return detected_zone, detected_locality
