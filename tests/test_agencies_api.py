import unittest
from unittest.mock import patch

import app as app_module


class AgenciesApiTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    @patch.object(app_module, "get_agency_registry")
    def test_agencies_route_returns_registry_payload(self, mocked_registry):
        mocked_registry.return_value = {
            "generated_at": "2026-04-04T12:00:00Z",
            "stats": {
                "agency_count": 2,
                "city_count": 2,
                "category_count": 2,
                "online_sources": 2,
            },
            "agencies": [
                {
                    "id": "bmc-swm",
                    "agency_name": "Solid Waste Management Department",
                    "city": "Mumbai",
                },
                {
                    "id": "nmmc-water",
                    "agency_name": "Water Supply Department",
                    "city": "Navi Mumbai",
                },
            ],
        }

        response = self.client.get("/api/agencies")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["stats"]["agency_count"], 2)
        self.assertEqual(len(payload["agencies"]), 2)
        mocked_registry.assert_called_once_with(force_refresh=False)


if __name__ == "__main__":
    unittest.main()
