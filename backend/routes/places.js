const express   = require('express');
const rateLimit = require('express-rate-limit');
const { RoutingError, suggestPlaces } = require('../lib/ors');
const router    = express.Router();

const MIN_CHARS = 3;
const MAX_CHARS = 100;

const placesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many place searches in a short time. Please wait a moment.' },
});

router.get('/', placesLimiter, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_CHARS) : '';
  if (q.length < MIN_CHARS) return res.json([]);
  try {
    res.json(await suggestPlaces(q));
  } catch (err) {
    if (err instanceof RoutingError) return res.status(err.status).json({ error: err.message });
    console.error('Place search failed:', err);
    res.status(500).json({ error: 'Place search failed unexpectedly.' });
  }
});

module.exports = router;
