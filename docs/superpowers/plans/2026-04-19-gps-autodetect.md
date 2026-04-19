# GPS Autodetect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Feature 7 from the v1.2 roadmap — add a "USE MY LOCATION" button to the LocationSetup modal that populates the existing `location` input with GPS coordinates via the browser Geolocation API.

**Architecture:** Single-file React change in `client/components/LocationSetup.tsx` plus a minimal CSS append to `hud.css`. No server changes — the existing `/api/setup` handler already accepts `"lat, lon"` strings (that's what the manual-entry path uses). Localhost gating disables the button on non-loopback hostnames because browsers silently block Geolocation over HTTP on non-loopback origins.

**Tech Stack:** React 18, TypeScript, browser Geolocation API, existing Fastify `/api/setup` endpoint.

**Design spec:** [`docs/superpowers/specs/2026-04-19-gps-autodetect-design.md`](../specs/2026-04-19-gps-autodetect-design.md)

**Branch:** `feat/gps-autodetect` (already created off `main`).

---

## Pre-work checklist

- [ ] On branch `feat/gps-autodetect`: run `git branch --show-current`, expect `feat/gps-autodetect`
- [ ] Working tree clean: run `git status`, expect `nothing to commit, working tree clean`
- [ ] Tests green: run `npm test`, expect 221 passing
- [ ] Typecheck green: run `npm run typecheck`, expect no errors

---

## Task 1: Implement the GPS button + styles

This is a single cohesive commit — the component changes, the helper function, the state additions, the JSX, and the CSS all ship together. No test changes (React component testing is out of scope per project policy; the coordinate-parsing downstream is already tested in `server/nws/setup.test.ts`).

**Files:**
- Modify: `client/components/LocationSetup.tsx` (full rewrite — it's only ~95 lines)
- Modify: `client/styles/hud.css` (append `.setup-btn-gps` rule)

### Steps

- [ ] **Step 1.1: Rewrite `LocationSetup.tsx`**

Replace the entire contents of `client/components/LocationSetup.tsx` with:

```typescript
import { useState } from 'react';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const gpsAvailable =
  typeof window !== 'undefined' &&
  'geolocation' in navigator &&
  LOCALHOST_HOSTNAMES.has(window.location.hostname);

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Use ZIP code or enter coordinates manually.';
    case err.POSITION_UNAVAILABLE:
      return 'Could not determine your location. Try ZIP code or manual coordinates.';
    case err.TIMEOUT:
      return 'Location request timed out. Try again, or use ZIP/manual entry.';
    default:
      return 'Location lookup failed. Use ZIP code or enter coordinates manually.';
  }
}

interface LocationSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function LocationSetup({ onComplete, onCancel }: LocationSetupProps) {
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const canSubmit = location.trim().length > 0 && email.trim().includes('@') && !saving;

  const handleUseMyLocation = () => {
    setLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        setLocation(`${lat}, ${lon}`);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGpsError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: location.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Setup failed.');
        setSaving(false);
        return;
      }
      onComplete();
    } catch {
      setError('Network error. Is the server running?');
      setSaving(false);
    }
  };

  return (
    <div className="setup-overlay">
      <div className="setup-modal">
        <span className="corner tl"></span>
        <span className="corner tr"></span>
        <span className="corner bl"></span>
        <span className="corner br"></span>
        <div className="setup-title">■ SKYFRAME SETUP</div>

        <label className="setup-label">
          LOCATION
          <input
            className="setup-input"
            type="text"
            placeholder="ZIP code or lat, lon"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            autoFocus
          />
          <span className="setup-hint">e.g. 60614 or 41.9219, -87.6490</span>
        </label>

        <button
          type="button"
          className="setup-btn setup-btn-gps"
          disabled={!gpsAvailable || locating}
          title={gpsAvailable ? undefined : 'GPS requires localhost (browsers block Geolocation over non-HTTPS origins)'}
          onClick={handleUseMyLocation}
        >
          {locating ? 'LOCATING...' : '⌖ USE MY LOCATION'}
        </button>

        {gpsError && <div className="setup-error">▲ {gpsError}</div>}

        <label className="setup-label">
          CONTACT EMAIL
          <input
            className="setup-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="setup-hint">
            Required by NWS for API access. Sent only to weather.gov — never shared with other services.
          </span>
        </label>

        {error && <div className="setup-error">▲ {error}</div>}

        <div className="setup-actions">
          {onCancel && (
            <button type="button" className="setup-btn" onClick={onCancel}>
              CANCEL
            </button>
          )}
          <button
            type="button"
            className="setup-btn setup-btn-primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {saving ? 'RESOLVING...' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

What changed from the pre-existing file:
- Top-of-file: added `LOCALHOST_HOSTNAMES` constant, module-scope `gpsAvailable` computation, `geolocationErrorMessage` helper
- `LocationSetup` body: added `locating` + `gpsError` state, added `handleUseMyLocation` function
- JSX: added the `<button className="setup-btn setup-btn-gps">` and the `{gpsError && ...}` error div between the LOCATION label and the CONTACT EMAIL label
- Everything else (existing submit flow, existing error state for server failures, corner elements, SAVE/CANCEL buttons) is untouched

- [ ] **Step 1.2: Append CSS to `hud.css`**

Append to the end of `client/styles/hud.css`:

```css
/* ============================================================
   USE MY LOCATION button in LocationSetup modal (v1.2 Feature 7).
   Inherits chrome from .setup-btn. Block-level + full width to
   visually group with the LOCATION input above it, separated
   from the EMAIL label below.
   ============================================================ */
.setup-btn-gps {
  display: block;
  width: 100%;
  margin-top: -6px;
  margin-bottom: 14px;
}
```

No color overrides — the button inherits from `.setup-btn` so it visually matches CANCEL/SAVE below.

- [ ] **Step 1.3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 1.4: Run test suite**

Run: `npm test`
Expected: 221 tests pass (unchanged from before — no tests were added or modified).

- [ ] **Step 1.5: Build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 1.6: Commit**

```bash
git add client/components/LocationSetup.tsx client/styles/hud.css
git commit -m "$(cat <<'EOF'
Add USE MY LOCATION button to LocationSetup modal

Browser Geolocation API wired into the existing location input:
click the button → permission prompt → coordinates fill the text
input as "lat, lon" → user reviews and clicks SAVE as normal.
Populate-and-review flow chosen over auto-submit so the user can
sanity-check the detected position before committing, and so the
GPS path composes cleanly with the existing ZIP / manual-latlon
paths rather than introducing a third code path.

Localhost-gated: button is disabled on non-loopback hostnames
(tooltip explains) because browsers silently block Geolocation
over HTTP on non-loopback origins. Geolocation options chosen
for a desktop weather dashboard: high-accuracy off (WiFi
triangulation is fine for NWS grid cells), 10-second timeout,
60-second cache for repeat clicks.

No server changes — /api/setup already parses "lat, lon" strings
via the existing resolveSetup() path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Manual validation + `PROJECT_STATUS.md` update + PR

**Files:**
- Modify: `PROJECT_STATUS.md`

### Steps

- [ ] **Step 2.1: Start the dev server and verify on localhost**

In PowerShell:

```powershell
npm run server
```

In another terminal:

```bash
npm run dev
```

Open `http://localhost:5173`.

If the location is already configured, click the location name in the TopBar to reopen the LocationSetup modal. Otherwise the modal appears automatically on first load.

Check:
- [ ] A "⌖ USE MY LOCATION" button appears between the LOCATION input and the CONTACT EMAIL label, full width, inheriting the HUD button styling
- [ ] Button is NOT greyed out (localhost is a permitted hostname)
- [ ] Click the button → browser shows a native Geolocation permission prompt (first time only)
- [ ] On grant: after a brief "LOCATING..." label state, the LOCATION input fills with `"NN.NNNN, -NN.NNNN"` in 4-decimal format
- [ ] Button returns to `⌖ USE MY LOCATION` label, no error shown
- [ ] Typing in the LOCATION input works — user can edit the GPS-filled coordinates
- [ ] Filling EMAIL + clicking SAVE completes the setup normally (server resolves via existing flow)

- [ ] **Step 2.2: Verify each error path via DevTools Sensors**

Open Chrome DevTools → `...` menu → More tools → Sensors. In the Sensors panel, under "Location" there's a dropdown that lets you simulate "Other…" with a custom position, or set errors.

Click USE MY LOCATION for each scenario:
- [ ] **Permission denied** — click "Block" on the native permission prompt (or use a fresh browser profile that hasn't granted). Expect inline error: `"▲ Location permission denied. Use ZIP code or enter coordinates manually."`
- [ ] **Position unavailable** — in DevTools Sensors, set Location to "Location unavailable." Click the button. Expect: `"▲ Could not determine your location. Try ZIP code or manual coordinates."`
- [ ] **Timeout** — in Sensors, set Location to "Moon" or a similar setting that delays indefinitely (or pick a latitude that makes the browser hang). Wait 10s. Expect: `"▲ Location request timed out. Try again, or use ZIP/manual entry."`
- [ ] After each error, confirm the button is re-enabled (`LOCATING...` → `⌖ USE MY LOCATION`) so the user can retry

- [ ] **Step 2.3: Verify disabled state on non-loopback hostname**

Find your machine's LAN IP (on Windows PowerShell: `ipconfig` and look for the IPv4 Address of your primary adapter, like `192.168.1.50`).

Stop `npm run dev` and restart it bound to all interfaces (Vite serves on `localhost` by default; check if it binds `0.0.0.0` by passing `--host`):

```bash
npm run dev -- --host
```

Now visit `http://<your-lan-ip>:5173` from the same machine. Reopen the LocationSetup modal via the TopBar location link.

Check:
- [ ] Button is greyed out (standard HTML disabled styling)
- [ ] Hovering shows the tooltip: `"GPS requires localhost (browsers block Geolocation over non-HTTPS origins)"`
- [ ] Clicking does nothing (click is inert on disabled buttons)
- [ ] User can still enter ZIP or manual lat/lon and complete setup normally

After this scenario, stop the dev server and restart it normally (without `--host`) so subsequent `localhost` access works.

- [ ] **Step 2.4: Update `PROJECT_STATUS.md`**

Update the "Last updated" date at the top to `2026-04-19`.

Test count stays at 221 (no tests were added for Feature 7).

Add a new entry to the "Implemented features" section, after the "### NWS narrative forecast modal (v1.2 Feature 5)" block:

```markdown
### GPS autodetect (v1.2 Feature 7)
- "⌖ USE MY LOCATION" button in the LocationSetup modal. Click → browser Geolocation prompt → on success, coordinates populate the existing LOCATION input as `"lat, lon"` with 4-decimal precision. User reviews and clicks SAVE as normal.
- Localhost-gated via `window.location.hostname` check against `localhost`, `127.0.0.1`, `::1`. Disabled button + tooltip explain on other hostnames (browsers silently block Geolocation over HTTP on non-loopback origins).
- No server changes — the existing `/api/setup` handler already parses `"lat, lon"` strings via `resolveSetup()`.
```

- [ ] **Step 2.5: Commit the status update**

```bash
git add PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
Document Feature 7 GPS autodetect in PROJECT_STATUS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2.6: Push branch and open PR**

```bash
git push -u origin feat/gps-autodetect
```

Then open the PR with `gh pr create`. Match the house style from PRs #9 (Feature 4) and #10 (Feature 5): summary bullets, decisions-settled table, test plan checklist, commit map, links to spec and plan.

---

## Summary of commits

1. Add USE MY LOCATION button to LocationSetup modal (Task 1)
2. Document Feature 7 GPS autodetect in PROJECT_STATUS (Task 2)

Plus the already-committed spec on `feat/gps-autodetect`.

---

## Self-review

**Spec coverage:**
- Button placement between LOCATION input and EMAIL label → Task 1 ✅
- `locating` + `gpsError` state pair (no 3-state enum) → Task 1 ✅
- Module-scope `gpsAvailable` with hostname + `'geolocation' in navigator` check → Task 1 ✅
- `⌖` button label + `LOCATING...` transition → Task 1 ✅
- `geolocationErrorMessage` helper mapping all three error codes + default → Task 1 ✅
- Geolocation options (`enableHighAccuracy: false`, `timeout: 10000`, `maximumAge: 60000`) → Task 1 ✅
- `.setup-btn-gps` CSS variant → Task 1 ✅
- Title tooltip on disabled state → Task 1 ✅
- Manual validation across localhost + non-localhost + all three error codes → Task 2 ✅
- `PROJECT_STATUS` update + PR → Task 2 ✅

**Placeholder scan:** every step contains actual code or actual commands. No TBD / TODO / "similar to Task N" / "handle edge cases".

**Type consistency:**
- `locating: boolean` used consistently in state, JSX disabled check, and button label ✅
- `gpsError: string | null` used consistently in state, setter calls, and JSX conditional render ✅
- `GeolocationPositionError` is the standard Web API type — no import needed ✅
- Coordinates formatted via `.toFixed(4)` everywhere they're formatted (matches the precision used by `server/nws/normalizer.ts`'s NWS URL construction) ✅
