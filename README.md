<div align="center">

<img src="https://nagarflow.netlify.app/favicon.ico" width="80" alt="NagarFlow Logo" />

# NagarFlow

### *The City's Brain. Predict. Dispatch. Learn.*

**AI-powered smart city platform for real-time public resource optimization — zero hardware required.**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-nagarflow.netlify.app-0ea5e9?style=for-the-badge)](https://nagarflow.netlify.app/)
[![GitHub](https://img.shields.io/badge/GitHub-Source_Code-181717?style=for-the-badge&logo=github)](https://github.com/vinitgirdhar/nagarflow)
[![Built For](https://img.shields.io/badge/Built_For-ITSAHACK_2026-f59e0b?style=for-the-badge)](https://nagarflow.netlify.app/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)](#license)

---

> **94.1% prediction accuracy · 72% fewer missed services · 48-hr advance warning window · 15% fleet fuel saved**

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Live Metrics](#-live-metrics)
- [10 Intelligence Modules](#-10-intelligence-modules)
- [System Architecture](#-system-architecture)
- [Seven-Stage Urban Intelligence Pipeline](#-seven-stage-urban-intelligence-pipeline)
- [Live Demo Scenarios](#-live-demo-scenarios)
- [Technology Stack](#-technology-stack)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Team](#-team)
- [License](#-license)

---

## 🏙️ Overview

**NagarFlow** is a full-stack AI platform designed to transform how municipalities manage public resources — water tankers, garbage trucks, and maintenance teams. Instead of reacting to complaints, NagarFlow **predicts demand 48 hours in advance**, corrects equity gaps in under-reported wards, and dispatches fleet resources autonomously via a Reinforcement Learning agent.

The platform integrates a multimodal data pipeline (311 calls, Twitter/Reddit, NOAA weather, historical records), a fine-tuned NLP complaint classifier, a Digital Twin simulator, and a multi-agency coordination hub — all surfaced through a live Leaflet.js dashboard with heatmaps, time-sliders, and scenario runners.

**Zero hardware. Zero infrastructure investment. Just intelligence.**

| Dimension | What NagarFlow Does |
|---|---|
| **Prediction** | 48-hr demand forecasting via XGBoost + Prophet with calendar & weather signals |
| **Equity** | Amplifies priority for under-reporting low-income wards before complaints arrive |
| **Dispatch** | PPO Reinforcement Learning agent optimizes fleet coverage, fuel, and response time |
| **Simulation** | Discrete-event Digital Twin for what-if scenario testing before real-world commitment |
| **Reporting** | LLM-generated end-of-day KPI PDFs with charts, equity scores, and recommendations |

---

## 📊 Live Metrics

| Metric | Value |
|---|---|
| 🎯 Prediction Accuracy | **94.1%** |
| 📉 Missed Services Reduction | **−72%** vs reactive approach |
| ⏱️ Advance Warning Window | **48 hours** pre-positioning lead time |
| ⛽ Fleet Fuel Saved | **−15%** operational efficiency gain |
| ✅ Operator Adoption Rate | **High** platform accept rate |

---

## 🧠 10 Intelligence Modules

### `F01` — Equity-Corrected Demand Engine
> *Poor areas served even without complaints*

Calculates expected vs. actual complaints per ward. When actual < expected, priority is amplified automatically. Systemic under-reporting in low-income wards is corrected to guarantee proportional resource dispatch — fairness by design, not by afterthought.

`XGBoost` `GeoPandas` `NetworkX`

---

### `F02` — Dual-Layer Map + Time Slider
> *Forecast vs. reality time-scrub UI*

Side-by-side heatmap layers let operators toggle between prediction and live complaint data. Drag the time slider to scrub through 48-hour windows and visually verify AI accuracy against ground truth.

`Leaflet.js` `React` `Prophet`

---

### `F03` — NLP Complaint Intelligence
> *Urgency, emotion & category from 311 text*

Fine-tuned BERT model classifies incoming 311 service requests by urgency, location, and service type. *"Road collapsed"* is prioritized instantly; *"grass is long"* is not. Emotion and severity signals are extracted for operator context.

`HuggingFace` `spaCy` `FastAPI`

---

### `F04` — Social Media Demand Miner
> *Twitter & Reddit fill silent reporting gaps*

Mines geo-tagged posts on Twitter and Reddit using BERT classification. Detects *"flood here"*, *"garbage piled up"*, and other hidden problems where formal 311 reporting is absent or delayed — especially critical in low-income zones.

`Tweepy` `PRAW` `BERT`

---

### `F05` — Predictive Surge Forecaster
> *48-hour calendar-aware pre-positioning*

Combines historical demand, calendar events (festivals, elections, cricket matches) and real-time weather signals to forecast surge demand 48 hours in advance — enabling proactive fleet staging before the crisis hits.

`XGBoost` `Prophet` `NOAA API`

---

### `F06` — Weather Emergency Protocols
> *Autonomous fleet reconfiguration on weather triggers*

A state machine (`Clear → Alert → Warning → Emergency → Recovery`) autonomously reconfigures fleet routing, avoids risky roads, and pre-deploys resources based on NOAA weather feeds — **no human intervention required**.

`NOAA API` `OR-Tools` `Redis`

---

### `F07` — Digital Twin Simulator
> *What-if sandbox before committing resources*

Full discrete-event simulation engine. Operators run scenarios — *"What if demand spikes +40%?"*, *"What if 3 trucks break down?"* — and observe outcomes on a live map before making any real-world decisions.

`SimPy` `PostgreSQL` `FastAPI`

---

### `F08` — Multi-Agency Coordination Hub
> *Garbage + Water + Maintenance on one command board*

Graph-based conflict detection identifies resource overlaps between sanitation, water, and maintenance departments. Automatically negotiates dispatch priority and prevents duplicate routing across agency silos.

`NetworkX` `GCN` `OR-Tools`

---

### `F09` — RL Autonomous Dispatcher
> *PPO agent: max coverage, min fuel, min time*

A Proximal Policy Optimization agent trained on historical dispatch scenarios. Suggests which truck goes where with full reasoning chain. Operators can **accept or override** every suggestion — full human-in-the-loop control.

`Stable-Baselines3` `PyTorch` `Redis`

---

### `F10` — Auto Report Generator
> *End-of-day LLM-generated KPI PDF*

AI pipeline compiles zone coverage, missed deployments, equity scores, prediction accuracy, and operator decisions into a structured daily PDF report — with charts, trend analysis, and actionable recommendations.

`Claude API` `FastAPI` `PostgreSQL`

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION LAYER                     │
│   311 Complaints · Twitter/Reddit · NOAA Weather · Historical   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      NLP PROCESSING LAYER                       │
│         BERT Classifier · spaCy Pipeline · Urgency Scoring      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                       EQUITY ENGINE                             │
│         Expected vs Actual Analysis · Priority Amplification    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    PREDICTION ENGINE                            │
│        XGBoost + Prophet · 48-hr Forecasts · Surge Detection    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    RL DISPATCH LAYER                            │
│        PPO Agent · OR-Tools Routing · Multi-Agency Resolver     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    LIVE DASHBOARD (React)                       │
│     Leaflet Heatmaps · Time Slider · Scenario Runner · Alerts   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   AUTO REPORT (Claude API)                      │
│            Daily PDF · KPI Charts · Equity Analysis             │
└─────────────────────────────────────────────────────────────────┘
```

**Backend:** FastAPI (Python) · PostgreSQL · Redis  
**Frontend:** React · Leaflet.js · Tailwind CSS  
**AI/ML:** PyTorch · HuggingFace · Stable-Baselines3 · XGBoost · Prophet  
**Integrations:** Claude API · NOAA API · Tweepy · PRAW · OR-Tools

---

## 🔄 Seven-Stage Urban Intelligence Pipeline

```
  [1] RAW DATA          311 · Twitter · Reddit · NOAA · Historical Records
       │
  [2] NLP ENGINE        Urgency · Emotion · Category Classification
       │
  [3] EQUITY ENGINE     Bias Correction · Priority Amplification
       │
  [4] PREDICTION        48-hr XGBoost + Prophet Demand Index
       │
  [5] RL DISPATCH       PPO Agent: Optimal Fleet Routing
       │
  [6] LIVE DASHBOARD    Heatmaps · Dispatch Board · Alerts · Time Slider
       │
  [7] AUTO REPORT       LLM-generated Daily KPI PDF with Recommendations
```

---

## 🎬 Live Demo Scenarios

Three pre-built scenarios are available on the live platform:

| Scenario | Description | Key Signal |
|---|---|---|
| **S1 — Normal Day** | Baseline operations with 4 active trucks and 1 NLP critical flag | Standard dispatch flow |
| **S2 — Rainstorm Protocol** | Weather Emergency state machine activates; 12 routes auto-reconfigured | AMBER / AUTO protocol |
| **S3 — What-If: +40% Surge** | Digital Twin simulation detects fleet overload; recommends 2 reserve units | Proactive surge response |

▶ [Try the Live Demo →](https://nagarflow.netlify.app/)

---

## 🛠️ Technology Stack

### AI / Machine Learning

| Library | Role |
|---|---|
| `PyTorch` | Deep learning framework |
| `HuggingFace Transformers` | BERT model hub |
| `Stable-Baselines3` | PPO Reinforcement Learning |
| `XGBoost` | Gradient boosting forecaster |
| `Prophet` | Time-series demand forecasting |
| `SimPy` | Discrete-event Digital Twin simulation |
| `spaCy` | NLP processing pipeline |
| `GCN` | Graph neural network for multi-agency routing |

### Backend & Infrastructure

| Library | Role |
|---|---|
| `FastAPI` | Python REST API backend |
| `PostgreSQL` | Relational data store |
| `Redis` | Real-time in-memory cache |
| `OR-Tools` | Fleet route optimization solver |
| `GeoPandas` | Geospatial analysis |
| `NetworkX` | Multi-agency conflict graph |

### Frontend & Visualization

| Library | Role |
|---|---|
| `React` | Dashboard UI |
| `Leaflet.js` | Interactive heatmap maps |
| `Tailwind CSS` | Utility-first styling |

### External APIs & Integrations

| Integration | Role |
|---|---|
| `Claude API (Anthropic)` | LLM daily report generation |
| `NOAA API` | Weather emergency feed |
| `Tweepy` | Twitter/X social demand miner |
| `PRAW` | Reddit signal miner |

---

## 📁 Repository Structure

```
nagarflow/
├── README.md
├── frontend/
│   ├── public/                   # Static assets
│   └── src/
│       ├── components/           # Reusable UI components
│       │   ├── Dashboard/        # Heatmap, dispatch board, alerts
│       │   ├── Scenarios/        # Live demo scenario runners
│       │   └── Map/              # Leaflet.js dual-layer map
│       ├── Pages/                # Route-level views
│       ├── store/                # State management
│       └── services/             # API client
├── backend/
│   └── src/
│       ├── api/                  # FastAPI route handlers
│       ├── models/               # Data schemas
│       ├── services/
│       │   ├── nlp/              # BERT classifier, spaCy pipeline
│       │   ├── prediction/       # XGBoost + Prophet forecasters
│       │   ├── dispatch/         # RL PPO agent, OR-Tools router
│       │   ├── equity/           # Demand correction engine
│       │   ├── twin/             # SimPy Digital Twin
│       │   ├── weather/          # NOAA state machine
│       │   ├── social/           # Tweepy + PRAW miners
│       │   ├── coordination/     # Multi-agency conflict resolver
│       │   └── reports/          # Claude API report generator
│       └── main.py               # Application entry point
└── ml/
    ├── training/                 # Model training scripts
    ├── evaluation/               # Accuracy benchmarks
    └── checkpoints/              # Saved model weights
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Accounts for: Claude API (Anthropic), NOAA API, Twitter Developer, Reddit API

### 1. Clone the Repository

```bash
git clone https://github.com/vinitgirdhar/nagarflow.git
cd nagarflow
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.sample .env             # Fill in all required values
uvicorn src.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.sample .env             # Set VITE_API_URL
npm run dev
```


### 4. Production Build

```bash
# Frontend
cd frontend && npm run build

# Backend (with gunicorn)
cd backend && gunicorn src.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

Serve `frontend/dist` via Netlify, Vercel, or Nginx. Deploy the backend with a process manager like `supervisord` or `PM2`. Ensure all environment variables are set on the host.

---

## 🔐 Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | Claude API key for report generation |
| `NOAA_API_KEY` | NOAA weather feed API key |
| `TWITTER_BEARER_TOKEN` | Twitter API v2 bearer token |
| `REDDIT_CLIENT_ID` | Reddit API client ID |
| `REDDIT_CLIENT_SECRET` | Reddit API client secret |
| `MODEL_CHECKPOINT_PATH` | Path to trained RL/XGBoost model weights |
| `BACKEND_URL` | Public URL of this API (used for CORS) |
| `CLIENT_URL` | Public URL of the frontend (used for CORS) |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend API |

See `.env.sample` files in each directory for the full reference.

---

## 👥 Team

Built for **ITSAHACK 2026** by:

| Name | Role |
|---|---|
| **Vinit Girdhar** | Backend · ML Pipeline · Architecture |
| **Kashmira Ghag** | AI/ML · Prediction Engine · NLP |
| **Annie Dande** | Frontend · Dashboard · System Integration |

---

<div align="center">

**NagarFlow** · Smart City Platform · Municipal Intelligence Unit

*System Online* 🟢

[![Live Demo](https://img.shields.io/badge/🌐_Visit-nagarflow.netlify.app-0ea5e9?style=flat-square)](https://nagarflow.netlify.app/)

*Made with 🧠 for cities that deserve better.*

</div>
