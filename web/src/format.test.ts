import { describe, it, expect } from 'vitest';
import { money, pct, delta, monthLabel } from './format';

describe('format helpers', () => {
  it('formats money by currency', () => {
    expect(money(1234.5, 'USD')).toContain('1.234,5'); // pt-BR grouping
    expect(money(null, 'USD')).toBe('—');
  });
  it('formats percentages', () => {
    expect(pct(0.664)).toBe('66,4%');
    expect(pct(null)).toBe('—');
  });
  it('computes signed delta vs previous', () => {
    expect(delta(150, 100)).toBeCloseTo(0.5);
    expect(delta(100, 0)).toBe(null);
    expect(delta(100, null)).toBe(null);
  });
  it('labels months in pt-BR', () => {
    expect(monthLabel('2026-04')).toBe('abr/26');
  });
});
