# Timezone Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five hardcoded `'America/Chicago'` strings in the client with the NWS-derived timezone that the server already stores, so users outside Central time see correct local times in the clock, footer, alert banner, and alert detail modal.

**Architecture:** Extend `/api/config` with a `timezone` field sourced from `CONFIG.nws.timezone`. Capture it into `App.tsx` state (`timezone: string | null`) and prop-drill it to `TopBar`, `Footer`, `AlertBanner`, and `AlertDetailBody`. The single pure formatter module (`client/alert-detail-format.ts`) grows a `timezone` parameter on its two time-formatting functions. When the value is `null` (only during the ~50–200ms between App mount and config fetch resolution), formatters pass `timeZone: undefined` to `Intl.DateTimeFormat`, which falls back to the browser's local TZ.

**Tech Stack:** React 18 + Vite 5 (client) + Fastify 5 + TypeScript 5.4 + Vitest 1.6. `Intl.DateTimeFormat` handles all timezone math — no new dependencies.

**Reference spec:** [docs/superpowers/specs/2026-04-20-timezone-propagation-design.md](../specs/2026-04-20-timezone-propagation-design.md). Every type, signature, and expected behavior below is pulled from the spec.

---

## Pre-flight

**Branch setup.** This work stacks on `fix/link-status-polish` (PR #15) because both branches modify `Footer.tsx`. Separate from the typography PR (#16), which will merge independently.

```bash
# From project root, working tree clean
git checkout fix/link-status-polish
git pull origin fix/link-status-polish
git checkout -b fix/timezone-propagation
```

If the working tree isn't clean: `git stash push -m "pre-timezone-branch"` first.

**Dev server.** Start in a separate terminal so you can eyeball changes as you go:

```powershell
npm run dev
```

**Manual validation baseline.** Note the current `.env` location (should be Oak Creek WI or similar Central-time coordinates). You'll swap it to a New Jersey lat/lon in Task 7 to validate the fix.

---

## Task 1: Server — add `timezone` to `/api/config` response

**Files:**
- Modify: `server/routes.ts` — the `/api/config` route handler (around lines 14-28)
- Test: No server test changes — existing tests are at the normalizer / setup / precip level, not at the route handler level, and they don't assert on the `/api/config` response shape.

This is the one server change in the whole plan. Everything else is client.

- [ ] **Step 1: Read the current `/api/config` handler**

Open `server/routes.ts` and find the `app.get('/api/config', ...)` block. Confirm it currently looks like:

```typescript
app.get('/api/config', async () => {
  if (!CONFIG.configured) {
    return {
      configured: false as const,
      updateCheckEnabled: CONFIG.updateCheckEnabled,
    };
  }
  return {
    configured: true as const,
    locationName: CONFIG.location.name,
    location: `${CONFIG.location.lat.toFixed(4)}, ${CONFIG.location.lon.toFixed(4)}`,
    email: CONFIG.email,
    updateCheckEnabled: CONFIG.updateCheckEnabled,
  };
});
```

If the configured branch's return object already has a `timezone` key, this task is already done — report it as a no-op.

- [ ] **Step 2: Add `timezone: CONFIG.nws.timezone` to the configured-branch return**

Change the configured-branch return to:

```typescript
return {
  configured: true as const,
  locationName: CONFIG.location.name,
  location: `${CONFIG.location.lat.toFixed(4)}, ${CONFIG.location.lon.toFixed(4)}`,
  email: CONFIG.email,
  updateCheckEnabled: CONFIG.updateCheckEnabled,
  timezone: CONFIG.nws.timezone,
};
```

`CONFIG.nws.timezone` is already typed as `string` in [server/config.ts](../../../server/config.ts) — the NWS setup flow populates it from `props.timeZone` in the `/points/{lat,lon}` response. Fallback default is `'America/Chicago'` via `process.env.SKYFRAME_TIMEZONE`.

Do NOT touch the unconfigured branch — no location means no timezone.

- [ ] **Step 3: Typecheck server**

Run: `npx tsc --noEmit -p tsconfig.server.json`
Expected: no output.

- [ ] **Step 4: Smoke-test the endpoint**

With the dev server running, hit the endpoint:

```bash
curl -s http://localhost:3000/api/config
```

Expected response (values will differ by your `.env`):

```json
{
  "configured": true,
  "locationName": "Oak Creek, WI",
  "location": "42.8822, -87.9007",
  "email": "ken.culver@gmail.com",
  "updateCheckEnabled": false,
  "timezone": "America/Chicago"
}
```

If `timezone` is missing from the JSON, your change didn't stick — re-edit.

- [ ] **Step 5: Run server tests**

Run: `npm test -- server/`
Expected: all passing. No test changes in this task means no regressions expected.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts
git commit -m "Expose NWS-derived timezone via /api/config

The server already resolves timezone per-location from the NWS /points
response and stores it as CONFIG.nws.timezone. Extending the configured
branch of /api/config with the value gives the client a single source
of truth for its time formatters, which today hardcode
America/Chicago."
```

---

## Task 2: Client — App.tsx state + config fetch

**Files:**
- Modify: `client/App.tsx` — `fetchConfig` handler (around lines 139-162) and the state declarations near the top of `App` (around line 125-131)
- Test: No direct App.tsx tests exist; this task is prep for later prop drilling.

- [ ] **Step 1: Add `timezone` state**

In the state declarations block of `App` (just above `fetchConfigSeqRef`, around line 125), add:

```typescript
const [timezone, setTimezone] = useState<string | null>(null);
```

Place it near the other "config-derived" state — e.g., right after `const [settingsInitial, setSettingsInitial] = useState<SettingsInitialConfig>(...)`.

- [ ] **Step 2: Extend the `fetchConfig` type signature**

Find the `.then` callback in `fetchConfig` (around line 142). Currently:

```typescript
.then((cfg: {
  configured: boolean;
  location?: string;
  email?: string;
  updateCheckEnabled?: boolean;
}) => {
```

Change to:

```typescript
.then((cfg: {
  configured: boolean;
  location?: string;
  email?: string;
  updateCheckEnabled?: boolean;
  timezone?: string;
}) => {
```

- [ ] **Step 3: Capture timezone into state**

Inside the same callback, after `setConfigured(cfg.configured);`, add:

```typescript
setTimezone(cfg.timezone ?? null);
```

Resulting callback body:

```typescript
.then((cfg: {
  configured: boolean;
  location?: string;
  email?: string;
  updateCheckEnabled?: boolean;
  timezone?: string;
}) => {
  if (seq !== fetchConfigSeqRef.current) return;
  setConfigured(cfg.configured);
  setTimezone(cfg.timezone ?? null);
  setSettingsInitial({
    location: cfg.location ?? '',
    email: cfg.email ?? '',
    updateCheckEnabled: cfg.updateCheckEnabled ?? false,
  });
  if (!cfg.configured) setShowSetup(true);
})
```

- [ ] **Step 4: Typecheck client**

Run: `npx tsc --noEmit -p tsconfig.client.json`
Expected: no output. (The `timezone` state is unused so far — that's fine; TypeScript does not flag unused local state.)

- [ ] **Step 5: Commit**

```bash
git add client/App.tsx
git commit -m "Capture server-provided timezone into App.tsx state

Adds a timezone: string | null state and reads cfg.timezone from the
/api/config response. Prop threading into components follows in later
commits."
```

---

## Task 3: alert-detail-format.ts — parameterize time formatters

**Files:**
- Modify: `client/alert-detail-format.ts` — delete module-level `TIME_FMT` constant (lines 33-39), change `formatTime` signature (line 41-43), change `formatAlertMeta` signature (line 54-62).
- Modify: `client/alert-detail-format.test.ts` — update every `formatTime` and `formatAlertMeta` call with a timezone argument; add 3 new regression tests.
- Test: All tests in this file must pass by the end of the task.

**Important:** this task uses TDD because the two test changes (updating existing tests + adding regression tests) drive the signature change. Do the test edits first, watch them fail, then update the implementation.

- [ ] **Step 1: Read the current test file to understand shape**

Open `client/alert-detail-format.test.ts`. Note every place where `formatTime` or `formatAlertMeta` is called. You'll update those calls in Step 2.

- [ ] **Step 2: Update existing test call sites to pass `'America/Chicago'`**

Every existing `formatTime(iso)` call becomes `formatTime(iso, 'America/Chicago')`.
Every existing `formatAlertMeta(alert)` call becomes `formatAlertMeta(alert, 'America/Chicago')`.

Do NOT change expected output strings — the whole point is that passing `'America/Chicago'` reproduces today's behavior.

Example: if there's a line like `expect(formatTime('2026-04-18T19:14:00Z')).toBe('2:14 PM CDT')`, change it to:

```typescript
expect(formatTime('2026-04-18T19:14:00Z', 'America/Chicago')).toBe('2:14 PM CDT')
```

- [ ] **Step 3: Add the regression test suite**

Append to `client/alert-detail-format.test.ts`:

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
    const result = formatTime(iso, null);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
```

These prove the parameter is honored (not silently dropped by a stale module-level constant shadow).

- [ ] **Step 4: Run the tests — they should FAIL**

Run: `npm test -- client/alert-detail-format.test.ts`
Expected: failures. Either TS compile errors ("Expected 1 arguments, but got 2") or runtime failures because the current `formatTime` ignores its second argument.

This confirms the tests are actually exercising the change, not passing by accident.

- [ ] **Step 5: Update `formatTime` signature and implementation**

In `client/alert-detail-format.ts`:

**Delete** the module-level `TIME_FMT` constant (lines 33-39):

```typescript
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});
```

**Replace** the `formatTime` function with:

```typescript
export function formatTime(iso: string, timezone: string | null): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone ?? undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
  return fmt.format(new Date(iso)).toUpperCase();
}
```

- [ ] **Step 6: Update `formatAlertMeta` signature and implementation**

Replace the existing `formatAlertMeta` with:

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

`parseDescription` and `isUpdateAlert` are unchanged — they do not handle time.

- [ ] **Step 7: Run the tests — they should PASS**

Run: `npm test -- client/alert-detail-format.test.ts`
Expected: all passing, including the three new regression tests.

- [ ] **Step 8: Typecheck client**

Run: `npx tsc --noEmit -p tsconfig.client.json`
Expected: errors — the two `formatTime` call sites in `App.tsx` ([App.tsx:408, :422](../../../client/App.tsx#L408)) are now missing their second argument, and `AlertDetailBody.tsx`'s `formatAlertMeta(alert)` call is also missing its argument.

**Do not fix these here.** They are fixed in Tasks 4 and 5. Proceed to commit — the build IS currently broken and will stay broken until Task 5 lands.

- [ ] **Step 9: Commit**

```bash
git add client/alert-detail-format.ts client/alert-detail-format.test.ts
git commit -m "Parameterize formatTime + formatAlertMeta with timezone

Both formatters now take a timezone: string | null parameter. null maps
to timeZone: undefined in Intl.DateTimeFormat, which resolves to the
browser's local timezone. New regression tests verify the parameter is
honored (Chicago vs New York render differently for the same ISO).

Call sites in App.tsx and AlertDetailBody are updated in the next
commits — client typecheck will be broken until then."
```

---

## Task 4: App.tsx — wire `formatTime` call sites and prop-drill to four components

**Files:**
- Modify: `client/App.tsx` — two `formatTime` call sites (around line 408 and 422), four child JSX elements (`<TopBar>`, `<Footer>`, `<AlertBanner>`, `<AlertDetailBody>` or the `AlertDetailBody` child of `<TerminalModal>`).
- Test: Client typecheck must succeed by the end (but NOT until this task is complete — Tasks 4 and 5 must both land before the build is green again).

- [ ] **Step 1: Update the two `formatTime` call sites**

Find the two call sites in `App.tsx`:

```typescript
const detailIssuedLabel = detailAlert ? formatTime(detailAlert.issuedAt) : '';
```

and

```typescript
? formatTime(data.meta.forecastGeneratedAt)
```

Change to:

```typescript
const detailIssuedLabel = detailAlert ? formatTime(detailAlert.issuedAt, timezone) : '';
```

and

```typescript
? formatTime(data.meta.forecastGeneratedAt, timezone)
```

`timezone` here is the state variable added in Task 2.

- [ ] **Step 2: Add `timezone={timezone}` to `<TopBar>`**

Find the `<TopBar>` JSX element (around line 462). Add `timezone={timezone}` to its props:

```typescript
<TopBar
  stationId={data?.meta?.stationId ?? null}
  error={error}
  fallback={data?.meta?.error === 'station_fallback'}
  locationName={data?.meta?.locationName ?? ''}
  timezone={timezone}
  activeView={activeView}
  onViewChange={setActiveView}
  onLocationClick={handleOpenSettings}
  onOpenSettings={handleOpenSettings}
/>
```

- [ ] **Step 3: Add `timezone={timezone}` to `<Footer>`**

Find the `<Footer>` JSX element (around line 474). Add `timezone={timezone}`:

```typescript
<Footer meta={data?.meta ?? null} error={error} nextRetryAt={nextRetryAt} timezone={timezone} />
```

- [ ] **Step 4: Add `timezone={timezone}` to `<AlertBanner>`**

Find the `<AlertBanner>` JSX element. Add `timezone={timezone}`:

```typescript
<AlertBanner
  alerts={visibleAlerts}
  onDismiss={handleDismiss}
  onOpenDetail={handleOpenDetail}
  onAcknowledgeSounds={handleAcknowledgeSounds}
  timezone={timezone}
/>
```

(Exact prop list around your `<AlertBanner>` may vary — just add the one new prop.)

- [ ] **Step 5: Add `timezone={timezone}` to `<AlertDetailBody>`**

Find the `<AlertDetailBody>` JSX element (inside a `<TerminalModal>` child slot). Add `timezone={timezone}`:

```typescript
{detailAlert && <AlertDetailBody alert={detailAlert} timezone={timezone} />}
```

- [ ] **Step 6: Typecheck client — expect errors in the child components**

Run: `npx tsc --noEmit -p tsconfig.client.json`
Expected: errors like `Property 'timezone' does not exist on type 'TopBarProps'` (and analogous for Footer, AlertBanner, AlertDetailBody).

These are fixed in Task 5. The call-site changes and prop additions are correct; the interface declarations just haven't caught up yet.

- [ ] **Step 7: Commit**

```bash
git add client/App.tsx
git commit -m "Thread timezone to formatTime call sites + 4 child components

Passes timezone to the two formatTime(...) calls for the alert detail
modal and forecast narrative modal title-right labels, and adds
timezone={timezone} to TopBar, Footer, AlertBanner, and
AlertDetailBody. Child component interfaces are updated in the next
commit — typecheck will error until that lands."
```

---

## Task 5: TopBar / Footer / AlertBanner / AlertDetailBody — accept the prop

**Files:**
- Modify: `client/components/TopBar.tsx` — `TopBarProps`, `TopBar` destructure, move two `Intl.DateTimeFormat` constants into component body
- Modify: `client/components/Footer.tsx` — `FooterProps`, `Footer` destructure, change `formatHM` to take a `tz` parameter, update its two call sites
- Modify: `client/components/AlertBanner.tsx` — `AlertBannerProps`, `AlertBanner` destructure, change `formatExpires` to take a `tz` parameter, update its call site
- Modify: `client/components/AlertDetailBody.tsx` — props, pass to `formatAlertMeta`
- Test: client typecheck must be clean at the end; full test suite must pass.

- [ ] **Step 1: `TopBar.tsx` — add `timezone` to interface**

Find `interface TopBarProps` in `client/components/TopBar.tsx`. Add `timezone: string | null` alongside the other props:

```typescript
interface TopBarProps {
  stationId: string | null;
  error: string | null;
  fallback: boolean;
  locationName: string;
  timezone: string | null;
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onLocationClick: () => void;
  onOpenSettings: () => void;
}
```

- [ ] **Step 2: `TopBar.tsx` — destructure `timezone` in the component**

Find the `export function TopBar({ ... })` line. Add `timezone` to the destructure:

```typescript
export function TopBar({ stationId, error, fallback, locationName, timezone, activeView, onViewChange, onLocationClick, onOpenSettings }: TopBarProps) {
```

- [ ] **Step 3: `TopBar.tsx` — delete the two module-level `DateTimeFormat` constants**

Delete these lines (around 4-19 at the top of the file):

```typescript
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});
```

Leave the `partsToMap` helper alone — it's timezone-agnostic.

- [ ] **Step 4: `TopBar.tsx` — construct the formatters inside the component body**

Inside the component body, above `const t = partsToMap(...)` and `const d = partsToMap(...)`, add:

```typescript
const timeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: timezone ?? undefined,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: timezone ?? undefined,
  weekday: 'short',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});
```

Then change the two `partsToMap` calls from `TIME_FORMAT` / `DATE_FORMAT` to the lowercase in-body `timeFormat` / `dateFormat`:

```typescript
const t = partsToMap(timeFormat.formatToParts(now));
const d = partsToMap(dateFormat.formatToParts(now));
```

Per-render construction cost is microseconds — negligible for a once-per-second clock.

- [ ] **Step 5: `Footer.tsx` — add `timezone` to interface**

Find `interface FooterProps`:

```typescript
interface FooterProps {
  meta: WeatherMeta | null;
  error: string | null;
  nextRetryAt?: string | null;
  timezone: string | null;
}
```

- [ ] **Step 6: `Footer.tsx` — change `formatHM` to take a `tz` parameter**

Replace the module-level `formatHM` (around lines 9-20):

```typescript
function formatHM(iso: string | undefined, tz: string | null): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}:${map.second}`;
}
```

- [ ] **Step 7: `Footer.tsx` — destructure `timezone` and pass it to formatHM**

Update the `Footer` component body:

```typescript
export function Footer({ meta, error, nextRetryAt, timezone }: FooterProps) {
  const offline = !!error || !meta;
  const fallback = !offline && meta.error === 'station_fallback';
  const lastPull = formatHM(meta?.fetchedAt, timezone);
  const nextPull = error && nextRetryAt
    ? formatHM(nextRetryAt, timezone)
    : formatHM(meta?.nextRefreshAt, timezone);

  const dotClass = offline ? 'dot dot-error' : fallback ? 'dot dot-fallback' : 'dot';
  const linkClass = fallback ? 'footer-link footer-link-fallback' : 'footer-link';

  return (
    <div className="hud-footer">
      <span className={dotClass}></span>
      <span className={linkClass}>{offline ? 'LINK.OFFLINE' : `LINK.${meta.stationId}`}</span>
      &nbsp;·&nbsp; LAST PULL {lastPull} &nbsp;·&nbsp; NEXT {nextPull}
    </div>
  );
}
```

(The rest of the file — `formatHM` already updated — is unchanged.)

- [ ] **Step 8: `AlertBanner.tsx` — add `timezone` to interface**

Find `interface AlertBannerProps`:

```typescript
interface AlertBannerProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onAcknowledgeSounds: () => void;
  timezone: string | null;
}
```

- [ ] **Step 9: `AlertBanner.tsx` — change `formatExpires` to take a `tz` parameter**

Replace the module-level `formatExpires` (lines 20-26):

```typescript
function formatExpires(iso: string, tz: string | null): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  return fmt.format(new Date(iso)).toUpperCase();
}
```

- [ ] **Step 10: `AlertBanner.tsx` — destructure `timezone` and pass it to formatExpires**

In the component body (around line 28), update the destructure:

```typescript
export function AlertBanner({ alerts, onDismiss, onOpenDetail, onAcknowledgeSounds, timezone }: AlertBannerProps) {
```

And update the `formatExpires` call site (around line 35):

```typescript
const expiresLabel = formatExpires(primary.expires, timezone);
```

- [ ] **Step 11: `AlertDetailBody.tsx` — add `timezone` to interface + destructure + pass to formatAlertMeta**

Open `client/components/AlertDetailBody.tsx` and find the props interface. Add `timezone: string | null`:

```typescript
interface AlertDetailBodyProps {
  alert: Alert;
  timezone: string | null;
}
```

Update the component's destructure:

```typescript
export function AlertDetailBody({ alert, timezone }: AlertDetailBodyProps) {
```

Find the `formatAlertMeta(alert)` call and change it to:

```typescript
formatAlertMeta(alert, timezone)
```

- [ ] **Step 12: Typecheck client — expect clean**

Run: `npx tsc --noEmit -p tsconfig.client.json`
Expected: no output. Every `timezone` prop now lands on a matching interface, every `formatTime` / `formatAlertMeta` / `formatHM` / `formatExpires` call has its timezone argument.

If there are errors, read them carefully — the most likely cause is a missed destructure or a typo in a prop name. Fix any before proceeding.

- [ ] **Step 13: Run the full test suite**

Run: `npm test`
Expected: all passing (including the new regression tests from Task 3). Vitest with `--pool=forks` takes ~6s.

- [ ] **Step 14: Commit**

```bash
git add client/components/TopBar.tsx client/components/Footer.tsx client/components/AlertBanner.tsx client/components/AlertDetailBody.tsx
git commit -m "Accept timezone prop in four time-rendering components

TopBar, Footer, AlertBanner, and AlertDetailBody now take a
timezone: string | null prop. Module-level Intl.DateTimeFormat
constants in TopBar moved inside the component body. formatHM
(Footer) and formatExpires (AlertBanner) gained a tz parameter
matching formatTime's signature. AlertDetailBody passes timezone
through to formatAlertMeta."
```

---

## Task 6: Version bump + PROJECT_STATUS

**Files:**
- Modify: `package.json` — `version` field
- Modify: `PROJECT_STATUS.md` — header date, "What's shipped" section, "Implemented features" section, and delete one backlog item
- Test: no test changes

- [ ] **Step 1: Bump `package.json` version**

Find the `"version"` key in `package.json` and change from `"1.2.1"` to `"1.2.2"`.

Diff:

```diff
-  "version": "1.2.1",
+  "version": "1.2.2",
```

- [ ] **Step 2: Update PROJECT_STATUS header date and version**

Open `PROJECT_STATUS.md`. The top line says:

```markdown
**Last updated:** 2026-04-20 (v1.2.1)
```

Change to:

```markdown
**Last updated:** 2026-04-20 (v1.2.2)
```

- [ ] **Step 3: Add v1.2.2 entry to "What's shipped"**

Find the `## What's shipped` section. It currently ends at `### v1.1`. Append after the v1.1 block:

```markdown
### v1.2.2
- Timezone propagation fix: client now reads the NWS-derived timezone from `/api/config` instead of hardcoding `America/Chicago`. Fixes off-by-hour display for users outside Central time.
```

Leave `### v1.0` and `### v1.1` above it unchanged.

**Note on v1.2/v1.2.1 banners:** The current file skips straight from v1.1 → Implemented features, with v1.2 features tagged inside the Implemented features section. Don't add retroactive v1.2 or v1.2.1 banners to "What's shipped" — just add the v1.2.2 entry. This matches the existing convention.

- [ ] **Step 4: Remove the fixed backlog item**

Find `## What's pending` → `### Future version backlog`. The first bullet currently reads:

```markdown
- **Footer `LINK.{station}` heartbeat mismatch during initial load:** the Footer's link-status heartbeat animates in the "active/pulsing" state before the first weather poll resolves, while the TopBar correctly shows `LINK.OFFLINE` for the same moment. Both indicators should agree on offline until fresh data arrives. Small scope — likely a missing `data-state` toggle or effect in `Footer.tsx`.
```

Delete this entire bullet. It was fixed by PR #15 (`fix/link-status-polish`), which this branch is stacked on.

**Do NOT delete any other backlog item.** Only this one.

- [ ] **Step 5: Add a new entry in "Implemented features"**

Scroll to the end of the "## Implemented features" section (after the most recent entry — as of writing, the "Terminal modal typography refresh (post-v1.2.1)" entry added in PR #16, OR if that hasn't merged, the "Settings modal + GitHub update notifications (v1.2.1)" entry).

Append:

```markdown
### Timezone propagation fix (v1.2.2)
- Extended `/api/config` to include the NWS-derived `timezone` (IANA ID like `America/New_York`). Client's `App.tsx` stores it in state and prop-drills it to `TopBar`, `Footer`, `AlertBanner`, and `AlertDetailBody`, plus the two `formatTime(...)` call sites for the alert detail and forecast narrative modal title-right timestamps.
- `formatTime` and `formatAlertMeta` in `client/alert-detail-format.ts` now accept a `timezone: string | null` parameter; module-level `Intl.DateTimeFormat` constants in `TopBar`, `Footer`, and `AlertBanner` moved to per-call construction with the same parameter pattern.
- Fallback: when the timezone is `null` (only during the brief window between App mount and config fetch resolution), formatters pass `timeZone: undefined` to `Intl.DateTimeFormat`, which resolves to the browser's local timezone. Once config resolves, all formatters switch to the authoritative NWS-derived TZ.
- New `alert-detail-format.test.ts` regression test verifies the timezone parameter is honored (`America/Chicago` vs `America/New_York` produce different outputs for the same ISO input).
```

- [ ] **Step 6: Commit**

```bash
git add package.json PROJECT_STATUS.md
git commit -m "Bump to v1.2.2 + document timezone fix in PROJECT_STATUS"
```

---

## Task 7: Full validation + ship

**Files:** No code changes. This task is manual validation + push + PR.

- [ ] **Step 1: Typecheck + test suite**

Run all three:

```bash
npx tsc --noEmit -p tsconfig.client.json
npx tsc --noEmit -p tsconfig.server.json
npm test
```

Expected: no type errors. `npm test` shows all tests passing — should be 3 more than before (the three new regression tests from Task 3).

- [ ] **Step 2: Manual validation — Central time (baseline)**

With the dev server running and `.env` pointing at a Central-time location (the existing Oak Creek WI setup), open http://localhost:5173:

- TopBar clock reads `HH:MM:SS CDT` (or `CST` in winter)
- Footer `LAST PULL` and `NEXT` read HH:MM:SS in Central
- No visible change from before — this is the "did I break it" sanity check

Inject a debug alert and open the detail modal:

```powershell
$env:SKYFRAME_DEBUG_TIERS = "tornado-warning"
npm run dev  # restart
```

- Alert banner expires time reads Central
- Alert detail modal ISSUED / EXPIRES in meta line read Central

- [ ] **Step 3: Manual validation — Eastern time (the fix)**

Edit `.env` and change the lat/lon to a New Jersey location (e.g. `40.7128, -74.0060`). Save.

Restart the dev server (so the server re-runs NWS `/points` setup):

```powershell
npm run dev
```

Reload http://localhost:5173 and walk through the same checks:

- TopBar clock reads `HH:MM:SS EDT` (or `EST` in winter) — **not CDT**
- Footer timestamps in Eastern
- Alert banner and detail modal all in Eastern

This is the bug-fix validation. Before this change, all four readouts would have been in CDT despite the NJ location.

- [ ] **Step 4: Manual validation — return to baseline**

Edit `.env` back to Oak Creek (or whichever location you started with). Restart dev server. Confirm the dashboard is back to Central time. This is just hygiene so your local state isn't left configured for NJ.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin fix/timezone-propagation
```

- [ ] **Step 6: Open the PR**

```bash
gh pr create --base main --title "Fix hardcoded timezone + bump to v1.2.2" --body "$(cat <<'EOF'
## Summary
Replaces five hardcoded `'America/Chicago'` strings in the client with the NWS-derived timezone that the server already stores. Fixes off-by-hour display for users outside Central time (reported by a beta tester in New Jersey).

- Server: extends `/api/config` with a `timezone` field sourced from `CONFIG.nws.timezone`.
- Client: new `timezone: string | null` state in `App.tsx`, prop-drilled to `TopBar`, `Footer`, `AlertBanner`, and `AlertDetailBody`.
- `formatTime` and `formatAlertMeta` in `client/alert-detail-format.ts` gain a `timezone` parameter; module-level `Intl.DateTimeFormat` constants move into component bodies in TopBar / Footer / AlertBanner.
- New regression test in `alert-detail-format.test.ts` proves the timezone parameter is honored (`America/Chicago` vs `America/New_York` produce different outputs for the same ISO).
- Fallback: `timezone: null` maps to `timeZone: undefined` in `Intl.DateTimeFormat`, which falls back to the browser's local TZ. Only active during the ~50–200ms between App mount and `/api/config` resolution.
- `package.json` bumped from `1.2.1` to `1.2.2`. `PROJECT_STATUS.md` updated: new `### v1.2.2` entry in "What's shipped", new "Timezone propagation fix (v1.2.2)" entry in "Implemented features", and the footer-heartbeat backlog item is removed (fixed by PR #15 which this branch is stacked on).

No user-overridable timezone in Settings — NWS's IANA TZ is authoritative for the configured location.

Spec: [docs/superpowers/specs/2026-04-20-timezone-propagation-design.md](docs/superpowers/specs/2026-04-20-timezone-propagation-design.md)

## Test plan
- [x] Client typecheck clean
- [x] Server typecheck clean
- [x] `npm test` — all passing, 3 new regression tests added
- [x] Manual: Central-time location (Oak Creek WI) — clock + footer + alert banner + detail modal all render Central
- [x] Manual: Eastern-time location (NJ lat/lon in `.env`) — clock + footer + alert banner + detail modal all render Eastern
- [x] Manual: return to Central, verify no leftover state

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollback

If the fix ships wrong, `git revert <merge-commit-sha>` on the PR cleanly removes all client + server changes. No schema migrations, no data implications, no component-API breakage at consumer boundaries (except the four child components whose interfaces gained one optional-null prop — callers would need to stop passing it, but the component itself would be reverted in the same commit).

## What's out of scope (per spec)

- User-overridable timezone in Settings
- International (non-US) timezones (NWS coverage is US-only)
- Consolidating the five `Intl.DateTimeFormat` definitions into a shared helper
- Retroactive timezone rewriting for historical timestamps (there's no history — they're live values)
