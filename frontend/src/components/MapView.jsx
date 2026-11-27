// MapView.jsx
// Renders the Leaflet dark map, draws flood zones from flood-zones.geojson,
// draws planned routes, and emits zone click events.

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { AT_RISK_COLOR, zoneColor } from '../zoneStyle';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CARTO_KEY = import.meta.env.VITE_CARTO_KEY;
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// CARTO's dark basemap needs a (free) key. Without one, fall back to OpenStreetMap's
// own tiles, which allow light use without a key: operations.osmfoundation.org/policies/tiles/
const BASEMAP = CARTO_KEY
  ? {
      url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`,
      attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
      className: '',
    }
  : {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: OSM_ATTRIBUTION,
      className: 'osm-dark',
    };

// Built as an element with textContent so zone names from a dataset are never parsed as HTML.
function zoneLabel(name, color, pulsing) {
  const el = document.createElement('div');
  el.textContent = String(name).toUpperCase();
  Object.assign(el.style, {
    background: color,
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    fontFamily: "'IBM Plex Mono', monospace",
    boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
    animation: pulsing ? 'pulse 1s infinite alternate' : '',
  });
  return el;
}

export default function MapView({ floodZones, onZoneClick, isAtRisk, routePlan, selectedRoute, onSelectRoute, hazardLayer }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayersRef = useRef([]);
  const zoneLayersRef = useRef([]);

  // Initialise map once
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [-1.286, 36.82],
      zoom: 12,
      zoomControl: false,
    });

    L.tileLayer(BASEMAP.url, {
      attribution: BASEMAP.attribution,
      className: BASEMAP.className,
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    mapInstanceRef.current = map;
  }, []);

  // The modelled flood-depth image, under the zones and routes.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !hazardLayer) return;
    const layer = L.imageOverlay(hazardLayer.url, hazardLayer.bounds, {
      className: 'hazard-layer',
      attribution: 'Flood depth: SPACE4ALL (CC BY 4.0)',
    }).addTo(map);
    layer.bringToBack();
    return () => {
      map.removeLayer(layer);
    };
  }, [hazardLayer]);

  // Draw flood zones whenever geojson data arrives
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !floodZones?.features?.length) return;

    // Clear previous zone layers
    zoneLayersRef.current.forEach(l => map.removeLayer(l));
    zoneLayersRef.current = [];

    floodZones.features.forEach(feature => {
      const { risk, name } = feature.properties;

      // Colour is the zone's level (or "documented flooding"); red and bold when at risk right now.
      const isActivelyFlooding = isAtRisk(feature.properties);
      const color = isActivelyFlooding ? AT_RISK_COLOR : zoneColor(risk);
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

      const center = L.geoJSON(feature).getBounds().getCenter();
      const label = L.divIcon({
        className: '',
        html: zoneLabel(name, color, isActivelyFlooding),
        iconAnchor: [0, 0],
      });
      const marker = L.marker(center, { icon: label }).addTo(map);

      poly.on('click', () => onZoneClick?.(feature.properties));
      marker.on('click', () => onZoneClick?.(feature.properties));

      zoneLayersRef.current.push(poly, marker);
    });
  }, [floodZones, isAtRisk, onZoneClick]);

  // Draw the planned route(s): the selected one solid on top, the alternative dashed below.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    routeLayersRef.current.forEach(l => map.removeLayer(l));
    routeLayersRef.current = [];
    if (!routePlan) return;

    const toLatLngs = coordinates => coordinates.map(([lng, lat]) => [lat, lng]);
    const routes = [['fastest', routePlan.fastest], ['safer', routePlan.safer]].filter(([, r]) => r);
    const ordered = [...routes.filter(([key]) => key !== selectedRoute), ...routes.filter(([key]) => key === selectedRoute)];

    ordered.forEach(([key, route]) => {
      const selected = key === selectedRoute;
      const line = L.polyline(toLatLngs(route.coordinates), selected
        ? { color: '#1D9E75', weight: 5, opacity: 0.95 }
        : { color: '#9a9a9a', weight: 4, opacity: 0.7, dashArray: '6 8' },
      ).addTo(map);
      if (!selected) line.on('click', () => onSelectRoute?.(key));
      routeLayersRef.current.push(line);
    });

    const start = L.circleMarker([routePlan.from.lat, routePlan.from.lon], { radius: 7, color: '#fff', fillColor: '#1D9E75', fillOpacity: 1, weight: 2 }).addTo(map);
    const end = L.circleMarker([routePlan.to.lat, routePlan.to.lon], { radius: 7, color: '#fff', fillColor: '#EF9F27', fillOpacity: 1, weight: 2 }).addTo(map);
    routeLayersRef.current.push(start, end);
  }, [routePlan, selectedRoute, onSelectRoute]);

  // Zoom to a new plan once, not every time the selected route changes.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !routePlan) return;
    const all = [routePlan.fastest, routePlan.safer].filter(Boolean).flatMap(r => r.coordinates);
    map.fitBounds(all.map(([lng, lat]) => [lat, lng]), { padding: [60, 60] });
  }, [routePlan]);

  return (
    <div style={{ position: 'relative', flex: 1, height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      <style>{`
        @keyframes pulse { from { opacity: 0.7; } to { opacity: 1; } }
        .osm-dark { filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) saturate(0.35); }
      `}</style>
    </div>
  );
}