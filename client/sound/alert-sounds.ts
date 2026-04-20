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

// ========== Web Audio internals ==========

const PULSE_INTERVAL_MS = 1500;
const BEEP_DURATION_MS = 300;
const SINGLE_PLAY_END_DELAY_MS = 400;  // fires onSinglePlayEnd just after the beep tails off

let ctx: AudioContext | null = null;
let unlockAttached = false;

// In-memory state, reset per browser session
const activeLoops = new Map<string, () => void>();
const sessionPlayedIds = new Set<string>();

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    ctx = new AudioCtor();
    return ctx;
  } catch {
    return null;
  }
}

// Browsers block AudioContext playback until the page has received a user
// gesture. Calling resume() or osc.start() from a non-gesture callsite
// (like our poll-driven trigger effect) emits a console warning even
// though it silently fails. Instead: attach a one-time document-level
// listener that calls resume() from inside a real user-gesture event.
// Subsequent playBeep calls then see a 'running' context and proceed
// normally. unlockAttached is reset inside the handler so we can
// re-arm if the context ever gets suspended again (e.g. tab backgrounded).
function attachUnlockListener(): void {
  if (unlockAttached) return;
  if (typeof document === 'undefined') return;
  unlockAttached = true;

  const unlock = () => {
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
    unlockAttached = false;
  };

  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
  document.addEventListener('touchstart', unlock);
}

function playBeep(): boolean {
  const audio = getContext();
  if (!audio) return false;

  if (audio.state !== 'running') {
    // Don't call resume() or osc.start() here — both emit browser
    // warnings when the context is suspended and no user gesture is
    // in-flight. The unlock listener will resume() from a real gesture.
    attachUnlockListener();
    return false;
  }

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
  gain.gain.setValueAtTime(0.25, now + 0.25);
  gain.gain.linearRampToValueAtTime(0, now + BEEP_DURATION_MS / 1000);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + BEEP_DURATION_MS / 1000);
  return true;
}

function startLoop(): () => void {
  playBeep();
  const intervalId = setInterval(playBeep, PULSE_INTERVAL_MS);
  return () => clearInterval(intervalId);
}

// ========== Public orchestrator surface ==========

export function triggerAlertSound(
  alertId: string,
  mode: SoundMode,
  onSinglePlayEnd?: (id: string) => void,
): void {
  if (mode === 'silent') return;
  if (sessionPlayedIds.has(alertId)) return;

  if (mode === 'repeating') {
    // Mark played immediately and start the interval. Each tick's
    // playBeep self-checks for a running context; suspended ticks are
    // silent no-ops until a user gesture unlocks the context, after
    // which subsequent ticks play normally.
    sessionPlayedIds.add(alertId);
    const cancel = startLoop();
    activeLoops.set(alertId, cancel);
  } else {
    // 'single' — only mark played if the beep actually fired. If the
    // context is still suspended, next poll will retry; we don't want
    // to silently self-acknowledge a beep the user never heard.
    const played = playBeep();
    if (played) {
      sessionPlayedIds.add(alertId);
      if (onSinglePlayEnd) {
        setTimeout(() => onSinglePlayEnd(alertId), SINGLE_PLAY_END_DELAY_MS);
      }
    }
  }
}

export function cancelAllLoops(): string[] {
  const cancelled: string[] = [];
  for (const [id, cancel] of activeLoops) {
    cancel();
    cancelled.push(id);
  }
  activeLoops.clear();
  return cancelled;
}

export function pruneSoundState(activeIds: ReadonlySet<string>): void {
  // Drop sessionPlayedIds entries whose alerts are no longer active
  for (const id of sessionPlayedIds) {
    if (!activeIds.has(id)) sessionPlayedIds.delete(id);
  }
  // Cancel any loops whose alert has dropped off the feed
  for (const [id, cancel] of activeLoops) {
    if (!activeIds.has(id)) {
      cancel();
      activeLoops.delete(id);
    }
  }
}
