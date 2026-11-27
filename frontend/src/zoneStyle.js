// Zone colours, shared by the map, the zone panel and the route check. FloodSafe's own flood
// areas are "documented" (they have evidence of flooding but no risk level); an area dataset
// of your own can give each zone a high, medium or low level instead.

export const ZONE_COLORS = { high: '#E24B4A', medium: '#EF9F27', low: '#639922', documented: '#3E8ED0' };
export const AT_RISK_COLOR = '#E24B4A';
export const LEVELS = ['high', 'medium', 'low'];

export const zoneColor = risk => ZONE_COLORS[risk] ?? '#888';
export const hasRiskLevels = zones => zones.some(z => LEVELS.includes(z.risk));
