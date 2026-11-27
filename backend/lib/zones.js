// The zones the backend predicts for and describes to the AI chat: the areas in
// backend/data/your-flood-data.csv when that file exists, otherwise FloodSafe's own flood
// areas (backend/data/flood-areas.json, built by ml/build_flood_data.py; the map's
// frontend/public/flood-zones.geojson comes from the same build).

const FLOOD_AREAS = require('../data/flood-areas.json');
const { DATASET_PATH, readDataset } = require('./dataset');

// Flood areas carry their evidence and modelled hazard instead of a risk level or threshold,
// because no source gives those for them.
const BUILT_IN_ZONES = FLOOD_AREAS.areas.map(a => ({
  name: a.name,
  latitude: a.latitude,
  longitude: a.longitude,
  risk: 'documented',
  threshold: null,
  notes: '',
  evidence: a.evidence,
  hazard: a.hazard,
}));

function loadDatasetZones() {
  try {
    return readDataset();
  } catch (err) {
    console.warn(`Could not read ${DATASET_PATH}, using FloodSafe's flood areas:`, err.message);
    return null;
  }
}

let cachedPredictionZones = null;

// Zones with a location, for per-zone weather and predictions. Read once; the dataset only
// changes with a restart, like the chat prompt.
function predictionZones() {
  if (!cachedPredictionZones) {
    const located = loadDatasetZones()?.filter(z => z.latitude != null && z.longitude != null);
    cachedPredictionZones = located?.length ? located : BUILT_IN_ZONES;
  }
  return cachedPredictionZones;
}

module.exports = { FLOOD_AREAS, BUILT_IN_ZONES, loadDatasetZones, predictionZones };
