import { describe, it, expect } from 'vitest';
import { soundModeForTier, shouldTriggerSound, anyAlertLooping } from './alert-sounds';
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

describe('anyAlertLooping', () => {
  const noneAcked = new Set<string>();

  it('returns false for an empty alerts list', () => {
    expect(anyAlertLooping([], noneAcked)).toBe(false);
  });

  it('returns false when no alerts are repeating-tier', () => {
    const alerts = [
      makeAlert('a', 'flood'),
      makeAlert('b', 'watch'),
      makeAlert('c', 'severe-warning'), // single-play, not repeating
    ];
    expect(anyAlertLooping(alerts, noneAcked)).toBe(false);
  });

  it('returns true when at least one repeating-tier alert is un-acked', () => {
    const alerts = [makeAlert('a', 'tornado-warning'), makeAlert('b', 'flood')];
    expect(anyAlertLooping(alerts, noneAcked)).toBe(true);
  });

  it('returns false once every repeating alert is acknowledged', () => {
    const alerts = [
      makeAlert('a', 'tornado-warning'),
      makeAlert('b', 'tstorm-destructive'),
    ];
    const acked = new Set(['a', 'b']);
    expect(anyAlertLooping(alerts, acked)).toBe(false);
  });

  it('returns true if any repeating alert remains un-acked', () => {
    const alerts = [
      makeAlert('a', 'tornado-warning'),
      makeAlert('b', 'tstorm-destructive'),
    ];
    const acked = new Set(['a']); // only one acked
    expect(anyAlertLooping(alerts, acked)).toBe(true);
  });
});
