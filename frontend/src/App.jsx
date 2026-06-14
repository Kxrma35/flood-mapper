// App.jsx
// Top-level layout: header, sidebar (route check + AI chat + rain indicator),
// map panel, zone detail overlay, and live alerts ticker.

import { useState, useEffect } from 'react';
import MapView from './components/MapView';
import AIChatPanel from './components/AIChatPanel';
import RainIndicator from './components/RainIndicator';

const ALERTS = [
  'LIVE – Mathare River water level: 2.4m (danger threshold: 1.8m) – Flash flood warning in effect',
  'KMD – Heavy rainfall advisory: 25–40mm expected in next 3 hours across Nairobi',
  'County DRR – Evacuation notice issued for Mathare North Zone 3 and 4',
  'CROWD – Flooding reported on Outer Ring Road near Huruma estate (12 min ago)',
  'NWSC – Water supply disruption in Kibera due to pump station flooding',
  'KMD – Ngong River gauge at 89% capacity. Downstream communities on alert',
  'CROWD – Impassable section on Ngong Road at Adam\'s Arcade (7 min ago)',
];

const QUICK_CHECKS = ['Westlands', 'Eastlands', 'Kibera', 'Buruburu'];

export default function App() {
  const [origin, setOrigin] = useState('Westlands');
  const [destination, setDestination] = useState('CBD');
  const [submittedOrigin, setSubmittedOrigin] = useState('Westlands');
  const [submittedDest, setSubmittedDest] = useState('CBD');
  const [floodZones, setFloodZones] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [weather, setWeather] = useState(null);
  const [alertIndex, setAlertIndex] = useState(0);
  const [alertVisible, setAlertVisible] = useState(true);
  const [time, setTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('route'); // 'route' | 'chat'

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Alert ticker
  useEffect(() => {
    const t = setInterval(() => {
      setAlertVisible(false);
      setTimeout(() => {
        setAlertIndex(i => (i + 1) % ALERTS.length);
        setAlertVisible(true);
      }, 400);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Load GeoJSON flood zones from public/
  useEffect(() => {
    fetch('/flood-zones.geojson')
      .then(r => r.json())
      .then(setFloodZones)
      .catch(() => {
        // Fallback: inline sample data until real CSV is converted
        setFloodZones(buildFallbackGeoJSON());
      });
  }, []);

  function buildFallbackGeoJSON() {
    const zones = [
      { name: 'Mathare Valley', lat: -1.258, lng: 36.859, risk: 'high', rain_threshold: 10, residents: 82000, notes: 'Riverbank area, floods within 20 mins' },
      { name: 'Kibera', lat: -1.313, lng: 36.784, risk: 'high', rain_threshold: 10, residents: 250000, notes: 'Low-lying, poor drainage' },
      { name: 'Mukuru kwa Njenga', lat: -1.318, lng: 36.878, risk: 'high', rain_threshold: 10, residents: 100000, notes: 'Industrial runoff compounds risk' },
      { name: 'Pangani', lat: -1.275, lng: 36.843, risk: 'medium', rain_threshold: 18, residents: 35000, notes: 'Surface flooding on main roads' },
      { name: 'Eastlands', lat: -1.285, lng: 36.876, risk: 'medium', rain_threshold: 15, residents: 60000, notes: 'Flash flooding in sections 1–3' },
      { name: 'Upper Hill', lat: -1.299, lng: 36.818, risk: 'low', rain_threshold: 30, residents: 12000, notes: 'Good drainage, minor pooling' },
      { name: 'Westlands', lat: -1.268, lng: 36.807, risk: 'low', rain_threshold: 25, residents: 28000, notes: 'Lower areas prone to surface water' },
      { name: 'CBD', lat: -1.284, lng: 36.822, risk: 'low', rain_threshold: 30, residents: 0, notes: 'Main roads drain quickly' },
    ];
    const d = 0.008;
    return {
      type: 'FeatureCollection',
      features: zones.map(z => ({
        type: 'Feature',
        properties: { name: z.name, risk: z.risk, rain_threshold: z.rain_threshold, residents: z.residents, notes: z.notes },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [z.lng - d, z.lat - d * 1.2],
            [z.lng + d * 1.1, z.lat - d * 0.8],
            [z.lng + d * 0.9, z.lat + d * 1.2],
            [z.lng - d * 1.1, z.lat + d * 0.6],
            [z.lng - d, z.lat - d * 1.2],
          ]],
        },
      })),
    };
  }

  const [predictions, setPredictions] = useState([]);

  useEffect(() => {
    const fetchPredictions = () => {
      fetch('/api/predict')
        .then(r => r.json())
        .then(setPredictions)
        .catch(console.error);
    };
    fetchPredictions();
    const t = setInterval(fetchPredictions, 10 * 60 * 1000); // every 10 min
    return () => clearInterval(t);
  }, []);

  const precipMm = weather?.current_mm_per_hour ?? null;
  const formatTime = d => d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const formatDate = d => d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const riskColor = r => r === 'high' ? '#E24B4A' : r === 'medium' ? '#EF9F27' : '#639922';

  const zoneCounts = floodZones?.features?.reduce((acc, f) => {
    acc[f.properties.risk] = (acc[f.properties.risk] || 0) + 1;
    return acc;
  }, {}) || {};

  return (
    <div style={s.root}>

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logo}>
            <i className="ti ti-wave-sine" style={{ fontSize: 16, color: '#000' }} aria-hidden="true" />
          </div>
          <span style={s.appName}>FloodSafe</span>
          <span style={s.badge('#1D9E75')}>NAIROBI</span>
          <span style={{ ...s.alertBadge, background: '#E24B4A20', color: '#E24B4A', border: '1px solid #E24B4A50' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 11 }} aria-hidden="true" />
            FLOOD WATCH ACTIVE
          </span>
        </div>
        <div style={s.headerRight}>
          <span style={s.weatherItem}>
            <i className="ti ti-cloud-rain" style={{ fontSize: 14 }} aria-hidden="true" />
            {weather?.description || 'Loading...'}
          </span>
          <span style={s.weatherItem}>
            <i className="ti ti-temperature" style={{ fontSize: 14 }} aria-hidden="true" />
            {weather ? `${weather.temperature_c?.toFixed(0)}°C` : '--'}
          </span>
          <span style={s.weatherItem}>
            <i className="ti ti-droplet" style={{ fontSize: 14 }} aria-hidden="true" />
            {weather ? `${weather.humidity_pct}%` : '--'}
          </span>
          <span style={s.weatherItem}>
            <i className="ti ti-wind" style={{ fontSize: 14 }} aria-hidden="true" />
            {weather ? `${weather.wind_kmh} km/h` : '--'}
          </span>
          <span style={{ ...s.weatherItem, color: '#e8e8e8', fontWeight: 600 }}>
            <i className="ti ti-clock" style={{ fontSize: 14 }} aria-hidden="true" />
            {formatTime(time)} EAT
          </span>
          <span style={{ ...s.weatherItem, color: '#555' }}>{formatDate(time)}</span>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={s.body}>

        {/* ── SIDEBAR ── */}
        <aside style={s.sidebar}>
          <div style={{ overflowY: 'auto', flex: 1, padding: '14px 14px 0' }}>

            {/* Tab switcher */}
            <div style={s.tabs}>
              {[['route', 'ti-route', 'Route Check'], ['chat', 'ti-message-circle', 'AI Chat']].map(([id, icon, label]) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  style={{ ...s.tab, ...(activeTab === id ? s.tabActive : {}) }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 13 }} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>

            {/* ── ROUTE CHECK TAB ── */}
            {activeTab === 'route' && (
              <>
                <div style={s.sectionLabel}>Check Route Safety</div>

                {/* Origin */}
                <div style={s.inputBox}>
                  <i className="ti ti-map-pin" style={{ fontSize: 15, color: '#1D9E75', flexShrink: 0 }} aria-hidden="true" />
                  <input value={origin} onChange={e => setOrigin(e.target.value)}
                    placeholder="Origin (e.g. Westlands)"
                    style={s.textInput} />
                </div>

                {/* Destination */}
                <div style={s.inputBox}>
                  <i className="ti ti-flag" style={{ fontSize: 15, color: '#EF9F27', flexShrink: 0 }} aria-hidden="true" />
                  <input value={destination} onChange={e => setDestination(e.target.value)}
                    placeholder="Destination (e.g. CBD)"
                    style={s.textInput} />
                </div>

                <button onClick={() => { setSubmittedOrigin(origin); setSubmittedDest(destination); setActiveTab('chat'); }}
                  style={s.checkBtn}>
                  <i className="ti ti-shield-check" style={{ fontSize: 15 }} aria-hidden="true" />
                  Check Route Safety
                </button>

                {/* Quick checks */}
                <div style={{ ...s.sectionLabel, marginTop: 16 }}>Quick Checks</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
                  {QUICK_CHECKS.map(q => (
                    <button key={q}
                      onClick={() => { setOrigin(q); setDestination('CBD'); setSubmittedOrigin(q); setSubmittedDest('CBD'); setActiveTab('chat'); }}
                      style={s.quickBtn}>
                      <i className="ti ti-arrow-up" style={{ fontSize: 11 }} aria-hidden="true" /> {q}
                    </button>
                  ))}
                </div>

                {/* Rainfall */}
                <div style={s.sectionLabel}>Rainfall Intensity</div>
                <RainIndicator onWeatherUpdate={setWeather} />

                {/* Zone counter */}
                <div style={{ ...s.sectionLabel, marginTop: 16 }}>Active Zones</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
                  {[['high', 'HIGH', '#E24B4A'], ['medium', 'MED', '#EF9F27'], ['low', 'LOW', '#639922']].map(([k, l, c]) => (
                    <div key={k} style={{ background: c + '15', border: `1px solid ${c}30`, borderRadius: 6, padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{zoneCounts[k] || 0}</div>
                      <div style={{ fontSize: 10, color: c + 'aa' }}>{l}</div>
                    </div>
                  ))}
                </div>

                {/* Map legend */}
                <details style={{ marginBottom: 16 }}>
                  <summary style={{ ...s.sectionLabel, cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-chevron-down" style={{ fontSize: 11 }} aria-hidden="true" /> Map Legend
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {[['#E24B4A', 'High risk zone'], ['#EF9F27', 'Medium risk zone'], ['#639922', 'Low risk zone'], ['#1D9E75', 'Selected route']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <div style={{ width: 12, height: 12, background: c, borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#666' }}>{l}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, fontSize: 10, color: '#444', lineHeight: 1.6 }}>
                      Data: KMD weather feeds · NWSC river gauges · County DRR reports · Crowdsourced incidents
                    </div>
                  </div>
                </details>
              </>
            )}

            {/* ── AI CHAT TAB ── */}
            {activeTab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-sparkles" style={{ fontSize: 12 }} aria-hidden="true" />
                  AI Flood Assistant
                  {precipMm != null && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#EF9F27' }}>
                      {precipMm.toFixed(1)}mm/hr
                    </span>
                  )}
                </div>
                <AIChatPanel
                  weatherMm={precipMm}
                  origin={submittedOrigin}
                  destination={submittedDest}
                />
              </div>
            )}

          </div>
        </aside>

        {/* ── MAP ── */}
        <main style={{ flex: 1, position: 'relative' }}>
          <MapView
            origin={submittedOrigin}
            destination={submittedDest}
            floodZones={floodZones}
            onZoneClick={setSelectedZone}
            precipMm={precipMm}
          />

          {/* Zone detail overlay */}
          {selectedZone && (
            <div style={s.zonePanel(riskColor(selectedZone.risk))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{selectedZone.name}</span>
                <span style={{ marginLeft: 'auto', background: riskColor(selectedZone.risk) + '20', color: riskColor(selectedZone.risk), border: `1px solid ${riskColor(selectedZone.risk)}50`, fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 700 }}>
                  {selectedZone.risk?.toUpperCase()}
                </span>
                <button onClick={() => setSelectedZone(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#888', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-droplet" style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
                  <span>Flood threshold: <span style={{ color: '#e8e8e8' }}>{selectedZone.rain_threshold}mm/hr</span></span>
                </div>
                {selectedZone.residents > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-users" style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
                    <span>Residents: <span style={{ color: '#e8e8e8' }}>{selectedZone.residents.toLocaleString()}</span></span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <i className="ti ti-notes" style={{ fontSize: 13, color: '#555', marginTop: 1 }} aria-hidden="true" />
                  <span style={{ color: '#bbb' }}>{selectedZone.notes}</span>
                </div>
                {precipMm != null && (
                  <div style={{
                    marginTop: 4, padding: '6px 8px', borderRadius: 6,
                    background: precipMm >= selectedZone.rain_threshold ? '#E24B4A15' : '#1D9E7515',
                    border: `1px solid ${precipMm >= selectedZone.rain_threshold ? '#E24B4A30' : '#1D9E7530'}`,
                    color: precipMm >= selectedZone.rain_threshold ? '#E24B4A' : '#1D9E75',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className={`ti ${precipMm >= selectedZone.rain_threshold ? 'ti-alert-triangle' : 'ti-circle-check'}`} style={{ fontSize: 13 }} aria-hidden="true" />
                    {precipMm >= selectedZone.rain_threshold
                      ? 'Currently exceeding flood threshold'
                      : 'Below flood threshold right now'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Map hint */}
          {!selectedZone && (
            <div style={s.mapHint}>
              <i className="ti ti-hand-click" style={{ fontSize: 13 }} aria-hidden="true" />
              Click any zone for details
            </div>
          )}
        </main>
      </div>

      {/* ── ALERTS TICKER ── */}
      <footer style={s.ticker}>
        <span style={s.tickerBadge}>
          <i className="ti ti-radio" style={{ fontSize: 11 }} aria-hidden="true" />
          LIVE ALERTS
        </span>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: 12, color: '#aaa', opacity: alertVisible ? 1 : 0, transition: 'opacity 0.4s', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-bolt" style={{ fontSize: 12, color: '#EF9F27', flexShrink: 0 }} aria-hidden="true" />
            {ALERTS[alertIndex]}
          </span>
        </div>
      </footer>

    </div>
  );
}

// ── Styles ──
const s = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0a', color: '#e8e8e8', fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: 13 },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#111', borderBottom: '1px solid #1e1e1e', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#888' },
  logo: { width: 28, height: 28, background: '#EF9F27', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  appName: { fontWeight: 700, fontSize: 14, letterSpacing: 1 },
  badge: bg => ({ background: bg, color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 700, letterSpacing: 1 }),
  alertBadge: { fontSize: 10, padding: '2px 8px', borderRadius: 3, fontWeight: 700, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4 },
  weatherItem: { display: 'flex', alignItems: 'center', gap: 4 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: 300, background: '#111', borderRight: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 },
  tabs: { display: 'flex', gap: 4, marginBottom: 14 },
  tab: { flex: 1, padding: '7px 8px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#555', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabActive: { background: '#222', color: '#e8e8e8', border: '1px solid #3a3a3a' },
  sectionLabel: { fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  inputBox: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
  textInput: { background: 'none', border: 'none', outline: 'none', color: '#e8e8e8', fontSize: 13, width: '100%', fontFamily: 'inherit' },
  checkBtn: { width: '100%', padding: 11, background: '#EF9F27', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 },
  quickBtn: { padding: '8px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#1D9E75', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 },
  zonePanel: color => ({ position: 'absolute', top: 16, right: 16, width: 250, background: 'rgba(17,17,17,0.95)', backdropFilter: 'blur(8px)', border: `1px solid ${color}40`, borderRadius: 10, padding: 14, zIndex: 1000 }),
  mapHint: { position: 'absolute', bottom: 20, left: 16, background: 'rgba(17,17,17,0.85)', backdropFilter: 'blur(4px)', border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#555', zIndex: 900, display: 'flex', alignItems: 'center', gap: 6 },
  ticker: { background: '#0d0d0d', borderTop: '1px solid #1e1e1e', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  tickerBadge: { background: '#E24B4A', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 3, fontWeight: 700, letterSpacing: 1, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 },
};