// RoutePanel.jsx
// Route check: real road routes from OpenRouteService, checked against the flood zones.

import { useState } from 'react';
import { planRoute, formatDistance, formatDuration } from '../routePlanner';

const QUICK_CHECKS = ['Westlands', 'Eastlands', 'Kibera', 'Buruburu'];
const RISK_COLORS = { high: '#E24B4A', medium: '#EF9F27', low: '#639922' };

function names(zones) {
  const list = zones.map(z => z.properties.name);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0];
}
const isAre = zones => (zones.length > 1 ? 'are' : 'is');

export default function RoutePanel({ zones, isAtRisk, zonesAreSample, plan, onPlan, selected, onSelect, onAskAI }) {
  const [fromText, setFromText] = useState('Westlands');
  const [toText, setToText] = useState('CBD');
  const [fromPoint, setFromPoint] = useState(null);
  const [mode, setMode] = useState('drive');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [showSteps, setShowSteps] = useState(false);

  async function check({ from = fromPoint ?? fromText, to = toText, avoidHighRisk = false } = {}) {
    if (!zones) return;
    setLoading(true);
    setError(null);
    try {
      const result = await planRoute({ from, to, mode, zones, isAtRisk, avoidHighRisk });
      onPlan(result);
      onSelect(result.safer ? 'safer' : 'fastest');
      setShowSteps(false);
    } catch (err) {
      setError(err.message);
      onPlan(null);
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setFromPoint({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'My location' });
        setFromText('My location');
        setLocating(false);
      },
      () => {
        setError('Location permission was denied or unavailable. Type a starting point instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const route = plan && (selected === 'safer' && plan.safer ? plan.safer : plan.fastest);
  const isEndpoint = z => plan.startZones.includes(z) || plan.endZones.includes(z);
  const riskyOnRoute = route ? route.zones.filter(z => !isEndpoint(z) && isAtRisk(z.properties)) : [];
  const riskyStart = plan ? plan.startZones.filter(z => isAtRisk(z.properties)) : [];
  const riskyEnd = plan ? plan.endZones.filter(z => isAtRisk(z.properties)) : [];
  const highOnRoute = route ? route.zones.filter(z => !isEndpoint(z) && z.properties.risk === 'high') : [];

  return (
    <>
      <div style={st.sectionLabel}>Check Route Safety</div>

      <div style={st.inputBox}>
        <i className="ti ti-map-pin" style={{ fontSize: 15, color: '#1D9E75', flexShrink: 0 }} aria-hidden="true" />
        <input value={fromText} aria-label="Starting point" placeholder="From (e.g. Westlands)" style={st.textInput}
          onChange={e => { setFromText(e.target.value); setFromPoint(null); }} />
        <button onClick={useMyLocation} disabled={locating} title="Use my location" aria-label="Use my location" style={st.iconBtn}>
          <i className={`ti ${locating ? 'ti-loader-2' : 'ti-current-location'}`} style={{ fontSize: 15 }} aria-hidden="true" />
        </button>
      </div>

      <div style={st.inputBox}>
        <i className="ti ti-flag" style={{ fontSize: 15, color: '#EF9F27', flexShrink: 0 }} aria-hidden="true" />
        <input value={toText} aria-label="Destination" placeholder="To (e.g. JKIA)" style={st.textInput}
          onChange={e => setToText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') check(); }} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }} role="radiogroup" aria-label="Travel mode">
        {[['drive', 'ti-car', 'Drive'], ['walk', 'ti-walk', 'Walk']].map(([id, icon, label]) => (
          <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
            style={{ ...st.modeBtn, ...(mode === id ? st.modeBtnActive : {}) }}>
            <i className={`ti ${icon}`} style={{ fontSize: 13 }} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <button onClick={() => check()} disabled={loading || !zones} style={{ ...st.checkBtn, opacity: loading ? 0.7 : 1 }}>
        <i className={`ti ${loading ? 'ti-loader-2' : 'ti-shield-check'}`} style={{ fontSize: 15 }} aria-hidden="true" />
        {loading ? 'Checking route...' : 'Check Route Safety'}
      </button>

      {error && <div style={st.notice('#E24B4A')} role="alert">{error}</div>}

      {plan && route && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8, lineHeight: 1.5 }}>
            <div><span style={{ color: '#1D9E75' }}>From</span> {plan.from.label}</div>
            <div><span style={{ color: '#EF9F27' }}>To</span> {plan.to.label}</div>
          </div>

          {[['fastest', plan.fastest, 'Fastest route'], ['safer', plan.safer, 'Safer route']]
            .filter(([, r]) => r)
            .map(([key, r, title]) => (
              <button key={key} onClick={() => onSelect(key)} aria-pressed={selected === key}
                style={{ ...st.routeCard, ...(selected === key ? st.routeCardActive : {}) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 700, color: '#e8e8e8' }}>{title}</span>
                  <span style={{ color: '#aaa', whiteSpace: 'nowrap' }}>{formatDuration(r.durationS)} · {formatDistance(r.distanceM)}</span>
                </div>
                {key === 'safer' && (
                  <div style={{ color: '#888', marginTop: 2 }}>
                    Avoids {names(plan.avoided)} · {r.durationS > plan.fastest.durationS
                      ? `${formatDuration(r.durationS - plan.fastest.durationS)} longer`
                      : 'no slower'}
                  </div>
                )}
              </button>
            ))}

          {riskyOnRoute.length > 0 && (
            <div style={st.notice('#E24B4A')}>This route passes through {names(riskyOnRoute)}, which {isAre(riskyOnRoute)} at flood risk right now.</div>
          )}
          {riskyStart.length > 0 && (
            <div style={st.notice('#E24B4A')}>Your starting point is in {names(riskyStart)}, which {isAre(riskyStart)} at flood risk right now.</div>
          )}
          {riskyEnd.length > 0 && (
            <div style={st.notice('#E24B4A')}>Your destination is in {names(riskyEnd)}, which {isAre(riskyEnd)} at flood risk right now.</div>
          )}
          {plan.saferError && (
            <div style={st.notice('#EF9F27')}>Couldn't find a route around {names(plan.avoided)}: {plan.saferError}</div>
          )}
          {riskyOnRoute.length === 0 && riskyStart.length === 0 && riskyEnd.length === 0 && (
            <div style={st.notice('#1D9E75')}>
              {route.zones.length
                ? `None of the flood zones on this route (${names(route.zones)}) is at risk right now.`
                : 'This route does not pass through any mapped flood zone.'}
              {zonesAreSample && ' Zone data is sample data.'}
            </div>
          )}

          {!plan.avoidHighRisk && !plan.safer && highOnRoute.length > 0 && (
            <button onClick={() => check({ from: plan.from, to: plan.to, avoidHighRisk: true })} disabled={loading} style={st.secondaryBtn}>
              <i className="ti ti-route" style={{ fontSize: 13 }} aria-hidden="true" /> Find a route around high-risk zones
            </button>
          )}

          {route.zones.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
              {route.zones.map(z => {
                const color = RISK_COLORS[z.properties.risk] ?? '#888';
                return (
                  <span key={z.properties.name} style={st.chip(color)}>
                    {z.properties.name} · {String(z.properties.risk).toUpperCase()}{isAtRisk(z.properties) ? ' · AT RISK NOW' : ''}
                  </span>
                );
              })}
            </div>
          )}

          <button onClick={() => onAskAI(plan.from.label, plan.to.label)} style={st.secondaryBtn}>
            <i className="ti ti-message-circle" style={{ fontSize: 13 }} aria-hidden="true" /> Ask the AI about this trip
          </button>

          {route.steps.length > 0 && (
            <>
              <button onClick={() => setShowSteps(v => !v)} aria-expanded={showSteps} style={st.secondaryBtn}>
                <i className={`ti ${showSteps ? 'ti-chevron-up' : 'ti-list'}`} style={{ fontSize: 13 }} aria-hidden="true" />
                {showSteps ? 'Hide directions' : `Directions (${route.steps.length} steps)`}
              </button>
              {showSteps && (
                <ol style={st.steps}>
                  {route.steps.map((step, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {step.instruction}
                      {step.distanceM > 0 && <span style={{ color: '#555' }}> · {formatDistance(step.distanceM)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          <div style={{ fontSize: 10, color: '#444', marginTop: 8, lineHeight: 1.5 }}>
            Routes by openrouteservice.org from OpenStreetMap data. No live traffic, so times are estimates.
          </div>
        </div>
      )}

      <div style={{ ...st.sectionLabel, marginTop: 16 }}>Quick Checks</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
        {QUICK_CHECKS.map(q => (
          <button key={q} disabled={loading} style={st.quickBtn}
            onClick={() => { setFromText(q); setFromPoint(null); setToText('CBD'); check({ from: q, to: 'CBD' }); }}>
            <i className="ti ti-arrow-right" style={{ fontSize: 11 }} aria-hidden="true" /> {q} to CBD
          </button>
        ))}
      </div>
    </>
  );
}

const st = {
  sectionLabel: { fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  inputBox: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
  textInput: { background: 'none', border: 'none', outline: 'none', color: '#e8e8e8', fontSize: 13, width: '100%', fontFamily: 'inherit' },
  iconBtn: { background: 'none', border: 'none', color: '#1D9E75', cursor: 'pointer', padding: 0, display: 'flex' },
  modeBtn: { flex: 1, padding: '6px 8px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#555', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 },
  modeBtnActive: { background: '#222', color: '#e8e8e8', border: '1px solid #3a3a3a' },
  checkBtn: { width: '100%', padding: 11, background: '#EF9F27', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  routeCard: { width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 6, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#aaa' },
  routeCardActive: { border: '1px solid #1D9E75', background: '#1D9E7512' },
  notice: color => ({ marginTop: 6, padding: '6px 8px', borderRadius: 6, fontSize: 11, lineHeight: 1.5, background: color + '15', border: `1px solid ${color}30`, color }),
  chip: color => ({ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: color + '20', color, border: `1px solid ${color}40` }),
  secondaryBtn: { width: '100%', marginTop: 6, padding: '7px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 },
  steps: { margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: '#bbb', lineHeight: 1.5 },
  quickBtn: { padding: '8px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#1D9E75', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 },
};
