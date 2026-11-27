const axios = require('axios');

const NAIROBI = { latitude: -1.286, longitude: 36.817 };
const CACHE_MS = 5 * 60 * 1000;

let cache = null;

// One forecast response is shared by /api/weather, /api/predict and the chat for a few
// minutes, so traffic doesn't multiply calls to Open-Meteo. Failed requests aren't kept.
function fetchForecast() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.promise;

  const promise = axios
    .get('https://api.open-meteo.com/v1/forecast', {
      params: {
        ...NAIROBI,
        hourly: 'precipitation,weathercode,windspeed_10m,relativehumidity_2m,temperature_2m,cloudcover',
        past_days: 2,
        forecast_days: 2,
        timezone: 'Africa/Nairobi',
      },
      timeout: 10000,
    })
    .then(res => res.data);

  const entry = { at: Date.now(), promise };
  cache = entry;
  promise.catch(() => {
    if (cache === entry) cache = null;
  });
  return promise;
}

async function fetchNairobiHourly() {
  const data = await fetchForecast();

  // Open-Meteo times are Nairobi-local ("2026-11-27T14:00"); match on that, not the server's clock.
  const localNow = new Date(Date.now() + data.utc_offset_seconds * 1000);
  const currentTime = localNow.toISOString().slice(0, 13) + ':00';
  const index = data.hourly.time.indexOf(currentTime);
  if (index === -1) throw new Error(`Open-Meteo returned no hourly data for ${currentTime}`);

  return { hourly: data.hourly, index, currentTime };
}

// Null when any hour in the window is missing, so a gap is never read as a dry spell.
function rainOverLast(hourly, index, hours) {
  const readings = hourly.precipitation.slice(index - hours + 1, index + 1);
  if (readings.length < hours || readings.some(mm => mm == null)) return null;
  return readings.reduce((sum, mm) => sum + mm, 0);
}

module.exports = { fetchNairobiHourly, rainOverLast };
