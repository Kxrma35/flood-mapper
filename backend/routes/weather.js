// backend/routes/weather.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/', async (req, res) => {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=-1.286&longitude=36.817' +
    '&hourly=precipitation,rain,weathercode,windspeed_10m,relativehumidity_2m,temperature_2m,cloudcover' +
    '&forecast_days=2&timezone=Africa%2FNairobi';

  try {
    const { data } = await axios.get(url);
    const hours = data.hourly;
    const currentHour = new Date().getHours();

    const precip = hours.precipitation;

    // Rolling rain — critical for ML model
    const rain3h = precip
      .slice(Math.max(0, currentHour - 3), currentHour + 1)
      .reduce((a, b) => a + (b || 0), 0);

    const rain6h = precip
      .slice(Math.max(0, currentHour - 6), currentHour + 1)
      .reduce((a, b) => a + (b || 0), 0);

    const rain24h = precip
      .slice(Math.max(0, currentHour - 24), currentHour + 1)
      .reduce((a, b) => a + (b || 0), 0);

    function describeWeather(code) {
      if (code === 0) return 'Clear';
      if (code <= 3) return 'Partly Cloudy';
      if (code <= 49) return 'Foggy';
      if (code <= 59) return 'Drizzle';
      if (code <= 69) return 'Rain';
      if (code <= 82) return 'Rain Showers';
      if (code <= 99) return 'Thunderstorm';
      return 'Unknown';
    }

    res.json({
      current_mm_per_hour:  precip[currentHour] || 0,
      temperature_c:        hours.temperature_2m[currentHour] || 0,
      humidity_pct:         hours.relativehumidity_2m[currentHour] || 0,
      wind_kmh:             hours.windspeed_10m[currentHour] || 0,
      cloud_cover:          hours.cloudcover[currentHour] || 0,
      description:          describeWeather(hours.weathercode[currentHour] || 0),
      rolling: {
        rain_3h_mm:  parseFloat(rain3h.toFixed(2)),
        rain_6h_mm:  parseFloat(rain6h.toFixed(2)),
        rain_24h_mm: parseFloat(rain24h.toFixed(2)),
      },
      forecast: hours.time
        .slice(currentHour, currentHour + 6)
        .map((time, i) => ({
          time,
          precipitation: hours.precipitation[currentHour + i] || 0,
        })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Weather API failed', details: err.message });
  }
});

module.exports = router;