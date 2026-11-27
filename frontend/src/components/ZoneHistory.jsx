// Real flood history for one zone from /api/records: DesInventar reports matched by place
// name, and UNOSAT's satellite analysis of 1 May 2024. Both are incomplete, and the panel
// says so instead of letting an empty list read as "never floods".

import { describeImpacts, formatRecordDates, satelliteSummary } from '../floodRecords';

const row = { display: 'flex', alignItems: 'flex-start', gap: 6 };
const icon = { fontSize: 13, color: '#555', marginTop: 1 };
const link = { color: '#888', textDecoration: 'underline' };

export default function ZoneHistory({ zoneName, data, error }) {
  if (!data) {
    return (
      <div style={row}>
        <i className="ti ti-history" style={icon} aria-hidden="true" />
        <span>{error ? 'Flood records unavailable right now.' : 'Loading flood records...'}</span>
      </div>
    );
  }

  if (!Object.hasOwn(data.satellite_2024.zones, zoneName)) {
    return (
      <div style={row}>
        <i className="ti ti-history" style={icon} aria-hidden="true" />
        <span>Recorded floods have not been matched to this area yet.</span>
      </div>
    );
  }

  const records = data.records.filter(r => r.zone === zoneName);
  const satellite = satelliteSummary(data.satellite_2024.zones[zoneName], data.near_zone_m / 1000);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, paddingTop: 8, borderTop: '1px solid #ffffff10' }}>
      <div style={row}>
        <i className="ti ti-history" style={icon} aria-hidden="true" />
        <span style={{ color: '#bbb' }}>Recorded floods</span>
      </div>
      {records.length ? (
        records.map(r => (
          <div key={r.source_id} style={{ paddingLeft: 19 }}>
            <span style={{ color: '#e8e8e8' }}>{formatRecordDates(r)}</span>
            {r.place && <span> · {r.place}</span>}
            {/* News reports carry a fuller summary; DesInventar records are mostly figures. */}
            {(r.source === 'reports' ? r.description : describeImpacts(r.impacts) || r.description) && (
              <div style={{ color: '#bbb' }}>{r.source === 'reports' ? r.description : describeImpacts(r.impacts) || r.description}</div>
            )}
            {r.reported_by && <div style={{ color: '#666' }}>Reported by {r.reported_by}</div>}
            {r.links?.length > 0 && (
              <div style={{ color: '#666' }}>
                {r.links.map((l, i) => (
                  <span key={l.url}>{i > 0 && ', '}<a href={l.url} target="_blank" rel="noreferrer" style={link}>{l.publisher}</a></span>
                ))}
              </div>
            )}
          </div>
        ))
      ) : (
        <div style={{ paddingLeft: 19 }}>
          None found for this area. Flood reports are incomplete, so this doesn't mean it hasn't flooded here.
        </div>
      )}
      {satellite && (
        <div style={{ paddingLeft: 19 }}>
          <span style={{ color: '#bbb' }}>Satellite, 1 May 2024:</span> {satellite}
        </div>
      )}
      <div style={{ paddingLeft: 19, color: '#666' }}>
        Sources: <a href={data.sources.desinventar.url} target="_blank" rel="noreferrer" style={link}>DesInventar</a>,
        news reports (linked above),{' '}
        <a href={data.sources.unosat.url} target="_blank" rel="noreferrer" style={link}>UNOSAT</a> (preliminary)
      </div>
    </div>
  );
}
