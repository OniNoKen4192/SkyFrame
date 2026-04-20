# Alert Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Feature 6 from the v1.2 roadmap — synthesize audible beep tones via the Web Audio API when a new alert appears in a qualifying tier, with repeating pulses for tornado-class alerts (silenced by clicking the banner) and a single beep for severe-warning.

**Architecture:** New client-only module `client/sound/alert-sounds.ts` encapsulates AudioContext + loop management. Pure predicate helpers (`soundModeForTier`, `shouldTriggerSound`) are unit-tested; the AudioContext-touching code is validated manually via `SKYFRAME_DEBUG_TIERS`. `App.tsx` owns persisted `soundAcknowledgedAlertIds` state (mirroring the existing `dismissed` pattern) and drives the trigger effect on each alerts change. `AlertBanner.tsx` gains a single `onClick` on its root element that catches all three spec-listed acknowledgment actions via event bubbling.

**Tech Stack:** React 18, TypeScript, Web Audio API, Vitest (node env) for pure-helper tests.

**Design spec:** [`docs/superpowers/specs/2026-04-19-alert-sounds-design.md`](../specs/2026-04-19-alert-sounds-design.md)

**Branch:** `feat/alert-sounds` (already created off `main`).

---

## Pre-work checklist

- [ ] On branch `feat/alert-sounds`: run `git branch --show-current`, expect `feat/alert-sounds`
- [ ] Working tree clean: run `git status`, expect `nothing to commit, working tree clean`
- [ ] Tests green: run `npm test`, expect 221 passing
- [ ] Typecheck green: run `npm run typecheck`, expect no errors

---

## Task 1: Pure helpers + unit tests

Creates the new module with tier classification + trigger predicate, and a companion test file. All pure — no AudioContext, no browser APIs, node-env testable.

**Files:**
- Create: `client/sound/alert-sounds.ts`
- Create: `client/sound/alert-sounds.test.ts`

### Steps

- [ ] **Step 1.1: Write the failing test file**

Create `client/sound/alert-sounds.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { soundModeForTier, shouldTriggerSound } from './alert-sounds';
import type { Alert, AlertTier } from '../../shared/types';

function makeAlert(id: string, tier: AlertTier): Alert {
  return {
    id,
    event: 'test',
    tier,
    severity: 'Extreme',
    headline: 'test',
    description: 'test',
    issuedAt: '2026-04-19T00:00:00Z',
    effective: '2026-04-19T00:00:00Z',
    expires: '2026-04-19T01:00:00Z',
    areaDesc: 'test',
  };
}

describe('soundModeForTier', () => {
  it('returns "repeating" for all four repeating tiers', () => {
    expect(soundModeForTier('tornado-emergency')).toBe('repeating');
    expect(soundModeForTier('tornado-pds')).toBe('repeating');
    expect(soundModeForTier('tornado-warning')).toBe('repeating');
    expect(soundModeForTier('tstorm-destructive')).toBe('repeating');
  });

  it('returns "single" for severe-warning', () => {
    expect(soundModeForTier('severe-warning')).toBe('single');
  });

  it('returns "silent" for the eight non-sound tiers', () => {
    expect(soundModeForTier('blizzard')).toBe('silent');
    expect(soundModeForTier('winter-storm')).toBe('silent');
    expect(soundModeForTier('flood')).toBe('silent');
    expect(soundModeForTier('heat')).toBe('silent');
    expect(soundModeForTier('special-weather-statement')).toBe('silent');
    expect(soundModeForTier('watch')).toBe('silent');
    expect(soundModeForTier('advisory-high')).toBe('silent');
    expect(soundModeForTier('advisory')).toBe('silent');
  });
});

describe('shouldTriggerSound', () => {
  const empty = new Set<string>();

  it('returns the tier mode for a fresh alert', () => {
    expect(shouldTriggerSound(makeAlert('a', 'tornado-warning'), empty, empty)).toBe('repeating');
    expect(shouldTriggerSound(makeAlert('b', 'severe-warning'), empty, empty)).toBe('single');
  });

  it('returns "silent" when the alert id is in acknowledged', () => {
    const acked = new Set(['a']);
    expect(shouldTriggerSound(makeAlert('a', 'tornado-warning'), acked, empty)).toBe('silent');
  });

  it('returns "silent" when the alert id is in sessionPlayed', () => {
    const played = new Set(['a']);
    expect(shouldTriggerSound(makeAlert('a', 'tornado-warning'), empty, played)).toBe('silent');
  });

  it('returns "silent" when the tier is silent, regardless of acked/played state', () => {
    expect(shouldTriggerSound(makeAlert('a', 'flood'), empty, empty)).toBe('silent');
    expect(shouldTriggerSound(makeAlert('b', 'advisory'), new Set(['b']), empty)).toBe('silent');
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npm test -- client/sound/alert-sounds.test.ts`
Expected: FAIL with "Cannot find module './alert-sounds'" — the implementation file doesn't exist yet.

- [ ] **Step 1.3: Create the module with pure helpers**

Create `client/sound/alert-sounds.ts`:

```typescript
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
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npm test -- client/sound/alert-sounds.test.ts`
Expected: all tests PASS (7 `it()` blocks, ~15 assertions).

- [ ] **Step 1.5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 1.6: Commit**

```bash
git add client/sound/alert-sounds.ts client/sound/alert-sounds.test.ts
git commit -m "$(cat <<'EOF'
Add alert-sounds module with pure tier classification

soundModeForTier maps an AlertTier to 'repeating' / 'single' /
'silent' per the Feature 6 spec table. shouldTriggerSound layers
the acknowledgment and session-dedup checks on top, returning
the final mode or 'silent'. Both are pure and node-env testable.

Seven it() blocks cover tier classification (all 13 tiers) plus
the four shouldTriggerSound cases (fresh, acked-blocks,
session-blocks, silent-tier-wins).

AudioContext-touching code comes in Task 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Imperative audio layer (no tests)

Appends the Web Audio internals and orchestrator exports to `client/sound/alert-sounds.ts`. No tests — consistent with project policy for AudioContext / DOM APIs; validated manually via `SKYFRAME_DEBUG_TIERS` in Task 4.

**Files:**
- Modify: `client/sound/alert-sounds.ts` (append)

### Steps

- [ ] **Step 2.1: Append the audio internals**

Append to the end of `client/sound/alert-sounds.ts`:

```typescript
// ========== Web Audio internals ==========

const PULSE_INTERVAL_MS = 1500;
const BEEP_DURATION_MS = 300;
const SINGLE_PLAY_END_DELAY_MS = 400;  // fires onSinglePlayEnd just after the beep tails off

let ctx: AudioContext | null = null;

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

function playBeep(): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

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
  sessionPlayedIds.add(alertId);

  if (mode === 'repeating') {
    const cancel = startLoop();
    activeLoops.set(alertId, cancel);
  } else {
    // 'single'
    playBeep();
    if (onSinglePlayEnd) {
      setTimeout(() => onSinglePlayEnd(alertId), SINGLE_PLAY_END_DELAY_MS);
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
```

Rationale notes:
- `PULSE_INTERVAL_MS = 1500` → first beep immediate, subsequent beeps every 1.5s. The spec doesn't prescribe a specific interval; this is attention-getting without being frantic.
- `SINGLE_PLAY_END_DELAY_MS = 400` → 300ms beep + 100ms margin. Fires `onSinglePlayEnd` shortly after the tail-off. App.tsx uses this to self-acknowledge single-play sounds (so reloads don't re-beep).
- `sessionPlayedIds.has(alertId)` check inside `triggerAlertSound` prevents double-triggering when the alerts-changed effect re-runs for the same alert list.
- `ctx` is never closed — AudioContext is cheap, lives for the browser-tab lifetime.

- [ ] **Step 2.2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. The module's new exports are unused for now; that's fine — Task 3 wires them up.

- [ ] **Step 2.3: Verify existing tests still pass**

Run: `npm test`
Expected: 228 tests pass (221 pre-existing + 7 new from Task 1). The Task 2 appends don't add tests but don't break existing ones either.

- [ ] **Step 2.4: Commit**

```bash
git add client/sound/alert-sounds.ts
git commit -m "$(cat <<'EOF'
Add Web Audio internals + orchestrator to alert-sounds module

playBeep synthesizes a 300ms 880Hz square-wave tone with sharp
attack/release envelope. startLoop schedules setInterval at
1500ms for repeating pulses. triggerAlertSound orchestrates the
decision: session-dedup check, then loop or single-play per the
requested mode. cancelAllLoops returns the alert IDs whose loops
were stopped (consumer uses this to update the persistent
acknowledged set). pruneSoundState drops stale session IDs and
cancels orphan loops when alerts fall off the NWS feed.

AudioContext is lazy-constructed on first use and never closed;
playBeep resumes a suspended context on each call (the
auto-resume-after-user-gesture pattern). If the browser blocks
audio entirely, all functions are no-ops.

No tests — AudioContext isn't worth mocking for the value it'd
provide; manual validation via SKYFRAME_DEBUG_TIERS covers the
imperative path end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire AlertBanner + App.tsx together (compound commit)

Single commit — adding `onAcknowledgeSounds` as a required prop on `AlertBanner` means `App.tsx` must supply it in the same commit for the typecheck to pass. Matches the pattern from Feature 4 Tasks 6+7 and Feature 5 Task 4.

**Files:**
- Modify: `client/components/AlertBanner.tsx`
- Modify: `client/App.tsx`

### Steps

- [ ] **Step 3.1: Modify `AlertBanner.tsx`**

Make these targeted edits. First, update the `AlertBannerProps` interface (currently around lines 13-16). Replace:

```typescript
interface AlertBannerProps {
  alerts: Alert[];                    // already filtered to visible by App
  onDismiss: (id: string) => void;
  onOpenDetail: (id: string) => void;
}
```

with:

```typescript
interface AlertBannerProps {
  alerts: Alert[];                    // already filtered to visible by App
  onDismiss: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onAcknowledgeSounds: () => void;
}
```

Then update the function signature (currently around line 25). Replace:

```typescript
export function AlertBanner({ alerts, onDismiss, onOpenDetail }: AlertBannerProps) {
```

with:

```typescript
export function AlertBanner({ alerts, onDismiss, onOpenDetail, onAcknowledgeSounds }: AlertBannerProps) {
```

Finally, add the `onClick` handler to the root `<div>` (currently around lines 38-43). Replace:

```tsx
    <div
      className={`alert-banner ${expanded ? 'alert-banner-expanded' : ''}`}
      data-tier={primary.tier}
      role="status"
      aria-live="polite"
    >
```

with:

```tsx
    <div
      className={`alert-banner ${expanded ? 'alert-banner-expanded' : ''}`}
      data-tier={primary.tier}
      role="status"
      aria-live="polite"
      onClick={onAcknowledgeSounds}
    >
```

Leave everything else in `AlertBanner.tsx` unchanged. The child click handlers (event-name buttons, expand toggle, dismiss ×) bubble up through the new root handler, so a single wire-up point covers all acknowledgment paths.

- [ ] **Step 3.2: Modify `App.tsx` — add the imports**

At the top of `client/App.tsx`, alongside the other `./` imports, add:

```typescript
import {
  soundModeForTier,
  triggerAlertSound,
  cancelAllLoops,
  pruneSoundState,
} from './sound/alert-sounds';
```

- [ ] **Step 3.3: Modify `App.tsx` — add the persistence helpers**

Find the block near the top of `App.tsx` that defines `DISMISSED_KEY`, `loadDismissed`, `saveDismissed` (currently around lines 28-48). Add a parallel block right after it (before the `UNITS_KEY` block):

```typescript
// Sound-acknowledged alerts persistence. Lives at App level alongside
// `dismissed` so the trigger effect and the banner's onClick handler
// see a single source of truth.
const SOUND_ACK_KEY = 'skyframe.alerts.soundAcknowledged';

function loadSoundAcked(): Set<string> {
  try {
    const raw = localStorage.getItem(SOUND_ACK_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveSoundAcked(set: Set<string>): void {
  try {
    localStorage.setItem(SOUND_ACK_KEY, JSON.stringify([...set]));
  } catch {
    // Quota exceeded or storage unavailable — silently degrade.
  }
}
```

- [ ] **Step 3.4: Modify `App.tsx` — add the state**

Find the existing state declarations inside `App()` (currently around lines 85-94) and add `soundAcked` right after the `dismissed` state:

```typescript
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [soundAcked, setSoundAcked] = useState<Set<string>>(() => loadSoundAcked());
```

- [ ] **Step 3.5: Modify `App.tsx` — add the acknowledgment + self-ack helpers**

Find the existing `dismissAlert` helper (currently around lines 224-229) and add these two helpers right after it:

```typescript
  const acknowledgeAlertSounds = () => {
    const cancelled = cancelAllLoops();
    if (cancelled.length === 0) return;
    setSoundAcked((prev) => {
      const next = new Set(prev);
      for (const id of cancelled) next.add(id);
      saveSoundAcked(next);
      return next;
    });
  };

  const ackSinglePlayed = (id: string) => {
    setSoundAcked((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveSoundAcked(next);
      return next;
    });
  };
```

`acknowledgeAlertSounds` is passed to `AlertBanner` (root onClick). `ackSinglePlayed` is passed as the `onSinglePlayEnd` callback to `triggerAlertSound`, so severe-warning tones self-acknowledge after playing. Both use the functional `setSoundAcked((prev) => ...)` form so concurrent updates compose correctly.

- [ ] **Step 3.6: Modify `App.tsx` — add the sound-trigger useEffect**

Find the existing alert stale-cleanup effect (currently around lines 189-197, the one that closes the detail modal if its alert disappears). Add a new effect right after it:

```typescript
  // Trigger alert sounds for any new qualifying alert (tornado-class or
  // severe-warning). Re-runs on alert id-list change. Session-dedup and
  // acknowledgment-checks live inside the sound module and the predicate
  // below, so repeated polls of the same alert don't re-fire the sound.
  useEffect(() => {
    for (const alert of alerts) {
      const mode = soundModeForTier(alert.tier);
      if (mode === 'silent') continue;
      if (soundAcked.has(alert.id)) continue;
      triggerAlertSound(alert.id, mode, ackSinglePlayed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.id).join('|')]);
```

- [ ] **Step 3.7: Modify `App.tsx` — extend the existing pruning effect**

Find the existing dismissed-pruning effect (currently around lines 178-188). Extend it to also prune `soundAcked` and call `pruneSoundState`. Replace:

```typescript
  useEffect(() => {
    const activeIds = new Set(alerts.map((a) => a.id));
    let changed = false;
    const pruned = new Set<string>();
    for (const id of dismissed) {
      if (activeIds.has(id)) {
        pruned.add(id);
      } else {
        changed = true;
      }
    }
    if (changed) {
      setDismissed(pruned);
      saveDismissed(pruned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.id).join('|')]);
```

with:

```typescript
  useEffect(() => {
    const activeIds = new Set(alerts.map((a) => a.id));

    // Prune dismissed
    let dismissedChanged = false;
    const prunedDismissed = new Set<string>();
    for (const id of dismissed) {
      if (activeIds.has(id)) prunedDismissed.add(id);
      else dismissedChanged = true;
    }
    if (dismissedChanged) {
      setDismissed(prunedDismissed);
      saveDismissed(prunedDismissed);
    }

    // Prune soundAcked
    let ackChanged = false;
    const prunedAck = new Set<string>();
    for (const id of soundAcked) {
      if (activeIds.has(id)) prunedAck.add(id);
      else ackChanged = true;
    }
    if (ackChanged) {
      setSoundAcked(prunedAck);
      saveSoundAcked(prunedAck);
    }

    // Prune module-internal state (sessionPlayedIds, cancel orphan loops)
    pruneSoundState(activeIds);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.id).join('|')]);
```

- [ ] **Step 3.8: Modify `App.tsx` — pass `onAcknowledgeSounds` to `AlertBanner`**

Find the `<AlertBanner>` invocation in the returned JSX (currently around lines 236-242). Add the new prop:

```tsx
      {visible.length > 0 && (
        <AlertBanner
          alerts={visible}
          onDismiss={dismissAlert}
          onOpenDetail={setDetailAlertId}
          onAcknowledgeSounds={acknowledgeAlertSounds}
        />
      )}
```

- [ ] **Step 3.9: Typecheck + tests + build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: 228 tests pass.

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3.10: Commit**

```bash
git add client/components/AlertBanner.tsx client/App.tsx
git commit -m "$(cat <<'EOF'
Wire alert sounds into AlertBanner + App

AlertBanner: new onAcknowledgeSounds prop, fired from a root-div
onClick. Event bubbling from the existing child handlers
(event-name buttons, expand toggle, dismiss ×) all flow through
this one handler, covering the three spec-listed acknowledgment
actions in a single wire-up.

App: new soundAcked persistent state (localStorage key
skyframe.alerts.soundAcknowledged, mirroring the dismissed
pattern). Two new helpers — acknowledgeAlertSounds silences all
currently-looping sounds and records the cancelled alert IDs;
ackSinglePlayed adds a single ID for the severe-warning
self-acknowledge case. A new useEffect drives triggerAlertSound
per qualifying alert on each id-list change. The existing
pruning effect is extended to also prune soundAcked and call
pruneSoundState so stale loops get cancelled and sessionPlayed
entries get dropped when alerts fall off the NWS feed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Manual validation + `PROJECT_STATUS.md` update + PR

**Files:**
- Modify: `PROJECT_STATUS.md`

### Steps

- [ ] **Step 4.1: Validate the repeating-pulse flow**

In PowerShell:

```powershell
$env:SKYFRAME_DEBUG_TIERS='tornado-warning'; npm run server
```

In another terminal: `npm run dev`. Open `http://localhost:5173`.

Check:
- [ ] After the first weather poll, a repeating beep starts (~880Hz square wave, every 1.5s)
- [ ] Clicking anywhere on the banner (headline text, event name, stripes, expand/dismiss buttons) silences the beep
- [ ] After silencing, no further beeps from that alert ID for the rest of the session
- [ ] Reload the page while the alert is still active: no re-beep (acknowledgment persists via localStorage)
- [ ] Manually clear `skyframe.alerts.soundAcknowledged` from DevTools Application → Local Storage, reload: beep resumes (confirms the persistence gate is real)

- [ ] **Step 4.2: Validate the single-play flow**

Stop the server. Restart with:

```powershell
$env:SKYFRAME_DEBUG_TIERS='severe-warning'; npm run server
```

Reload the browser.

Check:
- [ ] One beep fires shortly after the first poll
- [ ] No further beeps on subsequent polls for the same alert
- [ ] Reload the page: no re-beep (self-acknowledgment persisted via `onSinglePlayEnd`)
- [ ] DevTools → Application → Local Storage → `skyframe.alerts.soundAcknowledged` contains the debug alert's ID

- [ ] **Step 4.3: Validate overlap + banner-click acknowledgment**

Stop the server. Restart with two alerts:

```powershell
$env:SKYFRAME_DEBUG_TIERS='tornado-warning,severe-warning'; npm run server
```

Reload.

Check:
- [ ] Both sounds fire — the repeating pulse plus the single beep (possibly overlapping in time)
- [ ] One banner click silences the repeating pulse (the severe-warning already self-acknowledged)
- [ ] No further beeps of either kind on subsequent polls

- [ ] **Step 4.4: Validate silent tiers don't trigger**

Stop the server. Restart with a silent tier:

```powershell
$env:SKYFRAME_DEBUG_TIERS='advisory'; npm run server
```

Reload.

Check:
- [ ] No beep fires
- [ ] Banner still renders normally
- [ ] `skyframe.alerts.soundAcknowledged` is NOT populated with the advisory alert's ID (because we never tried to play)

- [ ] **Step 4.5: Validate autoplay-block behavior**

Use a Chromium-based browser with autoplay policy enforced. Start the server with a tornado-warning debug alert. Open a FRESH tab (no prior interaction) directly to `http://localhost:5173`.

Check:
- [ ] No beep fires on initial load (autoplay blocked)
- [ ] No error dialogs, no console noise about audio failures
- [ ] Click anywhere on the page (e.g., the banner itself). On the NEXT poll, the beep kicks in because the AudioContext was resumed by the gesture

On most dev setups the browser may allow autoplay on localhost, in which case this scenario plays normally from load and can be verified by observing that no audio errors appear even under stricter policies.

- [ ] **Step 4.6: Stop the dev server and clear debug env var**

Ctrl+C the server. In a fresh terminal:

```powershell
Get-ChildItem Env:SKYFRAME_DEBUG_TIERS
```

Expected: "Cannot find path" error. If the variable is still set, close and reopen the terminal.

- [ ] **Step 4.7: Update `PROJECT_STATUS.md`**

Update the "Last updated" line to `2026-04-19 (Feature 6)`.

Bump the test count line (currently 221): `Vitest (228 tests across 13 files ...)`.

Bump the `npm test` command line's test count similarly.

Add a new entry in the "Implemented features" section, after the GPS autodetect (v1.2 Feature 7) block:

```markdown
### Alert sounds (v1.2 Feature 6)
- Synthesized beep tones via Web Audio API when a new alert appears in a qualifying tier. Top-severity tiers (`tornado-emergency`, `tornado-pds`, `tornado-warning`, `tstorm-destructive`) loop a pulsing 880Hz beep every 1.5 seconds until the user clicks the alert banner. `severe-warning` plays one beep; other tiers are silent. 300ms square-wave with sharp attack/release; no audio files, no licenses, no external deps.
- Single banner click (anywhere on the banner) silences all currently-looping sounds. Implemented as one root-level `onClick` — the three spec-listed acknowledgment actions (banner click / detail modal open / dismissal) all bubble through the same handler.
- Acknowledgments persisted in `localStorage` under `skyframe.alerts.soundAcknowledged` (same shape as the dismissed-alerts set; same pruning pattern). Single-play alerts self-acknowledge when the tone finishes, so reloads don't re-beep.
- Graceful degradation if the browser blocks autoplay before a user gesture — the beep is silent until the user interacts with the page, then subsequent triggers work normally. No error dialogs or console noise.
```

- [ ] **Step 4.8: Commit the status update**

```bash
git add PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
Document Feature 6 alert sounds in PROJECT_STATUS

Also bumps the test count (221 → 228) from the seven new tests
in client/sound/alert-sounds.test.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4.9: Push branch and open PR**

```bash
git push -u origin feat/alert-sounds
```

Then open the PR with `gh pr create`. Match the house style from PRs #9–#11: summary bullets, decisions-settled table, test plan checklist, commit map, links to spec and plan.

---

## Summary of commits

1. Add alert-sounds module with pure tier classification (Task 1)
2. Add Web Audio internals + orchestrator to alert-sounds module (Task 2)
3. Wire alert sounds into AlertBanner + App (Task 3)
4. Document Feature 6 alert sounds in PROJECT_STATUS (Task 4)

Plus the already-committed spec on `feat/alert-sounds`.

---

## Self-review

**Spec coverage:**
- Tier → audio behavior table encoded in `REPEATING_TIERS` + `SINGLE_PLAY_TIERS` + `soundModeForTier` → Task 1 ✅
- `shouldTriggerSound` pure predicate → Task 1 ✅
- Unit tests for tier classification + trigger predicate → Task 1 ✅
- Web Audio synthesis (`playBeep`, `startLoop`) + orchestrator (`triggerAlertSound`, `cancelAllLoops`, `pruneSoundState`) → Task 2 ✅
- Autoplay-policy silent degradation (`ctx.resume()` on suspended state, silent no-op when blocked) → Task 2 ✅
- Persistent `soundAcknowledgedAlertIds` in localStorage mirroring `dismissed` pattern → Task 3 ✅
- Single-banner-click acknowledgment via root `onClick` + event bubbling → Task 3 ✅
- Self-acknowledge on single-play sound end via `ackSinglePlayed` + `onSinglePlayEnd` → Task 3 ✅
- Pruning effect extended to drop stale `soundAcked` entries + call `pruneSoundState` → Task 3 ✅
- Manual validation across tornado-warning (repeating), severe-warning (single-play), overlap, silent tier, autoplay-blocked → Task 4 ✅
- `PROJECT_STATUS` update + PR → Task 4 ✅

**Placeholder scan:** every step contains actual code or actual commands. No TBD / TODO / "similar to Task N" / "handle edge cases".

**Type consistency:**
- `SoundMode` type defined in Task 1, referenced by `triggerAlertSound`'s signature in Task 2 ✅
- `ReadonlySet<string>` used consistently for `acknowledged` and `sessionPlayed` parameters in the pure predicate ✅
- `pruneSoundState(activeIds: ReadonlySet<string>)` signature matches the call site in Task 3 ✅
- `onSinglePlayEnd?: (id: string) => void` signature matches `ackSinglePlayed: (id: string) => void` from Task 3 ✅
- `cancelAllLoops(): string[]` return type matches the `cancelled.length === 0` check and `for (const id of cancelled)` loop in Task 3 ✅
- `onAcknowledgeSounds: () => void` prop signature matches `acknowledgeAlertSounds` handler in Task 3 ✅
- localStorage key `skyframe.alerts.soundAcknowledged` is used in both `SOUND_ACK_KEY` and the PROJECT_STATUS.md entry ✅
