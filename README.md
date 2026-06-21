# FloodSafe Nairobi

An AI-assisted flood risk mapping system for Nairobi, Kenya. It combines live weather data, a machine learning flood risk model, and a conversational AI assistant to help residents decide whether it is safe to travel during heavy rainfall.

This document explains what the system does, how it is built, how to run it locally, and how to deploy it.

---

## Table of Contents

1. [What This Project Does](#what-this-project-does)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [How the Pieces Talk to Each Other](#how-the-pieces-talk-to-each-other)
5. [Local Setup](#local-setup)
6. [Environment Variables](#environment-variables)
7. [Running the Full Stack Locally](#running-the-full-stack-locally)
8. [Deployment Guide](#deployment-guide)
9. [Known Limitations and Next Steps](#known-limitations-and-next-steps)
10. [Troubleshooting](#troubleshooting)

---

## What This Project Does

Nairobi experiences regular flash flooding in specific low-lying and riverside neighborhoods during the rainy season. Residents often have no way to know, in the moment, whether a specific route or area is currently at risk.

FloodSafe addresses this with three connected features:

- **Live flood risk map.** Known flood-prone zones in Nairobi are plotted on an interactive map, color-coded by risk level (low, medium, high). Zones are recolored in real time based on current rainfall against each zone's known flood threshold.
- **Machine learning risk prediction.** A trained classification model takes live weather data (rainfall, humidity, wind, time of year) for each zone and predicts the probability of flooding, rather than relying on a fixed threshold alone.
- **AI flood assistant.** A conversational interface lets a resident ask plain-language questions ("Is it safe to drive to JKIA now?") and receive a concise, practical answer grounded in live weather data and known flood-prone areas.

All three features run live against real weather data from the Open-Meteo API, with no manual data entry required by the user.

---

## System Architecture

The system has four independent parts that communicate over HTTP:

```
                         ┌─────────────────────────┐
                         │   React Frontend         │
                         │   (Vite, port 5173)      │
                         │                           │
                         │   - Map view (Leaflet)   │
                         │   - AI chat panel         │
                         │   - Rain indicator        │
                         └────────────┬─────────────┘
                                      │ HTTP (fetch/axios)
                                      ▼
                         ┌─────────────────────────┐
                         │   Express Backend         │
                         │   (Node.js, port 3001)    │
                         │                           │
                         │   /api/weather  ─────────┼──► Open-Meteo API
                         │   /api/ask      ─────────┼──► OpenAI API
                         │   /api/predict  ─────────┤
                         └────────────┬─────────────┘
                                      │ HTTP (axios)
                                      ▼
                         ┌─────────────────────────┐
                         │   ML Service               │
                         │   (Flask, port 5001)      │
                         │                           │
                         │   Loads trained sklearn   │
                         │   model + scaler, returns │
                         │   flood probability per   │
                         │   zone                    │
                         └───────────────────────────┘
```

**Why this shape:** the frontend never talks to the ML model or to OpenAI directly. Every external call is proxied through the Express backend. This keeps API keys server-side only, keeps CORS configuration in one place, and means the frontend only ever needs to know one URL.

---

## Project Structure

```
flood-mapper/
├── frontend/                 React application (Vite)
│   ├── src/
│   │   ├── App.jsx           Top-level layout, state, route/zone logic
│   │   ├── components/
│   │   │   ├── MapView.jsx        Leaflet map, flood zone rendering
│   │   │   ├── AIChatPanel.jsx    AI assistant chat interface
│   │   │   └── RainIndicator.jsx  Live rainfall widget + forecast
│   │   └── main.jsx
│   ├── public/
│   │   └── flood-zones.geojson    Generated flood zone boundaries
│   └── .env                  VITE_API_URL=http://localhost:3001
│
├── backend/                   Express API (Node.js)
│   ├── index.js               Server entry point, route mounting, CORS
│   ├── routes/
│   │   ├── weather.js          Fetches and processes Open-Meteo data
│   │   ├── ask.js              Forwards questions to OpenAI with flood context
│   │   └── predict.js          Builds zone+weather payload, calls ML service
│   ├── convert-csv.js          One-off script: CSV → GeoJSON for the map
│   ├── load-flood-data.js      Builds the AI system prompt from CSV data
│   └── .env                    OPENAI_API_KEY, ML_URL, FRONTEND_URL, PORT
│
└── ml/                         Flask ML service (Python)
    ├── train_model.py          Trains the GradientBoostingClassifier
    ├── generate_data.py        Generates synthetic training data
    ├── predict_server.py       Flask server, exposes POST /predict
    ├── flood_model.pkl         Trained model (generated by train_model.py)
    ├── scaler.pkl              Fitted StandardScaler (generated)
    └── features.pkl            Exact feature order the model expects
```

---

## How the Pieces Talk to Each Other

### Frontend to Backend

The frontend never hardcodes the backend URL. It reads `VITE_API_URL` from `frontend/.env` and builds requests from that, for example:

```js
const API = import.meta.env.VITE_API_URL || '';
fetch(`${API}/api/weather`)
```

This is what allows the same frontend code to point at `localhost:3001` during development and at a real deployed backend URL in production, by changing only the `.env` value.

### Backend to ML Service

The backend's `/api/predict` route does the work of assembling live weather data into the exact shape the model expects, then forwards it:

```js
const mlRes = await axios.post(`${ML_URL}/predict`, { zones });
```

`ML_URL` defaults to `http://localhost:5001` and is overridden via the backend's own `.env` in production.

### Backend to OpenAI

`/api/ask` builds a system prompt describing known flood-prone areas (either from a real CSV dataset if present, or from built-in fallback data), combines it with the user's question and current weather context, and calls the OpenAI API server-side. The API key never reaches the browser.

### The ML Service Itself

`predict_server.py` loads three files once at startup:

- `flood_model.pkl` — the trained classifier
- `scaler.pkl` — the `StandardScaler` fitted during training (predictions are wrong if this step is skipped, since the model was trained on scaled features)
- `features.pkl` — the exact list and order of feature names the model expects

It then exposes a single `POST /predict` endpoint that accepts a list of zones with their current weather values and returns a flood probability and risk level for each.

---

## Local Setup

### Prerequisites

- Node.js 18 or later
- Python 3.10–3.12 (avoid the very latest Python release if scikit-learn does not yet publish wheels for it)
- An OpenAI API key (for the AI chat feature)

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd flood-mapper
```

**Frontend:**
```bash
cd frontend
npm install
```

**Backend:**
```bash
cd ../backend
npm install
```

**ML service:**
```bash
cd ../ml
python -m pip install flask flask-cors scikit-learn pandas joblib numpy
```

### 2. Train the model (if `.pkl` files are not already present)

```bash
cd ml
python generate_data.py     # generates flood_data.csv (synthetic data)
python train_model.py       # trains and saves flood_model.pkl, scaler.pkl, features.pkl
```

If you have real historical flood data, replace `flood_data.csv` with it before running `train_model.py`. The script expects these columns: `date`, `latitude`, `longitude`, `rainfall_mm`, `rain_threshold_mm`, `humidity`, `wind_speed`.

---

## Environment Variables

### `backend/.env`

```
OPENAI_API_KEY=sk-your-key-here
ML_URL=http://localhost:5001
FRONTEND_URL=http://localhost:5173
PORT=3001
```

### `frontend/.env`

```
VITE_API_URL=http://localhost:3001
```

**Important:** Vite only reads `.env` files when its dev server starts. If you create or edit this file while `npm run dev` is already running, stop the process (Ctrl+C) and start it again — a hot reload alone will not pick up the change.

Neither `.env` file should be committed to version control. Both should be listed in `.gitignore`.

---

## Running the Full Stack Locally

Three terminals, run in this order:

**Terminal 1 — ML service:**
```bash
cd ml
python predict_server.py
```
Expected output: a line indicating Flask is running on port 5001.

**Terminal 2 — Backend:**
```bash
cd backend
node index.js
```
Expected output: `Backend running on :3001`

**Terminal 3 — Frontend:**
```bash
cd frontend
npm run dev
```
Expected output: a local URL, typically `http://localhost:5173`

Open that URL in a browser. The map, weather indicator, and AI chat should all be live.

### Quick health checks

- Backend alive: visit `http://localhost:3001/health`, expect `{"status":"ok"}`
- ML service alive: it has no GET health route by default; a `POST` to `/predict` with a valid payload is the real test, or simply confirm the terminal shows no errors

---

## Deployment Guide

This project has three independently deployable parts. Each can be deployed to a different provider, as long as each one is told the correct URL of the others through environment variables.

### Deploying the ML Service (Flask)

The ML service needs a Python runtime that can keep a process running continuously to serve requests (not a one-shot script runner).

**Recommended options:**

- **Render** (Web Service, free tier available): connect the repo, set the root directory to `ml/`, set the start command to `python predict_server.py` or, for production, `gunicorn predict_server:app`, and add a `requirements.txt` listing `flask`, `flask-cors`, `scikit-learn`, `pandas`, `joblib`, `numpy`.
- **Railway**: similar workflow, auto-detects Python, set the start command explicitly.
- **Fly.io**: more control, requires a `Dockerfile`, good if you need a specific scikit-learn version pinned precisely.

**Before deploying, pin your scikit-learn version.** Add a `requirements.txt` in `ml/`:

```
flask==3.0.3
flask-cors==4.0.1
scikit-learn==1.8.0
pandas==2.2.2
joblib==1.4.2
numpy==1.26.4
```

Use whatever exact scikit-learn version was used to train `flood_model.pkl`. A mismatched version can fail to unpickle the model in production even if it works locally, since scikit-learn does not guarantee pickle compatibility across versions.

**For production, do not use Flask's built-in development server** (the one started by `app.run()`). Use a production WSGI server:

```bash
pip install gunicorn
gunicorn predict_server:app --bind 0.0.0.0:5001
```

Most hosting providers will run this command for you if you set it as the start command.

### Deploying the Backend (Express)

**Recommended options:**

- **Render** (Web Service): root directory `backend/`, build command `npm install`, start command `node index.js` (or `npm start`).
- **Railway**: similar, auto-detects Node.js.
- **Fly.io / Heroku**: also suitable.

**Required environment variables on the hosting platform's dashboard** (not committed to the repo):

```
OPENAI_API_KEY=sk-...
ML_URL=https://your-ml-service.onrender.com
FRONTEND_URL=https://your-frontend.vercel.app
PORT=3001
```

`ML_URL` must point to wherever you deployed the Flask service in the previous step, not `localhost`.

### Deploying the Frontend (React/Vite)

**Recommended options:**

- **Vercel**: connect the repo, set the root directory to `frontend/`, framework preset "Vite," build command `npm run build`, output directory `dist`.
- **Netlify**: similar workflow.
- **Render** (Static Site): also works.

**Required environment variable on the hosting platform's dashboard:**

```
VITE_API_URL=https://your-backend.onrender.com
```

This must point to the deployed backend URL, not `localhost`.

### Deployment Order

Deploy in this order, since each step needs the URL produced by the one before it:

1. Deploy the ML service. Note its public URL.
2. Deploy the backend, setting `ML_URL` to the ML service's URL from step 1. Note the backend's public URL.
3. Deploy the frontend, setting `VITE_API_URL` to the backend's URL from step 2.
4. Go back to the backend's environment variables and set `FRONTEND_URL` to the frontend's deployed URL from step 3, so CORS allows requests from it. Redeploy the backend if the platform does not pick this up automatically.

### A Note on Free-Tier Hosting

Many free tiers (Render's free Web Services in particular) spin the service down after a period of inactivity and take 30-60 seconds to wake up on the next request. For a live demo to judges, either:

- ping all three services a few minutes before presenting, or
- use a paid/always-on tier for the demo window, or
- mention this delay up front so it does not look like a bug during a live demo.

---

## Known Limitations and Next Steps

- **Synthetic training data.** `generate_data.py` produces synthetic data unless replaced with real historical flood records. Predictions are only as good as the data underneath them, and real Nairobi flood/rainfall records would materially improve accuracy.
- **Field-name consistency between backend and ML service.** The backend (`predict.js`) and the ML service currently use slightly different field names for the same values (for example `precipitation_mm` versus `rainfall_mm`). The ML service should be the source of truth, since it matches the trained model's expected feature names exactly.
- **Rolling rainfall windows in training data.** `rain_3h_mm` and `rain_6h_mm` in `train_model.py` are computed with `pandas.rolling()` directly on the raw CSV. If the underlying data mixes multiple zones in sequence rather than being properly grouped by zone, these rolling sums can blend rainfall across different locations at row boundaries. Worth checking before treating model accuracy numbers as fully reliable.
- **No authentication or rate limiting** on the backend API. Acceptable for a demo or hackathon context; would need addressing before any public production use, particularly on `/api/ask` given OpenAI usage costs.

---

## Troubleshooting

**Frontend shows "Could not reach the server" or weather shows "undefined":**
Check `frontend/.env` has `VITE_API_URL` pointing to the correct backend URL, and that the Vite dev server was restarted after the file was created or edited.

**Backend crashes immediately on startup with an OpenAI error:**
`backend/.env` is missing or missing `OPENAI_API_KEY`. The OpenAI client is constructed at import time, so a missing key crashes the whole server, not just the `/api/ask` route.

**ML service fails to unpickle the model with an error mentioning an internal sklearn module:**
The installed scikit-learn version does not match the version used to train and save `flood_model.pkl`. Either install the matching version or retrain the model with the currently installed version.

**`uvicorn`/`flask` command not found after installing:**
On Windows in particular, `pip install` and the command you run afterward can resolve to different Python installations. Run both the install and the run command through the same launcher, for example `python -m pip install ...` followed by `python -m flask ...`, or `py -m pip install ...` followed by `py predict_server.py`.
