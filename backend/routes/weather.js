// backend/routes/weather.js
const express = require('express');
const { fetchNairobiHourly, rainOverLast } = require('../lib/open-meteo');
const router = express.Router();

function describeWeather(code) {
  if (code == null) return 'Unknown';
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 82) return 'Rain Showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

router.get('/', async (req, res) => {
  try {
    const { hourly, index: i } = await fetchNairobiHourly();
    const round2 = mm => (mm == null ? null : parseFloat(mm.toFixed(2)));

    // Missing readings are sent as null, never as 0, so the app can show them as unknown.
    res.json({
      current_mm_per_hour:  hourly.precipitation[i] ?? null,
      temperature_c:        hourly.temperature_2m[i] ?? null,
      humidity_pct:         hourly.relativehumidity_2m[i] ?? null,
      wind_kmh:             hourly.windspeed_10m[i] ?? null,
      cloud_cover:          hourly.cloudcover[i] ?? null,
      description:          describeWeather(hourly.weathercode[i]),
      rolling: {
        rain_3h_mm:  round2(rainOverLast(hourly, i, 3)),
        rain_6h_mm:  round2(rainOverLast(hourly, i, 6)),
        rain_24h_mm: round2(rainOverLast(hourly, i, 24)),
      },
      forecast: hourly.time
        .slice(i, i + 6)
        .map((time, k) => ({
          time,
          precipitation: hourly.precipitation[i + k] ?? null,
        })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Weather API failed', details: err.message });
  }
});

module.exports = router;
