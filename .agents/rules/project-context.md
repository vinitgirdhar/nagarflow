# Project Context

## Overview
This repository contains the `nagarflow` project, which operates with a Python backend and a Next.js frontend ecosystem.

## Current Project Structure
- **/nagarflow-next/**: The core Next.js frontend. It follows the App Router architecture architecture, containing routing files in `app/` (e.g., reports, complaints, predictions, dispatch, emergency, agencies).
- **Backend Service**: Features a Python-based backend that runs via `app.py` in the root folder.
- **/static/**: Contains static assets and legacy HTML configurations.

## Always Active Rules
- **UI Consistency**: Maintain modern, responsive UI elements when updating components within `nagarflow-next`, continuing the transition to the full Next.js application paradigm.
- **Backend Communication**: Assure that Next.js frontend fetches adhere to the local specifications driven by the Python backend.

## Authentication architecture (2026-10)
- `auth_service.py` owns opaque SQLite-backed sessions, CSRF, provisioning and default-deny API roles. Never add a testing auth bypass or trust browser storage/header roles.
- `database.py` selects physical municipality data paths from verified `g.municipality_id`; all request-time SQL must use `data_path()`. `schema.py` owns repeatable migrations.
- Next uses same-origin `app/lib/api.ts` and root `AuthBoundary`; dynamic rewrites replace static export/demo API interception. Read installed Next docs before editing.
- Trusted provisioning: `scripts/manage_users.py`; no default credentials. See `AUTHENTICATION.md` for startup and deployment.
- Test commands: `venv/bin/python -m unittest discover -s tests`, frontend `npm run build` and `npm run test:e2e`. Browser fixtures use temporary databases and synthetic accounts only.

## Dispatch and reporting architecture
- `dispatch_service.py` owns transactional acceptance/arrival/cancellation, request-key deduplication and committed dispatch audit events. `dispatch_contract.py` defines recommendation versions and coordinate/score validation. All service calls receive the server-selected municipality path.
- `schema.py` adds `dispatches`, `dispatch_requests`, `dispatch_events`, active assignment indexes and linked observation snapshots; legacy busy routes are preserved without invented acceptance history. `scripts/prepare_dev.py` migrates every registered municipality.
- `ActiveDispatches.tsx` and `app/lib/dispatch.ts` share durable fleet actions across dashboard/dispatch. Every logical write has an Idempotency-Key. A map animation never performs an authoritative mutation.
- `reporting.py` derives coverage from confirmed arrivals/evidence-approved tasks and compares explicitly reported demand scores with acceptance snapshots. Never substitute fake accuracy, equity, efficiency or weekly/ward history. See DISPATCH.md for API contracts and limitations.


## Current product architecture (2026-10-17)
Use OPERATIONS.md, AUTHENTICATION.md and DEPLOYMENT.md as current contracts. ingestion.py persists versioned HMAC event-ID receipts before 202; worker.py processes atomically per tenant. Never restore signature-only replay handling. knowledge.py uses approved-only FTS excerpts and aggregate history, not paid generation. forecasting.py fits historical ridge and compares baselines without future leakage. observability.py logs route templates and request IDs, never resident payloads. mfa.py requires the private .mfa-key alongside the control DB; backup_service.py includes it and revokes restored sessions. product_api.py routes use explicit roles, CSRF and tenant storage. Additive migrations must initialize every registered municipality. Browser tests use isolated synthetic fixtures only. Never reintroduce mock API JSON, fabricated weather/performance metrics or cross-tenant resident text indexes.

## Main branch publication
`main` is the GitHub default branch and includes both legacy branch tips (`master`, `verison-updation`). The full remote workflow passed for 62d102d (run 39030290654). Documentation must distinguish verified CI from unverified live-provider and production-host behavior. Preserve legacy branches unless deletion is explicitly requested.
