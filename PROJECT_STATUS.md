# SkyFrame — Project Status

**Last updated:** 2026-04-17

## What is SkyFrame

A local, ad-free weather dashboard. Single user, serves on localhost. HUD-style cyan-on-dark aesthetic. Data from NOAA/NWS public API only — no API keys, no third-party services, no telemetry. Location configured via `.env` (see `.env.example`).

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite (dev server on port 5173)
- **Backend:** Fastify 5 + Node.js via tsx (serves API + prod static bundle on port 3000)
- **Styling:** Vanilla CSS with custom properties (`--accent`, `--accent-rgb`, `--accent-glow-*`) for the accent color system
- **Data:** NOAA/NWS public REST API (no auth required, User-Agent header mandatory)
- **Tests:** Vitest (server-side only — 126 tests across 9 files). No client-side test infrastructure.
- **Build:** `npm run build` → Vite bundles client into `dist/client/` (gitignored)
- **Config:** Location + identity lives in `.env` (gitignored). Copy `.env.example` to get started.

## Architecture

```
client/                     React SPA (served by Vite in dev, by Fastify in prod)
  App.tsx                   Root: data fetching, polling, view state, alert dismissal
  components/
    TopBar.tsx              Status line + clock + tab switcher
    CurrentPanel.tsx        Hero temperature + 5 metric bars + trends
    HourlyPanel.tsx         SVG line chart (next 12h) + icons + precip bars
    OutlookPanel.tsx        7-day high/low range bars + icons + precip %
    AlertBanner.tsx         Hazard-stripe alert banner (conditional, above TopBar)
    Footer.tsx              Station link status + pull timestamps + offline indicator
    WxIcon.tsx              SVG icon renderer (uses inline sprite)
  icons.svg                 Inline SVG sprite (sun, moon, cloud, partly-*, rain, snow, thunder, fog)
  main.tsx                  Entry point (injects SVG sprite into DOM, mounts React)
  styles/hud.css            All styles. CSS custom properties drive the accent color system.

server/
  index.ts                  Fastify server entry: API routes + static file serving
  config.ts                 Reads location/identity from .env, cache TTLs, debug flags
  routes.ts                 GET /api/weather → calls normalizer, caches result
  nws/
    client.ts               Thin fetch wrapper with User-Agent header
    normalizer.ts           Orchestrator: parallel-fetches NWS endpoints, normalizes to WeatherResponse
    cache.ts                TTL-based in-memory cache
    icon-mapping.ts         NWS icon URL → IconCode (with precip probability threshold)
    precip.ts               Precipitation outlook string builder
    trends.ts               6-observation trend computation (up/down/steady per metric)
    debug-alerts.ts         Synthetic alert injection for dev (SKYFRAME_DEBUG_TIERS env var)

shared/
  types.ts                  WeatherResponse, CurrentConditions, HourlyPeriod, DailyPeriod, Alert, AlertTier
  alert-tiers.ts            Event→tier mapping, tier ranking, TIER_COLORS palette
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
- **Step 5** — Settings gear (°F/°C toggle, color picker) — **deferred to future version**
- **Step 6** ✅ Location setup — first-run modal (ZIP or lat/lon), NWS auto-resolve (office, grid, timezone, stations), persistent skyframe.config.json, re-configurable via clickable TopBar location
- **Bug fixes:** hourly past-hour filtering, icon occlusion, range bar glow, precip icon threshold, overnight orphan dedup, stripe rendering

## What's pending

### Future version backlog
- **Settings gear:** °F/°C toggle + curated color picker (no alert-color overlap). Per spec: `docs/superpowers/specs/2026-04-15-v1.1-roadmap-design.md`. Originally v1.1 Step 5, deferred.
- **Alert dismiss duration:** Currently dismissed alerts stay dismissed until they drop off the NWS feed. Could add time-based auto-reactivation if needed.
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
npm test             # Vitest (126 tests, server-side only)
npm run typecheck    # Both server + client TypeScript configs

# Debug alerts (dev only)
SKYFRAME_DEBUG_TIERS=tornado-warning,flood npm run server
```

## Key patterns

1. **CSS accent color system:** `:root` defines `--accent`, `--accent-rgb`, `--accent-glow-*`. ALL accent-derived colors flow through these vars. Alert tiers override them via `[data-alert-tier]` on the root element.

2. **Alert tier system:** `shared/alert-tiers.ts` maps NWS event names → tiers → severity ranks. Both server and client import it. Adding a tier = one Map entry + one CSS color rule.

3. **No client tests:** Server has comprehensive Vitest coverage. Client verified manually.

4. **Icon probability threshold:** Precip icons (rain/snow/thunder) downgraded to partly-day/night when probability < 30%.

5. **Inline SVG sprite:** `client/icons.svg` imported via `?raw` in `main.tsx`. Changes require Vite dev server restart (not just browser refresh).

6. **Commit convention:** Short imperative subject, multi-paragraph body, `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` trailer.

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
