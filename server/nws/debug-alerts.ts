import type { AlertTier } from '../../shared/types';
import type { NwsAlertsResponse } from './normalizer';

interface TierSpec {
  event: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
}

const TIER_SPECS: Record<AlertTier, TierSpec> = {
  'tornado-emergency':         { event: 'Tornado Warning',             severity: 'Extreme'  },
  'tornado-pds':               { event: 'Tornado Warning',             severity: 'Extreme'  },
  'tornado-warning':           { event: 'Tornado Warning',             severity: 'Extreme'  },
  'tstorm-destructive':        { event: 'Severe Thunderstorm Warning', severity: 'Extreme'  },
  'severe-warning':            { event: 'Severe Thunderstorm Warning', severity: 'Severe'   },
  'blizzard':                  { event: 'Blizzard Warning',            severity: 'Extreme'  },
  'winter-storm':              { event: 'Winter Storm Warning',        severity: 'Severe'   },
  'flood':                     { event: 'Flood Warning',               severity: 'Severe'   },
  'heat':                      { event: 'Heat Advisory',               severity: 'Moderate' },
  'special-weather-statement': { event: 'Special Weather Statement',   severity: 'Moderate' },
  'watch':                     { event: 'Tornado Watch',               severity: 'Severe'   },
  'advisory-high':             { event: 'Wind Advisory',               severity: 'Minor'    },
  'advisory':                  { event: 'Air Quality Alert',           severity: 'Minor'    },
};

const VALID_TIERS = new Set<string>(Object.keys(TIER_SPECS));

export function parseDebugTiers(raw: string | undefined): AlertTier[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AlertTier => VALID_TIERS.has(s));
}

function parametersForTier(tier: AlertTier): Record<string, string[]> | undefined {
  switch (tier) {
    case 'tornado-emergency':  return { tornadoDamageThreat: ['CATASTROPHIC'] };
    case 'tornado-pds':        return { tornadoDamageThreat: ['CONSIDERABLE'] };
    case 'tstorm-destructive': return { thunderstormDamageThreat: ['DESTRUCTIVE'] };
    default:                   return undefined;
  }
}

export function synthesizeDebugAlerts(tiers: AlertTier[], now: Date): NwsAlertsResponse {
  const effective = now.toISOString();
  const expires = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  return {
    features: tiers.map((tier, index) => {
      const spec = TIER_SPECS[tier];
      const parameters = parametersForTier(tier);
      return {
        properties: {
          id: `debug-${tier}-${index}`,
          event: spec.event,
          severity: spec.severity,
          headline: `DEBUG: ${spec.event} issued for {CITY} (synthetic)`,
          description: 'Synthetic alert for development (SKYFRAME_DEBUG_TIERS env var is active).',
          effective,
          expires,
          areaDesc: 'Debug Mode',
          ...(parameters ? { parameters } : {}),
        },
      };
    }),
  };
}
