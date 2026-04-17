# README-for-cloners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `README.md` so anyone cloning the SkyFrame repo can run it and manually adapt the hardcoded location (ZIP, NWS grid, station) to their own area. Stopgap until v1.1 makes location configurable.

**Architecture:** One README, two mechanical changes. (1) Copy the screenshot from the gitignored `docs/userInput/` into the tracked `docs/` tree so it can be embedded. (2) Rewrite `README.md` to add a screenshot, an expectations paragraph, and a manual "adapt to your location" walkthrough that points at the specific files a cloner must edit.

**Tech Stack:** Plain Markdown + a single PNG file move. No code changes.

**Spec:** [docs/superpowers/specs/2026-04-15-readme-for-cloners-design.md](../specs/2026-04-15-readme-for-cloners-design.md)

---

## File Structure

**Files created:**
- `docs/screenshot.png` — copy of the current dashboard screenshot, tracked in git, embedded by the README

**Files modified:**
- `README.md` — expanded with screenshot, expectations section, and adapt-to-your-location walkthrough

**Files untouched (explicitly out of scope):**
- `PROJECT_SPEC.md`, `CLAUDE.md` — still describe v1 as built for {CITY}; accurate as-is
- `server/config.ts`, `client/components/*.tsx` — README describes editing these but we don't actually edit them (the cloner does, for their own location)
- `.gitignore` — `docs/userInput/` stays gitignored; we copy out of it

---

### Task 1: Move screenshot into the tracked docs tree

**Files:**
- Create: `docs/screenshot.png` (copy of `docs/userInput/Screenshot.png`)

**Why a copy instead of `git mv`:** the source lives under `docs/userInput/`, which is gitignored (see [.gitignore:42](../../../.gitignore#L42)). `git mv` from an untracked path doesn't work — the source isn't in the index. We copy the file to the tracked location; the original stays in place for local reference.

- [ ] **Step 1: Verify the source file exists**

Run:
```bash
ls -la docs/userInput/Screenshot.png
```
Expected: file listed, non-zero size. If missing, stop — ask the user to re-add it.

- [ ] **Step 2: Copy the screenshot into the tracked tree**

Run:
```bash
cp docs/userInput/Screenshot.png docs/screenshot.png
```
Expected: no output, exit code 0.

- [ ] **Step 3: Verify the copy exists and is tracked-eligible**

Run:
```bash
ls -la docs/screenshot.png
git check-ignore docs/screenshot.png; echo "exit=$?"
```
Expected:
- `ls` shows the file with matching size to the original
- `git check-ignore` prints nothing and exits with `exit=1` (meaning: NOT ignored — this is the success case)

If `exit=0`, the file is being ignored by a gitignore rule — stop and investigate before continuing.

- [ ] **Step 4: Stage the screenshot (do not commit yet)**

Run:
```bash
git add docs/screenshot.png
git status
```
Expected: `git status` shows `new file: docs/screenshot.png` under "Changes to be committed". README changes will be committed together in Task 3.

---

### Task 2: Rewrite `README.md`

**Files:**
- Modify: `README.md` (full replacement)

The existing README is 57 lines. We replace it entirely rather than patching sections, because the new structure interleaves new content (screenshot, expectations, adapt-to-your-location) between existing sections and it's cleaner as one write.

- [ ] **Step 1: Read the current README to confirm its shape hasn't drifted from the spec**

Run:
```bash
cat README.md
```
Expected: matches the structure described in the spec — Setup / Run / Tests / Structure / Why a backend at all. If it has diverged significantly, stop and flag to the user before proceeding.

- [ ] **Step 2: Verify the line numbers referenced for hardcoded display strings are still accurate**

These line numbers are cited in the new README and must match reality. Run:
```bash
grep -n "{CITY} {ZIP}" client/components/TopBar.tsx
grep -n "MKX GRID 88,58" client/components/HourlyPanel.tsx
grep -n "KMKE" client/components/OutlookPanel.tsx
grep -n "your-email@example.com" server/config.ts
```
Expected lines (from the spec):
- `TopBar.tsx:43` contains `{CITY} {ZIP}`
- `HourlyPanel.tsx:49` contains `MKX GRID 88,58`
- `OutlookPanel.tsx:36` contains `KMKE` (among other strings on that line)
- `server/config.ts:17` contains `your-email@example.com`

**If any line number differs, update the README content in Step 3 to use the actual current line numbers before writing the file.** Do not blindly use the numbers below if they're wrong.

- [ ] **Step 3: Write the new `README.md`**

Full content (use `Write` tool to replace the file):

````markdown
# SkyFrame

Local ad-free weather dashboard for ZIP {ZIP} ({CITY, STATE}). Single-purpose utility that pulls directly from NOAA/NWS and renders the data as a cyan-on-black HUD-style dashboard in your browser.

![SkyFrame dashboard](docs/screenshot.png)

See [PROJECT_SPEC.md](PROJECT_SPEC.md) for product context, [WEATHER_PROVIDER_RESEARCH.md](WEATHER_PROVIDER_RESEARCH.md) for the NWS evaluation, and [docs/superpowers/specs/2026-04-15-skyframe-design.md](docs/superpowers/specs/2026-04-15-skyframe-design.md) for the implementation design.

## What this is (and isn't)

- **NOAA/NWS only.** No API keys, no third-party weather providers, no accounts.
- **Single-user, localhost-only.** No auth, no multi-tenancy, no cloud deploy story.
- **No ads, no analytics, no telemetry.** No data leaves your machine beyond the NWS requests themselves.
- **Hardcoded to one location** ({CITY, STATE} / ZIP {ZIP}) in v0.1. If you want to run it for a different area, see [Adapting to your location](#adapting-to-your-location-v01--manual) below.

## Setup

Requires Node.js 20+ and npm.

```bash
git clone <repo>
cd SkyFrame
npm install
```

## Run

**Production (what you want for daily use):**

```bash
npm run build    # Compiles the React client into dist/client
npm run server   # Starts Fastify on http://localhost:3000
```

Open http://localhost:3000 in your browser.

**Development (with hot reload):**

```bash
npm run server   # Terminal 1: Fastify backend on :3000
npm run dev      # Terminal 2: Vite dev server on :5173 with /api proxy
```

Open http://localhost:5173 — Vite handles the frontend with HMR, /api calls proxy to the backend.

## Tests

```bash
npm test           # Run once
npm run test:watch # Watch mode
npm run typecheck  # TypeScript check without building
```

## Adapting to your location (v0.1 — manual)

v0.1 is hardcoded to {CITY, STATE}. To run it for your own area you have to edit four files by hand. v1.1 will replace this with runtime configuration — treat the flow below as a temporary stopgap.

You will need: a lat/lon for your location (e.g. from Google Maps — right-click → copy coordinates) and a contact email.

### Step 1 — Change the User-Agent email (required)

NWS requires every request to identify the app and a contact email. Requests with a missing or generic User-Agent can be rate-limited or rejected outright.

Edit [server/config.ts](server/config.ts) line 17:

```ts
userAgent: 'SkyFrame/0.1 (your-email@example.com)',
```

Replace `your-email@example.com` with your own email. The `SkyFrame/0.1` prefix is fine to keep or change.

### Step 2 — Look up your NWS grid and nearby stations

NWS doesn't expose weather by lat/lon directly — you resolve lat/lon to a grid point once, then use grid-based endpoints. Run:

```bash
curl -H "User-Agent: yourapp/0.1 (you@example.com)" \
  "https://api.weather.gov/points/{lat},{lon}"
```

Replace `{lat},{lon}` with your coordinates (e.g. `{lat},{lon}`). **Include the User-Agent header** — without it, NWS will reject the request.

From the JSON response, note:
- `properties.gridId` → this is the forecast office (e.g. `MKX`)
- `properties.gridX`, `properties.gridY` → grid coordinates
- `properties.timeZone` → e.g. `America/Chicago`
- `properties.forecastZone` → ends in an ID like `WIZ066`

Then fetch the nearby station list from the URL in `properties.observationStations`:

```bash
curl -H "User-Agent: yourapp/0.1 (you@example.com)" \
  "https://api.weather.gov/gridpoints/{gridId}/{gridX},{gridY}/stations"
```

Pick two stations: a **primary** (first-class ASOS site, typically at an airport, within ~15 km) and a **fallback** (second-closest ASOS, used when the primary's latest observation is stale or has null core fields). Note their four-letter IDs (e.g. `KMKE`, `KRAC`).

### Step 3 — Update `server/config.ts`

Edit the `location`, `nws`, and `stations` blocks in [server/config.ts](server/config.ts):

```ts
location: {
  lat: <your lat>,
  lon: <your lon>,
  zip: '<your ZIP>',
  cityState: '<City, ST>',
},
nws: {
  forecastOffice: '<gridId>',
  gridX: <gridX>,
  gridY: <gridY>,
  timezone: '<timeZone>',
  forecastZone: '<forecastZone id>',
  userAgent: 'SkyFrame/0.1 (you@example.com)',  // already done in Step 1
  baseUrl: 'https://api.weather.gov',
},
stations: {
  primary: '<primary station ID>',
  fallback: '<fallback station ID>',
  stalenessMinutes: 90,
},
```

Leave the `cache`, `trendThresholds`, and `server` blocks alone.

### Step 4 — Update the hardcoded display strings in the client

v0.1 has three display strings hardcoded in the React components. Update them to match your location:

- [client/components/TopBar.tsx:43](client/components/TopBar.tsx#L43) — replace `{CITY} {ZIP} · KMKE LINK` with your city, ZIP, and primary station
- [client/components/HourlyPanel.tsx:49](client/components/HourlyPanel.tsx#L49) — replace `MKX GRID 88,58` with your `{forecastOffice} GRID {gridX},{gridY}`
- [client/components/OutlookPanel.tsx:36](client/components/OutlookPanel.tsx#L36) — replace `KMKE / MKX GRID 88,58 / WIZ066` with your primary station, grid, and forecast zone

Rebuild and run (`npm run build && npm run server`) and you should see your area's weather.

> **Note:** v1.1 will move all of this into a single config file or env vars and remove the hardcoded strings from the client. This manual flow only exists so v0.1 is usable by others before v1.1 lands.

## Structure

- `shared/types.ts` — WeatherResponse type contract, imported by both server and client
- `server/` — Fastify backend, NWS proxy, in-memory cache
- `client/` — React + Vite frontend with the three HUD views
- `docs/mockups/` — static HTML mockups (source of truth for visual design)
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans

## Why a backend at all?

NWS requires a `User-Agent` header identifying your app and contact email. Browsers forbid `fetch()` from setting `User-Agent` (it's on the forbidden headers list), so a pure client-side SkyFrame couldn't comply with NWS terms. The Fastify backend acts as a thin local proxy: browser calls `/api/weather`, the server calls NWS with the required headers, normalizes the response, and returns a single clean JSON shape.
````

- [ ] **Step 4: Verify the README renders the screenshot path correctly**

Run:
```bash
grep -n "docs/screenshot.png" README.md
ls -la docs/screenshot.png
```
Expected:
- `grep` finds the markdown image line `![SkyFrame dashboard](docs/screenshot.png)` in the README
- `ls` confirms the file is there (so GitHub will actually render it)

- [ ] **Step 5: Verify no broken internal links**

Run:
```bash
grep -oE '\[([^\]]+)\]\(([^)]+)\)' README.md | grep -oE '\(([^)]+)\)' | tr -d '()'
```
Expected: a list of link targets. For each one that is a file path (not starting with `http` and not an anchor like `#adapting...`), confirm the file exists. Key ones to check:
- `PROJECT_SPEC.md` ✓
- `WEATHER_PROVIDER_RESEARCH.md` ✓
- `docs/superpowers/specs/2026-04-15-skyframe-design.md` ✓
- `docs/screenshot.png` ✓ (from Task 1)
- `server/config.ts` ✓
- `client/components/TopBar.tsx` ✓
- `client/components/HourlyPanel.tsx` ✓
- `client/components/OutlookPanel.tsx` ✓

Run:
```bash
for f in PROJECT_SPEC.md WEATHER_PROVIDER_RESEARCH.md docs/superpowers/specs/2026-04-15-skyframe-design.md docs/screenshot.png server/config.ts client/components/TopBar.tsx client/components/HourlyPanel.tsx client/components/OutlookPanel.tsx; do
  [ -e "$f" ] && echo "OK  $f" || echo "MISSING  $f"
done
```
Expected: all lines say `OK`. If any say `MISSING`, fix the README before committing.

---

### Task 3: Commit and verify

**Files:**
- Commit: `docs/screenshot.png` + `README.md` together

- [ ] **Step 1: Stage the README**

Run:
```bash
git add README.md
git status
```
Expected: `git status` shows both `docs/screenshot.png` (new file, staged from Task 1) and `README.md` (modified) under "Changes to be committed". If `docs/screenshot.png` is missing from the staged list, something went wrong in Task 1 — re-stage it.

- [ ] **Step 2: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
Document how to clone and adapt SkyFrame to another location

README now embeds a screenshot and walks through the four files a cloner
must edit to run v0.1 for their own area (User-Agent, server/config.ts,
and three hardcoded display strings in client components). Flagged as a
temporary manual flow; v1.1 will make location configurable.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds, pre-commit hook (if any) passes. If a hook fails, fix the underlying issue and re-commit — do not use `--no-verify`.

- [ ] **Step 3: Verify the commit**

Run:
```bash
git log -1 --stat
```
Expected: the most recent commit touches exactly two files — `README.md` (modified) and `docs/screenshot.png` (added). Nothing else.

- [ ] **Step 4: Preview-render check (optional but recommended)**

If you have a Markdown preview tool handy (VS Code's built-in preview, `grip`, etc.), render `README.md` and confirm:
- Screenshot embeds and displays
- All section headings appear in the correct order
- Code blocks are formatted
- The anchor link to `#adapting-to-your-location-v01--manual` in the "What this is" section actually navigates to the matching heading

No automated test here — GitHub's own renderer is the ultimate judge once the commit is pushed. A local preview just catches obvious mistakes before push.

---

## Out of scope for this plan

- Pushing the commit to `origin` — the user decides when to push.
- Creating a PR — the user runs on `main` for their own work; PR workflow is manual.
- Any code changes to `server/config.ts` or client components — the README describes how a *cloner* edits these, not how we edit them.
- Refactoring client components to read strings from config (this is v1.1 work).
