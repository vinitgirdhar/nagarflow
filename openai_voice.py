"""OpenAI utilities: translation fallback for complaint descriptions."""

import os

import requests

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_CHAT_MODEL = "gpt-4o-mini"
REQUEST_TIMEOUT_SECONDS = 30


class OpenAIVoiceError(Exception):
    """Raised when an OpenAI API call fails."""


def _get_api_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise OpenAIVoiceError("OpenAI API key is not configured.")
    return api_key


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {_get_api_key()}", "Content-Type": "application/json"}


def translate_to_english(text: str) -> str:
    """Translate Hindi/Hinglish complaint text to English using OpenAI.

    Returns the English translation, or raises OpenAIVoiceError on failure.
    """
    cleaned = text.strip()
    if not cleaned:
        raise OpenAIVoiceError("Empty text provided for translation.")

    response = requests.post(
        OPENAI_CHAT_URL,
        headers=_auth_headers(),
        json={
            "model": OPENAI_CHAT_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a translator for a Mumbai civic complaints system. "
                        "Translate the user's Hindi, Hinglish, or Marathi complaint text into clear, concise English. "
                        "Preserve all location names, area names, and specific details exactly. "
                        "Return ONLY the translated English text, nothing else."
                    ),
                },
                {"role": "user", "content": cleaned},
            ],
            "max_tokens": 200,
            "temperature": 0,
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if not response.ok:
        try:
            err = response.json().get("error", {}).get("message", "Translation failed.")
        except Exception:
            err = "Translation failed."
        raise OpenAIVoiceError(str(err))

    try:
        translated = response.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        raise OpenAIVoiceError("Unexpected response format from OpenAI.")

    return translated


class OpenAIVoiceError(Exception):
    """Raised when an OpenAI voice API call fails."""


def _get_api_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise OpenAIVoiceError("OpenAI API key is not configured. Set OPENAI_API_KEY in .env")
    return api_key


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {_get_api_key()}"}


def speech_to_text(
    audio_bytes: bytes,
    filename: str = "voice.webm",
    mime_type: str = "audio/webm",
    language_code: str = "unknown",
) -> str:
    """Transcribe audio using OpenAI Whisper.

    language_code is intentionally ignored — Whisper auto-detects the language
    (Hindi, English, Hinglish, Marathi, etc.) without needing a hint.
    """
    if not audio_bytes:
        raise OpenAIVoiceError("Audio payload is empty.")

    # Whisper accepts webm, mp4, wav, mp3, ogg, flac, m4a
    response = requests.post(
        OPENAI_STT_URL,
        headers=_auth_headers(),
        files={"file": (filename, audio_bytes, mime_type)},
        data={
            "model": WHISPER_MODEL,
            "response_format": "text",
            # Prompt nudges Whisper toward Mumbai civic complaint context
            "prompt": "NagarFlow Mumbai complaint helpline. The caller may speak Hindi, English, or Hinglish.",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if not response.ok:
        try:
            err = response.json().get("error", {}).get("message", "Transcription failed.")
        except Exception:
            err = "Transcription failed."
        raise OpenAIVoiceError(str(err))

    transcript = response.text.strip()
    if not transcript:
        raise OpenAIVoiceError("No speech could be transcribed.")
    return transcript


def text_to_speech(text: str, target_language_code: str = "hi-IN") -> str:
    """Synthesise speech using OpenAI TTS and return base64-encoded MP3.

    target_language_code is kept for API compatibility but OpenAI TTS auto-detects
    the script/language in the text itself.
    """
    cleaned = text.strip()
    if not cleaned:
        raise OpenAIVoiceError("Text payload is empty.")

    response = requests.post(
        OPENAI_TTS_URL,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json={
            "model": TTS_MODEL,
            "voice": TTS_VOICE,
            "input": cleaned,
            "response_format": "mp3",
            "speed": 0.95,   # slightly slower — clearer for Hindi
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if not response.ok:
        try:
            err = response.json().get("error", {}).get("message", "Speech synthesis failed.")
        except Exception:
            err = "Speech synthesis failed."
        raise OpenAIVoiceError(str(err))

    # Return base64 so the frontend can play it directly (same contract as sarvam.py)
    return base64.b64encode(response.content).decode("utf-8")
