const axios = require('axios');

const NAIROBI = { latitude: -1.286, longitude: 36.817 };

async function fetchNairobiHourly() {
  const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      ...NAIROBI,
      hourly: 'precipitation,weathercode,windspeed_10m,relativehumidity_2m,temperature_2m,cloudcover',
      past_days: 2,
      forecast_days: 2,
      timezone: 'Africa/Nairobi',
    },
    timeout: 10000,
  });

  // Open-Meteo times are Nairobi-local ("2026-11-27T14:00"); match on that, not the server's clock.
  const localNow = new Date(Date.now() + data.utc_offset_seconds * 1000);
  const currentTime = localNow.toISOString().slice(0, 13) + ':00';
  const index = data.hourly.time.indexOf(currentTime);
  if (index === -1) throw new Error(`Open-Meteo returned no hourly data for ${currentTime}`);

  return { hourly: data.hourly, index, currentTime };
}

function rainOverLast(hourly, index, hours) {
  return hourly.precipitation
    .slice(index - hours + 1, index + 1)
    .reduce((sum, mm) => sum + (mm ?? 0), 0);
}

module.exports = { fetchNairobiHourly, rainOverLast };
