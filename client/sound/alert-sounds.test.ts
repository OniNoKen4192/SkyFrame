import { describe, it, expect } from 'vitest';
import { soundModeForTier, shouldTriggerSound } from './alert-sounds';
import type { Alert, AlertTier } from '../../shared/types';

function makeAlert(id: string, tier: AlertTier): Alert {
  return {
    id,
    event: 'test',
    tier,
    severity: 'Extreme',
    headline: 'test',
    description: 'test',
    issuedAt: '2026-04-19T00:00:00Z',
    effective: '2026-04-19T00:00:00Z',
    expires: '2026-04-19T01:00:00Z',
    areaDesc: 'test',
  };
}

describe('soundModeForTier', () => {
  it('returns "repeating" for all four repeating tiers', () => {
    expect(soundModeForTier('tornado-emergency')).toBe('repeating');
    expect(soundModeForTier('tornado-pds')).toBe('repeating');
    expect(soundModeForTier('tornado-warning')).toBe('repeating');
    expect(soundModeForTier('tstorm-destructive')).toBe('repeating');
  });

  it('returns "single" for severe-warning', () => {
    expect(soundModeForTier('severe-warning')).toBe('single');
  });

  it('returns "silent" for the eight non-sound tiers', () => {
    expect(soundModeForTier('blizzard')).toBe('silent');
    expect(soundModeForTier('winter-storm')).toBe('silent');
    expect(soundModeForTier('flood')).toBe('silent');
    expect(soundModeForTier('heat')).toBe('silent');
    expect(soundModeForTier('special-weather-statement')).toBe('silent');
    expect(soundModeForTier('watch')).toBe('silent');
    expect(soundModeForTier('advisory-high')).toBe('silent');
    expect(soundModeForTier('advisory')).toBe('silent');
  });
});

describe('shouldTriggerSound', () => {
  const empty = new Set<string>();

  it('returns the tier mode for a fresh alert', () => {
    expect(shouldTriggerSound(makeAlert('a', 'tornado-warning'), empty, empty)).toBe('repeating');
    expect(shouldTriggerSound(makeAlert('b', 'severe-warning'), empty, empty)).toBe('single');
  });

  it('returns "silent" when the alert id is in acknowledged', () => {
    const acked = new Set(['a']);
    expect(shouldTriggerSound(makeAlert('a', 'tornado-warning'), acked, empty)).toBe('silent');
  });

  it('returns "silent" when the alert id is in sessionPlayed', () => {
    const played = new Set(['a']);
    expect(shouldTriggerSound(makeAlert('a', 'tornado-warning'), empty, played)).toBe('silent');
  });

  it('returns "silent" when the tier is silent, regardless of acked/played state', () => {
    expect(shouldTriggerSound(makeAlert('a', 'flood'), empty, empty)).toBe('silent');
    expect(shouldTriggerSound(makeAlert('b', 'advisory'), new Set(['b']), empty)).toBe('silent');
  });
});
