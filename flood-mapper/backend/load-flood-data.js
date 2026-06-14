// Phase 5: Build the AI system prompt from your real CSV dataset.
// When your data analyst hands you the CSV, drop it in data/ and this
// file will auto-inject every area's risk level and threshold into Claude.

const fs = require('fs');
const path = require('path');

// Fallback data used until the real CSV is provided
const FALLBACK_AREAS = [
  { name: 'Mathare Valley', risk: 'HIGH', threshold: 10, notes: 'Riverbank, floods rapidly' },
  { name: 'Mukuru kwa Njenga', risk: 'HIGH', threshold: 10, notes: 'Industrial runoff compounds risk' },
  { name: 'Mukuru kwa Reuben', risk: 'HIGH', threshold: 10, notes: 'Low-lying informal settlement' },
  { name: 'Ngong River corridor', risk: 'HIGH', threshold: 8, notes: 'River bursts banks above 8mm/hr' },
  { name: 'Nairobi River banks (Ngara, Bondeni)', risk: 'HIGH', threshold: 8, notes: 'Rapid overflow' },
  { name: 'Eastleigh Sections 1-3', risk: 'MEDIUM-HIGH', threshold: 15, notes: 'Poor storm drainage' },
  { name: 'South B near Bellevue', risk: 'MEDIUM', threshold: 20, notes: 'Periodic surface flooding' },
  { name: 'Ngara and Pangani', risk: 'MEDIUM', threshold: 18, notes: 'Surface flooding on main roads' },
  { name: 'Westlands lower areas', risk: 'LOW-MEDIUM', threshold: 25, notes: 'Minor pooling' },
  { name: 'CBD main roads', risk: 'LOW', threshold: 30, notes: 'Surface water, underpasses at risk' },
];

function buildSystemPrompt() {
  let areaList;

  const csvPath = path.join(__dirname, '../data/your-flood-data.csv');

  if (fs.existsSync(csvPath)) {
    // Real CSV is present — use it
    try {
      const csv = require('csv-parse/sync');
      const input = fs.readFileSync(csvPath, 'utf8');
      const rows = csv.parse(input, { columns: true, skip_empty_lines: true });

      areaList = rows.map(row => {
        const risk = (row.flood_frequency || row.flood_score || 'unknown').toUpperCase();
        const threshold = row.rain_threshold_mm ? ` above ${row.rain_threshold_mm}mm/hr` : '';
        const notes = row.notes ? ` (${row.notes})` : '';
        return `- ${row.area_name}: ${risk} risk${threshold}${notes}`;
      }).join('\n');

      console.log(`Loaded ${rows.length} areas from CSV dataset`);
    } catch (err) {
      console.warn('CSV parse failed, using fallback data:', err.message);
      areaList = FALLBACK_AREAS.map(a =>
        `- ${a.name}: ${a.risk} risk above ${a.threshold}mm/hr (${a.notes})`
      ).join('\n');
    }
  } else {
    // CSV not yet provided — use fallback
    console.log('No CSV found at data/your-flood-data.csv — using built-in fallback data');
    areaList = FALLBACK_AREAS.map(a =>
      `- ${a.name}: ${a.risk} risk above ${a.threshold}mm/hr (${a.notes})`
    ).join('\n');
  }

  return `You are a flood risk assistant for Nairobi, Kenya.
You help residents decide whether it is safe to travel during heavy rainfall.

Known flood-prone areas based on historical data:
${areaList}

When you receive a question, you will be given:
- Current precipitation in mm/hr from live Open-Meteo weather data
- User's origin and destination (if provided)

ALWAYS respond in this exact format:
1. Risk level: LOW / MEDIUM / HIGH
2. One sentence explaining why
3. One practical suggestion (e.g. alternative route, wait time, specific road to avoid)

Be concise. Write like you're texting a friend who needs to leave right now.`;
}

module.exports = { buildSystemPrompt };