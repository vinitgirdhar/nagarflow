# Deploy the whole project on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vinitgirdhar/nagarflow)

This Blueprint builds the frontend, API and complaint worker together. You get one public HTTPS URL. The API listens only inside the service; Next.js forwards `/api/*` and `/uploads/*` to it.

The Blueprint selects one **paid Starter web service and a 1 GB persistent disk** in Singapore. Render displays current charges before you create it. Free ephemeral storage would lose accounts and complaints on restart. Keep one instance while using SQLite; do not split the worker into a service with its own disk.

## Launch

1. Click **Deploy to Render**, connect this repository and review the Blueprint.
2. Create the service. Build the Dockerfile from the repository root, not `nagarflow-next`. No extra database service is required.
3. Wait for the service to become healthy. Open the public URL Render assigns; the app uses that actual URL for secure sign-in automatically.
4. In the service's **Shell**, provision your real administrator:

   ```bash
   python scripts/render_service.py manage-users create --email YOUR_EMAIL --name 'Municipality administrator'
   ```

   Replace `YOUR_EMAIL`. The command privately prompts for a temporary passphrase. No default accounts exist. Sign in, change the passphrase, then enroll your authenticator and save the recovery codes privately.

Do not put a password in a build command, environment variable or chat. Do not run demo seeding in production. A new deployment starts with empty stores; it does not copy databases or media from your computer.

## What stays on disk

`/var/data/nagarflow` contains the control database, authenticator host key, default database, municipality databases and uploaded evidence. Migrations run at startup **after** the disk mounts. The launcher initializes private directories, drops root privileges and supervises all three processes. If a process stops unexpectedly, the service exits so Render can restart it.

The disk is attached to one service. It is not a substitute for an off-service backup. Follow DEPLOYMENT.md and the backup tool's consistency requirements for backup/restore operations. A single-instance disk also means deployment restarts can briefly interrupt service.

## Optional configuration

- **Custom domain:** add it in Render, then set `NAGARFLOW_TRUSTED_ORIGINS` to the exact HTTPS origin. Use comma-separated origins if you keep both the Render URL and custom domain. No paths or wildcards.
- **Provider integrations:** add real `GROQ_API_KEY`, `SARVAM_API_KEY` and `TELEGRAM_BOT_TOKEN` privately in Render when needed. Core complaint, assignment, knowledge and forecast flows do not require paid-provider keys.
- **Signed intake:** Render generates `NAGARFLOW_WEBHOOK_SECRET`. Configure your trusted provider gateway with the same secret using OPERATIONS.md. Native provider signatures still require validation by that gateway.
- **Capacity:** Starter is an initial small-team configuration. Monitor memory, CPU and disk usage in Render; upgrade the instance/disk as usage grows. No load-capacity guarantee is implied.
- **Trusted maintenance:** use `python scripts/render_service.py preflight --production` after provisioning. The `backup` mode forwards to the existing backup CLI with the same storage settings; plan a coordinated maintenance backup before claiming cross-database consistency.

Health check: `https://YOUR_RENDER_HOST/api/health`. A healthy response verifies the proxied API and local storage. Verify real provider delivery separately after credentials are configured.

## Local container verification

```bash
docker build -t nagarflow-render .
docker volume create nagarflow-data
docker run --rm --name nagarflow -p 10000:10000 \
  --mount source=nagarflow-data,target=/var/data \
  -e RENDER_EXTERNAL_URL=https://your-app.onrender.com \
  nagarflow-render
```

The example HTTPS origin is for configuration testing; it does not create a public URL. Secure-cookie browser sign-in needs the corresponding HTTPS host. Mount the same volume when replacing the container. Never embed local databases, uploaded media, credentials or `.env` files in the image.

Deployment status is separate from repository readiness: a Blueprint in GitHub does not create a Render service until it is connected and applied in your Render account.

## Verification record

The local production image was verified with a real browser render, static assets, proxied API, private administrator provisioning, secure session cookies and authenticator enrollment. A signed complaint was processed by the co-located worker. Container restart preserved the administrator, MFA host key, complaint and delivery deduplication. Production preflight passed. Backend checks:107; browser checks:21. These checks do not assert that a live Render resource has been created.
