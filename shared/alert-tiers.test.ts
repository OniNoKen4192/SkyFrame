import { describe, it, expect } from 'vitest';
import { mapEventToTier, tierRank, TIER_COLORS } from './alert-tiers';
import type { AlertTier } from './types';

describe('mapEventToTier', () => {
  it.each([
    ['Tornado Emergency',          'tornado-emergency'],
    ['Tornado Warning',            'tornado-warning'],
    ['Severe Thunderstorm Warning', 'severe-warning'],
    ['Blizzard Warning',           'blizzard'],
    ['Winter Storm Warning',       'winter-storm'],
    ['Flood Warning',              'flood'],
    ['Flash Flood Warning',        'flood'],
    ['Heat Advisory',              'heat'],
    ['Excessive Heat Warning',     'heat'],
    ['Excessive Heat Watch',       'heat'],
    ['Special Weather Statement',  'special-weather-statement'],
    ['Tornado Watch',              'watch'],
    ['Severe Thunderstorm Watch',  'watch'],
  ] as Array<[string, AlertTier]>)('maps "%s" to %s', (event, tier) => {
    expect(mapEventToTier(event)).toBe(tier);
  });

  it.each([
    'Wind Advisory',
    'Air Quality Alert',
    'Frost Advisory',
    'Dense Fog Advisory',
    'Hurricane Warning',
    '',
    'Some Made Up Alert',
  ])('returns null for unmapped event "%s"', (event) => {
    expect(mapEventToTier(event)).toBeNull();
  });
});

describe('tierRank', () => {
  it('orders all tiers from most-severe (1) to least-severe (9)', () => {
    expect(tierRank('tornado-emergency')).toBe(1);
    expect(tierRank('tornado-warning')).toBe(2);
    expect(tierRank('severe-warning')).toBe(3);
    expect(tierRank('blizzard')).toBe(4);
    expect(tierRank('winter-storm')).toBe(5);
    expect(tierRank('flood')).toBe(6);
    expect(tierRank('heat')).toBe(7);
    expect(tierRank('special-weather-statement')).toBe(8);
    expect(tierRank('watch')).toBe(9);
  });

  it('returns smaller numbers for more-severe tiers', () => {
    expect(tierRank('tornado-emergency')).toBeLessThan(tierRank('tornado-warning'));
    expect(tierRank('tornado-warning')).toBeLessThan(tierRank('severe-warning'));
    expect(tierRank('severe-warning')).toBeLessThan(tierRank('watch'));
  });
});

describe('TIER_COLORS', () => {
  it('has base + dark for every AlertTier value', () => {
    const tiers: AlertTier[] = [
      'tornado-emergency', 'tornado-warning', 'severe-warning',
      'blizzard', 'winter-storm', 'flood', 'heat',
      'special-weather-statement', 'watch',
    ];
    for (const t of tiers) {
      expect(TIER_COLORS[t]).toBeDefined();
      expect(TIER_COLORS[t].base).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(TIER_COLORS[t].dark).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
