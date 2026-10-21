"""Repository locations shared by runtime code and command-line tools.

These constants do not load credentials, open stores or initialize the app.
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / 'backend'
STATIC_ROOT = BACKEND_ROOT / 'static'
DATA_ROOT = PROJECT_ROOT / 'data'
