// A zone is at flood risk right now if the model rates it HIGH, or, while the model is
// unavailable, if current rain is at or above the zone's recorded threshold.
export function isZoneAtRiskNow(zone, predictions, precipMm) {
  const prediction = predictions.find(p => p.name === zone.name);
  if (prediction) return prediction.risk_level === 'HIGH';
  return precipMm != null && zone.rain_threshold != null && precipMm >= zone.rain_threshold;
}
