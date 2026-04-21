# Timezone Propagation — Design

**Date:** 2026-04-20
**Status:** Approved for implementation planning
**Version target:** v1.2.2 (bug-fix patch release)
**Branch:** `fix/timezone-propagation`, off `fix/link-status-polish`

## Summary

Replace five hardcoded `'America/Chicago'` strings in the client with the NWS-derived timezone already stored server-side. Pipe the timezone through `/api/config` and prop-drill it to the four components that format times. Fixes an off-by-one-hour bug reported by a beta tester in Eastern time (New Jersey).

## Motivation

The server correctly resolves timezone per-location from the NWS `/points/{lat,lon}` setup call and stores it as `CONFIG.nws.timezone` ([server/nws/setup.ts:106](../../../server/nws/setup.ts#L106), [server/config.ts:81](../../../server/config.ts#L81)). The IANA ID (e.g. `America/New_York`, `America/Chicago`, `America/Phoenix`) is already authoritative and handles DST-quirk zones correctly.

However, five client-side `Intl.DateTimeFormat` constructors hardcode `'America/Chicago'`:

| File | Purpose |
|---|---|
| [client/components/TopBar.tsx:5](../../../client/components/TopBar.tsx#L5) | Live clock (HH:MM:SS TZ) |
| [client/components/TopBar.tsx:14](../../../client/components/TopBar.tsx#L14) | Date label (WEEKDAY · MONTH DAY · YEAR) |
| [client/components/Footer.tsx:13](../../../client/components/Footer.tsx#L13) | LAST PULL / NEXT timestamps |
| [client/components/AlertBanner.tsx:22](../../../client/components/AlertBanner.tsx#L22) | Alert expires time in banner |
| [client/alert-detail-format.ts:34](../../../client/alert-detail-format.ts#L34) | ISSUED / EXPIRES in the alert detail modal; also reused for forecast modal timestamp |

For any user not in Central time, all five of these display times off by 1–3 hours. This is a bug, not a feature — the server already has the correct value.

## Decisions settled during brainstorming

| Decision | Choice | Notes |
|---|---|---|
| Scope | Pure bug fix — no user-overridable timezone in Settings | NWS's IANA TZ is authoritative for the configured location; Arizona, Hawaii, and the Indiana DST quirk zones are handled correctly by IANA. User override would be a footgun. Revisit if real use case emerges. |
| Data channel | Extend `/api/config` response with a `timezone` field | Matches the shape of existing "configured once, changes with location" values (`locationName`, `email`). Alternative (`WeatherMeta`) would recompute on every weather poll despite the value only changing on location change. |
| Client propagation | Prop drilling, no context or module singleton | Matches every other piece of app state — `stationId`, `error`, `locationName` are all prop-drilled. Introducing React Context or mutable module state for one field would be inconsistent with the codebase's existing posture. |

## Scope

**In scope:**
- Server: add `timezone` to the configured branch of `/api/config`
- Client: new `timezone: string | null` state in `App.tsx`, prop-drilled to four components
- Client: move four module-level `Intl.DateTimeFormat` constants into their component function bodies so they can use the prop
- Client: change `formatTime(iso)` → `formatTime(iso, timezone)` and `formatAlertMeta(alert)` → `formatAlertMeta(alert, timezone)` in `alert-detail-format.ts`
- Tests: update `alert-detail-format.test.ts` call sites; add one regression test proving the timezone parameter is honored
- Version bump: `package.json` `1.2.1` → `1.2.2`
- Docs: `PROJECT_STATUS.md` updated (new v1.2.2 banner, new Implemented features entry, remove the footer heartbeat backlog item fixed in PR #15)

**Out of scope:**
- User-overridable timezone field in Settings
- Server-side changes beyond the three-line `/api/config` extension
- Consolidating the five `Intl.DateTimeFormat` definitions into a shared helper (the project already has "three similar blocks beats a premature abstraction" as a rule)
- Retroactive timezone rewriting for historical `lastPull` / `nextRefresh` timestamps (there's no history — they're live values)
- Non-US timezones (NWS-only coverage means US + territories; no international scope today)

## Data flow

```
NWS /points/{lat,lon}
  ↓ (server setup.ts)
CONFIG.nws.timezone
  ↓ (server/routes.ts /api/config handler)
GET /api/config → { configured: true, ..., timezone: "America/Chicago" }
  ↓ (client App.tsx fetchConfig)
useState<string | null> timezone
  ↓ (prop drill)
TopBar | Footer | AlertBanner | AlertDetailBody | App's formatTime call sites
  ↓ (each component's Intl.DateTimeFormat construction)
Rendered time strings
```

When `timezone` is `null` (only during the ~50–200ms between App mount and `/api/config` resolution), formatters pass `timeZone: undefined` to `Intl.DateTimeFormat`, which falls back to the browser's local timezone. For users watching weather for the locale they're in — i.e., nearly everyone — the fallback renders correctly. Once config resolves, all formatters switch to the authoritative NWS-derived TZ.

## Server specification

### `/api/config` — [server/routes.ts:14-28](../../../server/routes.ts#L14-L28)

Configured-branch return object gains one field:

```typescript
return {
  configured: true as const,
  locationName: CONFIG.location.name,
  location: `${CONFIG.location.lat.toFixed(4)}, ${CONFIG.location.lon.toFixed(4)}`,
  email: CONFIG.email,
  updateCheckEnabled: CONFIG.updateCheckEnabled,
  timezone: CONFIG.nws.timezone,  // NEW
};
```

Unconfigured branch (line 15-20) is unchanged — no timezone to report when no location is configured.

No new env vars, no new `CONFIG` fields, no new types on the server side. `CONFIG.nws.timezone` is already typed as `string` in [server/config.ts](../../../server/config.ts) and already defaults to `'America/Chicago'` via `process.env.SKYFRAME_TIMEZONE ?? 'America/Chicago'` when no NWS lookup has happened.

## Client specification

### `App.tsx`

**New state:**

```typescript
const [timezone, setTimezone] = useState<string | null>(null);
```

**`fetchConfig` callback** ([App.tsx:139-162](../../../client/App.tsx#L139-L162)) — extend the success handler:

```typescript
.then((cfg: {
  configured: boolean;
  location?: string;
  email?: string;
  updateCheckEnabled?: boolean;
  timezone?: string;  // NEW
}) => {
  if (seq !== fetchConfigSeqRef.current) return;
  setConfigured(cfg.configured);
  setTimezone(cfg.timezone ?? null);  // NEW
  setSettingsInitial({
    location: cfg.location ?? '',
    email: cfg.email ?? '',
    updateCheckEnabled: cfg.updateCheckEnabled ?? false,
  });
  if (!cfg.configured) setShowSetup(true);
})
```

**Prop drilling** — four new `timezone={timezone}` props:
- `<TopBar ... timezone={timezone} />`
- `<Footer ... timezone={timezone} />`
- `<AlertBanner ... timezone={timezone} />`
- `<AlertDetailBody ... timezone={timezone} />` (or pass through to `formatAlertMeta` at the call site — see AlertDetailBody section below)

**Two existing `formatTime` call sites** ([App.tsx:408, :422](../../../client/App.tsx#L408)) gain the timezone argument:

```typescript
const detailIssuedLabel = detailAlert ? formatTime(detailAlert.issuedAt, timezone) : '';
// ...
const forecastGeneratedLabel = data?.meta?.forecastGeneratedAt
  ? formatTime(data.meta.forecastGeneratedAt, timezone)
  : '';
```

### `TopBar.tsx`

**Interface change:**

```typescript
interface TopBarProps {
  stationId: string | null;
  error: string | null;
  fallback: boolean;
  locationName: string;
  timezone: string | null;  // NEW
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onLocationClick: () => void;
  onOpenSettings: () => void;
}
```

**Remove** the two module-level constants at [TopBar.tsx:4-19](../../../client/components/TopBar.tsx#L4-L19) (`TIME_FORMAT`, `DATE_FORMAT`). **Construct them inside the component body** using the `timezone` prop:

```typescript
export function TopBar({ stationId, error, fallback, locationName, timezone, activeView, ...rest }: TopBarProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(/* ...unchanged... */);

  const timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone ?? undefined,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'short',
  });
  const dateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone ?? undefined,
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric',
  });

  // rest of rendering unchanged
}
```

Per-render construction cost is on the order of microseconds — negligible for a once-per-second clock update.

### `Footer.tsx`

**Interface change** — add `timezone: string | null`.

**Move** the `formatHM` helper's internal `Intl.DateTimeFormat` from its current module-level closure into the component body (or into a small helper that takes `tz`). The existing module-level `formatHM(iso)` function at [Footer.tsx:9-20](../../../client/components/Footer.tsx#L9-L20) becomes a function defined inside the component body that captures the `timezone` prop, OR a module-level function with signature `formatHM(iso: string | undefined, tz: string | null): string`.

Both are acceptable; choose the second (keep `formatHM` as a module-level pure function with an added `tz` parameter) — matches the posture of `alert-detail-format.ts` and keeps the component body lean.

```typescript
function formatHM(iso: string | undefined, tz: string | null): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  /* rest unchanged */
}

export function Footer({ meta, error, nextRetryAt, timezone }: FooterProps) {
  // ...
  const lastPull = formatHM(meta?.fetchedAt, timezone);
  const nextPull = error && nextRetryAt
    ? formatHM(nextRetryAt, timezone)
    : formatHM(meta?.nextRefreshAt, timezone);
  /* rest unchanged */
}
```

### `AlertBanner.tsx`

**Interface change** — add `timezone: string | null`.

**Module-level `formatExpires`** ([AlertBanner.tsx:20-26](../../../client/components/AlertBanner.tsx#L20-L26)) gains a `tz` parameter using the same pattern as `Footer.tsx`'s `formatHM`:

```typescript
function formatExpires(iso: string, tz: string | null): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  return fmt.format(new Date(iso)).toUpperCase();
}
```

Call site inside the component passes `timezone`: `formatExpires(primary.expires, timezone)`.

### `AlertDetailBody.tsx`

**Interface change** — add `timezone: string | null`. Pass it through to `formatAlertMeta(alert, timezone)`.

### `alert-detail-format.ts`

**Remove** the module-level `TIME_FMT` constant at [alert-detail-format.ts:33-39](../../../client/alert-detail-format.ts#L33-L39).

**`formatTime` signature change:**

```typescript
export function formatTime(iso: string, timezone: string | null): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone ?? undefined,
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  return fmt.format(new Date(iso)).toUpperCase();
}
```

**`formatAlertMeta` signature change:**

```typescript
export function formatAlertMeta(alert: Alert, timezone: string | null): string {
  const issued = formatTime(alert.issuedAt, timezone);
  const area = alert.areaDesc.toUpperCase();
  if (isUpdateAlert(alert)) {
    return `ISSUED ${issued} \u00B7 ${area}`;
  }
  const expires = formatTime(alert.expires, timezone);
  return `ISSUED ${issued} \u00B7 EXPIRES ${expires} \u00B7 ${area}`;
}
```

`parseDescription` and `isUpdateAlert` are unchanged — they don't deal with time.

## Test plan

### Updates to existing tests

**[client/alert-detail-format.test.ts](../../../client/alert-detail-format.test.ts)** — every call to `formatTime` and `formatAlertMeta` needs a timezone argument. Pass `'America/Chicago'` to preserve existing expected outputs.

### New regression test

Append to `alert-detail-format.test.ts`:

```typescript
describe('formatTime timezone parameter', () => {
  const iso = '2026-04-20T20:00:00Z';  // 8 PM UTC = 3 PM CDT = 4 PM EDT

  it('renders in America/Chicago when that timezone is passed', () => {
    expect(formatTime(iso, 'America/Chicago')).toBe('3:00 PM CDT');
  });

  it('renders in America/New_York when that timezone is passed', () => {
    expect(formatTime(iso, 'America/New_York')).toBe('4:00 PM EDT');
  });

  it('falls back to browser timezone when timezone is null', () => {
    // Can't assert a specific value without knowing the test runner's TZ;
    // instead assert the function does not throw and returns a non-empty string.
    const result = formatTime(iso, null);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
```

The first two tests are the real regression catch — they prove the timezone parameter is actually honored, not silently dropped or shadowed by a module-level constant.

### Server tests

Unchanged. [server/nws/precip.test.ts](../../../server/nws/precip.test.ts), [server/nws/setup.test.ts](../../../server/nws/setup.test.ts), [server/nws/normalizer.test.ts](../../../server/nws/normalizer.test.ts) use `'America/Chicago'` literals as test inputs to server-side logic that legitimately takes a timezone parameter. Those stay.

### Manual validation

1. Start server on a Central-time location (current `.env` setup). Load the dashboard — clock should read CDT (or CST if winter).
2. Edit `.env` to a lat/lon in New Jersey (e.g. `40.7128, -74.0060`). Restart server, reload dashboard. Clock, Footer timestamps, alert banner, and alert detail modal should all read EDT (or EST in winter).
3. Same dashboard, inject a debug alert via `SKYFRAME_DEBUG_TIERS=tornado-warning`. Open the detail modal. `ISSUED` and `EXPIRES` in the meta line should read in Eastern, not Central.
4. Return the `.env` to the Oak Creek WI location. Verify CDT again.

## Version + documentation

### `package.json`

```diff
-  "version": "1.2.1",
+  "version": "1.2.2",
```

### `PROJECT_STATUS.md`

- Top header: `**Last updated:** 2026-04-20 (v1.2.2)`
- Add to "What's shipped" section after `### v1.1`:
  ```markdown
  ### v1.2
  - See "Implemented features" for the full v1.2 feature set (alert detail modal, forecast narrative modal, GPS autodetect, alert sounds, Settings + update notifications).
  ### v1.2.2
  - Timezone propagation fix: client now reads the NWS-derived timezone from `/api/config` instead of hardcoding `America/Chicago`. Fixes off-by-hour display for users outside Central time. Also bundles the link-status heartbeat fix (PR #15) and the terminal modal typography refresh (PR #16) if they merge before this branch.
  ```
  (Adjust the bullet for what's actually in `main` at merge time — don't claim PRs that haven't landed yet.)
- Append to "Implemented features" at the end:
  ```markdown
  ### Timezone propagation fix (v1.2.2)
  - Extended `/api/config` to include the NWS-derived `timezone` (IANA ID like `America/New_York`). Client's `App.tsx` stores it in state and prop-drills it to `TopBar`, `Footer`, `AlertBanner`, and `AlertDetailBody`, plus the two `formatTime(...)` call sites for the alert detail and forecast narrative modal title-right timestamps.
  - `formatTime` and `formatAlertMeta` in `client/alert-detail-format.ts` now accept a `timezone: string | null` parameter; module-level `Intl.DateTimeFormat` constants in TopBar, Footer, and AlertBanner moved to per-call construction with the same parameter pattern.
  - Fallback: when the timezone is `null` (only during the brief window between App mount and config fetch resolution), formatters pass `timeZone: undefined` to `Intl.DateTimeFormat`, which falls back to the browser's local timezone. Once config resolves, all formatters switch to the authoritative NWS-derived TZ.
  - New `alert-detail-format.test.ts` regression test verifies the timezone parameter is honored (`America/Chicago` vs `America/New_York` produce different outputs for the same ISO input).
  ```
- Remove the backlog item on line 86 (`**Footer LINK.{station} heartbeat mismatch during initial load...**`) — fixed by PR #15.

## Ship path

Branch `fix/timezone-propagation` off `fix/link-status-polish`. Same stacking pattern as the typography PR — PR #15 is a logical prerequisite because the Footer component is touched in both branches. Open as a separate PR from the typography work so it can merge independently.

Commit layout (guidance for the plan):
1. Server: add timezone to /api/config
2. Client core: App.tsx state + type update for config fetch
3. Client components: TopBar + Footer + AlertBanner prop threading
4. Client alert format: formatTime + formatAlertMeta signature changes + AlertDetailBody prop threading
5. Tests: update existing + add regression test
6. Version bump + PROJECT_STATUS

Six small commits, each reviewable on its own.
