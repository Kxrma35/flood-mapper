const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

const CSV_PATH = path.join(__dirname, 'data', 'your-flood-data.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'frontend', 'public', 'flood-zones.geojson');

const input = fs.readFileSync(CSV_PATH, 'utf8');
const rows = csv.parse(input, { columns: true, skip_empty_lines: true });
 
const RADIUS_METRES = 800;
 
function getRiskLevel(row) {
  const freq = (row.flood_frequency || '').toLowerCase();
  const score = parseFloat(row.flood_score || 0);
  if (freq === 'high' || score >= 7) return 'high';
  if (freq === 'medium' || score >= 4) return 'medium';
  return 'low';
}
 
function makePolygon(lat, lng, radiusM) {
  const d = radiusM / 111320;
  return [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ];
}
 
const geojson = {
  type: 'FeatureCollection',
  features: rows.map(row => ({
    type: 'Feature',
    properties: {
      name: row.area_name,
      risk: getRiskLevel(row),
      rain_threshold: parseFloat(row.rain_threshold_mm) || 15,
      notes: row.notes || '',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [makePolygon(
        parseFloat(row.latitude),
        parseFloat(row.longitude),
        RADIUS_METRES
      )],
    },
  })),
};
 
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson, null, 2));
console.log(`Converted ${rows.length} rows to frontend/public/flood-zones.geojson`);
 