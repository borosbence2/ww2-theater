// Date math for the timeline. Dates are handled as ISO `YYYY-MM-DD` strings and
// computed in UTC to avoid timezone drift across day boundaries.

/** First day shown on the timeline (German invasion of Poland). */
export const TIMELINE_START = '1939-09-01';
/** Last day shown on the timeline (formal surrender of Japan / VJ-Day). */
export const TIMELINE_END = '1945-09-02';
/** Default date when no `?date=` is present in the URL. */
export const DEFAULT_DATE = '1939-09-01';

const MS_PER_DAY = 86_400_000;

function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from `a` to `b` (b - a). Negative if b precedes a. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / MS_PER_DAY);
}

/** Add `n` days to an ISO date, returning a new ISO date. */
export function addDays(iso: string, n: number): string {
  return fromUTC(toUTC(iso) + n * MS_PER_DAY);
}

/** Clamp an ISO date into the [TIMELINE_START, TIMELINE_END] range. */
export function clampDate(iso: string): string {
  if (toUTC(iso) < toUTC(TIMELINE_START)) return TIMELINE_START;
  if (toUTC(iso) > toUTC(TIMELINE_END)) return TIMELINE_END;
  return iso;
}

/** True if the string is a valid `YYYY-MM-DD` date. */
export function isValidDate(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = toUTC(iso);
  return !Number.isNaN(t) && fromUTC(t) === iso;
}

/** Total number of slider steps (days) across the timeline. */
export const TOTAL_DAYS = diffDays(TIMELINE_START, TIMELINE_END);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Human-readable date, e.g. "1 September 1939". */
export function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
