// Shared ETL date math. Dates are ISO `YYYY-MM-DD` strings computed in UTC,
// mirroring src/time/dates.ts on the client.

/** Sortable `YYYYMMDD` integer for validity-interval filtering. */
export const dateNum = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y * 10000 + m * 100 + d;
};

/** `dateNum` stand-in for features without an end date. */
export const OPEN_END = 99999999;

export const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from `a` to `b` (b - a). Negative if b precedes a. */
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86_400_000);

/** Add `n` days to an ISO date, returning a new ISO date. */
export const addDays = (iso, n) => {
  const d = new Date(toUTC(iso) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
