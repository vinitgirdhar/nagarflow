#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv venv
venv/bin/python -m pip install -r backend/requirements.txt
(cd nagarflow-next && npm ci)
mkdir -p .cache
venv/bin/python -m scripts.admin.prepare_dev
