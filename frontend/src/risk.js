// Rain now at the zone's own location (from its prediction), else the central reading.
export function zoneRainNow(zone, predictions, precipMm) {
  return predictions.find(p => p.name === zone.name)?.rain_mm_per_hr ?? precipMm;
}

// A zone is at flood risk right now if the model rates it HIGH or its rain is at or above
// the zone's recorded threshold; either signal is enough.
export function isZoneAtRiskNow(zone, predictions, precipMm) {
  const prediction = predictions.find(p => p.name === zone.name);
  const rain = zoneRainNow(zone, predictions, precipMm);
  const overThreshold = rain != null && zone.rain_threshold != null && rain >= zone.rain_threshold;
  return prediction?.risk_level === 'HIGH' || overThreshold;
}

// False when neither the model nor a rain-vs-threshold check can say anything about the zone,
// so "not at risk" must not be shown for it.
export function isZoneRiskKnown(zone, predictions, precipMm) {
  return predictions.some(p => p.name === zone.name) || (precipMm != null && zone.rain_threshold != null);
}
