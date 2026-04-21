# Force Fallback Station — Design

**Date:** 2026-04-20
**Status:** Approved for implementation planning
**Version target:** v1.2.3
**Branch:** `feat/force-fallback-station`, off `main`

## Summary

Add a user-triggered override that forces the dashboard to read current observations from the secondary (fallback) station instead of the primary, bypassing the server's automatic staleness-based fallback logic. The control lives in the Footer: clicking the existing `LINK.XXXX` station indicator opens a small HUD-styled popover with a two-state radio (`AUTO` / `FORCE SECONDARY`) and live preview rows for both stations so the user can compare readings before committing. When the override is active, the Footer link renders in amber with a `[PIN]` suffix so the manual state is always visible.

Motivating scenario: during a severe-weather event, the primary station can be *up and responding* with physically impossible values (e.g., 0°F mid-storm after lightning damage at KMKE). The server's existing null/staleness checks can't catch "bad data that isn't null," so only a human noticing the wrong number can trigger the correct response. This feature is the override that human needs.

## Decisions settled during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Use case framing | Sticky preference, not dev-only or diagnostic | Real motivating scenario is user noticing bad-but-not-missing data during severe weather. Must persist across server restarts. |
| Override states | Two-state: `auto` / `force-secondary` | Matches the actual scenario. Symmetric three-state (`force-primary`) is YAGNI — the primary is the default; forcing it is just "auto" minus the safety net. |
| UI placement | Footer `LINK.XXXX` becomes clickable | Footer station indicator is already pointing at the data the user is distrusting. Most natural and most discoverable affordance during an active event. |
| UI treatment | Popover with preview rows | Preview is the load-bearing feature — turns "flip blind and hope" into "I can see KMKE=0°F and KRAC=48°F, pin to KRAC." Without preview, this is a coin flip until after the click. |
| Override indicator | Amber color + `[PIN]` suffix | Amber already means "not on primary" (auto-fallback). `[PIN]` text disambiguates manual vs automatic without adding a third footer color. |
| Persistence | `skyframe.config.json` | Same pattern as `updateCheckEnabled`. Survives Fastify restart mid-event. |
| API surface | New dedicated `POST /api/station-override` | `/api/setup` re-resolves full NWS metadata; the override is a one-field surgical change. Separate endpoint keeps the concerns clean. |
| Preview data source | New `GET /api/stations/preview` | Lazy fetch on popover open. Not worth bloating `/api/weather` with an always-included second station. |

## Scope

**In scope:**
- New `stationOverride` field in `skyframe.config.json` (`'auto' | 'force-secondary'`, defaults to `'auto'`)
- `fetchObservationsWithFallback` in `server/nws/normalizer.ts` honors the override
- New `POST /api/station-override` endpoint
- New `GET /api/stations/preview` endpoint
- New `client/components/StationPopover.tsx` component
- New `.station-popover*` CSS rules appended to `hud.css`
- `Footer.tsx` makes `LINK.XXXX` clickable and renders `[PIN]` suffix when override is active
- `WeatherResponse.meta` gains a required `stationOverride: 'auto' | 'force-secondary'` field so the client knows whether to render `[PIN]` without a second round-trip. Always present (defaults to `'auto'`) so the client can trust the value and doesn't need presence-checks.
- Weather cache invalidation on override change (so the flip takes effect on next poll, not after 90s TTL)

**Out of scope:**
- Three-state override with `force-primary` (YAGNI)
- User-editable fallback station ordering (edit `.env` or re-run setup)
- Automatic detection of "station is up but lying" via value-plausibility checks (distinct feature; not this one)
- Per-metric station override (e.g., temp from A, wind from B)
- Override timeout / auto-expiry back to AUTO
- Notification when override is auto-cleared (there is no auto-clear)
- Graphical station map or distance visualization
- Historical comparison ("last 6 obs from both stations")

## User flow

```
User sees suspicious reading (e.g., 0°F during a thunderstorm)
  → clicks LINK.KMKE in Footer
  → StationPopover opens anchored above the Footer link
  → popover fetches /api/stations/preview on mount
  → shows:
      [●] AUTO — KMKE, fallback to KRAC
      [ ] FORCE KRAC
      KMKE  14:28  0°F   (live)
      KRAC  14:25  48°F  (live)
  → user clicks FORCE KRAC radio
  → client POSTs { mode: 'force-secondary' } to /api/station-override
  → server writes skyframe.config.json, invalidates weather cache, returns 200
  → popover closes
  → next /api/weather poll (within ~90s, or triggered immediately) returns
    obs from KRAC
  → Footer renders:  ● LINK.KRAC [PIN]  in amber

Later, primary recovers:
  → user clicks LINK.KRAC [PIN]
  → popover reopens, radio shows FORCE KRAC selected
  → user clicks AUTO
  → POST /api/station-override { mode: 'auto' }
  → Footer returns to default cyan LINK.KMKE
```

## UI design

### Footer states

```
Normal (AUTO, primary healthy):
  ● LINK.KMKE  · LAST PULL 14:32:15 · NEXT 14:33:45
  dot: cyan, link: cyan

Auto-fallback fired (AUTO, primary stale, server chose secondary):
  ● LINK.KRAC  · LAST PULL 14:32:15 · NEXT 14:33:45
  dot: amber, link: amber
  (unchanged from today — this is meta.error === 'station_fallback')

Manual override (stationOverride === 'force-secondary'):
  ● LINK.KRAC [PIN]  · LAST PULL 14:32:15 · NEXT 14:33:45
  dot: amber, link: amber, [PIN] rendered in amber at same font weight

Offline:
  ● LINK.OFFLINE  · LAST PULL 14:32:15 · NEXT 14:33:45
  dot: red (unchanged)
```

The `[PIN]` marker is a plain text span, letterspaced like the surrounding footer text. No icon, no badge chrome — matches the Footer's existing aesthetic density.

**Precedence when override + auto-fallback collide:** the override wins conceptually (the user asked for this), but visually the `[PIN]` suffix is what distinguishes manual from automatic. Server logic: when `stationOverride === 'force-secondary'`, the server always reads from the secondary and never sets `meta.error = 'station_fallback'` (because it didn't fall back — the user chose this).

### Popover anchor and positioning

Anchored to the Footer's `LINK.XXXX` span. Positioned *above* the Footer (not below — the Footer sits at the bottom of the dashboard, so below would render off-viewport). Left-aligned to the link's left edge.

```
  ┌─ STATION SOURCE ─────────────────────┐
  │                                      │
  │  [●] AUTO — KMKE, fallback to KRAC   │
  │  [ ] FORCE KRAC                      │
  │                                      │
  │  ── PREVIEW ──                       │
  │  KMKE   14:28   0°F    (live)        │
  │  KRAC   14:25   48°F   (live)        │
  │                                      │
  └──────────────────────────────────────┘
         ● LINK.KMKE · LAST PULL ...
```

Popover chrome:
- 1px solid accent border (`--accent` in AUTO, or amber `#ffaa22` when override active — matches the Footer link color it's anchored to)
- `#050a10` background (matches TerminalModal's recessed band)
- 14px padding
- Fixed width ~320px
- Font: inherited monospace, 11px body, 9px section dividers letterspaced

Dismissal:
- Click outside the popover (overlay-style mousedown listener on `document`)
- Press Esc (window keydown listener)
- Click a radio option *also* closes after the POST resolves (no separate "apply" button — the radio *is* the action)

Preview row format:
```
STATIONID  HH:MM  VAL°F  (status)
```
- `STATIONID` — 4-letter ICAO
- `HH:MM` — observation timestamp in the user's configured timezone
- `VAL°F` — latest temperature, or `—` if null
- `(status)` — `live`, `stale` (obs older than 90 min), or `error` (fetch failed)

If preview fetch fails entirely, render `PREVIEW UNAVAILABLE` in lieu of rows and let the user toggle blind. The override still works — preview is diagnostic, not required.

### Popover visual states during interaction

- **Loading** (first 200–400ms while `/api/stations/preview` is in flight): radios render immediately with current state selected; preview rows show `KMKE  ——  ···  (loading)` placeholder
- **Idle:** preview rows filled in, radios clickable
- **Submitting** (after radio click, waiting for `/api/station-override` response): radios disabled, brief `APPLYING…` status line above the section divider
- **Error** (POST failed): rollback to prior selection, inline `▲ OVERRIDE FAILED — ${message}` line below the radios; popover stays open for retry

## Component structure

### Server: three changes

#### 1. Config shape — `server/config.ts`

Add to `SkyFrameLocationConfig`:
```typescript
stationOverride?: 'auto' | 'force-secondary';  // optional for backwards compat
```

Add to `buildConfig()`'s return object:
```typescript
stationOverride: saved?.stationOverride ?? 'auto',
```

`saveSkyFrameConfig` unchanged — it already writes the whole object.

#### 2. Observation fetch — `server/nws/normalizer.ts`

Modify `fetchObservationsWithFallback` to check the override before the primary fetch:

```typescript
async function fetchObservationsWithFallback(now: Date): Promise<ObsFetchResult> {
  const { stations, stationOverride } = CONFIG;

  // User has explicitly pinned to secondary — skip primary entirely.
  if (stationOverride === 'force-secondary') {
    const secondaryLatest = await fetchNws<NwsObsResponse>(
      `/stations/${stations.fallback}/observations/latest`,
    );
    const secondaryHistory = await fetchNws<NwsObsListResponse>(
      `/stations/${stations.fallback}/observations?limit=6`,
    );
    return {
      obsLatest: secondaryLatest,
      obsHistory: secondaryHistory,
      stationId: stations.fallback,
      fellBack: false,  // this is a pin, not a fallback
      pinned: true,
    };
  }

  // ...existing auto-fallback logic unchanged
}
```

`ObsFetchResult` gains a `pinned: boolean` field. `normalizeWeather` uses it to set `meta.stationOverride = 'force-secondary'` in the response. When `pinned` is true, `meta.error` is NOT set to `'station_fallback'` — the two fields are orthogonal and `'station_fallback'` describes the automatic case only.

#### 3. Two new routes — `server/routes.ts`

```typescript
app.post<{
  Body: { mode: 'auto' | 'force-secondary' };
  Reply: { success: true } | ErrorReply;
}>('/api/station-override', async (req, reply) => {
  if (!CONFIG.configured) {
    reply.code(503);
    return { error: 'not_configured', message: 'Location not set.' };
  }
  const { mode } = req.body;
  if (mode !== 'auto' && mode !== 'force-secondary') {
    reply.code(400);
    return { error: 'invalid_input', message: 'mode must be "auto" or "force-secondary"' };
  }

  // loadSavedConfig is exported from config.ts (currently internal — expose as
  // part of this change). Non-null here because CONFIG.configured implies a
  // persisted config file exists.
  const saved = loadSavedConfig();
  if (!saved) {
    reply.code(500);
    return { error: 'config_missing', message: 'skyframe.config.json not found despite configured state' };
  }
  saveSkyFrameConfig({ ...saved, stationOverride: mode });
  reloadConfig();
  cache.clear();  // invalidate weather cache so the flip applies on next poll

  app.log.info(`Station override set to ${mode}`);
  return { success: true as const };
});

app.get('/api/stations/preview', async (_req, reply) => {
  if (!CONFIG.configured) {
    reply.code(503);
    return { error: 'not_configured', message: 'Location not set.' };
  }

  const { primary, fallback } = CONFIG.stations;
  const [primaryResult, fallbackResult] = await Promise.allSettled([
    fetchNws<NwsObsResponse>(`/stations/${primary}/observations/latest`),
    fetchNws<NwsObsResponse>(`/stations/${fallback}/observations/latest`),
  ]);

  return {
    primary: summarizeStation(primary, primaryResult),
    fallback: summarizeStation(fallback, fallbackResult),
  };
});
```

`summarizeStation` lives in a new file `server/nws/station-preview.ts` — it's a separate concern from `normalizer.ts` (which orchestrates the main weather response) and small enough to own its module. It maps `PromiseSettledResult<NwsObsResponse>` to `{ stationId, observedAt, tempF, status: 'live' | 'stale' | 'error' }` using the same staleness threshold as auto-fallback.

#### 4. `/api/config` extension

Add `stationOverride` to the configured-response branch so the client can render the correct Footer state from first paint:

```typescript
return {
  configured: true as const,
  // ...existing fields
  stationOverride: CONFIG.stationOverride,
};
```

### Client: one new component, two modified

#### New: `client/components/StationPopover.tsx`

```typescript
interface StationPopoverProps {
  anchorRef: React.RefObject<HTMLSpanElement>;
  currentMode: 'auto' | 'force-secondary';
  primaryStationId: string;
  fallbackStationId: string;
  timezone: string | null;
  onChange: (mode: 'auto' | 'force-secondary') => Promise<void>;
  onClose: () => void;
}
```

Renders an absolutely-positioned div anchored to `anchorRef.current.getBoundingClientRect()`. On mount, fires `GET /api/stations/preview` into local state. Handles Esc + outside-click dismiss via `useEffect` listeners on `document`. Focus management: on open, focus the selected radio; on close, return focus to `anchorRef.current`.

Keeps its own local state for submit-in-flight and error. Calls `onChange` when a radio is clicked; on resolution, closes via `onClose`. On rejection, renders the inline error and stays open.

#### Modified: `client/components/Footer.tsx`

Becomes stateful (`useState<boolean>` for popover open). The `LINK.XXXX` `<span>` becomes a `<button className="footer-link footer-link-button">` (preserving link styling but gaining keyboard + click semantics — no anchor href because it's not a navigation). The `[PIN]` suffix is a sibling span rendered when `meta.stationOverride === 'force-secondary'`.

New prop: `stationOverride: 'auto' | 'force-secondary' | null` (null during the initial config-fetch window) and a `primaryStationId` / `fallbackStationId` pair sourced from `/api/config`.

When the popover closes after a successful override change, `App.tsx` should trigger an immediate weather re-fetch instead of waiting for the next scheduled poll — otherwise the user sees the `[PIN]` marker update but the conditions panel still shows primary's numbers for up to 90s. A `refetch()` callback is passed down from App.

#### Modified: `client/App.tsx`

- Fetches `stationOverride` from `/api/config` on mount, stores in state
- Passes `stationOverride`, `primaryStationId`, `fallbackStationId`, and a `refetchWeather` callback to `Footer`
- Handles the `POST /api/station-override` call in a wrapper function so Footer/StationPopover stay presentational

### CSS — `client/styles/hud.css`

Append a new section:

```css
/* ============================================================
   STATION POPOVER
   ============================================================ */

.footer-link-button {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}
.footer-link-button:hover {
  text-shadow: 0 0 8px var(--accent-glow-strong);
}
.footer-link-pin {
  margin-left: 6px;
  color: #ffaa22;
  text-shadow: 0 0 8px rgba(255, 170, 34, 0.7);
}

.station-popover {
  position: fixed;  /* positioned via JS from anchor rect */
  width: 320px;
  background: #050a10;
  border: 1px solid var(--accent);
  padding: 14px 16px;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.12em;
  z-index: 100;
}
.station-popover[data-override="true"] {
  border-color: #ffaa22;
}
.station-popover-title {
  font-size: 9px;
  letter-spacing: 0.22em;
  opacity: 0.7;
  margin-bottom: 10px;
}
.station-popover-radio {
  display: block;
  padding: 4px 0;
  cursor: pointer;
}
.station-popover-divider {
  margin: 12px 0 8px;
  font-size: 9px;
  letter-spacing: 0.22em;
  opacity: 0.5;
}
.station-popover-row {
  display: grid;
  grid-template-columns: 60px 50px 60px 1fr;
  gap: 8px;
  padding: 2px 0;
}
.station-popover-row[data-status="stale"] { opacity: 0.6; }
.station-popover-row[data-status="error"] { color: #ff4444; opacity: 0.7; }
.station-popover-error {
  margin-top: 8px;
  color: #ff4444;
  font-size: 10px;
}
```

No new primitive in the same shape as TerminalModal — this popover is intentionally simpler: no overlay backdrop, no title bar, fixed-width, fire-and-close. TerminalModal would be oversized for a 2-option radio with 2 preview rows.

## Data flow

```
User clicks LINK.KMKE
  → Footer setState({ popoverOpen: true })
  → StationPopover mounts
    → useEffect: fetch('/api/stations/preview')
    → local state: preview = { primary: {...}, fallback: {...} }

User clicks FORCE KRAC radio
  → StationPopover calls props.onChange('force-secondary')
    → App.tsx wrapper: fetch POST /api/station-override { mode: 'force-secondary' }
    → server: saveSkyFrameConfig, reloadConfig, cache.clear, return 200
    → App.tsx: setState({ stationOverride: 'force-secondary' })
    → App.tsx: refetchWeather()
      → fetch /api/weather → normalizer calls fetchObservationsWithFallback
        → stationOverride === 'force-secondary' → skip primary, fetch KRAC
        → meta.stationOverride = 'force-secondary', meta.error unset
      → App.tsx setState({ weather: newData })
    → onChange promise resolves
  → StationPopover calls props.onClose
  → Footer setState({ popoverOpen: false })
  → Footer re-renders with LINK.KRAC + [PIN] in amber
```

## Error handling

| Failure point | Behavior |
|---|---|
| `/api/stations/preview` fails | Popover renders `PREVIEW UNAVAILABLE` placeholder; radios still work |
| `/api/station-override` returns 400/500 | Popover shows inline `▲ OVERRIDE FAILED — {message}`; radios re-enabled; selection rolls back to prior |
| `/api/weather` fails after override | Standard offline handling kicks in — Footer shows `LINK.OFFLINE`. The override is persisted server-side, so when connectivity returns, the pin is still in effect |
| Secondary station itself is down while forced | `normalizeWeather` throws → `/api/weather` returns 503 → offline state. User can reopen popover and switch back to AUTO |
| Config file write fails | `saveSkyFrameConfig` throws → server returns 500 → popover shows error, selection rolls back |
| User toggles rapidly (click AUTO, FORCE, AUTO within 2s) | Each click submits; requests serialize on the server since they all hit `saveSkyFrameConfig` which is synchronous fs write. The last one wins. Cache is cleared each time so no stale response from a superseded flip. |

## Edge cases

- **Primary station recovers on its own mid-override:** nothing automatic happens. The user set the override; only the user clears it. This is intentional — surprise auto-revert could bounce the user off correct data back to the station they just decided not to trust.
- **Override is `force-secondary` but `.env` later swaps primary/fallback (user ran setup with flipped roles):** the override remains `force-secondary` → reads from whatever the new `stations.fallback` resolves to. Acceptable: the semantic is "pin to the fallback slot," not "pin to this specific station ID."
- **Popover open, user runs setup from TopBar → Settings:** Settings is a full modal and will cover the Footer; popover closes via outside-click when the user clicks through. After setup completes, `/api/config` refetches and popover reflects any override state.
- **Override is active at first-run (shouldn't happen — fresh config defaults to `auto`):** `buildConfig` returns `'auto'` when `saved?.stationOverride` is undefined. Backwards compatibility: existing `skyframe.config.json` files without the field read as `auto`.
- **User sets override, never loads `/api/weather`, closes browser:** server state persists. Next startup: normalizer reads `CONFIG.stationOverride === 'force-secondary'` and goes straight to secondary.
- **Popover opens, user tabs away and back:** preview data goes stale but not re-fetched. Minor. If user wants fresh preview, close and reopen.
- **Preview shows both stations live with plausible values (override was unnecessary):** not our concern — user may still have a reason. UI doesn't second-guess.

## Testing strategy

### Server unit tests (Vitest)

- `fetchObservationsWithFallback` with `stationOverride === 'force-secondary'` skips primary fetch entirely (assert via `fetchNws` call history)
- `fetchObservationsWithFallback` with `stationOverride === 'auto'` and healthy primary behaves identically to today (regression)
- `fetchObservationsWithFallback` with `stationOverride === 'auto'` and stale primary falls back to secondary (regression)
- `/api/station-override` with invalid `mode` returns 400
- `/api/station-override` with valid `mode` persists to config and clears cache
- `summarizeStation` maps successful fetch to `{ status: 'live' }`, aged fetch to `'stale'`, rejected promise to `'error'`
- `/api/config` includes `stationOverride` in its response when configured
- `meta.stationOverride` is set on `WeatherResponse` when the override is active, and `meta.error` is NOT `'station_fallback'` in that case

### Client tests

None for `StationPopover` — consistent with project posture (no RTL/jsdom). Pure helpers, if any extracted, get tests.

### Manual validation

- Click `LINK.KMKE` → popover opens, both stations show preview data within ~500ms
- Select FORCE secondary → popover closes, Footer shows amber `LINK.KRAC [PIN]`, CurrentPanel updates to secondary's readings within the refetch cycle
- Reopen popover → FORCE radio is pre-selected
- Select AUTO → Footer returns to cyan `LINK.KMKE`
- Kill the secondary station's `/observations/latest` endpoint via a local proxy or blocked network → force secondary → offline state, then toggle back to AUTO → recovers
- Set `SKYFRAME_DEBUG_TIERS=tornado-warning` alongside the override to confirm the two features don't interfere (alert banner + Footer `[PIN]` can coexist)
- Restart Fastify while override is active → state survives, first `/api/weather` call reads from secondary
- Preview endpoint with one station down → popover shows `(error)` status row for that station, radio still functional

## Documentation updates when shipped

- `PROJECT_STATUS.md` → "Implemented features" → add a v1.2.3 entry describing the force-fallback control
- `PROJECT_STATUS.md` → update "Last updated" and version tag
- `package.json` → version `1.2.2` → `1.2.3`
- `CLAUDE.md` → the "Station fallback" paragraph already describes auto-fallback; add one sentence noting the manual override path exists and points at the Footer click affordance. Do not duplicate the full design — this is a landmark, not a reference.

## Ship path

Branch `feat/force-fallback-station` off `main`. Commit in logical chunks:

1. Server: `SkyFrameLocationConfig` + `CONFIG.stationOverride` plumbing
2. Server: `fetchObservationsWithFallback` honors override + `meta.stationOverride` exposed
3. Server: `POST /api/station-override` + cache invalidation
4. Server: `GET /api/stations/preview` + `summarizeStation` helper
5. Client: `StationPopover.tsx` + CSS
6. Client: `Footer.tsx` becomes interactive + `App.tsx` wires state/callbacks
7. Version bump + docs

Ship via PR, consistent with Ken's stated preference to use PR workflow rather than local-merge for this feature. Manual validation against a real storm event is obviously impractical as a gating step; validate against a mock scenario by temporarily adding an `.env` value that rewrites primary to a non-existent station ID so the override has a clear observable effect.
