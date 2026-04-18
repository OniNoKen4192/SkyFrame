import { describe, it, expect } from 'vitest';
import { mapEventToTier, tierRank, TIER_COLORS, classifyAlert } from './alert-tiers';
import type { AlertTier } from './types';

describe('mapEventToTier', () => {
  it.each([
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
    ['Wind Advisory',              'advisory-high'],
    ['Winter Weather Advisory',    'advisory-high'],
    ['Dense Fog Advisory',         'advisory-high'],
    ['Wind Chill Advisory',        'advisory-high'],
    ['Freeze Warning',             'advisory-high'],
    ['Freeze Watch',               'advisory-high'],
    ['Frost Advisory',             'advisory-high'],
  ] as Array<[string, AlertTier]>)('maps "%s" to %s', (event, tier) => {
    expect(mapEventToTier(event)).toBe(tier);
  });

  it.each([
    'Tornado Warning',            // now handled by classifyAlert only
    'Tornado Emergency',          // now handled by classifyAlert only
    'Severe Thunderstorm Warning', // now handled by classifyAlert only
    'Air Quality Alert',
    'Hurricane Warning',
    'Lake Effect Snow Advisory',
    'Beach Hazards Statement',
    '',
    'Some Made Up Alert',
  ])('returns null for unmapped event "%s"', (event) => {
    expect(mapEventToTier(event)).toBeNull();
  });
});

describe('tierRank', () => {
  it('orders all tiers from most-severe (1) to least-severe (13)', () => {
    expect(tierRank('tornado-emergency')).toBe(1);
    expect(tierRank('tornado-pds')).toBe(2);
    expect(tierRank('tornado-warning')).toBe(3);
    expect(tierRank('tstorm-destructive')).toBe(4);
    expect(tierRank('severe-warning')).toBe(5);
    expect(tierRank('blizzard')).toBe(6);
    expect(tierRank('winter-storm')).toBe(7);
    expect(tierRank('flood')).toBe(8);
    expect(tierRank('heat')).toBe(9);
    expect(tierRank('special-weather-statement')).toBe(10);
    expect(tierRank('watch')).toBe(11);
    expect(tierRank('advisory-high')).toBe(12);
    expect(tierRank('advisory')).toBe(13);
  });

  it('returns smaller numbers for more-severe tiers', () => {
    expect(tierRank('tornado-emergency')).toBeLessThan(tierRank('tornado-pds'));
    expect(tierRank('tornado-pds')).toBeLessThan(tierRank('tornado-warning'));
    expect(tierRank('tornado-warning')).toBeLessThan(tierRank('tstorm-destructive'));
    expect(tierRank('tstorm-destructive')).toBeLessThan(tierRank('severe-warning'));
    expect(tierRank('severe-warning')).toBeLessThan(tierRank('watch'));
    expect(tierRank('watch')).toBeLessThan(tierRank('advisory-high'));
    expect(tierRank('advisory-high')).toBeLessThan(tierRank('advisory'));
  });
});

describe('TIER_COLORS', () => {
  it('has base + dark for every AlertTier value', () => {
    const tiers: AlertTier[] = [
      'tornado-emergency', 'tornado-pds', 'tornado-warning',
      'tstorm-destructive', 'severe-warning',
      'blizzard', 'winter-storm', 'flood', 'heat',
      'special-weather-statement', 'watch',
      'advisory-high', 'advisory',
    ];
    for (const t of tiers) {
      expect(TIER_COLORS[t]).toBeDefined();
      expect(TIER_COLORS[t].base).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(TIER_COLORS[t].dark).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('classifyAlert', () => {
  describe('tornado family', () => {
    it('Tornado Warning with no parameters → tornado-warning', () => {
      expect(classifyAlert('Tornado Warning')).toBe('tornado-warning');
    });

    it('Tornado Warning with tornadoDamageThreat=CONSIDERABLE → tornado-pds', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['CONSIDERABLE'] }))
        .toBe('tornado-pds');
    });

    it('Tornado Warning with tornadoDamageThreat=CATASTROPHIC → tornado-emergency', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['CATASTROPHIC'] }))
        .toBe('tornado-emergency');
    });

    it('Tornado Warning with unknown damage threat → tornado-warning (fallback)', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['UNKNOWN_FUTURE'] }))
        .toBe('tornado-warning');
    });

    it('accepts lowercase damage threat values (case-insensitive)', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['considerable'] }))
        .toBe('tornado-pds');
    });

    it('tolerates bare string parameter value (not wrapped in array)', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: 'CONSIDERABLE' }))
        .toBe('tornado-pds');
    });

    it('legacy event "Tornado Emergency" with no parameters → tornado-emergency', () => {
      expect(classifyAlert('Tornado Emergency')).toBe('tornado-emergency');
    });

    it('legacy event "Tornado Emergency" with CONSIDERABLE threat → still tornado-emergency', () => {
      // Structured threat wins if present; but legacy event alone also resolves correctly.
      expect(classifyAlert('Tornado Emergency', { tornadoDamageThreat: ['CATASTROPHIC'] }))
        .toBe('tornado-emergency');
    });

    it('ignores empty parameter array', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: [] }))
        .toBe('tornado-warning');
    });
  });

  describe('thunderstorm family', () => {
    it('Severe Thunderstorm Warning with no parameters → severe-warning', () => {
      expect(classifyAlert('Severe Thunderstorm Warning')).toBe('severe-warning');
    });

    it('Severe Thunderstorm Warning with thunderstormDamageThreat=DESTRUCTIVE → tstorm-destructive', () => {
      expect(classifyAlert('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['DESTRUCTIVE'] }))
        .toBe('tstorm-destructive');
    });

    it('Severe Thunderstorm Warning with thunderstormDamageThreat=CONSIDERABLE → severe-warning (not promoted)', () => {
      expect(classifyAlert('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['CONSIDERABLE'] }))
        .toBe('severe-warning');
    });

    it('Severe Thunderstorm Warning with unknown threat value → severe-warning (fallback)', () => {
      expect(classifyAlert('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['UNKNOWN'] }))
        .toBe('severe-warning');
    });
  });

  describe('other events', () => {
    it('delegates to mapEventToTier for non-tornado, non-tstorm events', () => {
      expect(classifyAlert('Blizzard Warning')).toBe('blizzard');
      expect(classifyAlert('Flash Flood Warning')).toBe('flood');
      expect(classifyAlert('Tornado Watch')).toBe('watch');
    });

    it('returns "advisory" (catch-all) for unknown events instead of null', () => {
      expect(classifyAlert('Made Up Alert')).toBe('advisory');
      expect(classifyAlert('Air Quality Alert')).toBe('advisory');
      expect(classifyAlert('Beach Hazards Statement')).toBe('advisory');
      expect(classifyAlert('')).toBe('advisory');
    });

    it('returns "advisory-high" for known advisory-high events', () => {
      expect(classifyAlert('Wind Advisory')).toBe('advisory-high');
      expect(classifyAlert('Winter Weather Advisory')).toBe('advisory-high');
      expect(classifyAlert('Freeze Warning')).toBe('advisory-high');
    });

    it('return type is non-nullable AlertTier (never returns null)', () => {
      // Compile-time assertion: TS should narrow this to AlertTier (no null branch).
      const result: AlertTier = classifyAlert('Anything');
      expect(typeof result).toBe('string');
    });

    it('ignores parameters on non-escalation events', () => {
      // Garbage parameters on a blizzard don't change the outcome.
      expect(classifyAlert('Blizzard Warning', { tornadoDamageThreat: ['CATASTROPHIC'] }))
        .toBe('blizzard');
    });
  });
});
