import { describe, it, expect, beforeEach } from 'vitest';
import { makeDb, fakeTransport } from './helpers.js';
import { env } from '../src/env.js';
import {
  epochToDate,
  pickCommission,
  mapSaleItem,
  upsertSales,
  fetchAllSales,
} from '../src/sync/hotmart.js';
import { _resetTokenCache } from '../src/auth/hotmart.js';

const ms = (d) => Date.parse(`${d}T12:00:00Z`);

describe('hotmart pure mappers', () => {
  it('epochToDate tolerates ms and s', () => {
    expect(epochToDate(ms('2026-04-10'))).toBe('2026-04-10');
    expect(epochToDate(Math.floor(ms('2026-04-10') / 1000))).toBe('2026-04-10');
    expect(epochToDate(null)).toBe(null);
  });

  it('pickCommission skips MARKETPLACE and honours preferred role', () => {
    const c = pickCommission(
      [
        { source: 'MARKETPLACE', value: 20, currency_value: 'BRL' },
        { source: 'PRODUCER', value: 58, currency_value: 'BRL' },
      ],
      'PRODUCER'
    );
    expect(c).toMatchObject({ amount: 58, currency: 'BRL', role: 'PRODUCER' });
  });

  it('maps an approved sale', () => {
    const item = {
      purchase: { transaction: 'HP1', status: 'APPROVED', approved_date: ms('2026-04-10'), price: { value: 97, currency_value: 'BRL' }, tracking: { source: 'yt_redef_de' } },
      product: { id: 1, name: 'Ebook' },
      commissions: [{ source: 'PRODUCER', value: 58, currency_value: 'BRL' }],
    };
    const s = mapSaleItem(item);
    expect(s).toMatchObject({ transaction_id: 'HP1', commission_amount: 58, src: 'yt_redef_de', order_date: '2026-04-10', refund_amount: 0 });
  });

  it('maps a refund with the reversal date', () => {
    const item = {
      purchase: { transaction: 'HP2', status: 'REFUNDED', approved_date: ms('2026-04-10'), refund_date: ms('2026-06-15'), price: { value: 497, currency_value: 'BRL' }, tracking: {} },
      product: { id: 2, name: 'Mentoria' },
      commissions: [{ source: 'PRODUCER', value: 300, currency_value: 'BRL' }],
    };
    const s = mapSaleItem(item);
    expect(s.refund_amount).toBe(300);
    expect(s.refund_date).toBe('2026-06-15');
    expect(s.order_date).toBe('2026-04-10'); // original kept
  });
});

describe('upsertSales', () => {
  it('is idempotent and auto-attributes by src', () => {
    const db = makeDb();
    const rows = [{ transaction_id: 'HP1', commission_amount: 58, commission_currency: 'BRL', src: 'yt_redef_de', order_date: '2026-04-10', refund_amount: 0 }];
    upsertSales(db, rows);
    upsertSales(db, rows);
    const row = db.prepare("SELECT channel_id, attribution_source FROM sales WHERE transaction_id='HP1'").get();
    expect(row).toMatchObject({ channel_id: 'redef_de', attribution_source: 'auto' });
    expect(db.prepare('SELECT COUNT(*) c FROM sales').get().c).toBe(1);
  });

  it('does not overwrite a manual attribution on re-sync', () => {
    const db = makeDb();
    upsertSales(db, [{ transaction_id: 'HP9', commission_amount: 10, commission_currency: 'BRL', src: 'unknown', order_date: '2026-04-10', refund_amount: 0 }]);
    db.prepare("UPDATE sales SET channel_id='cortes_de', attribution_source='manual' WHERE transaction_id='HP9'").run();
    upsertSales(db, [{ transaction_id: 'HP9', commission_amount: 10, commission_currency: 'BRL', src: 'unknown', order_date: '2026-04-10', refund_amount: 0 }]);
    const row = db.prepare("SELECT channel_id, attribution_source FROM sales WHERE transaction_id='HP9'").get();
    expect(row).toMatchObject({ channel_id: 'cortes_de', attribution_source: 'manual' });
  });
});

describe('fetchAllSales pagination', () => {
  beforeEach(() => {
    env.hotmart.clientId = 'id';
    env.hotmart.clientSecret = 'secret';
    _resetTokenCache();
  });

  it('walks every page via next_page_token', async () => {
    const transport = fakeTransport((url) => {
      if (url.includes('/security/oauth/token')) return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      const token = new URL(url).searchParams.get('page_token');
      if (!token) return { status: 200, body: { items: [{ purchase: { transaction: 'A' } }], page_info: { next_page_token: 'p2' } } };
      return { status: 200, body: { items: [{ purchase: { transaction: 'B' } }], page_info: {} } };
    });
    const items = await fetchAllSales({ startDate: '2026-04-01', endDate: '2026-04-30', transport });
    expect(items.map((i) => i.purchase.transaction)).toEqual(['A', 'B']);
  });
});
