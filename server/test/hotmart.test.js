import { describe, it, expect, beforeEach } from 'vitest';
import { makeDb, fakeTransport } from './helpers.js';
import { env } from '../src/env.js';
import {
  epochToDate,
  pickCommission,
  mapSaleItem,
  upsertSales,
  fetchAllSales,
  fetchAllCommissions,
  syncSales,
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

  it('pickCommission reads the sales/commissions shape (nested value + currency_code)', () => {
    const c = pickCommission(
      [{ source: 'PRODUCER', commission: { value: 19.14, currency_code: 'USD' }, user: { name: 'Kauby' } }],
      'PRODUCER'
    );
    expect(c).toMatchObject({ amount: 19.14, currency: 'USD', role: 'PRODUCER' });
  });

  it('mapSaleItem merges the commission from the commissionsByTx map', () => {
    // Real sales/history payloads carry NO commissions[] — the value comes from
    // the sales/commissions sweep, matched by transaction.
    const item = {
      purchase: { transaction: 'HP7', status: 'COMPLETE', approved_date: ms('2026-05-02'), price: { value: 21.37, currency_code: 'EUR' }, tracking: { source_sck: 'v2' } },
      product: { id: 5998559, name: 'Ebook DE' },
    };
    const byTx = new Map([['HP7', [{ source: 'PRODUCER', commission: { value: 19.14, currency_code: 'USD' } }]]]);
    const s = mapSaleItem(item, { commissionsByTx: byTx });
    expect(s).toMatchObject({ transaction_id: 'HP7', commission_amount: 19.14, commission_currency: 'USD', role: 'PRODUCER', sck: 'v2' });
    // Transaction absent from the map → commission stays 0, sale still recorded.
    const missing = mapSaleItem({ purchase: { transaction: 'HP8', status: 'COMPLETE', approved_date: ms('2026-05-02') } }, { commissionsByTx: byTx });
    expect(missing.commission_amount).toBe(0);
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
      if (new URL(url).searchParams.has('transaction_status')) return { status: 200, body: { items: [], page_info: {} } };
      const token = new URL(url).searchParams.get('page_token');
      if (!token) return { status: 200, body: { items: [{ purchase: { transaction: 'A' } }], page_info: { next_page_token: 'p2' } } };
      return { status: 200, body: { items: [{ purchase: { transaction: 'B' } }], page_info: {} } };
    });
    const items = await fetchAllSales({ startDate: '2026-04-01', endDate: '2026-04-30', transport });
    expect(items.map((i) => i.purchase.transaction)).toEqual(['A', 'B']);
  });

  it('chunks windows larger than 360 days (Hotmart rejects >1y ranges)', async () => {
    const starts = new Set();
    const transport = fakeTransport((url) => {
      if (url.includes('/security/oauth/token')) return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      const p = new URL(url).searchParams;
      const days = (Number(p.get('end_date')) - Number(p.get('start_date'))) / 86_400_000;
      expect(days).toBeLessThanOrEqual(361); // each request stays within the API limit
      if (!p.has('transaction_status')) starts.add(p.get('start_date'));
      return { status: 200, body: { items: [{ purchase: { transaction: `T${p.get('start_date')}` } }], page_info: {} } };
    });
    // ~2.5 years → 3 chunks per sweep.
    const items = await fetchAllSales({ startDate: '2024-01-01', endDate: '2026-07-07', transport });
    expect(starts.size).toBe(3);
    expect(items.length).toBe(3); // same transactions across sweeps de-duplicate
  });

  it('does a second sweep with refund statuses (default response hides them)', async () => {
    const transport = fakeTransport((url) => {
      if (url.includes('/security/oauth/token')) return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      const p = new URL(url).searchParams;
      if (p.has('transaction_status')) {
        expect(p.getAll('transaction_status').sort()).toEqual(['CHARGEBACK', 'PARTIALLY_REFUNDED', 'PROTESTED', 'REFUNDED']);
        return { status: 200, body: { items: [{ purchase: { transaction: 'HPR', status: 'REFUNDED' } }], page_info: {} } };
      }
      return { status: 200, body: { items: [{ purchase: { transaction: 'HPA', status: 'COMPLETE' } }], page_info: {} } };
    });
    const items = await fetchAllSales({ startDate: '2026-04-01', endDate: '2026-04-30', transport });
    expect(items.map((i) => i.purchase.transaction).sort()).toEqual(['HPA', 'HPR']);
  });

  it('fetchAllCommissions walks pages and maps by transaction', async () => {
    const transport = fakeTransport((url) => {
      if (url.includes('/security/oauth/token')) return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      expect(url).toContain('/payments/api/v1/sales/commissions');
      const token = new URL(url).searchParams.get('page_token');
      if (!token)
        return { status: 200, body: { items: [{ transaction: 'A', commissions: [{ source: 'PRODUCER', commission: { value: 10, currency_code: 'USD' } }] }], page_info: { next_page_token: 'p2' } } };
      return { status: 200, body: { items: [{ transaction: 'B', commissions: [] }], page_info: {} } };
    });
    const byTx = await fetchAllCommissions({ startDate: '2026-04-01', endDate: '2026-04-30', transport });
    expect(byTx.size).toBe(2);
    expect(byTx.get('A')[0].commission.value).toBe(10);
    expect(byTx.get('B')).toEqual([]);
  });

  it('syncSales joins history + commissions and persists real values', async () => {
    const db = makeDb();
    const transport = fakeTransport((url) => {
      if (url.includes('/security/oauth/token')) return { status: 200, body: { access_token: 't', expires_in: 3600 } };
      if (url.includes('/sales/history'))
        return {
          status: 200,
          body: {
            items: [
              {
                purchase: { transaction: 'HPX', status: 'COMPLETE', approved_date: ms('2026-05-02'), price: { value: 21.37, currency_code: 'EUR' }, tracking: { source: 'yt_redef_de' } },
                product: { id: 5998559, name: 'Ebook DE' },
              },
            ],
            page_info: {},
          },
        };
      if (url.includes('/sales/commissions'))
        return {
          status: 200,
          body: { items: [{ transaction: 'HPX', commissions: [{ source: 'PRODUCER', commission: { value: 19.14, currency_code: 'USD' } }] }], page_info: {} },
        };
      throw new Error(`unexpected url ${url}`);
    });
    const r = await syncSales(db, { mode: 'incremental', transport });
    expect(r.rows).toBe(1);
    const row = db.prepare("SELECT commission_amount, commission_currency, src, channel_id, attribution_source FROM sales WHERE transaction_id='HPX'").get();
    expect(row).toMatchObject({ commission_amount: 19.14, commission_currency: 'USD', src: 'yt_redef_de', channel_id: 'redef_de', attribution_source: 'auto' });
  });
});
