// FX rate sync from Frankfurter (ECB, free, no key). Stored EUR-based; the
// engine crosses through EUR. Weekends/holidays are absent → converter falls
// back to the last available rate (S4.1).
import { startRun, finishRun } from './syncLog.js';
import { todayUTC, addDays } from '../util/dates.js';
import { log } from '../logger.js';

const HOST = 'https://api.frankfurter.app';
const QUOTES = ['USD', 'BRL'];
const defaultTransport = (url, opts) => fetch(url, opts);

/** Fetch EUR-based rates for [from, to]. Returns { 'YYYY-MM-DD': {USD, BRL} }. */
export async function fetchFxRange(from, to, transport = defaultTransport) {
  const url = `${HOST}/${from}..${to}?from=EUR&to=${QUOTES.join(',')}`;
  const res = await transport(url);
  if (!res.ok) throw new Error(`Frankfurter falhou (${res.status})`);
  const body = await res.json();
  return body.rates || {};
}

/** Fetch the latest available rates. Returns { date, rates:{USD,BRL} }. */
export async function fetchFxLatest(transport = defaultTransport) {
  const res = await transport(`${HOST}/latest?from=EUR&to=${QUOTES.join(',')}`);
  if (!res.ok) throw new Error(`Frankfurter latest falhou (${res.status})`);
  const body = await res.json();
  return { date: body.date, rates: body.rates || {} };
}

/** Idempotent upsert of a {date:{quote:rate}} map. Returns rows written. */
export function upsertFx(db, ratesByDate) {
  const stmt = db.prepare(`INSERT INTO fx_rates (date, base, quote, rate) VALUES (?, 'EUR', ?, ?)
    ON CONFLICT(date, base, quote) DO UPDATE SET rate = excluded.rate`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const [date, quotes] of Object.entries(ratesByDate)) {
      for (const [quote, rate] of Object.entries(quotes)) {
        stmt.run(date, quote, rate);
        n++;
      }
    }
  });
  tx();
  return n;
}

/** Earliest date any money exists for, so backfill covers every transaction. */
function earliestNeededDate(db) {
  const candidates = [
    db.prepare('SELECT MIN(launch_date) d FROM channels').get()?.d,
    db.prepare('SELECT MIN(order_date) d FROM sales').get()?.d,
    db.prepare('SELECT MIN(start_date) d FROM costs').get()?.d,
    db.prepare('SELECT MIN(date) d FROM revenue_daily').get()?.d,
  ].filter(Boolean);
  return candidates.length ? candidates.sort()[0] : addDays(todayUTC(), -30);
}

/**
 * Sync FX.
 * mode 'backfill' → from earliest needed date to today.
 * mode 'incremental' → last 10 days (fills weekend gaps + newest rate).
 */
export async function syncFx(db, { mode = 'incremental', transport } = {}) {
  const to = todayUTC();
  const from = mode === 'backfill' ? earliestNeededDate(db) : addDays(to, -10);
  const runId = startRun(db, 'fx', mode);
  try {
    const rates = await fetchFxRange(from, to, transport);
    const n = upsertFx(db, rates);
    finishRun(db, runId, { status: 'ok', rowsUpserted: n, message: `${mode} ${from}→${to}` });
    return { rows: n, from, to, mode };
  } catch (e) {
    finishRun(db, runId, { status: 'error', message: e.message });
    log.error(`FX sync falhou: ${e.message}`);
    throw e;
  }
}
