const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/', async (req, res) => {
  // Nairobi coordinates
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=-1.286&longitude=36.817' +
    '&hourly=precipitation,weathercode,windspeed_10m,relativehumidity_2m,temperature_2m' +
    '&forecast_days=1&timezone=Africa%2FNairobi';

  try {
    const { data } = await axios.get(url);
    const hours = data.hourly;

    const now = new Date();
    const currentHour = now.getHours();

    const currentPrecip = hours.precipitation[currentHour] || 0;
    const currentTemp = hours.temperature_2m[currentHour] || 0;
    const currentHumidity = hours.relativehumidity_2m[currentHour] || 0;
    const currentWind = hours.windspeed_10m[currentHour] || 0;
    const weatherCode = hours.weathercode[currentHour] || 0;

    // Next 6 hours forecast
    const forecast = hours.time
      .slice(currentHour, currentHour + 6)
      .map((time, i) => ({
        time,
        precipitation: hours.precipitation[currentHour + i] || 0,
      }));

    // Describe weather from WMO code
    function describeWeather(code) {
      if (code === 0) return 'Clear';
      if (code <= 3) return 'Partly Cloudy';
      if (code <= 49) return 'Foggy';
      if (code <= 59) return 'Drizzle';
      if (code <= 69) return 'Rain';
      if (code <= 79) return 'Snow';
      if (code <= 82) return 'Rain Showers';
      if (code <= 99) return 'Thunderstorm';
      return 'Unknown';
    }

    res.json({
      current_mm_per_hour: currentPrecip,
      temperature_c: currentTemp,
      humidity_pct: currentHumidity,
      wind_kmh: currentWind,
      description: describeWeather(weatherCode),
      forecast,
    });
  } catch (err) {
    res.status(500).json({ error: 'Weather API failed', details: err.message });
  }
});

module.exports = router;