const express   = require('express');
const rateLimit = require('express-rate-limit');
const { PROFILES, RoutingError, findPlace, findRoute } = require('../lib/ors');
const router    = express.Router();

const MAX_PLACE_CHARS = 100;
const MAX_AVOID_AREAS = 20;
const MAX_RING_POINTS = 200;
// Generous box around Kenya; anything outside is a mistake or abuse.
const BOUNDS = { minLat: -5, maxLat: 5.5, minLon: 33.5, maxLon: 42 };

const routeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many route checks in a short time. Please wait a minute and try again.' },
});

const inBounds = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) &&
  lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon;

// A place is either text to search for or a { lat, lon } point (e.g. the user's location).
async function resolvePlace(value, which) {
  if (typeof value === 'string') {
    const text = value.trim().slice(0, MAX_PLACE_CHARS);
    if (!text) throw new RoutingError(400, `Enter a ${which}.`);
    return findPlace(text);
  }
  const lat = Number(value?.lat);
  const lon = Number(value?.lon);
  if (!inBounds(lat, lon)) throw new RoutingError(400, `The ${which} must be in Kenya.`);
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim().slice(0, MAX_PLACE_CHARS) : 'Selected point';
  return { label, lat, lon };
}

// Areas to avoid arrive as closed rings of [lon, lat] points and go to ORS as one MultiPolygon.
function parseAvoid(avoid) {
  if (avoid == null) return null;
  if (!Array.isArray(avoid) || avoid.length > MAX_AVOID_AREAS) {
    throw new RoutingError(400, 'Invalid areas to avoid.');
  }
  const rings = avoid.map(ring => {
    const valid = Array.isArray(ring) && ring.length >= 4 && ring.length <= MAX_RING_POINTS &&
      ring.every(p => Array.isArray(p) && p.length === 2 && inBounds(p[1], p[0]));
    if (!valid) throw new RoutingError(400, 'Invalid areas to avoid.');
    const [first, last] = [ring[0], ring[ring.length - 1]];
    return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  });
  return rings.length ? { type: 'MultiPolygon', coordinates: rings.map(ring => [ring]) } : null;
}

router.post('/', routeLimiter, async (req, res) => {
  try {
    const mode = req.body?.mode ?? 'drive';
    if (!PROFILES[mode]) throw new RoutingError(400, 'Mode must be "drive" or "walk".');
    const avoid = parseAvoid(req.body?.avoid);

    const [from, to] = await Promise.all([
      resolvePlace(req.body?.from, 'starting point'),
      resolvePlace(req.body?.to, 'destination'),
    ]);
    const route = await findRoute(from, to, mode, avoid);
    res.json({ from, to, mode, route });
  } catch (err) {
    if (err instanceof RoutingError) return res.status(err.status).json({ error: err.message });
    console.error('Route request failed:', err);
    res.status(500).json({ error: 'Route planning failed unexpectedly.' });
  }
});

module.exports = router;
