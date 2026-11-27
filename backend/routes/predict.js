const express = require('express');
const axios   = require('axios');
const { fetchHourlyAt } = require('../lib/open-meteo');
const { modelFeatures } = require('../lib/model-features');
const { predictionZones } = require('../lib/zones');
const router  = express.Router();

const ML_URL = process.env.ML_URL || 'http://localhost:5001';

// Each zone is predicted from the weather at its own location. Zones whose readings are
// incomplete are left out (the app shows their risk as unknown) rather than guessed.
router.get('/', async (req, res) => {
  try {
    const zones = predictionZones();
    const weather = await fetchHourlyAt(zones);

    const complete = zones
      .map((zone, i) => ({ zone, features: modelFeatures(weather[i].hourly, weather[i].index, weather[i].currentTime) }))
      .filter(({ features }) => Object.values(features).every(value => value != null));
    if (!complete.length) {
      return res.status(503).json({ error: 'Flood model unavailable: live weather readings are missing.' });
    }

    const payload = complete.map(({ zone, features }) => ({
      name: zone.name, latitude: zone.latitude, longitude: zone.longitude, ...features,
    }));
    const mlRes = await axios.post(`${ML_URL}/predict`, { zones: payload }, { timeout: 15000 });

    // The ML service answers in the same order as the zones it was sent.
    const predictions = mlRes.data
      .map((result, i) => ({
        ...result,
        rain_mm_per_hr: complete[i].features.precipitation_mm,
        rain_3h_mm: complete[i].features.rain_3h_mm,
        rain_24h_mm: complete[i].features.rain_24h_mm,
      }))
      .filter(p => p.flood_probability != null);
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
