const axios = require('axios');
const { fetchNairobiHourly, rainOverLast } = require('./open-meteo');
const { modelFeatures } = require('./model-features');

const ML_URL = process.env.ML_URL || 'http://localhost:5001';
const CENTRAL_NAIROBI = { name: 'Central Nairobi', latitude: -1.286, longitude: 36.817 };
const FORECAST_HOURS = 5;

async function modelEstimate(features) {
  try {
    const { data } = await axios.post(
      `${ML_URL}/predict`,
      { zones: [{ ...CENTRAL_NAIROBI, ...features }] },
      { timeout: 15000 },
    );
    return data[0]?.flood_probability != null ? data[0] : null;
  } catch (err) {
    console.warn('Flood model unavailable for chat:', err.message);
    return null;
  }
}

async function currentConditions() {
  const { hourly, index, currentTime } = await fetchNairobiHourly();
  const features = modelFeatures(hourly, index, currentTime);

  return {
    time: currentTime,
    rainNow: features.precipitation_mm,
    rain3h: rainOverLast(hourly, index, 3),
    rain24h: rainOverLast(hourly, index, 24),
    forecast: hourly.time
      .slice(index + 1, index + 1 + FORECAST_HOURS)
      .map((time, k) => ({ time, mm: hourly.precipitation[index + 1 + k] ?? 0 })),
    model: await modelEstimate(features),
  };
}

function describeConditions(c) {
  const clock = t => t.slice(11, 16);
  const forecast = c.forecast.length
    ? c.forecast.map(f => `${clock(f.time)} ${f.mm.toFixed(1)}`).join(', ')
    : 'not available';
  const model = c.model
    ? `${Math.round(c.model.flood_probability * 100)}% flood probability (${c.model.risk_level})`
    : 'unavailable';

  return [
    `Live conditions for central Nairobi at ${clock(c.time)} EAT (Open-Meteo):`,
    `- Rain now: ${c.rainNow.toFixed(1)} mm/hr`,
    `- Rain over the last 3 hours: ${c.rain3h.toFixed(1)} mm; last 24 hours: ${c.rain24h.toFixed(1)} mm`,
    `- Forecast for the next ${FORECAST_HOURS} hours (mm/hr): ${forecast}`,
    `- FloodSafe model: ${model}`,
  ].join('\n');
}

module.exports = { currentConditions, describeConditions };
