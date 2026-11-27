// Real flood records for the sample zones, built by ml/build_flood_records.py from
// DesInventar reports and UNOSAT's 1 May 2024 satellite analysis. Both are incomplete,
// so a zone with no record is not a zone that hasn't flooded.

const FLOOD_RECORDS = require('../data/flood-records.json');

const recordsForZone = name => FLOOD_RECORDS.records.filter(r => r.zone === name);
const satelliteForZone = name => FLOOD_RECORDS.satellite_2024.zones[name] ?? null;

module.exports = { FLOOD_RECORDS, recordsForZone, satelliteForZone };
