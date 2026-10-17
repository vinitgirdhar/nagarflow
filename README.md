# NagarFlow

A protected workspace for municipal complaint intake, fleet assignments, field evidence, grounded document retrieval and inspectable forecasting.

## Implemented workflows

- **Accounts and isolation:** server-side sessions, role permissions, municipality-specific databases/media, authenticator MFA and one-use recovery codes. Production requires administrator MFA by default.
- **Durable intake:** signed gateway deliveries receive persistent receipts. An atomic worker handles retries, dead letters, review and complaint creation without duplicate side effects.
- **Fleet and field operations:** compatible vehicle suggestions, guarded dispatch acceptance/arrival/cancellation, registered assets, linked work orders, team assignments, task-bound photos and supervisor approval.
- **Grounded knowledge:** approve and retire documents, retrieve exact citations with SQLite FTS5/BM25, and inspect historical complaint aggregates. This is extractive retrieval; it does not invent uncited answers or execute retrieved instructions.
- **Forecast evaluation:** seasonal-naive and rolling-mean baselines plus ridge lag regression; rolling-origin validation, two-day complaint-volume estimates, freshness checks and explicit limits on residual ranges.
- **Reporting and operations:** confirmed visits, explicit demand observations, audited corrections, current-data PDF exports, safe request IDs/logs, private backups and verified restore.

The app does not claim validated live forecast accuracy, autonomous emergency response, inferred equity scores or real-time social scraping. Provider credentials and live deployment configuration are separate from local code verification.

`main` is the default and current development branch. It includes the previous `master` and `verison-updation` history. Pull `main` for the latest supported setup.

## Run on your computer

Requires Python 3.12, Node.js 22 (with npm), Git and SQLite with FTS5. Use macOS/Linux Bash, or WSL on Windows. Keep the backend and frontend terminals running.

For a fresh clone:

```bash
git clone --branch main https://github.com/vinitgirdhar/nagarflow.git
cd nagarflow
```

For an existing clone, first commit or stash your own local edits, then:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

Install dependencies and migrate the local databases (from the repository root):

```bash
bash scripts/setup_cloud.sh
venv/bin/python scripts/manage_users.py create --email YOUR_EMAIL --name 'Municipality administrator'
```

Replace `YOUR_EMAIL` with your actual address. The account command privately prompts for a temporary passphrase; no default credentials exist. Run it once for your initial administrator. Setup preserves existing records and does not import the bundled synthetic CSV automatically.

Start the backend in terminal 1:

```bash
NAGARFLOW_COOKIE_SECURE=false venv/bin/python app.py
```

Start the frontend in terminal 2, from the same repository:

```bash
cd nagarflow-next
npm run dev -- --hostname 127.0.0.1
```

Open **http://localhost:3000** on that same computer. Sign in with the account you created and change its temporary password. Next proxies `/api/*` and `/uploads/*` to Flask on port 5000, so no separate frontend API key is needed. Local HTTP requires the development cookie setting above; production forces secure cookies. The development backend starts the inbox worker automatically.

Check the backend with `curl http://127.0.0.1:5000/api/health` (expected `{"status":"ok"}`). If a port is occupied, stop your older NagarFlow process before restarting. A localhost URL for an app running in a remote cloud environment cannot be opened on your computer without port forwarding.

### Optional integrations

Core account, dispatch, document retrieval and local forecast workflows run without paid-provider keys. Live Groq, Sarvam, Telegram and weather services need their own credentials/network permissions; see DEPLOYMENT.md and OPERATIONS.md. Never commit `.env`, databases, media, backups or authenticator keys. The bundled historical CSV is synthetic evaluation data, not live operational evidence.

## Verification

```bash
venv/bin/python -m unittest discover -s tests
venv/bin/python scripts/evaluate_intelligence.py
venv/bin/python scripts/preflight.py
cd nagarflow-next
npm run build
npx playwright install chromium
CI=1 npm run test:e2e
```

Tests use isolated databases and synthetic accounts. The CI workflow runs backend checks, the reproducible intelligence evaluation, production build and browser journeys. Commit `62d102d` passed the full workflow: [successful GitHub Actions run](https://github.com/vinitgirdhar/nagarflow/actions/runs/39030290654). Check the latest run under [Actions](https://github.com/vinitgirdhar/nagarflow/actions) for subsequent commits.

## Documentation

- [Authentication and provisioning](AUTHENTICATION.md)
- [Durable dispatch and observation handling](DISPATCH.md)
- [Intake, retrieval, forecasting and operations](OPERATIONS.md)
- [Deployment and backup runbook](DEPLOYMENT.md)
- [Evaluation methodology/results](EVALUATION.md)
- [Roadmap and remaining external gates](PRODUCT_ROADMAP.md)
- [Implementation/verification record](IMPLEMENTATION_REPORT.md)

The runtime uses Next.js/React, Flask, SQLite/FTS5 and standard-library regression. Optional Groq, Sarvam, Telegram and Open-Meteo integrations require their own configuration. Static-export mock APIs and automatic demo response interception have been removed.
