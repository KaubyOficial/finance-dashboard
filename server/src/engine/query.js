// DB adapter over the pure P&L engine: loads rows, builds the FX converter,
// computes cells, filters, aggregates, and caches by (params, dataVersion).
// The cache is invalidated by bumpDataVersion() after any sync or cost change (S8.1).
import { computePnL, buildCells, aggregate, UNATTRIBUTED } from './pnl.js';
import { withDerived } from './derived.js';
import { makeConverter } from './fx.js';
import { addDays, daysBetween } from '../util/dates.js';

let dataVersion = 1;
const cache = new Map();

export function bumpDataVersion() {
  dataVersion += 1;
  cache.clear();
}

export function loadInputs(db, { from, to }) {
  const channels = db
    .prepare('SELECT id, name, launch_date, reference_currency, active, monetized FROM channels ORDER BY id')
    .all();
  const revenue = db
    .prepare('SELECT channel_id, date, currency, estimated_revenue, estimated_ad_revenue, views, provisional FROM revenue_daily WHERE date BETWEEN ? AND ?')
    .all(from, to);
  const sales = db
    .prepare(
      `SELECT transaction_id, channel_id, commission_amount, commission_currency, order_date, refund_amount, refund_date, status
       FROM sales
       WHERE (order_date BETWEEN ? AND ?) OR (refund_date BETWEEN ? AND ?)`
    )
    .all(from, to, from, to);
  const costs = db.prepare('SELECT * FROM costs').all();
  const fx = db.prepare('SELECT date, base, quote, rate FROM fx_rates').all();
  return { channels, revenue, sales, costs, fx };
}

/**
 * Full P&L query. `channels` (array of ids) filters the OUTPUT only — allocation
 * of shared costs always uses the whole active network so denominators are right.
 */
export function getPnL(db, { from, to, displayCurrency = 'USD', groupBy = 'month', channels = null } = {}) {
  const key = JSON.stringify({ from, to, displayCurrency, channels: channels ? [...channels].sort() : null, groupBy, dataVersion });
  if (cache.has(key)) return cache.get(key);

  const inputs = loadInputs(db, { from, to });
  const convert = makeConverter(inputs.fx);
  const names = Object.fromEntries(inputs.channels.map((c) => [c.id, c.name]));

  const allCells = buildCells(inputs, { from, to, displayCurrency, convert });
  const filter = channels && channels.length ? new Set(channels) : null;
  const cells = filter
    ? allCells.filter((c) => (c.channel_id === null ? filter.has(UNATTRIBUTED) : filter.has(c.channel_id)))
    : allCells;

  const byMonth = withDerived(aggregate(cells, 'month', { channelNames: names }).map((l) => ({ ...l, currency: displayCurrency })));
  const byChannel = withDerived(aggregate(cells, 'channel', { channelNames: names }).map((l) => ({ ...l, currency: displayCurrency })));
  const network = withDerived(aggregate(cells, 'network'))[0] || null;
  if (network) network.currency = displayCurrency;

  // Previous period (same length, immediately before `from`) for deltas.
  const span = daysBetween(from, to); // inclusive length-1
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -span);
  const prevInputs = loadInputs(db, { from: prevFrom, to: prevTo });
  const prevConvert = makeConverter(prevInputs.fx.length ? prevInputs.fx : inputs.fx);
  const prevCells = safeCells(prevInputs, { from: prevFrom, to: prevTo, displayCurrency, convert: prevConvert }, filter);
  const prevNetwork = aggregate(prevCells, 'network')[0] || null;

  const result = {
    from,
    to,
    currency: displayCurrency,
    groupBy,
    rows: groupBy === 'channel' ? byChannel : byMonth,
    byMonth,
    byChannel,
    network,
    previous: prevNetwork ? { from: prevFrom, to: prevTo, ...prevNetwork } : null,
  };
  cache.set(key, result);
  return result;
}

function safeCells(inputs, opts, filter) {
  let cells;
  try {
    cells = buildCells(inputs, opts);
  } catch {
    return [];
  }
  if (!filter) return cells;
  return cells.filter((c) => (c.channel_id === null ? filter.has(UNATTRIBUTED) : filter.has(c.channel_id)));
}

/**
 * Day-by-day REVENUE (no costs): AdSense + Hotmart commissions (by order date)
 * − refunds (by refund date), converted to the display currency at each day's
 * rate. Only days with movement are returned (ascending), each with a
 * per-channel breakdown. Cached like getPnL.
 */
export function getDailyRevenue(db, { from, to, displayCurrency = 'USD', channels = null } = {}) {
  const key = JSON.stringify({ daily: true, from, to, displayCurrency, channels: channels ? [...channels].sort() : null, dataVersion });
  if (cache.has(key)) return cache.get(key);

  const inputs = loadInputs(db, { from, to });
  const convert = makeConverter(inputs.fx);
  const names = Object.fromEntries(inputs.channels.map((c) => [c.id, c.name]));
  const filter = channels && channels.length ? new Set(channels) : null;
  const wanted = (chId) => !filter || filter.has(chId ?? UNATTRIBUTED);

  const days = new Map(); // date -> { date, provisional, channels: Map }
  const day = (date) => {
    if (!days.has(date)) days.set(date, { date, provisional: false, channels: new Map() });
    return days.get(date);
  };
  const chanLine = (d, chId) => {
    const k = chId ?? UNATTRIBUTED;
    if (!d.channels.has(k)) {
      d.channels.set(k, {
        channel_id: chId ?? null,
        channel_name: chId ? names[chId] || chId : 'Não atribuído',
        revenue_youtube: 0,
        revenue_hotmart: 0,
        refunds: 0,
        views: 0,
      });
    }
    return d.channels.get(k);
  };

  for (const r of inputs.revenue) {
    if (r.date < from || r.date > to || !wanted(r.channel_id)) continue;
    const d = day(r.date);
    const line = chanLine(d, r.channel_id);
    line.revenue_youtube += convert(r.estimated_revenue || 0, r.currency || 'USD', displayCurrency, r.date);
    line.views += r.views || 0;
    if (r.provisional) d.provisional = true;
  }
  for (const s of inputs.sales) {
    if (!wanted(s.channel_id)) continue;
    if (s.order_date && s.order_date >= from && s.order_date <= to && s.commission_amount) {
      chanLine(day(s.order_date), s.channel_id).revenue_hotmart +=
        convert(s.commission_amount, s.commission_currency || 'BRL', displayCurrency, s.order_date);
    }
    if (s.refund_amount > 0 && s.refund_date && s.refund_date >= from && s.refund_date <= to) {
      chanLine(day(s.refund_date), s.channel_id).refunds +=
        convert(s.refund_amount, s.commission_currency || 'BRL', displayCurrency, s.refund_date);
    }
  }

  const totalize = (line) => ({ ...line, revenue_total: line.revenue_youtube + line.revenue_hotmart - line.refunds });
  const list = [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const chans = [...d.channels.values()].map(totalize).sort((a, b) => b.revenue_total - a.revenue_total);
      const sum = (f) => chans.reduce((acc, c) => acc + c[f], 0);
      return totalize({
        date: d.date,
        provisional: d.provisional,
        revenue_youtube: sum('revenue_youtube'),
        revenue_hotmart: sum('revenue_hotmart'),
        refunds: sum('refunds'),
        views: sum('views'),
        channels: chans,
      });
    });

  const sumAll = (f) => list.reduce((acc, d) => acc + d[f], 0);
  const result = {
    from,
    to,
    currency: displayCurrency,
    days: list,
    totals: totalize({
      revenue_youtube: sumAll('revenue_youtube'),
      revenue_hotmart: sumAll('revenue_hotmart'),
      refunds: sumAll('refunds'),
      views: sumAll('views'),
    }),
  };
  cache.set(key, result);
  return result;
}

/** Sales list for a channel's drill-down (S5.3). */
export function salesForChannel(db, channelId, { from, to } = {}) {
  const args = [];
  let where = channelId === UNATTRIBUTED || channelId == null ? 'channel_id IS NULL' : 'channel_id = ?';
  if (channelId != null && channelId !== UNATTRIBUTED) args.push(channelId);
  if (from && to) {
    where += ' AND ((order_date BETWEEN ? AND ?) OR (refund_date BETWEEN ? AND ?))';
    args.push(from, to, from, to);
  }
  return db
    .prepare(`SELECT transaction_id, product, status, role, commission_amount, commission_currency, src, channel_id, attribution_source, order_date, refund_amount, refund_date FROM sales WHERE ${where} ORDER BY order_date DESC LIMIT 500`)
    .all(...args);
}

export { computePnL };
