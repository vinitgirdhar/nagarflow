# Deployment readiness: Render and Netlify

Prepared on 20 October 2026 after fast-forwarding local `main` to GitHub commit
`02df58c2cc86cf4a27c2a199346a8e23fb3cc0aa`.

## Prototype sign-in update on 20 October 2026

Application commit `a4a92349866ac89abf7de5feb1425888455e7cb8` is live on both
hosts. Render remains on Free compute without a persistent disk. Authenticator
setup, enrollment requirements and second-factor sign-in are disabled for this
prototype. The sign-in page publishes `demo@nagarflow.app` / `NagarFlow Demo 2026!`
and provides a button to fill the form.

The public account opens a separate `prototype-demo` municipality with explicitly
synthetic sample records and no password-change prompt. It does not expose the
private owner's municipality or credentials. Shared sample changes are visible to
other visitors; account/credential changes and external voice/LLM calls are blocked.
The page and workspace disclose the shared, disposable nature of this data.

Live HTTPS checks passed through Render and Netlify for demo sign-in, dashboard
access, absence of MFA/password onboarding, scoped account listings, secure
host-only cookies, denied account changes, CSRF/Origin rejection and sign-out.
The live browser displayed the credentials and no authenticator input. Linux CI
passed 121 backend tests, 21 browser tests, five deployment configuration tests,
two session-race regression tests and the production build. The new provisioning
module has 100% statement coverage. All 21 browser tests also passed locally after
fixing concurrent sign-in challenge requests. Production npm and Python dependency
audits remain clear; the pre-existing five development-tooling npm advisories remain.

Render deployment: `dep-dbbhqsdg1s2s7391ohdg`. Netlify published deployment:
`6ad71d6bae4cc90f7e3119db`. No provider delivery, durable storage or backup/restore
capability is claimed. The previous launch notes below are historical.

## Live verification on 20 October 2026

- Frontend: <https://nagarflow.netlify.app>, with the native Next.js runtime and
  production Git branch `main`.
- Backend: <https://nagarflow.onrender.com/api/health>, service
  `srv-dbbh3t3bc2fs73b6irgg`, compute plan `free`, no persistent disk.
- Application commit `3904417923309cb8032e2a8138e5c8e5326e82bc` was deployed
  successfully to both hosts. GitHub Linux CI passed 114 backend tests, 21 browser
  tests and five deployment configuration tests.
- Live HTTPS checks passed through both hosts: health, private initial sign-in,
  sign-out, Secure/HttpOnly/SameSite=Lax host-only cookies, no-store responses,
  anonymous access denial, missing-CSRF rejection and untrusted-Origin rejection.
  The actual homepage and sign-in form loaded in the browser.
- At initial launch the owner had to change the private temporary passphrase and
  enroll an authenticator; the prototype update above removes MFA. No provider delivery or live task-evidence
  workflow was exercised, and no operational data was seeded.
- Free Render local files can reset on sleep/restart/redeploy. This verification
  does not establish data persistence or a production backup/restore procedure.

The following preparation notes describe the setup inspected before launch.

## Source and dependency preparation

- Keep the repository-root `render.yaml`, `Dockerfile.backend` and `netlify.toml` as the
  deployment configuration. See [RENDER.md](RENDER.md) and [NETLIFY.md](NETLIFY.md).
- Next.js and its ESLint configuration are pinned to 16.4.2. The lockfile also
  updates compatible transitive dependencies to address the advisories reported
  during preparation. `npm audit --omit=dev` reports no known vulnerabilities.
- The full audit still reports five high findings in the development-only ESLint
  dependency chain (`braces`, `micromatch`, `fast-glob`, the Next ESLint plugin and
  its configuration). The reported automatic remedy downgrades the Next ESLint
  configuration to version 14; do not apply `npm audit fix --force`. Recheck the
  upstream fix before a later tooling update. These packages are not application
  runtime dependencies.

## Hosting state inspected

- Render workspace: **My Workspace**, `tea-d1g4c97fte5s7387uln0`, confirmed by the
  owner. No NagarFlow service existed in this workspace at inspection time.
- The owner selected **Render Free**. The Blueprint requests one free Python
  Docker web service in Singapore with no disk. The API and worker run together;
  local data resets on sleep/restart/redeploy and the worker pauses while asleep.
- Existing Netlify project: **nagarflow**,
  `5fa7721e-7016-442a-bd66-1249ac7a251f`,
  <https://nagarflow.netlify.app>.
- That site's existing Git settings still select `master` and publish `out`.
  Update them for this application after a healthy Render backend is available.
  Preparation has not changed the published site or created paid resources.

## Launch sequence

1. Merge the reviewed dependency preparation into `main` after its Linux checks
   pass. The existing Netlify site follows `master`, so this merge alone does not
   switch its production branch.
2. Create the free Render service using `Dockerfile.backend`, no disk, and private
   initial-admin email/hash settings. Use the actual assigned HTTPS origin and
   wait for `/api/health` to return `{"status":"ok"}`. This runs Flask and its
   colocated worker; the frontend runs on Netlify.
3. Set Render `NAGARFLOW_TRUSTED_ORIGINS` to the actual Render HTTPS origin plus
   `https://nagarflow.netlify.app`, comma-separated. Do not trust preview wildcards.
4. Set Netlify `NAGARFLOW_BACKEND_URL` to that actual Render HTTPS origin, with
   build scope and production context. No path or trailing `/api` is allowed.
5. Update the existing Netlify Git build settings together:

   | Setting | Value |
   | --- | --- |
   | Repository | `https://github.com/vinitgirdhar/nagarflow` |
   | Production branch | `main` |
   | Base | `nagarflow-next` |
   | Build command | `npm run build` |
   | Publish | `.next` |
   | Node | `22`, from root `netlify.toml` |
   | Runtime | Netlify Next.js runtime, explicitly loaded by the root plugin config |

6. Build and publish the Git-backed Netlify deployment. Check its own
   `/api/health` and the startup-provisioned initial account. Follow the
   hash-only initial setup in [RENDER.md](RENDER.md); Free Render has no shell.
   Passwords, provider secrets and authenticator material must stay out of
   source, build commands and chat.
7. Verify live sessions, CSRF and worker startup. This free deployment has no
   restart-persistence or coordinated restore guarantee. Use disposable
   evaluation data and distinguish it from a durable production deployment.

## Verification scope

The five deployment configuration tests, targeted deployment-configuration lint,
TypeScript and production builds for Netlify and Render standalone output pass
locally. The Python requirements audit reports no known vulnerabilities. Full
application lint is not clean: the application source reports 32 errors and 39
warnings across unchanged pages/components; an unrestricted `npm run lint` also
includes generated `.netlify` artifacts. This preparation does not claim a clean
application-wide lint run. The Blueprint passes the current official Render JSON
Schema. The Render CLI is installed locally but
requires its own login for platform-aware validation; the authenticated Render
connector was used to inspect the confirmed workspace.

Local Netlify build checks use `https://backend-preflight.example.test` solely to
exercise configuration. It is not a real backend and must never be saved as a
Netlify production variable or published routing destination.

The Python suite relies on POSIX permissions and process groups. Native Windows
execution does not pass and is not deployment evidence; use the GitHub Linux
workflow for backend and browser checks. Local builds and CI do not certify the
actual hosted HTTPS proxy, production storage, provider deliveries or restore
procedure. Record those separately after launch.
