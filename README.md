# NagarFlow — Smart City Complaint Management System

NagarFlow is a full-stack smart city platform built for the Mumbai Metropolitan Region (MMR). It ingests citizen complaints via WhatsApp, voice calls, and a web simulator, runs AI-powered zone prioritization, and dispatches municipal fleet assets through an interactive operations dashboard.

---

## What's Built

### 1. WhatsApp Complaint Agent (N8n + Twilio)
Citizens send complaints in plain Hinglish to a Twilio WhatsApp sandbox number. An N8n workflow powered by GPT-4o-mini (the "Nagar" agent) holds a natural conversation, collects the area and issue, confirms the complaint, then POSTs it to Flask via HTTP.

- Responds in Hinglish, handles back-and-forth naturally
- Only saves messages that contain a valid Mumbai zone AND a specific issue type — greetings and acknowledgements are silently dropped
- Complaint lands in SQLite and appears on the dashboard in real time

### 2. Voice Complaint Agent (Sarvam AI)
Citizens can call in and speak in Hindi. The voice pipeline transcribes speech using Sarvam `saaras:v3`, extracts zone and issue via Gemini NLU, and synthesizes confirmation audio using `bulbul:v3`.

- Vapi webhook compatible for telephony integration
- Falls back to regex extraction if Gemini is unavailable

### 3. Web Complaint Simulator
Browser-based chat interface that simulates citizen complaints without WhatsApp. Text complaints are parsed and saved with the same pipeline as WhatsApp.

### 4. AiRLLM Predictive Engine
Custom prediction engine that generates Priority Scores (0–100) for 65+ Mumbai zones by combining:
- Historical complaint density from 51,000+ real 311 MMR complaints
- Real-time weather data from Open-Meteo
- Time since last municipal service visit

Predictions drive the map heatmap and fleet dispatch suggestions.

### 5. Greedy Fleet Dispatcher (Haversine)
Pairs high-priority zones with the nearest idle fleet asset using Haversine distance geometry. Operators accept or override suggestions from the dashboard. Accepted dispatches animate on the live map.

### 6. Interactive Operations Dashboard
- Live Leaflet map with zone heatmap circles (color = priority) and truck markers
- Locality hotspot clusters from aggregated complaint density
- Haversine Target Array sidebar: dispatch cards with ETA, truck type, zone
- Dispatch animation: truck icon moves along route on accept
- Emergency surge simulation (+35% demand injection)
- Live operator log

### 7. Complaint Insights Page
Full complaint feed from the database with:
- Filter by urgency, category, keyword search
- Stats bar: total complaints, high priority count, voice vs text split, last sync time
- Social media simulation panel (static mock tweets/reddit posts for demo)

### 8. Maintenance Task Manager
Auto-generates maintenance tasks for zones with priority score > 80. Operators assign field teams, track status (PENDING → IN_PROGRESS → COMPLETED), and completions update zone coverage.

### 9. Model Performance & Prediction Validation
Tracks prediction accuracy by comparing predicted priority scores against actual demand recorded when trucks arrive. Shows accuracy trend, error margin, and drift alerts.

### 10. Digital Twin Simulation Dashboard
Slider-controlled simulation of demand increase, infrastructure failures, and weather severity. Renders projected zone scores and KPI deltas (coverage %, response time, equity score) without touching live data.

### 11. Agency Registry
Scraped and stored directory of Mumbai municipal agencies with contact info, service categories, and source URLs. Viewable from the Agencies page.

### 12. Weather Zone Overlay
Per-zone weather data (condition, temperature, risk level, flood probability) fetched from Open-Meteo and displayed on the Emergency dashboard map.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Framer Motion, Leaflet, Lucide React |
| Backend | Python 3.11, Flask |
| Database | SQLite (`nagarflow.db`) |
| AI / NLU | Google Gemini `gemini-1.5-flash`, OpenAI `gpt-4o-mini` (N8n) |
| Voice | Sarvam AI `saaras:v3` (STT), `bulbul:v3` (TTS) |
| WhatsApp | Twilio Sandbox + N8n workflow |
| Tunneling | ngrok (dev) |
| Deployment | Netlify (frontend) + Railway / Render (backend) |

---

## Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_key
SARVAM_API_KEY=your_sarvam_key
VAPI_WEBHOOK_SECRET=your_vapi_secret   # optional
```

---

## Local Development

### Backend
```bash
# Install dependencies
pip install flask requests python-dotenv google-generativeai

# Seed the database (only needed first time)
python ingest_data.py
python fleet_manager.py

# Start Flask
python app.py
# Runs at http://127.0.0.1:5000

# Expose via ngrok for WhatsApp/N8n
ngrok http 5000
```

### Frontend
```bash
cd nagarflow-next
npm install
npm run dev
# Runs at http://localhost:3000
```

---

## Pages

| Route | Description |
|---|---|
| `/dashboard` | Main operations map + fleet dispatch |
| `/complaints` | Full complaint feed + stats |
| `/dispatch` | Dispatch management panel |
| `/predictions` | Zone priority scores from AiRLLM |
| `/maintenance` | Maintenance task tracker |
| `/simulation` | Digital twin parameter controls |
| `/reports` | KPI report + model accuracy |
| `/emergency` | Weather zone overlay + alerts |
| `/agencies` | Municipal agency directory |
| `/complaint-simulator` | Browser-based complaint chat |

---

## Data

The database ships pre-loaded with 51,426 real MMR 311 complaints sourced from Mumbai municipal open data. Each complaint has zone, locality, issue type, severity, complaint count, and timestamp.
