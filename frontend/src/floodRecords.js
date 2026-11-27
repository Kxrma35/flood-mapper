// Wording for the real flood records from /api/records (see ZoneHistory.jsx).

const IMPACTS = [
  ['deaths', n => `${n} ${n === 1 ? 'death' : 'deaths'}`],
  ['missing', n => `${n} missing`],
  ['injured', n => `${n} injured`],
  ['people_affected', n => `${n.toLocaleString()} people affected`],
  ['evacuated', n => `${n.toLocaleString()} evacuated`],
  ['houses_destroyed', n => `${n.toLocaleString()} ${n === 1 ? 'house' : 'houses'} destroyed`],
  ['houses_damaged', n => `${n.toLocaleString()} ${n === 1 ? 'house' : 'houses'} damaged`],
];

export const describeImpacts = impacts =>
  IMPACTS.filter(([key]) => impacts?.[key]).map(([key, label]) => label(impacts[key])).join(', ');

export function formatRecordDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  if (!month) return String(year);
  const options = { month: 'short', year: 'numeric', timeZone: 'UTC', ...(day && { day: 'numeric' }) };
  return new Date(Date.UTC(year, month - 1, day || 1)).toLocaleDateString('en-GB', options);
}

// "6–7 Mar 2026" for a flood over several days, otherwise the single date.
export function formatRecordDates(record) {
  const { date, date_end: end } = record;
  if (!end || end === date) return formatRecordDate(date);
  if (date.slice(0, 7) === end.slice(0, 7)) return `${Number(date.slice(8))}–${formatRecordDate(end)}`;
  return `${formatRecordDate(date)} – ${formatRecordDate(end)}`;
}

export function satelliteSummary(zone, radiusKm) {
  if (!zone) return null;
  if (!zone.analysed) return 'Outside the area UNOSAT analysed.';
  if (zone.flooded_pct > 0) {
    const structures = zone.affected_structures
      ? `with ${zone.affected_structures.toLocaleString()} structures marked affected`
      : 'with no structures marked affected';
    return `About ${zone.flooded_pct}% of the area within ${radiusKm} km was under water, ${structures}.`;
  }
  const cloud = zone.cloud_pct >= 10 ? `, but ${Math.round(zone.cloud_pct)}% of it was hidden by cloud` : '';
  return `No standing water seen within ${radiusKm} km${cloud}.`;
}
