import type { AlertTier } from './types';

const EVENT_TO_TIER: ReadonlyMap<string, AlertTier> = new Map<string, AlertTier>([
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
]);

const TIER_RANK: ReadonlyMap<AlertTier, number> = new Map<AlertTier, number>([
  ['tornado-emergency',          1],
  ['tornado-pds',                2],
  ['tornado-warning',            3],
  ['tstorm-destructive',         4],
  ['severe-warning',             5],
  ['blizzard',                   6],
  ['winter-storm',               7],
  ['flood',                      8],
  ['heat',                       9],
  ['special-weather-statement', 10],
  ['watch',                     11],
  ['advisory-high',             12],
  ['advisory',                  13],
]);

export function mapEventToTier(event: string): AlertTier | null {
  return EVENT_TO_TIER.get(event) ?? null;
}

export function tierRank(tier: AlertTier): number {
  return TIER_RANK.get(tier) ?? 99;
}

// Two-shade palette per tier. Base is the tier color; dark is used for
// alternating stripes in the AlertBanner. Dark values are roughly the base
// at brightness ~0.6; tune live if needed.
export const TIER_COLORS: Record<AlertTier, { base: string; dark: string }> = {
  'tornado-emergency':         { base: '#b052e4', dark: '#6f3490' },
  'tornado-pds':               { base: '#ff55c8', dark: '#a1367e' },
  'tornado-warning':           { base: '#ff4444', dark: '#a02828' },
  'tstorm-destructive':        { base: '#ff4466', dark: '#a12b40' },
  'severe-warning':            { base: '#ff8800', dark: '#a05500' },
  'blizzard':                  { base: '#ffffff', dark: '#bbbbbb' },
  'winter-storm':              { base: '#4488ff', dark: '#2a55a0' },
  'flood':                     { base: '#22cc66', dark: '#147a3d' },
  'heat':                      { base: '#ff5533', dark: '#a0331c' },
  'special-weather-statement': { base: '#ee82ee', dark: '#9d539d' },
  'watch':                     { base: '#ffdd33', dark: '#a08820' },
  'advisory-high':             { base: '#ffaa22', dark: '#a06d15' },
  'advisory':                  { base: '#00e5d1', dark: '#008e82' },
};

function firstValue(value: string[] | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return value.length > 0 ? value[0] : undefined;
}

export function classifyAlert(
  event: string,
  parameters?: Record<string, string[] | string> | undefined,
): AlertTier {
  if (event === 'Tornado Warning' || event === 'Tornado Emergency') {
    const threat = firstValue(parameters?.tornadoDamageThreat)?.toUpperCase();
    if (threat === 'CATASTROPHIC') return 'tornado-emergency';
    if (threat === 'CONSIDERABLE') return 'tornado-pds';
    if (event === 'Tornado Emergency') return 'tornado-emergency';
    return 'tornado-warning';
  }
  if (event === 'Severe Thunderstorm Warning') {
    const threat = firstValue(parameters?.thunderstormDamageThreat)?.toUpperCase();
    if (threat === 'DESTRUCTIVE') return 'tstorm-destructive';
    return 'severe-warning';
  }
  return mapEventToTier(event) ?? 'advisory';
}
