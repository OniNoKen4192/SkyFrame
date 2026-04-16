# v1.1 Step 1 — Offline indicator

**Date:** 2026-04-16
**Status:** Draft — pending user review
**Roadmap context:** [v1.1 roadmap](2026-04-15-v1.1-roadmap-design.md), Step 1
**Source idea:** [docs/userInput/v1.1 ideas.txt](../../userInput/v1.1%20ideas.txt) line 1

## Goal

Make it visually obvious when the client cannot reach the server: turn the Footer dot red, replace the station identifier with `LINK.OFFLINE`, and show the actual next retry time instead of the now-stale server-promised refresh time.

## Behavior

| State | Dot | Text | NEXT timestamp |
|---|---|---|---|
| Online | Cyan, pulsing (existing `hudBlink`) | `LINK.KMKE` | Server's `meta.nextRefreshAt` (existing) |
| Offline | Red, **static** (no animation) | `LINK.OFFLINE` | Actual next retry time (`now + 30s` at moment of failure) |
| Recovery | Reverts to online state on next successful fetch | | |

**Trigger:** any failure of `fetch('/api/weather')` — network error or HTTP non-2xx. Single-failure trigger (no debouncing). Existing 30s retry-on-error behavior is unchanged.

**Initial-load failure:** if the very first fetch fails, the panels still show `■ LOADING...` while the Footer shows `LINK.OFFLINE` with the retry NEXT. This is correct — we *are* offline.

## Files touched

### [client/components/Footer.tsx](../../../client/components/Footer.tsx)

- Change `'LINK FAIL'` → `'LINK.OFFLINE'` (line 29).
- Add new prop `nextRetryAt: string | null` (ISO timestamp).
- When `error` is set and `nextRetryAt` is non-null, format and display `nextRetryAt` for the NEXT field. Otherwise display `meta.nextRefreshAt` as today.

### [client/App.tsx](../../../client/App.tsx)

- Add `nextRetryAt` state (`useState<string | null>(null)`).
- On fetch failure (in the `catch` block):
  - `setNextRetryAt(new Date(Date.now() + ERROR_RETRY_MS).toISOString())` alongside `setError(...)`.
- On fetch success (in the `try` block):
  - `setNextRetryAt(null)` alongside `setError(null)`.
- Pass `nextRetryAt` to `<Footer />`.

### [client/styles/hud.css](../../../client/styles/hud.css)

- **No changes.** The existing `.dot.dot-error` rule (lines 233-237) already gives static red with no animation, which matches the chosen behavior.

## Out of scope

- The 30s retry-on-error timing (`ERROR_RETRY_MS`) — unchanged.
- The `dot-error` class name and CSS — unchanged.
- Server, normalizer, types, cache — no changes.
- Any other component.
- Adding client-side test infrastructure (see Testing).

## Testing

This step does not add automated tests. Rationale:

- The project's existing Vitest setup covers server-side modules only (normalizer, cache, routes, etc.).
- No client component test infrastructure exists (no `jsdom`, no `@testing-library/react` in devDependencies).
- Adding client test infrastructure for one display-only component change is scope creep. If client testing is wanted later, it should be its own decision and its own PR.

**Manual verification checklist:**

1. Start `npm run dev` and `npm run server` in two terminals. Confirm:
   - Cyan dot pulsing
   - Footer text shows `LINK.KMKE`
   - NEXT timestamp roughly 90s out
2. Stop the server. Wait for the next poll (≤90s). Confirm:
   - Dot turns red and is static (no pulse)
   - Footer text shows `LINK.OFFLINE`
   - NEXT shows a timestamp ~30s after the moment of failure
3. Restart the server. Within 30s, confirm everything returns to the online state cleanly (cyan pulse, station ID, server's NEXT).
4. For a faster cycle, use the browser DevTools Network tab to toggle offline mode instead of stopping the server.

## Risks / edge cases

- **Clock display:** `nextRetryAt` is computed client-side, so it always matches the user's local clock. No timezone or skew issues.
- **Successive failures:** each failed retry recomputes `nextRetryAt = now + 30s`, so the displayed NEXT updates every 30s during a sustained outage. This is correct.
- **Recovery race:** if a retry succeeds at the moment the user is reading the offline state, the next render flips back to online. No flicker risk because `setError(null)` and `setNextRetryAt(null)` happen in the same React batch as `setData(json)`.
