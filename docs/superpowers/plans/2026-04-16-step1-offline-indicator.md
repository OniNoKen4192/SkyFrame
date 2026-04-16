# v1.1 Step 1 — Offline Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it visually obvious when the SkyFrame client cannot reach the server: change Footer dot to static red, swap station ID for `LINK.OFFLINE`, and display the actual retry time instead of the now-stale server-promised refresh time.

**Architecture:** Two-file edit, both in the React client. `App.tsx` adds a `nextRetryAt` state that it sets in the existing fetch error path. `Footer.tsx` accepts the new prop and conditionally renders the retry time when an error is active. CSS is unchanged — the existing `.dot.dot-error` rule already provides static red.

**Tech Stack:** React 18, TypeScript, Vite. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-04-16-step1-offline-indicator-design.md](../specs/2026-04-16-step1-offline-indicator-design.md)

**Note on testing:** This plan uses **manual browser verification**, not automated tests. The project has no client-side test infrastructure (no jsdom, no @testing-library/react), and adding it for one display-only change is out of scope per the spec.

---

## Task 1: Wire Footer + App.tsx for offline state

**Files:**
- Modify: `client/components/Footer.tsx`
- Modify: `client/App.tsx`

The two edits are coupled (Footer needs a prop that App provides), so they ship as one task. To keep TypeScript happy if you do them in either order, the new prop is **optional** (`nextRetryAt?: string | null`).

- [ ] **Step 1: Update `client/components/Footer.tsx`**

Replace the entire file with:

```tsx
import type { WeatherMeta } from '../../shared/types';

interface FooterProps {
  meta: WeatherMeta | null;
  error: string | null;
  nextRetryAt?: string | null;
}

function formatHM(iso: string | undefined): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}:${map.second}`;
}

export function Footer({ meta, error, nextRetryAt }: FooterProps) {
  const stationId = meta?.stationId ?? 'KMKE';
  const lastPull = formatHM(meta?.fetchedAt);
  const nextPull = error && nextRetryAt
    ? formatHM(nextRetryAt)
    : formatHM(meta?.nextRefreshAt);

  return (
    <div className="hud-footer">
      <span className={error ? 'dot dot-error' : 'dot'}></span>
      {error ? 'LINK.OFFLINE' : `LINK.${stationId}`}
      &nbsp;·&nbsp; LAST PULL {lastPull} &nbsp;·&nbsp; NEXT {nextPull}
    </div>
  );
}
```

What changed from the current file:
- Added optional `nextRetryAt?: string | null` to `FooterProps`.
- `nextPull` now picks `nextRetryAt` over `meta.nextRefreshAt` when both `error` and `nextRetryAt` are truthy.
- Offline text changed from `'LINK FAIL'` to `'LINK.OFFLINE'`.

- [ ] **Step 2: Update `client/App.tsx`**

Three changes inside the existing `App` component. Apply them in order:

**2a.** Add a third `useState` next to the existing two (around line 23):

```tsx
const [data, setData] = useState<WeatherResponse | null>(null);
const [error, setError] = useState<string | null>(null);
const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);
```

**2b.** In `fetchWeather`, after the successful `setError(null)` (around line 43), add:

```tsx
        setData(json);
        setError(null);
        setNextRetryAt(null);
```

**2c.** In the `catch` block (around line 53-57), add the retry timestamp before scheduling:

```tsx
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setNextRetryAt(new Date(Date.now() + ERROR_RETRY_MS).toISOString());
        scheduleNext(ERROR_RETRY_MS);
      }
```

**2d.** Pass `nextRetryAt` to the `<Footer />` (around line 83):

```tsx
      <Footer meta={data?.meta ?? null} error={error} nextRetryAt={nextRetryAt} />
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS, no errors. Both `tsc -p tsconfig.server.json --noEmit` and `tsc -p tsconfig.client.json --noEmit` succeed.

If you see "Property 'nextRetryAt' does not exist on type 'FooterProps'" — Step 1 wasn't saved. Re-check `client/components/Footer.tsx`.

If you see "Cannot find name 'setNextRetryAt'" — Step 2a wasn't applied. Re-check `client/App.tsx`.

- [ ] **Step 4: Build check**

Run: `npm run build`

Expected: PASS. Vite builds the client bundle. (This catches anything `typecheck` missed.)

---

## Task 2: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start dev environment**

In two terminals:

```bash
npm run server
```

```bash
npm run dev
```

Open `http://localhost:5173` in a browser.

- [ ] **Step 2: Verify online state (baseline)**

Expected on screen (Footer line):
- Cyan dot, **pulsing** (1.8s opacity blink)
- Text: `LINK.KMKE` (or whichever station the server picked)
- `LAST PULL HH:MM:SS · NEXT HH:MM:SS` (NEXT roughly 90s after LAST PULL)

If the dot is red or text says `LINK.OFFLINE` here, the server isn't running — start it.

- [ ] **Step 3: Verify offline state**

In Chrome/Edge DevTools → Network tab → throttling dropdown → **Offline**. (Or: stop the server with Ctrl-C in its terminal.)

Wait until the next poll attempt fires (≤90s, watch the NEXT timestamp in the Footer tick past).

Expected on screen:
- Dot turns red, **static** (no pulse)
- Text: `LINK.OFFLINE`
- `NEXT` updates to roughly 30s after the moment of failure

If the dot is still pulsing or text still says `LINK.KMKE`, the fetch hasn't failed yet — wait longer or hard-stop the server.

- [ ] **Step 4: Verify sustained-failure NEXT updates**

Stay offline for ~70s (i.e., let two failed retries happen). After the second retry, the `NEXT` timestamp should advance again — each failure pushes it 30s further into the future.

If `NEXT` stays frozen, `setNextRetryAt` isn't being called in the `catch` block — re-check Step 2c of Task 1.

- [ ] **Step 5: Verify recovery**

Toggle Network → Online (or restart the server). Within 30s the next retry fires.

Expected:
- Dot returns to cyan, pulsing
- Text returns to `LINK.<stationId>`
- `NEXT` returns to the server-promised refresh time (~90s out)

- [ ] **Step 6: Verify initial-load failure case**

Stop the server. Hard-refresh the browser (Ctrl-Shift-R) so the client starts with no data.

Expected:
- Panels show `■ LOADING...`
- Footer shows red static dot, `LINK.OFFLINE`, `LAST PULL --:--:--`, `NEXT HH:MM:SS` (~30s out)

This confirms the offline indicator works even when there's no successful fetch to base it on.

---

## Task 3: Commit

**Files:** none new

- [ ] **Step 1: Stage and commit**

```bash
git add client/App.tsx client/components/Footer.tsx
git commit -m "$(cat <<'EOF'
Add offline indicator to Footer

When fetch fails, the Footer dot turns static red, station text
becomes LINK.OFFLINE, and NEXT shows the actual 30s retry time
instead of the stale server-promised refresh.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify clean tree**

Run: `git status`

Expected: working tree clean (or only your unrelated in-progress files: `docs/screenshot.png`, `README.md`, `docs/superpowers/plans/2026-04-16-readme-for-cloners.md`). The two files you edited should be gone from the status list.

---

## Self-review

**Spec coverage:**
- Footer text change to `LINK.OFFLINE` → Task 1 Step 1 ✓
- Static red dot (no animation change needed) → Task 1 Step 1 + spec confirms CSS already correct ✓
- `nextRetryAt` prop on Footer → Task 1 Step 1 ✓
- App.tsx state + set on error/success → Task 1 Step 2 ✓
- Single-failure trigger, no debouncing → already true (existing error path is single-failure) ✓
- 30s retry timing unchanged → Task 1 Step 2c uses existing `ERROR_RETRY_MS` ✓
- Initial-load failure case → Task 2 Step 6 verifies ✓
- Sustained-failure NEXT updates → Task 2 Step 4 verifies ✓
- Recovery flips back cleanly → Task 2 Step 5 verifies ✓
- No CSS changes → confirmed ✓
- No server changes → confirmed ✓
- No new test infra → confirmed (manual verification only) ✓

**Placeholder scan:** None. Every step has either complete code or an exact command + expected output.

**Type consistency:** `nextRetryAt?: string | null` is consistent across `FooterProps`, `useState<string | null>(null)`, `setNextRetryAt(... .toISOString())`, and `<Footer nextRetryAt={nextRetryAt} />`.
