import { describe, it, expect } from 'vitest';
import { allocateShared } from '../src/engine/allocation.js';

const active = ['a', 'b', 'c'];

function sum(map) {
  return [...map.values()].reduce((x, y) => x + y, 0);
}

describe('allocateShared', () => {
  it('equal splits evenly and sums exactly to the amount', () => {
    const m = allocateShared({ allocation_rule: 'equal' }, 100, { activeChannels: active, revenueByChannel: new Map() });
    expect(sum(m)).toBeCloseTo(100, 9);
    expect(m.get('a')).toBeCloseTo(100 / 3, 9);
  });

  it('by_revenue splits proportionally', () => {
    const rev = new Map([['a', 300], ['b', 100], ['c', 0]]);
    const m = allocateShared({ allocation_rule: 'by_revenue' }, 40, { activeChannels: active, revenueByChannel: rev });
    expect(m.get('a')).toBeCloseTo(30, 9);
    expect(m.get('b')).toBeCloseTo(10, 9);
    expect(sum(m)).toBeCloseTo(40, 9);
  });

  it('by_revenue with zero revenue everywhere falls back to equal', () => {
    const rev = new Map([['a', 0], ['b', 0], ['c', 0]]);
    const m = allocateShared({ allocation_rule: 'by_revenue' }, 90, { activeChannels: active, revenueByChannel: rev });
    expect(m.get('a')).toBeCloseTo(30, 9);
    expect(sum(m)).toBeCloseTo(90, 9);
  });

  it('custom uses the given percentages', () => {
    const m = allocateShared(
      { allocation_rule: 'custom', allocation_custom: { a: 50, b: 30, c: 20 } },
      200,
      { activeChannels: active, revenueByChannel: new Map() }
    );
    expect(m.get('a')).toBeCloseTo(100, 9);
    expect(m.get('b')).toBeCloseTo(60, 9);
    expect(sum(m)).toBeCloseTo(200, 9);
  });

  it('custom that does not sum to 100 throws', () => {
    expect(() =>
      allocateShared({ allocation_rule: 'custom', allocation_custom: { a: 50, b: 30 } }, 100, { activeChannels: active, revenueByChannel: new Map() })
    ).toThrow(/100%/);
  });

  it('no active channels → empty allocation', () => {
    const m = allocateShared({ allocation_rule: 'equal' }, 100, { activeChannels: [], revenueByChannel: new Map() });
    expect(m.size).toBe(0);
  });
});
