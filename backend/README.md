# Python backend

Flask application and domain packages for NagarFlow. Install dependencies from
`backend/requirements.txt` and run `python -m backend` from the repository root.
Production imports `backend.app:app`.

The `api`, `auth`, `core`, `intake`, `operations`, `intelligence` and `integrations`
directories separate responsibilities. Tests live in `backend/tests` and static
assets in `backend/static`.

See [Project structure](../docs/PROJECT_STRUCTURE.md) for ownership and entrypoints,
the [README](../README.md#run-locally) for setup, and
[Operations](../docs/OPERATIONS.md) for behavioral contracts.
