import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import app as app_module
import greedy_dispatcher


def create_test_db(path: str) -> None:
    conn = sqlite3.connect(path)
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone TEXT,
            priority_score REAL,
            type TEXT,
            action TEXT,
            reason TEXT,
            timestamp TEXT,
            category TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE trucks (
            id INTEGER PRIMARY KEY,
            name TEXT,
            status TEXT,
            lat REAL,
            lon REAL,
            truck_type TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE complaints (
            id TEXT PRIMARY KEY,
            zone TEXT,
            locality TEXT,
            issue_type TEXT,
            complaint_count INTEGER,
            population INTEGER,
            weather TEXT,
            timestamp TEXT,
            severity TEXT,
            description TEXT
        )
        """
    )

    cursor.executemany(
        """
        INSERT INTO predictions (zone, priority_score, type, action, reason, timestamp, category)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            ("Kurla", 74, "Predictive", "Deploy team", "Demand index elevated for Kurla", "2026-04-05 05:28:27", "Water Tanker Demand"),
            ("Kurla", 68, "Predictive", "Deploy team", "Demand index elevated for Kurla", "2026-04-05 05:28:27", "Garbage Collection"),
            ("Dharavi", 69, "Predictive", "Deploy team", "Demand index elevated for Dharavi", "2026-04-05 05:28:27", "Garbage Collection"),
            ("Dharavi", 74, "Predictive", "Deploy team", "Demand index elevated for Dharavi", "2026-04-05 05:28:27", "Road Maintenance"),
            ("Santacruz", 37, "Predictive", "Deploy team", "Demand index elevated for Santacruz", "2026-04-05 05:28:27", "Road Maintenance"),
            ("Santacruz", 56, "Predictive", "Deploy team", "Demand index elevated for Santacruz", "2026-04-05 05:28:27", "Garbage Collection"),
            ("Andheri", 81, "Predictive", "Deploy team", "Demand index elevated for Andheri", "2026-04-05 05:28:27", "Drainage Maintenance"),
            ("Bandra", 63, "Predictive", "Deploy team", "Demand index elevated for Bandra", "2026-04-05 05:28:27", "Garbage Collection"),
        ],
    )
    cursor.executemany(
        """
        INSERT INTO trucks (id, name, status, lat, lon, truck_type)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Truck-01", "idle", 19.06, 72.88, "garbage"),
            (2, "Tanker-02", "idle", 19.07, 72.87, "water"),
            (3, "Truck-03", "idle", 19.04, 72.85, "garbage"),
            (4, "Truck-04", "idle", 19.08, 72.84, "garbage"),
            (5, "Tanker-05", "idle", 19.11, 72.84, "water"),
        ],
    )
    cursor.executemany(
        """
        INSERT INTO complaints (id, zone, locality, issue_type, complaint_count, population, weather, timestamp, severity, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            ("C-001", "Kurla", "Kurla Station Road", "Water", 12, 1000, "Rainy", "2026-04-05 05:00:00", "High", "Water issue"),
            ("C-002", "Dharavi", "90 Feet Road", "Garbage", 18, 1000, "Sunny", "2026-04-05 05:00:00", "High", "Garbage issue"),
            ("C-003", "Santacruz", "Vakola", "Roads", 8, 1000, "Sunny", "2026-04-05 05:00:00", "Medium", "Road issue"),
            ("C-004", "Andheri", "Andheri Station", "Drainage", 21, 1000, "Rainy", "2026-04-05 05:00:00", "High", "Drainage issue"),
            ("C-005", "Bandra", "Bandra Station", "Garbage", 11, 1000, "Sunny", "2026-04-05 05:00:00", "Medium", "Garbage issue"),
        ],
    )

    conn.commit()
    conn.close()


class PredictionsApiTest(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        create_test_db(self.temp_db.name)
        self.original_app_db_path = app_module.DB_PATH
        self.original_dispatcher_db_path = greedy_dispatcher.DB_PATH
        app_module.DB_PATH = self.temp_db.name
        greedy_dispatcher.DB_PATH = self.temp_db.name
        self.client = app_module.app.test_client()

    def tearDown(self):
        app_module.DB_PATH = self.original_app_db_path
        greedy_dispatcher.DB_PATH = self.original_dispatcher_db_path
        os.unlink(self.temp_db.name)

    def test_predictions_route_returns_one_record_per_zone(self):
        response = self.client.get("/api/predictions")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["name"] for item in payload], ["Andheri", "Dharavi", "Kurla", "Bandra", "Santacruz"])
        self.assertEqual({item["name"]: item["demand"] for item in payload}, {
            "Andheri": 81,
            "Dharavi": 74,
            "Kurla": 74,
            "Bandra": 63,
            "Santacruz": 56,
        })

    def test_dashboard_route_returns_unique_predictions(self):
        response = self.client.get("/api/dashboard")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["zone"] for item in payload["predictions"]], ["Andheri", "Dharavi", "Kurla", "Bandra", "Santacruz"])
        self.assertEqual({item["zone"]: item["priority_score"] for item in payload["predictions"]}, {
            "Andheri": 81,
            "Dharavi": 74,
            "Kurla": 74,
            "Bandra": 63,
            "Santacruz": 56,
        })

    def test_dispatch_route_does_not_repeat_same_zone(self):
        response = self.client.get("/api/dispatch")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["zone"] for item in payload], ["Andheri", "Dharavi", "Kurla", "Bandra", "Santacruz"])
        self.assertEqual(len({item["zone"] for item in payload}), len(payload))

    @patch.object(app_module, "get_agency_registry", return_value={"agencies": []})
    def test_ensure_tables_exist_collapses_existing_prediction_duplicates(self, _mocked_registry):
        app_module.ensure_tables_exist()

        conn = sqlite3.connect(self.temp_db.name)
        rows = conn.execute(
            "SELECT zone, priority_score FROM predictions ORDER BY priority_score DESC, zone ASC"
        ).fetchall()
        indexes = conn.execute("PRAGMA index_list(predictions)").fetchall()
        conn.close()

        self.assertEqual(rows, [
            ("Andheri", 81.0),
            ("Dharavi", 74.0),
            ("Kurla", 74.0),
            ("Bandra", 63.0),
            ("Santacruz", 56.0),
        ])
        self.assertTrue(any(index[2] and index[1] == "idx_predictions_zone_unique" for index in indexes))


if __name__ == "__main__":
    unittest.main()
