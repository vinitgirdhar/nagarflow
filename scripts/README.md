# Command-line tooling

Run these tools as modules from the repository root with the project's Python
virtual environment. They are separate from normal web requests.

| Group | Commands and purpose |
| --- | --- |
| `admin` | `python -m scripts.admin.manage_users`, `prepare_dev`, `preflight`, `backup` |
| `deployment` | `python -m scripts.deployment.render_service` supervises hosted processes; `initial_admin` is trusted startup provisioning |
| `evaluation` | `python -m scripts.evaluation.evaluate_intelligence` uses isolated synthetic fixtures |
| `integrations` | `python -m scripts.integrations.poll_weather` polls an explicitly chosen municipality/location |
| `data` | `python -m scripts.data.import_complaints` explicitly imports bundled historical complaint data |
| `dev` | `python -m scripts.dev.auth_browser_server` provides disposable authenticated browser fixtures |
| `dev/seeds` | Historical sample-data utilities, explicitly opt-in and never part of production startup |
| `diagnostics` | Manual database inspection and area-recognition checks |
| `legacy` | Historical optional-provider model diagnostics; not runtime dependencies |

`python -m scripts.run_worker --once` processes one worker cycle. Omit `--once`
for a continuous worker. Shell entrypoints remain `scripts/setup_cloud.sh` and
`scripts/start_production.sh`.

Some administrative and seed commands change data. Use development stores for
sample imports and consult [Authentication](../docs/AUTHENTICATION.md),
[Operations](../docs/OPERATIONS.md) and [Deployment](../docs/DEPLOYMENT.md) first.
