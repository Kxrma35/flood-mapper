// Reads the optional area dataset once, the same way for the map (convert-csv.js) and the
// AI chat (load-flood-data.js). Missing values stay missing instead of being guessed.

const fs = require('fs');
const path = require('path');

const DATASET_PATH = path.join(__dirname, '..', 'data', 'your-flood-data.csv');
const RISK_LEVELS = ['high', 'medium', 'low'];

function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function riskLevel(row) {
  const frequency = String(row.flood_frequency ?? '').trim().toLowerCase();
  if (RISK_LEVELS.includes(frequency)) return frequency;

  const score = toNumber(row.flood_score);
  if (score == null) return 'unknown';
  return score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
}

function readDataset() {
  if (!fs.existsSync(DATASET_PATH)) return null;

  const { parse } = require('csv-parse/sync');
  const rows = parse(fs.readFileSync(DATASET_PATH, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });

  return rows
    .filter(row => row.area_name)
    .map(row => {
      const threshold = toNumber(row.rain_threshold_mm);
      return {
        name: row.area_name,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        risk: riskLevel(row),
        threshold: threshold > 0 ? threshold : null,
        notes: row.notes || '',
      };
    });
}

module.exports = { DATASET_PATH, readDataset };
