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
  api) exec venv/bin/gunicorn --bind "${NAGARFLOW_BIND:-127.0.0.1:5000}" --workers 2 --timeout 60 backend.app:app ;;
  worker) exec venv/bin/python -m scripts.run_worker ;;
  web)
    cd nagarflow-next
    test -f .next/standalone/server.js || { echo 'Build the frontend before starting it.' >&2; exit 1; }
    mkdir -p .next/standalone/.next
    cp -R public .next/standalone/
    cp -R .next/static .next/standalone/.next/
    HOSTNAME="${NAGARFLOW_WEB_BIND:-127.0.0.1}" PORT="${PORT:-3000}" exec node .next/standalone/server.js
    ;;
  *) echo 'Usage: scripts/start_production.sh api|worker|web' >&2; exit 2 ;;
esac
