// OpenRouteService client: place search and road routing. The key stays on the server.
const axios = require('axios');

const ORS_URL = process.env.ORS_URL || 'https://api.openrouteservice.org';
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

async function findPlace(text) {
  const cacheKey = text.trim().toLowerCase();
  const cached = placeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PLACE_CACHE_MS) return cached.place;

  let data;
  try {
    ({ data } = await client().get('/geocode/search', {
      params: {
        text,
        size: 1,
        'boundary.country': 'KE',
        'focus.point.lat': NAIROBI.lat,
        'focus.point.lon': NAIROBI.lon,
        'boundary.circle.lat': NAIROBI.lat,
        'boundary.circle.lon': NAIROBI.lon,
        'boundary.circle.radius': SEARCH_RADIUS_KM,
      },
    }));
  } catch (err) {
    throw toRoutingError(err);
  }

  const feature = data?.features?.[0];
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new RoutingError(404, `Couldn't find "${text}" in the Nairobi area.`);
  }

  const place = { label: feature.properties?.label || feature.properties?.name || text, lat, lon };
  placeCache.set(cacheKey, { at: Date.now(), place });
  if (placeCache.size > PLACE_CACHE_SIZE) placeCache.delete(placeCache.keys().next().value);
  return place;
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
    ({ data } = await client().post(`/v2/directions/${PROFILES[mode]}/geojson`, body));
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

module.exports = { PROFILES, RoutingError, findPlace, findRoute };
