// Zone risk from /api/predict's per-zone reports (each zone's own weather, plus the model's
// estimate when available). A zone with no report has no local data, so its risk is unknown:
// another location's rain is never used in its place.

const reportFor = (zone, reports) => reports.find(r => r.name === zone.name);

export function zoneRainNow(zone, reports) {
  return reportFor(zone, reports)?.rain_mm_per_hr ?? null;
}

// At risk if the model rates the zone HIGH or its own rain is at or above its threshold.
export function isZoneAtRiskNow(zone, reports) {
  const report = reportFor(zone, reports);
  const rain = report?.rain_mm_per_hr ?? null;
  return report?.risk_level === 'HIGH' || (rain != null && zone.rain_threshold != null && rain >= zone.rain_threshold);
}

// False when neither the model nor a local rain-vs-threshold check can say anything.
export function isZoneRiskKnown(zone, reports) {
  const report = reportFor(zone, reports);
  return report?.flood_probability != null || (report?.rain_mm_per_hr != null && zone.rain_threshold != null);
}
