import { describe, it, expect } from 'vitest';
import { isoToBR, brToIso } from './DateField';

describe('DateField helpers', () => {
  it('formats ISO → dd/mm/aaaa', () => {
    expect(isoToBR('2026-07-07')).toBe('07/07/2026');
    expect(isoToBR('2026-12-06')).toBe('06/12/2026');
  });

  it('returns empty for incomplete/invalid ISO', () => {
    expect(isoToBR('')).toBe('');
    expect(isoToBR('2026-07')).toBe('');
  });

  it('parses dd/mm/aaaa → ISO', () => {
    expect(brToIso('07/07/2026')).toBe('2026-07-07');
    expect(brToIso('06/12/2026')).toBe('2026-12-06');
  });

  it('round-trips both ways', () => {
    expect(brToIso(isoToBR('2025-01-31'))).toBe('2025-01-31');
    expect(isoToBR(brToIso('29/02/2024')!)).toBe('29/02/2024'); // leap year ok
  });

  it('rejects impossible dates and junk', () => {
    expect(brToIso('31/02/2026')).toBeNull();
    expect(brToIso('29/02/2025')).toBeNull(); // not a leap year
    expect(brToIso('7/7/2026')).toBeNull(); // needs zero-padding
    expect(brToIso('2026-07-07')).toBeNull();
    expect(brToIso('')).toBeNull();
  });
});
