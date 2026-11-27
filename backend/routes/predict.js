const express = require('express');
const axios   = require('axios');
const { fetchHourlyAt } = require('../lib/open-meteo');
const { modelFeatures } = require('../lib/model-features');
const { predictionZones } = require('../lib/zones');
const router  = express.Router();

const ML_URL = process.env.ML_URL || 'http://localhost:5001';
const FORECAST_HOURS = 5;

// Highest forecast rain in the next few hours at one location; missing hours are skipped
// but flagged, so a gap is never read as "no rain coming".
function forecastPeak(hourly, index) {
  const hours = hourly.time
    .slice(index + 1, index + 1 + FORECAST_HOURS)
    .map((time, k) => ({ time, mm: hourly.precipitation[index + 1 + k] ?? null }));
  const known = hours.filter(h => h.mm != null);
  const peak = known.reduce((max, h) => (!max || h.mm > max.mm ? h : max), null);
  return {
    forecast_peak_mm: peak?.mm ?? null,
    forecast_peak_time: peak?.time ?? null,
    forecast_complete: known.length === hours.length,
  };
}

// One report per zone from the weather at its own location: local rain and forecast always,
// plus the model's estimate where the readings are complete and the ML service answers.
// Anything missing stays null, so the app shows it as unknown instead of borrowing
// another place's weather.
router.get('/', async (req, res) => {
  try {
    const zones = predictionZones();
    const weather = await fetchHourlyAt(zones);

    const rows = zones.map((zone, i) => {
      const { hourly, index, currentTime } = weather[i];
      const features = modelFeatures(hourly, index, currentTime);
      return {
        zone,
        features,
        report: {
          name: zone.name,
          lat: zone.latitude,
          lng: zone.longitude,
          time: currentTime,
          rain_mm_per_hr: features.precipitation_mm,
          rain_3h_mm: features.rain_3h_mm,
          rain_24h_mm: features.rain_24h_mm,
          rain_72h_mm: features.rain_72h_mm,
          ...forecastPeak(hourly, index),
          flood_probability: null,
          risk_level: null,
        },
      };
    });

    const complete = rows.filter(({ features }) => Object.values(features).every(value => value != null));
    if (complete.length) {
      try {
        const payload = complete.map(({ zone, features }) => ({
          name: zone.name, latitude: zone.latitude, longitude: zone.longitude, ...features,
        }));
        const { data } = await axios.post(`${ML_URL}/predict`, { zones: payload }, { timeout: 15000 });
        // The ML service answers in the same order as the zones it was sent.
        data.forEach((result, i) => {
          if (result.flood_probability != null) {
            complete[i].report.flood_probability = result.flood_probability;
            complete[i].report.risk_level = result.risk_level;
          }
        });
      } catch (err) {
        console.warn('Flood model unavailable:', err.response?.data?.error || err.message);
      }
    }

    res.json(rows.map(row => row.report));
  } catch (err) {
    console.error('Zone weather failed:', err.message);
    res.status(502).json({ error: 'Live zone weather is unavailable right now.' });
  }
});

module.exports = router;
