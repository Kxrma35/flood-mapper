const express = require('express');
const { FLOOD_RECORDS } = require('../lib/flood-records');
const router = express.Router();

// No long cache: after a rebuild, stale records next to the new areas would read as
// "not matched". Express's ETag still lets browsers revalidate cheaply.
router.get('/', (req, res) => {
  res.json(FLOOD_RECORDS);
});

module.exports = router;
