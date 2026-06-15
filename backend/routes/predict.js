const express = require('express');
const axios   = require('axios');
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

async function fetchWeather() {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=-1.286&longitude=36.817' +
    '&hourly=precipitation,rain,weathercode,windspeed_10m,relativehumidity_2m,temperature_2m,cloudcover' +
    '&forecast_days=2&timezone=Africa%2FNairobi';
  const { data } = await axios.get(url);

  const now       = new Date();
  const hourIndex = now.getHours();

  const precip  = data.hourly.precipitation  ?? [];
  const rain    = data.hourly.rain            ?? [];
  const humidity= data.hourly.relativehumidity_2m ?? [];
  const wind    = data.hourly.windspeed_10m   ?? [];
  const temp    = data.hourly.temperature_2m  ?? [];
  const cloud   = data.hourly.cloudcover      ?? [];

  const current_mm_per_hour = precip[hourIndex] ?? 0;

  const rolling = {
    rain_3h_mm:  precip.slice(Math.max(0, hourIndex - 3),  hourIndex + 1).reduce((a, b) => a + b, 0),
    rain_6h_mm:  precip.slice(Math.max(0, hourIndex - 6),  hourIndex + 1).reduce((a, b) => a + b, 0),
    rain_24h_mm: precip.slice(Math.max(0, hourIndex - 24), hourIndex + 1).reduce((a, b) => a + b, 0),
  };

  return {
    current_mm_per_hour,
    rolling,
    humidity_pct:  humidity[hourIndex] ?? 60,
    wind_kmh:      wind[hourIndex]     ?? 0,
    temperature_c: temp[hourIndex]     ?? 20,
    cloud_cover:   cloud[hourIndex]    ?? 0,
  };
}

router.get('/', async (req, res) => {
  try {
    const w     = await fetchWeather();
    const month = new Date().getMonth() + 1;
    const hour  = new Date().getHours();

    const zones = ZONES.map(z => ({
      ...z,
      precipitation_mm: w.current_mm_per_hour,
      rain_mm:          w.current_mm_per_hour,
      rain_3h_mm:       w.rolling.rain_3h_mm,
      rain_6h_mm:       w.rolling.rain_6h_mm,
      rain_24h_mm:      w.rolling.rain_24h_mm,
      rain_48h_mm:      w.rolling.rain_24h_mm,
      humidity:         w.humidity_pct,
      wind_speed:       w.wind_kmh,
      temperature:      w.temperature_c,
      cloud_cover:      w.cloud_cover,
      month,
      hour,
      is_rainy_season:  [3, 4, 5, 10, 11, 12].includes(month) ? 1 : 0,
      is_afternoon:     (hour >= 14 && hour <= 17) ? 1 : 0,
    }));

    const mlRes = await axios.post(`${ML_URL}/predict`, { zones });
    res.json(mlRes.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;