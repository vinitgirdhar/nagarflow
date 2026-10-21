# Project structure

NagarFlow separates the Python backend, Next.js frontend, command-line tooling,
documentation, datasets and product media. The repository root contains the
README and project-wide Git, CI and hosting configuration.

## Ownership

| Directory | Responsibility |
| --- | --- |
| `backend/api/` | Product API blueprint and boundary validation |
| `backend/auth/` | Sessions, roles, municipality access, MFA and sample accounts |
| `backend/core/` | Paths, database selection, schema, privacy, logs and backups |
| `backend/intake/` | Complaint parsing, locality matching, receipts and processing |
| `backend/operations/` | Fleet allocation, dispatch lifecycle, work orders and reporting |
| `backend/intelligence/` | Forecasting, approved-document retrieval and priority scoring |
| `backend/integrations/` | Agency, speech and weather provider adapters |
| `backend/tests/` | Backend, provisioning and production-entrypoint regression tests |
| `backend/static/` | Assets served by Flask at the existing `/static` URL |
| `nagarflow-next/` | Next.js application, browser journeys and frontend configuration |
| `scripts/` | Explicit administrative, deployment and development commands |
| `docs/` | Product, security, evaluation and hosting guides; screenshots in `images/` |
| `data/` | Bundled synthetic historical data and locality reference |
| `media/launch-film/` | Finished launch film and production deliverables |

## Entry points

Run Python commands from the repository root, using your virtual environment:

```bash
venv/bin/python -m backend
venv/bin/python -m scripts.admin.prepare_dev
venv/bin/python -m scripts.admin.manage_users --help
venv/bin/python -m scripts.admin.preflight
venv/bin/python -m scripts.admin.backup --help
venv/bin/python -m scripts.run_worker --once
venv/bin/python -m scripts.evaluation.evaluate_intelligence
venv/bin/python -m unittest discover -s backend/tests -t .
```

On Windows use `.\venv\Scripts\python.exe` in place of `venv/bin/python`.
Production Gunicorn imports `backend.app:app`. Both Dockerfiles launch
`python -m scripts.deployment.render_service`; the backend-only image retains
its `serve-api` mode and the combined image retains `serve`.

Module invocation keeps imports explicit. Application code imports its owning
package, such as `backend.core.database`, without injecting source folders into
`sys.path` or depending on root-level compatibility files.

## Runtime paths and compatibility

`backend/core/paths.py` defines the project, backend, static and dataset roots
without opening stores or loading credentials. Local `.env` remains at the
repository root. Existing `NAGARFLOW_DB_PATH`, `NAGARFLOW_AUTH_DB` and
`NAGARFLOW_TENANT_DATA_DIR` settings continue to select the same stores.

The structure change preserves API routes, session/CSRF policies, municipality
selection, task/media authorization and dispatch semantics. It does not migrate
or remove existing operational databases, uploads, credentials or backups.
Private runtime files, virtual environments and caches remain ignored.

Next.js remains in `nagarflow-next/` so the existing Netlify project base and
frontend build contract continue to work. The root `netlify.toml`, `render.yaml`
and Dockerfiles remain hosting entrypoints.

## Adding code

- Put domain logic in the matching backend package and request handlers in the
  API layer. `backend/app.py` remains the Flask application and legacy-route owner.
- Keep tests with the backend in `backend/tests/`; frontend and browser tests
  stay with the Next.js application.
- Put explicit commands under the matching `scripts/` group and document their
  module invocation. Development seeders and historical provider diagnostics
  are not production startup steps.
- Update the [README](../README.md), relevant guide and CI/hosting entrypoints
  whenever an owned path changes.

The CI workflow checks the Python package, frontend build and browser journeys,
then builds and starts the backend Docker image to catch packaging regressions.
