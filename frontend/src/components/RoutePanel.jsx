// RoutePanel.jsx
// Route check: real road routes from OpenRouteService, checked against the flood zones.

import { useRef, useState } from 'react';
import PlaceInput from './PlaceInput';
import { planRoute, formatDistance, formatDuration } from '../routePlanner';
import { zoneCenter } from '../geometry';
import { LEVELS, zoneColor } from '../zoneStyle';

// Quick checks start and end at the map's own zones, so they never depend on place search;
// any that aren't on the map are left out.
const QUICK_FROM = ['Kibera', 'Mathare', 'Korogocho', 'Mukuru Kwa Njenga'];
const QUICK_TO = 'CBD';
const EMPTY = { text: '', place: null };

function names(zones) {
  const list = zones.map(z => z.properties.name);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0];
}
const isAre = zones => (zones.length > 1 ? 'are' : 'is');

export default function RoutePanel({ zones, isAtRisk, isRiskKnown, plan, onPlan, selected, onSelect, onAskAI }) {
  const [from, setFrom] = useState(EMPTY);
  const [to, setTo] = useState(EMPTY);
  const [typed, setTyped] = useState({ from: false, to: false });
  const latestCheck = useRef(0);
  const fromVersion = useRef(0);
  const [mode, setMode] = useState('drive');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [showSteps, setShowSteps] = useState(false);

  // Each end is a picked place ({ label, lat, lon }) or, failing that, the typed text.
  async function check({ start = from, end = to, avoidHighRisk = false } = {}) {
    if (!zones) return;
    const origin = start.place ?? start.text.trim();
    const destination = end.place ?? end.text.trim();
    if (!origin || !destination) {
      setError(!origin ? 'Choose a starting point.' : 'Choose a destination.');
      return;
    }
    // Only the latest check may update the panel; an older, slower one is dropped.
    const request = ++latestCheck.current;
    setLoading(true);
    setError(null);
    try {
      const result = await planRoute({ from: origin, to: destination, mode, zones, isAtRisk, avoidHighRisk });
      if (request !== latestCheck.current) return;
      setTyped({ from: !start.place, to: !end.place });
      onPlan(result);
      onSelect(result.safer ? 'safer' : 'fastest');
      setShowSteps(false);
    } catch (err) {
      if (request !== latestCheck.current) return;
      setError(err.message);
      onPlan(null);
    } finally {
      if (request === latestCheck.current) setLoading(false);
    }
  }

  // Changing the trip makes any shown route (and any check in flight) out of date.
  function tripChanged() {
    latestCheck.current++;
    setLoading(false);
    setError(null);
    if (plan) onPlan(null);
  }
  const changeFrom = value => { fromVersion.current++; setFrom(value); tripChanged(); };
  const changeTo = value => { setTo(value); tripChanged(); };
  const changeMode = value => { if (value !== mode) { setMode(value); tripChanged(); } };

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setError(null);
    const version = fromVersion.current;
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        if (fromVersion.current !== version) return; // the start was changed meanwhile
        changeFrom({ text: 'My location', place: { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'My location' } });
      },
      () => {
        setLocating(false);
        if (fromVersion.current !== version) return;
        setError('Location permission was denied or unavailable. Type a starting point instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const zonePlace = name => {
    const zone = zones?.find(z => z.properties.name === name);
    const center = zone && zoneCenter(zone.geometry);
    return center ? { label: name, lat: center[1], lon: center[0] } : null;
  };
  const quickTo = zonePlace(QUICK_TO);
  const quickFrom = quickTo ? QUICK_FROM.map(zonePlace).filter(Boolean) : [];

  const route = plan && (selected === 'safer' && plan.safer ? plan.safer : plan.fastest);
  const isEndpoint = z => plan.startZones.includes(z) || plan.endZones.includes(z);
  const riskyOnRoute = route ? route.zones.filter(z => !isEndpoint(z) && isAtRisk(z.properties)) : [];
  const riskyStart = plan ? plan.startZones.filter(z => isAtRisk(z.properties)) : [];
  const riskyEnd = plan ? plan.endZones.filter(z => isAtRisk(z.properties)) : [];
  const highOnRoute = route ? route.zones.filter(z => !isEndpoint(z) && z.properties.risk === 'high') : [];
  const unknownOnRoute = route ? route.zones.filter(z => !isRiskKnown(z.properties)) : [];
  const riskNow = plan ? plan.fastest.zones.filter(z => isAtRisk(z.properties)).map(z => z.properties.name).sort().join('|') : '';
  const stale = plan && riskNow !== plan.riskAtCheck;
  const recheck = () => check({ start: { text: plan.from.label, place: plan.from }, end: { text: plan.to.label, place: plan.to }, avoidHighRisk: plan.avoidHighRisk });

  return (
    <>
      <div style={st.sectionLabel}>Check Route Safety</div>

      <PlaceInput value={from} onChange={changeFrom} onSubmit={() => check()} label="Starting point"
        placeholder="From (e.g. Westlands)" icon="ti-map-pin" iconColor="#1D9E75">
        <button onClick={useMyLocation} disabled={locating} title="Use my location" aria-label="Use my location" style={st.iconBtn}>
          <i className={`ti ${locating ? 'ti-loader-2' : 'ti-current-location'}`} style={{ fontSize: 15 }} aria-hidden="true" />
        </button>
      </PlaceInput>

      <PlaceInput value={to} onChange={changeTo} onSubmit={() => check()} label="Destination"
        placeholder="To (e.g. JKIA)" icon="ti-flag" iconColor="#EF9F27" />

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }} role="radiogroup" aria-label="Travel mode">
        {[['drive', 'ti-car', 'Drive'], ['walk', 'ti-walk', 'Walk']].map(([id, icon, label]) => (
          <button key={id} role="radio" aria-checked={mode === id} onClick={() => changeMode(id)}
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
            {(typed.from || typed.to) && (
              <div style={{ color: '#666', marginTop: 2 }}>
                Matched your typed {typed.from && typed.to ? 'places' : typed.from ? 'starting point' : 'destination'} to the closest name found.
                If that is the wrong place, pick it from the suggestions instead.
              </div>
            )}
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
            <div style={st.notice('#EF9F27')}>Couldn't find a route around {names(plan.wanted)}: {plan.saferError}</div>
          )}
          {stale && (
            <div style={st.notice('#EF9F27')}>
              Flood risk along this route has changed since it was checked.{' '}
              <button onClick={recheck} disabled={loading} style={st.linkBtn}>Check again</button>
            </div>
          )}
          {unknownOnRoute.length > 0 && (
            <div style={st.notice('#888')}>Flood risk for {names(unknownOnRoute)} can't be checked right now, because live data is unavailable.</div>
          )}
          {riskyOnRoute.length === 0 && riskyStart.length === 0 && riskyEnd.length === 0 && unknownOnRoute.length === 0 && (
            <div style={st.notice('#1D9E75')}>
              {route.zones.length
                ? `None of the flood zones on this route (${names(route.zones)}) is at risk right now.`
                : 'This route does not pass through any mapped flood zone.'}
            </div>
          )}

          {!plan.avoidHighRisk && !plan.safer && highOnRoute.length > 0 && (
            <button onClick={() => check({ start: { text: plan.from.label, place: plan.from }, end: { text: plan.to.label, place: plan.to }, avoidHighRisk: true })} disabled={loading} style={st.secondaryBtn}>
              <i className="ti ti-route" style={{ fontSize: 13 }} aria-hidden="true" /> Find a route around high-risk zones
            </button>
          )}

          {route.zones.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
              {route.zones.map(z => {
                const level = LEVELS.includes(z.properties.risk) ? ` · ${z.properties.risk.toUpperCase()}` : '';
                return (
                  <span key={z.properties.name} style={st.chip(zoneColor(z.properties.risk))}>
                    {z.properties.name}{level}{isAtRisk(z.properties) ? ' · AT RISK NOW' : ''}
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
        {quickFrom.map(place => (
          <button key={place.label} disabled={loading} style={st.quickBtn}
            onClick={() => {
              const start = { text: place.label, place };
              const end = { text: quickTo.label, place: quickTo };
              changeFrom(start);
              changeTo(end);
              check({ start, end });
            }}>
            <i className="ti ti-arrow-right" style={{ fontSize: 11 }} aria-hidden="true" /> {place.label} to {quickTo.label}
          </button>
        ))}
      </div>
    </>
  );
}

const st = {
  sectionLabel: { fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  iconBtn: { background: 'none', border: 'none', color: '#1D9E75', cursor: 'pointer', padding: 0, display: 'flex' },
  modeBtn: { flex: 1, padding: '6px 8px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#555', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 },
  modeBtnActive: { background: '#222', color: '#e8e8e8', border: '1px solid #3a3a3a' },
  checkBtn: { width: '100%', padding: 11, background: '#EF9F27', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  routeCard: { width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 6, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#aaa' },
  routeCardActive: { border: '1px solid #1D9E75', background: '#1D9E7512' },
  notice: color => ({ marginTop: 6, padding: '6px 8px', borderRadius: 6, fontSize: 11, lineHeight: 1.5, background: color + '15', border: `1px solid ${color}30`, color }),
  chip: color => ({ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: color + '20', color, border: `1px solid ${color}40` }),
  linkBtn: { background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' },
  secondaryBtn: { width: '100%', marginTop: 6, padding: '7px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 },
  steps: { margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: '#bbb', lineHeight: 1.5 },
  quickBtn: { padding: '8px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#1D9E75', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 },
};
