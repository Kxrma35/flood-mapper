// MapView.jsx
// Renders the Leaflet dark map, draws flood zones from flood-zones.geojson,
// shows a route line between origin and destination, and emits zone click events.

import { useEffect, useRef } from 'react';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const RISK_COLORS = { high: '#E24B4A', medium: '#EF9F27', low: '#639922' };

export default function MapView({ origin, destination, floodZones, onZoneClick, precipMm }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayerRef = useRef(null);
  const zoneLayersRef = useRef([]);

  // Initialise map once
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [-1.286, 36.82],
      zoom: 12,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OSM contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    mapInstanceRef.current = map;
  }, []);

  // Draw flood zones whenever geojson data arrives
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !floodZones?.features?.length) return;

    // Clear previous zone layers
    zoneLayersRef.current.forEach(l => map.removeLayer(l));
    zoneLayersRef.current = [];

    floodZones.features.forEach(feature => {
      const { risk, name, rain_threshold } = feature.properties;
      const color = RISK_COLORS[risk] || '#888';

      // Dynamically recolor based on current rain vs zone threshold (Phase 8)
      const isActivelyFlooding = precipMm != null && precipMm >= rain_threshold;
      const fillOpacity = isActivelyFlooding ? 0.6 : 0.35;

      const poly = L.geoJSON(feature, {
        style: {
          color,
          fillColor: color,
          fillOpacity,
          weight: isActivelyFlooding ? 2.5 : 1.5,
          opacity: 0.9,
        },
      }).addTo(map);

      // Zone name label
      const center = L.geoJSON(feature).getBounds().getCenter();
      const label = L.divIcon({
        className: '',
        html: `<div style="
          background:${color};color:#fff;padding:2px 6px;
          border-radius:3px;font-size:10px;font-weight:700;
          white-space:nowrap;font-family:'IBM Plex Mono',monospace;
          box-shadow:0 1px 3px rgba(0,0,0,0.6);
          ${isActivelyFlooding ? 'animation:pulse 1s infinite alternate;' : ''}
        ">${name.toUpperCase()}</div>`,
        iconAnchor: [0, 0],
      });
      const marker = L.marker(center, { icon: label }).addTo(map);

      poly.on('click', () => onZoneClick?.(feature.properties));
      marker.on('click', () => onZoneClick?.(feature.properties));

      zoneLayersRef.current.push(poly, marker);
    });
  }, [floodZones, precipMm]);

  // Draw route line whenever origin/destination changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !floodZones?.features?.length) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    const findLatLng = (name) => {
      const match = floodZones.features.find(f =>
        f.properties.name.toLowerCase().includes(name.toLowerCase())
      );
      if (match) {
        const bounds = L.geoJSON(match).getBounds();
        return bounds.getCenter();
      }
      return null;
    };

    const origLatLng = findLatLng(origin);
    const destLatLng = findLatLng(destination);

    if (origLatLng && destLatLng) {
      const mid = L.latLng(
        (origLatLng.lat + destLatLng.lat) / 2 - 0.008,
        (origLatLng.lng + destLatLng.lng) / 2
      );
      const line = L.polyline([origLatLng, mid, destLatLng], {
        color: '#1D9E75',
        weight: 4,
        opacity: 0.9,
      }).addTo(map);

      // Origin dot
      L.circleMarker(origLatLng, { radius: 7, color: '#fff', fillColor: '#1D9E75', fillOpacity: 1, weight: 2 }).addTo(map);
      // Destination dot
      L.circleMarker(destLatLng, { radius: 7, color: '#fff', fillColor: '#EF9F27', fillOpacity: 1, weight: 2 }).addTo(map);

      map.fitBounds(line.getBounds(), { padding: [60, 60] });
      routeLayerRef.current = line;
    }
  }, [origin, destination, floodZones]);

  return (
    <div style={{ position: 'relative', flex: 1, height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      <style>{`
        @keyframes pulse { from { opacity: 0.7; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}