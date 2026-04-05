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

# Sub-locality names grouped by parent zone (both English and Hindi/Devanagari).
# Used when Gemini is unavailable to extract the most specific location from text.
SUB_LOCALITY_MAP: dict[str, list[tuple[str, str]]] = {
    "Andheri": [
        ("Chakala", "चकाला"), ("Mogra", "मोगरा"), ("Marol", "मरोल"),
        ("Sahar", "सहार"), ("Lokhandwala", "लोखंडवाला"), ("Azad Nagar", "आजाद नगर"),
        ("MIDC", "एमआईडीसी"), ("JB Nagar", "जेबी नगर"), ("Oshiwara", "ओशिवारा"),
        ("Versova", "वर्सोवा"), ("Four Bungalows", "फोर बंगलोज"),
        ("Andheri Station", "अंधेरी स्टेशन"), ("DN Nagar", "डीएन नगर"),
        ("Millat Nagar", "मिल्लत नगर"), ("Gilbert Hill", "गिल्बर्ट हिल"),
        ("Sher-E-Punjab", "शेर-ए-पंजाब"), ("Veera Desai", "वीरा देसाई"),
    ],
    "Bandra": [
        ("Bandra Reclamation", "बांद्रा रिक्लेमेशन"), ("Carter Road", "कार्टर रोड"),
        ("Hill Road", "हिल रोड"), ("Linking Road", "लिंकिंग रोड"),
        ("Pali Hill", "पाली हिल"), ("Khar", "खार"), ("Turner Road", "टर्नर रोड"),
        ("Mehboob Studio", "मेहबूब स्टूडियो"), ("Bandra Station", "बांद्रा स्टेशन"),
    ],
    "Borivali": [
        ("IC Colony", "आईसी कॉलोनी"), ("Eksar", "एक्सार"), ("Dahisar", "दहिसर"),
        ("Borivali Station", "बोरीवली स्टेशन"), ("Rajendra Nagar", "राजेंद्र नगर"),
        ("Shimpoli", "शिम्पोली"), ("Kandarpada", "कांदरपाडा"),
    ],
    "Dharavi": [
        ("Dharavi Cross Road", "धारावी क्रॉस रोड"), ("90 Feet Road", "90 फीट रोड"),
        ("Kumbharwada", "कुम्भारवाडा"), ("Transit Camp", "ट्रांजिट कैम्प"),
    ],
    "Ghatkopar": [
        ("Ghatkopar East", "घाटकोपर पूर्व"), ("Ghatkopar West", "घाटकोपर पश्चिम"),
        ("Asalpha", "असल्फा"), ("Jawahar Nagar", "जवाहर नगर"),
        ("Pantnagar", "पंतनगर"), ("Vallabhbaug", "वल्लभबाग"),
    ],
    "Goregaon": [
        ("Aarey Colony", "आरे कॉलोनी"), ("Film City", "फिल्म सिटी"),
        ("Goregaon East", "गोरेगांव पूर्व"), ("Goregaon West", "गोरेगांव पश्चिम"),
        ("Jawahar Nagar", "जवाहर नगर"), ("Oberoi", "ओबेरॉय"),
    ],
    "Kandivali": [
        ("Kandivali East", "कांदिवली पूर्व"), ("Kandivali West", "कांदिवली पश्चिम"),
        ("Charkop", "चारकोप"), ("Akurli", "अकुर्ली"),
        ("Samata Nagar", "समता नगर"), ("Thakur Village", "ठाकुर विलेज"),
        ("Thakur Complex", "ठाकुर कॉम्प्लेक्स"),
    ],
    "Kurla": [
        ("Kurla East", "कुर्ला पूर्व"), ("Kurla West", "कुर्ला पश्चिम"),
        ("Nehru Nagar", "नेहरू नगर"), ("BKC", "बीकेसी"),
        ("Bandra Kurla Complex", "बांद्रा कुर्ला कॉम्प्लेक्स"),
    ],
    "Malad": [
        ("Malad East", "मालाड पूर्व"), ("Malad West", "मालाड पश्चिम"),
        ("Orlem", "ओरलेम"), ("Marve", "मार्वे"), ("Kurar", "कुरार"),
        ("Dindoshi", "दिंडोशी"), ("Sunder Nagar", "सुंदर नगर"),
    ],
    "Powai": [
        ("Hiranandani Gardens", "हिरानंदानी गार्डन्स"), ("IIT", "आईआईटी"),
        ("Vikhroli Link Road", "विक्रोली लिंक रोड"), ("Chandivali", "चांदीवली"),
    ],
    "Santacruz": [
        ("Santacruz East", "सांताक्रूज़ पूर्व"), ("Santacruz West", "सांताक्रूज़ पश्चिम"),
        ("Vakola", "वाकोला"), ("Kalina", "कलिना"),
    ],
    "Vile Parle": [
        ("Vile Parle East", "विले पार्ले पूर्व"), ("Vile Parle West", "विले पार्ले पश्चिम"),
        ("Nehru Road", "नेहरू रोड"),
    ],
    "Dadar": [
        ("Dadar TT", "दादर टीटी"), ("Shivaji Park", "शिवाजी पार्क"),
        ("Plaza", "प्लाज़ा"), ("Dadar East", "दादर पूर्व"), ("Dadar West", "दादर पश्चिम"),
    ],
    "Chembur": [
        ("Chembur Colony", "चेंबूर कॉलोनी"), ("Diamond Garden", "डायमंड गार्डन"),
        ("Sion Koliwada", "सायन कोलीवाडा"), ("Tilak Nagar", "तिलक नगर"),
    ],
    "Mulund": [
        ("Mulund East", "मुलुंड पूर्व"), ("Mulund West", "मुलुंड पश्चिम"),
        ("LBS Road", "एलबीएस रोड"), ("Nahur", "नाहुर"),
    ],
    "Thane": [
        ("Kopri", "कोपरी"), ("Wagle Estate", "वागले एस्टेट"),
        ("Majiwada", "माजीवाडा"), ("Manpada", "मानपाडा"),
        ("Ghansoli", "घणसोली"), ("Kalwa", "कल्वा"),
    ],
}


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "").lower()
    normalized = re.sub(r"[^\w\s\u0900-\u097F]", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def find_zone_and_locality(text: str) -> tuple[str, str]:
    """
    Extract the zone and most specific sub-locality from text.
    Returns (zone, locality). Falls back to (zone, zone) if no sub-locality found.
    """
    normalized = _normalize_text(text)
    detected_zone = "Unknown"
    detected_locality = None

    # 1. Detect zone from alias map
    for zone, aliases in ZONE_ALIAS_MAP.items():
        all_aliases = [zone.lower()] + [a.lower() for a in aliases]
        for alias in all_aliases:
            alias_norm = unicodedata.normalize("NFKC", alias).lower()
            # Use word boundary for ASCII aliases, substring match for Devanagari
            if alias_norm and any(ord(c) > 127 for c in alias_norm):
                if alias_norm in normalized:
                    detected_zone = zone
                    break
            elif re.search(rf"\b{re.escape(alias_norm)}\b", normalized):
                detected_zone = zone
                break
        if detected_zone != "Unknown":
            break

    # 2. Try sub-locality map for the detected zone first (most accurate)
    if detected_zone != "Unknown" and detected_zone in SUB_LOCALITY_MAP:
        for eng_name, hindi_name in SUB_LOCALITY_MAP[detected_zone]:
            eng_normalized = eng_name.lower()
            hindi_normalized = unicodedata.normalize("NFKC", hindi_name).lower()
            if re.search(rf"\b{re.escape(eng_normalized)}\b", normalized):
                detected_locality = eng_name
                break
            if hindi_normalized in normalized:
                detected_locality = eng_name
                break

    # 3. Fallback: scan ALL sub-localities across zones (catches cross-zone mentions)
    if not detected_locality:
        for zone_subs in SUB_LOCALITY_MAP.values():
            for eng_name, hindi_name in zone_subs:
                eng_normalized = eng_name.lower()
                hindi_normalized = unicodedata.normalize("NFKC", hindi_name).lower()
                if re.search(rf"\b{re.escape(eng_normalized)}\b", normalized):
                    detected_locality = eng_name
                    break
                if hindi_normalized in normalized:
                    detected_locality = eng_name
                    break
            if detected_locality:
                break

    # 4. Suffix heuristic fallback (nagar, colony, station, road, etc.)
    if not detected_locality:
        words = normalized.split()
        suffixes = {"nagar", "colony", "station", "road", "gully", "sector",
                    "society", "complex", "village", "camp", "chawl", "wadi"}
        for i, word in enumerate(words):
            if word in suffixes and i > 0:
                detected_locality = f"{words[i-1].capitalize()} {word.capitalize()}"
                break

    # Default locality = zone if nothing specific was found
    final_locality = detected_locality or detected_zone

    return detected_zone, final_locality
