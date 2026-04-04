import sys
import os

# Add current directory to path so we can import from app.py
sys.path.append(os.getcwd())

from app import _extract_zone

def test_recognition():
    test_cases = [
        ("Main andari mein kachra dekh raha hoon", "Andheri"),
        ("अंधेरी में पानी लीक हो रहा है", "Andheri"),
        ("Bandra west mein drainage problem hai", "Bandra"),
        ("Banra mein light nahi hai", "Bandra"),
        ("Kula station ke pass nala saaf nahi hai", "Kurla"),
        ("Vile parle east mein road kharab hai", "Vile Parle"),
        ("Santacruz west ward number 5", "Santacruz"),
        ("Kandivli main road", "Kandivali"),
        ("Versova beach ke pass garbage pile", "Versova"),
    ]

    print("🚀 Starting Voice Area Recognition Test...")
    total = len(test_cases)
    passed = 0

    for transcript, expected in test_cases:
        result = _extract_zone(transcript)
        if result == expected:
            print(f"✅ PASS: '{transcript}' -> {result}")
            passed += 1
        else:
            print(f"❌ FAIL: '{transcript}' -> Expected {expected}, got {result}")

    print(f"\n📊 Result: {passed}/{total} passed.")

if __name__ == "__main__":
    test_recognition()
