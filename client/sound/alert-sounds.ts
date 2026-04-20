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
const BEEP_DURATION_MS = 500;
const BEEP_ATTACK_S = 0.010;  // 10ms ramp-up (avoids click artifact)
const BEEP_RELEASE_S = 0.050; // 50ms ramp-down (avoids click artifact)
const SINGLE_PLAY_END_DELAY_MS = BEEP_DURATION_MS + 100;  // fires onSinglePlayEnd just after the beep tails off

let ctx: AudioContext | null = null;
let unlockAttached = false;

// In-memory state, reset per browser session
const activeLoops = new Map<string, () => void>();
const sessionPlayedIds = new Set<string>();

// Single-play alerts whose first playBeep attempt failed because the
// AudioContext was still suspended. Drained by the unlock listener once
// the context successfully resumes on a user gesture.
const pendingSinglePlays = new Map<string, (id: string) => void>();

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
function drainPendingSinglePlays(): void {
  if (pendingSinglePlays.size === 0) return;
  const entries = [...pendingSinglePlays];
  pendingSinglePlays.clear();
  for (const [alertId, onEnd] of entries) {
    const played = playBeep();
    if (played) {
      sessionPlayedIds.add(alertId);
      setTimeout(() => onEnd(alertId), SINGLE_PLAY_END_DELAY_MS);
    } else {
      // Somehow still not running — put it back in the queue.
      pendingSinglePlays.set(alertId, onEnd);
    }
  }
}

function attachUnlockListener(): void {
  if (unlockAttached) return;
  if (typeof document === 'undefined') return;
  unlockAttached = true;

  const unlock = () => {
    const audio = ctx;
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
    unlockAttached = false;

    if (audio && audio.state === 'suspended') {
      // resume() is async; only drain pending single-plays after the
      // state has transitioned, otherwise playBeep will still see
      // 'suspended' and we'll re-queue everything.
      void audio.resume().then(drainPendingSinglePlays);
    } else {
      drainPendingSinglePlays();
    }
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
  const totalS = BEEP_DURATION_MS / 1000;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + BEEP_ATTACK_S);
  gain.gain.setValueAtTime(0.25, now + totalS - BEEP_RELEASE_S);
  gain.gain.linearRampToValueAtTime(0, now + totalS);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + totalS);
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
    // context is still suspended, queue for retry inside the unlock
    // listener's drainPendingSinglePlays; we don't want to silently
    // self-acknowledge a beep the user never heard, and we can't rely
    // on the trigger effect re-running (it only fires on id-list
    // change, which won't happen while the same alert persists across
    // polls).
    const played = playBeep();
    if (played) {
      sessionPlayedIds.add(alertId);
      if (onSinglePlayEnd) {
        setTimeout(() => onSinglePlayEnd(alertId), SINGLE_PLAY_END_DELAY_MS);
      }
    } else if (onSinglePlayEnd) {
      pendingSinglePlays.set(alertId, onSinglePlayEnd);
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
  // Drop pending single-plays for alerts that have dropped off the feed
  for (const id of pendingSinglePlays.keys()) {
    if (!activeIds.has(id)) pendingSinglePlays.delete(id);
  }
}
