// Deterministic synthetic data for demo + e2e (S7.1). Fixed rates and amounts so
// the numbers are reproducible and can be reasoned about by hand.
import { upsertSales } from '../sync/hotmart.js';
import { upsertFx } from '../sync/fx.js';
import { addDays, daysBetween } from '../util/dates.js';
import { createCost } from '../costs/service.js';

const FX_START = '2026-01-01';
const FX_END = '2026-07-06';
const USD_PER_EUR = 1.08; // 1 EUR = 1.08 USD
const BRL_PER_EUR = 5.8; // 1 EUR = 5.80 BRL

export function seedDemo(db, { reset = true } = {}) {
  if (reset) {
    for (const t of ['revenue_daily', 'sales', 'costs', 'fx_rates']) db.exec(`DELETE FROM ${t}`);
  }

  // Link two demo channels so their detail pages work.
  db.prepare("UPDATE channels SET youtube_channel_id='UCdemoREDEFde0000000001', google_account='demo@rede.f', monetized=1 WHERE id='redef_de'").run();
  db.prepare("UPDATE channels SET youtube_channel_id='UCdemoCORTESde000000000002', google_account='demo@kauby.de', monetized=1 WHERE id='cortes_de'").run();

  // Constant FX across the range (weekends omitted to mirror ECB — converter falls back).
  const rates = {};
  for (let d = FX_START; daysBetween(d, FX_END) >= 0; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    rates[d] = { USD: USD_PER_EUR, BRL: BRL_PER_EUR };
  }
  upsertFx(db, rates);

  // Revenue: redef_de $10/day, cortes_de $4/day over Apr–Jun 2026.
  const rev = db.prepare(`INSERT INTO revenue_daily
    (channel_id, date, currency, estimated_revenue, estimated_ad_revenue, gross_revenue, views, estimated_minutes_watched, cpm, provisional)
    VALUES (?, ?, 'USD', ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(channel_id,date) DO UPDATE SET estimated_revenue=excluded.estimated_revenue`);
  const tx = db.transaction(() => {
    for (let d = '2026-04-01'; daysBetween(d, '2026-06-30') >= 0; d = addDays(d, 1)) {
      rev.run('redef_de', d, 10, 9, 11, 5000, 12000, 2.0);
      rev.run('cortes_de', d, 4, 3.6, 4.4, 2000, 4800, 2.0);
    }
  });
  tx();

  // Hotmart sales (BRL commissions). One refunded across months, one unattributed.
  upsertSales(db, [
    { transaction_id: 'HP-1001', product: 'Ebook Inflação', status: 'APPROVED', role: 'PRODUCER', commission_amount: 58, commission_currency: 'BRL', price_amount: 97, price_currency: 'BRL', src: 'yt_redef_de', sck: null, order_date: '2026-04-10', approved_date: '2026-04-10', refund_amount: 0, refund_date: null, raw: null },
    { transaction_id: 'HP-1002', product: 'Ebook Inflação', status: 'APPROVED', role: 'PRODUCER', commission_amount: 58, commission_currency: 'BRL', price_amount: 97, price_currency: 'BRL', src: 'yt_redef_de', sck: null, order_date: '2026-05-05', approved_date: '2026-05-05', refund_amount: 0, refund_date: null, raw: null },
    { transaction_id: 'HP-1003', product: 'Mentoria', status: 'REFUNDED', role: 'PRODUCER', commission_amount: 300, commission_currency: 'BRL', price_amount: 497, price_currency: 'BRL', src: 'yt_cortes_de', sck: null, order_date: '2026-04-20', approved_date: '2026-04-20', refund_amount: 300, refund_date: '2026-06-15', raw: null },
    { transaction_id: 'HP-1004', product: 'Ebook Inflação', status: 'APPROVED', role: 'PRODUCER', commission_amount: 58, commission_currency: 'BRL', price_amount: 97, price_currency: 'BRL', src: 'unknown_src', sck: null, order_date: '2026-05-18', approved_date: '2026-05-18', refund_amount: 0, refund_date: null, raw: null },
  ]);

  // Costs: one shared recurring (by_revenue), one direct one-off.
  createCost(db, { kind: 'recurring', category: 'TTS', description: 'ElevenLabs', amount: 99, currency: 'USD', channel_id: null, allocation_rule: 'by_revenue', start_date: '2026-04-01', end_date: null, source: 'manual' });
  createCost(db, { kind: 'one_off', category: 'Narração', description: 'Fiverr DE', amount: 40, currency: 'EUR', channel_id: 'cortes_de', start_date: '2026-05-10', source: 'manual' });

  return { ok: true, note: 'seed determinístico aplicado' };
}
