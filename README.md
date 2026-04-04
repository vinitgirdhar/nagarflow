# 🚀 Nagarflow: AI-Driven Urban Logistics & Sanitation

Nagarflow is a smart city platform designed to revolutionize sanitation management in Mumbai and Navi Mumbai. It uses artificial intelligence (AiRLLM) to predict where waste management is needed most and automatically dispatches trucks to handle complaints in real-time.

---

## 🌟 Key Features

### 1. 🗄️ Massive Data Ingestion
Nagarflow processes over **30,000 real-world 311 complaints** from across the Mumbai Metropolitan Region (MMR). It extracts locations, issue types (like drainage or garbage), and severity to build a living map of the city's needs.

### 2. 🧠 AiRLLM Intelligence Engine
At the core of Nagarflow is the **AiRLLM Engine**. It analyzes complaint counts, weather conditions (like heavy rain), and how long it's been since a zone was last visited. It then generates a "Priority Score" for 65+ zones to tell operators exactly where to focus.

### 3. 🚚 Greedy Dispatcher System
The system automatically pairs high-priority zones with the nearest available sanitation truck using the **Haversine Distance** formula. This ensures that response times are minimized and fleet efficiency is maximized.

### 4. 🖥️ Interactive Live Dashboard
The dashboard provides a bird's-eye view of the entire city:
- **Live Map**: A Leaflet map showing real-time hotspots and truck locations.
- **Dynamic Routing**: When a truck is dispatched, a visual route line appears on the map.
- **Dispatch Actions**: Operators can manually "Accept" suggestions or mark trucks as "Arrived."
- **Surge Simulation**: A special "Surge" button allows you to simulate emergency demand spikes to see how the AI reacts.

### 5. 🎤 Voice Reporting (Sarvam Demo Agent)
Nagarflow makes reporting easier for citizens and operators:
- **Admin Demo Agent**: Operators can launch a Sarvam-powered voice agent on the dashboard, hear the Hindi welcome prompt, record one complaint, and save the extracted zone and issue directly into SQLite.
- **Sarvam Voice Pipeline**: `saaras:v3` handles speech-to-text and `bulbul:v3` handles Hindi text-to-speech for the confirmation reply.
- **Vapi Integration**: The webhook endpoint remains available for external phone-based complaint ingestion.

### 6. 📊 Validation & Feedback Loop
The system audits itself! It compares AI predictions with actual physical outcomes. If the AI starts "hallucinating" or its error margin gets too high, a **"Model Drift Detected"** alert triggers, recommending a model retrain.

---

## 🛠️ How to Run the Project

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **Sarvam API Key** (Get one from [Sarvam Dashboard](https://dashboard.sarvam.ai/))

### 2. Backend Setup (Python)
1.  **Open a Terminal** in the root directory (`d:\DOING STUFF\nagarflow`).
2.  **Install Dependencies**:
    ```bash
    pip install flask requests python-dotenv
    ```
3.  **Setup Environment Variables**:
    - Open the `.env` file in the root folder.
    - Paste your Sarvam API key: `SARVAM_API_KEY="your_key_here"`.
    - Rotate any previously exposed local keys before using the demo in a shared environment.
4.  **Initialize the Database**:
    ```bash
    python ingest_data.py
    python fleet_manager.py
    python demo_seeder.py
    ```
5.  **Start the Server**:
    ```bash
    python app.py
    ```
    The backend will run on `http://127.0.0.1:5000`.

### 3. Frontend Setup (Next.js)
1.  **Open a Second Terminal** in the `nagarflow-next` folder.
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Start the Dashboard**:
    ```bash
    npm run dev
    ```
4.  **Open your Browser** and go to `http://localhost:3000/dashboard`.

---

## 🏗️ Technology Stack
- **Frontend**: Next.js (React), Framer Motion (Animations), Leaflet (Maps).
- **Backend**: Python, Flask.
- **Database**: SQLite.
- **AI**: Sarvam STT + TTS (Voice Agent), Custom AiRLLM Logic.
- **APIs**: Sarvam AI, Vapi (Webhook), Open-Meteo (Weather).
