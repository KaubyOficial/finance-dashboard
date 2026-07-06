import { describe, it, expect } from 'vitest';
import { computePnL, buildCells, costAppliesToMonth } from '../src/engine/pnl.js';
import { makeConverter } from '../src/engine/fx.js';
import { addDays, daysBetween } from '../src/util/dates.js';

// Constant FX across the scenario: 1 EUR = 1.08 USD = 5.80 BRL.
// ⇒ BRL→USD factor 1.08/5.80; EUR→USD 1.08.
function constantFx() {
  const rows = [];
  for (let d = '2026-01-01'; daysBetween(d, '2026-03-31') >= 0; d = addDays(d, 1)) {
    rows.push({ date: d, base: 'EUR', quote: 'USD', rate: 1.08 });
    rows.push({ date: d, base: 'EUR', quote: 'BRL', rate: 5.8 });
  }
  return makeConverter(rows);
}

// ── Golden scenario: 2 channels, 3 months, both revenue sources, a cross-month
//    refund, a shared by_revenue cost, and mixed currencies. Numbers below are
//    computed by hand and MUST hold across any refactor (S4.2 AC). ──────────────
const inputs = {
  channels: [
    { id: 'a', name: 'A', launch_date: '2025-01-01', active: 1 },
    { id: 'b', name: 'B', launch_date: '2025-01-01', active: 1 },
  ],
  revenue: [
    { channel_id: 'a', date: '2026-01-15', currency: 'USD', estimated_revenue: 100, views: 10000 },
    { channel_id: 'a', date: '2026-02-15', currency: 'USD', estimated_revenue: 200, views: 20000 },
    { channel_id: 'a', date: '2026-03-15', currency: 'USD', estimated_revenue: 150, views: 15000 },
    { channel_id: 'b', date: '2026-01-15', currency: 'USD', estimated_revenue: 50, views: 5000 },
    { channel_id: 'b', date: '2026-03-15', currency: 'USD', estimated_revenue: 50, views: 5000 },
  ],
  sales: [
    { channel_id: 'a', order_date: '2026-01-20', commission_amount: 580, commission_currency: 'BRL', refund_amount: 0 },
    { channel_id: 'a', order_date: '2026-01-25', commission_amount: 580, commission_currency: 'BRL', refund_amount: 580, refund_date: '2026-03-05' },
    { channel_id: 'b', order_date: '2026-02-10', commission_amount: 290, commission_currency: 'BRL', refund_amount: 0 },
    { channel_id: null, order_date: '2026-02-20', commission_amount: 116, commission_currency: 'BRL', refund_amount: 0 },
  ],
  costs: [
    { id: 1, kind: 'recurring', category: 'TTS', amount: 100, currency: 'USD', channel_id: null, allocation_rule: 'by_revenue', start_date: '2026-01-01', end_date: null },
    { id: 2, kind: 'one_off', category: 'Narração', amount: 50, currency: 'EUR', channel_id: 'b', start_date: '2026-02-10' },
    { id: 3, kind: 'recurring', category: 'Ferramenta', amount: 30, currency: 'USD', channel_id: 'a', start_date: '2026-01-01', end_date: null },
  ],
};

const opts = { from: '2026-01-01', to: '2026-03-31', displayCurrency: 'USD', convert: constantFx() };

describe('P&L golden scenario', () => {
  const { cells, byMonth, byChannel, network } = computePnL(inputs, opts);

  it('network revenue = 733.60 USD', () => {
    expect(network.revenue_total).toBeCloseTo(733.6, 6);
  });

  it('network cost = 444.00 USD (direct 144 + shared 300)', () => {
    expect(network.cost_total).toBeCloseTo(444, 6);
  });

  it('network profit = 289.60 USD', () => {
    expect(network.profit).toBeCloseTo(289.6, 6);
  });

  it('monthly network revenue: 366 / 275.6 / 92', () => {
    const m = Object.fromEntries(byMonth.map((r) => [r.month, r.revenue_total]));
    expect(m['2026-01']).toBeCloseTo(366, 6);
    expect(m['2026-02']).toBeCloseTo(275.6, 6);
    expect(m['2026-03']).toBeCloseTo(92, 6);
  });

  it('cross-month refund: channel A March = 150 − 108 = 42', () => {
    const aMar = cells.find((c) => c.channel_id === 'a' && c.month === '2026-03');
    expect(aMar.revenue_total).toBeCloseTo(42, 6);
    // original January sale still counted (not deleted)
    const aJan = cells.find((c) => c.channel_id === 'a' && c.month === '2026-01');
    expect(aJan.revenue_total).toBeCloseTo(316, 6); // 100 yt + 216 hotmart
  });

  it('unattributed sale lands in the visible null bucket, not on A/B', () => {
    const un = byChannel.find((r) => r.channel_id === null);
    expect(un.revenue_total).toBeCloseTo(21.6, 6);
    expect(un.cost_total).toBe(0);
  });

  it('shared cost allocates entirely to active channels each month (sums to 100)', () => {
    for (const month of ['2026-01', '2026-02', '2026-03']) {
      const alloc = cells.filter((c) => c.month === month).reduce((s, c) => s + c.cost_allocated, 0);
      expect(alloc).toBeCloseTo(100, 6);
    }
  });

  it('by_revenue split for January follows the revenue ratio', () => {
    const aJan = cells.find((c) => c.channel_id === 'a' && c.month === '2026-01');
    expect(aJan.cost_allocated).toBeCloseTo((100 * 316) / 366, 6);
  });

  it('sum of channels equals the network total', () => {
    const rev = byChannel.reduce((s, r) => s + r.revenue_total, 0);
    const profit = byChannel.reduce((s, r) => s + r.profit, 0);
    expect(rev).toBeCloseTo(network.revenue_total, 6);
    expect(profit).toBeCloseTo(network.profit, 6);
  });
});

describe('costAppliesToMonth', () => {
  it('one-off only in its month', () => {
    expect(costAppliesToMonth({ kind: 'one_off', start_date: '2026-02-10' }, '2026-02')).toBe(true);
    expect(costAppliesToMonth({ kind: 'one_off', start_date: '2026-02-10' }, '2026-03')).toBe(false);
  });
  it('recurring within [start, end], open-ended forever', () => {
    const c = { kind: 'recurring', start_date: '2026-01-01', end_date: '2026-02-28' };
    expect(costAppliesToMonth(c, '2026-01')).toBe(true);
    expect(costAppliesToMonth(c, '2026-03')).toBe(false);
    expect(costAppliesToMonth({ kind: 'recurring', start_date: '2026-01-01', end_date: null }, '2030-06')).toBe(true);
  });
});

// re-export a plain buildCells smoke test to lock the signature
describe('buildCells shape', () => {
  it('returns cells tagged with the display currency', () => {
    const cells = buildCells(inputs, opts);
    expect(cells.every((c) => c.currency === 'USD')).toBe(true);
  });
});
