"""Run the complete application on one Render service and one private disk.

This module deliberately imports no application code. Storage permissions and
the unprivileged identity are established before migrations or app imports.
"""
from __future__ import annotations

import ipaddress
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
SERVICE_UID = 10001
SERVICE_GID = 10001


class ConfigurationError(ValueError):
    """An unsafe or incomplete deployment configuration."""


def trusted_origins(value: str) -> str:
    """Validate exact HTTPS origins and return their browser-normalized forms."""
    origins = []
    for item in value.split(','):
        item = item.strip()
        if not item or any(character.isspace() for character in item) or any(character in item for character in '*?#'):
            raise ConfigurationError('Trusted origins must be exact HTTPS origins without wildcards, queries or fragments.')
        try:
            parsed = urlsplit(item)
            port = parsed.port
            hostname = parsed.hostname
            if parsed.scheme != 'https' or not hostname or parsed.username is not None or parsed.password is not None or parsed.path not in ('', '/'):
                raise ValueError
            if port is not None and not 1 <= port <= 65535:
                raise ValueError
            try:
                address = ipaddress.ip_address(hostname)
                hostname = '[' + address.compressed + ']' if address.version == 6 else address.compressed
            except ValueError:
                if len(hostname) > 253 or not all(re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?', part) for part in hostname.split('.')):
                    raise ValueError
                hostname = hostname.lower()
        except ValueError:
            raise ConfigurationError('Trusted origins must be valid HTTPS origins without credentials or paths.') from None
        origin = 'https://' + hostname + (':' + str(port) if port not in (None, 443) else '')
        if origin not in origins:
            origins.append(origin)
    return ','.join(origins)


def _absolute_path(value: str, name: str) -> Path:
    path = Path(value)
    if not path.is_absolute() or '..' in path.parts:
        raise ConfigurationError(name + ' must be an absolute path without parent traversal.')
    for candidate in (path, *path.parents):
        if candidate.is_symlink():
            raise ConfigurationError(name + ' must not contain symlinks.')
    return path


def configure_environment(environment: dict[str, str]) -> dict[str, str]:
    """Return a validated environment; do not inspect or mutate application data."""
    configured = dict(environment)
    origin = configured.get('NAGARFLOW_TRUSTED_ORIGINS', '').strip() or configured.get('RENDER_EXTERNAL_URL', '').strip()
    if not origin:
        raise ConfigurationError('Set NAGARFLOW_TRUSTED_ORIGINS or provide the Render external HTTPS URL.')
    configured['NAGARFLOW_TRUSTED_ORIGINS'] = trusted_origins(origin)
    storage = _absolute_path(configured.get('NAGARFLOW_STORAGE_DIR', '/var/data/nagarflow'), 'NAGARFLOW_STORAGE_DIR')
    if storage == Path('/'):
        raise ConfigurationError('NAGARFLOW_STORAGE_DIR must be a dedicated private directory.')
    configured['NAGARFLOW_STORAGE_DIR'] = str(storage)
    defaults = {
        'NAGARFLOW_AUTH_DB': storage / 'auth' / 'control.sqlite3',
        'NAGARFLOW_DB_PATH': storage / 'default' / 'nagarflow.db',
        'NAGARFLOW_TENANT_DATA_DIR': storage / 'municipalities',
    }
    for name, default in defaults.items():
        path = _absolute_path(configured.get(name, str(default)), name)
        if path == storage or not path.is_relative_to(storage):
            raise ConfigurationError(name + ' must remain inside NAGARFLOW_STORAGE_DIR.')
        if name != 'NAGARFLOW_TENANT_DATA_DIR' and path.is_dir():
            raise ConfigurationError(name + ' must name a database file.')
        configured[name] = str(path)
    if configured['NAGARFLOW_AUTH_DB'] == configured['NAGARFLOW_DB_PATH']:
        raise ConfigurationError('The control and municipality databases must use different files.')
    _absolute_path(configured['NAGARFLOW_AUTH_DB'] + '.mfa-key', 'Authenticator host key')
    port = configured.get('PORT', '10000')
    if not re.fullmatch(r'[0-9]{1,5}', port) or not 1 <= int(port) <= 65535 or int(port) == 5000:
        raise ConfigurationError('PORT must be a valid public port different from the private API port 5000.')
    configured.update({
        'PORT': str(int(port)),
        'HOSTNAME': '0.0.0.0',
        'NODE_ENV': 'production',
        'NAGARFLOW_ENV': 'production',
        'NAGARFLOW_COOKIE_SECURE': 'true',
        'NAGARFLOW_INGEST_WORKER': 'false',
        'NAGARFLOW_BACKEND_URL': 'http://127.0.0.1:5000',
    })
    return configured


def prepare_storage(environment: dict[str, str], owner: tuple[int, int] | None = None) -> None:
    """Create private stores and reject symlinks before a privileged chown."""
    storage = Path(environment['NAGARFLOW_STORAGE_DIR'])
    directories = {
        storage,
        Path(environment['NAGARFLOW_AUTH_DB']).parent,
        Path(environment['NAGARFLOW_DB_PATH']).parent,
        Path(environment['NAGARFLOW_TENANT_DATA_DIR']),
    }
    for directory in sorted(directories, key=lambda value: len(value.parts)):
        _absolute_path(str(directory), 'Storage directory')
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Also inspect existing tenant stores, uploads, backups and the MFA key.
    for directory, child_directories, files in os.walk(storage, followlinks=False):
        for entry in (Path(directory), *(Path(directory) / name for name in child_directories + files)):
            metadata = entry.lstat()
            if stat.S_ISLNK(metadata.st_mode) or not (stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)):
                raise ConfigurationError('The persistent store must contain only real directories and regular files.')
            entry.chmod(0o700 if stat.S_ISDIR(metadata.st_mode) else 0o600)
            if owner is not None:
                os.chown(entry, *owner, follow_symlinks=False)


def drop_privileges() -> None:
    if os.geteuid() == 0:
        os.setgroups([])
        os.setgid(SERVICE_GID)
        os.setuid(SERVICE_UID)


def bootstrap(environment: dict[str, str]) -> dict[str, str]:
    os.umask(0o077)
    configured = configure_environment(environment)
    prepare_storage(configured, (SERVICE_UID, SERVICE_GID) if os.geteuid() == 0 else None)
    drop_privileges()
    return configured


def _stop_children(children, stop_signal: int, grace_seconds: float) -> None:
    for _, child in children:
        try:
            os.killpg(child.pid, stop_signal)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + grace_seconds
    while any(child.poll() is None for _, child in children) and time.monotonic() < deadline:
        time.sleep(0.05)
    # A child's descendants may outlive their group leader. Always clean groups.
    for _, child in children:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    for _, child in children:
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass


def supervise(commands, environment: dict[str, str], *, cwd: Path = ROOT, grace_seconds: float = 20, poll_seconds: float = 0.1) -> int:
    """Stop every child if one exits or the service receives a stop signal."""
    if not commands:
        raise ValueError('At least one service command is required.')
    children = []
    received_signal = None

    def request_shutdown(signum, _frame):
        nonlocal received_signal
        received_signal = signum

    previous = {signum: signal.signal(signum, request_shutdown) for signum in (signal.SIGTERM, signal.SIGINT)}
    try:
        for name, command in commands:
            if received_signal is not None:
                return 128 + received_signal
            children.append((name, subprocess.Popen(command, cwd=cwd, env=environment, start_new_session=True)))
        while True:
            if received_signal is not None:
                return 128 + received_signal
            for name, child in children:
                code = child.poll()
                if code is not None:
                    print(f'[render] {name} exited unexpectedly with code {code}; stopping the service.', file=sys.stderr, flush=True)
                    return code if 0 < code < 126 else 1
            time.sleep(poll_seconds)
    except OSError as error:
        print(f'[render] Unable to start a service process: {type(error).__name__}.', file=sys.stderr, flush=True)
        return 1
    finally:
        _stop_children(children, received_signal or signal.SIGTERM, grace_seconds)
        for signum, handler in previous.items():
            signal.signal(signum, handler)


def service_commands():
    return [
        ('api', [sys.executable, '-m', 'gunicorn', '--bind', '127.0.0.1:5000',
                 '--workers', '1', '--worker-class', 'gthread', '--threads', '4',
                 '--timeout', '60', '--no-control-socket', '--error-logfile', '-', '--access-logfile', os.devnull, 'app:app']),
        ('worker', [sys.executable, 'scripts/run_worker.py']),
        ('web', ['node', '/app/web/server.js']),
    ]


def main(arguments=None) -> int:
    arguments = list(sys.argv[1:] if arguments is None else arguments)
    mode = arguments.pop(0) if arguments else 'serve'
    forwards = {'manage-users': 'scripts/manage_users.py', 'preflight': 'scripts/preflight.py', 'backup': 'scripts/backup.py'}
    if mode != 'serve' and mode not in forwards:
        print('Usage: render_service.py [serve|manage-users|preflight|backup] [arguments]', file=sys.stderr)
        return 2
    if mode == 'serve' and arguments:
        print('The serve command accepts no arguments.', file=sys.stderr)
        return 2
    try:
        environment = bootstrap(dict(os.environ))
    except (ConfigurationError, OSError) as error:
        print('[render] Startup configuration failed: ' + str(error), file=sys.stderr)
        return 2
    os.environ.update(environment)
    os.chdir(ROOT)
    if mode in forwards:
        os.execv(sys.executable, [sys.executable, forwards[mode], *arguments])
    result = subprocess.run([sys.executable, 'scripts/prepare_dev.py'], env=environment, check=False)
    if result.returncode:
        return 1
    return supervise(service_commands(), environment)


if __name__ == '__main__':
    raise SystemExit(main())
