# Alert Sounds — Design

**Date:** 2026-04-19
**Status:** Approved for implementation planning
**v1.2 scope:** Feature 6 ([2026-04-17-v1.2-roadmap-design.md](2026-04-17-v1.2-roadmap-design.md), Section 6)
**Branch:** `feat/alert-sounds`, off `main`

## Summary

When a new alert appears in a qualifying tier, the client synthesizes an audible tone via the Web Audio API. Top-severity tiers (`tornado-emergency`, `tornado-pds`, `tornado-warning`, `tstorm-destructive`) loop a pulsing beep every 1.5 seconds until the user acknowledges by clicking the alert banner. `severe-warning` plays one beep. All other tiers are silent.

## Decisions settled during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Acknowledgment surface | Single `onClick` on the `AlertBanner` root `<div>` | Catches all three spec-listed actions (banner click, detail-modal open, dismiss ×) via event bubbling — one handler, zero coverage gaps |
| Acknowledgment scope | Global — silences ALL currently-looping sounds | Matches spec: an active tornado-class alert is a high-stress moment; forcing per-alert silence adds friction at the wrong time |
| Single-play self-acknowledge | After the tone finishes playing, add the alert ID to the acknowledged set | If a severe-warning beep plays and the user doesn't click anything, reloading shouldn't re-beep. The sound finishing cleanly is effectively "acknowledged" |
| Persistent set scope | One set, `soundAcknowledgedAlertIds`, in localStorage | Matches the existing `dismissed` pattern (same shape, same pruning effect) |
| Autoplay policy | Silent degradation — fail gracefully if browser blocks audio before first user gesture | Trying to pre-arm AudioContext via a document-level gesture listener adds complexity for a case that self-resolves once the user clicks anywhere |

## Scope

**In scope:**
- New module `client/sound/alert-sounds.ts` — Web Audio synthesis + loop management + pure predicate helpers
- New test file `client/sound/alert-sounds.test.ts` — unit tests for the pure predicates
- `App.tsx` owns the `soundAcknowledgedAlertIds` state, passes an acknowledge callback to `AlertBanner`, and runs a `useEffect` that calls `triggerAlertSound` per qualifying alert on each poll
- `AlertBanner.tsx` gains an `onAcknowledgeSounds` prop and fires it from a root-level `onClick` handler
- Localhost-agnostic — works on any hostname (audio is browser-side, not a permission-gated API like Geolocation)

**Out of scope (v1.2):**
- Mute toggle (deferred to a future settings panel)
- Volume control
- Per-alert / per-tier sound customization
- Visual "sound playing" indicator on the banner
- Desktop notifications / system-level sound
- Screen flashes or other attention-getting visuals
- Fallback to an audio file if Web Audio is unsupported — silent degradation is acceptable
- "Replay last alert" button
- Keyboard shortcut for silence — banner click is the one-interaction handle

## Tier → audio behavior

| Tier | Sound |
|---|---|
| `tornado-emergency` | Repeating pulse (1.5s interval) until acknowledged |
| `tornado-pds` | Repeating pulse until acknowledged |
| `tornado-warning` | Repeating pulse until acknowledged |
| `tstorm-destructive` | Repeating pulse until acknowledged |
| `severe-warning` | Single play |
| `blizzard`, `winter-storm`, `flood`, `heat`, `special-weather-statement`, `watch`, `advisory-high`, `advisory` | Silent |

Encoded as two read-only sets at the top of `alert-sounds.ts`:

```typescript
const REPEATING_TIERS: ReadonlySet<AlertTier> = new Set([
  'tornado-emergency', 'tornado-pds', 'tornado-warning', 'tstorm-destructive',
]);
const SINGLE_PLAY_TIERS: ReadonlySet<AlertTier> = new Set(['severe-warning']);
```

## State management

### Persistent state — `App.tsx`

```typescript
const SOUND_ACK_KEY = 'skyframe.alerts.soundAcknowledged';

function loadSoundAcked(): Set<string> { /* same shape as loadDismissed */ }
function saveSoundAcked(set: Set<string>): void { /* same shape as saveDismissed */ }

const [soundAcked, setSoundAcked] = useState<Set<string>>(() => loadSoundAcked());
```

Parallels the existing `dismissed` pattern exactly. When an alert ID drops off the NWS feed, it's pruned from `soundAcked` the same way dismissed IDs are pruned.

### In-memory state — inside `alert-sounds.ts`

```typescript
const activeLoops = new Map<string, () => void>();  // alertId → cancel function
const sessionPlayedIds = new Set<string>();         // IDs triggered this browser session
```

`activeLoops` lets acknowledgment cancel specific repeating loops.
`sessionPlayedIds` prevents a sound from re-firing on the next poll when the same alert is still in the feed.

Both are module-level singletons. They reset on page reload — which is the spec-desired behavior for the "plays once on reload if not previously acknowledged" rule.

### Trigger predicate — pure, testable

```typescript
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
```

Returns `'repeating'`, `'single'`, or `'silent'`.

### Per-poll trigger flow — inside `App.tsx`'s alerts effect

For each alert in the current feed, compute `shouldTriggerSound(alert, soundAcked, sessionPlayedIds)`. If non-silent, call `triggerAlertSound(alert.id, mode, onSinglePlayEnd)` which:

- For `'repeating'`: plays first beep immediately, schedules `setInterval` at 1.5s, stores the clear function in `activeLoops[alertId]`
- For `'single'`: plays one beep, schedules a callback ~400ms later (beep duration + margin) that fires `onSinglePlayEnd(alertId)` — which the App uses to add the ID to `soundAcked` (self-acknowledge)
- Adds `alertId` to `sessionPlayedIds` in either case

## Acknowledgment flow

### Handler — `App.tsx`

```typescript
const acknowledgeAlertSounds = () => {
  const cancelled = cancelAllLoops();  // returns the alertIds that were looping
  if (cancelled.length === 0) return;
  const next = new Set(soundAcked);
  for (const id of cancelled) next.add(id);
  setSoundAcked(next);
  saveSoundAcked(next);
};
```

Early-return when nothing was looping avoids an unnecessary setState + write on every banner click.

### Wiring — `AlertBanner.tsx`

New prop `onAcknowledgeSounds: () => void`. The root `<div className="alert-banner">` gains an `onClick={onAcknowledgeSounds}` handler. Child click handlers (event-name buttons, expand toggle, dismiss ×) are unchanged — their click events bubble up through the container and trigger acknowledgment automatically.

### Pruning — `App.tsx`

```typescript
useEffect(() => {
  const activeIds = new Set(alerts.map((a) => a.id));

  // Prune soundAcked (same pattern as dismissed pruning)
  let changed = false;
  const prunedAck = new Set<string>();
  for (const id of soundAcked) {
    if (activeIds.has(id)) prunedAck.add(id);
    else changed = true;
  }
  if (changed) {
    setSoundAcked(prunedAck);
    saveSoundAcked(prunedAck);
  }

  // Prune sessionPlayedIds and activeLoops (module-internal)
  pruneSoundState(activeIds);

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [alerts.map((a) => a.id).join('|')]);
```

`pruneSoundState(activeIds)` (exported from `alert-sounds.ts`) removes stale entries from `sessionPlayedIds` and cancels any loops whose alert has disappeared from the feed.

## Web Audio module — `client/sound/alert-sounds.ts`

### Public surface

```typescript
export type SoundMode = 'repeating' | 'single' | 'silent';
export function soundModeForTier(tier: AlertTier): SoundMode;
export function shouldTriggerSound(
  alert: Alert,
  acknowledged: ReadonlySet<string>,
  sessionPlayed: ReadonlySet<string>,
): SoundMode;
export function triggerAlertSound(
  alertId: string,
  mode: SoundMode,
  onSinglePlayEnd?: (id: string) => void,
): void;
export function cancelAllLoops(): string[];  // returns cancelled IDs
export function pruneSoundState(activeIds: ReadonlySet<string>): void;
```

No exported `AudioContext` — the audio handle lives entirely inside the module.

### Tone synthesis

```typescript
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

function playBeep(): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'square';
  osc.frequency.value = 880;                   // A5
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
  gain.gain.setValueAtTime(0.25, now + 0.25);
  gain.gain.linearRampToValueAtTime(0, now + 0.30);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.30);
}
```

**Audio shape:** ~300ms, 880Hz square wave, 0.25 gain (~−12dB). Sharp 10ms attack and 50ms release prevent click artifacts. Square wave is more attention-getting than sine at the same amplitude. Exact parameters may be tuned during manual validation.

### Repeating loop

```typescript
const PULSE_INTERVAL_MS = 1500;

function startLoop(): () => void {
  playBeep();
  const intervalId = setInterval(playBeep, PULSE_INTERVAL_MS);
  return () => clearInterval(intervalId);
}
```

First beep fires immediately; subsequent beeps every 1.5 seconds. Cancel function clears the interval; any beep already mid-play completes naturally (it's <300ms).

### Autoplay policy handling

The browser may block audio until the page has received a user gesture. Our approach:

1. `getContext()` creates the AudioContext lazily on first use.
2. `playBeep()` checks `ctx.state === 'suspended'` and calls `ctx.resume()` — browsers allow this to succeed if a prior user gesture has occurred.
3. If no user gesture yet: `resume()` may silently reject, and `playBeep()` produces nothing audible. No errors thrown, no console spam.
4. On the next poll after the user has interacted with anything (clicking, typing, scrolling), the AudioContext transitions to `'running'` and subsequent triggers play normally.

Graceful degradation is the right tradeoff here: the alert banner is already visible, the `role="status"` announcement has fired for screen readers, and the user opening the dashboard will normally have clicked on the page long before any top-tier alert arrives.

## Component changes

### `AlertBanner.tsx` — new prop + root handler

```typescript
interface AlertBannerProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onAcknowledgeSounds: () => void;  // NEW
}

// Root element:
<div
  className="alert-banner ..."
  onClick={onAcknowledgeSounds}
  ...
>
```

No other changes to the component.

### `App.tsx` — state, handler, trigger effect, pruning effect update

- New `soundAcked` state + persistence helpers (mirror `dismissed` pattern)
- New `acknowledgeAlertSounds` callback passed to `AlertBanner`
- New `useEffect` on alert changes that calls `triggerAlertSound` per qualifying alert
- Update the existing pruning effect to also call `pruneSoundState(activeIds)` and prune `soundAcked`

### No changes to
- Alert tier classification (`shared/alert-tiers.ts`)
- TerminalModal or the alert detail modal (Feature 4)
- Server-side anything (audio is client-only)

## Testing

### Unit tests — `client/sound/alert-sounds.test.ts` (new file)

| Test | Validates |
|---|---|
| `soundModeForTier` returns `'repeating'` for each of the four repeating tiers | 4 assertions, one per tier |
| `soundModeForTier` returns `'single'` for `severe-warning` | Single-play classification |
| `soundModeForTier` returns `'silent'` for the other 8 tiers | 8 assertions |
| `shouldTriggerSound` returns the tier's mode for a fresh alert | Happy path |
| `shouldTriggerSound` returns `'silent'` when alert is in `acknowledged` | Persistent-ack blocks |
| `shouldTriggerSound` returns `'silent'` when alert is in `sessionPlayed` | In-session dedup blocks |
| `shouldTriggerSound` returns `'silent'` when tier is silent, regardless of other state | Silent-tier takes priority |

The AudioContext-touching functions (`triggerAlertSound`, `cancelAllLoops`, `pruneSoundState`, `playBeep`, `startLoop`) are NOT unit-tested — consistent with project policy ("test pure logic, validate React and DOM APIs manually").

### Manual validation via `SKYFRAME_DEBUG_TIERS`

| Scenario | Expected |
|---|---|
| `SKYFRAME_DEBUG_TIERS=tornado-warning` | Repeating beep starts on first poll. Click banner → silence. Reload while alert active → silence (ack persists) |
| `SKYFRAME_DEBUG_TIERS=severe-warning` | One beep. No further beeps on polls. Reload → silence (self-ack on play end) |
| `SKYFRAME_DEBUG_TIERS=tornado-warning,severe-warning` | Loop + single-play overlap. One banner click silences both (self-ack already covers severe) |
| `SKYFRAME_DEBUG_TIERS=advisory` | No sound (tier is silent) |
| Autoplay blocked: start server, open dashboard, don't click anywhere until banner appears | No audio (graceful). Click anywhere → next poll's trigger plays |

## Edge cases

- **Web Audio unsupported:** `getContext()` returns `null`, `playBeep()` is a no-op. No errors, no console noise.
- **Autoplay blocked at load:** `resume()` may silently fail; subsequent triggers succeed once user gesture occurs. Covered in module design above.
- **Alert appears and immediately disappears (one-poll blip):** `triggerAlertSound` fires, `pruneSoundState` on the next poll cancels the loop and removes from `sessionPlayedIds`. `soundAcked` also loses the ID if present. Clean.
- **User clicks banner while no sounds are looping:** `cancelAllLoops` returns an empty array, the handler early-returns. No-op ack, no state write.
- **Multiple top-tier alerts simultaneously:** each gets its own loop entry in `activeLoops`. Beeps overlap with different phase offsets — acoustically fine (they don't mush into noise at this pulse interval). One banner click silences all.
- **Rapid page reloads:** `ctx`, `activeLoops`, `sessionPlayedIds` reset per session. `soundAcked` persists. The spec's "plays once on reload if not acknowledged" behavior is intrinsic to this design.
- **Debug alert injection:** synthetic alerts flow through the same `shouldTriggerSound` predicate. Dev can verify end-to-end.

## Accessibility note

Users who rely on screen readers already hear the `role="status"` banner announcement on alert changes (shipped in a prior feature). Audio is additive — not the sole notification channel. Silent degradation on unsupported browsers or blocked autoplay leaves the visual banner + screen-reader announcement intact.

## Documentation updates when shipped

- Update `PROJECT_STATUS.md` → "Implemented features" with the Feature 6 entry
- Test count bumps (7 new `alert-sounds.test.ts` assertions across ~7 `it()` blocks)

## Ship path

Branch off `main` as `feat/alert-sounds`. Ship via PR.
