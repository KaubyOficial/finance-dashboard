// S7.3 — timezone, DST and leap-year handling made explicit.
import { describe, it, expect } from 'vitest';
import { todayLA, todayUTC, addDays, daysBetween, monthEnd, monthsBetween } from '../src/util/dates.js';

describe('timezone: YouTube day is America/Los_Angeles', () => {
  it('LA date differs from UTC late at night', () => {
    // 2026-03-01 05:00 UTC → LA is still 2026-02-28 (UTC-8 PST)
    const instant = new Date('2026-03-01T05:00:00Z');
    expect(todayUTC(instant)).toBe('2026-03-01');
    expect(todayLA(instant)).toBe('2026-02-28');
  });
});

describe('leap year + DST safe date math', () => {
  it('addDays crosses a leap day correctly', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('addDays is unaffected by US DST spring-forward', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });
  it('monthEnd knows February length', () => {
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });
  it('monthsBetween spans a year boundary', () => {
    expect(monthsBetween('2025-11-15', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('daysBetween is inclusive-diff', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30);
  });
});
