import { lineCrossesZone, pointInZone, zoneRings } from './geometry';

const API = import.meta.env.VITE_API_URL || '';
const MAX_AVOID_AREAS = 20;
// Longer than the backend's own provider timeouts (place search, then routing), so its
// handled error reaches the user instead of a browser timeout.
const ROUTE_TIMEOUT_MS = 45000;

async function requestRoute(body) {
  const res = await fetch(`${API}/api/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Route planning failed (HTTP ${res.status}).`);
  return data;
}

const zonesOnRoute = (coordinates, zones) => zones.filter(z => lineCrossesZone(coordinates, z.geometry));

// Gets the fastest route, then, if it passes through zones that need avoiding, a second
// route around them. Zones are GeoJSON features; isAtRisk decides "at flood risk right now".
export async function planRoute({ from, to, mode, zones, isAtRisk, avoidHighRisk = false }) {
  const first = await requestRoute({ from, to, mode });
  const fastest = { ...first.route, zones: zonesOnRoute(first.route.coordinates, zones) };

  // A zone holding the start or end can't be routed around, so it is reported instead.
  const startZones = zones.filter(z => pointInZone([first.from.lon, first.from.lat], z.geometry));
  const endZones = zones.filter(z => pointInZone([first.to.lon, first.to.lat], z.geometry));
  const avoidable = z => !startZones.includes(z) && !endZones.includes(z);
  const needsAvoiding = z => isAtRisk(z.properties) || (avoidHighRisk && z.properties.risk === 'high');

  // Only look for a safer route when the fastest one crosses a zone that needs avoiding; then
  // avoid every such zone, so the detour doesn't just move into another one (within ORS's limit).
  const wanted = fastest.zones.filter(z => avoidable(z) && needsAvoiding(z));
  const everyZoneToAvoid = zones.filter(z => avoidable(z) && needsAvoiding(z));
  const toAvoid = everyZoneToAvoid.flatMap(z => zoneRings(z.geometry)).length <= MAX_AVOID_AREAS ? everyZoneToAvoid : wanted;

  let safer = null;
  let saferError = null;
  let avoided = [];
  if (wanted.length) {
    try {
      const second = await requestRoute({
        from: first.from,
        to: first.to,
        mode,
        avoid: toAvoid.flatMap(z => zoneRings(z.geometry)).slice(0, MAX_AVOID_AREAS),
      });
      safer = { ...second.route, zones: zonesOnRoute(second.route.coordinates, zones) };
      // Only claim what the alternative really avoids (the provider caps how many areas it takes).
      avoided = wanted.filter(z => !safer.zones.includes(z));
      if (!avoided.length) {
        safer = null;
        saferError = 'No route was found that avoids them.';
      }
    } catch (err) {
      saferError = err.message;
    }
  }

  // Which zones on the fastest route counted as at risk when this plan was made, so the panel
  // can tell when newer weather makes the plan out of date.
  const riskAtCheck = fastest.zones.filter(z => isAtRisk(z.properties)).map(z => z.properties.name).sort().join('|');

  return { from: first.from, to: first.to, mode, fastest, safer, saferError, wanted, avoided, startZones, endZones, avoidHighRisk, riskAtCheck };
}

export function formatDistance(metres) {
  if (metres == null) return '';
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
