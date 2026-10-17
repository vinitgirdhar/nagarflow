# Product operations and intelligence

## Durable complaint intake

WhatsApp, image and Vapi endpoints accept normalized JSON from a trusted gateway. The gateway must first validate the original provider's signature and map its stable delivery ID. Direct anonymous writes and unverified native-provider payloads are not accepted.

Configure the backend/gateway `NAGARFLOW_WEBHOOK_SECRET` privately and bind `NAGARFLOW_WEBHOOK_MUNICIPALITY` to an active municipality. Send:

- `X-Nagarflow-Event-ID`: stable provider delivery ID, 1–200 ASCII letters/digits/`_.:-`.
- `X-Nagarflow-Timestamp`: integer Unix time within five minutes.
- `X-Nagarflow-Signature`: lowercase HMAC-SHA256 of **`timestamp + '.' + event_id + '.' + exact_body_bytes`**.

This replaces the earlier timestamp/body-only signature. Deploy gateway/backend changes together. Signing the event ID prevents changing it on a captured signed delivery. The same event ID/body can be replayed safely with a fresh signature; a changed body under the same ID returns 409.

A 202 response means the receipt is committed, not that a complaint is already processed. It returns `receipt_id`, `status` and `duplicate`. Acknowledgement loss cannot duplicate a receipt or complaint. Channel aliases share the same receipt identity. Payloads are capped at 256 KB; resident text at 4,000 characters.

| Endpoint | Normalized JSON |
| --- | --- |
| `POST /api/whatsapp-complaint` | A text string in `user_message`, `message`, `Body`, `body` or `text` |
| `POST /api/image-complaint` (or POST plural alias) | `file_id` plus optional `caption`/`raw_text`; the provider file is retrieved through an authenticated server proxy |
| `POST /api/webhooks/vapi` | `message.type = "tool-calls"`, 1–20 `toolCalls`, each with `id` and object/JSON-string `function.arguments` containing `zone`, `issue` and optional `summary` |

Vapi intake is asynchronous. A gateway must provide any provider-specific synchronous tool acknowledgement; this endpoint does not claim to complete a live call's tool protocol automatically. No live provider delivery was certified without provider credentials.

## Worker and review

Development `python app.py` starts a worker unless `NAGARFLOW_INGEST_WORKER=false`. Production Gunicorn requires a separately supervised worker:

```bash
venv/bin/python scripts/run_worker.py
venv/bin/python scripts/run_worker.py --once
```

The worker processes each receipt and all side effects in one municipality-local transaction. A crash rolls them back together. Failure metadata contains a safe code, not exception/resident text. Retries use exponential backoff; five failed attempts become `DEAD`. Administrators can explicitly retry a failed receipt at `/operations`; this records an audit event. Concurrent workers share SQLite transaction/uniqueness guards.

Local classification is a deterministic fallback, not a claimed semantic classifier. Unknown places/issues are preserved as `REVIEW` instead of discarded. Administrators classify them on `/complaints`; stale revision edits are rejected. Source-linked work-order creation returns an existing active order rather than creating duplicates. The receipt becomes complete once all its complaint classifications are resolved. Images are reviewed on `/visual-complaints`.

Completed payload JSON is discarded after processing; stable receipt hashes/IDs remain for deduplication. New retained text has best-effort email/phone/obvious-credential redaction. This is not comprehensive anonymization; approved documents, images, field notes and retention requirements still need organizational review. Contact/provider sender fields unused by processing are not retained.

## Grounded knowledge

`/knowledge` manages drafts, approval and retirement. Only approved chunks enter FTS5/BM25 retrieval. Editing returns a document to draft and removes its chunks until reapproval. Revision checks prevent silently overwriting a concurrent decision. HTTP(S) source URLs are metadata links only; the server never fetches arbitrary document URLs.

`POST /api/knowledge/query` accepts only `{ "question": "..." }`. Responses contain exact quoted excerpts/aggregate counts, stable source IDs, document revision, citations, abstention and an explicit extractive mode. There is no autonomous tool execution or third-party generation. Aggregate complaint retrieval avoids indexing resident prose into search. It reports historical record counts, not currently open case counts.

Retrieval is lexical and best suited to the language/terms in approved documents. It is not a multilingual semantic embedding model. Five synthetic evaluation questions are a smoke benchmark, not broad answer-quality certification. Add municipality-specific human-reviewed evaluations before relying on it for high-stakes decisions.

## Forecasting and scenarios

`GET /api/forecasts` uses daily sums of `complaint_count` per zone and UTC date. Default cutoff is yesterday UTC; `as_of=YYYY-MM-DD` supports explicit historical evaluation. Future observations are excluded. Models are weekly seasonal naive, seven-day mean and a fitted ridge regression on lag/rolling-mean features.

Every candidate has seven rolling-origin one-day evaluations fitted only on prior data. The best selection-backtest MAE chooses the two-day forecast model. The same backtest selects the model, so it is not an independent holdout. Histories shorter than 28 calendar days, fewer than 14 recorded days, or stale by over two days do not produce forecasts. Missing calendar days within history are treated as zero; ingestion outages can invalidate that assumption. The historical-residual range is not a calibrated confidence interval.

The supplied dataset is synthetic history. It is evaluated in a temporary database by `scripts/evaluate_intelligence.py`; it is never automatically imported into a production municipality. Forecast volume does not overwrite priority scores or automatically dispatch resources.

What-if planning deterministically adjusts a copy of existing priority scores. Its output explicitly excludes fabricated coverage/response-time KPIs and never updates live records. Weather/AQI values are not synthesized. An explicit location/provider poll can be scheduled with:

```bash
venv/bin/python scripts/poll_weather.py --municipality default --latitude 19.076 --longitude 72.8777
```

Only use coordinates that actually match that municipality. Snapshots show source, location and timestamp; the risk page flags stale observations. Failures preserve the old snapshot and do not imply clear weather. Live Open-Meteo verification is blocked until its domain is allowed by the environment policy.

## Corrections, audit and monitoring

`POST /api/dispatch/observation` requires a CSRF token, Idempotency-Key and `{dispatch_id, expected_revision, actual_demand, reason}`. A score may be null to withdraw an erroneous observation. Corrections update the measured report while retaining previous/new values, actor, revision and reason. They cannot change fleet state or an acceptance snapshot.

Every request receives a server-generated `X-Request-ID`. JSON failures include the same ID. Application logs contain route templates, method, status, duration and request ID, not query strings, bodies, passwords or keys. Default Werkzeug request-line access logging is suppressed. Configure reverse-proxy/hosting logs with the same privacy constraints; that infrastructure is outside this application.

`/operations` shows receipt counts, safe errors and worker heartbeat. A missing heartbeat is not reported as a healthy worker. Application health checks do not prove external delivery, GPS validity, model quality or proxy TLS correctness. Use the deployment runbook to validate those separately.
