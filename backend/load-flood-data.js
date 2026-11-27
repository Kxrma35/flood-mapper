// Builds the AI chat's system prompt. Uses backend/data/your-flood-data.csv when present
// (columns: area_name, flood_frequency or flood_score, rain_threshold_mm, notes); otherwise
// the same sample zones the map shows, labelled as sample data.

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'data', 'your-flood-data.csv');

// Matches buildFallbackGeoJSON in frontend/src/App.jsx.
const SAMPLE_AREAS = [
  { name: 'Mathare Valley',    risk: 'HIGH',   threshold: 10 },
  { name: 'Kibera',            risk: 'HIGH',   threshold: 10 },
  { name: 'Mukuru kwa Njenga', risk: 'HIGH',   threshold: 10 },
  { name: 'Pangani',           risk: 'MEDIUM', threshold: 18 },
  { name: 'Eastlands',         risk: 'MEDIUM', threshold: 15 },
  { name: 'Upper Hill',        risk: 'LOW',    threshold: 30 },
  { name: 'Westlands',         risk: 'LOW',    threshold: 25 },
  { name: 'CBD',               risk: 'LOW',    threshold: 30 },
];

function loadDatasetAreas() {
  if (!fs.existsSync(CSV_PATH)) return null;
  try {
    const { parse } = require('csv-parse/sync');
    const rows = parse(fs.readFileSync(CSV_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
    console.log(`AI chat: loaded ${rows.length} areas from ${CSV_PATH}`);
    return rows.map(row => {
      const risk = String(row.flood_frequency || row.flood_score || 'unknown').toUpperCase();
      const threshold = row.rain_threshold_mm ? `, flood threshold ${row.rain_threshold_mm} mm/hr` : '';
      const notes = row.notes ? ` (${row.notes})` : '';
      return `- ${row.area_name}: ${risk} risk${threshold}${notes}`;
    });
  } catch (err) {
    console.warn(`AI chat: could not read ${CSV_PATH}, using sample areas:`, err.message);
    return null;
  }
}

function buildSystemPrompt() {
  const datasetAreas = loadDatasetAreas();
  const areaList = datasetAreas
    ?? SAMPLE_AREAS.map(a => `- ${a.name}: ${a.risk} risk, flood threshold ${a.threshold} mm/hr`);
  const sourceRule = datasetAreas
    ? 'The area list comes from the FloodSafe flood dataset.'
    : 'The area list is sample data with no verified source. If you rely on one of its levels or thresholds, say it is a rough sample figure.';

  return `You are FloodSafe's flood risk assistant for Nairobi, Kenya.
You help residents decide whether it is safe to travel during heavy rainfall.

Each question comes with live conditions: rainfall at one point in central Nairobi from Open-Meteo, and the FloodSafe model's flood probability estimated from that rainfall. The user's origin and destination are included when given.

Flood-prone areas:
${areaList.join('\n')}

Rules:
- Use only the live conditions and the area list above. Rain is measured at one point, so treat it as a city-wide reading, not a reading for a specific place.
- ${sourceRule}
- Never invent road closures, river levels, traffic, incidents or official warnings. If asked about something this data does not cover, such as a specific road, say you don't have that information.
- If the live conditions are unavailable, say the current risk can't be checked.
- You are not an official warning service. If someone is in danger or sees flooding, tell them to call 999 or 112 and to follow Kenya Meteorological Department and Nairobi County alerts.

Always respond in this format:
1. Risk level: LOW / MEDIUM / HIGH, or UNKNOWN when live conditions are unavailable
2. One sentence explaining why, naming the data it comes from
3. One practical suggestion

Be concise. Write like you're texting a friend who needs to leave right now.`;
}

module.exports = { buildSystemPrompt };
