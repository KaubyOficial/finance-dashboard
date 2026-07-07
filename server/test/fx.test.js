import { describe, it, expect } from 'vitest';
import { makeConverter } from '../src/engine/fx.js';
import { upsertFx } from '../src/sync/fx.js';
import { makeDb } from './helpers.js';

const rows = [
  { date: '2026-04-01', base: 'EUR', quote: 'USD', rate: 1.08 },
  { date: '2026-04-01', base: 'EUR', quote: 'BRL', rate: 5.8 },
  { date: '2026-04-03', base: 'EUR', quote: 'USD', rate: 1.1 },
  { date: '2026-04-03', base: 'EUR', quote: 'BRL', rate: 6.0 },
];

describe('makeConverter', () => {
  const convert = makeConverter(rows);

  it('returns the amount unchanged for same currency', () => {
    expect(convert(100, 'USD', 'USD', '2026-04-01')).toBe(100);
  });

  it('crosses through EUR', () => {
    // 580 BRL → EUR (÷5.8=100) → USD (×1.08) = 108
    expect(convert(580, 'BRL', 'USD', '2026-04-01')).toBeCloseTo(108, 6);
    expect(convert(100, 'EUR', 'USD', '2026-04-01')).toBeCloseTo(108, 6);
  });

  it('falls back to the last available rate on a gap (weekend)', () => {
    // 2026-04-02 has no row → uses 2026-04-01 rates
    expect(convert(580, 'BRL', 'USD', '2026-04-02')).toBeCloseTo(108, 6);
  });

  it('clamps forward to the newest rate for a date with no published rate yet', () => {
    // 2026-04-04 is one day past the latest row (2026-04-03) → uses 2026-04-03 rates.
    expect(convert(600, 'BRL', 'USD', '2026-04-04')).toBeCloseTo(110, 6); // 600/6.0*1.1
    // Even a far-future date clamps to the newest rate rather than blanking the P&L.
    expect(convert(600, 'BRL', 'USD', '2027-01-01')).toBeCloseTo(110, 6);
  });

  it('still errors when there is no FX data at all', () => {
    const empty = makeConverter([]);
    expect(() => empty(100, 'USD', 'BRL', '2026-04-01')).toThrow(/câmbio|range/);
  });
});

describe('upsertFx idempotency', () => {
  it('re-importing the same day does not duplicate', () => {
    const db = makeDb();
    upsertFx(db, { '2026-04-01': { USD: 1.08, BRL: 5.8 } });
    upsertFx(db, { '2026-04-01': { USD: 1.09, BRL: 5.9 } });
    const n = db.prepare("SELECT COUNT(*) c FROM fx_rates WHERE date='2026-04-01'").get().c;
    expect(n).toBe(2); // USD + BRL, updated in place not duplicated
    const usd = db.prepare("SELECT rate FROM fx_rates WHERE date='2026-04-01' AND quote='USD'").get().rate;
    expect(usd).toBe(1.09);
  });
});
