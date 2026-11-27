// Generates the map's zone file from backend/data/your-flood-data.csv.
// Run with: node backend/convert-csv.js

const fs = require('fs');
const path = require('path');
const { DATASET_PATH, readDataset } = require('./lib/dataset');

const OUTPUT_PATH = path.join(__dirname, '..', 'frontend', 'public', 'flood-zones.geojson');
const RADIUS_METRES = 800;

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

const areas = readDataset();
if (!areas) {
  console.error(`No dataset found at ${DATASET_PATH}`);
  process.exit(1);
}

const mappable = areas.filter(a => a.latitude != null && a.longitude != null);
const skipped = areas.length - mappable.length;

const geojson = {
  type: 'FeatureCollection',
  features: mappable.map(a => ({
    type: 'Feature',
    properties: {
      name: a.name,
      risk: a.risk,
      rain_threshold: a.threshold,
      notes: a.notes,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [makePolygon(a.latitude, a.longitude, RADIUS_METRES)],
    },
  })),
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson, null, 2));
console.log(`Converted ${mappable.length} areas to frontend/public/flood-zones.geojson`);
if (skipped) console.warn(`Skipped ${skipped} areas without valid latitude/longitude`);
