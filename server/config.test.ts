import { describe, it, expect } from 'vitest';
import { parseStationOverride } from './config';

describe('parseStationOverride', () => {
  it('returns "auto" for undefined (backwards compat with pre-v1.2.3 configs)', () => {
    expect(parseStationOverride(undefined)).toBe('auto');
  });

  it('returns "auto" for the literal "auto"', () => {
    expect(parseStationOverride('auto')).toBe('auto');
  });

  it('returns "force-secondary" for the literal "force-secondary"', () => {
    expect(parseStationOverride('force-secondary')).toBe('force-secondary');
  });

  it('coerces unknown string values to "auto" (safe default)', () => {
    expect(parseStationOverride('forc-secondary')).toBe('auto');  // typo
    expect(parseStationOverride('FORCE-SECONDARY')).toBe('auto'); // wrong case
    expect(parseStationOverride('')).toBe('auto');                // empty
  });

  it('coerces non-string values to "auto" (corrupt JSON)', () => {
    expect(parseStationOverride(42)).toBe('auto');
    expect(parseStationOverride(true)).toBe('auto');
    expect(parseStationOverride(null)).toBe('auto');
    expect(parseStationOverride({ mode: 'auto' })).toBe('auto');
  });
});
