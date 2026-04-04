---
trigger: always_on
---

# 🚀 Complete System Flow To-Do List

Based on testing the repository, the current Next.js frontend has beautiful, polished **static UI mockups** (the map, report graphs, and simulation buttons currently use hardcoded data like the `SCENARIOS_DATA`). The underlying Python backend, AI logic, and databases are what we need to build next.

Here is the structured checklist mapping the work we need to do to make the system fully functional.

## 1. 🗄️ Database & Preprocessing (Data Layer)
- `[x]` **Setup Database Structure** (e.g., PostgreSQL or SQLite) with tables for: `complaints`, `trucks`, `predictions`, and `prediction_outcomes`.
- `[x]` **Create Manual Complaint Ingestion** to process 311 data (zone, issue, words) into the database.
- `[x]` **NOAA Weather API Script** polling every 15 minutes to flag heavy rain.
- `[x]` **Coverage Gap Logic** to scan the truck visit log and mark zones > 48h as `OVERDUE`.
- `[x]` **Preprocessing Text Transformer** to format {Complaint Count, Text, Weather, Hours Since Visit} into a clean block for the LLM.

## 2. 📞 Voice Integrations (Vapi & Gemini)
- `[ ]` **Vapi Webhook Route** in Python/Flask to receive automatic call transcripts.
- `[ ]` **Vapi Parser** to extract "zone" and "issue" from the transcript and write to the DB.
- `[ ]` **Web Mic Component** using `MediaRecorder` API for the dashboard UI.
- `[ ]` **Gemini Flash API Route** to send web audio to Gemini 1.5 Flash.
- `[ ]` **Gemini JSON Parser** to extract `{zone, issue_type, urgency}` and write to the DB.

## 3. 🧠 AiRLLM Engine Core
- `[ ]` **AiRLLM Prompt Constructor** using the Preprocessed data block.
- `[ ]` **Run Inference** to ask AiRLLM for priority, type, action, and reasoning.
- `[ ]` **AiRLLM Action Parser** to extract JSON `{"priority_score": 24, "type": "high",...}` and save it to the `predictions` table.

## 4. 🚚 Greedy Dispatcher System
- `[ ]` **Truck Tracking Script** to manage live fleet data (Status: `idle`, Lat/Lon).
- `[ ]` **Haversine Distance Calculator** in Python to match the highest AiRLLM scored zone to the nearest free truck.
- `[ ]` **Dispatch Suggestion API** to serve cards to the frontend (e.g., "Send Truck 3 to Dharavi North, 1.2 km away").

## 5. 🖥️ Interactive Live Dashboard (UI Data Wiring)
- `[ ]` **Live UI Polling (10s)**: Connect the map and stats to fetch data every 10 seconds without page reload.
- `[ ]` **Dispatcher Actions**: Wire `Accept`/`Reject` to update the DB and draw visual route lines.
- `[ ]` **Arrival Trigger**: Wire `Mark Arrived` to reset the truck to idle and refresh the zone's timestamp.
- `[ ]` **Simulation Overrides**: Make the "+30% Demand" button inject a temporary multiplier into the backend.

## 6. 📊 Validation & Feedback Loop
- `[ ]` **Dynamic KPI Mapping**: Replace hardcoded values with real math (`Accuracy`, `Hit Rate`, `Coverage Completion`).
- `[ ]` **Dynamic Graph Math**: Feed real AiRLLM-vs-Actual data into Graph 1, and real visits into Graph 2.
- `[ ]` **Feedback Loop Equation**: Calculate `Error = Predicted - Actual demand` after every physical dispatch.
- `[ ]` **Threshold Trigger**: Activate "Model retraining recommended" alert if the 50-prediction average error gets too high.
- `[ ]` **Hackathon Demo Seeds**: Write a SQL script to pre-seed 20 bad outcomes purely to trigger the retraining banner for the judges.
