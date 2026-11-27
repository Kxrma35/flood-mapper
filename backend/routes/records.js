const express = require('express');
const { FLOOD_RECORDS } = require('../lib/flood-records');
const router = express.Router();

router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(FLOOD_RECORDS);
});

module.exports = router;
