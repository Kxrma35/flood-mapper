// Builds the AI chat's system prompt from backend/data/your-flood-data.csv when present,
// otherwise from the same sample zones the map shows, labelled as sample data.

const { DATASET_PATH, readDataset } = require('./lib/dataset');

// Matches buildFallbackGeoJSON in frontend/src/App.jsx.
const SAMPLE_AREAS = [
  { name: 'Mathare Valley',    risk: 'high',   threshold: 10 },
  { name: 'Kibera',            risk: 'high',   threshold: 10 },
  { name: 'Mukuru kwa Njenga', risk: 'high',   threshold: 10 },
  { name: 'Pangani',           risk: 'medium', threshold: 18 },
  { name: 'Eastlands',         risk: 'medium', threshold: 15 },
  { name: 'Upper Hill',        risk: 'low',    threshold: 30 },
  { name: 'Westlands',         risk: 'low',    threshold: 25 },
  { name: 'CBD',               risk: 'low',    threshold: 30 },
];

function describeArea(a) {
  const threshold = a.threshold != null ? `flood threshold ${a.threshold} mm/hr` : 'no flood threshold recorded';
  const notes = a.notes ? ` (${a.notes})` : '';
  return `- ${a.name}: ${a.risk.toUpperCase()} risk, ${threshold}${notes}`;
}

function loadDatasetAreas() {
  try {
    const areas = readDataset();
    if (areas) console.log(`AI chat: loaded ${areas.length} areas from ${DATASET_PATH}`);
    return areas;
  } catch (err) {
    console.warn(`AI chat: could not read ${DATASET_PATH}, using sample areas:`, err.message);
    return null;
  }
}

function buildSystemPrompt() {
  const datasetAreas = loadDatasetAreas();
  const areaList = (datasetAreas ?? SAMPLE_AREAS).map(describeArea);
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
