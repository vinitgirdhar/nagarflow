"""Deployment entrypoint checks use temporary stores and real disposable children."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from scripts.deployment import render_service as service


class RenderConfigurationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'store'
        self.environment = {'NAGARFLOW_STORAGE_DIR': str(self.root), 'RENDER_EXTERNAL_URL': 'https://nagarflow-example.onrender.com'}

    def test_configuration_uses_own_https_origin_and_one_private_disk(self):
        environment = service.configure_environment(self.environment)
        self.assertEqual(environment['NAGARFLOW_TRUSTED_ORIGINS'], self.environment['RENDER_EXTERNAL_URL'])
        self.assertEqual(environment['NAGARFLOW_AUTH_DB'], str(self.root / 'auth/control.sqlite3'))
        self.assertEqual(environment['NAGARFLOW_DB_PATH'], str(self.root / 'default/nagarflow.db'))
        self.assertEqual(environment['NAGARFLOW_TENANT_DATA_DIR'], str(self.root / 'municipalities'))
        self.assertEqual(environment['PORT'], '10000')
        self.assertEqual(environment['HOSTNAME'], '0.0.0.0')
        self.assertEqual(environment['NAGARFLOW_ENV'], 'production')
        self.assertEqual(environment['NAGARFLOW_COOKIE_SECURE'], 'true')
        self.assertEqual(environment['NAGARFLOW_INGEST_WORKER'], 'false')
        self.assertNotIn('NAGARFLOW_AUTH_DB', self.environment)
        self.assertFalse(self.root.exists())

    def test_explicit_trusted_origins_override_render_url_and_normalize(self):
        environment = service.configure_environment({**self.environment, 'NAGARFLOW_TRUSTED_ORIGINS': 'https://Civic.example:443/, https://ops.example:8443,https://civic.example'})
        self.assertEqual(environment['NAGARFLOW_TRUSTED_ORIGINS'], 'https://civic.example,https://ops.example:8443')
        self.assertEqual(service.trusted_origins('https://[::1]:8443/'), 'https://[::1]:8443')

    def test_rejects_unsafe_or_missing_origins_and_ports(self):
        for origin in ('http://example.com', 'https://*.example.com', 'https://a:b@example.com', 'https://example.com/path', 'https://example.com?x=1', 'https://example.com#x', 'https://example.com?', 'https://example.com,', 'https://bad host', 'https://example.com:0', 'https://example.com:99999', 'https://example.com:bad', 'https://[invalid]', 'https://-invalid.example'):
            with self.subTest(origin=origin), self.assertRaises(service.ConfigurationError):
                service.configure_environment({**self.environment, 'NAGARFLOW_TRUSTED_ORIGINS': origin})
        with self.assertRaises(service.ConfigurationError):
            service.configure_environment({'NAGARFLOW_STORAGE_DIR': str(self.root)})
        for port in ('0', '5000', '-1', '65536', 'not-a-port'):
            with self.subTest(port=port), self.assertRaises(service.ConfigurationError):
                service.configure_environment({**self.environment, 'PORT': port})

    def test_rejects_paths_outside_store_parent_traversal_and_symlinks(self):
        for name in ('NAGARFLOW_AUTH_DB', 'NAGARFLOW_DB_PATH', 'NAGARFLOW_TENANT_DATA_DIR'):
            for path in ('relative/path', str(Path(self.directory.name) / 'outside'), str(self.root / 'child/../file')):
                with self.subTest(name=name, path=path), self.assertRaises(service.ConfigurationError):
                    service.configure_environment({**self.environment, name: path})
        self.root.mkdir()
        (self.root / 'alias').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(service.ConfigurationError):
            service.configure_environment({**self.environment, 'NAGARFLOW_AUTH_DB': str(self.root / 'alias/control.sqlite3')})
        with self.assertRaises(service.ConfigurationError):
            service.configure_environment({**self.environment, 'NAGARFLOW_STORAGE_DIR': str(self.root / 'alias')})

    def test_private_storage_permissions_and_nested_symlink_rejection(self):
        environment = service.configure_environment(self.environment)
        service.prepare_storage(environment)
        for relative in ('', 'auth', 'default', 'municipalities'):
            self.assertEqual((self.root / relative).stat().st_mode & 0o777, 0o700)
        key = self.root / 'auth/control.sqlite3.mfa-key'
        key.write_bytes(b'x' * 32)
        key.chmod(0o644)
        service.prepare_storage(environment)
        self.assertEqual(key.stat().st_mode & 0o777, 0o600)
        (self.root / 'municipalities/foreign').symlink_to(self.directory.name, target_is_directory=True)
        with self.assertRaises(service.ConfigurationError):
            service.prepare_storage(environment)

    def test_privilege_drop_order(self):
        order = []
        with patch.object(os, 'geteuid', return_value=0), patch.object(os, 'setgroups', side_effect=lambda value: order.append(('groups', value))), patch.object(os, 'setgid', side_effect=lambda value: order.append(('gid', value))), patch.object(os, 'setuid', side_effect=lambda value: order.append(('uid', value))):
            service.drop_privileges()
        self.assertEqual(order, [('groups', []), ('gid', 10001), ('uid', 10001)])


@unittest.skipUnless(os.name == 'posix', 'Process groups require POSIX')
class RenderSupervisorTest(unittest.TestCase):
    def _wait_for_file(self, path, timeout=5):
        deadline = time.monotonic() + timeout
        while not path.exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(path.exists(), 'Child process did not become ready')

    def _assert_stopped(self, pid):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                os.kill(pid, 0)
                # Orphaned grandchildren can remain zombies until init reaps them.
                status = Path(f'/proc/{pid}/stat')
                if status.exists() and status.read_text().split()[2] == 'Z':
                    return
            except ProcessLookupError:
                return
            time.sleep(0.02)
        self.fail('A service child remained alive after supervision stopped')

    def test_unexpected_clean_exit_stops_siblings_and_descendants(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'processes'
            child = "import os,subprocess,sys,time;from pathlib import Path;p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);Path(sys.argv[1]).write_text(str(os.getpid())+' '+str(p.pid));time.sleep(60)"
            exiter = "import sys,time;from pathlib import Path;p=Path(sys.argv[1]);deadline=time.monotonic()+5\nwhile not p.exists() and time.monotonic()<deadline:time.sleep(.02)\ntime.sleep(.1)"
            commands = [('long-running', [sys.executable, '-c', child, str(marker)]), ('unexpected-exit', [sys.executable, '-c', exiter, str(marker)])]
            result = service.supervise(commands, dict(os.environ), grace_seconds=0.3, poll_seconds=0.02)
            self.assertEqual(result, 1)
            for pid in map(int, marker.read_text().split()):
                self._assert_stopped(pid)

    def test_service_sigterm_propagates_and_cleans_children(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'ready'
            child = "import os,sys,time;from pathlib import Path;Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(60)"
            code = 'import os,sys;from scripts.deployment.render_service import supervise;raise SystemExit(supervise([("child",[sys.executable,"-c",sys.argv[1],sys.argv[2]])],dict(os.environ),grace_seconds=.3,poll_seconds=.02))'
            process = subprocess.Popen([sys.executable, '-c', code, child, str(marker)], cwd=service.ROOT)
            try:
                self._wait_for_file(marker)
                process.send_signal(signal.SIGTERM)
                self.assertEqual(process.wait(timeout=5), 128 + signal.SIGTERM)
                self._assert_stopped(int(marker.read_text()))
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
