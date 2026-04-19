# GPS Autodetect — Design

**Date:** 2026-04-19
**Status:** Approved for implementation planning
**v1.2 scope:** Feature 7 ([2026-04-17-v1.2-roadmap-design.md](2026-04-17-v1.2-roadmap-design.md), Section 7)
**Branch:** `feat/gps-autodetect`, off `main`

## Summary

Add a "USE MY LOCATION" button to the existing `LocationSetup` modal. Click it, the browser's Geolocation API asks for permission, and on success the returned coordinates are formatted as `"lat, lon"` and written into the existing `location` text input. The user then fills the email field (if not already filled) and clicks SAVE as normal. Button is disabled on non-loopback hostnames because browsers block Geolocation over non-HTTPS origins.

## Decisions settled during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Post-success flow | Populate the `location` input and let user review + click SAVE | User gets a sanity-check moment before committing; composes cleanly with existing ZIP / manual-latlon paths; no new server code path |
| Button placement | Below LOCATION input, before EMAIL label | Treats the button as a typing shortcut for the input above it |
| Localhost gating | Disable (grey + tooltip) when `hostname ∉ {localhost, 127.0.0.1, ::1}` | Browsers silently block Geolocation over HTTP on non-loopback hosts; pre-disabling prevents a button that looks functional but never fires |
| Geolocation options | `enableHighAccuracy: false`, `timeout: 10000`, `maximumAge: 60000` | WiFi triangulation (~100–500m) is fine for ~2.5km NWS grid cells; 10s timeout fails fast; 60s cache tolerates repeat clicks during setup |

## Scope

**In scope:**
- "USE MY LOCATION" button in `LocationSetup.tsx`
- Localhost-only gating via `window.location.hostname` check
- Inline error display for the three Geolocation error codes (permission denied, position unavailable, timeout)
- `.setup-btn-gps` CSS variant appended to `hud.css`

**Out of scope:**
- Server-side changes — none
- Auto-submit on GPS success (chose populate-and-review instead)
- Retry logic inside the handler — user just clicks again
- Reverse geocoding display ("You are near Chicago")
- IP-based fallback (violates the no-external-providers hard rule)
- Persistence of "GPS used last time"
- High-accuracy GPS mode
- Accuracy indicator
- Map picker / visual location UI

## User flow

```
User opens LocationSetup (first-run or via TopBar click)
  → modal shows LOCATION input, USE MY LOCATION button, EMAIL input, CANCEL/SAVE
Click USE MY LOCATION
  → (if not localhost) button was already disabled, click does nothing
  → (if localhost) navigator.geolocation.getCurrentPosition fires
  → browser shows native permission prompt (first time only)
  → on grant + success: LOCATION input fills with "41.9219, -87.6490"
  → on denial or other failure: inline error below button
User fills EMAIL if not already, clicks SAVE
  → existing resolveSetup() flow runs unchanged
```

## Component structure

### One file modified

`client/components/LocationSetup.tsx` — adds the button, new state, new handler, the error helper. No new component files.

### One stylesheet appended

`client/styles/hud.css` — minimal `.setup-btn-gps` rule for spacing. Inherits chrome from the existing `.setup-btn` class.

### New state inside `LocationSetup`

```typescript
const [locating, setLocating] = useState(false);
const [gpsError, setGpsError] = useState<string | null>(null);
```

`locating` drives the button label (`USE MY LOCATION` → `LOCATING...`) and the disabled state. `gpsError` surfaces failure messages inline. A three-state enum was considered and rejected — the "error" state wouldn't be distinguishable from "idle with a lingering error message," so the boolean + string pair carries all the information without the dead state.

### Localhost detection — module scope, computed once

```typescript
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const gpsAvailable =
  typeof window !== 'undefined' &&
  'geolocation' in navigator &&
  LOCALHOST_HOSTNAMES.has(window.location.hostname);
```

Two independent guards:
- Browser must support `navigator.geolocation` (all modern browsers do; check is free)
- Hostname must be in the loopback set

Either failing disables the button. The `typeof window !== 'undefined'` guard is defensive against the theoretical SSR case; the project doesn't SSR but the code reads as robust.

### Error helper

```typescript
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
```

The `default` branch catches deprecated/future codes (e.g., `POSITION_UNSUPPORTED = 4` in some older implementations).

### The click handler

```typescript
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
```

Coordinates are truncated to 4 decimals — matches the precision already used in the server's NWS `/points` calls (`lat.toFixed(4)`). Avoids a noisy 7-decimal string like `"41.92194482, -87.64900033"` in the input field.

### Button JSX placement — between LOCATION and EMAIL labels

```tsx
<label className="setup-label">
  LOCATION
  <input ... />
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
  ...
</label>
```

### Styling

Append to `client/styles/hud.css`:

```css
.setup-btn-gps {
  display: block;
  width: 100%;
  margin-top: -6px;
  margin-bottom: 14px;
}
```

No bespoke colors — inherits from `.setup-btn`. The negative top margin pulls it close to the `.setup-hint` above; the bottom margin separates from the EMAIL label below.

**Glyph note:** the button label uses `⌖` (U+2316 Position Indicator, crosshair). Lives in Miscellaneous Technical block (U+2300–U+23FF). If font fallback renders it inconsistently during manual validation, drop the glyph entirely and keep just `USE MY LOCATION`. This is the same risk flagged on the `☶` and `➤` glyphs in Feature 5.

## Interactions

### Click paths
- Non-localhost origin: button disabled, click is inert, tooltip explains why
- Localhost + first click: browser Geolocation prompt appears; user grants or denies
- Localhost + previously granted: prompt skipped (browser remembers); coords arrive quickly
- Localhost + previously denied: prompt also skipped; `PERMISSION_DENIED` error fires immediately

### Button label states
- `!locating` + `gpsAvailable`: `⌖ USE MY LOCATION`
- `locating`: `LOCATING...`, button disabled
- After success or error: `locating` returns to `false`; on error the button is re-enabled so the user can retry, and `gpsError` below the button carries the failure message

### After GPS fill
- `location` input becomes source of truth; user can edit the coordinates or clear them
- `gpsError` from a previous failure doesn't auto-clear until the user clicks GPS again
- SAVE flow unchanged — same `/api/setup` POST as ZIP-code or manual-lat/lon paths

### Coexistence with server-side errors
Both `gpsError` (from the Geolocation API) and `error` (from `/api/setup`) can be visible at once in theory. Each renders in its own `.setup-error` div. Both clear only when the user acts (GPS click clears `gpsError`, SAVE click clears server `error`). Acceptable — they surface different failure modes and don't conflict semantically.

## Edge cases

- **GPS returns coordinates outside the US:** no client-side filter. The server's `/api/setup` flow will fail on the NWS `/points` call (returns 404 for non-US coords), which surfaces as the normal setup error ("NWS /points returned 404"). Acceptable — clear signal, no new code path needed.
- **User edits `location` after GPS fills it:** their edit wins. The input is source of truth.
- **Email not yet filled when GPS succeeds:** `canSubmit` still requires `email.trim().includes('@')`, so SAVE stays disabled until email is filled. GPS just populates location — it doesn't submit.
- **Click while already requesting:** `disabled={... || locating}` prevents stacking.
- **Tab lost focus during the Geolocation call:** browser handles it per its own policy. Our code doesn't need to do anything special.

## Testing strategy

**Unit tests:** none for this component. React-component testing is out of scope per the project's established posture. The pure `parseLatLon` in `server/nws/setup.ts` already has coverage and is the downstream consumer of GPS output.

**Manual validation:**
- Localhost access: button enabled, permission prompt appears, success populates input, SAVE works end-to-end
- Permission denial: inline error renders, user can still type ZIP or manual coords
- Disabled state: access dashboard via the machine's LAN IP (e.g., `192.168.1.x:5173`) — button is greyed, tooltip explains
- Each error code exercised via Chrome DevTools Sensors panel (simulate "Location unavailable" and "Timeout")

## Documentation updates when shipped

- Update `PROJECT_STATUS.md` → "Implemented features" with the Feature 7 entry
- Feature 7 is the third straight UI-only feature that reuses existing server infrastructure — worth noting in the status entry as a validation of the "/api/setup as single integration point" design

## Ship path

Branch off `main` as `feat/gps-autodetect`. Ship via PR (not local merge), matching the Feature 4 + 5 workflow.
