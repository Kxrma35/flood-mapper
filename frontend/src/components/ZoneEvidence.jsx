// Why a flood area is on the map, and what the SPACE4ALL flood model shows for it. Areas from
// an area dataset of your own have neither, so this shows nothing for them.

const NAMED_BY = {
  space4all_report: { label: "SPACE4ALL's 2024 flood report", source: 'space4all_report' },
  wri_brief: { label: "WRI's 2026 brief", source: 'wri_brief' },
};
const OTHER_EVIDENCE = {
  desinventar: 'Flood reports (DesInventar)',
  unosat: 'Flooding seen by satellite, 1 May 2024 (UNOSAT)',
};

const row = { display: 'flex', alignItems: 'flex-start', gap: 6 };
const icon = { fontSize: 13, color: '#555', marginTop: 1 };
const link = { color: '#bbb', textDecoration: 'underline' };

export default function ZoneEvidence({ zone, meta }) {
  if (!meta || !Array.isArray(zone.evidence)) return null;

  const reasons = [
    ...zone.evidence.filter(e => NAMED_BY[e]).map(e => (
      <span key={e}>
        named among the worst-hit in{' '}
        <a href={meta.sources[NAMED_BY[e].source].url} target="_blank" rel="noreferrer" style={link}>{NAMED_BY[e].label}</a>
      </span>
    )),
    ...zone.evidence.filter(e => OTHER_EVIDENCE[e]).map(e => <span key={e}>{OTHER_EVIDENCE[e]}</span>),
  ];
  const km = meta.radius_m / 1000;
  const model = meta.sources.space4all_model;

  return (
    <>
      <div style={row}>
        <i className="ti ti-file-search" style={icon} aria-hidden="true" />
        <span>
          On the map because of:{' '}
          <span style={{ color: '#bbb' }}>
            {reasons.map((reason, i) => <span key={i}>{i > 0 && '; '}{reason}</span>)}
          </span>
        </span>
      </div>
      <div style={row}>
        <i className="ti ti-ripple" style={icon} aria-hidden="true" />
        {zone.hazard ? (
          <span>
            Modelled flooding within {km} km in a long storm: <span style={{ color: '#e8e8e8' }}>{zone.hazard.wet_pct}%</span> of land deeper
            than 10 cm, <span style={{ color: '#e8e8e8' }}>{zone.hazard.deep_pct}%</span> deeper than 1 m (Nairobi: {meta.city_hazard.wet_pct}% and{' '}
            {meta.city_hazard.deep_pct}%). The <a href={model.url} target="_blank" rel="noreferrer" style={link}>model</a> ignores drains, so it can
            miss flooding where drainage is poor.
          </span>
        ) : (
          <span>Outside the area the SPACE4ALL flood model covers.</span>
        )}
      </div>
    </>
  );
}
