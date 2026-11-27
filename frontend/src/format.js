// Shows "--" for a missing reading instead of a misleading 0 or "undefined".
export const formatReading = (value, format) => (value == null ? '--' : format(value));
