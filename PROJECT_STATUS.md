# SkyFrame — Project Status

**Last updated:** 2026-04-21 (v1.2.4)

## What is SkyFrame

A local, ad-free weather dashboard. Single user, serves on localhost. HUD-style cyan-on-dark aesthetic. Data from NOAA/NWS public API only — no API keys, no third-party services, no telemetry. Location configured via `.env` (see `.env.example`).

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite (dev server on port 5173)
- **Backend:** Fastify 5 + Node.js via tsx (serves API + prod static bundle on port 3000)
- **Styling:** Vanilla CSS with custom properties (`--accent`, `--accent-rgb`, `--accent-glow-*`) for the accent color system
- **Data:** NOAA/NWS public REST API (no auth required, User-Agent header mandatory)
- **Tests:** Vitest (260 tests across 15 files — mostly server-side, plus pure client-side helpers in `client/alert-detail-format.test.ts`, `client/sound/alert-sounds.test.ts`, `server/updates/github-release.test.ts`, and `server/updates/update-check.test.ts`). No React component test infrastructure (RTL / jsdom).
- **Build:** `npm run build` → Vite bundles client into `dist/client/` (gitignored)
- **Config:** Location + identity lives in `.env` (gitignored). Copy `.env.example` to get started.

## Architecture

```
client/                             React SPA (served by Vite in dev, by Fastify in prod)
  App.tsx                           Root: data fetching, polling, view state, alert/forecast/settings
                                    modal state, alert-sound trigger effect, dismissed pruning
  alert-detail-format.ts            Pure helpers: parseDescription, formatAlertMeta, formatTime,
                                    isUpdateAlert (shared by AlertDetailBody + AlertBanner)
  components/
    TopBar.tsx                      Status line + clock + tab switcher + ≡ hamburger (opens Settings)
    CurrentPanel.tsx                Hero temperature (click to toggle °F/°C) + 5 metric bars + trends
                                    + ▶ forecast trigger inline with TEMP/FEEL label
    HourlyPanel.tsx                 SVG line chart (next 12h) + icons + precip bars + ▶ forecast
                                    trigger inline with section label
    OutlookPanel.tsx                7-day high/low range bars + icons + precip % + clickable day
                                    labels that open the forecast narrative modal
    AlertBanner.tsx                 Hazard-stripe alert banner (conditional, above TopBar). Event
                                    names clickable to open TerminalModal; root onClick acks sounds
    Footer.tsx                      Station link status + pull timestamps + offline indicator
    WxIcon.tsx                      SVG icon renderer (uses inline sprite)
    TerminalModal.tsx               Reusable chrome primitive: overlay, title bar, Esc/overlay close,
                                    focus restore, accent-colored border via CSS variable
    AlertDetailBody.tsx             Content for TerminalModal in alert-detail mode (meta line +
                                    parsed description paragraphs with tier-color prefix highlights)
    ForecastBody.tsx                Content for TerminalModal in forecast-narrative mode (day+night
                                    section headers + narrative paragraphs)
    ForecastButton.tsx              Small inline ▶ trigger used by Current and Hourly panels
    Settings.tsx                    Always-accessible config modal: location, GPS autodetect,
                                    email, update-check checkbox (opt-in), cosmetic-skin placeholder
  icons.svg                         Inline SVG sprite (sun, moon, cloud, partly-*, rain, snow,
                                    thunder, fog)
  sound/
    alert-sounds.ts                 Web Audio synthesis: pure tier→mode classification + imperative
                                    orchestrator (loops, single-play, unlock listener for autoplay)
  main.tsx                          Entry point: injects SVG sprite, mounts React
  styles/
    hud.css                         All dashboard chrome, CSS custom properties for accent colors
    terminal-modal.css              Modal chrome + .alert-detail-* and .forecast-* body rules

server/
  index.ts                          Fastify entry: debug-tier log, update-check scheduler startup,
                                    routes + static serving
  config.ts                         Loads .env + skyframe.config.json → runtime CONFIG; surfaces
                                    lat/lon/email/grid/stations/updateCheckEnabled/debug
  routes.ts                         GET /api/weather (cached), POST /api/setup (writes config +
                                    reconciles update-check scheduler), GET /api/config (returns
                                    current values for Settings pre-population)
  nws/
    client.ts                       Thin fetch wrapper with User-Agent header
    normalizer.ts                   Orchestrator: parallel-fetches NWS endpoints, normalizes to
                                    WeatherResponse, injects cached update alert when present
    cache.ts                        TTL-based in-memory cache
    icon-mapping.ts                 NWS icon URL → IconCode; hourly downgrade < 30%, daily upgrade
                                    >= 50% based on precip probability
    precip.ts                       Precipitation outlook string builder
    trends.ts                       6-observation trend computation (up/down/steady per metric)
    setup.ts                        resolveSetup: geocodes ZIP → lat/lon, calls NWS /points
    debug-alerts.ts                 Synthetic alert injection for dev (SKYFRAME_DEBUG_TIERS env var)
  updates/
    github-release.ts               Pure helpers: parseVersion, compareVersions, parseReleaseResponse
    update-check.ts                 Imperative orchestrator: scheduler (startup + local midnight),
                                    fetchLatestRelease, cachedAvailableUpdate state, buildUpdateAlert

shared/
  types.ts                          WeatherResponse, CurrentConditions, HourlyPeriod, DailyPeriod,
                                    Alert (incl. issuedAt), AlertTier, WeatherMeta (incl.
                                    forecastGeneratedAt), IconCode
  alert-tiers.ts                    Event→tier mapping, tier ranking, TIER_COLORS palette (13 tiers)
  units.ts                          °F↔°C conversion + trend rescaling for the temperature toggle
```

## Data flow

1. Client polls `GET /api/weather` on a schedule driven by `meta.nextRefreshAt` (~90s)
2. Server's normalizer fetches 5 NWS endpoints in parallel:
   - `/points/{lat},{lon}` → sunrise/sunset
   - `/gridpoints/{office}/{gridX},{gridY}/forecast` → 7-day periods
   - `/gridpoints/{office}/{gridX},{gridY}/forecast/hourly` → hourly periods
   - `/stations/{stationId}/observations/latest` → current conditions (with fallback station)
   - `/alerts/active?point={lat},{lon}` → active alerts
3. Normalizer converts units (°C→°F, m/s→mph, Pa→inHg), maps icons, computes trends, filters/sorts alerts by tier rank
4. Response cached in-memory (90s TTL)
5. Client renders: TopBar → AlertBanner (if alerts) → active panel(s) → Footer

## What's shipped

### v1.0
- Full weather dashboard: current conditions, hourly forecast (SVG chart), 7-day outlook
- HUD aesthetic with custom SVG icon sprite + SMIL animations
- Station fallback when primary is stale
- Server-side caching with TTL per endpoint type

### v1.1
- **Step 1** ✅ Offline indicator (Footer + TopBar reflect connectivity state)
- **Step 2** ✅ Tabbed view switcher (CURRENT | HOURLY | OUTLOOK | ALL)
- **Steps 3+4** ✅ NWS alerts + UI color override (9-tier system, hazard-stripe banner, expand/collapse, dismissal)
- **Step 5** — Settings gear (°F/°C toggle, color picker) — partially shipped post-v1.1 (°F/°C toggle via hero click); color picker still deferred
- **Step 6** ✅ Location setup — first-run modal (ZIP or lat/lon), NWS auto-resolve (office, grid, timezone, stations), persistent skyframe.config.json, re-configurable via clickable TopBar location
- **Bug fixes:** hourly past-hour filtering, icon occlusion, range bar glow, precip icon threshold, overnight orphan dedup, stripe rendering

### Post-v1.1 alert/UI refinements
- PDS Tornado and Destructive Severe Thunderstorm tiers (Impact-Based Warning damage-threat parsing)
- Advisory tiers (`advisory-high` honey-orange for 7 known low-severity events, `advisory` catch-all) — 13 tiers total; `classifyAlert` no longer drops unknown events
- Hero-temperature click toggles °F/°C globally (client-side conversion, localStorage persistence)
- Daily icon override at precipProb ≥ 50% (picks rain/snow/thunder via shortForecast keyword match)
- Hero icon centers when conditions are clear sky

### v1.2
- **Feature 4** ✅ Alert detail terminal modal — click event name → full NWS description with HAZARD/SOURCE/IMPACT tier-colored prefixes. Introduces reusable `TerminalModal` chrome primitive
- **Feature 5** ✅ Forecast narrative modal — ▶ glyph on CurrentPanel/HourlyPanel labels and clickable day labels in OutlookPanel open day+night NWS detailedForecast text. Second `TerminalModal` consumer validates chrome-vs-body split
- **Feature 6** ✅ Alert sounds — synthesized Web Audio beeps (looping for top-4 tiers, one-shot for severe-warning). Click-to-acknowledge, localStorage persistence, user-gesture autoplay unlock with pending single-play queue
- **Feature 7** ✅ GPS autodetect — `⌖ USE MY LOCATION` button in Settings modal (localhost-gated; shows `GPS LOCATION UNAVAILABLE` off-loopback)

### v1.2.1
- `LocationSetup` refactored to persistent `Settings` modal reachable from a new `≡` hamburger in the TopBar; same form expanded with update-check opt-in checkbox + disabled cosmetic-skin placeholder. First-run flow unchanged (auto-opens, CANCEL hidden)
- GitHub update notifications (opt-in) — scheduler polls `/repos/OniNoKen4192/SkyFrame/releases/latest` at startup and local midnight when checkbox is on. Newer tag than `package.json.version` injects a synthetic `advisory`-tier alert with release notes in the TerminalModal; UNTIL/EXPIRES suffix suppressed. No outbound requests when off
- `package.json` version bumped to `1.2.1`. `/api/config` returns current values for Settings pre-population; `/api/setup` reconciles scheduler state on toggle

### v1.2.2
- Timezone propagation fix: client now reads the NWS-derived timezone from `/api/config` instead of hardcoding `America/Chicago`. Fixes off-by-hour display for users outside Central time.

### v1.2.3
- Force-fallback station override: Footer `LINK.XXXX` is now a clickable button that opens a HUD-styled popover with AUTO / FORCE SECONDARY radios and a live side-by-side preview of both stations' current readings. Persisted in `skyframe.config.json`. When active, Footer renders in amber with a `[PIN]` suffix. Solves the "primary station is up but reporting physically impossible values during a storm" scenario that the automatic staleness check can't catch.

### v1.2.4
- Favicon: adds the SF-monogram browser-tab icon. Wired via `<link rel="icon">` in `index.html`, served from `client/public/favicon.png` (which Vite ships at the bundle root in production).

## What's pending

### Future version backlog
- **Cosmetic skin selection / color picker:** placeholder shipped in v1.2.1 Settings modal (disabled "Default (HUD cyan)" select). Future work is the actual theme-switching logic and the skin options themselves. Subsumes the v1.1 Step 5 color-picker deferral (°F/°C toggle already shipped via hero click post-v1.1).
- **Alert dismiss duration:** Currently dismissed alerts stay dismissed until they drop off the NWS feed. Could add time-based auto-reactivation if needed.
- **Icon set expansion (v1.2 Section 2c):** New SVG icons for the ~25 NWS weather states currently lumped or falling through to generic cloud (tornado, hurricane, sleet, wind variants, etc.). Gap list at `docs/icon-gaps.md`. Deferred pending user-produced icon art.
- **Hero icon centering edge case:** The current `data-clear="true"` rule uses `flex-grow: 1` which works in fixed-width windows. On a maximized/very-wide window the centered icon may drift visually far from the readout. Easy fix when it matters: add a `max-width` cap (e.g. `240px`) to `.hud-hero-icon[data-clear="true"]` in `client/styles/hud.css`.
- **Vitest 2 upgrade (test runner):** `npm test` script uses `--pool=forks` to work around a Vitest 1.6.1 thread-pool bug that intermittently fails with "No test suite found in file..." across all test files. Forks pool is reliable but ~2× slower than the (broken) threads pool. Vitest 2 is reported to fix the underlying bug; upgrading would let us drop the workaround. Low priority — current setup runs all 260 tests in under 6s.
- See `docs/userInput/v1.2 ideas.txt` for additional candidates (NWS alert types, per-alert deep-dive, sound/notifications, animations, keyboard shortcuts)

## How to run

```bash
# First-time setup
cp .env.example .env   # then fill in your location values

# Development (two terminals)
npm run dev          # Vite dev server (port 5173, HMR for client)
npm run server       # Fastify API server (port 3000, reads .env)

# Production
npm run start:prod   # builds client + starts Fastify on port 3000

# Tests
npm test             # Vitest (260 tests — mostly server, plus pure client helpers)
npm run typecheck    # Both server + client TypeScript configs

# Debug alerts (dev only)
SKYFRAME_DEBUG_TIERS=tornado-warning,flood npm run server
```

## Key patterns

1. **CSS accent color system:** `:root` defines `--accent`, `--accent-rgb`, `--accent-glow-*`. ALL accent-derived colors flow through these vars. Alert tiers override them via `[data-alert-tier]` on the root element.

2. **Alert tier system:** `shared/alert-tiers.ts` maps NWS event names → tiers → severity ranks. Both server and client import it. Adding a tier = one Map entry + one CSS color rule.

3. **Client tests are pure-helper only:** Server has comprehensive Vitest coverage. The client has Vitest files for pure helpers (`client/alert-detail-format.test.ts`, `client/sound/alert-sounds.test.ts`) but no React-component test infrastructure (RTL / jsdom) — component behavior is still verified manually.

4. **Icon probability thresholds:** Hourly precip icons (rain/snow/thunder) downgrade to partly-day/night when probability < 30%. Daily icons upgrade from NWS's non-precip choice to rain/snow/thunder when probability ≥ 50% (target picked via shortForecast keyword match: thunder > snow > rain).

5. **Inline SVG sprite:** `client/icons.svg` imported via `?raw` in `main.tsx`. Changes require Vite dev server restart (not just browser refresh).

6. **Commit convention:** Short imperative subject, multi-paragraph body, `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

7. **PR workflow:** Feature branches named `feat/...` or `fix/...`. PRs via `gh pr create`. Merge via GitHub UI. Post-merge: `git checkout main && git pull && git branch -d <branch>`.

---

## Implemented features

Running list of what's in the codebase. Update this when a feature ships so we don't have to crawl the code to check.

### Core (v1.0)
- Current conditions panel (hero temp, 5 metric bars, trend arrows)
- Hourly forecast panel (SVG line chart, 12h, icons, precip bars)
- 7-day outlook panel (high/low range bars with glow, icons, precip %)
- HUD aesthetic (cyan-on-dark, CSS custom properties for accent color)
- Custom SVG icon sprite with SMIL animations (sun, moon, cloud, rain, snow, thunder, fog, partly-*)
- NWS data: parallel fetch of forecast, hourly, current, alerts, sunrise/sunset
- Unit conversion (°C→°F, m/s→mph, Pa→inHg)
- Station fallback (secondary station when primary is stale/null)
- Server-side caching (TTL per endpoint type)
- Precip icon probability threshold (< 30% downgrades to partly-*)

### v1.1
- Offline indicator (pulsing red dot + "LINK.OFFLINE" in Footer and TopBar)
- Tabbed view switcher (CURRENT | HOURLY | OUTLOOK | ALL) with TopBar nav buttons
- NWS alert banners (hazard-stripe, expand/collapse for multiple, dismiss with ×)
- Alert tier color system (9 tiers: tornado-emergency through watch, each with accent color override)
- UI theme follows highest-severity visible alert (dismissing updates theme)
- Alert dismissal persisted to localStorage (cleared when alert drops off NWS feed)
- Location setup wizard (first-run modal: ZIP or lat/lon → NWS auto-resolve → skyframe.config.json)
- Re-configure location via clickable TopBar location name
- Debug alert injection (SKYFRAME_DEBUG_TIERS env var for dev/testing)

### Alert system enhancements (post-v1.1)
- PDS Tornado and Destructive Severe Thunderstorm alert tiers, classified from NWS Impact-Based Warning damage-threat parameters (hot magenta and crimson respectively). Fixes latent Tornado Emergency detection bug in the same change.

### Advisory tiers (post-v1.1)
- Two new alert tiers: `advisory-high` (honey-orange `#ffaa22`, hazard stripes) for 7 known low-severity NWS events (Wind Advisory, Winter Weather Advisory, Dense Fog Advisory, Wind Chill Advisory, Freeze Warning, Freeze Watch, Frost Advisory), and `advisory` (base cyan, hazard stripes) as catch-all for unknown events. Neither tier overrides the dashboard theme accent.
- `classifyAlert` now always returns an `AlertTier` — unmatched NWS events fall to the `advisory` catch-all instead of being silently dropped by the normalizer. (PR #8, 2026-04-18)

### °F/°C toggle (post-v1.1)
- Click the hero temperature to switch units globally. Preference persists in localStorage. Conversion is client-side; server continues to serve °F. (PR #6, 2026-04-18)

### Icon presentation fixes (post-v1.1)
- Daily forecast icons upgrade to rain/snow/thunder when precipProb >= 50% and NWS chose a non-precip icon. Picks target via shortForecast keyword match (thunder beats snow beats rain). Hourly + current-conditions behavior unchanged. (PR #7, 2026-04-18)
- Hero icon centers in the CurrentPanel hero area when current conditions are clear sky (sun/moon). (PR #7, 2026-04-18)

### Alert detail terminal modal (v1.2 Feature 4)
- Click an alert event name in the banner (single-alert headline or multi-alert expanded list) to open a terminal-styled modal showing the full NWS `description` text, issued/expires timestamps, and affected area. HAZARD/SOURCE/IMPACT paragraph prefixes render in the alert's tier color. Close via × button, Esc key, or overlay click. Focus returns to the trigger on close.
- Introduces a reusable `TerminalModal` primitive (chrome only — overlay, title bar, close behaviors, accent border) with zero alert-specific code. Feature 5's forecast narrative popup will reuse it.
- `Alert` type gains an `issuedAt` field sourced from the NWS CAP `sent` timestamp, with fallback to `effective` when absent.

### NWS narrative forecast modal (v1.2 Feature 5)
- Click the `▶` glyph next to the CurrentPanel `TEMP / FEEL` tag or at the end of the HourlyPanel section label to open today's forecast narrative. Click any day-row date label in the 7-day outlook to open that day's narrative. Modal shows day and night sections stacked with NWS-preserved period names (e.g. `THIS AFTERNOON` / `TONIGHT` for today; `FRIDAY` / `FRIDAY NIGHT` for future days). Reuses the `TerminalModal` primitive from Feature 4 in base-cyan accent — validates the "chrome + thin wrapper" architecture across a second consumer.
- `DailyPeriod` gains four nullable fields (`dayDetailedForecast`, `nightDetailedForecast`, `dayPeriodName`, `nightPeriodName`) populated by the normalizer from the NWS forecast response. Orphan periods (standalone `Tonight` at window start, day-only at window end) leave the missing half null; the modal body omits the absent section without a placeholder.
- `WeatherMeta` gains `forecastGeneratedAt` — the NWS `/gridpoints/.../forecast` top-level `generatedAt` timestamp, shown on the right side of the modal title bar.

### GPS autodetect (v1.2 Feature 7)
- `⌖ USE MY LOCATION` button in the `LocationSetup` modal. Click → browser Geolocation prompt → on success, coordinates populate the existing LOCATION input as `"lat, lon"` with 4-decimal precision. User reviews and clicks SAVE as normal — the existing `/api/setup` flow runs unchanged.
- Localhost-gated via `window.location.hostname` check against `localhost`, `127.0.0.1`, `::1`. Off-loopback hostnames show the button as `GPS LOCATION UNAVAILABLE` (disabled), with tooltip explaining browsers block Geolocation over non-HTTPS origins.
- Along the way: `LocationSetup` modal top-aligns below the banner (matching `TerminalModal`), and the generic `.setup-btn:disabled` state gets explicit opacity / not-allowed-cursor styling that was previously only on the primary variant.

### Alert sounds (v1.2 Feature 6)
- Synthesized beep tones via Web Audio API when a new qualifying alert arrives. `tornado-emergency`, `tornado-pds`, `tornado-warning`, and `tstorm-destructive` loop a 500ms 880Hz square-wave pulse every 1.5 seconds until the user clicks the banner; `severe-warning` plays one beep. Other tiers silent. No audio files, no licenses, no external deps.
- Single banner click (anywhere on the banner) silences all currently-looping sounds. Implemented as one root-level `onClick` — the three spec-listed acknowledgment actions (banner click / detail-modal open / dismissal) all bubble through the same handler.
- Acknowledgments persisted in `localStorage` under `skyframe.alerts.soundAcknowledged` (same shape as the dismissed-alerts set; same pruning pattern). Single-play alerts self-acknowledge when the beep finishes, so reloads don't re-beep.
- Autoplay handling: attaches a one-time document-level click/keydown/touchstart listener that calls `ctx.resume()` from inside a real user gesture, avoiding the browser's "AudioContext was not allowed to start" warning. Single-play beeps that fail due to suspended context are queued and drained on unlock so the user doesn't miss the severe-warning tone. Sound plays from backgrounded tabs / other windows as long as the user has interacted with the dashboard at least once this session.

### Settings modal + GitHub update notifications (v1.2.1)
- `LocationSetup` replaced with a persistent `Settings` modal reachable from a `≡` hamburger button in the TopBar (far right, after the clock). Same chrome (`.setup-*` classes retained) with expanded form: Location + `⌖ USE MY LOCATION` button + Email (all preserved from v1.2 Feature 7), plus a new "Check GitHub for new SkyFrame releases" checkbox (default **off**) and a disabled "Cosmetic skin — coming soon" placeholder. First-run auto-opens Settings with CANCEL hidden and modal-close disabled; anytime-edit via hamburger (or the existing TopBar location link) re-fetches `/api/config` so the form reflects the latest persisted state.
- When the checkbox is enabled, the server runs an unauthenticated `GET /repos/OniNoKen4192/SkyFrame/releases/latest` at startup and at local midnight daily. If the returned `tag_name` is newer than `package.json.version`, a synthetic `advisory`-tier alert is injected into the normalizer's alert list with `id: "update-${tag}"`. The alert appears at the bottom of the alert stack (advisory rank 13), clickable for release notes in the existing TerminalModal, dismissible via the existing flow. "UNTIL / EXPIRES" suffix suppressed for update alerts since the synthetic far-future expires has no meaningful display.
- No outbound requests to GitHub when the checkbox is off. Explicit UI consent model per CLAUDE.md's "no transmitted data beyond the forecast" hard rule — checkbox hint text explains what enabling it does.
- Server scheduler toggles live with `/api/setup`: off → on starts the scheduler immediately; on → off stops the timer and clears any cached update so a visible alert disappears on the next client poll. Backwards-compatible with pre-v1.2.1 configs (missing field defaults to false).
- `package.json` version bumped from `0.1.0` to `1.2.1`. `skyframe.config.json` gains `updateCheckEnabled: boolean`. `/api/config` extended to return the current config values for Settings pre-population.

### Terminal modal typography refresh (post-v1.2.1)
- Aligned the shared `TerminalModal` primitive (used by both alert detail and forecast narrative) with the Settings modal's HUD type system. Title text 13px with 0.18em letterspacing + accent-colored text-shadow glow; recessed `#050a10` title-bar band for console-strip contrast; 13px monospace body with looser padding and line-height; letterspaced-caps section-label treatment for the alert-detail meta line and the forecast section headers (THIS AFTERNOON / TONIGHT / FRIDAY / etc.); proportionally smaller × close button.
- Fixed a portal-inheritance font bug: `TerminalModal` uses `createPortal(document.body)` and sat outside the `.hud-showcase` scope that sets the HUD monospace stack. `font-family: inherit` was falling through to the browser default sans-serif. `.terminal-modal` now sets the monospace stack explicitly.
- Stylesheet-only refactor — no component, prop, test, or accessibility changes. Tier accent color (`--terminal-modal-accent`) continues to flow through to the title glow, meta line, and prefix/header colors per alert tier.
- Spec: [docs/superpowers/specs/2026-04-20-terminal-modal-typography-design.md](docs/superpowers/specs/2026-04-20-terminal-modal-typography-design.md)

### Timezone propagation fix (v1.2.2)
- Extended `/api/config` to include the NWS-derived `timezone` (IANA ID like `America/New_York`). Client's `App.tsx` stores it in state and prop-drills it to `TopBar`, `Footer`, `AlertBanner`, and `AlertDetailBody`, plus the two `formatTime(...)` call sites for the alert detail and forecast narrative modal title-right timestamps.
- `formatTime` and `formatAlertMeta` in `client/alert-detail-format.ts` now accept a `timezone: string | null` parameter; module-level `Intl.DateTimeFormat` constants in `TopBar`, `Footer`, and `AlertBanner` moved to per-call construction with the same parameter pattern.
- Fallback: when the timezone is `null` (only during the brief window between App mount and config fetch resolution), formatters pass `timeZone: undefined` to `Intl.DateTimeFormat`, which resolves to the browser's local timezone. Once config resolves, all formatters switch to the authoritative NWS-derived TZ.
- New `alert-detail-format.test.ts` regression test verifies the timezone parameter is honored (`America/Chicago` vs `America/New_York` produce different outputs for the same ISO input).

### Force fallback station (v1.2.3)
- New `StationPopover` component anchored to the Footer `LINK.XXXX` button. Displays AUTO / FORCE SECONDARY radios + live preview rows for both primary and fallback stations (ID, observed time, temp, live/stale/error status). Preview data fetched on popover open via `GET /api/stations/preview` (parallel `Promise.allSettled` to both stations).
- `POST /api/station-override` persists the mode to `skyframe.config.json`, clears the weather cache, and returns 200. `App.tsx` triggers an immediate `/api/weather` refetch after a successful override change so the UI updates without waiting for the 90s poll cycle.
- Footer renders `LINK.KRAC [PIN]` in amber when the override is active; distinguishes from the pre-existing auto-fallback amber state via the `[PIN]` text marker. Same amber color space is reused intentionally — both states mean "not on primary station."
- `fetchObservationsWithFallback` in `server/nws/normalizer.ts` short-circuits to the fallback station when `CONFIG.stationOverride === 'force-secondary'`, without issuing any primary-station requests. `meta.error` is NOT set to `'station_fallback'` for pinned responses — the two fields are orthogonal.
- `WeatherMeta.stationOverride` added (`'auto' | 'force-secondary'`, always present) so the client can render `[PIN]` without a second round-trip.
- Motivated by a real scenario (Oak Creek, WI, 2026-04-18): primary station (KMKE) was responsive but reported 0°F mid-storm after lightning damage. Automatic staleness check can't detect physically impossible values; this is the human-in-the-loop escape hatch. Spec: [docs/superpowers/specs/2026-04-20-force-fallback-station-design.md](docs/superpowers/specs/2026-04-20-force-fallback-station-design.md)
