"""Regression checks for the packaged backend and repository entrypoints."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from backend.core.paths import PROJECT_ROOT


class PackageLayoutTest(unittest.TestCase):
    def test_runtime_imports_without_root_module_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ, PYTHON_DOTENV_DISABLED='1',
                NAGARFLOW_DB_PATH=str(Path(directory) / 'data.sqlite3'),
                NAGARFLOW_AUTH_DB=str(Path(directory) / 'auth.sqlite3'),
                NAGARFLOW_ENV='development')
            code = (
                'import json,sys;from backend.app import app;'
                'print(json.dumps({"routes":len(app.url_map._rules),'
                '"static":app.static_folder,"root":app.root_path,'
                '"aliases":[n for n in ("app","auth_service","database","schema") if n in sys.modules]}))'
            )
            result = subprocess.run([sys.executable, '-c', code], cwd=PROJECT_ROOT,
                env=environment, text=True, capture_output=True, check=True)
            payload = json.loads(result.stdout)
            self.assertGreaterEqual(payload['routes'], 50)
            self.assertEqual(payload['aliases'], [])
            self.assertEqual(Path(payload['root']), PROJECT_ROOT)
            self.assertEqual(Path(payload['static']), PROJECT_ROOT / 'backend/static')

    def test_root_contains_no_python_source(self):
        self.assertEqual(list(PROJECT_ROOT.glob('*.py')), [])

    def test_administrator_cli_is_importable_as_a_module(self):
        environment = dict(os.environ, PYTHON_DOTENV_DISABLED='1', NAGARFLOW_ENV='development')
        result = subprocess.run([sys.executable, '-m', 'scripts.admin.manage_users', '--help'],
            cwd=PROJECT_ROOT, env=environment, text=True, capture_output=True, check=True)
        self.assertIn('municipality', result.stdout)
        self.assertIn('create', result.stdout)
