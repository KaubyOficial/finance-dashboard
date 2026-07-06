// The P&L engine (Epic 4 · S4.2). PURE: input plain data + a convert() closure,
// output P&L cells. No DB, no I/O — so the golden suite and property tests pin
// its behaviour and any refactor must keep the same numbers.
//
// Money flows, all converted to the DISPLAY currency at the transaction's date:
//   revenue_total = youtube + hotmart − refunds
//   cost_total    = direct + allocated(shared)
//   profit        = revenue_total − cost_total
//   margin        = profit / revenue_total   (null when revenue_total <= 0)

import { monthKey, monthsBetween, monthStart, monthEnd } from '../util/dates.js';
import { allocateShared } from './allocation.js';

export const UNATTRIBUTED = '__unattributed__';

const inRange = (d, from, to) => d != null && d >= from && d <= to;

function blankCell(channelId, month) {
  return {
    channel_id: channelId === UNATTRIBUTED ? null : channelId,
    month,
    revenue_youtube: 0,
    revenue_hotmart: 0,
    refunds: 0, // stored positive; subtracted into revenue_total
    cost_direct: 0,
    cost_allocated: 0,
    views: 0,
  };
}

function cellKey(channelId, month) {
  return `${channelId}|${month}`;
}

/**
 * Build per-(channel, month) cells for [from, to] in `displayCurrency`.
 * @param inputs { channels[], revenue[], sales[], costs[] }
 * @param convert (amount, from, to, date) => amount
 */
export function buildCells(inputs, { from, to, displayCurrency, convert }) {
  const { channels = [], revenue = [], sales = [], costs = [] } = inputs;
  const months = monthsBetween(from, to);
  const monthSet = new Set(months);
  const cells = new Map();

  const cell = (channelId, month) => {
    const k = cellKey(channelId, month);
    if (!cells.has(k)) cells.set(k, blankCell(channelId, month));
    return cells.get(k);
  };

  // 1) YouTube daily revenue → month buckets, converted at each day's rate.
  for (const r of revenue) {
    if (!inRange(r.date, from, to)) continue;
    const m = monthKey(r.date);
    if (!monthSet.has(m)) continue;
    const target = cell(r.channel_id, m);
    target.revenue_youtube += convert(r.estimated_revenue || 0, r.currency || 'USD', displayCurrency, r.date);
    target.views += r.views || 0;
  }

  // 2) Hotmart commissions (by order month) and refunds (by refund month).
  for (const s of sales) {
    const ch = s.channel_id || UNATTRIBUTED;
    if (inRange(s.order_date, from, to) && s.commission_amount) {
      const m = monthKey(s.order_date);
      const v = convert(s.commission_amount, s.commission_currency || 'BRL', displayCurrency, s.order_date);
      cell(ch, m).revenue_hotmart += v;
    }
    if (s.refund_amount > 0 && inRange(s.refund_date, from, to)) {
      const m = monthKey(s.refund_date);
      const v = convert(s.refund_amount, s.commission_currency || 'BRL', displayCurrency, s.refund_date);
      cell(ch, m).refunds += v;
    }
  }

  // 3a) Direct costs (channel-specific).
  for (const c of costs) {
    if (!c.channel_id) continue;
    for (const m of months) {
      if (!costAppliesToMonth(c, m)) continue;
      const date = c.kind === 'one_off' ? c.start_date : monthStart(m);
      cell(c.channel_id, m).cost_direct += convert(c.amount, c.currency, displayCurrency, date);
    }
  }

  // 3b) Shared costs — need each month's revenue distribution first.
  const sharedCosts = costs.filter((c) => !c.channel_id);
  if (sharedCosts.length) {
    for (const m of months) {
      const active = activeChannelsForMonth(channels, m);
      if (!active.length) continue;
      const revByChannel = revenueByChannelForMonth(cells, active, m);
      for (const c of sharedCosts) {
        if (!costAppliesToMonth(c, m)) continue;
        const date = c.kind === 'one_off' ? c.start_date : monthStart(m);
        const amount = convert(c.amount, c.currency, displayCurrency, date);
        const alloc = allocateShared(c, amount, { activeChannels: active, revenueByChannel: revByChannel });
        for (const [chId, share] of alloc) cell(chId, m).cost_allocated += share;
      }
    }
  }

  return [...cells.values()].map(finalizeCell).map((c) => ({ ...c, currency: displayCurrency }));
}

function finalizeCell(c) {
  const revenue_total = c.revenue_youtube + c.revenue_hotmart - c.refunds;
  const cost_total = c.cost_direct + c.cost_allocated;
  const profit = revenue_total - cost_total;
  const margin = revenue_total > 0 ? profit / revenue_total : null;
  return { ...c, revenue_total, cost_total, profit, margin };
}

export function costAppliesToMonth(cost, month) {
  if (cost.kind === 'one_off') return monthKey(cost.start_date) === month;
  const startMk = monthKey(cost.start_date);
  const endMk = cost.end_date ? monthKey(cost.end_date) : null;
  return month >= startMk && (endMk === null || month <= endMk);
}

function activeChannelsForMonth(channels, month) {
  const end = monthEnd(month);
  return channels
    .filter((c) => c.active !== 0 && (!c.launch_date || c.launch_date <= end))
    .map((c) => c.id);
}

function revenueByChannelForMonth(cells, active, month) {
  const map = new Map();
  for (const id of active) {
    const cell = cells.get(cellKey(id, month));
    const rev = cell ? cell.revenue_youtube + cell.revenue_hotmart - cell.refunds : 0;
    map.set(id, rev);
  }
  return map;
}

// ── aggregation ──────────────────────────────────────────────────────────────

const SUM_FIELDS = [
  'revenue_youtube',
  'revenue_hotmart',
  'refunds',
  'revenue_total',
  'cost_direct',
  'cost_allocated',
  'cost_total',
  'profit',
  'views',
];

/** Roll cells up by 'month' | 'channel' | 'network'. Returns sorted lines. */
export function aggregate(cells, groupBy, { channelNames = {} } = {}) {
  const groups = new Map();
  for (const c of cells) {
    let key;
    if (groupBy === 'month') key = c.month;
    else if (groupBy === 'channel') key = c.channel_id ?? UNATTRIBUTED;
    else key = 'network';
    if (!groups.has(key)) groups.set(key, emptyLine(groupBy, key, channelNames));
    const line = groups.get(key);
    for (const f of SUM_FIELDS) line[f] += c[f];
  }
  const lines = [...groups.values()].map((l) => {
    l.margin = l.revenue_total > 0 ? l.profit / l.revenue_total : null;
    return l;
  });
  lines.sort((a, b) => String(a.key).localeCompare(String(b.key), 'en'));
  return lines;
}

function emptyLine(groupBy, key, channelNames) {
  const line = { key, currency: null };
  if (groupBy === 'month') line.month = key;
  if (groupBy === 'channel') {
    line.channel_id = key === UNATTRIBUTED ? null : key;
    line.channel_name = key === UNATTRIBUTED ? 'Não atribuído' : channelNames[key] || key;
  }
  for (const f of SUM_FIELDS) line[f] = 0;
  return line;
}

/** Convenience: cells + both roll-ups + network total in one call. */
export function computePnL(inputs, opts) {
  const cells = buildCells(inputs, opts);
  const names = Object.fromEntries((inputs.channels || []).map((c) => [c.id, c.name]));
  return {
    cells,
    byMonth: aggregate(cells, 'month', { channelNames: names }),
    byChannel: aggregate(cells, 'channel', { channelNames: names }),
    network: aggregate(cells, 'network')[0] || null,
    currency: opts.displayCurrency,
  };
}
