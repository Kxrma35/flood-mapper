# FloodSafe Nairobi

An AI-assisted flood risk mapping system for Nairobi, Kenya. It combines live weather data, a machine learning flood risk model, and a conversational AI assistant to help residents decide whether it is safe to travel during heavy rainfall.

This document explains what the system does, how it is built, how to run it locally, and how to deploy it.

---

## Table of Contents

1. [What This Project Does](#what-this-project-does)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [How the Pieces Talk to Each Other](#how-the-pieces-talk-to-each-other)
5. [Flood Areas and Records](#flood-areas-and-records)
6. [Local Setup](#local-setup)
7. [Environment Variables](#environment-variables)
8. [Running the Full Stack Locally](#running-the-full-stack-locally)
9. [Deployment Guide](#deployment-guide)
10. [Known Limitations and Next Steps](#known-limitations-and-next-steps)
11. [Troubleshooting](#troubleshooting)

---

## What This Project Does

Nairobi experiences regular flash flooding in specific low-lying and riverside neighborhoods during the rainy season. Residents often have no way to know, in the moment, whether a specific route or area is currently at risk.

FloodSafe addresses this with four connected features:

- **Live flood risk map.** 42 Nairobi areas with documented flooding are plotted on an interactive map, each listed for a cited reason (a published report, a flood report or a satellite image), and turn red when the model rates them at risk right now. Each area's panel shows its evidence, its modelled flood depth and the real floods recorded there, with sources (see [Flood Areas and Records](#flood-areas-and-records)).
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
│   │   ├── useLiveData.js    Polls the backend's live data (weather, predictions, flood records)
│   │   ├── floodRecords.js   Wording for recorded floods and the 2024 satellite figures
│   │   ├── zoneStyle.js      Zone colours for the map, panel and route check
│   │   ├── analytics.js      Anonymous visit counts (Cloudflare), when a token is set
│   │   ├── routePlanner.js   Gets routes and a safer alternative around at-risk zones
│   │   ├── geometry.js       Checks which zones a route passes through
│   │   ├── risk.js           Decides whether a zone is at flood risk right now
│   │   ├── components/
│   │   │   ├── MapView.jsx        Leaflet map, flood zone rendering
│   │   │   ├── RoutePanel.jsx     Route check: inputs, route options, warnings, directions
│   │   │   ├── PlaceInput.jsx     Place box with suggestions as you type
│   │   │   ├── ZoneEvidence.jsx   Why an area is on the map, and its modelled flooding
│   │   │   ├── ZoneHistory.jsx    A zone's recorded floods, in the zone panel
│   │   │   ├── AIChatPanel.jsx    AI assistant chat interface
│   │   │   └── RainIndicator.jsx  Live rainfall widget + forecast
│   │   └── main.jsx
│   ├── public/
│   │   └── flood-zones.geojson    The flood areas for the map (generated by ml/build_flood_data.py)
│   └── .env                  VITE_API_URL=http://localhost:3001
│
├── backend/                   Express API (Node.js)
│   ├── index.js               Server entry point, route mounting, CORS
│   ├── routes/
│   │   ├── weather.js          Fetches and processes Open-Meteo data
│   │   ├── ask.js              Forwards questions to OpenAI with live conditions
│   │   ├── route.js            Validates route requests and calls OpenRouteService
│   │   ├── places.js           Place suggestions for the route boxes
│   │   ├── records.js          Serves the real flood records
│   │   └── predict.js          Builds zone+weather payload, calls ML service
│   ├── lib/
│   │   ├── open-meteo.js       Hourly Nairobi weather, matched to Nairobi time
│   │   ├── model-features.js   The 19 model inputs, built from live weather
│   │   ├── conditions.js       Live rain, forecast and model estimate for the AI chat
│   │   ├── ors.js              OpenRouteService place search and routing
│   │   ├── flood-records.js    Recorded floods per zone, for the chat prompt
│   │   └── zones.js            The zones to predict for: your dataset's areas or the flood areas
│   ├── data/flood-areas.json     The flood areas: places, evidence, modelled flooding (generated)
│   ├── data/flood-records.json   Real Nairobi flood records per area (generated)
│   ├── data/your-flood-data.csv  Optional real area dataset
│   ├── convert-csv.js          One-off script: CSV → GeoJSON for the map
│   ├── load-flood-data.js      Builds the AI system prompt from the CSV or the flood areas
│   └── .env                    OPENAI_API_KEY, ORS_API_KEY, ML_URL, FRONTEND_URL, PORT
│
└── ml/                         Flask ML service (Python)
    ├── fetch_history.py        Downloads hourly weather history for each zone's location
    ├── zone_history.csv.gz     That history, 2018–2024 (one series per weather grid cell)
    ├── features.py             Cleaning, model features and the rainfall-rule label
    ├── train_model.py          Trains the calibrated GradientBoostingClassifier on zone_history
    ├── build_flood_data.py     Builds the flood areas, records and map file from the sources below
    ├── training_points.json    The 8 points zone_history.csv.gz was downloaded for
    ├── check_records.py        Tests the model against the recorded floods
    ├── record_check.csv        Its latest results
    ├── threshold_tradeoff.py   Compares candidate flood rules against the recorded floods
    ├── threshold_tradeoff.csv  Its results for all 120 rules tried
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

`/api/ask` gives the model a system prompt listing flood-prone areas. The list comes from `backend/data/your-flood-data.csv` when that file exists; otherwise it uses the same flood areas as the map, with each area's evidence, modelled flooding and recorded floods, and tells the model that no area has a risk level or threshold to quote. With each question the backend adds live conditions it fetches itself: rain now, over 3 hours, 24 hours and 3 days, the next 5 hours of forecast, and the flood model's estimate. The prompt tells the model to use only that data, never to invent road closures, river levels or official warnings, and to send anyone in danger to 999 or 112 and official alerts. The API key never reaches the browser.

### The ML Service Itself

`predict_server.py` loads `ml/model.joblib` once at startup. It holds three things:

- `model` — the trained classifier
- `scaler` — the `StandardScaler` fitted during training (predictions are wrong if this step is skipped, since the model was trained on scaled features)
- `features` — the exact list and order of feature names the model expects

They are saved together as one bundle, written to a temporary file and swapped in at once, so the service can never load parts from different training runs.

It then exposes a single `POST /predict` endpoint that accepts a list of zones with their current weather values and returns a flood probability and risk level for each.

---

## Flood Areas and Records

The map's areas, the records in each area's panel and the AI chat's area list all come from public sources, built by `ml/build_flood_data.py` into `backend/data/flood-areas.json`, `backend/data/flood-records.json` and `frontend/public/flood-zones.geojson`. Nothing in them is a placeholder.

### Which areas are on the map

A place is a **flood area** only if a source shows real flooding there. There are 42:

- **Named in a report** as among the worst hit: Mathare, Kibera and Korogocho in SPACE4ALL's [Diagnostic of Urban Flooding in Nairobi](https://kenyaclimatedirectory.org/resources/6904e4c4502d2) (University of Twente, 2024), and Mathare, Mukuru (Kwa Njenga, Kwa Ruben, Viwandani) and Kibera in WRI's [Flooding in Nairobi's Informal Settlements](https://doi.org/10.46830/wriib.25.00024) (2026).
- **Named in a DesInventar flood report, or in a news or agency report of a flood since 2017** (below).
- **Flooding seen near it on UNOSAT's 1 May 2024 satellite image**: at least 1% of the analysed land within 1 km under water, or at least 10 structures marked affected.

Candidate places are Nairobi's suburbs in OpenStreetMap, plus the settlements the reports name and the CBD, picked by OpenStreetMap element so that repeated names (there are two Sowetos) can't pick the wrong place. Each area is the land **within 1 km of its OpenStreetMap point**, drawn as a circle: a point is where a name is labelled, not a surveyed boundary.

This is not a complete list of places that flood: an area only appears once one of these sources has recorded flooding there.

### What each area shows

- **Why it's listed**, with links to the sources.
- **Modelled flooding** from SPACE4ALL's [FASTFLOOD flood-hazard map of Nairobi](https://zenodo.org/records/18659986) (CC BY 4.0, 100 m grid): the share of land within 1 km flooded deeper than 10 cm and deeper than 1 m in one 10–12 hour storm, next to the city-wide figures (23.3% and 7.4%). The model is simplified: it ignores drains and culverts and wasn't calibrated. That is why it rates Kibera (17.5%) and Mathare (21.5%) below the city average, while both reports name them among the worst hit. So areas have **no high/medium/low level**: no single source supports one, and combining them into a score would be invented.
- **Recorded floods** from DesInventar and the 2024 satellite figures (below).
- **No rain threshold.** No source gives one, so alerts come from the flood model alone, and the panel says "not recorded".

On the map, every flood area is blue, and an area turns red with a bold outline when it is at flood risk right now.

### The records

- **DesInventar Sendai, Kenya database (KEN-DLD)** ([profile](https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=ken)): every report of type FLOOD filed under Nairobi County, 28 reports from 2002 to 2022, with the place as written, the cause, deaths, injuries and houses destroyed or damaged, and who reported it (for example GoK, IFRC, KP). The data belongs to the contributing Kenyan institutions, who share it publicly and ask for citation. Reports are matched to areas **by place name only**, because their coordinates are often missing or placeholders; a name shared by two places is never matched, and "Mathare river" isn't Mathare. 15 of the 28 reports match an area; the rest stay as Nairobi-wide records.
- **News and agency reports since 2017** (`ml/flood_reports.json`): DesInventar has no Nairobi flood reports after 2022, so four dated Nairobi floods were added by hand from reports that name the flooded places: 15 March 2018 (Kenya Red Cross, via FloodList), 24 April 2024 (police and Nairobi County via AFP; Kenya Red Cross via Kenyans.co.ke), the night of 6–7 March 2026 (Citizen Digital, The Star, Reuters via Wikipedia) and 14 March 2026 (Kenyans.co.ke). Each is summarised in FloodSafe's own words, with its date, the places as the report names them, who reported the figures, and links. They match 28 areas by place name, with a few spellings reports use ("Kibra" for Kibera, "Baba Dogo" for Babadogo, "Mukuru kwa Reuben", "Lang'ata"), and add 13 areas such as Westlands, Parklands, South B and Eastleigh. Where reports disagree, both figures are given (for 6–7 March 2026, police first confirmed 10 deaths and later reports said 23). To add a flood, add an entry to that file with its sources and rerun the build.
- **UNITAR-UNOSAT flood impact analysis, Nairobi, 1 May 2024** ([HDX](https://data.humdata.org/dataset/70148c8d-4d8a-4e70-8c03-c9bb8370cfb7), CC BY-SA, preliminary and not field-validated): one satellite image during the April–May 2024 floods (event FL20240426KEN). For each area, the file gives the share of the land within 1 km that was analysed, hidden by cloud and under water, and the structures marked affected. The analysis covers eastern Nairobi only, so Kibera, Kawangware, Kilimani, the CBD and other western areas are outside it. These per-area figures are derived from UNOSAT's data and shared under the same licence.

Both sources are incomplete. DesInventar has no Nairobi flood reports at all for 2017–2021 or since 2023, including the April–May 2024 floods that UNOSAT mapped, and a single image shows only one moment. An area with no record is not an area that hasn't flooded, and the app says so.

Place names and points are © OpenStreetMap contributors (ODbL).

To rebuild the three files (it downloads about 24 MB and queries OpenStreetMap's Overpass API):

```bash
python -m pip install pyogrio shapely pandas   # only needed for this script
python ml/build_flood_data.py
```

### Testing the model against them

`python ml/check_records.py` (needs pandas) reads the weather for the same years (from `zone_history.csv.gz` where it covers them, downloading the rest) and checks whether the model reached HIGH anywhere in Nairobi during each recorded flood: on the report's day or the day before for DesInventar's 11 rain-related dates, from 26 April to 1 May 2024 for the UNOSAT event, and on the flood's date(s) or the day before for the 4 news reports. Results are in `ml/record_check.csv`:

| Recorded floods | Model reached HIGH | How often it does in any window that long |
|---|---|---|
| DesInventar, 11 dates in 2002–2015 | 0 of 11 | 0.9% of 2-day windows in 2002–2015 |
| UNOSAT, 26 April–1 May 2024 | Yes (99.9%) | 9.8% of 6-day windows in 2024 |
| News reports, 4 floods in 2018–2026 | 1 of 4 (6–7 March 2026) | 7.9% of 3-day windows in 2018–2026 |

**The model warns for 2 of the 16 recorded floods.**

- **April–May 2024 (caught).** These floods came from days of moderate rain: several days of 10–29 mm, but never more than 9 mm in an hour or 35 mm in 24 hours. The original rule (more than 10 mm in an hour, 25 mm in 3 hours or 50 mm in 24 hours) never fired, and the first model stayed at 0% throughout. Rain built up to 65 mm over 72 hours, higher than in about 94% of 6-day windows in 2018–2024; no other window length (1, 3, 24 hours or 7 days) set the event apart as well. So the label also counts rain over 72 hours, first at more than 60 mm (close to the 99th percentile of 72-hour totals in 2018–2024), now **more than 55 mm** (see below), and the model reaches 99.9% during the event.
- **The 11 DesInventar dates, 2002–2015 (missed).** The older weather data is much smoother: 12 hours above 10 mm/hr in the four cells over 2002–2015, against 95 over 2018–2024, and no recorded date had more than 54 mm in 72 hours. On four of them the heaviest hour was 0.3 mm or less, which may also mean those reports were dated some days after the flood. Thresholds in millimetres from today's sharper data don't carry over to that period.
- **The 4 news-reported floods, 2018–2026 (1 caught).** On the night of 6–7 March 2026, when about 23 people died, the heaviest hour was 6.5 mm and 3 days of rain reached 58 mm: just under the first 60 mm rule, and caught by the 55 mm rule. The other three stay below any reasonable rule in the weather the model sees. On 24 April 2024 it was 8.6 mm in an hour and 29 mm over 3 days, and on 14 March 2026 only 3.9 mm in 24 hours. Gridded weather data smooths out the heavy local downpours that flood the city: FloodList reported 59 mm of rain in Nairobi in the 24 hours to 15 March 2018, while the grid shows 23 mm.

### Choosing the thresholds

`python ml/threshold_tradeoff.py` tries 120 combinations of the four thresholds (1 hour 8 or 10 mm, 3 hours 20 or 25 mm, 24 hours 20–50 mm, 72 hours 30–60 mm) against the recorded floods. For each, it counts the floods caught and how often the rule would warn somewhere in Nairobi in 2018–2026, in days and in "spells" of back-to-back warning days. The 5 floods since 2018 count most, because the older weather data is too smooth to judge by. Results are in `ml/threshold_tradeoff.csv`:

| Rule (changes from 10 / 25 / 50 / 60 mm) | Recent floods caught | Warning days a year | Warning spells a year |
|---|---|---|---|
| None | 1 of 5 | 13.4 | 6.4 |
| **72 hours 55 mm (chosen)** | **2 of 5** | **16.3** | **6.6** |
| 72 hours 55 mm and 24 hours 20 mm | 4 of 5 | 28.8 | 9.9 |

Lowering the 72-hour threshold to 55 mm catches the deadly 6–7 March 2026 floods (58 mm) for about 3 more warning days a year and almost no extra spells. A 20 mm 24-hour threshold would also catch 15 March 2018 and 24 April 2024, but only just (24 April's 24-hour total was 20.4 mm), and it nearly doubles the warning days, so it wasn't adopted. No rule catches 14 March 2026. These thresholds were chosen using the same 5 floods they are scored on, so they will do somewhat worse on future floods. Warnings on days with no recorded flood are not all false alarms, because the records are incomplete.

The app's disclaimer and the AI chat's prompt state this result, so a LOW estimate is never presented as "safe".

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
python -m pip install pandas        # only needed to download history, retrain or test the model
```

### 2. Train the model (if `ml/model.joblib` is not already present)

```bash
python ml/fetch_history.py  # optional: re-downloads ml/zone_history.csv.gz (already in the repo)
python ml/train_model.py    # trains and saves ml/model.joblib
```

`fetch_history.py` downloads hourly Open-Meteo archive weather for 2018–2024 at the 8 points in `ml/training_points.json`. Points in the same weather grid cell (about 8 km) share one series, so they give 4 series. The model has no location inputs, so these points only sample Nairobi's weather; live predictions run for every flood area. `train_model.py` follows the pipeline of the original notebook (`ml/nairobi_flood_model (1).ipynb`, which analysed only the central cell in `nairobi_raw.csv`), with rolling rainfall worked out within each cell. It builds 19 features (including rain over the last 72 hours, so the live forecast request asks for 3 past days), and `backend/lib/model-features.js` builds the same 19 from live weather. If you change a feature in one, change it in the other, or the ML service will answer with `missing features: ...`.

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

Optional, for anonymous visitor counts in the deployed site (see [Quick deploy](#quick-deploy-render-servers-appwrite-website-cloudflare-visitor-counts)):

```
VITE_CF_ANALYTICS_TOKEN=your-cloudflare-web-analytics-token
```

The token is in every page's HTML, so it is public too. Without it, and always in local development, no visits are counted.

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

### Quick deploy: Render (servers), Appwrite (website), Cloudflare (visitor counts)

`render.yaml` defines the two servers for Render. The website is a static build that any static host can serve; these steps use Appwrite Sites, which comes with the GitHub Student Developer Pack. You need a Render account, an Appwrite account, your OpenRouteService key and an OpenAI key, plus a Cloudflare account if you want visitor counts. Keys go only into the hosts' dashboards, never into the repo.

1. **Render, the two servers.** In Render, choose **New → Blueprint** and pick this repository. Render reads `render.yaml` and lists `floodsafe-ml` and `floodsafe-backend`. It asks for four values:
   - `ML_URL`: `https://floodsafe-ml.onrender.com`. If Render gives the model service a different address, use that one.
   - `ORS_API_KEY` and `OPENAI_API_KEY`: your keys.
   - `FRONTEND_URL`: leave it for now (step 4).

   Apply it, and wait until both are live. `https://floodsafe-ml.onrender.com/health` and `https://floodsafe-backend.onrender.com/health` should both answer `{"status":"ok"}`. If you already created the servers by hand, you can keep them: make sure each one deploys the `main` branch (**Manual Deploy → Deploy latest commit** after a merge), uses the root directory, build and start commands in `render.yaml`, and has the same environment variables.
2. **Appwrite, the website.** In the Appwrite Console, create a project, open **Sites → Create site** and connect this GitHub repository, with production branch `main`. Set the build settings by hand (the repo keeps the website in `frontend/`, so the framework defaults don't fit):
   - Rendering: **Static**
   - Root directory: `./`
   - Install command: `npm ci`
   - Build command: `npm run build`
   - Output directory: `./frontend/dist`

   Under **Environment variables**, add `VITE_API_URL` with the backend's address, for example `https://floodsafe-backend.onrender.com`. Optionally add `VITE_CARTO_KEY` (see above) and `VITE_CF_ANALYTICS_TOKEN` (step 3). These are read when the site is built, so redeploy after changing one. Deploy, and note the site's address (for example `https://<id>.appwrite.network`, or a custom domain).
3. **Cloudflare, visitor counts (optional).** In the Cloudflare dashboard, open **Web Analytics → Add a site**, enter the site's address from step 2, and choose the JavaScript snippet (the site isn't served through Cloudflare). Copy the `token` value from the snippet into Appwrite as `VITE_CF_ANALYTICS_TOKEN`, and redeploy. The app adds Cloudflare's script itself, only in the built site and only when the token is set. Cloudflare then shows visits and page views per day, with countries and devices. It doesn't use cookies or collect visitors' personal data, according to Cloudflare, so no cookie banner is needed. The app's map legend says visits are counted anonymously.
4. **Connect them.** In Render, open `floodsafe-backend` → **Environment**, set `FRONTEND_URL` to the site's address from step 2, and save. Render redeploys it. Until this is set, the backend refuses the website's requests (CORS). To allow more than one site, for example while moving hosts, separate the addresses with commas.

To check the website reached the backend, open it and wait a minute (the servers may be waking): the ticker should show rain readings, not "Live weather is unavailable". If it stays unavailable, check in the browser's developer tools that requests go to your backend's address. Requests going to the website's own `/api/...` mean `VITE_API_URL` wasn't set when the site was built.

What to expect on the free plans:

- **Sleeping servers.** Render's free servers sleep after 15 minutes without traffic and take about a minute to wake. The first visit after a quiet spell shows "unavailable" briefly: the app retries every 30 seconds, and the backend wakes the model service as soon as it wakes itself.
- **Monthly hours.** Render gives 750 free hours a month per workspace, shared by both servers. That's enough because they sleep when nobody is using the site; two servers busy around the clock would use about 1,490.
- **Appwrite student plan.** Appwrite's Education plan (through the GitHub Student Developer Pack) covers 2 projects with Pro-level limits; Appwrite's pages disagree on whether it lasts six months or until you graduate, so check the date on your account.
- **Costs and quotas.** Every chat question costs OpenAI usage, and OpenRouteService has daily quotas. Both are rate-limited per visitor (see Known Limitations).

The website also builds on Vercel (`vercel.json`) or any other static host: install with `npm ci`, build with `npm run build`, and serve `frontend/dist`.

The sections below explain each part in more detail, for other hosts.

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
FRONTEND_URL=https://your-site.appwrite.network
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
VITE_CF_ANALYTICS_TOKEN=your-cloudflare-web-analytics-token
```

`VITE_API_URL` must point to the deployed backend URL, not `localhost`. `VITE_CARTO_KEY` is optional but recommended for a public deployment (see above). `VITE_CF_ANALYTICS_TOKEN` is optional and turns on visitor counts.

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

- **Rule-based labels, and the model misses most real floods.** The weather history is real, but the `flood` label is a rule (more than 10mm in an hour, 25mm in 3 hours, 50mm in 24 hours, or 55mm in 72 hours), not recorded floods. The model learns that rule, which is why its test scores are near perfect, but tested on 16 real recorded floods it warned for 2 (see [Testing the model](#testing-the-model-against-them)). The 72-hour threshold was chosen against 5 recent floods (see [Choosing the thresholds](#choosing-the-thresholds)). Gridded weather also underestimates the local downpours behind many floods, so even a well-chosen rule will miss some. More dated flood records are needed to set thresholds with confidence, and before labels can come from real floods instead of a rule.
- **Areas differ only through their own weather.** Each area is predicted from the weather at its location, but the weather model works in grid cells of about 8 km, so nearby areas share the same reading. Because the label is the same rainfall rule everywhere, the model can't learn that one area floods more easily than another, so latitude and longitude are not model inputs. Capturing that would need many more dated flood records per area than exist so far.
- **Flood areas have no risk level or rain threshold.** No source gives them (see [Flood Areas and Records](#flood-areas-and-records)), so alerts and the safer route depend on the flood model alone. If you have an area dataset of your own with levels and thresholds, put it at `backend/data/your-flood-data.csv` (columns `area_name`, `latitude`, `longitude`, `flood_frequency` or `flood_score`, `rain_threshold_mm`, `notes`). The AI chat reads it on startup, and `node backend/convert-csv.js` generates the map's `frontend/public/flood-zones.geojson` from it. Both read it through `backend/lib/dataset.js`, so they agree: a row with no recognisable level is shown as unknown, a missing threshold is shown as not recorded (never guessed), and rows without valid coordinates are left off the map. This replaces the flood areas on the map and in the chat; `python ml/build_flood_data.py` brings them back.
- **Routes are OpenStreetMap-based, without live traffic.** Travel times are estimates from road speeds, not live conditions, unlike Uber or Google Maps. Pick places from the suggestions: typed text that isn't picked falls back to the single best match, which for names like "JKIA" or "Buruburu" is often the wrong place (the result says so). Place points come from OpenStreetMap and can be a little off (the airport's point is at the edge of the airport, not the terminal). Each suggestion lookup uses two OpenRouteService geocoding calls; results are cached for 24 hours and `/api/places` allows 60 lookups per minute per IP. OpenRouteService's free plan has daily quotas, and `/api/route` allows 20 checks per minute per IP.
- **The safer route is only as good as the zone data.** It avoids areas at risk right now (the model rates them HIGH, or rain is above their threshold), and only the 42 flood areas, which are not every place that floods. A zone containing your start or destination can't be avoided, so the app warns about it instead.
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
