const express = require('express');
const axios   = require('axios');
const { fetchNairobiHourly } = require('../lib/open-meteo');
const { modelFeatures } = require('../lib/model-features');
const router  = express.Router();

const ML_URL = process.env.ML_URL || 'http://localhost:5001';

const ZONES = [
  { name: 'Mathare Valley',    latitude: -1.258, longitude: 36.859 },
  { name: 'Kibera',            latitude: -1.313, longitude: 36.784 },
  { name: 'Mukuru kwa Njenga', latitude: -1.318, longitude: 36.878 },
  { name: 'Pangani',           latitude: -1.275, longitude: 36.843 },
  { name: 'Eastlands',         latitude: -1.285, longitude: 36.876 },
  { name: 'Upper Hill',        latitude: -1.299, longitude: 36.818 },
  { name: 'Westlands',         latitude: -1.268, longitude: 36.807 },
  { name: 'CBD',               latitude: -1.284, longitude: 36.822 },
];

router.get('/', async (req, res) => {
  try {
    const { hourly, index, currentTime } = await fetchNairobiHourly();
    const features = modelFeatures(hourly, index, currentTime);
    if (Object.values(features).some(value => value == null)) {
      return res.status(503).json({ error: 'Flood model unavailable: some live weather readings are missing.' });
    }
    const zones = ZONES.map(z => ({ ...z, ...features }));

    const mlRes = await axios.post(`${ML_URL}/predict`, { zones }, { timeout: 15000 });
    const predictions = mlRes.data.filter(p => p.flood_probability != null);
    if (!predictions.length) {
      return res.status(502).json({ error: 'Flood model returned no predictions.' });
    }
    res.json(predictions);
  } catch (err) {
    const status = err.response?.status === 503 ? 503 : 500;
    res.status(status).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
