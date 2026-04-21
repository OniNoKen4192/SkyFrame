# Force Fallback Station Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-facing override that pins the weather dashboard to the secondary station (bypassing auto-fallback logic), surfaced as a clickable `LINK.XXXX` in the Footer that opens a HUD-styled popover with live preview rows for both stations.

**Architecture:** One server config field (`stationOverride`) persisted in `skyframe.config.json`, honored by `fetchObservationsWithFallback` in the normalizer. Two new server routes: `POST /api/station-override` for state changes (with cache invalidation) and `GET /api/stations/preview` for the popover's side-by-side comparison. One new client component (`StationPopover`), plus minimal modifications to `Footer.tsx` and `App.tsx`.

**Tech Stack:** Fastify 5, Vitest 1.6, TypeScript 5.4, React 18, vanilla CSS with HUD accent variables.

**Spec:** [docs/superpowers/specs/2026-04-20-force-fallback-station-design.md](../specs/2026-04-20-force-fallback-station-design.md)

---

## File Structure

**New files:**
- `server/nws/station-preview.ts` — `summarizeStation` helper, types for the preview endpoint
- `server/nws/station-preview.test.ts` — Vitest coverage for `summarizeStation`
- `client/components/StationPopover.tsx` — the popover component

**Modified files:**
- `shared/types.ts` — add `stationOverride` to `WeatherMeta`
- `server/config.ts` — add `stationOverride` to `SkyFrameLocationConfig` + `buildConfig`; export `loadSavedConfig`
- `server/nws/normalizer.ts` — `fetchObservationsWithFallback` honors override; `normalizeWeather` writes `meta.stationOverride`
- `server/nws/normalizer.test.ts` — cover override path + regression for auto-fallback unchanged
- `server/routes.ts` — new `POST /api/station-override`, new `GET /api/stations/preview`, extend `GET /api/config`
- `server/routes.test.ts` — cover new endpoints
- `client/App.tsx` — fetch `stationOverride` from `/api/config`, pass to Footer + refetch callback
- `client/components/Footer.tsx` — make `LINK.XXXX` clickable, render `[PIN]` suffix, own popover open state
- `client/styles/hud.css` — append `.station-popover*` + `.footer-link-button` + `.footer-link-pin`
- `package.json` — version `1.2.2` → `1.2.3`
- `PROJECT_STATUS.md` — add v1.2.3 implemented-features entry
- `CLAUDE.md` — one sentence under "Station fallback" noting the manual override

---

## Task 0: Create feature branch

**Files:** none (branch only)

- [ ] **Step 1: Create and switch to feature branch**

Run: `git checkout -b feat/force-fallback-station`
Expected: `Switched to a new branch 'feat/force-fallback-station'`

- [ ] **Step 2: Confirm clean working state**

Run: `git status`
Expected: `nothing to commit, working tree clean` (besides the spec already on `main`)

---

## Task 1: Extend shared WeatherMeta type

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add `stationOverride` to `WeatherMeta`**

In [shared/types.ts](shared/types.ts), locate the `WeatherMeta` interface (around line 71). Add the new field between `locationName` and `forecastGeneratedAt`:

```typescript
export interface WeatherMeta {
  fetchedAt: string;
  nextRefreshAt: string;
  cacheHit: boolean;
  stationId: string;
  locationName: string;
  stationOverride: 'auto' | 'force-secondary';  // always present; 'auto' when user hasn't pinned
  forecastGeneratedAt: string;
  error?: 'rate_limited' | 'upstream_malformed' | 'station_fallback' | 'partial';
}
```

- [ ] **Step 2: Run typecheck to surface all call sites that construct `WeatherMeta`**

Run: `npm run typecheck`
Expected: errors in `server/nws/normalizer.ts` and `server/routes.test.ts` (the FIXTURE_RESPONSE meta object) — they both construct `WeatherMeta` and now need the new field. These errors are expected and will be fixed in later tasks.

- [ ] **Step 3: Do NOT commit yet**

The typecheck errors are legitimate — don't paper over them. They'll be fixed as part of Task 4 (normalizer) and surface-tested in Task 7 (routes). Commit only once those tasks make typecheck clean again.

---

## Task 2: Config plumbing for `stationOverride`

**Files:**
- Modify: `server/config.ts`

- [ ] **Step 1: Add optional field to `SkyFrameLocationConfig`**

In [server/config.ts](server/config.ts) at the `SkyFrameLocationConfig` interface (around line 23), add the field. It's optional for backwards compat with existing `skyframe.config.json` files from v1.2.2:

```typescript
export interface SkyFrameLocationConfig {
  lat: number;
  lon: number;
  email: string;
  forecastOffice: string;
  gridX: number;
  gridY: number;
  timezone: string;
  forecastZone: string;
  stationPrimary: string;
  stationFallback: string;
  locationName: string;
  updateCheckEnabled?: boolean;
  stationOverride?: 'auto' | 'force-secondary';  // optional for backwards compat; defaults to 'auto'
}
```

- [ ] **Step 2: Export `loadSavedConfig`**

Currently `loadSavedConfig` is module-private. Change `function loadSavedConfig()` to `export function loadSavedConfig()` so `routes.ts` can call it when handling `POST /api/station-override`.

- [ ] **Step 3: Expose `stationOverride` on the runtime `CONFIG` object**

In the `buildConfig` return object (around line 67), add a top-level `stationOverride` field. Place it after `updateCheckEnabled` at the bottom:

```typescript
  return {
    configured,
    email: email ?? '',
    // ... existing fields unchanged ...
    updateCheckEnabled,
    stationOverride: (saved?.stationOverride ?? 'auto') as 'auto' | 'force-secondary',
  };
}
```

The cast is because `saved?.stationOverride` is typed as `'auto' | 'force-secondary' | undefined`, and `?? 'auto'` narrows it — but TypeScript's inference loses the literal type across the coalesce without the assertion.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: still errors from Task 1 (they'll persist until Task 4), but `config.ts` itself compiles cleanly. If config.ts has a new error, fix it before proceeding.

- [ ] **Step 5: Do NOT commit yet**

Combined with Tasks 3-4 below into one server-plumbing commit.

---

## Task 3: `fetchObservationsWithFallback` honors the override — TDD

**Files:**
- Modify: `server/nws/normalizer.ts`
- Modify: `server/nws/normalizer.test.ts`

- [ ] **Step 1: Write the failing test**

Open [server/nws/normalizer.test.ts](server/nws/normalizer.test.ts). Locate the fallback test block near line 248 ("falls back to KRAC when KMKE observation is older than 90 minutes"). Add this new test *immediately after* it, inside the same `describe('normalizeWeather', ...)`:

```typescript
  it('reads from KRAC without touching KMKE when stationOverride is force-secondary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T19:30:00+00:00'));

    // Mutate CONFIG.stationOverride via cast — matches the pattern used by the
    // CONFIG.debug.injectTiers tests further down this file.
    const configMut = CONFIG as { stationOverride: 'auto' | 'force-secondary' };
    const originalOverride = configMut.stationOverride;
    configMut.stationOverride = 'force-secondary';

    try {
      const calledPaths: string[] = [];
      vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
        calledPaths.push(path);
        if (path.includes('/points/')) return FIXTURE_POINT as never;
        if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
        if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
        if (path.includes('KRAC/observations/latest')) return FIXTURE_OBS_LATEST as never;
        if (path.includes('KRAC/observations')) return FIXTURE_OBS_HISTORY as never;
        if (path.includes('/alerts/active')) return { features: [] } as never;
        throw new Error('Unexpected path: ' + path);
      });

      const result = await normalizeWeather();

      // KMKE must never be queried
      expect(calledPaths.some((p) => p.includes('KMKE'))).toBe(false);
      // Result reflects the pinned station
      expect(result.meta.stationId).toBe('KRAC');
      expect(result.current.stationId).toBe('KRAC');
      // `error: 'station_fallback'` is for auto-fallback only — not for user pins
      expect(result.meta.error).not.toBe('station_fallback');
      // And the new meta field reflects the pin
      expect(result.meta.stationOverride).toBe('force-secondary');
    } finally {
      configMut.stationOverride = originalOverride;
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- normalizer.test.ts -t "reads from KRAC without touching KMKE"`
Expected: FAIL — either because the test calls `CONFIG.stationOverride` which doesn't exist yet at runtime shape (it does exist from Task 2), OR because `fetchObservationsWithFallback` still calls `KMKE/observations/latest` and the test asserts it doesn't, OR because `meta.stationOverride` isn't populated. Likely all three in that order as the test progresses.

- [ ] **Step 3: Modify `fetchObservationsWithFallback` to honor the override**

In [server/nws/normalizer.ts](server/nws/normalizer.ts), locate the `ObsFetchResult` interface around line 164. Add a `pinned` field:

```typescript
interface ObsFetchResult {
  obsLatest: NwsObsResponse;
  obsHistory: NwsObsListResponse;
  stationId: string;
  fellBack: boolean;
  pinned: boolean;
}
```

Then modify `fetchObservationsWithFallback` (around line 180). Add the override short-circuit at the top, before the primary try/catch:

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

  try {
    const primaryLatest = await fetchNws<NwsObsResponse>(
      `/stations/${stations.primary}/observations/latest`,
    );
    if (isObservationUsable(primaryLatest.properties, now)) {
      const primaryHistory = await fetchNws<NwsObsListResponse>(
        `/stations/${stations.primary}/observations?limit=6`,
      );
      return {
        obsLatest: primaryLatest,
        obsHistory: primaryHistory,
        stationId: stations.primary,
        fellBack: false,
        pinned: false,
      };
    }
  } catch {
    // Swallow; fall through to secondary
  }

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
    fellBack: true,
    pinned: false,
  };
}
```

Note the `pinned: false` added to the two existing return statements — it must be present on every path because `ObsFetchResult` made it required.

- [ ] **Step 4: Wire `meta.stationOverride` through `normalizeWeather`**

Still in [server/nws/normalizer.ts](server/nws/normalizer.ts), find the `normalizeWeather` function (around line 259). Locate the `obsResult` destructure (around line 275). Extend it to include `pinned`:

```typescript
  const { obsLatest, obsHistory, stationId: activeStationId, fellBack, pinned } = obsResult;
```

Then modify the `meta` object (around line 321). Add `stationOverride` to the returned meta:

```typescript
  const meta = {
    fetchedAt: now.toISOString(),
    nextRefreshAt: new Date(now.getTime() + CONFIG.cache.observationMs).toISOString(),
    cacheHit: false,
    stationId: activeStationId,
    locationName: CONFIG.location.name,
    stationOverride: pinned ? ('force-secondary' as const) : ('auto' as const),
    forecastGeneratedAt: forecast.properties.generatedAt,
    ...(metaError ? { error: metaError } : {}),
  };
```

Keep `metaError` derivation exactly as it is — `fellBack` is false when `pinned` is true, so `station_fallback` won't fire for pinned responses. This is intentional per the spec.

- [ ] **Step 5: Run the new test**

Run: `npm test -- normalizer.test.ts -t "reads from KRAC without touching KMKE"`
Expected: PASS

- [ ] **Step 6: Run the full normalizer test file to confirm no regressions**

Run: `npm test -- normalizer.test.ts`
Expected: ALL PASS (especially the existing fallback test at "falls back to KRAC when KMKE observation is older than 90 minutes")

- [ ] **Step 7: Run full typecheck**

Run: `npm run typecheck`
Expected: `routes.test.ts` may still show an error for the `FIXTURE_RESPONSE.meta` missing `stationOverride`. That's fixed in Task 7. Everything else should pass.

- [ ] **Step 8: Commit the server plumbing**

```bash
git add shared/types.ts server/config.ts server/nws/normalizer.ts server/nws/normalizer.test.ts
git commit -m "$(cat <<'EOF'
Add stationOverride plumbing to server + normalizer

WeatherMeta gains a required stationOverride: 'auto' | 'force-secondary'
field so the client can render [PIN] without a second round-trip.
SkyFrameLocationConfig gains the optional field (defaults to 'auto').
fetchObservationsWithFallback honors the override by short-circuiting to
the secondary station without touching the primary; meta.error is NOT set
to 'station_fallback' for pinned responses since it's not an automatic
fallback. loadSavedConfig is now exported for the upcoming endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `summarizeStation` helper — TDD

**Files:**
- Create: `server/nws/station-preview.ts`
- Create: `server/nws/station-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Create [server/nws/station-preview.test.ts](server/nws/station-preview.test.ts):

```typescript
import { describe, it, expect } from 'vitest';
import { summarizeStation } from './station-preview';

const LIVE_OBS = {
  properties: {
    timestamp: '2026-04-20T14:25:00+00:00',
    temperature: { value: 16.7, unitCode: 'wmoUnit:degC' },
    dewpoint: { value: 9.4, unitCode: 'wmoUnit:degC' },
    windSpeed: { value: 19.3, unitCode: 'wmoUnit:km_h-1' },
    windDirection: { value: 315, unitCode: 'wmoUnit:degree_(angle)' },
    barometricPressure: { value: 101999, unitCode: 'wmoUnit:Pa' },
    visibility: { value: 16093, unitCode: 'wmoUnit:m' },
    relativeHumidity: { value: 64, unitCode: 'wmoUnit:percent' },
    heatIndex: { value: null },
    windChill: { value: null },
    textDescription: 'Mostly Cloudy',
    icon: 'https://api.weather.gov/icons/land/day/bkn?size=medium',
  },
};

describe('summarizeStation', () => {
  const now = new Date('2026-04-20T14:30:00+00:00');

  it('returns status: live for a recent observation', () => {
    const result = summarizeStation('KMKE', { status: 'fulfilled', value: LIVE_OBS }, now);
    expect(result).toEqual({
      stationId: 'KMKE',
      observedAt: '2026-04-20T14:25:00+00:00',
      tempF: 62,
      status: 'live',
    });
  });

  it('returns status: stale for an observation older than 90 minutes', () => {
    const staleObs = {
      properties: {
        ...LIVE_OBS.properties,
        timestamp: '2026-04-20T12:00:00+00:00',  // 2.5 hours ago
      },
    };
    const result = summarizeStation('KMKE', { status: 'fulfilled', value: staleObs }, now);
    expect(result.status).toBe('stale');
    expect(result.tempF).toBe(62);  // temp still returned even when stale
  });

  it('returns status: error when the fetch promise rejected', () => {
    const result = summarizeStation('KMKE', { status: 'rejected', reason: new Error('boom') }, now);
    expect(result).toEqual({
      stationId: 'KMKE',
      observedAt: null,
      tempF: null,
      status: 'error',
    });
  });

  it('returns tempF: null when the observation has a null temperature', () => {
    const nullTempObs = {
      properties: {
        ...LIVE_OBS.properties,
        temperature: { value: null, unitCode: 'wmoUnit:degC' },
      },
    };
    const result = summarizeStation('KMKE', { status: 'fulfilled', value: nullTempObs }, now);
    expect(result.tempF).toBeNull();
    expect(result.status).toBe('live');  // null temp doesn't degrade status
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- station-preview.test.ts`
Expected: FAIL — `Cannot find module './station-preview'` (the file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create [server/nws/station-preview.ts](server/nws/station-preview.ts):

```typescript
// Small helper used by GET /api/stations/preview. Shares the staleness
// threshold with fetchObservationsWithFallback in normalizer.ts, but is
// intentionally decoupled — this endpoint is diagnostic/UI-facing and has
// different latency tolerances than the main weather path.

const STALENESS_MS = 90 * 60 * 1000;  // 90 minutes — matches CONFIG.stations.stalenessMinutes

// Narrow structural type — matches the subset of NwsObsResponse we read.
interface ObsLike {
  properties: {
    timestamp: string;
    temperature: { value: number | null };
  };
}

export interface StationSummary {
  stationId: string;
  observedAt: string | null;
  tempF: number | null;
  status: 'live' | 'stale' | 'error';
}

const cToF = (c: number | null): number | null =>
  c == null ? null : Math.round(c * 9 / 5 + 32);

export function summarizeStation(
  stationId: string,
  result: PromiseSettledResult<ObsLike>,
  now: Date,
): StationSummary {
  if (result.status === 'rejected') {
    return { stationId, observedAt: null, tempF: null, status: 'error' };
  }

  const props = result.value.properties;
  const ageMs = now.getTime() - Date.parse(props.timestamp);
  const status: 'live' | 'stale' = ageMs > STALENESS_MS ? 'stale' : 'live';

  return {
    stationId,
    observedAt: props.timestamp,
    tempF: cToF(props.temperature.value),
    status,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test -- station-preview.test.ts`
Expected: ALL 4 PASS

- [ ] **Step 5: Do NOT commit yet**

Combined with the `/api/stations/preview` endpoint (Task 6) into one commit.

---

## Task 5: `POST /api/station-override` endpoint — TDD

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/routes.test.ts`

- [ ] **Step 1: Add fixture FIXTURE_RESPONSE.meta update + write failing tests**

Open [server/routes.test.ts](server/routes.test.ts). First, fix the `FIXTURE_RESPONSE.meta` object to include the new field (needed for typecheck since Task 1):

Find the `meta:` block around line 29 and add `stationOverride: 'auto' as const,`:

```typescript
  meta: {
    fetchedAt: '2026-04-15T19:25:00Z',
    nextRefreshAt: '2026-04-15T19:26:30Z',
    cacheHit: false,
    stationId: 'KMKE',
    locationName: 'TEST LOCATION',
    stationOverride: 'auto' as const,
    forecastGeneratedAt: '2026-04-15T13:30:00Z',
  },
```

Then, at the bottom of the file (after the last existing `describe` block closes), add a new describe:

```typescript
describe('POST /api/station-override', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('returns 400 for an invalid mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/station-override',
      payload: { mode: 'nonsense' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_input' });
  });

  it('returns 503 when server is not configured', async () => {
    // CONFIG.configured is false in the test env (no .env, no skyframe.config.json)
    const res = await app.inject({
      method: 'POST',
      url: '/api/station-override',
      payload: { mode: 'force-secondary' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'not_configured' });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npm test -- routes.test.ts -t "POST /api/station-override"`
Expected: FAIL — the route doesn't exist, Fastify will return 404 rather than the expected 400/503.

- [ ] **Step 3: Implement the endpoint**

Open [server/routes.ts](server/routes.ts). Update the import to include `loadSavedConfig`:

```typescript
import { CONFIG, reloadConfig, saveSkyFrameConfig, loadSavedConfig } from './config';
```

Add the new route inside `registerRoutes`, after the `/api/setup` handler (after line 98, before the closing `}` of `registerRoutes`):

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

    const saved = loadSavedConfig();
    if (!saved) {
      reply.code(500);
      return { error: 'config_missing', message: 'skyframe.config.json not found despite configured state' };
    }
    saveSkyFrameConfig({ ...saved, stationOverride: mode });
    reloadConfig();
    cache.clear();  // invalidate weather cache so the flip takes effect immediately

    app.log.info(`Station override set to ${mode}`);
    return { success: true as const };
  });
```

- [ ] **Step 4: Run tests**

Run: `npm test -- routes.test.ts -t "POST /api/station-override"`
Expected: BOTH PASS (invalid mode → 400, not_configured → 503)

- [ ] **Step 5: Do NOT commit yet**

Combined with Task 6.

---

## Task 6: `GET /api/stations/preview` endpoint — TDD

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/routes.test.ts`

- [ ] **Step 1: Write failing tests**

In [server/routes.test.ts](server/routes.test.ts), add the imports at the top (merge with existing imports if already imported):

```typescript
import * as client from './nws/client';
```

Add this `describe` after the `POST /api/station-override` describe:

```typescript
describe('GET /api/stations/preview', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('returns 503 when server is not configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations/preview' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'not_configured' });
  });
});
```

Note: we can't easily test the happy path without mocking `CONFIG.configured = true` AND `fetchNws`. The server test env doesn't have `.env` or `skyframe.config.json`, so the unconfigured-503 path is the only one fully testable at this level. Happy-path coverage lives in the `summarizeStation` unit tests (Task 4) plus manual validation (Task 11).

- [ ] **Step 2: Run test to confirm failure**

Run: `npm test -- routes.test.ts -t "GET /api/stations/preview"`
Expected: FAIL — 404 instead of 503.

- [ ] **Step 3: Implement the endpoint**

In [server/routes.ts](server/routes.ts), update imports to include the helper and the fetch wrapper:

```typescript
import { fetchNws } from './nws/client';
import { summarizeStation, type StationSummary } from './nws/station-preview';
```

Add the new route after `POST /api/station-override`:

```typescript
  interface NwsObsResponse {
    properties: {
      timestamp: string;
      temperature: { value: number | null };
    };
  }

  app.get<{
    Reply: { primary: StationSummary; fallback: StationSummary } | ErrorReply;
  }>('/api/stations/preview', async (_req, reply) => {
    if (!CONFIG.configured) {
      reply.code(503);
      return { error: 'not_configured', message: 'Location not set.' };
    }

    const { primary, fallback } = CONFIG.stations;
    const now = new Date();
    const [primaryResult, fallbackResult] = await Promise.allSettled([
      fetchNws<NwsObsResponse>(`/stations/${primary}/observations/latest`),
      fetchNws<NwsObsResponse>(`/stations/${fallback}/observations/latest`),
    ]);

    return {
      primary: summarizeStation(primary, primaryResult, now),
      fallback: summarizeStation(fallback, fallbackResult, now),
    };
  });
```

- [ ] **Step 3: Run all route tests**

Run: `npm test -- routes.test.ts`
Expected: ALL PASS (the new 503 test plus all pre-existing tests).

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: ALL PASS (260+ existing tests plus 5 new ones: 1 override test in normalizer.test + 4 in station-preview.test + 1 route test for POST + 1 route test for GET — 7 new tests total). The exact count is not critical; what matters is zero failures.

- [ ] **Step 5: Commit the endpoint + helper**

```bash
git add server/nws/station-preview.ts server/nws/station-preview.test.ts server/routes.ts server/routes.test.ts
git commit -m "$(cat <<'EOF'
Add POST /api/station-override and GET /api/stations/preview

POST /api/station-override persists the override to skyframe.config.json,
reloads config, and clears the weather cache so the flip applies on the
next poll rather than after the 90s TTL. Returns 503 when server is not
yet configured, 400 for invalid mode.

GET /api/stations/preview uses Promise.allSettled to fetch latest
observations from both primary and fallback stations in parallel, then
maps each result to a small StationSummary via summarizeStation
(new server/nws/station-preview.ts). Powers the popover's side-by-side
comparison rows so users can see both stations' current readings before
committing to a switch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extend `GET /api/config` to include `stationOverride`

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Update `/api/config` configured-branch response**

In [server/routes.ts](server/routes.ts), locate the `/api/config` handler (lines 14–29). Add `stationOverride` to the configured branch:

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
      timezone: CONFIG.nws.timezone,
      stationOverride: CONFIG.stationOverride,
      stationPrimary: CONFIG.stations.primary,
      stationFallback: CONFIG.stations.fallback,
    };
  });
```

The client needs `stationPrimary` and `stationFallback` to render the radio labels (e.g., `FORCE KRAC`) without waiting for the first `/api/weather` response — otherwise the popover is empty on first open right after page load.

- [ ] **Step 2: Run tests**

Run: `npm test -- routes.test.ts`
Expected: ALL PASS (no test changes needed — the existing `/api/config` tests check the `configured: false` branch which is unchanged, and the new fields are additive on the `true` branch).

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "$(cat <<'EOF'
Extend /api/config with stationOverride + station IDs

Client needs these on first paint so the Footer can render [PIN] and
the popover can label its radio options ('FORCE KRAC') without waiting
for the first /api/weather poll. Additive-only change; the unconfigured
branch is untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `StationPopover.tsx` component + CSS

**Files:**
- Create: `client/components/StationPopover.tsx`
- Modify: `client/styles/hud.css`

- [ ] **Step 1: Create the popover component**

Create [client/components/StationPopover.tsx](client/components/StationPopover.tsx):

```typescript
import { useEffect, useRef, useState } from 'react';

export type StationOverrideMode = 'auto' | 'force-secondary';

interface StationSummary {
  stationId: string;
  observedAt: string | null;
  tempF: number | null;
  status: 'live' | 'stale' | 'error';
}

interface PreviewResponse {
  primary: StationSummary;
  fallback: StationSummary;
}

interface StationPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  currentMode: StationOverrideMode;
  primaryStationId: string;
  fallbackStationId: string;
  timezone: string | null;
  onChange: (mode: StationOverrideMode) => Promise<void>;
  onClose: () => void;
}

function formatObservedAt(iso: string | null, tz: string | null): string {
  if (!iso) return '--:--';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}`;
}

export function StationPopover({
  anchorRef,
  currentMode,
  primaryStationId,
  fallbackStationId,
  timezone,
  onChange,
  onClose,
}: StationPopoverProps) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<StationOverrideMode>(currentMode);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Compute popover position from anchor on mount. Anchored above the Footer link.
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8,  // 8px gap above the link
    });
  }, [anchorRef]);

  // Fetch preview on mount.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stations/preview')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: PreviewResponse) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc + outside-click dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      const popover = popoverRef.current;
      const anchor = anchorRef.current;
      if (!popover) return;
      const target = e.target as Node;
      if (popover.contains(target)) return;
      if (anchor && anchor.contains(target)) return;  // clicking anchor is handled by Footer
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose, anchorRef]);

  const handleSelect = async (mode: StationOverrideMode) => {
    if (submitting || mode === selectedMode) return;
    setSelectedMode(mode);
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onChange(mode);
      onClose();
    } catch (err) {
      setSelectedMode(currentMode);  // rollback
      setSubmitError((err as Error).message || 'Override failed');
      setSubmitting(false);
    }
  };

  const renderRow = (s: StationSummary) => (
    <div className="station-popover-row" data-status={s.status} key={s.stationId}>
      <span>{s.stationId}</span>
      <span>{formatObservedAt(s.observedAt, timezone)}</span>
      <span>{s.tempF != null ? `${s.tempF}°F` : '—'}</span>
      <span>({s.status})</span>
    </div>
  );

  if (!position) return null;

  return (
    <div
      ref={popoverRef}
      className="station-popover"
      data-override={currentMode === 'force-secondary' ? 'true' : 'false'}
      style={{ left: position.left, bottom: position.bottom }}
      role="dialog"
      aria-label="Station source"
    >
      <div className="station-popover-title">STATION SOURCE</div>

      <label className="station-popover-radio">
        <input
          type="radio"
          name="station-override"
          value="auto"
          checked={selectedMode === 'auto'}
          disabled={submitting}
          onChange={() => handleSelect('auto')}
        />
        {' '}AUTO — {primaryStationId}, fallback to {fallbackStationId}
      </label>

      <label className="station-popover-radio">
        <input
          type="radio"
          name="station-override"
          value="force-secondary"
          checked={selectedMode === 'force-secondary'}
          disabled={submitting}
          onChange={() => handleSelect('force-secondary')}
        />
        {' '}FORCE {fallbackStationId}
      </label>

      <div className="station-popover-divider">── PREVIEW ──</div>

      {previewError ? (
        <div className="station-popover-row" data-status="error">PREVIEW UNAVAILABLE</div>
      ) : preview ? (
        <>
          {renderRow(preview.primary)}
          {renderRow(preview.fallback)}
        </>
      ) : (
        <div className="station-popover-row" data-status="loading">
          <span>{primaryStationId}</span><span>--:--</span><span>—</span><span>(loading)</span>
        </div>
      )}

      {submitError && <div className="station-popover-error">▲ {submitError}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Append CSS to `hud.css`**

Open [client/styles/hud.css](client/styles/hud.css). Append this block at the end of the file:

```css

/* ============================================================
   STATION POPOVER + CLICKABLE FOOTER LINK
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
  position: fixed;
  width: 320px;
  background: #050a10;
  border: 1px solid var(--accent);
  padding: 14px 16px;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.12em;
  z-index: 100;
  color: var(--accent);
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
.station-popover-radio input {
  margin-right: 6px;
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
.station-popover-row[data-status="loading"] { opacity: 0.5; }
.station-popover-error {
  margin-top: 8px;
  color: #ff4444;
  font-size: 10px;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. No test coverage for this component (matches project posture — no RTL).

- [ ] **Step 4: Do NOT commit yet**

The popover is isolated until Footer (Task 9) wires it in. Combine into the client integration commit.

---

## Task 9: Wire up Footer + App.tsx

**Files:**
- Modify: `client/components/Footer.tsx`
- Modify: `client/App.tsx`

- [ ] **Step 1: Update `Footer.tsx` to be interactive**

Replace the entire contents of [client/components/Footer.tsx](client/components/Footer.tsx):

```typescript
import { useRef, useState } from 'react';
import type { WeatherMeta } from '../../shared/types';
import { StationPopover, type StationOverrideMode } from './StationPopover';

interface FooterProps {
  meta: WeatherMeta | null;
  error: string | null;
  nextRetryAt?: string | null;
  timezone: string | null;
  stationOverride: StationOverrideMode | null;
  primaryStationId: string | null;
  fallbackStationId: string | null;
  onOverrideChange: (mode: StationOverrideMode) => Promise<void>;
}

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

export function Footer({
  meta,
  error,
  nextRetryAt,
  timezone,
  stationOverride,
  primaryStationId,
  fallbackStationId,
  onOverrideChange,
}: FooterProps) {
  const offline = !!error || !meta;
  const autoFallback = !offline && meta.error === 'station_fallback';
  const pinned = stationOverride === 'force-secondary';
  const amber = autoFallback || pinned;

  const lastPull = formatHM(meta?.fetchedAt, timezone);
  const nextPull = error && nextRetryAt
    ? formatHM(nextRetryAt, timezone)
    : formatHM(meta?.nextRefreshAt, timezone);

  const dotClass = offline ? 'dot dot-error' : amber ? 'dot dot-fallback' : 'dot';
  const linkClass = amber ? 'footer-link footer-link-fallback' : 'footer-link';

  const linkRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const linkClickable = !offline && primaryStationId !== null && fallbackStationId !== null;
  const linkLabel = offline ? 'LINK.OFFLINE' : `LINK.${meta.stationId}`;

  const handleLinkClick = () => {
    if (!linkClickable) return;
    setPopoverOpen((v) => !v);
  };

  const handleOverrideChange = async (mode: StationOverrideMode) => {
    await onOverrideChange(mode);
  };

  return (
    <div className="hud-footer">
      <span className={dotClass}></span>
      <button
        ref={linkRef}
        type="button"
        className={`${linkClass} footer-link-button`}
        disabled={!linkClickable}
        onClick={handleLinkClick}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
      >
        {linkLabel}
      </button>
      {pinned && <span className="footer-link-pin">[PIN]</span>}
      &nbsp;·&nbsp; LAST PULL {lastPull} &nbsp;·&nbsp; NEXT {nextPull}

      {popoverOpen && linkClickable && stationOverride && primaryStationId && fallbackStationId && (
        <StationPopover
          anchorRef={linkRef}
          currentMode={stationOverride}
          primaryStationId={primaryStationId}
          fallbackStationId={fallbackStationId}
          timezone={timezone}
          onChange={handleOverrideChange}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Extend `App.tsx` state and Footer props**

Open [client/App.tsx](client/App.tsx). Make four changes:

**2a.** Add new state alongside the existing `timezone` state (around line 132):

```typescript
  const [stationOverride, setStationOverride] = useState<'auto' | 'force-secondary' | null>(null);
  const [primaryStationId, setPrimaryStationId] = useState<string | null>(null);
  const [fallbackStationId, setFallbackStationId] = useState<string | null>(null);
```

**2b.** Extend the `fetchConfig` handler (around line 144). Update the response type annotation and the setState calls:

```typescript
  const fetchConfig = () => {
    const seq = ++fetchConfigSeqRef.current;
    return fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: {
        configured: boolean;
        location?: string;
        email?: string;
        updateCheckEnabled?: boolean;
        timezone?: string;
        stationOverride?: 'auto' | 'force-secondary';
        stationPrimary?: string;
        stationFallback?: string;
      }) => {
        if (seq !== fetchConfigSeqRef.current) return;
        setConfigured(cfg.configured);
        setTimezone(cfg.timezone ?? null);
        setStationOverride(cfg.stationOverride ?? null);
        setPrimaryStationId(cfg.stationPrimary ?? null);
        setFallbackStationId(cfg.stationFallback ?? null);
        setSettingsInitial({
          location: cfg.location ?? '',
          email: cfg.email ?? '',
          updateCheckEnabled: cfg.updateCheckEnabled ?? false,
        });
        if (!cfg.configured) setShowSetup(true);
      })
      .catch(() => {
        if (seq !== fetchConfigSeqRef.current) return;
        setConfigured(false);
      });
  };
```

**2c.** Refactor the weather-polling `useEffect` so it exposes a manual refetch. Extract `fetchWeather` into a `useCallback` at component scope:

Replace the entire polling useEffect (around lines 173–213) with:

```typescript
  // Ref holding a cancel handle for the currently-scheduled next poll, so
  // handleOverrideChange can cancel and trigger an immediate refetch.
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCancelledRef = useRef(false);

  const fetchWeatherOnce = async () => {
    try {
      const res = await fetch('/api/weather');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WeatherResponse;
      if (pollCancelledRef.current) return;

      setData(json);
      setError(null);
      setNextRetryAt(null);

      const nextAt = Date.parse(json.meta.nextRefreshAt);
      const delay = Number.isFinite(nextAt)
        ? nextAt - Date.now() + REFRESH_BUFFER_MS
        : FALLBACK_REFRESH_MS;
      if (pollTimeoutRef.current !== null) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = setTimeout(fetchWeatherOnce, Math.max(1000, delay));
    } catch (e) {
      if (pollCancelledRef.current) return;
      setError((e as Error).message);
      setNextRetryAt(new Date(Date.now() + ERROR_RETRY_MS).toISOString());
      if (pollTimeoutRef.current !== null) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = setTimeout(fetchWeatherOnce, ERROR_RETRY_MS);
    }
  };

  useEffect(() => {
    if (!configured) return;
    pollCancelledRef.current = false;
    fetchWeatherOnce();
    return () => {
      pollCancelledRef.current = true;
      if (pollTimeoutRef.current !== null) clearTimeout(pollTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);
```

**2d.** Add the override handler above the JSX return (near `toggleUnits`, around line 389):

```typescript
  const handleStationOverrideChange = async (mode: 'auto' | 'force-secondary') => {
    const res = await fetch('/api/station-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({ message: `HTTP ${res.status}` }))).message;
      throw new Error(msg);
    }
    setStationOverride(mode);
    // Trigger immediate refetch so the data updates without waiting for the
    // next scheduled poll (up to 90s away otherwise).
    await fetchWeatherOnce();
  };
```

**2e.** Update the `<Footer />` invocation at the bottom of the render (line 480). Replace with:

```tsx
      <Footer
        meta={data?.meta ?? null}
        error={error}
        nextRetryAt={nextRetryAt}
        timezone={timezone}
        stationOverride={stationOverride}
        primaryStationId={primaryStationId}
        fallbackStationId={fallbackStationId}
        onOverrideChange={handleStationOverrideChange}
      />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS for both server and client configs.

- [ ] **Step 4: Test the full suite**

Run: `npm test`
Expected: ALL PASS. No new test changes — client components have no RTL coverage.

- [ ] **Step 5: Manual validation**

Start the dev server pair:

Terminal 1: `npm run server`
Terminal 2: `npm run dev`

Open http://localhost:5173.

Validate:
- Footer shows `LINK.KMKE` (or your configured primary) in cyan with a cyan dot
- Click `LINK.KMKE` → popover opens above the Footer link
- Within ~500ms, preview rows populate with both stations' current temps
- Click `FORCE KRAC` radio → popover closes within 1–2s; Footer shows `LINK.KRAC [PIN]` in amber; CurrentPanel updates to KRAC's readings
- Click `LINK.KRAC [PIN]` → popover reopens with FORCE radio selected
- Click `AUTO` radio → Footer returns to cyan `LINK.KMKE`
- Reload the page while override is active → Footer still shows `LINK.KRAC [PIN]` (persistence check)
- Press Esc while popover is open → popover closes
- Click outside the popover → popover closes

- [ ] **Step 6: Build a production bundle (per user's verification pattern)**

Run: `npm run build`
Expected: successful Vite build into `dist/client/`.

Run: `npm run start:prod` (or restart the running server if already on the prod bundle) and re-validate the manual checks above against the prod bundle.

- [ ] **Step 7: Commit the client integration**

```bash
git add client/components/StationPopover.tsx client/components/Footer.tsx client/App.tsx client/styles/hud.css
git commit -m "$(cat <<'EOF'
Add StationPopover + wire Footer and App.tsx

Footer LINK.XXXX becomes a real button; clicking opens StationPopover
anchored above the Footer. Popover fetches /api/stations/preview on
mount and shows a side-by-side radio + current-reading comparison.
Selecting FORCE SECONDARY POSTs /api/station-override and triggers an
immediate weather refetch so the flip applies without waiting for the
next scheduled poll. [PIN] suffix + amber link color flag the manual
state so the user can't forget the override is on.

App.tsx refactors the polling useEffect into a reusable fetchWeatherOnce
so the override handler can force an immediate refetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Version bump + documentation

**Files:**
- Modify: `package.json`
- Modify: `PROJECT_STATUS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version in `package.json`**

Open [package.json](package.json). Change `"version": "1.2.2"` to `"version": "1.2.3"`.

- [ ] **Step 2: Update `PROJECT_STATUS.md`**

Open [PROJECT_STATUS.md](PROJECT_STATUS.md). Change the top header:

```markdown
**Last updated:** 2026-04-20 (v1.2.3)
```

Under `## What's shipped`, add a new subsection right after `### v1.2.2`:

```markdown
### v1.2.3
- Force-fallback station override: Footer `LINK.XXXX` is now a clickable button that opens a HUD-styled popover with AUTO / FORCE SECONDARY radios and a live side-by-side preview of both stations' current readings. Persisted in `skyframe.config.json`. When active, Footer renders in amber with a `[PIN]` suffix. Solves the "primary station is up but reporting physically impossible values during a storm" scenario that the automatic staleness check can't catch.
```

Under `## Implemented features`, at the end of the file, add:

```markdown
### Force fallback station (v1.2.3)
- New `StationPopover` component anchored to the Footer `LINK.XXXX` button. Displays AUTO / FORCE SECONDARY radios + live preview rows for both primary and fallback stations (ID, observed time, temp, live/stale/error status). Preview data fetched on popover open via `GET /api/stations/preview` (parallel `Promise.allSettled` to both stations).
- `POST /api/station-override` persists the mode to `skyframe.config.json`, clears the weather cache, and returns 200. `App.tsx` triggers an immediate `/api/weather` refetch after a successful override change so the UI updates without waiting for the 90s poll cycle.
- Footer renders `LINK.KRAC [PIN]` in amber when the override is active; distinguishes from the pre-existing auto-fallback amber state via the `[PIN]` text marker. Same amber color space is reused intentionally — both states mean "not on primary station."
- `fetchObservationsWithFallback` in `server/nws/normalizer.ts` short-circuits to the fallback station when `CONFIG.stationOverride === 'force-secondary'`, without issuing any primary-station requests. `meta.error` is NOT set to `'station_fallback'` for pinned responses — the two fields are orthogonal.
- `WeatherMeta.stationOverride` added (`'auto' | 'force-secondary'`, always present) so the client can render `[PIN]` without a second round-trip.
```

- [ ] **Step 3: Update `CLAUDE.md` "Station fallback" paragraph**

Open [CLAUDE.md](CLAUDE.md). Find the "Station fallback" line (under "NWS endpoints"):

```markdown
**Station fallback:** when the primary station's latest observation is older than ~90 min or has null core fields, the server falls back to the secondary station configured in `.env`.
```

Append a second sentence:

```markdown
**Station fallback:** when the primary station's latest observation is older than ~90 min or has null core fields, the server falls back to the secondary station configured in `.env`. The user can also manually pin to the secondary by clicking the `LINK.XXXX` button in the Footer — useful when the primary is responding but reporting physically impossible values (a scenario the automatic staleness check can't catch).
```

- [ ] **Step 4: Run full test suite one more time**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json PROJECT_STATUS.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Bump to v1.2.3 + document force-fallback feature

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Open PR

**Files:** none

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/force-fallback-station`
Expected: branch published to GitHub.

- [ ] **Step 2: Create PR via `gh`**

```bash
gh pr create --title "v1.2.3: Force fallback station override" --body "$(cat <<'EOF'
## Summary
- Adds user-triggered override that pins the dashboard to the secondary station, bypassing auto-fallback logic
- Clickable `LINK.XXXX` in the Footer opens a HUD-styled popover with AUTO / FORCE SECONDARY radios and a live side-by-side preview of both stations' current readings
- Motivated by a real scenario: KMKE reported 0°F mid-storm on 2026-04-18 while still technically responsive, so the existing staleness check couldn't catch it

## Test plan
- [ ] `npm test` passes (includes new `station-preview.test.ts` + new tests in `normalizer.test.ts` and `routes.test.ts`)
- [ ] `npm run typecheck` passes (both server + client configs)
- [ ] Manual: click `LINK.KMKE` in Footer, verify popover opens with both stations' preview rows
- [ ] Manual: select FORCE SECONDARY, verify Footer shows `LINK.KRAC [PIN]` in amber and CurrentPanel updates to KRAC's readings within ~2s (immediate refetch, not 90s TTL)
- [ ] Manual: reload page with override active → `[PIN]` persists
- [ ] Manual: Esc + outside-click both dismiss the popover
- [ ] Manual: build prod bundle (`npm run build && npm run start:prod`) and re-validate

Spec: [docs/superpowers/specs/2026-04-20-force-fallback-station-design.md](docs/superpowers/specs/2026-04-20-force-fallback-station-design.md)
Plan: [docs/superpowers/plans/2026-04-20-force-fallback-station.md](docs/superpowers/plans/2026-04-20-force-fallback-station.md)
EOF
)"
```

- [ ] **Step 3: Report PR URL to user**

Copy the URL `gh pr create` prints and paste it into the conversation.

---

## Self-Review Notes

This plan covers each section of the spec:

| Spec section | Task(s) |
|---|---|
| Config shape (`stationOverride` in `SkyFrameLocationConfig`) | Task 2 |
| `fetchObservationsWithFallback` honors override | Task 3 |
| `meta.stationOverride` on WeatherResponse | Tasks 1 + 3 |
| `POST /api/station-override` | Task 5 |
| `GET /api/stations/preview` + `summarizeStation` | Tasks 4 + 6 |
| `/api/config` extension | Task 7 |
| `StationPopover.tsx` component | Task 8 |
| Footer interactive + `[PIN]` marker | Task 9 |
| App.tsx wiring + immediate refetch | Task 9 |
| CSS additions | Task 8 |
| Version bump + docs | Task 10 |
| Ship path (PR-based) | Task 11 |

Testing approach:
- Server unit tests: `normalizer.test.ts` (override path + fallback regression), `station-preview.test.ts` (helper), `routes.test.ts` (endpoint 400/503 paths)
- Happy-path routes tests intentionally skipped — the existing test suite doesn't mock `CONFIG.configured=true`, and adding that scaffolding isn't justified for this feature's scope
- Client component tests: none (project posture — no RTL/jsdom)
- Manual validation: Task 9, Step 5 — covers the full flow end-to-end

Edge cases from the spec that are handled by the implementation:
- Primary recovers mid-override → no auto-revert (by design; only user clears the pin)
- Preview fetch fails → popover shows "PREVIEW UNAVAILABLE", radios still work
- `/api/station-override` fails → popover shows inline error, radios re-enable, selection rolls back
- Rapid toggles → each request serializes via synchronous `saveSkyFrameConfig`; cache clears every time; last one wins
- First-run with no override set → `loadSavedConfig()?.stationOverride ?? 'auto'` handles backwards compat
