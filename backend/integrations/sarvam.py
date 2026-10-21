import os
from typing import Any

import requests

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"
SARVAM_STT_MODEL = "saaras:v3"
SARVAM_TTS_MODEL = "bulbul:v3"
SARVAM_TRANSLATE_MODEL = "sarvam-translate:v1"
SARVAM_TTS_SPEAKER = "shubh"
REQUEST_TIMEOUT_SECONDS = 30


class SarvamError(Exception):
    """Raised when a Sarvam API request fails or returns unusable data."""


def _get_api_key() -> str:
    api_key = os.getenv("SARVAM_API_KEY", "").strip()
    if not api_key:
        raise SarvamError("Sarvam API key is not configured.")
    return api_key


def _extract_error_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if message:
                return str(message)
        if isinstance(error, str) and error.strip():
            return error.strip()
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    return fallback


def speech_to_text(
    audio_bytes: bytes,
    filename: str = "voice.webm",
    mime_type: str = "audio/webm",
    language_code: str = "unknown",
) -> str:
    if not audio_bytes:
        raise SarvamError("Audio payload is empty.")

    response = requests.post(
        SARVAM_STT_URL,
        headers={"api-subscription-key": _get_api_key()},
        files={"file": (filename, audio_bytes, mime_type)},
        data={
            "model": SARVAM_STT_MODEL,
            "mode": "transcribe",
            "language_code": language_code,
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if not response.ok:
        raise SarvamError(_extract_error_message(payload, "Speech recognition failed."))

    transcript = str(payload.get("transcript", "")).strip()
    if not transcript:
        raise SarvamError("No speech could be transcribed.")
    return transcript


def text_to_speech(text: str, target_language_code: str = "hi-IN") -> str:
    cleaned_text = text.strip()
    if not cleaned_text:
        raise SarvamError("Text payload is empty.")

    response = requests.post(
        SARVAM_TTS_URL,
        headers={
            "api-subscription-key": _get_api_key(),
            "Content-Type": "application/json",
        },
        json={
            "text": cleaned_text,
            "target_language_code": target_language_code,
            "speaker": SARVAM_TTS_SPEAKER,
            "model": SARVAM_TTS_MODEL,
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if not response.ok:
        raise SarvamError(_extract_error_message(payload, "Speech synthesis failed."))

    audios = payload.get("audios") or []
    if not audios or not audios[0]:
        raise SarvamError("Speech synthesis returned no audio.")
    return str(audios[0])


def translate_to_english(text: str, source_language_code: str = "hi-IN") -> str:
    """Translate Hindi/Hinglish/Marathi complaint text to English using Sarvam AI.

    Returns the English translation, or raises SarvamError on failure.
    """
    cleaned = text.strip()
    if not cleaned:
        raise SarvamError("Empty text provided for translation.")

    # Skip translation if already ASCII (likely already English)
    if not any(ord(c) > 127 for c in cleaned):
        return cleaned

    response = requests.post(
        SARVAM_TRANSLATE_URL,
        headers={
            "api-subscription-key": _get_api_key(),
            "Content-Type": "application/json",
        },
        json={
            "input": cleaned,
            "source_language_code": source_language_code,
            "target_language_code": "en-IN",
            "model": SARVAM_TRANSLATE_MODEL,
            "mode": "formal",
            "numerals_format": "international",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if not response.ok:
        raise SarvamError(_extract_error_message(payload, "Translation failed."))

    translated = str(payload.get("translated_text", "")).strip()
    if not translated:
        raise SarvamError("Translation returned empty text.")
    return translated
