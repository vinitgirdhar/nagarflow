# Authentication and workspace access

This milestone replaces the browser role picker with real accounts. The Flask API enforces permissions on every protected request. The frontend uses the same origin through Next.js rewrites; it no longer substitutes demo responses when the backend is unavailable.

## Public prototype access

The deployed prototype has authenticator setup and second-factor prompts disabled
with `NAGARFLOW_MFA_ENABLED=false` and `NAGARFLOW_REQUIRE_ADMIN_MFA=false`.
Password sessions, CSRF protection and municipality permissions remain active.
Previously enrolled accounts can sign in with their password alone while MFA is disabled.

`NAGARFLOW_DEMO_ENABLED=true` explicitly enables the public sample account:

- Email: `demo@nagarflow.app`
- Password: `NagarFlow Demo 2026!`

The login page also offers Supervisor (`supervisor@nagarflow.app`) and Field worker
(`worker@nagarflow.app`), using the same intentionally public sample password.
The role controls select a distinct account's email; the server verifies its
password and determines permissions. They never grant a role from browser state.
The worker is assigned to the sample field team and has a sample work order.

These intentionally public credentials appear on `/login`, alongside a button to
fill the form. Trusted startup provisions the `prototype-demo` municipality,
separate from the owner's `default` records, with a few explicitly synthetic
complaints, vehicles and a work order. No model accuracy/outcome records are
invented. Demo sign-in does not require password change or MFA. Changes to sample
operational records are shared between visitors; notices ask them not to enter
personal information. Account creation/changes, credential changes, MFA and
external voice/LLM calls are denied for the public account. Signing out still works.

The demo is opt-in; disabling its setting revokes access on the next request.
Repeat startup preserves existing owner and sample records. Render Free may reset
both stores; startup recreates the private initial owner and public sample account.
The remaining owner/provisioning instructions below describe private accounts,
not the published sample password. Optional MFA code is retained for deployments
that explicitly enable `NAGARFLOW_MFA_ENABLED=true`.

## Run locally

```bash
cd /workspace/nagarflow
bash scripts/setup_cloud.sh
venv/bin/python -m scripts.admin.manage_users create --email administrator@your-municipality.example --name 'Municipality administrator'
NAGARFLOW_COOKIE_SECURE=false venv/bin/python -m backend
```

The provisioning command prompts privately for a temporary passphrase and confirmation. Private owner accounts have no default passwords. Change the temporary password at first sign-in. Use an address belonging to your actual administrator. Never paste private credentials into chat or put passwords in command-line arguments. Automation may pass a password through protected standard input with `--password-stdin`.

In a second terminal:

```bash
cd /workspace/nagarflow/nagarflow-next
npm run dev -- --hostname 0.0.0.0
```

The frontend uses port 3000 and proxies `/api/*` and `/uploads/*` to port 5000. Change `NAGARFLOW_BACKEND_URL` **on the Next server**, then restart/rebuild, when the backend address changes. Static export is no longer supported. `NAGARFLOW_COOKIE_SECURE=false` is only for local HTTP development; cookies are secure by default and production forces secure cookies.

`prepare_dev.py` runs repeatable schema migrations without deleting records or creating demo accounts. `--demo` explicitly seeds synthetic operational data; use only in a dedicated development database. The CSV importer preserves existing records and ignores the separate event dataset. Legacy standalone seed scripts are development utilities, not production startup commands.

## Roles and teams

| Role | Server permissions |
| --- | --- |
| Administrator | Municipality dashboards, complaints, dispatch, simulations, account/team administration, maintenance supervision and field operations |
| Maintenance supervisor | Read maintenance tasks/teams, explicitly generate work orders from high-priority predictions, assign idle teams, approve submitted completion evidence |
| Worker | Read their assigned team and its tasks, start assigned work, upload task evidence, submit completion; cannot approve it |

Administrators manage access at `/accounts`. New and reset accounts must change their passwords before other APIs become available. Suspending accounts or changing role/team revokes their sessions. Administrators cannot remove their own admin access or the last active administrator. Password reset for one's own account uses `/account` and requires the current password.

Evidence uploads require the task ID, a real JPEG/PNG/WebP/GIF image, and permission to access that task. Uploads are size limited and stored with generated filenames. A task cannot reference another task's evidence or an arbitrary URL. Supervisor approval requires submitted evidence. Media downloads are authenticated and team scoped.

## Municipalities

Municipality identity comes from the server-side user record, never query parameters, browser storage, or role headers. Each municipality has a separate operational SQLite database and upload directory. The account/session database is shared, and all account administration is scoped to the actor's municipality. Email addresses are globally unique.

```bash
venv/bin/python -m scripts.admin.manage_users municipality city-slug --name 'City name'
venv/bin/python -m scripts.admin.manage_users create --municipality city-slug --email administrator@city.example --name 'City administrator'
venv/bin/python -m scripts.admin.manage_users reset --email administrator@city.example
```

The original operational database belongs to `default`. Before deploying an existing installation, confirm that assigning its data to that municipality is correct. Separate existing mixed-customer data before use. Provision teams through the administrator UI before creating workers. These tools require trusted host access and must not be exposed as public HTTP commands.

## Session and request protection

Opaque random session tokens are held in HttpOnly, SameSite=Lax cookies; only SHA-256 token hashes are stored server-side. Passwords use Werkzeug scrypt. Tokens rotate on login and are revoked on logout/password changes. Sessions expire after eight hours or thirty minutes of API inactivity; background polling counts as activity. Credentials, hashes and session cookies are never returned in account listings or audit events.

`GET /api/auth/session` creates a short-lived anonymous sign-in challenge or returns the current user and CSRF token. Mutations (including login/logout) must send that CSRF token in `X-CSRF-Token`. Browser Origin is checked against `NAGARFLOW_TRUSTED_ORIGINS`. Account and IP login limits persist in SQLite. Client IP is the socket peer; forwarded IP headers are deliberately untrusted. Behind a proxy, the shared peer-IP limit may throttle multiple users; tune infrastructure rate limits and trusted proxy handling for your deployment before scaling.

All API/media responses use `Cache-Control: no-store`. Unknown protected endpoints deny access by default. Authentication remains enabled in tests. The public health endpoint reports only readiness, not tenant/account data.

## Deployment configuration

| Variable | Purpose |
| --- | --- |
| `NAGARFLOW_ENV=production` | Forces secure cookies; requires explicit trusted origins |
| `NAGARFLOW_TRUSTED_ORIGINS` | Comma-separated exact frontend origins, such as `https://civic.example`; no wildcard |
| `NAGARFLOW_DB_PATH` | Persistent default municipality SQLite path |
| `NAGARFLOW_AUTH_DB` | Persistent control database; defaults to `.cache/auth.sqlite3` |
| `NAGARFLOW_TENANT_DATA_DIR` | Persistent parent directory for other municipalities' databases and uploads |
| `NAGARFLOW_BACKEND_URL` | Next server's reachable Flask origin |
| `NAGARFLOW_COOKIE_SECURE` | Defaults true; false only for local HTTP development |

Back up the control database, **all** operational databases, and uploads together; protect backups and host filesystem permissions. Do not use ephemeral container storage or multiple independent replicas with local SQLite. Run migrations before starting Gunicorn, serve Next dynamically, terminate HTTPS at a trusted reverse proxy, and keep Flask on a private interface. No secrets are required to run account management; speech/LLM/provider integrations require their own configured credentials and are not validated by this milestone.

## Webhook authentication

WhatsApp, image and Vapi ingestion now require a trusted gateway rather than anonymous writes. Set `NAGARFLOW_WEBHOOK_SECRET` to a strong secret in the backend and gateway, and set `NAGARFLOW_WEBHOOK_MUNICIPALITY` to a provisioned municipality (default `default`). The gateway must validate its provider's native signature before forwarding JSON.

Send `X-Nagarflow-Event-ID`, an integer Unix timestamp in `X-Nagarflow-Timestamp`, and lowercase HMAC-SHA256 in `X-Nagarflow-Signature`. Sign exact bytes `timestamp + '.' + event_id + '.' + raw_request_body`. This replaces the earlier signature protocol. A durable 202 receipt precedes processing; identical delivery retries return that receipt, conflicting payloads return 409. See [operations](OPERATIONS.md) for worker, review and gateway constraints.

## Validation and remaining production work

```bash
venv/bin/python -m unittest discover -s backend/tests -t .
cd nagarflow-next
npm run build
npm run test:e2e
```

Browser tests start isolated services on ports 5002/3002 with temporary databases and synthetic accounts. They require Chromium (`CHROMIUM_PATH` may override `/usr/bin/chromium`). The fixture is never loaded by normal startup. API tests cover cross-municipality reads/writes, team restrictions, evidence binding, CSRF, rate limits, session expiry/revocation and signed webhooks.

Authenticator MFA, durable ingestion and evaluated retrieval/forecasting are implemented; see OPERATIONS.md and EVALUATION.md for scope and limits. Federated identity, email invitations and public password recovery remain unimplemented. Password recovery requires a trusted administrator or host operator. No production certification is implied.

## Optional authenticator MFA (disabled in the prototype)

Only deployments explicitly setting `NAGARFLOW_MFA_ENABLED=true` expose enrollment at `/account` and second-factor sign-in. They can additionally enforce administrator enrollment with `NAGARFLOW_REQUIRE_ADMIN_MFA=true`. Enrollment uses password reauthentication and a current TOTP code. The eight recovery codes each work once. The private control-database `.mfa-key` companion must be backed up with the database in such deployments. Missing keys never silently regenerate for enabled accounts. Host recovery uses `scripts/admin/manage_users.py reset-mfa --email ...`; it revokes sessions and is audited. None of these prompts appear in the deployed prototype.
