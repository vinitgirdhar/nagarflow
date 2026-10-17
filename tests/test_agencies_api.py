import unittest
from unittest.mock import patch
import app as app_module
from agencies_scraper import get_seed_registry
from auth_helpers import authenticate
class AgenciesApiTest(unittest.TestCase):
    def setUp(self):
        self.client=app_module.app.test_client();authenticate(self)
    @patch.object(app_module,'get_agency_registry')
    def test_registry_is_persisted_and_reused(self,mock):
        mock.return_value=get_seed_registry()
        first=self.client.get('/api/agencies');self.assertEqual(first.status_code,200)
        self.assertGreater(first.json['stats']['agency_count'],0)
        second=self.client.get('/api/agencies');self.assertEqual(second.json['agencies'],first.json['agencies'])
        mock.assert_called_once_with(force_refresh=True)
