const { rainOverLast } = require('./open-meteo');

// Must match FEATURES in ml/features.py, including how each one is derived. Missing
// readings stay null; the ML service rejects them rather than predicting from guesses.
function modelFeatures(hourly, index, currentTime) {
  const [year, month, day] = currentTime.slice(0, 10).split('-').map(Number);
  const hour = Number(currentTime.slice(11, 13));
  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000 + 1;

  const precipitation = hourly.precipitation[index] ?? null;
  const humidity      = hourly.relativehumidity_2m[index] ?? null;

  return {
    precipitation_mm: precipitation,
    rain_3h_mm:       rainOverLast(hourly, index, 3),
    rain_6h_mm:       rainOverLast(hourly, index, 6),
    rain_24h_mm:      rainOverLast(hourly, index, 24),
    rain_48h_mm:      rainOverLast(hourly, index, 48),
    rain_72h_mm:      rainOverLast(hourly, index, 72),
    humidity,
    wind_speed:       hourly.windspeed_10m[index] ?? null,
    temperature:      hourly.temperature_2m[index] ?? null,
    cloud_cover:      hourly.cloudcover[index] ?? null,
    month,
    hour,
    day_of_year:      dayOfYear,
    is_rainy_season:  [3, 4, 5, 10, 11, 12].includes(month) ? 1 : 0,
    is_peak_month:    [4, 11].includes(month) ? 1 : 0,
    is_afternoon:     hour >= 14 && hour <= 17 ? 1 : 0,
    is_night:         hour <= 5 ? 1 : 0,
    is_heavy_rain:    precipitation == null ? null : precipitation > 7.5 ? 1 : 0,
    humidity_rain:    precipitation == null || humidity == null ? null : humidity * precipitation / 100,
  };
}

module.exports = { modelFeatures };
