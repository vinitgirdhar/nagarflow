# NagarFlow — Deployment Guide

NagarFlow has two separate parts to deploy:

| Part | What it is | Deploy to |
|---|---|---|
| Frontend | Next.js app in `/nagarflow-next` | Netlify |
| Backend | Flask API + SQLite in project root | Railway (recommended) or Render |

Both must be deployed. The frontend talks to the backend via a public URL — you set that URL as an environment variable in Netlify.

---

## Step 1 — Deploy the Backend (Railway)

Railway gives you a persistent disk for SQLite and a public HTTPS URL. Free tier is enough for this project.

### 1.1 Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your NagarFlow repository
4. Railway will auto-detect Python

### 1.2 Add a `Procfile` in the project root

Create a file called `Procfile` (no extension) in `d:\DOING STUFF\nagarflow\`:

```
web: python app.py
```

### 1.3 Set environment variables in Railway

In your Railway project → **Variables** tab, add:

```
GEMINI_API_KEY=your_gemini_key_here
SARVAM_API_KEY=your_sarvam_key_here
VAPI_WEBHOOK_SECRET=your_vapi_secret_here
PORT=5000
```

### 1.4 Make Flask listen on Railway's PORT

Open `app.py` and find the bottom where Flask starts. It likely looks like:

```python
if __name__ == '__main__':
    app.run(debug=True)
```

Change it to:

```python
if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
```

### 1.5 Add `requirements.txt` in project root

Railway needs this to install dependencies. Create `requirements.txt`:

```
flask
requests
python-dotenv
google-generativeai
```

### 1.6 Seed the database on first deploy

After Railway deploys, open the Railway shell (project → **Shell** tab) and run:

```bash
python ingest_data.py
python fleet_manager.py
```

This populates the SQLite database with the 51k complaints and truck data.

> **Important:** SQLite on Railway uses an ephemeral disk by default — data resets on redeploy. To make it persistent, go to Railway project → **Add Volume** → mount it at `/app`. Then change `DB_PATH` in `app.py` to `/app/nagarflow.db`.

### 1.7 Get your backend URL

Railway gives you a URL like:
```
https://nagarflow-production.up.railway.app
```

Copy this — you need it for the next step.

---

## Step 2 — Deploy the Frontend (Netlify)

### 2.1 Prepare the Next.js build

The frontend currently hardcodes `http://127.0.0.1:5000` in fetch calls. Before deploying, you need to replace all those with an environment variable.

**Search for all hardcoded backend URLs:**

```bash
cd nagarflow-next
grep -r "127.0.0.1:5000" --include="*.tsx" -l
```

In each file, replace:
```js
fetch('http://127.0.0.1:5000/api/...')
```
with:
```js
fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/...`)
```

### 2.2 Create `nagarflow-next/.env.production`

```env
NEXT_PUBLIC_API_URL=https://nagarflow-production.up.railway.app
```

Replace the URL with your actual Railway backend URL from Step 1.7.

### 2.3 Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) and sign in with GitHub
2. Click **Add new site → Import an existing project**
3. Select your GitHub repository
4. Set build settings:

| Setting | Value |
|---|---|
| Base directory | `nagarflow-next` |
| Build command | `npm run build` |
| Publish directory | `nagarflow-next/.next` |

5. Click **Show advanced** → **New variable** and add:

```
NEXT_PUBLIC_API_URL = https://nagarflow-production.up.railway.app
```

6. Click **Deploy site**

### 2.4 Configure Next.js for Netlify

Install the Netlify Next.js plugin so Netlify can serve Next.js correctly:

```bash
cd nagarflow-next
npm install -D @netlify/plugin-nextjs
```

Create `nagarflow-next/netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Commit and push — Netlify will auto-redeploy.

---

## Step 3 — Connect WhatsApp (N8n + Twilio)

Once the backend is live on Railway, update N8n to point to the Railway URL instead of ngrok.

### 3.1 Update N8n HTTP Request node

In your N8n workflow, open the **HTTP Request** node and change the URL from:
```
https://chewier-robt-unannotated.ngrok-free.dev/api/whatsapp-complaint
```
to:
```
https://nagarflow-production.up.railway.app/api/whatsapp-complaint
```

Keep all other settings (headers, body) exactly the same.

### 3.2 Update Twilio webhook (if using Twilio directly)

In [Twilio Console](https://console.twilio.com) → Messaging → Sandbox Settings, update the webhook URL to your Railway URL:
```
https://nagarflow-production.up.railway.app/api/whatsapp-complaint
```

---

## Step 4 — Verify everything works

Run this checklist after deploying:

```
[ ] Visit your Netlify URL — dashboard loads
[ ] Map shows zone heatmap circles
[ ] Complaints page shows the 51k dataset entries
[ ] Send a WhatsApp message — complaint appears in dashboard within 10 seconds
[ ] Voice call (if Sarvam configured) — complaint is registered
[ ] Dispatch a truck — animation plays, DB updates
```

---

## Alternative Backend: Render

If Railway doesn't work, Render is a good alternative.

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root directory:** ` ` (leave blank — project root)
   - **Build command:** `pip install -r requirements.txt && python ingest_data.py`
   - **Start command:** `python app.py`
4. Add the same environment variables as Step 1.3
5. Free tier spins down after 15 min of inactivity — upgrade to Starter ($7/mo) to keep it always-on

---

## Architecture After Deployment

```
WhatsApp User
     │
     ▼
Twilio Sandbox
     │
     ▼
N8n Workflow (GPT-4o-mini agent)
     │  POST /api/whatsapp-complaint
     ▼
Railway (Flask + SQLite)  ◄──── Netlify (Next.js dashboard)
     │                               │
     │  GET /api/complaints           │  polls every 4-10s
     │  GET /api/dashboard            │
     └───────────────────────────────┘
```

---

## Quick Reference

| Service | URL after deploy |
|---|---|
| Frontend (Netlify) | `https://your-site.netlify.app` |
| Backend (Railway) | `https://nagarflow-production.up.railway.app` |
| N8n webhook | your N8n cloud/self-hosted URL |
| Twilio sandbox | `whatsapp:+14155238886` (shared sandbox) |
