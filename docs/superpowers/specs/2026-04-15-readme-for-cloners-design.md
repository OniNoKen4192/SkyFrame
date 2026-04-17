---
name: README-for-cloners
description: Expand the existing README so anyone cloning the repo can run SkyFrame and manually adapt it to their own location. Scoped for v0.1 MVP; superseded by v1.1 when location becomes configurable at runtime.
type: design
date: 2026-04-15
---

# README for cloners — design

## Goal

Make the existing [README.md](../../../README.md) sufficient for a stranger who clones the repo to:

1. Get the app running locally (already covered).
2. See what it looks like before they install it (screenshot — new).
3. Change the hardcoded location to their own ZIP / grid / station (new, manual walkthrough).

Explicitly **out of scope:** making the location configurable at runtime, refactoring the client components to read location strings from config, scripting the `/points` lookup. Those belong to v1.1. This doc exists so the repo is usable-by-others *before* v1.1 lands, not as a substitute for it.

## Constraints

- **Single README.** No new docs files for this. User confirmed 2026-04-15.
- **Don't touch [PROJECT_SPEC.md](../../../PROJECT_SPEC.md) or [CLAUDE.md](../../../CLAUDE.md).** Those describe v1 as *built for {CITY}*, which is still accurate. User confirmed 2026-04-15.
- **Don't refactor code.** The hardcoded display strings in the client components stay hardcoded — the README just tells the cloner which lines to edit.
- **Honest about MVP status.** The "adapt to your location" section must call out that it is a temporary manual flow, superseded by v1.1.

## Deliverables

### 1. Screenshot file move

- **From:** `docs/userInput/Screenshot.png` (currently gitignored — see [.gitignore:42](../../../.gitignore#L42))
- **To:** `docs/screenshot.png` (tracked; `docs/` is already under version control)
- The source location (`docs/userInput/`) stays gitignored. Only the copy under `docs/screenshot.png` is committed.

### 2. README structure (final)

Layered onto the existing content. Section order:

1. **Title + one-line description** (existing, unchanged)
2. **Screenshot** — `![SkyFrame dashboard](docs/screenshot.png)` placed immediately after the description, before the prose paragraph
3. **What it is / what it isn't** (new, short) — sets expectations:
   - NOAA/NWS only, no API keys
   - Single-user, localhost-only
   - No ads, no analytics, no telemetry
   - Currently hardcoded to one location ({CITY, STATE}) — see "Adapting to your location" below
4. **Setup** (existing, unchanged)
5. **Run** (existing, unchanged)
6. **Tests** (existing, unchanged)
7. **Adapting to your location (v0.1 — manual)** (new) — walkthrough covering:
   - **Step 1: Change the User-Agent email.** Required by NWS ([server/config.ts:17](../../../server/config.ts#L17)). Requests without a valid contact can be rate-limited or rejected.
   - **Step 2: Get your NWS grid and nearby stations.** Run:
     ```bash
     curl -H "User-Agent: yourapp/0.1 (you@example.com)" \
       https://api.weather.gov/points/{lat},{lon}
     ```
     Copy `gridId` → `forecastOffice`, `gridX`, `gridY`, `timeZone`, and the `forecastZones` ID.
     Then fetch `observationStations` from the response to pick a primary + fallback station (prefer ASOS sites within ~15 km).
   - **Step 3: Update [server/config.ts](../../../server/config.ts).** Edit the `location`, `nws`, and `stations` blocks. Leave `cache`, `trendThresholds`, and `server` alone.
   - **Step 4: Update the hardcoded display strings** in three client files:
     - [client/components/TopBar.tsx:43](../../../client/components/TopBar.tsx#L43) — "{CITY} {ZIP} · KMKE LINK"
     - [client/components/HourlyPanel.tsx:49](../../../client/components/HourlyPanel.tsx#L49) — "MKX GRID 88,58"
     - [client/components/OutlookPanel.tsx:36](../../../client/components/OutlookPanel.tsx#L36) — "KMKE / MKX GRID 88,58 / WIZ066"
   - **Disclaimer** at end of section: "v1.1 will make this configurable; this manual flow is a stopgap."
8. **Structure** (existing, unchanged)
9. **Why a backend at all?** (existing, unchanged)

## Risks / non-issues

- **The `docs/userInput/` source file stays on disk.** Not a problem — already gitignored and won't be pushed. The committed copy at `docs/screenshot.png` is what users see.
- **Copy drift.** The hardcoded display strings may move to different line numbers in the future. Acceptable risk — v1.1 removes this section entirely.
- **`/points` lookup example.** The curl command must include a User-Agent or NWS rejects it. The example uses `yourapp/0.1 (you@example.com)` as a placeholder to make this habit explicit from step 1.

## Out of scope (defer to v1.1)

- Runtime-configurable location (env vars, config file, UI picker)
- Refactoring client components to consume `CONFIG.location` instead of hardcoded text
- A helper script that does the `/points` lookup and writes config for you
- Any kind of automated "setup wizard"
