const axios = require('axios');

const NAIROBI = { latitude: -1.286, longitude: 36.817 };
const CACHE_MS = 5 * 60 * 1000;
const MAX_POINTS_PER_REQUEST = 50; // well under Open-Meteo's per-request location limit

const cache = new Map();

// Responses are shared for a few minutes by every route asking for the same locations, so
// traffic doesn't multiply calls to Open-Meteo. Failed requests aren't kept.
function cachedFetch(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = load();
  const entry = { at: Date.now(), promise };
  cache.set(key, entry);
  promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}

// One request for any number of points; Open-Meteo answers with a list when there are several.
function requestForecast(points) {
  return axios
    .get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: points.map(p => p.latitude).join(','),
        longitude: points.map(p => p.longitude).join(','),
        hourly: 'precipitation,weathercode,windspeed_10m,relativehumidity_2m,temperature_2m,cloudcover',
        past_days: 2,
        forecast_days: 2,
        timezone: 'Africa/Nairobi',
      },
      timeout: 10000,
    })
    .then(res => (Array.isArray(res.data) ? res.data : [res.data]));
}

// Open-Meteo times are Nairobi-local ("2026-11-27T14:00"); match on that, not the server's clock.
function atCurrentHour(data) {
  const localNow = new Date(Date.now() + data.utc_offset_seconds * 1000);
  const currentTime = localNow.toISOString().slice(0, 13) + ':00';
  const index = data.hourly.time.indexOf(currentTime);
  if (index === -1) throw new Error(`Open-Meteo returned no hourly data for ${currentTime}`);
  return { hourly: data.hourly, index, currentTime, grid: { latitude: data.latitude, longitude: data.longitude } };
}

async function fetchNairobiHourly() {
  const [data] = await cachedFetch('central', () => requestForecast([NAIROBI]));
  return atCurrentHour(data);
}

// Hourly weather for each point, in the same order. Points in the same model grid cell
// (about 8 km) get the same series. Large lists are sent in batches.
async function fetchHourlyAt(points) {
  const batches = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
    batches.push(points.slice(i, i + MAX_POINTS_PER_REQUEST));
  }
  const results = await Promise.all(batches.map(batch => {
    const key = batch.map(p => `${p.latitude},${p.longitude}`).join(';');
    return cachedFetch(key, () => requestForecast(batch));
  }));
  return results.flat().map(atCurrentHour);
}

// Null when any hour in the window is missing, so a gap is never read as a dry spell.
function rainOverLast(hourly, index, hours) {
  const readings = hourly.precipitation.slice(index - hours + 1, index + 1);
  if (readings.length < hours || readings.some(mm => mm == null)) return null;
  return readings.reduce((sum, mm) => sum + mm, 0);
}

module.exports = { fetchNairobiHourly, fetchHourlyAt, rainOverLast };
