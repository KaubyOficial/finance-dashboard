import { describe, it, expect, beforeEach } from 'vitest';
import { makeDb } from './helpers.js';
import { buildApp } from '../src/server/app.js';
import { seedDemo } from '../src/dev/seed.js';

const RANGE = 'from=2026-01-01&to=2026-07-06&currency=USD';

describe('API integration', () => {
  let app;
  let db;
  beforeEach(async () => {
    db = makeDb();
    seedDemo(db);
    app = buildApp(db);
    await app.ready();
  });

  it('GET /api/pnl returns a network total', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/pnl?${RANGE}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.network.revenue_total).toBeGreaterThan(0);
    expect(body.currency).toBe('USD');
  });

  it('GET /api/channels lists the network channels', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/channels' });
    const body = res.json();
    expect(body.channels.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/revenue/daily returns day-by-day revenue with channel breakdown', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/revenue/daily?${RANGE}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // 2026-04-10: AdSense $10 (redef_de) + $4 (cortes_de) and sale HP-1001 (R$58 → USD at 5.80/1.08).
    const d = body.days.find((x) => x.date === '2026-04-10');
    expect(d.revenue_youtube).toBeCloseTo(14, 6);
    expect(d.revenue_hotmart).toBeCloseTo((58 / 5.8) * 1.08, 6);
    expect(d.revenue_total).toBeCloseTo(14 + (58 / 5.8) * 1.08, 6);
    const chans = Object.fromEntries(d.channels.map((c) => [c.channel_id, c]));
    expect(chans.redef_de.revenue_youtube).toBeCloseTo(10, 6);
    expect(chans.redef_de.revenue_hotmart).toBeCloseTo((58 / 5.8) * 1.08, 6);
    expect(chans.cortes_de.revenue_youtube).toBeCloseTo(4, 6);

    // 2026-06-15: refund of HP-1003 (R$300) lands on the refund date.
    const refundDay = body.days.find((x) => x.date === '2026-06-15');
    expect(refundDay.refunds).toBeCloseTo((300 / 5.8) * 1.08, 6);
    expect(refundDay.revenue_total).toBeCloseTo(14 - (300 / 5.8) * 1.08, 6);

    // Totals: 91 days × $14/day of AdSense (Apr–Jun 2026).
    expect(body.totals.revenue_youtube).toBeCloseTo(91 * 14, 4);

    // Days are chronological and it never includes costs.
    const dates = body.days.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    expect(refundDay).not.toHaveProperty('cost_total');
  });

  it('GET /api/revenue/daily respects the channels filter', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/revenue/daily?${RANGE}&channels=cortes_de` });
    const body = res.json();
    const d = body.days.find((x) => x.date === '2026-04-10');
    expect(d.revenue_youtube).toBeCloseTo(4, 6);
    expect(d.channels.length).toBe(1);
  });

  it('adding a cost reduces profit (margin moves)', async () => {
    const before = (await app.inject({ method: 'GET', url: `/api/pnl?${RANGE}` })).json().network.profit;
    const create = await app.inject({
      method: 'POST',
      url: '/api/costs',
      payload: { kind: 'one_off', category: 'Test', amount: 500, currency: 'USD', channel_id: 'redef_de', start_date: '2026-05-01' },
    });
    expect(create.statusCode).toBe(201);
    const after = (await app.inject({ method: 'GET', url: `/api/pnl?${RANGE}` })).json().network.profit;
    expect(after).toBeCloseTo(before - 500, 4);
  });

  it('CSV import dry-run previews without writing', async () => {
    const csv = 'kind;category;description;amount;currency;channel_id;allocation_rule;allocation_custom;start_date;end_date\none_off;X;y;12,50;USD;redef_de;;;2026-06-01;';
    const res = await app.inject({ method: 'POST', url: '/api/costs/import', payload: { csv, commit: false } });
    const body = res.json();
    expect(body.dryRun).toBe(true);
    expect(body.toInsert.length).toBe(1);
  });

  it('rejects non-localhost hosts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: 'evil.example.com' } });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/sync/status returns state + freshness', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sync/status' });
    const body = res.json();
    expect(body).toHaveProperty('freshness');
    expect(body).toHaveProperty('state');
  });
});
