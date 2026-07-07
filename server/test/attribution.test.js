import { describe, it, expect } from 'vitest';
import { attributeSale, reattributeAll, manualAttribute, unattributedStats } from '../src/sync/attribution.js';
import { buildAttributionResolver, buildProductResolver } from '../src/config/channels.js';
import { makeDb } from './helpers.js';
import { upsertSales } from '../src/sync/hotmart.js';

const resolve = buildAttributionResolver([
  { id: 'redef_de', src_prefixes: ['yt_redef_de'] },
  { id: 'cortes_de', src_prefixes: ['yt_cortes_de'] },
]);

describe('attributeSale matrix', () => {
  it('exact prefix → auto', () => {
    expect(attributeSale({ src: 'yt_redef_de' }, resolve)).toEqual({ channel_id: 'redef_de', attribution_source: 'auto' });
  });
  it('falls back to sck when src misses', () => {
    expect(attributeSale({ src: null, sck: 'yt_cortes_de_x' }, resolve).channel_id).toBe('cortes_de');
  });
  it('no match → unmatched/null', () => {
    expect(attributeSale({ src: 'ig_ad' }, resolve)).toEqual({ channel_id: null, attribution_source: 'unmatched' });
  });
  it('manual previous is preserved', () => {
    const r = attributeSale({ src: 'yt_redef_de' }, resolve, { previous: { attribution_source: 'manual', channel_id: 'cortes_de' } });
    expect(r).toEqual({ channel_id: 'cortes_de', attribution_source: 'manual' });
  });
});

describe('product → channel fallback', () => {
  const resolveProduct = buildProductResolver([
    { id: 'redef_de', src_prefixes: ['yt_redef_de'], hotmart_product_ids: ['5998559', 7584832] },
    { id: 'redef_it', src_prefixes: ['yt_redef_it'], hotmart_product_ids: ['7547467'] },
  ]);

  it('kicks in when src/sck match nothing (per-video codes like v2)', () => {
    const r = attributeSale({ src: null, sck: 'v2', product_id: '5998559' }, resolve, { resolveProduct });
    expect(r).toEqual({ channel_id: 'redef_de', attribution_source: 'auto' });
  });

  it('src prefix wins over the product owner', () => {
    const r = attributeSale({ src: 'yt_cortes_de_x', product_id: '5998559' }, resolve, { resolveProduct });
    expect(r.channel_id).toBe('cortes_de');
  });

  it('tolerates numeric ids and unknown products', () => {
    expect(resolveProduct(7584832)).toBe('redef_de');
    expect(resolveProduct('7547467')).toBe('redef_it');
    expect(resolveProduct('999')).toBe(null);
    expect(resolveProduct(null)).toBe(null);
    expect(attributeSale({ src: 'nope', product_id: '999' }, resolve, { resolveProduct }).attribution_source).toBe('unmatched');
  });

  it('upsertSales attributes by product via the REAL config (German ebook → redef_de)', () => {
    const db = makeDb();
    upsertSales(db, [
      { transaction_id: 'PV1', product_id: '5998559', commission_amount: 19.14, commission_currency: 'USD', src: null, sck: 'v2', order_date: '2026-05-02', refund_amount: 0 },
    ]);
    const row = db.prepare("SELECT channel_id, attribution_source FROM sales WHERE transaction_id='PV1'").get();
    expect(row).toEqual({ channel_id: 'redef_de', attribution_source: 'auto' });
  });
});

describe('reattribute + manual + stats', () => {
  it('reattributes non-manual sales after config resolve', () => {
    const db = makeDb();
    upsertSales(db, [
      { transaction_id: 'A', commission_amount: 1, commission_currency: 'BRL', src: 'yt_redef_de', order_date: '2026-04-01', refund_amount: 0 },
      { transaction_id: 'B', commission_amount: 1, commission_currency: 'BRL', src: 'nope', order_date: '2026-04-01', refund_amount: 0 },
    ]);
    const r = reattributeAll(db);
    expect(r.scanned).toBe(2);
    const stats = unattributedStats(db);
    expect(stats.unattributed).toBe(1);
    expect(stats.pct).toBeCloseTo(0.5);
  });

  it('manual attribution sticks and is counted', () => {
    const db = makeDb();
    upsertSales(db, [{ transaction_id: 'B', commission_amount: 1, commission_currency: 'BRL', src: 'nope', order_date: '2026-04-01', refund_amount: 0 }]);
    manualAttribute(db, ['B'], 'cortes_de');
    const row = db.prepare("SELECT channel_id, attribution_source FROM sales WHERE transaction_id='B'").get();
    expect(row).toEqual({ channel_id: 'cortes_de', attribution_source: 'manual' });
    // re-attribute must not undo it
    reattributeAll(db);
    expect(db.prepare("SELECT channel_id FROM sales WHERE transaction_id='B'").get().channel_id).toBe('cortes_de');
  });
});
