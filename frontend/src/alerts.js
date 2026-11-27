const DISCLAIMER = {
  level: 'info',
  text: 'FloodSafe estimates from Open-Meteo weather data, not official warnings. Follow the Kenya Meteorological Department and Nairobi County for official alerts.',
};

const mmPerHour = mm => `${mm.toFixed(1)} mm/hr`;
const clockTime = isoTime => isoTime.slice(11, 16);

function listNames(zones) {
  const names = zones.map(z => z.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

export function buildAlerts({ weather, weatherError, predictions, zones, zonesAreSample }) {
  if (weatherError) {
    return {
      level: 'unknown',
      messages: [{ level: 'unknown', text: 'Live weather is unavailable, so flood risk cannot be checked right now.' }, DISCLAIMER],
    };
  }
  if (!weather || !zones) {
    return { level: 'unknown', messages: [{ level: 'unknown', text: 'Checking live weather...' }, DISCLAIMER] };
  }
  if (weather.current_mm_per_hour == null) {
    return {
      level: 'unknown',
      messages: [{ level: 'unknown', text: 'The latest rainfall reading is missing, so flood risk cannot be checked right now.' }, DISCLAIMER],
    };
  }

  const messages = [];
  const rain = weather.current_mm_per_hour;
  const forecast = weather.forecast ?? [];
  const asOf = forecast[0] ? ` as of ${clockTime(forecast[0].time)}` : '';
  const threshold = zonesAreSample ? 'sample flood threshold' : 'flood threshold';

  const top = predictions.reduce((max, p) => (!max || p.flood_probability > max.flood_probability ? p : max), null);
  if (top && top.risk_level !== 'LOW') {
    const high = top.risk_level === 'HIGH';
    messages.push({
      level: high ? 'high' : 'medium',
      text: `${high ? 'High' : 'Elevated'} flood risk: the model puts it at ${Math.round(top.flood_probability * 100)}% for central Nairobi.`,
    });
  }

  const overThreshold = zones.filter(z => z.rain_threshold != null && rain >= z.rain_threshold);
  if (overThreshold.length) {
    messages.push({ level: 'high', text: `Rain of ${mmPerHour(rain)}${asOf} is at or above the ${threshold} for ${listNames(overThreshold)}.` });
  }

  const upcoming = forecast.slice(1);
  const forecastGaps = upcoming.some(f => f.precipitation == null);
  const peak = upcoming.reduce((max, f) => (f.precipitation != null && f.precipitation > (max?.precipitation ?? 0) ? f : max), null);
  if (peak) {
    const comingOver = zones.filter(z => z.rain_threshold != null && peak.precipitation >= z.rain_threshold && rain < z.rain_threshold);
    messages.push(comingOver.length
      ? { level: 'medium', text: `Forecast: ${mmPerHour(peak.precipitation)} around ${clockTime(peak.time)}, enough to pass the ${threshold} for ${listNames(comingOver)}.` }
      : { level: 'info', text: `Forecast: up to ${mmPerHour(peak.precipitation)} around ${clockTime(peak.time)}${forecastGaps ? ' in the hours available' : ''}.` });
  } else if (upcoming.length && !forecastGaps) {
    messages.push({ level: 'info', text: `No rain forecast for the next ${upcoming.length} hours.` });
  }
  if (forecastGaps) {
    messages.push({ level: 'info', text: 'Some forecast hours are missing, so later hours can\'t be fully checked.' });
  }

  if (!predictions.length) {
    messages.push({ level: 'info', text: 'Flood model unavailable, so alerts use rain thresholds only.' });
  }

  const unassessed = zones.filter(z => z.rain_threshold == null);
  if (unassessed.length) {
    const subject = unassessed.length > 1 ? 'they are' : 'it is';
    messages.push({
      level: 'info',
      text: predictions.length
        ? `No flood threshold is recorded for ${listNames(unassessed)}, so ${subject} covered only by the model estimate.`
        : `No flood threshold is recorded for ${listNames(unassessed)} and the model is unavailable, so ${subject} not being checked.`,
    });
  }
  const partial = forecastGaps || (unassessed.length > 0 && !predictions.length);

  const level = messages.some(m => m.level === 'high') ? 'high'
    : messages.some(m => m.level === 'medium') ? 'medium'
    : 'none';
  if (level === 'none') {
    messages.unshift({ level: 'none', text: `No flood alerts${partial ? ' for what can be checked' : ''}${asOf}. Rain now: ${mmPerHour(rain)}.` });
  }

  return { level, messages: [...messages, DISCLAIMER] };
}
