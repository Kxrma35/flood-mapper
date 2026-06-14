// backend/routes/predict.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

const ML_URL = process.env.ML_URL || 'http://localhost:5001';

// Nairobi flood zones — matches your fallback GeoJSON in App.jsx
const ZONES = [
  { name: 'Mathare Valley',      latitude: -1.258, longitude: 36.859 },
  { name: 'Kibera',              latitude: -1.313, longitude: 36.784 },
  { name: 'Mukuru kwa Njenga',   latitude: -1.318, longitude: 36.878 },
  { name: 'Pangani',             latitude: -1.275, longitude: 36.843 },
  { name: 'Eastlands',           latitude: -1.285, longitude: 36.876 },
  { name: 'Upper Hill',          latitude: -1.299, longitude: 36.818 },
  { name: 'Westlands',           latitude: -1.268, longitude: 36.807 },
  { name: 'CBD',                 latitude: -1.284, longitude: 36.822 },
];

router.get('/', async (req, res) => {
  try {
    // 1. Fetch live weather
    const weatherRes = await axios.get(
      `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/weather`
    );
    const w = weatherRes.data;

    // 2. Build zone payloads with live weather
    const month = new Date().getMonth() + 1;
    const hour  = new Date().getHours();

    const zones = ZONES.map(z => ({
      ...z,
      precipitation_mm: w.current_mm_per_hour,
      rain_mm:          w.current_mm_per_hour,
      rain_3h_mm:       w.rolling.rain_3h_mm,
      rain_6h_mm:       w.rolling.rain_6h_mm,
      rain_24h_mm:      w.rolling.rain_24h_mm,
      rain_48h_mm:      w.rolling.rain_24h_mm, // approx fallback
      humidity:         w.humidity_pct,
      wind_speed:       w.wind_kmh,
      temperature:      w.temperature_c,
      cloud_cover:      w.cloud_cover,
      month,
      hour,
      is_rainy_season:  [3,4,5,10,11,12].includes(month) ? 1 : 0,
      is_afternoon:     (hour >= 14 && hour <= 17) ? 1 : 0,
    }));

    // 3. Send to Python ML service
    const mlRes = await axios.post(`${ML_URL}/predict`, { zones });
    res.json(mlRes.data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;