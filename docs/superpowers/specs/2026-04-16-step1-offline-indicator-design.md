# v1.1 Step 1 — Offline indicator

**Date:** 2026-04-16
**Status:** Implemented (scope expanded mid-implementation — see "Scope expansion" section)
**Roadmap context:** [v1.1 roadmap](2026-04-15-v1.1-roadmap-design.md), Step 1
**Source idea:** [docs/userInput/v1.1 ideas.txt](../../userInput/v1.1%20ideas.txt) line 1
**Regressions addressed:** [docs/userInput/observedRegressions.txt](../../userInput/observedRegressions.txt) lines 1-2

## Goal

Make it visually obvious when the client cannot reach the server. Both the Footer and TopBar reflect connectivity state: the Footer dot turns red, the link text in both surfaces becomes `LINK.OFFLINE`, and the Footer NEXT timestamp shows the actual retry time instead of the now-stale server-promised refresh.

## Behavior

### Footer

| State | Dot | Text | NEXT timestamp |
|---|---|---|---|
| Online | Cyan, pulsing (existing `hudBlink`) | `LINK.KMKE` | Server's `meta.nextRefreshAt` (existing) |
| Offline | Red, **static** (no animation) | `LINK.OFFLINE` | Actual next retry time (`now + 30s` at moment of failure) |
| Recovery | Reverts to online state on next successful fetch | | |

### TopBar

| State | Surrounding text (`■ SKYFRAME · OAK CREEK 53154 ·`) | Link text |
|---|---|---|
| Online | Default cyan, ~60% opacity (existing) | `LINK.<stationId>` in default cyan |
| Offline | Cyan dimmed to ~25% (rgba color, not opacity, so child stays full strength) | `LINK.OFFLINE` in red `#ff4444`, bold (700), wider letter-spacing (0.28em), red glow (`text-shadow` 10px / alpha 0.9), thin red underline, glitch animation every 5s |
| Recovery | Reverts to online state on next successful fetch | |

**Glitch animation (`@keyframes linkGlitch`):** 5s cycle, mostly calm. Brief RGB chromatic-aberration burst (~120ms) at the 92-97% mark — pink/cyan ghosts offset by ±2px with a 1px horizontal jitter, then snaps back. Provides drama without being distracting.

**Trigger:** any failure of `fetch('/api/weather')` — network error or HTTP non-2xx. Single-failure trigger (no debouncing). Existing 30s retry-on-error behavior is unchanged.

**Initial-load failure:** if the very first fetch fails, the panels still show `■ LOADING...` while both Footer and TopBar show `LINK.OFFLINE` with the retry NEXT.

## Files touched

### [client/components/Footer.tsx](../../../client/components/Footer.tsx)

- Change `'LINK FAIL'` → `'LINK.OFFLINE'`.
- Add new prop `nextRetryAt?: string | null` (ISO timestamp, optional).
- When `error` is set and `nextRetryAt` is non-null, format and display `nextRetryAt` for the NEXT field. Otherwise display `meta.nextRefreshAt` as before.

### [client/components/TopBar.tsx](../../../client/components/TopBar.tsx)

- Convert from props-less to accepting `TopBarProps { stationId: string | null; error: string | null }`.
- Reorder location text: `KMKE LINK` → `LINK.<stationId>` (matching Footer convention; addresses regression #2).
- When `error` is set, render `LINK.OFFLINE` with class `link link-offline`, and apply `loc-offline` class to parent `.loc` div.
- When `stationId` is null (initial load) and no error, fall back to `LINK.KMKE` to match Footer's fallback.

### [client/App.tsx](../../../client/App.tsx)

- Add `nextRetryAt` state (`useState<string | null>(null)`).
- On fetch failure (in the `catch` block):
  - `setNextRetryAt(new Date(Date.now() + ERROR_RETRY_MS).toISOString())` alongside `setError(...)`.
- On fetch success (in the `try` block):
  - `setNextRetryAt(null)` alongside `setError(null)`.
- Pass `nextRetryAt` to `<Footer />`.
- Pass `stationId={data?.meta?.stationId ?? null}` and `error={error}` to `<TopBar />`.

### [client/styles/hud.css](../../../client/styles/hud.css)

- Add `.hud-topbar .loc.loc-offline` rule: dim surrounding cyan to `rgba(0, 229, 209, 0.25)` via `color`, set `opacity: 1` to undo parent dimming. (Color rather than opacity so the child's red stays full strength — CSS opacity is multiplicative across descendants.)
- Add `.hud-topbar .loc .link-offline` rule: red color, bold, wider letter-spacing, red glow, red underline (`border-bottom`), `display: inline-block` so transform works, `animation: linkGlitch 5s linear infinite`.
- Add `@keyframes linkGlitch`: 0/92/100% calm; 93/95/97% chromatic-aberration shadows + tiny translateX jitter.
- **Footer dot CSS unchanged** — the existing `.dot.dot-error` rule (lines 233-237) already gives static red with no animation, which matches the chosen Footer behavior.

## Out of scope

- The 30s retry-on-error timing (`ERROR_RETRY_MS`) — unchanged.
- The `dot-error` class name and CSS — unchanged.
- Server, normalizer, types, cache — no changes.
- Adding client-side test infrastructure (see Testing).
- The hourly forecast staleness bug logged in [observedRegressions.txt](../../userInput/observedRegressions.txt) line 3 — separate fix, scheduled before Step 2.

## Testing

This step does not add automated tests. Rationale:

- The project's existing Vitest setup covers server-side modules only (normalizer, cache, routes, etc.).
- No client component test infrastructure exists (no `jsdom`, no `@testing-library/react` in devDependencies).
- Adding client test infrastructure for one display-only component change is scope creep. If client testing is wanted later, it should be its own decision and its own PR.

**Manual verification checklist:**

1. Start `npm run dev` and `npm run server` in two terminals.
2. **Online baseline:** Footer shows cyan pulsing dot + `LINK.<stationId>` + `NEXT` ~90s out. TopBar location line shows `■ SKYFRAME · OAK CREEK 53154 · LINK.<stationId>` in default cyan.
3. **Offline state:** DevTools → Network → Offline (or stop server). Within ≤90s:
   - Footer: dot turns red and static, text becomes `LINK.OFFLINE`, NEXT shows ~30s out
   - TopBar: surrounding text dims, `LINK.OFFLINE` appears in red with glow + underline + glitch
4. **Sustained-failure NEXT updates:** stay offline ~70s. After second failed retry, Footer NEXT advances another 30s.
5. **Recovery:** toggle Network → Online (or restart server). Within 30s, both surfaces revert to online state.
6. **Initial-load failure:** stop server, hard-refresh browser. Panels show `■ LOADING...`, Footer shows red dot + `LINK.OFFLINE`, TopBar shows red `LINK.OFFLINE` with full styling.

## Scope expansion

The original spec scoped this step to the Footer alone. During implementation, the user observed two regressions in the TopBar that became visible/relevant once the Footer changed:

1. **Regression #1** — TopBar hardcoded `KMKE LINK` regardless of connectivity, contradicting the Footer's new `LINK.OFFLINE` behavior.
2. **Regression #2** — TopBar text order was `[location].LINK` rather than the `LINK.[location]` convention used in the Footer.

Both were folded into this step rather than spawning a separate PR, on the principle that the Footer change *exposed* the inconsistency and shipping with mismatched surfaces would be misleading. The TopBar offline styling (bold red glow + underline + glitch) was iterated to satisfy the user's observation that thin red text lacked sufficient contrast against the dark background.

A bonus side-effect of wiring TopBar to `meta.stationId`: the user can now observe the server-side KMKE→KRAC station fallback in the UI, where previously the hardcoded `KMKE LINK` masked it.

## Risks / edge cases

- **Clock display:** `nextRetryAt` is computed client-side, so it always matches the user's local clock. No timezone or skew issues.
- **Successive failures:** each failed retry recomputes `nextRetryAt = now + 30s`, so the displayed NEXT updates every 30s during a sustained outage. This is correct.
- **Recovery race:** if a retry succeeds at the moment the user is reading the offline state, the next render flips back to online. No flicker risk because `setError(null)` and `setNextRetryAt(null)` happen in the same React batch as `setData(json)`.
- **CSS opacity inheritance:** the `.loc.loc-offline` rule deliberately uses rgba `color` (not `opacity`) to dim the surrounding cyan, because CSS opacity multiplies through descendants — using opacity would have dimmed the child's red along with the cyan parent.
- **Glitch performance:** the animation runs as long as the offline state persists. CSS `transform`/`text-shadow` animations are GPU-compositable, so this should not impact performance even during long outages.
