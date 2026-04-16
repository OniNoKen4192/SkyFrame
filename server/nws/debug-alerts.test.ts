import { describe, it, expect } from 'vitest';
import { parseDebugTiers, synthesizeDebugAlerts } from './debug-alerts';
import type { AlertTier } from '../../shared/types';

describe('parseDebugTiers', () => {
  it('returns [] for undefined input', () => {
    expect(parseDebugTiers(undefined)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(parseDebugTiers('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(parseDebugTiers('   ')).toEqual([]);
  });

  it('parses a single valid tier', () => {
    expect(parseDebugTiers('tornado-warning')).toEqual(['tornado-warning']);
  });

  it('parses comma-separated tiers in input order', () => {
    expect(parseDebugTiers('tornado-warning,flood')).toEqual(['tornado-warning', 'flood']);
  });

  it('tolerates surrounding and inner whitespace', () => {
    expect(parseDebugTiers(' tornado-warning , flood ')).toEqual(['tornado-warning', 'flood']);
  });

  it('silently drops unknown tier names', () => {
    expect(parseDebugTiers('made-up-tier')).toEqual([]);
  });

  it('drops unknowns while keeping valid tiers in order', () => {
    expect(parseDebugTiers('tornado-warning,nonsense,flood')).toEqual(['tornado-warning', 'flood']);
  });

  it('accepts every defined AlertTier value', () => {
    const all: AlertTier[] = [
      'tornado-emergency', 'tornado-warning', 'severe-warning',
      'blizzard', 'winter-storm', 'flood', 'heat',
      'special-weather-statement', 'watch',
    ];
    expect(parseDebugTiers(all.join(','))).toEqual(all);
  });
});

describe('synthesizeDebugAlerts', () => {
  const NOW = new Date('2026-04-16T17:00:00-05:00');

  it('returns { features: [] } for empty input', () => {
    expect(synthesizeDebugAlerts([], NOW)).toEqual({ features: [] });
  });

  it.each([
    ['tornado-emergency',          'Tornado Emergency',           'Extreme'],
    ['tornado-warning',            'Tornado Warning',             'Extreme'],
    ['severe-warning',             'Severe Thunderstorm Warning', 'Severe'],
    ['blizzard',                   'Blizzard Warning',            'Extreme'],
    ['winter-storm',               'Winter Storm Warning',        'Severe'],
    ['flood',                      'Flood Warning',               'Severe'],
    ['heat',                       'Heat Advisory',               'Moderate'],
    ['special-weather-statement',  'Special Weather Statement',   'Moderate'],
    ['watch',                      'Tornado Watch',               'Severe'],
  ] as Array<[AlertTier, string, string]>)(
    'synthesizes %s with event "%s" and severity %s',
    (tier, event, severity) => {
      const result = synthesizeDebugAlerts([tier], NOW);
      expect(result.features).toHaveLength(1);
      expect(result.features[0]!.properties.event).toBe(event);
      expect(result.features[0]!.properties.severity).toBe(severity);
    },
  );

  it('sets expires exactly one hour after effective', () => {
    const result = synthesizeDebugAlerts(['tornado-warning'], NOW);
    const props = result.features[0]!.properties;
    const effectiveMs = Date.parse(props.effective);
    const expiresMs = Date.parse(props.expires);
    expect(expiresMs - effectiveMs).toBe(60 * 60 * 1000);
  });

  it('uses now as the effective time (ISO string)', () => {
    const result = synthesizeDebugAlerts(['flood'], NOW);
    expect(result.features[0]!.properties.effective).toBe(NOW.toISOString());
  });

  it('preserves input order across multiple tiers', () => {
    const result = synthesizeDebugAlerts(['watch', 'tornado-warning', 'flood'], NOW);
    expect(result.features.map((f) => f.properties.event)).toEqual([
      'Tornado Watch',
      'Tornado Warning',
      'Flood Warning',
    ]);
  });

  it('assigns ids following the debug-<tier>-<index> pattern', () => {
    const result = synthesizeDebugAlerts(['tornado-warning', 'flood', 'tornado-warning'], NOW);
    expect(result.features.map((f) => f.properties.id)).toEqual([
      'debug-tornado-warning-0',
      'debug-flood-1',
      'debug-tornado-warning-2',
    ]);
  });

  it('sets areaDesc to "Debug Mode"', () => {
    const result = synthesizeDebugAlerts(['heat'], NOW);
    expect(result.features[0]!.properties.areaDesc).toBe('Debug Mode');
  });

  it('produces a headline that includes "DEBUG" and the event name', () => {
    const result = synthesizeDebugAlerts(['tornado-warning'], NOW);
    const headline = result.features[0]!.properties.headline;
    expect(headline).toContain('DEBUG');
    expect(headline).toContain('Tornado Warning');
  });

  it('describes itself as a synthetic alert mentioning the env var', () => {
    const result = synthesizeDebugAlerts(['flood'], NOW);
    expect(result.features[0]!.properties.description).toContain('SKYFRAME_DEBUG_TIERS');
  });
});
