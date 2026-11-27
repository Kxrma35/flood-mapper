// Switch and key for the modelled flood-depth layer (SPACE4ALL's FASTFLOOD map of Nairobi).

const KEY = [
  ['rgba(79, 195, 247, 0.55)', '10 cm to 1 m'],
  ['rgba(13, 71, 161, 0.85)', 'Over 1 m'],
  ['rgba(255, 255, 255, 0.1)', 'Under 10 cm (clear: not modelled)'],
];

const box = {
  position: 'absolute', top: 16, left: 16, zIndex: 900, maxWidth: 240,
  background: 'rgba(17,17,17,0.9)', backdropFilter: 'blur(4px)', border: '1px solid #2a2a2a',
  borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#888',
};

export default function HazardToggle({ shown, onToggle, source }) {
  return (
    <div style={box}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: shown ? '#e8e8e8' : '#888' }}>
        <input type="checkbox" checked={shown} onChange={e => onToggle(e.target.checked)} />
        Modelled flood depth
      </label>
      {shown && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {KEY.map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: color, border: '1px solid #444', flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <div style={{ color: '#666', lineHeight: 1.5 }}>
            One 10–12 hour storm, modelled on a 100 m grid. It ignores drains and wasn't calibrated, so real flooding can be
            worse, for example where drainage is poor.{' '}
            {source && <a href={source.url} target="_blank" rel="noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>SPACE4ALL, CC BY 4.0</a>}
          </div>
        </div>
      )}
    </div>
  );
}
