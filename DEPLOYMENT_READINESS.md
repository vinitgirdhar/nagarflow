# Deployment readiness: Render and Netlify

Prepared on 20 October 2026 after fast-forwarding local `main` to GitHub commit
`02df58c2cc86cf4a27c2a199346a8e23fb3cc0aa`.

## Source and dependency preparation

- Keep the repository-root `render.yaml`, `Dockerfile` and `netlify.toml` as the
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
- The prepared Blueprint requests one **paid Starter Docker web service** and a
  **1 GB persistent disk** in Singapore. Review the displayed recurring charges
  before creating it. Keep one instance and its API, worker, stores, uploads and
  MFA key together.
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
2. Create the Render service from the root Blueprint after approving its paid
   compute and disk. Use the actual assigned HTTPS origin and wait for
   `/api/health` to return `{"status":"ok"}`. The Docker service retains the
   repository's Next gateway in front of Flask and the colocated worker.
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
   | Runtime | Netlify Next.js runtime, automatically detected |

6. Build and publish the Git-backed Netlify deployment. Check its own
   `/api/health`, then privately provision the initial administrator using the
   Render Shell command in [NETLIFY.md](NETLIFY.md). Passwords, provider secrets and
   authenticator material must stay out of source, build commands and chat.
7. Complete the live session, CSRF, evidence, worker, restart-persistence and
   coordinated backup/restore checks in [NETLIFY.md](NETLIFY.md) and
   [DEPLOYMENT.md](DEPLOYMENT.md) before inviting users.

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
