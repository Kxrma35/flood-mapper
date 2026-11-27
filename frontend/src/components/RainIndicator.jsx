// RainIndicator.jsx
// Shows live rainfall from Open-Meteo and a 6-hour forecast bar chart.
// Used in the sidebar. App fetches the weather and passes it in.

import { formatReading } from '../format';

// The forecast row is 40px tall and the hour labels take about 14px of it.
const BAR_MAX_PX = 26;

function getRiskLabel(mm) {
  if (mm == null) return { label: 'NO DATA', color: '#555' };
  if (mm >= 20) return { label: 'HIGH', color: '#E24B4A' };
  if (mm >= 10) return { label: 'MODERATE', color: '#EF9F27' };
  if (mm > 0)  return { label: 'LOW', color: '#639922' };
  return { label: 'NONE', color: '#555' };
}

export default function RainIndicator({ weather, error }) {
  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ color: '#555', fontSize: 12 }}>Weather unavailable</div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div style={styles.container}>
        <div style={{ color: '#444', fontSize: 12 }}>Fetching live weather...</div>
      </div>
    );
  }

  const mm = weather.current_mm_per_hour;
  const { label, color } = getRiskLabel(mm);
  const forecast = weather.forecast || [];
  const maxForecast = Math.max(...forecast.map(f => f.precipitation ?? 0), 1);

  return (
    <div style={styles.container}>
      {/* Current reading */}
      <div style={styles.row}>
        <span style={styles.bigNumber}>{formatReading(mm, v => v.toFixed(1))}</span>
        <span style={{ color: '#555', fontSize: 12 }}>mm/hr</span>
        <span style={{ ...styles.badge, background: color + '20', color, border: `1px solid ${color}40` }}>
          {label}
        </span>
      </div>

      {/* Progress bar */}
      <div style={styles.barTrack}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, ((mm ?? 0) / 50) * 100)}%`,
          background: `linear-gradient(90deg, #639922, #EF9F27, #E24B4A)`,
          borderRadius: 4,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <div style={styles.barLabels}>
        <span>0</span><span>Light</span><span>Heavy</span><span>50mm</span>
      </div>

      {/* 6-hour mini forecast */}
      <div style={{ marginTop: 12 }}>
        <div style={styles.sectionLabel}>6-hour forecast</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 40, marginTop: 6 }}>
          {forecast.map((f, i) => {
            const missing = f.precipitation == null;
            const h = missing ? `${BAR_MAX_PX}px` : `${Math.max(4, (f.precipitation / maxForecast) * BAR_MAX_PX)}px`;
            const { color: c } = getRiskLabel(f.precipitation);
            const hour = f.time.split('T')[1]?.slice(0, 5) || '';
            const bar = missing
              ? { border: '1px dashed #444', background: 'none' }
              : { background: c + '80' };
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div title={missing ? 'No data for this hour' : undefined} style={{ width: '100%', height: h, borderRadius: 2, boxSizing: 'border-box', ...bar }} />
                <span style={{ fontSize: 9, color: '#444' }}>{hour}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Secondary readings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
        {[
          ['ti-temperature', formatReading(weather.temperature_c, v => `${v.toFixed(1)}°C`)],
          ['ti-droplet', formatReading(weather.humidity_pct, v => `${v}%`)],
          ['ti-wind', formatReading(weather.wind_kmh, v => `${v} km/h`)],
          ['ti-cloud', weather.description],
        ].map(([icon, val]) => (
          <div key={icon} style={styles.metaItem}>
            <i className={`ti ${icon}`} style={{ fontSize: 13, color: '#555' }} aria-hidden="true" />
            <span style={{ color: '#aaa', fontSize: 11 }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12 },
  row: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 },
  bigNumber: { fontSize: 28, fontWeight: 700, color: '#e8e8e8' },
  badge: { marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 3, fontWeight: 700 },
  barTrack: { background: '#222', borderRadius: 4, height: 6, overflow: 'hidden' },
  barLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#444', marginTop: 4 },
  sectionLabel: { fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' },
  metaItem: { display: 'flex', alignItems: 'center', gap: 5 },
};