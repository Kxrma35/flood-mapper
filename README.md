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

FloodSafe addresses this with four connected features:

- **Live flood risk map.** Known flood-prone zones in Nairobi are plotted on an interactive map, color-coded by risk level (low, medium, high). Zones are recolored in real time based on current rainfall against each zone's known flood threshold.
- **Machine learning risk prediction.** A trained classification model takes the live weather at each zone's own location (rainfall, humidity, wind, time of year) and predicts that zone's probability of flooding, rather than relying on a fixed threshold alone.
- **AI flood assistant.** A conversational interface lets a resident ask plain-language questions ("Is it safe to drive to JKIA now?") and receive a concise, practical answer grounded in live weather data and known flood-prone areas.
- **Flood-aware route check.** Pick a start (or use your location) and a destination from place suggestions as you type, and get a real road route from OpenRouteService, by car or on foot, with turn-by-turn directions. FloodSafe checks which flood zones the route passes through, and if any of them is at flood risk right now it also finds a safer route that avoids them and shows both.

All four features run live against real weather data from the Open-Meteo API, with no manual data entry required by the user.

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
                         │   /api/route    ─────────┼──► OpenRouteService
                         │   /api/places   ─────────┼──► OpenRouteService
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
│   │   ├── routePlanner.js   Gets routes and a safer alternative around at-risk zones
│   │   ├── geometry.js       Checks which zones a route passes through
│   │   ├── risk.js           Decides whether a zone is at flood risk right now
│   │   ├── components/
│   │   │   ├── MapView.jsx        Leaflet map, flood zone rendering
│   │   │   ├── RoutePanel.jsx     Route check: inputs, route options, warnings, directions
│   │   │   ├── PlaceInput.jsx     Place box with suggestions as you type
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
│   │   ├── ask.js              Forwards questions to OpenAI with live conditions
│   │   ├── route.js            Validates route requests and calls OpenRouteService
│   │   ├── places.js           Place suggestions for the route boxes
│   │   └── predict.js          Builds zone+weather payload, calls ML service
│   ├── lib/
│   │   ├── open-meteo.js       Hourly Nairobi weather, matched to Nairobi time
│   │   ├── model-features.js   The 20 model inputs, built from live weather
│   │   ├── conditions.js       Live rain, forecast and model estimate for the AI chat
│   │   ├── ors.js              OpenRouteService place search and routing
│   │   └── zones.js            The zones to predict for: dataset areas or sample zones
│   ├── data/sample-zones.json    Sample zones: names, locations, levels, thresholds
│   ├── data/your-flood-data.csv  Optional real area dataset
│   ├── convert-csv.js          One-off script: CSV → GeoJSON for the map
│   ├── load-flood-data.js      Builds the AI system prompt from the CSV or sample zones
│   └── .env                    OPENAI_API_KEY, ORS_API_KEY, ML_URL, FRONTEND_URL, PORT
│
└── ml/                         Flask ML service (Python)
    ├── fetch_history.py        Downloads hourly weather history for each zone's location
    ├── zone_history.csv.gz     That history, 2018–2024 (one series per weather grid cell)
    ├── train_model.py          Trains the calibrated GradientBoostingClassifier on zone_history
    ├── generate_data.py        Generates synthetic data (not used by train_model.py)
    ├── predict_server.py       Flask server, exposes POST /predict
    └── model.joblib            Trained model, scaler and feature list in one bundle (generated)
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

`/api/ask` gives the model a system prompt listing flood-prone areas. The list comes from `backend/data/your-flood-data.csv` when that file exists; otherwise it uses the same sample zones as the map, and the prompt tells the model they are sample figures. With each question the backend adds live conditions it fetches itself: rain now, over 3 and 24 hours, the next 5 hours of forecast, and the flood model's estimate. The prompt tells the model to use only that data, never to invent road closures, river levels or official warnings, and to send anyone in danger to 999 or 112 and official alerts. The API key never reaches the browser.

### The ML Service Itself

`predict_server.py` loads `ml/model.joblib` once at startup. It holds three things:

- `model` — the trained classifier
- `scaler` — the `StandardScaler` fitted during training (predictions are wrong if this step is skipped, since the model was trained on scaled features)
- `features` — the exact list and order of feature names the model expects

They are saved together as one bundle, written to a temporary file and swapped in at once, so the service can never load parts from different training runs.

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
python -m pip install pandas        # only needed to download history or retrain the model
```

### 2. Train the model (if `ml/model.joblib` is not already present)

```bash
python ml/fetch_history.py  # optional: re-downloads ml/zone_history.csv.gz (already in the repo)
python ml/train_model.py    # trains and saves ml/model.joblib
```

`fetch_history.py` downloads hourly Open-Meteo archive weather for 2018–2024 at every zone in `backend/data/sample-zones.json`. Zones in the same weather grid cell (about 8 km) share one series, so the 8 sample zones give 4 series. `train_model.py` follows the pipeline of the original notebook (`ml/nairobi_flood_model (1).ipynb`, which analysed only the central cell in `nairobi_raw.csv`), with rolling rainfall worked out within each cell. It builds 18 features, and `backend/lib/model-features.js` builds the same 18 from live weather. If you change a feature in one, change it in the other, or the ML service will answer with `missing features: ...`.

---

## Environment Variables

### `backend/.env`

```
OPENAI_API_KEY=sk-your-key-here
ORS_API_KEY=your-openrouteservice-key
ML_URL=http://localhost:5001
FRONTEND_URL=http://localhost:5173
PORT=3001
```

`ORS_API_KEY` turns on the route check. Get a free key by signing up at https://openrouteservice.org. The backend calls `api.heigit.org`, which replaced `api.openrouteservice.org` when that was switched off on 2026-11-24; existing keys work on both. It is sent to OpenRouteService in a request header from the backend only, never to the browser. Without it the route check says route planning is not set up, and everything else works.

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

**Keep scikit-learn pinned.** `ml/requirements.txt` pins `scikit-learn==1.8.0`, the version that trained `ml/model.joblib`. If you retrain with a different version, update the pin to match. A mismatched version can fail to unpickle the model in production even if it works locally, since scikit-learn does not guarantee pickle compatibility across versions.

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
ORS_API_KEY=your-openrouteservice-key
ML_URL=https://your-ml-service.onrender.com
FRONTEND_URL=https://your-frontend.vercel.app
PORT=3001
TRUST_PROXY=1
```

`ML_URL` must point to wherever you deployed the Flask service in the previous step, not `localhost`. `TRUST_PROXY` is the number of proxies in front of the backend (1 on Render and Railway). Without it, the chat and route rate limits see the host's proxy instead of each visitor, so all visitors would share one limit.

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
- **Zones differ only through their own weather.** Each zone is predicted from the weather at its location, but the weather model works in grid cells of about 8 km, so nearby zones share the same reading (Pangani, Upper Hill, Westlands and CBD share one cell; Mukuru kwa Njenga and Eastlands another). Because the label is the same rainfall rule everywhere, the model can't learn that one area floods more easily than another, so latitude and longitude are not model inputs. Capturing that would need real flood records per area (dates and places of past floods) to train on. Until then, each zone's historical risk colour and threshold come from the zone data, and the model drives the live "at risk now" highlight.
- **Sample zone data.** Until a real dataset is added, the map uses the built-in zones in `App.jsx` and the AI chat uses the same zones. Their risk levels, thresholds, resident counts and notes are placeholders with no verified source, and both label them as sample data. To use real data, put it at `backend/data/your-flood-data.csv` (columns `area_name`, `latitude`, `longitude`, `flood_frequency` or `flood_score`, `rain_threshold_mm`, `notes`). The AI chat reads it on startup, and `node backend/convert-csv.js` generates the map's `frontend/public/flood-zones.geojson` from it. Both read it through `backend/lib/dataset.js`, so they agree: a row with no recognisable level is shown as unknown, a missing threshold is shown as not recorded (never guessed), and rows without valid coordinates are left off the map.
- **Routes are OpenStreetMap-based, without live traffic.** Travel times are estimates from road speeds, not live conditions, unlike Uber or Google Maps. Pick places from the suggestions: typed text that isn't picked falls back to the single best match, which for names like "JKIA" or "Buruburu" is often the wrong place (the result says so). Place points come from OpenStreetMap and can be a little off (the airport's point is at the edge of the airport, not the terminal). Each suggestion lookup uses two OpenRouteService geocoding calls; results are cached for 24 hours and `/api/places` allows 60 lookups per minute per IP. OpenRouteService's free plan has daily quotas, and `/api/route` allows 20 checks per minute per IP.
- **The safer route is only as good as the zone data.** It avoids zones marked at risk right now (the model rates them HIGH, or rain is above their threshold), which until a real dataset is added are the sample zones. A zone containing your start or destination can't be avoided, so the app warns about it instead.
- **Limited abuse protection.** `/api/ask` allows 10 questions per minute per IP address, and the backend shares one Open-Meteo response across all routes for 5 minutes. There is no authentication. People behind one shared IP (common on mobile networks) share the chat limit, and a determined client with many IPs can still drive OpenAI costs, so watch usage before a public launch. The limit counters and the weather cache live in memory in each backend process; if you run several instances, each keeps its own, and a shared store such as Redis would be needed to enforce one limit across them.

---

## Troubleshooting

**Frontend shows "Could not reach the server" or weather shows "undefined":**
Check `frontend/.env` has `VITE_API_URL` pointing to the correct backend URL, and that the Vite dev server was restarted after the file was created or edited.

**AI chat replies "The AI assistant is not set up on this server yet":**
`OPENAI_API_KEY` is missing from `backend/.env` (or from the host's environment variables). The rest of the backend works without it; restart the backend after adding the key.

**ML service fails to unpickle the model with an error mentioning an internal sklearn module:**
The installed scikit-learn version does not match the version used to train and save `ml/model.joblib`. Either install the matching version or retrain the model with the currently installed version.

**`uvicorn`/`flask` command not found after installing:**
On Windows in particular, `pip install` and the command you run afterward can resolve to different Python installations. Run both the install and the run command through the same launcher, for example `python -m pip install ...` followed by `python -m flask ...`, or `py -m pip install ...` followed by `py predict_server.py`.
