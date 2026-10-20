# Free Render backend

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vinitgirdhar/nagarflow)

The root Blueprint uses **Render Free**, with no paid service or persistent disk.
`Dockerfile.backend` runs Flask on the public `PORT` with its complaint worker in
the same service. Netlify serves the native Next.js frontend and proxies `/api/*`
and `/uploads/*` to this backend.

Deployed and smoke-checked on 20 October 2026:
[backend health](https://nagarflow.onrender.com/api/health),
[frontend](https://nagarflow.netlify.app). The Render service is `nagarflow` in
the owner's confirmed workspace, with compute plan `free` and no disk.

## Free-plan behavior

Render Free sleeps after 15 minutes without incoming traffic. Waking can take
about a minute. Its filesystem resets on sleep, restart and redeploy: complaints,
accounts, sessions, uploaded evidence and MFA enrollment can be lost. The worker
also stops while the service sleeps. This deployment is suitable for evaluation
with disposable data; it does not provide durable municipal records.

These are [Render Free limitations](https://render.com/docs/free), not an
application backup guarantee. Free compute is shared with the other free services
in the workspace. Do not enable keep-alive traffic to evade idle sleep. No
paid-provider keys or local databases are uploaded by deployment.

## Initial administrator without a server shell

Render Free has no dashboard/SSH shell. Configure the following privately before
the first deploy:

| Variable | Purpose |
| --- | --- |
| `NAGARFLOW_INITIAL_ADMIN_EMAIL` | The owner's sign-in email |
| `NAGARFLOW_INITIAL_ADMIN_PASSWORD_HASH` | A Werkzeug `scrypt:32768:8:1` hash with a 16-character salt |
| `NAGARFLOW_INITIAL_ADMIN_NAME` | Optional display name, default `Administrator` |

Generate a unique temporary passphrase locally and keep it in a private password
manager or restricted local file. Generate its hash with
`werkzeug.security.generate_password_hash(passphrase, method='scrypt:32768:8:1')`
in that local trusted process. Configure only the hash in Render. Never put the
passphrase in source, build commands, environment variables, logs or chat.

Startup provisions exactly one administrator only when the entire account store
is empty. Existing accounts are never overwritten. Sign in through Netlify,
change the temporary passphrase. The prototype disables authenticator setup and
second-factor prompts. The separately scoped public demo described in
[AUTHENTICATION.md](AUTHENTICATION.md) publishes only sample-account credentials.

After a filesystem reset, startup recreates only this initial account with its
original temporary passphrase. The owner must change that password again; the
public demo account and its synthetic sample records are recreated separately.
Other accounts and operational data are not restored. Keep the
initial passphrase private and rotate its configured hash if compromised.

## Automatic deployment

Both hosts track the GitHub repository's `main` branch. Render uses
`autoDeployTrigger: commit`; Netlify's linked GitHub build is enabled with base
`nagarflow-next`, `npm run build` and native Next.js runtime output. A normal push
or merge to `main` deploys both services automatically. Feature branches do not
replace production. No manual deploy command or deploy-hook secret is required.
Use the hosts' deploy logs to follow each commit. Free Render still sleeps and
can reset local sample changes; auto-deployment does not add persistent storage.

## Launch settings

1. Deploy `main` from the repository root with `Dockerfile.backend`, Docker
   runtime, **Free** compute, one instance and no disk.
2. Set `NAGARFLOW_STORAGE_DIR=/tmp/nagarflow`, `NAGARFLOW_ENV=production`,
   `NAGARFLOW_REQUIRE_ADMIN_MFA=false`, `NAGARFLOW_MFA_ENABLED=false`,
   `NAGARFLOW_DEMO_ENABLED=true` and the private initial-account settings.
3. Set `NAGARFLOW_TRUSTED_ORIGINS` to the exact production frontend origin
   `https://nagarflow.netlify.app`. Add only actual HTTPS custom domains you use.
4. Wait for the assigned Render origin's `/api/health` to return
   `{"status":"ok"}`. Set that actual origin as Netlify's build-time
   `NAGARFLOW_BACKEND_URL`; see [NETLIFY.md](NETLIFY.md).
5. Verify secure sessions, CSRF and role enforcement through the live Netlify
   proxy. Provider delivery requires separately configured credentials/gateway
   validation; a healthy API does not certify external integrations.

The original `Dockerfile` and `serve` launcher remain available for a complete
Next/API/worker container. This free deployment uses `serve-api`, which runs only
Flask and its worker and does not build or run Node on Render.

## Verification

`tests/test_initial_admin.py` covers absent/invalid provisioning configuration,
hash-only account creation, no overwrite of existing stores, recreation after a
fresh ephemeral store, backend-only commands, and real Linux startup. Existing
Render supervisor tests cover process cleanup and signal forwarding. Deployment
configuration and local tests do not themselves establish a live deployment or
durable storage.
