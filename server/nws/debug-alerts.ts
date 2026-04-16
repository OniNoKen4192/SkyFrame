import type { AlertTier } from '../../shared/types';
import type { NwsAlertsResponse } from './normalizer';

interface TierSpec {
  event: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
}

const TIER_SPECS: Record<AlertTier, TierSpec> = {
  'tornado-emergency':         { event: 'Tornado Emergency',           severity: 'Extreme'  },
  'tornado-warning':           { event: 'Tornado Warning',             severity: 'Extreme'  },
  'severe-warning':            { event: 'Severe Thunderstorm Warning', severity: 'Severe'   },
  'blizzard':                  { event: 'Blizzard Warning',            severity: 'Extreme'  },
  'winter-storm':              { event: 'Winter Storm Warning',        severity: 'Severe'   },
  'flood':                     { event: 'Flood Warning',               severity: 'Severe'   },
  'heat':                      { event: 'Heat Advisory',               severity: 'Moderate' },
  'special-weather-statement': { event: 'Special Weather Statement',   severity: 'Moderate' },
  'watch':                     { event: 'Tornado Watch',               severity: 'Severe'   },
};

const VALID_TIERS = new Set<string>(Object.keys(TIER_SPECS));

export function parseDebugTiers(raw: string | undefined): AlertTier[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AlertTier => VALID_TIERS.has(s));
}

export function synthesizeDebugAlerts(tiers: AlertTier[], now: Date): NwsAlertsResponse {
  const effective = now.toISOString();
  const expires = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  return {
    features: tiers.map((tier, index) => {
      const spec = TIER_SPECS[tier];
      return {
        properties: {
          id: `debug-${tier}-${index}`,
          event: spec.event,
          severity: spec.severity,
          headline: `DEBUG: ${spec.event} issued for Oak Creek (synthetic)`,
          description: 'Synthetic alert for development (SKYFRAME_DEBUG_TIERS env var is active).',
          effective,
          expires,
          areaDesc: 'Debug Mode',
        },
      };
    }),
  };
}
