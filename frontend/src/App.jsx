// App.jsx
// Top-level layout: header, sidebar (route check + AI chat + rain indicator),
// map panel, zone detail overlay, and live alerts ticker.

import { useState, useEffect, useMemo, useCallback } from 'react';
import MapView from './components/MapView';
import AIChatPanel from './components/AIChatPanel';
import RainIndicator from './components/RainIndicator';
import RoutePanel from './components/RoutePanel';
import ZoneHistory from './components/ZoneHistory';
import ZoneEvidence from './components/ZoneEvidence';
import HazardToggle from './components/HazardToggle';
import { isZoneAtRiskNow, isZoneRiskKnown, zoneRainNow } from './risk';
import { buildAlerts } from './alerts';
import { useLiveData } from './useLiveData';
import { formatReading } from './format';
import { AT_RISK_COLOR, LEVELS, ZONE_COLORS, hasRiskLevels, zoneColor } from './zoneStyle';

const ALERT_STATUS = {
  high:    { label: 'HIGH RISK',     color: '#E24B4A', icon: 'ti-alert-triangle' },
  medium:  { label: 'ELEVATED RISK', color: '#EF9F27', icon: 'ti-alert-triangle' },
  none:    { label: 'NO ALERTS',     color: '#1D9E75', icon: 'ti-circle-check' },
  partial: { label: 'PARTIAL CHECK', color: '#888',    icon: 'ti-alert-circle' },
  unknown: { label: 'NO DATA',       color: '#555',    icon: 'ti-cloud-off' },
  info:    { color: '#888', icon: 'ti-info-circle' },
};

const API = import.meta.env.VITE_API_URL || '';
const REFRESH_MS = 5 * 60 * 1000;
const RECORDS_REFRESH_MS = 6 * 60 * 60 * 1000;

export default function App() {
  const [routePlan, setRoutePlan] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState('fastest');
  const [chatTrip, setChatTrip] = useState({ origin: '', destination: '' });
  const [floodZones, setFloodZones] = useState(null);
  const [zonesError, setZonesError] = useState(false);
  const [showHazard, setShowHazard] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [alertIndex, setAlertIndex] = useState(0);
  const [alertVisible, setAlertVisible] = useState(true);
  const [time, setTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('route'); // 'route' | 'chat'

  const { data: weather, error: weatherError } = useLiveData(`${API}/api/weather`, REFRESH_MS);
  // One report per zone from its own weather; null until the first answer arrives.
  const { data: predictionData, error: predictionError } = useLiveData(`${API}/api/predict`, REFRESH_MS);
  const zoneReports = useMemo(
    () => (Array.isArray(predictionData) ? predictionData : predictionError ? [] : null),
    [predictionData, predictionError],
  );
  const reports = useMemo(() => zoneReports ?? [], [zoneReports]);
  const { data: floodRecords, error: floodRecordsError } = useLiveData(`${API}/api/records`, RECORDS_REFRESH_MS);

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
        setAlertIndex(i => i + 1);
        setAlertVisible(true);
      }, 400);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Flood areas from frontend/public/flood-zones.geojson, built by ml/build_flood_data.py
  // (or by backend/convert-csv.js from an area dataset of your own).
  useEffect(() => {
    fetch('/flood-zones.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setFloodZones)
      .catch(err => {
        console.error('Flood areas failed to load:', err.message);
        setZonesError(true);
      });
  }, []);

  const precipMm = weather?.current_mm_per_hour ?? null;
  const isAtRisk = useCallback(zone => isZoneAtRiskNow(zone, reports), [reports]);
  const isRiskKnown = useCallback(zone => isZoneRiskKnown(zone, reports), [reports]);
  const askAboutTrip = useCallback((origin, destination) => {
    setChatTrip({ origin, destination });
    setActiveTab('chat');
  }, []);
  const selectedReport = selectedZone && reports.find(r => r.name === selectedZone.name);
  const selectedPrediction = selectedReport?.flood_probability != null ? selectedReport : null;
  const selectedRain = selectedZone ? zoneRainNow(selectedZone, reports) : null;
  const selectedOverThreshold = selectedZone && selectedRain != null && selectedZone.rain_threshold != null
    ? selectedRain >= selectedZone.rain_threshold
    : null;
  const alerts = buildAlerts({
    weather,
    weatherError,
    reports: zoneReports,
    zones: floodZones ? floodZones.features.map(f => f.properties) : null,
    zonesError,
  });
  const alertStatus = ALERT_STATUS[alerts.level];
  const currentAlert = alerts.messages[alertIndex % alerts.messages.length];
  const currentAlertStyle = ALERT_STATUS[currentAlert.level];
  const formatTime = d => d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const formatDate = d => d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const zoneProps = floodZones?.features?.map(f => f.properties) ?? [];
  const showLevels = hasRiskLevels(zoneProps);
  const zoneCounts = zoneProps.reduce((acc, z) => ({ ...acc, [z.risk]: (acc[z.risk] || 0) + 1 }), {});
  const atRiskCount = zoneProps.filter(isAtRisk).length;
  const legend = [
    ...(showLevels
      ? LEVELS.map(level => [ZONE_COLORS[level], `${level[0].toUpperCase()}${level.slice(1)} risk zone`])
      : [[ZONE_COLORS.documented, 'Area with documented flooding']]),
    [AT_RISK_COLOR, 'At flood risk now (bold outline)'],
    ['#1D9E75', 'Selected route'],
  ];

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
          {(alerts.level === 'high' || alerts.level === 'medium') && (
            <span style={{ ...s.alertBadge, background: alertStatus.color + '20', color: alertStatus.color, border: `1px solid ${alertStatus.color}50` }}>
              <i className={`ti ${alertStatus.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
              {alertStatus.label}
            </span>
          )}
        </div>
        <div style={s.headerRight}>
          <span style={s.weatherItem}>
            <i className="ti ti-cloud-rain" style={{ fontSize: 14 }} aria-hidden="true" />
            {weather?.description || (weatherError ? 'Weather unavailable' : 'Loading...')}
          </span>
          <span style={s.weatherItem}>
            <i className="ti ti-temperature" style={{ fontSize: 14 }} aria-hidden="true" />
            {formatReading(weather?.temperature_c, v => `${v.toFixed(0)}°C`)}
          </span>
          <span style={s.weatherItem}>
            <i className="ti ti-droplet" style={{ fontSize: 14 }} aria-hidden="true" />
            {formatReading(weather?.humidity_pct, v => `${v}%`)}
          </span>
          <span style={s.weatherItem}>
            <i className="ti ti-wind" style={{ fontSize: 14 }} aria-hidden="true" />
            {formatReading(weather?.wind_kmh, v => `${v} km/h`)}
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

            {/* ── ROUTE CHECK TAB ── (kept mounted so the trip survives switching tabs) */}
            <div style={{ display: activeTab === 'route' ? 'block' : 'none' }}>
                <RoutePanel
                  zones={floodZones?.features ?? null}
                  isAtRisk={isAtRisk}
                  isRiskKnown={isRiskKnown}
                  plan={routePlan}
                  onPlan={setRoutePlan}
                  selected={selectedRoute}
                  onSelect={setSelectedRoute}
                  onAskAI={askAboutTrip}
                />

                {/* Rainfall */}
                <div style={s.sectionLabel}>Rainfall Intensity</div>
                <RainIndicator weather={weather} error={weatherError} />

                {/* Zone counter */}
                <div style={{ ...s.sectionLabel, marginTop: 16 }}>{showLevels ? 'Zone Risk Levels' : 'Flood Areas'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: showLevels ? '1fr 1fr 1fr' : '1fr 1fr', gap: 6, marginBottom: 16 }}>
                  {(showLevels
                    ? [['high', 'HIGH', ZONE_COLORS.high], ['medium', 'MED', ZONE_COLORS.medium], ['low', 'LOW', ZONE_COLORS.low]].map(([k, l, c]) => [k, l, c, zoneCounts[k] || 0])
                    : [['all', 'DOCUMENTED', ZONE_COLORS.documented, zoneProps.length], ['now', 'AT RISK NOW', AT_RISK_COLOR, atRiskCount]]
                  ).map(([k, l, c, n]) => (
                    <div key={k} style={{ background: c + '15', border: `1px solid ${c}30`, borderRadius: 6, padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{n}</div>
                      <div style={{ fontSize: 10, color: c + 'aa' }}>{l}</div>
                    </div>
                  ))}
                </div>
                {zonesError && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: -8, marginBottom: 16 }}>Flood areas couldn't be loaded.</div>
                )}

                {/* Map legend */}
                <details style={{ marginBottom: 16 }}>
                  <summary style={{ ...s.sectionLabel, cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-chevron-down" style={{ fontSize: 11 }} aria-hidden="true" /> Map Legend
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {legend.map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <div style={{ width: 12, height: 12, background: c, borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#666' }}>{l}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, fontSize: 10, color: '#444', lineHeight: 1.6 }}>
                      Weather: Open-Meteo · Live risk: FloodSafe model
                      {!showLevels && ' · Areas: OpenStreetMap, SPACE4ALL, WRI, DesInventar, UNOSAT'}
                    </div>
                  </div>
                </details>
            </div>

            {/* ── AI CHAT TAB ── (kept mounted so the conversation survives switching tabs) */}
            <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
                <div style={{ fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-sparkles" style={{ fontSize: 12 }} aria-hidden="true" />
                  AI Flood Assistant
                  {precipMm != null && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#EF9F27' }}>
                      {precipMm.toFixed(1)}mm/hr
                    </span>
                  )}
                </div>
                <AIChatPanel origin={chatTrip.origin} destination={chatTrip.destination} />
            </div>

          </div>
        </aside>

        {/* ── MAP ── */}
        <main style={{ flex: 1, position: 'relative' }}>
          <MapView
            floodZones={floodZones}
            onZoneClick={setSelectedZone}
            isAtRisk={isAtRisk}
            routePlan={routePlan}
            selectedRoute={selectedRoute}
            onSelectRoute={setSelectedRoute}
            hazardLayer={showHazard ? floodZones?.floodsafe?.hazard_layer : null}
          />
          {floodZones?.floodsafe?.hazard_layer && (
            <HazardToggle shown={showHazard} onToggle={setShowHazard} source={floodZones.floodsafe.sources?.space4all_model} />
          )}

          {/* Zone detail overlay */}
          {selectedZone && (
            <div style={s.zonePanel(zoneColor(selectedZone.risk))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{selectedZone.name}</span>
                <span style={{ marginLeft: 'auto', background: zoneColor(selectedZone.risk) + '20', color: zoneColor(selectedZone.risk), border: `1px solid ${zoneColor(selectedZone.risk)}50`, fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 700 }}>
                  {selectedZone.risk === 'documented' ? 'FLOODED BEFORE' : selectedZone.risk?.toUpperCase()}
                </span>
                <button onClick={() => setSelectedZone(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
                  <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#888', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ZoneEvidence zone={selectedZone} meta={floodZones?.floodsafe} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-droplet" style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
                  <span>Flood threshold: <span style={{ color: '#e8e8e8' }}>{selectedZone.rain_threshold != null ? `${selectedZone.rain_threshold}mm/hr` : 'not recorded'}</span></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-cloud-rain" style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
                  <span>Rain here now: <span style={{ color: '#e8e8e8' }}>{selectedRain != null ? `${selectedRain.toFixed(1)}mm/hr` : 'unknown'}</span></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-calendar" style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
                  <span>Rain over the last 3 days: <span style={{ color: '#e8e8e8' }}>{selectedReport?.rain_72h_mm != null ? `${selectedReport.rain_72h_mm.toFixed(1)}mm` : 'unknown'}</span></span>
                </div>
                {selectedZone.residents > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-users" style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
                    <span>Residents: <span style={{ color: '#e8e8e8' }}>{selectedZone.residents.toLocaleString()}</span></span>
                  </div>
                )}
                {selectedZone.notes && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <i className="ti ti-notes" style={{ fontSize: 13, color: '#555', marginTop: 1 }} aria-hidden="true" />
                    <span style={{ color: '#bbb' }}>{selectedZone.notes}</span>
                  </div>
                )}
                {selectedPrediction && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-chart-line" style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
                    <span>Model flood probability: <span style={{ color: zoneColor(selectedPrediction.risk_level.toLowerCase()) }}>
                      {(selectedPrediction.flood_probability * 100).toFixed(0)}% ({selectedPrediction.risk_level})
                    </span></span>
                  </div>
                )}
                {selectedOverThreshold != null && (
                  <div style={{
                    marginTop: 4, padding: '6px 8px', borderRadius: 6,
                    background: selectedOverThreshold ? '#E24B4A15' : '#1D9E7515',
                    border: `1px solid ${selectedOverThreshold ? '#E24B4A30' : '#1D9E7530'}`,
                    color: selectedOverThreshold ? '#E24B4A' : '#1D9E75',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className={`ti ${selectedOverThreshold ? 'ti-alert-triangle' : 'ti-circle-check'}`} style={{ fontSize: 13 }} aria-hidden="true" />
                    {selectedOverThreshold ? 'Currently exceeding flood threshold' : 'Below flood threshold right now'}
                  </div>
                )}
                <ZoneHistory zoneName={selectedZone.name} data={floodRecords} error={floodRecordsError} />
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
        <span style={s.tickerBadge(alertStatus.color)}>
          <i className={`ti ${alertStatus.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
          {alertStatus.label}
        </span>
        <div style={{ flex: 1, overflow: 'hidden' }} role="status" aria-live="polite">
          <span style={{ fontSize: 12, color: '#aaa', opacity: alertVisible ? 1 : 0, transition: 'opacity 0.4s', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ${currentAlertStyle.icon}`} style={{ fontSize: 12, color: currentAlertStyle.color, flexShrink: 0 }} aria-hidden="true" />
            {currentAlert.text}
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
  zonePanel: color => ({ position: 'absolute', top: 16, right: 16, width: 250, background: 'rgba(17,17,17,0.95)', backdropFilter: 'blur(8px)', border: `1px solid ${color}40`, borderRadius: 10, padding: 14, zIndex: 1000, maxHeight: 'calc(100% - 32px)', overflowY: 'auto', boxSizing: 'border-box' }),
  mapHint: { position: 'absolute', bottom: 20, left: 16, background: 'rgba(17,17,17,0.85)', backdropFilter: 'blur(4px)', border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#555', zIndex: 900, display: 'flex', alignItems: 'center', gap: 6 },
  ticker: { background: '#0d0d0d', borderTop: '1px solid #1e1e1e', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  tickerBadge: bg => ({ background: bg, color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 3, fontWeight: 700, letterSpacing: 1, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }),
};