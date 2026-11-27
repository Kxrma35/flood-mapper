// Small planar geometry helpers for checking routes against zone polygons.
// Points are [lng, lat] as in GeoJSON; at city scale a flat approximation is accurate enough.

function outerRings(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map(polygon => polygon[0]);
  return [];
}

function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

const boxesOverlap = (a, b) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsIntersect(p1, p2, q1, q2) {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export function pointInZone(point, geometry) {
  return outerRings(geometry).some(ring => pointInRing(point, ring));
}

export function lineCrossesZone(line, geometry) {
  if (line.length === 0) return false;
  const lineBox = bbox(line);
  return outerRings(geometry).some(ring => {
    if (!boxesOverlap(lineBox, bbox(ring))) return false;
    if (line.some(point => pointInRing(point, ring))) return true;
    for (let i = 1; i < line.length; i++) {
      for (let j = 1; j < ring.length; j++) {
        if (segmentsIntersect(line[i - 1], line[i], ring[j - 1], ring[j])) return true;
      }
    }
    return false;
  });
}

export function zoneRings(geometry) {
  return outerRings(geometry);
}

// Rough centre of a zone (the average of its outer ring's corners), as [lng, lat].
export function zoneCenter(geometry) {
  const ring = outerRings(geometry)[0] ?? [];
  const corners = ring.length > 1 ? ring.slice(0, -1) : ring;
  if (!corners.length) return null;
  const sum = corners.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
  return [sum[0] / corners.length, sum[1] / corners.length];
}
