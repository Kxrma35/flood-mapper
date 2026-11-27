// The zones the backend predicts for and describes to the AI chat: the real dataset's areas
// when backend/data/your-flood-data.csv exists, otherwise the sample zones (which match
// buildFallbackGeoJSON in frontend/src/App.jsx and are what ml/fetch_history.py trains on).

const SAMPLE_ZONES = require('../data/sample-zones.json');
const { DATASET_PATH, readDataset } = require('./dataset');

function loadDatasetZones() {
  try {
    return readDataset();
  } catch (err) {
    console.warn(`Could not read ${DATASET_PATH}, using sample zones:`, err.message);
    return null;
  }
}

let cachedPredictionZones = null;

// Zones with a location, for per-zone weather and predictions. Read once; the dataset only
// changes with a restart, like the chat prompt.
function predictionZones() {
  if (!cachedPredictionZones) {
    const located = loadDatasetZones()?.filter(z => z.latitude != null && z.longitude != null);
    cachedPredictionZones = located?.length ? located : SAMPLE_ZONES;
  }
  return cachedPredictionZones;
}

module.exports = { SAMPLE_ZONES, loadDatasetZones, predictionZones };
