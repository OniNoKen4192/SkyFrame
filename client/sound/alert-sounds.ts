import type { Alert, AlertTier } from '../../shared/types';

export type SoundMode = 'repeating' | 'single' | 'silent';

const REPEATING_TIERS: ReadonlySet<AlertTier> = new Set([
  'tornado-emergency',
  'tornado-pds',
  'tornado-warning',
  'tstorm-destructive',
]);

const SINGLE_PLAY_TIERS: ReadonlySet<AlertTier> = new Set(['severe-warning']);

export function soundModeForTier(tier: AlertTier): SoundMode {
  if (REPEATING_TIERS.has(tier)) return 'repeating';
  if (SINGLE_PLAY_TIERS.has(tier)) return 'single';
  return 'silent';
}

export function shouldTriggerSound(
  alert: Alert,
  acknowledged: ReadonlySet<string>,
  sessionPlayed: ReadonlySet<string>,
): SoundMode {
  const mode = soundModeForTier(alert.tier);
  if (mode === 'silent') return 'silent';
  if (acknowledged.has(alert.id)) return 'silent';
  if (sessionPlayed.has(alert.id)) return 'silent';
  return mode;
}
