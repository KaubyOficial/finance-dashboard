// src/sck → channel attribution (S2.3), with a product → channel FALLBACK
// (products are language-specific — decision 2026-07-07). Manual attributions are
// sticky: a re-sync or re-attribute never overwrites a human decision (S2.5).
import { buildAttributionResolver, buildProductResolver, getConfigChannels } from '../config/channels.js';

/**
 * Decide the channel for one sale. Priority: manual (sticky) > src/sck prefix >
 * product owner. `resolveProduct` is optional for backward compatibility.
 * @returns { channel_id, attribution_source } where source ∈ auto|manual|unmatched
 */
export function attributeSale(sale, resolve, { previous, resolveProduct } = {}) {
  if (previous && previous.attribution_source === 'manual') {
    return { channel_id: previous.channel_id, attribution_source: 'manual' };
  }
  const hit = resolve(sale.src) || resolve(sale.sck) || (resolveProduct ? resolveProduct(sale.product_id) : null);
  if (hit) return { channel_id: hit, attribution_source: 'auto' };
  return { channel_id: null, attribution_source: 'unmatched' };
}

/** Recompute attribution for every non-manual sale after a config change. */
export function reattributeAll(db) {
  const channels = getConfigChannels();
  const resolve = buildAttributionResolver(channels);
  const resolveProduct = buildProductResolver(channels);
  const sales = db
    .prepare("SELECT transaction_id, src, sck, product_id, channel_id, attribution_source FROM sales WHERE attribution_source != 'manual'")
    .all();
  const upd = db.prepare('UPDATE sales SET channel_id = ?, attribution_source = ? WHERE transaction_id = ?');
  let changed = 0;
  const tx = db.transaction(() => {
    for (const s of sales) {
      const r = attributeSale(s, resolve, { resolveProduct });
      if (r.channel_id !== s.channel_id || r.attribution_source !== s.attribution_source) {
        upd.run(r.channel_id, r.attribution_source, s.transaction_id);
        changed++;
      }
    }
  });
  tx();
  return { scanned: sales.length, changed };
}

/** Manually attribute a sale (or a batch by product) — sticks across re-sync. */
export function manualAttribute(db, transactionIds, channelId) {
  const upd = db.prepare("UPDATE sales SET channel_id = ?, attribution_source = 'manual' WHERE transaction_id = ?");
  const tx = db.transaction(() => {
    for (const id of transactionIds) upd.run(channelId, id);
  });
  tx();
  return { updated: transactionIds.length };
}

/** Share of sales left in the "Não atribuído" bucket (sync summary). */
export function unattributedStats(db) {
  const total = db.prepare('SELECT COUNT(*) c FROM sales').get().c;
  const un = db.prepare('SELECT COUNT(*) c FROM sales WHERE channel_id IS NULL').get().c;
  return { total, unattributed: un, pct: total ? un / total : 0 };
}
