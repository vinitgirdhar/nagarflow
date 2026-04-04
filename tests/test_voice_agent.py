import io
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import app as app_module
from sarvam import SarvamError


def create_test_db(path: str) -> None:
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    cursor.execute(
        '''
        CREATE TABLE complaints (
            id TEXT PRIMARY KEY,
            zone TEXT,
            issue_type TEXT,
            complaint_count INTEGER,
            weather TEXT,
            timestamp TEXT,
            severity TEXT
        )
        '''
    )
    cursor.execute(
        '''
        CREATE TABLE zone_coverage (
            zone TEXT PRIMARY KEY,
            last_visited DATETIME,
            status TEXT DEFAULT 'OK'
        )
        '''
    )
    cursor.executemany(
        "INSERT INTO zone_coverage (zone, last_visited, status) VALUES (?, ?, ?)",
        [
            ("Dharavi", "2026-04-04 09:00:00", "OK"),
            ("Andheri", "2026-04-04 09:00:00", "OK"),
            ("Bandra", "2026-04-04 09:00:00", "OK"),
        ],
    )
    conn.commit()
    conn.close()


class VoiceAgentRoutesTest(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        create_test_db(self.temp_db.name)
        self.original_db_path = app_module.DB_PATH
        app_module.DB_PATH = self.temp_db.name
        self.client = app_module.app.test_client()

    def tearDown(self):
        app_module.DB_PATH = self.original_db_path
        os.unlink(self.temp_db.name)

    def _audio_form_data(self):
        return {
            "audio": (io.BytesIO(b"fake-webm-audio"), "voice.webm", "audio/webm"),
        }

    def _complaints(self):
        conn = sqlite3.connect(self.temp_db.name)
        rows = conn.execute(
            "SELECT zone, issue_type, severity FROM complaints ORDER BY rowid ASC"
        ).fetchall()
        conn.close()
        return rows

    @patch.object(app_module, "text_to_speech", return_value="base64-audio")
    def test_agent_greet_returns_welcome_audio(self, mocked_tts):
        response = self.client.get("/api/agent/greet")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["reply_text"], app_module.AGENT_GREETING_TEXT)
        self.assertEqual(payload["audio"], "base64-audio")
        self.assertEqual(payload["voice_mode"], "sarvam")
        mocked_tts.assert_called_once_with(app_module.AGENT_GREETING_TEXT)

    @patch.object(app_module, "text_to_speech", side_effect=SarvamError("boom"))
    def test_agent_greet_falls_back_to_browser_voice(self, _mocked_tts):
        response = self.client.get("/api/agent/greet")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["reply_text"], app_module.AGENT_GREETING_TEXT)
        self.assertIsNone(payload["audio"])
        self.assertEqual(payload["voice_mode"], "browser")

    @patch.object(app_module, "text_to_speech", return_value="base64-audio")
    @patch.object(app_module, "speech_to_text", return_value="Dharavi mein kachra nahi utha")
    def test_agent_respond_logs_known_complaint(self, mocked_stt, mocked_tts):
        response = self.client.post(
            "/api/agent/respond",
            data=self._audio_form_data(),
            content_type="multipart/form-data",
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertTrue(payload["complaint_logged"])
        self.assertFalse(payload["call_ended"])
        self.assertEqual(payload["transcript"], "Dharavi mein kachra nahi utha")
        self.assertEqual(payload["extracted"]["zone"], "Dharavi")
        self.assertEqual(payload["extracted"]["issue_type"], "Garbage")
        self.assertEqual(payload["extracted"]["severity"], "High")
        self.assertEqual(self._complaints(), [("Dharavi", "Garbage", "High")])
        mocked_stt.assert_called_once()
        mocked_tts.assert_called_once_with(app_module.AGENT_CONFIRMATION_TEXT)

    @patch.object(app_module, "text_to_speech", return_value="base64-audio")
    @patch.object(app_module, "speech_to_text", return_value="Dharavi mein kachra nahi utha")
    def test_voice_complaints_are_visible_in_complaints_feed(self, _mocked_stt, _mocked_tts):
        self.client.post(
            "/api/agent/respond",
            data=self._audio_form_data(),
            content_type="multipart/form-data",
        )

        response = self.client.get("/api/complaints")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["stats"]["total_complaints"], 1)
        self.assertEqual(payload["stats"]["high_priority_count"], 1)
        self.assertEqual(payload["stats"]["voice_report_count"], 1)
        self.assertEqual(len(payload["complaints"]), 1)
        complaint = payload["complaints"][0]
        self.assertEqual(complaint["ward"], "Dharavi")
        self.assertEqual(complaint["issue_type"], "Garbage")
        self.assertEqual(complaint["severity"], "High")
        self.assertEqual(complaint["urgency"], "high")
        self.assertEqual(complaint["source"], "voice_call")

    @patch.object(app_module, "text_to_speech", return_value="base64-audio")
    @patch.object(app_module, "speech_to_text", return_value="Kachra nahi utha")
    def test_agent_respond_retries_when_zone_is_unknown(self, _mocked_stt, mocked_tts):
        response = self.client.post(
            "/api/agent/respond",
            data=self._audio_form_data(),
            content_type="multipart/form-data",
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertFalse(payload["complaint_logged"])
        self.assertFalse(payload["call_ended"])
        self.assertEqual(payload["extracted"]["zone"], "Unknown")
        self.assertEqual(payload["extracted"]["issue_type"], "Garbage")
        self.assertEqual(self._complaints(), [])
        mocked_tts.assert_called_once_with(app_module.AGENT_RETRY_TEXT)

    @patch.object(app_module, "text_to_speech", return_value="base64-audio")
    @patch.object(app_module, "speech_to_text", return_value="Dharavi mein kuch problem hai")
    def test_agent_respond_retries_when_issue_is_unknown(self, _mocked_stt, mocked_tts):
        response = self.client.post(
            "/api/agent/respond",
            data=self._audio_form_data(),
            content_type="multipart/form-data",
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertFalse(payload["complaint_logged"])
        self.assertFalse(payload["call_ended"])
        self.assertEqual(payload["extracted"]["zone"], "Dharavi")
        self.assertEqual(payload["extracted"]["issue_type"], "Unknown")
        self.assertEqual(self._complaints(), [])
        mocked_tts.assert_called_once_with(app_module.AGENT_RETRY_TEXT)

    @patch.object(app_module, "text_to_speech", return_value="base64-audio")
    @patch.object(app_module, "speech_to_text", return_value="nahi")
    def test_agent_respond_ends_call_when_user_says_no(self, _mocked_stt, mocked_tts):
        response = self.client.post(
            "/api/agent/respond",
            data=self._audio_form_data(),
            content_type="multipart/form-data",
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertFalse(payload["complaint_logged"])
        self.assertTrue(payload["call_ended"])
        self.assertEqual(payload["reply_text"], app_module.AGENT_CLOSING_TEXT)
        self.assertEqual(self._complaints(), [])
        mocked_tts.assert_called_once_with(app_module.AGENT_CLOSING_TEXT)

    @patch.object(app_module, "speech_to_text", side_effect=SarvamError("boom"))
    def test_agent_respond_handles_upstream_stt_failure(self, _mocked_stt):
        response = self.client.post(
            "/api/agent/respond",
            data=self._audio_form_data(),
            content_type="multipart/form-data",
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 502)
        self.assertFalse(payload["success"])
        self.assertEqual(payload["error"], "Audio could not be processed. Please try again.")
        self.assertEqual(self._complaints(), [])

    @patch.object(app_module, "text_to_speech", return_value=None)
    def test_agent_respond_text_logs_complaint_without_sarvam_stt(self, _mocked_tts):
        response = self.client.post(
            "/api/agent/respond-text",
            json={"transcript": "Dharavi mein kachra nahi utha"},
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertTrue(payload["complaint_logged"])
        self.assertEqual(payload["transcript"], "Dharavi mein kachra nahi utha")
        self.assertEqual(payload["extracted"]["zone"], "Dharavi")
        self.assertEqual(payload["extracted"]["issue_type"], "Garbage")
        self.assertEqual(payload["extracted"]["severity"], "High")
        self.assertEqual(self._complaints(), [("Dharavi", "Garbage", "High")])


if __name__ == "__main__":
    unittest.main()
