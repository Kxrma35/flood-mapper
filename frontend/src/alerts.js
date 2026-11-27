import { isZoneRiskKnown, zoneRainNow } from './risk';

const DISCLAIMER = {
  level: 'info',
  text: 'FloodSafe estimates from Open-Meteo weather data, not official warnings. Tested on 12 recorded Nairobi floods, the model warned for only 1. Follow the Kenya Meteorological Department and Nairobi County for official alerts.',
};

const mmPerHour = mm => `${mm.toFixed(1)} mm/hr`;
const clockTime = isoTime => isoTime.slice(11, 16);
const unknown = text => ({ level: 'unknown', messages: [{ level: 'unknown', text }, DISCLAIMER] });

function listNames(items) {
  const names = items.map(item => item.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

// Builds the ticker from each zone's own report (model estimate, local rain, local forecast)
// and, for context, central Nairobi's weather. Zone checks still run when the central reading
// is missing. `reports` is null while the zone reports are still loading.
export function buildAlerts({ weather, weatherError, reports, zones, zonesError }) {
  if (zonesError) return unknown("Flood areas couldn't be loaded, so flood risk can't be checked right now.");
  if (!zones || reports == null) return unknown('Checking live weather...');

  const central = !weatherError && weather?.current_mm_per_hour != null ? weather : null;
  const haveZoneData = reports.some(r => r.rain_mm_per_hr != null || r.flood_probability != null);
  if (!central && !haveZoneData) {
    if (!weather && !weatherError) return unknown('Checking live weather...');
    return unknown('Live weather is unavailable, so flood risk cannot be checked right now.');
  }
  if (zones.length && zones.every(z => !isZoneRiskKnown(z, reports))) {
    return unknown(haveZoneData
      ? "The flood model is unavailable and no area has a recorded rain threshold, so flood risk can't be checked right now."
      : "Live weather for the flood areas is unavailable, so flood risk can't be checked right now.");
  }

  const messages = [];
  const threshold = 'flood threshold';
  const time = central?.forecast?.[0]?.time ?? reports.find(r => r.time)?.time;
  const asOf = time ? ` as of ${clockTime(time)}` : '';
  const reportOf = zone => reports.find(r => r.name === zone.name);
  const localRain = zone => zoneRainNow(zone, reports);

  // The model's estimate for each zone, from that zone's own weather.
  const rated = level => reports
    .filter(r => r.risk_level === level && r.flood_probability != null)
    .sort((a, b) => b.flood_probability - a.flood_probability)
    .map(r => ({ name: `${r.name} (${Math.round(r.flood_probability * 100)}%)` }));
  const high = rated('HIGH');
  const medium = rated('MEDIUM');
  if (high.length) messages.push({ level: 'high', text: `High flood risk${asOf}: the model rates ${listNames(high)} HIGH.` });
  if (medium.length) messages.push({ level: 'medium', text: `Elevated flood risk${asOf}: the model rates ${listNames(medium)} MEDIUM.` });

  // Each zone's own rain against its threshold.
  const over = zones.filter(z => z.rain_threshold != null && localRain(z) != null && localRain(z) >= z.rain_threshold);
  if (over.length) {
    const withRain = over.map(z => ({ name: `${z.name} (${mmPerHour(localRain(z))})` }));
    messages.push({ level: 'high', text: `Rain${asOf} is at or above the ${threshold} for ${listNames(withRain)}.` });
  }

  // Each zone's own forecast against its threshold.
  const coming = zones.filter(z => {
    const r = reportOf(z);
    return z.rain_threshold != null && r?.forecast_peak_mm != null && r.forecast_peak_mm >= z.rain_threshold &&
      !(localRain(z) != null && localRain(z) >= z.rain_threshold);
  });
  if (coming.length) {
    const withForecast = coming.map(z => {
      const r = reportOf(z);
      return { name: `${z.name} (${mmPerHour(r.forecast_peak_mm)} around ${clockTime(r.forecast_peak_time)})` };
    });
    messages.push({ level: 'medium', text: `Forecast: rain heavy enough to pass the ${threshold} is expected in ${listNames(withForecast)}.` });
  }

  // Central Nairobi's general forecast, for context.
  let centralGaps = false;
  if (central) {
    const upcoming = (central.forecast ?? []).slice(1);
    centralGaps = upcoming.some(f => f.precipitation == null);
    const peak = upcoming.reduce((max, f) => (f.precipitation != null && f.precipitation > (max?.precipitation ?? 0) ? f : max), null);
    if (peak) {
      messages.push({ level: 'info', text: `Central Nairobi forecast: up to ${mmPerHour(peak.precipitation)} around ${clockTime(peak.time)}${centralGaps ? ' in the hours available' : ''}.` });
    } else if (upcoming.length && !centralGaps) {
      messages.push({ level: 'info', text: `No rain forecast in central Nairobi for the next ${upcoming.length} hours.` });
    }
  } else {
    messages.push({ level: 'info', text: "The central Nairobi reading is unavailable; zone checks use each zone's own weather." });
  }
  const forecastGaps = centralGaps || reports.some(r => r.forecast_complete === false);
  if (forecastGaps) {
    messages.push({ level: 'info', text: "Some forecast hours are missing, so later hours can't be fully checked." });
  }

  if (!reports.some(r => r.flood_probability != null)) {
    messages.push({ level: 'info', text: 'Flood model unavailable, so alerts use rain thresholds only.' });
  }

  const unknownZones = zones.filter(z => !isZoneRiskKnown(z, reports));
  if (unknownZones.length) {
    const which = unknownZones.length > 5 ? `${unknownZones.length} areas` : listNames(unknownZones);
    messages.push({ level: 'info', text: `Flood risk can't be checked for ${which} right now.` });
  }
  const modelOnly = zones.filter(z => z.rain_threshold == null && isZoneRiskKnown(z, reports));
  if (modelOnly.length && zones.every(z => z.rain_threshold == null)) {
    messages.push({ level: 'info', text: 'No area has a recorded flood threshold, so alerts come from the model estimate only.' });
  } else if (modelOnly.length) {
    messages.push({ level: 'info', text: `No flood threshold is recorded for ${listNames(modelOnly)}, so ${modelOnly.length > 1 ? 'they are' : 'it is'} covered only by the model estimate.` });
  }

  // "partial": nothing alarming in the data we have, but some of it is missing, so no all-clear.
  const partial = forecastGaps || unknownZones.length > 0;
  const level = messages.some(m => m.level === 'high') ? 'high'
    : messages.some(m => m.level === 'medium') ? 'medium'
    : partial ? 'partial'
    : 'none';
  if (level === 'none' || level === 'partial') {
    const rainNow = central ? ` Rain now in central Nairobi: ${mmPerHour(central.current_mm_per_hour)}.` : '';
    messages.unshift({ level, text: `No flood alerts${level === 'partial' ? ' for what can be checked' : ''}${asOf}.${rainNow}` });
  }

  return { level, messages: [...messages, DISCLAIMER] };
}
