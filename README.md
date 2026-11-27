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
│   │   ├── alerts.js         Builds the alert ticker from live weather, model and zone data
│   │   ├── useLiveData.js    Polls /api/weather and /api/predict for the whole app
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
    ├── train_model.py          Trains the calibrated GradientBoostingClassifier from ../nairobi_raw.csv
    ├── generate_data.py        Generates synthetic data (not used by train_model.py)
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

- Node.js 20.19+ or 22.12+ (required by Vite 8)
- Python 3.11 or later (required by scikit-learn 1.8.0, pinned in `ml/requirements.txt`; tested on 3.14)
- An OpenAI API key (for the AI chat feature)

### 1. Clone and install dependencies

Run every command from the repository root.

```bash
git clone https://github.com/Kxrma35/flood-mapper.git
cd flood-mapper
```

**Frontend:** `package.json` is at the repository root; `vite.config.js` points Vite at `frontend/`.
```bash
npm install
```

**Backend:**
```bash
npm install --prefix backend
```

**ML service:** use a virtual environment (many Linux distributions block `pip install` into the system Python).
```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate        # Windows: ml\.venv\Scripts\activate
python -m pip install -r ml/requirements.txt
python -m pip install pandas        # only needed to retrain the model
```

### 2. Train the model (if `.pkl` files are not already present)

```bash
python ml/train_model.py    # trains and saves flood_model.pkl, scaler.pkl, features.pkl into ml/
```

`train_model.py` runs the same pipeline as the notebook (`ml/nairobi_flood_model (1).ipynb`) on `nairobi_raw.csv`, hourly Open-Meteo history for central Nairobi from 2018. It builds 20 features, and `backend/routes/predict.js` builds the same 20 from live weather. If you change a feature in one, change it in the other, or the ML service will answer with `missing features: ...`.

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

In local development this file is optional: the Vite dev server proxies `/api` to `http://localhost:3001`. It is required for a deployed frontend.

Optional, for the dark basemap:

```
VITE_CARTO_KEY=your-carto-basemaps-key
```

CARTO's dark map tiles need a key, free for non-commercial use (request one at https://carto.com/basemaps/apikey; requesting it accepts CARTO's basemap terms). Without a key the map uses OpenStreetMap's standard tiles, dimmed to match the dark UI. Those are fine for development and light use under the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/), but not for heavy traffic. The key ends up in tile URLs in the browser, so it is public by nature; it is not a secret.

**Important:** Vite only reads `.env` files when its dev server starts. If you create or edit this file while `npm run dev` is already running, stop the process (Ctrl+C) and start it again — a hot reload alone will not pick up the change.

Neither `.env` file should be committed to version control. Both should be listed in `.gitignore`.

---

## Running the Full Stack Locally

Three terminals, run in this order:

**Terminal 1 — ML service:**
```bash
source ml/.venv/bin/activate        # Windows: ml\.venv\Scripts\activate
python ml/predict_server.py
```
Expected output: a line indicating Flask is running on port 5001.

**Terminal 2 — Backend:**
```bash
npm start --prefix backend
```
Expected output: `Backend running on :3001`

**Terminal 3 — Frontend:**
```bash
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

- **Render** (Web Service, free tier available): connect the repo, set the root directory to `ml/`, build command `pip install -r requirements.txt`, and start command `gunicorn predict_server:app`.
- **Railway**: similar workflow, auto-detects Python, set the start command explicitly.
- **Fly.io**: more control, requires a `Dockerfile`, good if you need a specific scikit-learn version pinned precisely.

**Keep scikit-learn pinned.** `ml/requirements.txt` pins `scikit-learn==1.8.0`, the version that trained `flood_model.pkl`. If you retrain with a different version, update the pin to match. A mismatched version can fail to unpickle the model in production even if it works locally, since scikit-learn does not guarantee pickle compatibility across versions.

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

- **Vercel**: connect the repo and leave the root directory as the repository root (where `package.json` is). Framework preset "Vite", build command `npm run build`, output directory `frontend/dist`.
- **Netlify**: similar workflow.
- **Render** (Static Site): also works.

**Required environment variable on the hosting platform's dashboard:**

```
VITE_API_URL=https://your-backend.onrender.com
VITE_CARTO_KEY=your-carto-basemaps-key
```

`VITE_API_URL` must point to the deployed backend URL, not `localhost`. `VITE_CARTO_KEY` is optional but recommended for a public deployment (see above).

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

- **Rule-based labels.** The weather history is real, but the `flood` label is a rule (more than 10mm in an hour, 25mm in 3 hours, or 50mm in 24 hours), not recorded floods. The model learns that rule, which is why its test scores are near perfect. Real Nairobi flood records would make the probabilities mean something more.
- **One location, so no per-zone prediction.** All training rows come from one point (-1.286, 36.817), so latitude and longitude have no effect and every zone gets the same probability. The map keeps each zone's historical risk colour and uses the model for the live "active" highlight. Per-zone predictions need per-zone weather and training data from more than one point.
- **Sample zone data.** Until `frontend/public/flood-zones.geojson` is generated from a real dataset (`backend/convert-csv.js`), the map uses the built-in zones in `App.jsx`. Their risk levels, thresholds, resident counts and notes are placeholders with no verified source, and the app labels them as sample data.
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
