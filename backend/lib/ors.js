// OpenRouteService client: place search and road routing. The key stays on the server.
const axios = require('axios');

// api.openrouteservice.org was retired on 2026-11-24 in favour of api.heigit.org.
const ORS_URL = process.env.ORS_URL || 'https://api.heigit.org';
const NAIROBI = { lat: -1.286, lon: 36.817 };
const SEARCH_RADIUS_KM = 60;
const PLACE_CACHE_MS = 24 * 60 * 60 * 1000;
const PLACE_CACHE_SIZE = 500;
const PROFILES = { drive: 'driving-car', walk: 'foot-walking' };

const placeCache = new Map();

class RoutingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function client() {
  const key = process.env.ORS_API_KEY;
  if (!key) throw new RoutingError(503, 'Route planning is not set up on this server yet.');
  return axios.create({ baseURL: ORS_URL, timeout: 15000, headers: { Authorization: key } });
}

// Turns provider errors into messages people can act on; details only go to the server log.
function toRoutingError(err) {
  if (err instanceof RoutingError) return err;
  const status = err.response?.status;
  const code = err.response?.data?.error?.code;
  console.error('OpenRouteService error:', status ?? '', code ?? '', err.response?.data?.error?.message || err.message);

  if (code === 2010) return new RoutingError(404, "One of these places isn't close enough to a road to plan a route.");
  if (code === 2009) return new RoutingError(404, 'No route could be found between these places.');
  if (code === 2004) return new RoutingError(400, 'This trip is too long to plan here.');
  if (status === 401 || status === 403) return new RoutingError(503, 'Route planning is not set up correctly on this server.');
  if (status === 429) return new RoutingError(503, 'Route planning has reached its usage limit. Try again later.');
  if (status === 404) return new RoutingError(404, 'No route could be found between these places.');
  return new RoutingError(502, 'Route planning is unavailable right now. Try again in a moment.');
}

const AREA_LAYERS = ['neighbourhood', 'borough', 'locality', 'localadmin', 'county', 'region'];
const SUGGESTION_COUNT = 6;
const MAX_VENUES = 4;

function searchParams(text, size) {
  return {
    text,
    size,
    'boundary.country': 'KE',
    'focus.point.lat': NAIROBI.lat,
    'focus.point.lon': NAIROBI.lon,
    'boundary.circle.lat': NAIROBI.lat,
    'boundary.circle.lon': NAIROBI.lon,
    'boundary.circle.radius': SEARCH_RADIUS_KM,
  };
}

// "JKIA Health Centre, Nairobi, NA, Kenya" -> "JKIA Health Centre, Nairobi" (NA is Nairobi's region code).
function cleanLabel(label) {
  const parts = String(label).split(',').map(p => p.split(';')[0].trim()).filter(p => p && p !== 'Kenya').map(p => (p === 'NA' ? 'Nairobi' : p));
  return parts.filter((p, i) => p !== parts[i - 1]).join(', ');
}

function toPlace(feature) {
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const layer = feature.properties?.layer;
  const kind = AREA_LAYERS.includes(layer) ? 'area' : layer === 'street' ? 'street' : layer === 'address' ? 'address' : 'place';
  return { label: cleanLabel(feature.properties?.label || feature.properties?.name || ''), lat, lon, kind };
}

function cached(key) {
  const hit = placeCache.get(key);
  return hit && Date.now() - hit.at < PLACE_CACHE_MS ? hit.value : undefined;
}

function remember(key, value) {
  placeCache.set(key, { at: Date.now(), value });
  if (placeCache.size > PLACE_CACHE_SIZE) placeCache.delete(placeCache.keys().next().value);
  return value;
}

async function pelias(path, params) {
  try {
    const { data } = await client().get(path, { params });
    return (data?.features ?? []).map(toPlace).filter(Boolean);
  } catch (err) {
    throw toRoutingError(err);
  }
}

// Best single match for typed text that wasn't picked from the suggestions.
async function findPlace(text) {
  const key = `find:${text.trim().toLowerCase()}`;
  const hit = cached(key);
  if (hit) return hit;

  const [place] = await pelias('/pelias/v1/search', searchParams(text, 1));
  if (!place) throw new RoutingError(404, `Couldn't find "${text}" in the Nairobi area.`);
  return remember(key, place);
}

// Suggestions while typing. Autocomplete finds venues by partial name ("JKIA" -> the
// airport), search finds areas and streets ("Upper Hill", "Buruburu Road"); both are
// merged, areas first, without duplicates.
async function suggestPlaces(text) {
  const key = `suggest:${text.trim().toLowerCase()}`;
  const hit = cached(key);
  if (hit) return hit;

  const [completions, matches] = await Promise.all([
    pelias('/pelias/v1/autocomplete', searchParams(text, SUGGESTION_COUNT)),
    pelias('/pelias/v1/search', searchParams(text, SUGGESTION_COUNT)),
  ]);
  const seen = new Set();
  const unique = [...completions, ...matches].filter(p => !seen.has(p.label) && seen.add(p.label));
  const ofKind = kind => unique.filter(p => p.kind === kind);
  const merged = [...ofKind('area'), ...ofKind('place').slice(0, MAX_VENUES), ...ofKind('street'), ...ofKind('address'), ...ofKind('place').slice(MAX_VENUES)]
    .slice(0, SUGGESTION_COUNT);
  return remember(key, merged);
}

async function findRoute(from, to, mode, avoidPolygons) {
  const body = {
    coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
    instructions: true,
    language: 'en',
    units: 'm',
  };
  if (avoidPolygons) body.options = { avoid_polygons: avoidPolygons };

  let data;
  try {
    ({ data } = await client().post(`/openrouteservice/v2/directions/${PROFILES[mode]}/geojson`, body));
  } catch (err) {
    throw toRoutingError(err);
  }

  const feature = data?.features?.[0];
  if (!feature?.geometry?.coordinates?.length) {
    throw new RoutingError(404, 'No route could be found between these places.');
  }
  const { summary = {}, segments = [] } = feature.properties ?? {};

  return {
    distanceM: summary.distance ?? 0,
    durationS: summary.duration ?? 0,
    coordinates: feature.geometry.coordinates,
    steps: segments.flatMap(segment => segment.steps ?? []).map(step => ({
      instruction: step.instruction ?? '',
      distanceM: step.distance ?? null,
      durationS: step.duration ?? null,
    })),
  };
}

module.exports = { PROFILES, RoutingError, findPlace, findRoute, suggestPlaces };
