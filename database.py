"""Server-selected municipality data stores. Never select a store from request input."""
import os
import re
from pathlib import Path

from flask import current_app, g, has_app_context

DEFAULT_DB_PATH = os.getenv('NAGARFLOW_DB_PATH', 'nagarflow.db')
MUNICIPALITY_ID = re.compile(r'^[a-z][a-z0-9-]{0,62}$')


def data_path(fallback=None):
    if has_app_context():
        municipality = getattr(g, 'municipality_id', 'default')
        if not MUNICIPALITY_ID.fullmatch(municipality):
            raise ValueError('Invalid municipality identifier')
        if municipality != 'default':
            return str(Path(current_app.config['TENANT_DATA_DIR']) / municipality / 'nagarflow.db')
        if fallback is None or fallback == DEFAULT_DB_PATH:
            return current_app.config.get('DATA_DB_PATH', DEFAULT_DB_PATH)
    return fallback or DEFAULT_DB_PATH


def upload_directory():
    return Path(data_path()).resolve().parent / 'uploads'
