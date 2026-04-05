# NagarFlow

**Smart City Complaint Management System for the Mumbai Metropolitan Region**

NagarFlow is a full-stack civic intelligence platform that ingests citizen complaints from WhatsApp, voice calls, and a web simulator — then routes them through an AI pipeline to prioritize zones, dispatch fleet assets, and surface actionable insights for municipal operators.

---

## Features

### Complaint Ingestion
- **WhatsApp / Telegram** — Citizens send complaints in plain Hindi or English. An N8n workflow powered by GPT-4o-mini holds a natural conversation, collects the area and issue, confirms the complaint, then POSTs it to the backend. Greetings and acknowledgements are dropped; only valid complaints with a zone and issue type are saved.
- **Voice Agent** — Speech-to-text via Sarvam AI (`saaras:v3`), complaint extraction via Gemini, and audio confirmation via Sarvam TTS (`bulbul:v3`). Compatible with Vapi webhooks for telephony integration.
- **Web Simulator** — Browser-based chat interface for submitting text complaints without WhatsApp. Uses the same backend pipeline.

### AI & Prediction
- **Gemini NLU** — Extracts zone, locality, issue type, and severity from free-text and transcribed speech in any language.
- **AiRLLM Priority Engine** — Generates priority scores (0–100) for 65+ Mumbai zones by combining historical complaint density (51,000+ real MMR 311 records), real-time weather from Open-Meteo, and time since last service visit.

### Operations Dashboard
- Live Leaflet map with zone heatmap (color = priority score) and truck position markers
- Locality hotspot clusters from aggregated complaint density
- Greedy fleet dispatcher — pairs high-priority zones with the nearest idle truck using Haversine distance, shows ETA and truck type
- Dispatch animation: truck icon moves along route on operator accept
- Emergency surge simulation (+35% demand injection)
- Live operator action log

### Management Pages
- **Complaint Insights** — Full complaint feed with filters by urgency, category, and keyword. Stats bar shows totals, high-priority count, voice vs text split, and last sync time.
- **Dispatch** — Manage and track all fleet dispatch assignments
- **Predictions** — Zone priority scores table from the AiRLLM engine
- **Maintenance** — Auto-generates tasks for zones scoring > 80. Operators assign teams, update status (PENDING → IN_PROGRESS → COMPLETED), and completions feed back into zone coverage.
- **Simulation** — Digital twin with slider controls for demand increase, infrastructure failure, and weather severity. Shows projected KPI deltas without touching live data.
- **Reports** — KPI summary and model prediction accuracy tracking
- **Emergency** — Per-zone weather overlay (condition, temperature, flood probability) from Open-Meteo
- **Agencies** — Directory of Mumbai municipal agencies with contact info and service categories

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, Framer Motion, Leaflet, Lucide React |
| Backend | Python 3.11, Flask |
| Database | SQLite |
| AI / NLU | Google Gemini `gemini-1.5-flash`, OpenAI `gpt-4o-mini` |
| Voice | Sarvam AI — `saaras:v3` (STT), `bulbul:v3` (TTS) |
| Automation | N8n workflow for WhatsApp/Telegram ingestion |
| Tunneling | ngrok (local development) |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- API keys for Gemini, OpenAI, and Sarvam AI (see below)

---

## Setup

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd nagarflow
```

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
SARVAM_API_KEY=your_sarvam_key
VAPI_WEBHOOK_SECRET=your_vapi_secret   # optional
```

### 2. Backend

```bash
pip install flask requests python-dotenv google-generativeai

# First-time only: seed the database
python ingest_data.py
python fleet_manager.py

# Start Flask
python app.py
# Runs at http://127.0.0.1:5000
```

### 3. Frontend

```bash
cd nagarflow-next
npm install
npm run dev
# Runs at http://localhost:3000
```

### 4. WhatsApp / Telegram integration (optional)

Expose your local backend via ngrok:

```bash
ngrok http 5000
```

Point your N8n workflow HTTP node to `https://<ngrok-url>/api/whatsapp-complaint`.

---

## Pages

| Route | Description |
|---|---|
| `/dashboard` | Live map, zone heatmap, fleet dispatch |
| `/complaints` | Unified complaint feed with filters and stats |
| `/dispatch` | Fleet dispatch management |
| `/predictions` | Zone priority scores |
| `/maintenance` | Maintenance task tracker |
| `/simulation` | Digital twin parameter simulation |
| `/reports` | KPI reports and model accuracy |
| `/emergency` | Weather overlay and zone alerts |
| `/agencies` | Municipal agency directory |
| `/complaint-simulator` | Browser-based complaint chat |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/complaints` | Fetch complaints (supports `area`, `type`, `severity`, `limit` filters) |
| POST | `/api/whatsapp-complaint` | Ingest complaint from N8n / Twilio |
| GET | `/api/predictions` | Zone priority scores |
| GET | `/api/dashboard` | Zone coverage and fleet status |
| GET | `/api/dispatch` | Current dispatch suggestions |
| POST | `/api/dispatch/accept` | Accept a dispatch suggestion |
| POST | `/api/dispatch/arrive` | Mark truck as arrived |
| GET | `/api/hotspots` | Locality-level complaint density clusters |
| GET | `/api/weather/zones` | Per-zone weather data |
| GET | `/api/simulation/baseline` | Current simulation baseline values |
| POST | `/api/simulation/run` | Run simulation with given parameters |
| GET | `/api/maintenance/data` | Maintenance tasks and zone data |
| POST | `/api/maintenance/assign` | Assign a team to a task |
| POST | `/api/maintenance/complete` | Mark task as completed |
| GET | `/api/reports` | KPI and accuracy report data |
| GET | `/api/agencies` | Agency directory |
| POST | `/api/agent/respond` | Voice agent response (audio) |
| POST | `/api/agent/respond-chat` | Text agent response |

---

## Data

The database ships pre-loaded with **51,440 real MMR 311 complaints** sourced from Mumbai municipal open data. Each record includes zone, locality, issue type, severity, complaint count, and timestamp. This dataset powers the AiRLLM priority engine and the complaint insights page.
