// Date helpers. All dates are ISO 'YYYY-MM-DD' strings handled as calendar days
// (no time component) to avoid timezone drift in aggregation.
//
// CRITICAL (S7.3): YouTube Analytics reports days in America/Los_Angeles. So the
// "today" we cap the revenue backfill at must be LA's today, not the machine's.

const LA_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date in America/Los_Angeles (YouTube's reporting day). */
export function todayLA(now = new Date()) {
  return LA_FMT.format(now); // en-CA → YYYY-MM-DD
}

/** Today's calendar date in UTC (used for FX / Hotmart which are not LA-based). */
export function todayUTC(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isValidDate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Add `n` days to an ISO date (can be negative). Handles DST/leap via UTC math. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day count between two ISO dates (b - a + 1). */
export function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** 'YYYY-MM' bucket for an ISO date. */
export function monthKey(dateStr) {
  return String(dateStr).slice(0, 7);
}

/** First day 'YYYY-MM-01' of a month key. */
export function monthStart(mk) {
  return `${mk}-01`;
}

/** Last day of a month key (leap-year safe). */
export function monthEnd(mk) {
  const [y, m] = mk.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last of this
  return `${mk}-${String(last).padStart(2, '0')}`;
}

/** Inclusive list of 'YYYY-MM' months spanning [from, to]. */
export function monthsBetween(from, to) {
  const out = [];
  let [y, m] = monthKey(from).split('-').map(Number);
  const [ty, tm] = monthKey(to).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Split [start, end] into inclusive chunks of at most `size` days.
 * Used for the lifetime backfill so each API call stays small (R7).
 */
export function chunkDateRange(start, end, size) {
  if (daysBetween(start, end) < 0) return [];
  const chunks = [];
  let from = start;
  while (daysBetween(from, end) >= 0) {
    let to = addDays(from, size - 1);
    if (daysBetween(to, end) > 0) to = end;
    chunks.push({ from, to });
    from = addDays(to, 1);
  }
  return chunks;
}

/** Clamp `date` to not exceed `max`. */
export function minDate(date, max) {
  return daysBetween(date, max) < 0 ? date : max;
}
