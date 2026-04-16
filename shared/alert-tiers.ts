import type { AlertTier } from './types';

const EVENT_TO_TIER: ReadonlyMap<string, AlertTier> = new Map<string, AlertTier>([
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
]);

const TIER_RANK: ReadonlyMap<AlertTier, number> = new Map<AlertTier, number>([
  ['tornado-emergency',          1],
  ['tornado-warning',            2],
  ['severe-warning',             3],
  ['blizzard',                   4],
  ['winter-storm',               5],
  ['flood',                      6],
  ['heat',                       7],
  ['special-weather-statement',  8],
  ['watch',                      9],
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
  'tornado-emergency':         { base: '#9400D3', dark: '#5a007e' },
  'tornado-warning':           { base: '#ff4444', dark: '#a02828' },
  'severe-warning':            { base: '#ff8800', dark: '#a05500' },
  'blizzard':                  { base: '#ffffff', dark: '#bbbbbb' },
  'winter-storm':              { base: '#4488ff', dark: '#2a55a0' },
  'flood':                     { base: '#22cc66', dark: '#147a3d' },
  'heat':                      { base: '#ff5533', dark: '#a0331c' },
  'special-weather-statement': { base: '#ee82ee', dark: '#9d539d' },
  'watch':                     { base: '#ffdd33', dark: '#a08820' },
};
