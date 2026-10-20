# Deploy with Netlify and Render

Netlify serves the Next.js frontend. The [free Render service](RENDER.md) runs the Flask API and complaint worker. SQLite databases, uploaded evidence and the MFA host key are local ephemeral files: they can reset whenever Render sleeps, restarts or redeploys.

Netlify forwards `/api/*` and `/uploads/*` directly to the Python backend, so browser requests stay on the Netlify origin. Render does not build or run a second frontend in this setup.

Live smoke checks passed on 20 October 2026 at [nagarflow.netlify.app](https://nagarflow.netlify.app) and the [free Render API](https://nagarflow.onrender.com/api/health). Health, initial sign-in/sign-out, secure host-only cookies, no-store responses, anonymous denial, CSRF and Origin rejection were verified through both hosts. The actual homepage and sign-in form also loaded in the browser. Owner password change and authenticator enrollment remain first-sign-in steps; no live provider delivery or durable storage is claimed.

## Connect the services

1. Deploy the root `render.yaml` using [the Render guide](RENDER.md). It uses a Free Python Docker service without a disk. Wait for `https://YOUR_RENDER_HOST/api/health` to return `{"status":"ok"}`.
2. In Netlify, import `vinitgirdhar/nagarflow` from GitHub and select the **main** production branch. Use the repository-root `netlify.toml`: base `nagarflow-next`, build `npm run build`, publish `.next`, Node.js 22. The root config explicitly loads `@netlify/plugin-nextjs`: this existing site otherwise uploads `.next` as static files and returns 404s without server functions or rewrites. Leave the adapter version unpinned for automatic updates.
3. Before building, set this Netlify environment variable with build availability:

   | Variable | Value |
   | --- | --- |
   | `NAGARFLOW_BACKEND_URL` | The Render service's exact HTTPS origin, such as `https://your-service.onrender.com` |

   Replace the example with the real host. Do not include `/api`, credentials, a query or a fragment. Do not use localhost or a Netlify frontend/deploy URL. Netlify sets `NETLIFY=true`; the Next configuration rejects a missing or unsafe backend origin during the build. Changing this variable requires a new build because the proxy destination is built into the frontend.
4. Note the actual production URL assigned to your Netlify site. In **Render**, set `NAGARFLOW_TRUSTED_ORIGINS` to both exact HTTPS origins, separated by a comma:

   ```text
   https://your-service.onrender.com,https://your-site.netlify.app
   ```

   Replace both examples. Save the setting and let Render restart. Add an actual custom domain here before using it. Do not trust wildcard deploy-preview domains; preview builds are not automatically authorized production clients.
5. Deploy `main` in Netlify. Do not use static export or upload `.next` as a static site: authenticated API and evidence proxies require the Next.js runtime. Open the resulting Netlify HTTPS URL and check `/api/health` there too.

Keep provider keys and the signed-intake secret in Render, where the Python services use them. The backend URL is routing configuration, not a credential. Do not put administrator passwords, authenticator secrets or provider keys in chat, frontend source or `NEXT_PUBLIC_*` variables.

## Create the administrator

Render Free has no server shell. Follow the private, hash-only initial-account configuration in [RENDER.md](RENDER.md). Startup creates the administrator only when the account store is empty. Sign in through Netlify, change the temporary passphrase and enroll your own authenticator. Do not seed demo records. Free-plan filesystem resets recreate only the initial account and require password change and MFA enrollment again; they do not restore operational data.

## Verify the live connection

Before inviting users, check the actual deployed HTTPS hosts:

- Both `/api/health` URLs return a healthy response. The landing page and sign-in can reach the session API; a frontend deploy without a healthy backend is incomplete.
- Sign-in, required passphrase change, MFA and sign-out work. The proxied session cookie retains `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` and no `Domain` attribute. Session and private API responses retain `Cache-Control: no-store`.
- An authorized write succeeds with its CSRF token. A missing token or untrusted `Origin` is rejected. Keep browser requests same-origin; do not replace the proxy with direct cross-origin API calls.
- A worker uploads task evidence, an authorized supervisor views it and approves the work. Signed intake retains its original request body through the proxy and the worker processes the delivery once.
- A Free Render restart can reset accounts, MFA enrollment, complaints and evidence. Verify that the initial account is recreated after a fresh store and do not claim restart persistence. The durable-storage backup/restore runbook in [DEPLOYMENT.md](DEPLOYMENT.md) describes a separate deployment requirement, not a capability of this free instance.

Local builds, browser tests and container persistence checks do not establish that Netlify's live proxy, HTTPS cookies or external providers have been verified. Record those results after the services are connected.

Local verification for this configuration passed: five deployment configuration tests, 21 browser tests, targeted lint and the Netlify CLI offline production build. The offline build used a test-only backend origin; it did not upload the app, verify Netlify's hosted runtime packaging or contact a live backend.
