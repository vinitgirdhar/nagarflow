# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS node-runtime

FROM node-runtime AS frontend-build
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1 NAGARFLOW_BACKEND_URL=http://127.0.0.1:5000
COPY nagarflow-next/package.json nagarflow-next/package-lock.json ./
# Optional CA mounts support local builds behind a managed HTTPS proxy.
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY nagarflow-next/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    NAGARFLOW_ENV=production NAGARFLOW_STORAGE_DIR=/var/data/nagarflow \
    NAGARFLOW_INGEST_WORKER=false PORT=10000
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --user-group --create-home --shell /usr/sbin/nologin nagarflow
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN --mount=type=secret,id=proxy_bundle \
    if [ -s /run/secrets/proxy_bundle ]; then export PIP_CERT=/run/secrets/proxy_bundle; fi; \
    python -m pip install --no-cache-dir -r backend/requirements.txt
COPY --chown=10001:10001 backend/ ./backend/
COPY --chown=10001:10001 scripts/ ./scripts/
COPY --from=frontend-build --chown=10001:10001 /build/.next/standalone/ ./web/
COPY --from=frontend-build --chown=10001:10001 /build/.next/static/ ./web/.next/static/
COPY --from=frontend-build --chown=10001:10001 /build/public/ ./web/public/
RUN mkdir -p /app/backend/static/uploads /var/data/nagarflow \
    && chown 10001:10001 /app/backend/static/uploads /var/data/nagarflow \
    && chmod 700 /var/data/nagarflow
EXPOSE 10000
# Entrypoint initializes the mounted directory, then drops to uid/gid 10001.
ENTRYPOINT ["python", "-m", "scripts.deployment.render_service"]
CMD ["serve"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:'+os.environ.get('PORT','10000')+'/api/health',timeout=4).read()"
