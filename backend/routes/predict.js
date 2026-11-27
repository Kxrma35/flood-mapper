const express = require('express');
const axios   = require('axios');
const { fetchNairobiHourly, rainOverLast } = require('../lib/open-meteo');
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

// Must match FEATURES in ml/train_model.py, including how each one is derived.
function modelFeatures(hourly, index, currentTime) {
  const [year, month, day] = currentTime.slice(0, 10).split('-').map(Number);
  const hour = Number(currentTime.slice(11, 13));
  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000 + 1;

  const precipitation = hourly.precipitation[index] ?? 0;
  const humidity      = hourly.relativehumidity_2m[index] ?? 60;

  return {
    precipitation_mm: precipitation,
    rain_3h_mm:       rainOverLast(hourly, index, 3),
    rain_6h_mm:       rainOverLast(hourly, index, 6),
    rain_24h_mm:      rainOverLast(hourly, index, 24),
    rain_48h_mm:      rainOverLast(hourly, index, 48),
    humidity,
    wind_speed:       hourly.windspeed_10m[index] ?? 0,
    temperature:      hourly.temperature_2m[index] ?? 20,
    cloud_cover:      hourly.cloudcover[index] ?? 0,
    month,
    hour,
    day_of_year:      dayOfYear,
    is_rainy_season:  [3, 4, 5, 10, 11, 12].includes(month) ? 1 : 0,
    is_peak_month:    [4, 11].includes(month) ? 1 : 0,
    is_afternoon:     hour >= 14 && hour <= 17 ? 1 : 0,
    is_night:         hour <= 5 ? 1 : 0,
    is_heavy_rain:    precipitation > 7.5 ? 1 : 0,
    humidity_rain:    humidity * precipitation / 100,
  };
}

router.get('/', async (req, res) => {
  try {
    const { hourly, index, currentTime } = await fetchNairobiHourly();
    const features = modelFeatures(hourly, index, currentTime);
    const zones = ZONES.map(z => ({ ...z, ...features }));

    const mlRes = await axios.post(`${ML_URL}/predict`, { zones }, { timeout: 15000 });
    res.json(mlRes.data);
  } catch (err) {
    const status = err.response?.status === 503 ? 503 : 500;
    res.status(status).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
