# Settings Modal + GitHub Update Notifications — Design

**Date:** 2026-04-19
**Status:** Approved for implementation planning
**Release:** v1.2.1 (post-v1.2)
**Scope:** Expands the original v1.2 Feature 8 (update notifications) into a larger refactor of the setup modal into a general-purpose Settings modal, with the update check as one opt-in preference among several.
**Branch:** `feat/settings-and-updates`, off `main`

## Summary

Ship a Settings modal reachable from a new hamburger button in the TopBar. The modal subsumes the current `LocationSetup`'s first-run behavior AND provides an always-accessible edit surface for location, email, and a new "Check GitHub for updates" checkbox (default **off**). When the checkbox is enabled, the server performs a `/releases/latest` check at startup and at local midnight. If a newer release is found, a synthetic `advisory`-tier alert is injected into the existing alert pipeline — appearing in the banner alongside weather alerts, clickable for release notes, dismissible. Also bumps `package.json` from `0.1.0` to `1.2.1`.

## Decisions settled during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Update check opt-in/opt-out | Visible checkbox in Settings, default **off** | Explicit UI consent is cleaner than a hidden env var once we have a Settings modal. Default-off respects CLAUDE.md's "no transmitted data beyond forecast" hard rule for users who haven't opted in |
| Modal consolidation | Replace `LocationSetup` with `Settings` (same chrome, new content) | `LocationSetup` was designed for one-shot first-run; adding preferences to it under the current name is misleading. CSS `.setup-*` classes retained to avoid churn |
| Release scoping | One PR, bundled as v1.2.1 | Settings refactor and update notifications are coupled (the checkbox has to live somewhere); splitting them would leave the checkbox as dead state in 8a until 8b |
| Placeholder sections in Settings | Ship "Cosmetic skin — coming soon" as disabled UI element, no logic | Signals future direction without committing scope |

## Scope

**In scope:**
- `LocationSetup.tsx` → `Settings.tsx` rename + content refactor
- Hamburger (`≡`) trigger in TopBar, far right after clock
- `Settings` modal includes: Location + Use My Location + Email (existing) + "Check GitHub for updates" checkbox + "Cosmetic skin — coming soon" disabled placeholder
- New server module `server/updates/` with `github-release.ts` (pure helpers) and `update-check.ts` (imperative orchestrator + scheduler)
- `skyframe.config.json` gains `updateCheckEnabled: boolean`
- `POST /api/setup` accepts the new field; toggles scheduler on/off live
- `GET /api/config` returns current config values for Settings to pre-populate
- Synthetic `advisory` alert injected into `normalizeWeather`'s alert list when cache is non-null
- `package.json` version bumped to `1.2.1`

**Out of scope (v1.2.1):**
- Actual skin / theme selection logic (placeholder only)
- Per-user GitHub authentication / PAT for higher rate limits
- Automatic self-update / installer — notification only
- Notification channels beyond the alert banner (no email, desktop notification, webhook)
- Push-based update subscription (pull-based only)
- Settings tabs / sub-pages — flat form
- Internationalization
- Granular scheduling controls (no "every 6 hours" option)
- Pre-release filtering (GitHub `/latest` excludes them by default)
- Changing owner/repo via UI — hardcoded constants

## User flows

### First-run
App boots → Settings modal auto-opens, CANCEL hidden, Esc/backdrop close disabled. User fills location + email, optionally checks "Check GitHub for updates," clicks SAVE. `/api/setup` writes config; modal closes; dashboard renders. If updates-enabled, the scheduler starts immediately and runs its first check.

### Anytime edit
User clicks `≡` hamburger → Settings modal opens pre-populated from `/api/config`, CANCEL visible, Esc/backdrop close enabled. Any field can be edited. SAVE writes the full config (including the checkbox state). If the checkbox state changed, the scheduler is started or stopped accordingly and any cached update alert is cleared if toggling off.

### Update alert lifecycle (when enabled)
Server startup OR local midnight → `performUpdateCheck` → fetch GitHub latest release → compare to `package.json` version. If newer:
1. `cachedAvailableUpdate` populated.
2. Next client poll → `normalizeWeather` calls `getCachedUpdate()` → injects synthetic Alert → re-sorts → returned in `alerts`.
3. Client renders advisory banner at the bottom of any alert stack.
4. User clicks event name → TerminalModal opens (Feature 4) → release notes body displayed.
5. User dismisses → `dismissed` Set gains the `update-{tag}` ID → filtered out of `visible`.
6. On user update + server restart with new `package.json`, check finds no newer release → cache stays null → alert not injected. Old ID drops off feed → `dismissed` pruning removes it.

## Client-side component architecture

### Settings modal (replaces LocationSetup)

File: `client/components/Settings.tsx` (renamed from `LocationSetup.tsx`). Existing `.setup-*` CSS class names retained.

```typescript
interface SettingsProps {
  onComplete: () => void;
  onCancel?: () => void;  // undefined for first-run gating
  initialConfig: {
    location: string;
    email: string;
    updateCheckEnabled: boolean;
  };
}
```

Existing state expands:

```typescript
const [location, setLocation] = useState(initialConfig.location);
const [email, setEmail] = useState(initialConfig.email);
const [updateCheckEnabled, setUpdateCheckEnabled] = useState(initialConfig.updateCheckEnabled);
// ...existing error, saving, locating, gpsError state...
```

POST body on SAVE:

```typescript
body: JSON.stringify({
  location: location.trim(),
  email: email.trim(),
  updateCheckEnabled,
})
```

### Hamburger trigger

New button in `TopBar.tsx`, rendered at the far right after `.clock`:

```typescript
<button
  type="button"
  className="hud-topbar-settings"
  onClick={onOpenSettings}
  aria-label="Open settings"
  title="Settings"
>
  ≡
</button>
```

Glyph `≡` (U+2261) — triple bar, Geometric / Mathematical block, renders consistently with existing HUD glyphs. Styling matches the forecast-button pattern (muted at rest, brightens on hover, focus-visible outline).

`TopBar` gains a new prop `onOpenSettings: () => void`. `App.tsx` owns a `showSettings: boolean` state.

### Form layout inside Settings

```
■ SKYFRAME SETTINGS

LOCATION
  [text input: ZIP or lat, lon]
  e.g. 60614 or 41.9219, -87.6490

[⌖ USE MY LOCATION button]   (existing GPS logic, unchanged)
[optional GPS error line]

CONTACT EMAIL
  [text input]
  Required by NWS for API access. Sent only to weather.gov — never shared with other services.

UPDATES
  [ ] Check GitHub for new SkyFrame releases
  When enabled, SkyFrame checks the GitHub releases page at startup and once a day. New
  releases appear as a dismissible advisory alert. Leave unchecked to stop all outbound
  requests beyond the NWS forecast feed.

COSMETIC SKIN
  [disabled select or chip group]
  Coming soon.

[optional setup-error line for server errors]

[CANCEL]  [SAVE]
```

The UPDATES hint is deliberately thorough — enabling the checkbox means opting into a new outbound destination, and the hard-rule spirit wants the user to understand.

### First-run vs anytime-edit behavior

| Behavior | First-run | Anytime-edit |
|---|---|---|
| `onCancel` passed? | No | Yes |
| CANCEL button rendered? | No | Yes |
| SAVE disabled until location+email filled? | Yes | No (fields pre-populated) |
| Modal Esc / backdrop close? | Disabled | Enabled |

Mechanism unchanged from existing `LocationSetup` — `onCancel ? ... : undefined` already implements the gate.

## Server-side update check

### Module layout

```
server/updates/
  github-release.ts          # Pure helpers: version parse, compare, response shape
  github-release.test.ts     # Unit tests for the pure helpers
  update-check.ts            # Imperative orchestrator: fetch, schedule, in-memory cache
  update-check.test.ts       # Orchestrator tests (mocked fetch + fake timers)
```

Two-file split mirrors Feature 6's alert-sounds pattern.

### Pure helpers — `github-release.ts`

```typescript
export interface GitHubRelease {
  tagName: string;
  htmlUrl: string;
  body: string;
  publishedAt: string;
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(raw: string): ParsedVersion | null;
// "v1.2.3" → { 1, 2, 3 } | "1.2" → { 1, 2, 0 } | invalid → null

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number;
// -1 | 0 | 1

export function parseReleaseResponse(raw: unknown): GitHubRelease | null;
// Defensive — returns null on any shape mismatch
```

No semver library dependency. Major.minor.patch comparison only.

### Imperative orchestrator — `update-check.ts`

```typescript
export interface AvailableUpdate {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseBody: string;
  checkedAt: string;
}

// Module-level state
let cachedAvailableUpdate: AvailableUpdate | null = null;
let scheduledTimerId: ReturnType<typeof setTimeout> | null = null;

export function getCachedUpdate(): AvailableUpdate | null;
export function clearCachedUpdate(): void;
export async function performUpdateCheck(now: Date): Promise<void>;
export function startUpdateScheduler(): void;
export function stopUpdateScheduler(): void;
export function msUntilNextLocalMidnight(from: Date): number;
// Exported for direct unit testing + used internally by the scheduler.
```

### Midnight computation

```typescript
export function msUntilNextLocalMidnight(from: Date): number {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime() - from.getTime();
}
```

Uses `setHours` on a local-time `Date`, so DST transitions are handled by the JS runtime.

### GitHub API call

```typescript
const OWNER = 'OniNoKen4192';
const REPO = 'SkyFrame';
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(API_URL, {
      headers: {
        'User-Agent': `SkyFrame-Update-Check/${currentVersion}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!res.ok) return null;
    return parseReleaseResponse(await res.json());
  } catch {
    return null;
  }
}
```

Owner/repo hardcoded. Forkers update two constants. User-Agent mirrors NWS-style — app name + version, no identifiers.

### Current version read

```typescript
import packageJson from '../../package.json' with { type: 'json' };
const currentVersion = packageJson.version;
```

TS + tsx + Vite all support JSON imports with the type assertion. No bundler config needed.

## Alert injection

Synthetic Alert built in `update-check.ts`:

```typescript
function buildUpdateAlert(update: AvailableUpdate): Alert {
  const expires = new Date('2099-01-01T00:00:00Z').toISOString();
  return {
    id: `update-${update.latestVersion}`,
    event: 'Update Available',
    tier: 'advisory',
    severity: 'Minor',
    headline: `SkyFrame ${update.latestVersion} is available`,
    description: `SkyFrame ${update.latestVersion} is available (you are on ${update.currentVersion}).\n\n${update.releaseBody}\n\n${update.releaseUrl}`,
    issuedAt: update.checkedAt,
    effective: update.checkedAt,
    expires,
    areaDesc: 'Update',
  };
}
```

Injection point — inside `normalizeWeather` in `server/nws/normalizer.ts`, right after `normalizeAlerts`:

```typescript
const alerts = normalizeAlerts(alertsResult.data);

const cachedUpdate = getCachedUpdate();
if (cachedUpdate) {
  alerts.push(buildUpdateAlert(cachedUpdate));
  alerts.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
}
```

Advisory tier rank puts the synthetic alert at the bottom. Re-sort is O(n log n) on typically 0–3 entries.

### ID stability

`id: 'update-${tag}'` — stable across polls while the same version is outstanding; changes when a different newer version is released; drops off feed when the user updates, via existing `dismissed` / `soundAcked` pruning patterns.

## Config persistence

### `skyframe.config.json` schema extension

```json
{
  ...existing fields,
  "updateCheckEnabled": false
}
```

`server/config.ts` loads the field, defaulting to `false` when missing (backwards-compatible with existing configs).

### `POST /api/setup` extension

New field accepted:

```typescript
interface SetupBody {
  location: string;
  email: string;
  updateCheckEnabled: boolean;  // NEW
}
```

After writing new config:

```typescript
if (newConfig.updateCheckEnabled && !oldConfig.updateCheckEnabled) {
  startUpdateScheduler();
} else if (!newConfig.updateCheckEnabled && oldConfig.updateCheckEnabled) {
  stopUpdateScheduler();
  clearCachedUpdate();
}
```

### `GET /api/config` extension

Returns the current values so Settings can pre-populate:

```typescript
GET /api/config
→ {
    configured: boolean,
    location?: string,        // "lat, lon" at 4-decimal precision, e.g. "41.9219, -87.6490"
    email?: string,
    updateCheckEnabled?: boolean,
  }
```

The `location` field is formatted as `"lat, lon"` with 4-decimal precision (same shape the GPS button produces). The `resolveSetup` flow accepts this format, so a user who doesn't edit the field and clicks SAVE gets a no-op re-resolution. The config file stores the resolved form (`{ lat, lon, name }`); the string representation is synthesized at read time for the API response.

### Startup wiring — `server/index.ts`

```typescript
if (CONFIG.updateCheckEnabled) {
  startUpdateScheduler();
  app.log.info('Update check enabled — will query GitHub at startup and local midnight');
}
```

If disabled, scheduler never starts. No outbound requests ever.

## Dismissal + pruning edge cases

1. **User dismisses update alert** → ID added to `dismissed` → filtered out of `visible`. `soundAcked` unaffected (advisory tier is silent).
2. **Same version checked again** → same ID → still dismissed → still hidden. ✅
3. **User updates + restarts with newer `package.json`** → check finds no newer (or a different newer) → old ID drops off feed → existing `dismissed` prune removes it. ✅
4. **User toggles updates off** → `clearCachedUpdate` → next poll has no injection → ID drops off feed → pruned. ✅
5. **User toggles off + on quickly** → `stopUpdateScheduler` + `clearCachedUpdate` → `startUpdateScheduler` runs `performUpdateCheck` immediately → cache re-populates → alert reappears on next poll. ✅

## Testing

### Unit tests — `server/updates/github-release.test.ts`

| Test | Assertions |
|---|---|
| `parseVersion` happy paths (`"v1.2.3"`, `"1.2.3"`, `"1.2"`, `"0.0.1"`) | 4 |
| `parseVersion` rejects (`""`, `"abc"`, `"1.a.b"`, `"1.2.3.4"`) | 4 (all null) |
| `compareVersions` ordering across major / minor / patch boundaries | 6 |
| `compareVersions` equality | 1 |
| `parseReleaseResponse` happy path | 1 |
| `parseReleaseResponse` rejects missing / malformed shapes | 3 |

### Unit tests — `server/updates/update-check.test.ts`

| Test | Assertions |
|---|---|
| `msUntilNextLocalMidnight` on various input times | 3 |
| `performUpdateCheck` success path (mocked fetch returns newer) | 1 |
| `performUpdateCheck` no-op when already-latest | 1 |
| `performUpdateCheck` silent-skip on fetch error | 1 |
| `performUpdateCheck` silent-skip on malformed response | 1 |

### Integration tests

- `normalizeWeather` injects the cached update into alerts and re-sorts
- `normalizeWeather` produces no update alert when cache is null
- `POST /api/setup` with `updateCheckEnabled: true` starts scheduler
- `POST /api/setup` toggling enabled → disabled stops scheduler + clears cache

Existing fixtures:
- `server/routes.test.ts` adds `updateCheckEnabled: false` to the fixture config where needed (same pattern as prior feature fixture updates)
- Normalizer fixtures unchanged — default-null cache means existing tests see no injection

### Manual validation

- First-run with checkbox unchecked → no github.com traffic
- Toggle checkbox on via Settings → scheduler log confirms
- Force an update alert via `package.json` version rollback → alert appears in banner within seconds of server restart
- Dismiss alert → persists across reloads
- Bump `package.json` back → restart → alert does not reappear
- Toggle checkbox off mid-session while alert visible → alert disappears on next poll
- Block `api.github.com` in DevTools → next check silent-fails, no crash

## Edge cases

- **GitHub rate limit** (60/hour unauthenticated): two checks/day is nowhere near. If hit via dev restarts, 403 → parse → null → silent skip.
- **Pre-release on GitHub**: `/releases/latest` excludes pre-releases by default.
- **Non-semver tag** (e.g., `v2024.04-spring`): `parseVersion` returns null → no comparison → no alert.
- **`package.json` edited while server running**: check uses in-memory `currentVersion` from module load; restart picks up changes.
- **Concurrent poll during `performUpdateCheck`**: poll reads cached value synchronously; check writes after async fetch. No race.
- **Settings opened mid-poll**: fetches `/api/config` on open — always shows current persisted values.
- **Multiple browser tabs**: each polls independently; server handles each identically; update check runs once server-side regardless.
- **Config file deleted mid-session**: server continues with in-memory CONFIG until next setup POST. Acceptable.
- **Clock skew / wrong system time**: scheduler fires at wrong wall-clock time but still fires roughly every 24h. Not worth defensive handling.

## Documentation updates when shipped

- `PROJECT_STATUS.md`: mark v1.2 complete + add v1.2.1 entry with Settings + update-check detail
- Bump `package.json` version to `1.2.1`
- `.env.example`: no changes (checkbox is in the UI, not the env)

## Ship path

Branch off `main` as `feat/settings-and-updates`. Ship via PR.
