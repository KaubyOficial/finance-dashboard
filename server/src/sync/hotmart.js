// Hotmart sales sync (Epic 2). Pure mappers (item→sale, pagination, refund
// detection) are separated from network so they unit-test with fixtures (S2.2).
import { hotmartGet } from '../auth/hotmart.js';
import { buildAttributionResolver, buildProductResolver, getConfigChannels } from '../config/channels.js';
import { attributeSale } from './attribution.js';
import { startRun, finishRun } from './syncLog.js';
import { todayUTC, chunkDateRange } from '../util/dates.js';
import { env } from '../env.js';
import { log } from '../logger.js';

export const REFUND_STATUSES = new Set(['REFUNDED', 'CHARGEBACK', 'PARTIALLY_REFUNDED', 'PROTESTED']);
export const BACKFILL_CHUNK_DAYS = 90;
// Hotmart 400s date windows past ~1 year (12 months OK, 2 years rejected — probed
// 2026-07-07), so any sweep is chunked into windows of at most this many days.
export const MAX_WINDOW_DAYS = 360;
const SALES_PATH = '/payments/api/v1/sales/history';
// sales/history does NOT return commissions[] (only producer/product/buyer/purchase),
// so the net commission comes from a second sweep on this endpoint, matched by transaction.
const COMMISSIONS_PATH = '/payments/api/v1/sales/commissions';

/** Epoch (ms or s) → 'YYYY-MM-DD'. Returns null on missing. */
export function epochToDate(v) {
  if (v == null) return null;
  const ms = Number(v) < 1e12 ? Number(v) * 1000 : Number(v); // tolerate seconds
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Pick the authenticated user's commission from a Hotmart commissions[].
 * Skips MARKETPLACE (Hotmart's own fee). Prefers the configured role, then the
 * first remaining entry. Value is the NET amount the user receives (S2.2).
 */
export function pickCommission(commissions = [], preferredRole = env.hotmart.role) {
  const usable = commissions.filter((c) => String(c.source || '').toUpperCase() !== 'MARKETPLACE');
  if (usable.length === 0) return { amount: 0, currency: 'BRL', role: null };
  let chosen = usable.find((c) => String(c.source || '').toUpperCase() === String(preferredRole || '').toUpperCase());
  if (!chosen) chosen = usable[0];
  return {
    amount: Number(chosen.value ?? chosen.commission?.value ?? 0) || 0,
    // sales/commissions nests it as commission.currency_code (payout currency).
    currency: chosen.currency_value || chosen.currency || chosen.commission?.currency_code || 'BRL',
    role: chosen.source || null,
  };
}

/**
 * Map one sales/history item into our `sales` row shape (attribution added later).
 * `commissionsByTx` (Map transaction → commissions[]) comes from the sales/commissions
 * sweep; when absent we fall back to item.commissions (older payloads / fixtures).
 */
export function mapSaleItem(item, { commissionsByTx = null } = {}) {
  const purchase = item.purchase || {};
  const price = purchase.price || {};
  const tracking = purchase.tracking || {};
  const status = String(purchase.status || '').toUpperCase();
  const commission = pickCommission(commissionsByTx?.get(purchase.transaction) ?? item.commissions);
  const orderDate = epochToDate(purchase.approved_date || purchase.order_date);

  // Hotmart's sales/history & sales/commissions endpoints do NOT expose a refund/
  // chargeback timestamp (probed 2026-07-07: no refund_date/date_refund/last_update
  // in either payload). When it is genuinely absent we book the reversal on the
  // SALE's own date so it nets against the same month the commission was recognised
  // (the date shown in the channel drill-down) — never on the sync date, which used
  // to dump every lifetime refund into the current month.
  const isRefund = REFUND_STATUSES.has(status);
  const refundDate = isRefund
    ? epochToDate(purchase.refund_date || purchase.date_refund || purchase.last_update) || orderDate
    : null;
  // Partial refunds carry the reversed slice when Hotmart provides it; otherwise
  // a full status reverses the whole commission.
  const partial = Number(purchase.refund_value ?? purchase.partial_refund_value ?? 0) || 0;
  const refundAmount = isRefund ? (status === 'PARTIALLY_REFUNDED' && partial > 0 ? partial : commission.amount) : 0;

  return {
    transaction_id: purchase.transaction,
    product: item.product?.name || null,
    product_id: item.product?.id != null ? String(item.product.id) : null,
    status,
    role: commission.role,
    commission_amount: commission.amount,
    commission_currency: commission.currency,
    price_amount: Number(price.value ?? 0) || 0,
    price_currency: price.currency_value || price.currency || commission.currency,
    src: tracking.source || null,
    sck: tracking.source_sck || null,
    order_date: orderDate,
    approved_date: epochToDate(purchase.approved_date),
    refund_amount: refundAmount,
    refund_date: refundDate,
    raw: JSON.stringify(item),
  };
}

/** Idempotent upsert by transaction_id. Preserves manual attribution (S2.5). */
export function upsertSales(db, rows) {
  const channels = getConfigChannels();
  const resolve = buildAttributionResolver(channels);
  const resolveProduct = buildProductResolver(channels);
  const getPrev = db.prepare('SELECT channel_id, attribution_source FROM sales WHERE transaction_id = ?');
  const stmt = db.prepare(`
    INSERT INTO sales
      (transaction_id, product, product_id, status, role, commission_amount, commission_currency,
       price_amount, price_currency, src, sck, channel_id, attribution_source,
       order_date, approved_date, refund_amount, refund_date, raw, updated_at)
    VALUES
      (@transaction_id, @product, @product_id, @status, @role, @commission_amount, @commission_currency,
       @price_amount, @price_currency, @src, @sck, @channel_id, @attribution_source,
       @order_date, @approved_date, @refund_amount, @refund_date, @raw, datetime('now'))
    ON CONFLICT(transaction_id) DO UPDATE SET
      status = excluded.status,
      role = excluded.role,
      commission_amount = excluded.commission_amount,
      commission_currency = excluded.commission_currency,
      price_amount = excluded.price_amount,
      price_currency = excluded.price_currency,
      src = excluded.src,
      sck = excluded.sck,
      channel_id = excluded.channel_id,
      attribution_source = excluded.attribution_source,
      order_date = excluded.order_date,
      approved_date = excluded.approved_date,
      refund_amount = excluded.refund_amount,
      refund_date = excluded.refund_date,
      raw = excluded.raw,
      updated_at = datetime('now')
  `);
  let n = 0;
  const tx = db.transaction((list) => {
    for (const r of list) {
      if (!r.transaction_id) continue;
      const prev = getPrev.get(r.transaction_id);
      const attr = attributeSale(r, resolve, { previous: prev, resolveProduct });
      stmt.run({ ...r, channel_id: attr.channel_id, attribution_source: attr.attribution_source });
      n++;
    }
  });
  tx(rows);
  return n;
}

/**
 * Paginate every page of a Hotmart list endpoint across ≤MAX_WINDOW_DAYS chunks.
 * WITHOUT transaction_status Hotmart returns ONLY APPROVED+COMPLETE (probed:
 * REFUNDED/CHARGEBACK/… are excluded from the default response), so callers do a
 * second sweep with the refund statuses to keep reversals visible.
 */
async function fetchAllPages(path, { startDate, endDate, transport, statuses = null } = {}) {
  const items = [];
  for (const chunk of chunkDateRange(startDate, endDate, MAX_WINDOW_DAYS)) {
    const startMs = Date.parse(`${chunk.from}T00:00:00.000Z`);
    const endMs = Date.parse(`${chunk.to}T23:59:59.999Z`);
    let pageToken;
    for (let guard = 0; guard < 10_000; guard++) {
      const page = await hotmartGet(
        path,
        { start_date: startMs, end_date: endMs, max_results: 100, page_token: pageToken, transaction_status: statuses },
        { transport }
      );
      for (const it of page.items || []) items.push(it);
      pageToken = page.page_info?.next_page_token;
      if (!pageToken) break;
    }
  }
  return items;
}

/**
 * Every sale in [startDate, endDate]: the default sweep (approved/complete) plus
 * a refund-status sweep, de-duplicated by transaction (refund state wins — it is
 * the newer state of the same purchase).
 */
export async function fetchAllSales({ startDate, endDate, transport } = {}) {
  const base = await fetchAllPages(SALES_PATH, { startDate, endDate, transport });
  const refunds = await fetchAllPages(SALES_PATH, { startDate, endDate, transport, statuses: [...REFUND_STATUSES] });
  const byTx = new Map();
  const anonymous = [];
  for (const it of [...base, ...refunds]) {
    const tx = it.purchase?.transaction;
    if (tx) byTx.set(tx, it);
    else anonymous.push(it);
  }
  return [...byTx.values(), ...anonymous];
}

/** sales/commissions (both sweeps) into a Map(transaction → commissions[]). */
export async function fetchAllCommissions({ startDate, endDate, transport } = {}) {
  const base = await fetchAllPages(COMMISSIONS_PATH, { startDate, endDate, transport });
  const refunds = await fetchAllPages(COMMISSIONS_PATH, { startDate, endDate, transport, statuses: [...REFUND_STATUSES] });
  const byTx = new Map();
  for (const it of [...base, ...refunds]) {
    if (it.transaction) byTx.set(it.transaction, it.commissions || []);
  }
  return byTx;
}

/**
 * Sync Hotmart sales for a window and upsert them.
 * mode 'backfill' → from `since` (first sale) to today.
 * mode 'incremental' → last 90 days (status changes land late — S2.2).
 */
export async function syncSales(db, { since, mode = 'incremental', transport } = {}) {
  const endDate = todayUTC();
  const startDate = mode === 'backfill' ? since || '2019-01-01' : addDaysUTC(endDate, -BACKFILL_CHUNK_DAYS);
  const runId = startRun(db, 'hotmart', mode);
  try {
    const items = await fetchAllSales({ startDate, endDate, transport });
    const commissionsByTx = await fetchAllCommissions({ startDate, endDate, transport });
    const rows = items.map((it) => mapSaleItem(it, { commissionsByTx }));
    const n = upsertSales(db, rows);
    finishRun(db, runId, { status: 'ok', rowsUpserted: n, message: `${mode} ${startDate}→${endDate}` });
    return { rows: n, from: startDate, to: endDate, mode };
  } catch (e) {
    finishRun(db, runId, { status: 'error', message: e.message });
    log.error(`Hotmart sync falhou: ${e.message}`);
    throw e;
  }
}

function addDaysUTC(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
