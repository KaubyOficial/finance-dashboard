import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computePnL } from '../src/engine/pnl.js';
import { makeConverter } from '../src/engine/fx.js';
import { addDays, daysBetween, monthsBetween } from '../src/util/dates.js';

// Constant FX so currency-scaling is uniform (needed for the margin invariant).
function constantFx() {
  const rows = [];
  for (let d = '2026-01-01'; daysBetween(d, '2026-03-31') >= 0; d = addDays(d, 1)) {
    rows.push({ date: d, base: 'EUR', quote: 'USD', rate: 1.08 });
    rows.push({ date: d, base: 'EUR', quote: 'BRL', rate: 5.8 });
  }
  return makeConverter(rows);
}
const convert = constantFx();

const dateArb = fc.constantFrom('2026-01-10', '2026-02-10', '2026-03-10', '2026-01-25', '2026-02-25');
const chanArb = fc.constantFrom('a', 'b', 'c');

const inputsArb = fc.record({
  channels: fc.constant([
    { id: 'a', name: 'A', launch_date: '2025-01-01', active: 1 },
    { id: 'b', name: 'B', launch_date: '2025-01-01', active: 1 },
    { id: 'c', name: 'C', launch_date: '2025-01-01', active: 1 },
  ]),
  revenue: fc.array(
    fc.record({ channel_id: chanArb, date: dateArb, currency: fc.constant('USD'), estimated_revenue: fc.integer({ min: 0, max: 500 }), views: fc.integer({ min: 0, max: 10000 }) }),
    { maxLength: 12 }
  ),
  sales: fc.array(
    fc.record({
      channel_id: fc.option(chanArb, { nil: null }),
      order_date: dateArb,
      commission_amount: fc.integer({ min: 0, max: 600 }),
      commission_currency: fc.constant('BRL'),
      refund_amount: fc.constant(0),
    }),
    { maxLength: 12 }
  ),
  costs: fc.array(
    fc.oneof(
      fc.record({ kind: fc.constant('recurring'), category: fc.constant('x'), amount: fc.integer({ min: 1, max: 200 }), currency: fc.constant('USD'), channel_id: chanArb, start_date: fc.constant('2026-01-01'), end_date: fc.constant(null) }),
      fc.record({ kind: fc.constant('recurring'), category: fc.constant('shared'), amount: fc.integer({ min: 1, max: 200 }), currency: fc.constant('USD'), channel_id: fc.constant(null), allocation_rule: fc.constantFrom('equal', 'by_revenue'), start_date: fc.constant('2026-01-01'), end_date: fc.constant(null) })
    ),
    { maxLength: 6 }
  ),
});

const range = { from: '2026-01-01', to: '2026-03-31' };

describe('P&L engine — properties', () => {
  it('sum of channels equals the network total', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const { byChannel, network } = computePnL(inputs, { ...range, displayCurrency: 'USD', convert });
        const rev = byChannel.reduce((s, r) => s + r.revenue_total, 0);
        const profit = byChannel.reduce((s, r) => s + r.profit, 0);
        // All-empty inputs produce no cells → network is null (≡ zero totals).
        expect(rev).toBeCloseTo(network ? network.revenue_total : 0, 5);
        expect(profit).toBeCloseTo(network ? network.profit : 0, 5);
      })
    );
  });

  it('a period equals the sum of its month sub-periods', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const whole = computePnL(inputs, { ...range, displayCurrency: 'USD', convert }).network;
        let parts = 0;
        for (const m of monthsBetween(range.from, range.to)) {
          const sub = computePnL(inputs, { from: `${m}-01`, to: `${m}-28`, displayCurrency: 'USD', convert });
          parts += sub.network ? sub.network.revenue_total : 0;
        }
        expect(parts).toBeCloseTo(whole ? whole.revenue_total : 0, 5);
      })
    );
  });

  it('changing display currency does not change the margin (constant FX)', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const usd = computePnL(inputs, { ...range, displayCurrency: 'USD', convert }).network;
        const brl = computePnL(inputs, { ...range, displayCurrency: 'BRL', convert }).network;
        fc.pre(usd && usd.margin != null && brl && brl.margin != null);
        expect(usd.margin).toBeCloseTo(brl.margin, 6);
      })
    );
  });

  it('a shared cost is fully allocated (allocated across cells sums to the cost)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.constantFrom('equal', 'by_revenue'),
        (amount, rule) => {
          const inputs = {
            channels: [
              { id: 'a', name: 'A', launch_date: '2025-01-01', active: 1 },
              { id: 'b', name: 'B', launch_date: '2025-01-01', active: 1 },
            ],
            revenue: [{ channel_id: 'a', date: '2026-01-10', currency: 'USD', estimated_revenue: 100, views: 0 }],
            sales: [],
            costs: [{ kind: 'one_off', category: 's', amount, currency: 'USD', channel_id: null, allocation_rule: rule, start_date: '2026-01-10' }],
          };
          const { cells } = computePnL(inputs, { from: '2026-01-01', to: '2026-01-31', displayCurrency: 'USD', convert });
          const allocated = cells.reduce((s, c) => s + c.cost_allocated, 0);
          expect(allocated).toBeCloseTo(amount, 6);
        }
      )
    );
  });
});
