#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
export NAGARFLOW_ENV=production
: "${NAGARFLOW_TRUSTED_ORIGINS:?Set the exact public HTTPS origin}"
: "${NAGARFLOW_AUTH_DB:?Set the persistent control database path}"
: "${NAGARFLOW_DB_PATH:?Set the persistent default data database path}"
: "${NAGARFLOW_TENANT_DATA_DIR:?Set the persistent tenant directory}"
case "${1:-}" in
  api) exec venv/bin/gunicorn --bind "${NAGARFLOW_BIND:-127.0.0.1:5000}" --workers 2 --timeout 60 app:app ;;
  worker) exec venv/bin/python scripts/run_worker.py ;;
  web) cd nagarflow-next; exec npm run start -- --hostname "${NAGARFLOW_WEB_BIND:-127.0.0.1}" ;;
  *) echo 'Usage: scripts/start_production.sh api|worker|web' >&2; exit 2 ;;
esac
