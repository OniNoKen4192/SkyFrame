# Settings Modal + GitHub Update Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1.2.1 — refactor `LocationSetup` into a general-purpose `Settings` modal reachable from a TopBar hamburger, and add a server-side GitHub release check (opt-in via a checkbox in Settings) that surfaces new releases as a dismissible advisory alert.

**Architecture:** Server gains a `server/updates/` module with pure helpers + an imperative orchestrator that schedules at startup + local midnight. Config gains `updateCheckEnabled: boolean`; `/api/setup` accepts it, `/api/config` returns it. Normalizer injects a synthetic Alert into the alert list when the cache is non-null. Client renames `LocationSetup` → `Settings`, expands the form with the checkbox + a cosmetic-skin placeholder, and adds a hamburger trigger in the TopBar.

**Tech Stack:** TypeScript, Node 20 fetch for GitHub, Vitest (node env) for pure helpers + mocked orchestrator, React 18 for client.

**Design spec:** [`docs/superpowers/specs/2026-04-19-settings-and-updates-design.md`](../specs/2026-04-19-settings-and-updates-design.md)

**Branch:** `feat/settings-and-updates` (already created off `main`).

---

## Pre-work checklist

- [ ] On branch `feat/settings-and-updates`: run `git branch --show-current`, expect `feat/settings-and-updates`
- [ ] Working tree clean: run `git status`, expect `nothing to commit, working tree clean`
- [ ] Tests green: run `npm test`, expect 228 passing
- [ ] Typecheck green: run `npm run typecheck`, expect no errors

---

## Task 1: `github-release.ts` pure helpers + unit tests

**Files:**
- Create: `server/updates/github-release.ts`
- Create: `server/updates/github-release.test.ts`

### Steps

- [ ] **Step 1.1: Write the failing test file**

Create `server/updates/github-release.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseVersion, compareVersions, parseReleaseResponse } from './github-release';

describe('parseVersion', () => {
  it('parses "v1.2.3" into { major: 1, minor: 2, patch: 3 }', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  it('parses "1.2.3" without the v prefix', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  it('parses "1.2" with default patch 0', () => {
    expect(parseVersion('1.2')).toEqual({ major: 1, minor: 2, patch: 0 });
  });
  it('parses "0.0.1"', () => {
    expect(parseVersion('0.0.1')).toEqual({ major: 0, minor: 0, patch: 1 });
  });
  it('returns null for empty string', () => {
    expect(parseVersion('')).toBeNull();
  });
  it('returns null for non-numeric', () => {
    expect(parseVersion('abc')).toBeNull();
  });
  it('returns null when components are non-numeric', () => {
    expect(parseVersion('1.a.b')).toBeNull();
  });
  it('returns null for four-segment versions', () => {
    expect(parseVersion('1.2.3.4')).toBeNull();
  });
});

describe('compareVersions', () => {
  const v = (s: string) => parseVersion(s)!;
  it('returns negative when a.major < b.major', () => {
    expect(compareVersions(v('1.0.0'), v('2.0.0'))).toBeLessThan(0);
  });
  it('returns positive when a.major > b.major', () => {
    expect(compareVersions(v('2.0.0'), v('1.0.0'))).toBeGreaterThan(0);
  });
  it('returns negative on minor boundary', () => {
    expect(compareVersions(v('1.1.0'), v('1.2.0'))).toBeLessThan(0);
  });
  it('returns positive on minor boundary', () => {
    expect(compareVersions(v('1.2.0'), v('1.1.0'))).toBeGreaterThan(0);
  });
  it('returns negative on patch boundary', () => {
    expect(compareVersions(v('1.2.3'), v('1.2.4'))).toBeLessThan(0);
  });
  it('returns positive on patch boundary', () => {
    expect(compareVersions(v('1.2.4'), v('1.2.3'))).toBeGreaterThan(0);
  });
  it('returns 0 for identical versions', () => {
    expect(compareVersions(v('1.2.3'), v('1.2.3'))).toBe(0);
  });
});

describe('parseReleaseResponse', () => {
  it('returns a GitHubRelease on a valid payload', () => {
    const raw = {
      tag_name: 'v1.3.0',
      html_url: 'https://github.com/owner/repo/releases/tag/v1.3.0',
      body: 'Release notes here.',
      published_at: '2026-04-20T12:00:00Z',
    };
    expect(parseReleaseResponse(raw)).toEqual({
      tagName: 'v1.3.0',
      htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.3.0',
      body: 'Release notes here.',
      publishedAt: '2026-04-20T12:00:00Z',
    });
  });
  it('returns null when tag_name is missing', () => {
    expect(parseReleaseResponse({ html_url: 'x', body: 'y', published_at: 'z' })).toBeNull();
  });
  it('returns null when input is not an object', () => {
    expect(parseReleaseResponse('not an object')).toBeNull();
    expect(parseReleaseResponse(null)).toBeNull();
  });
  it('returns null when a field is the wrong type', () => {
    expect(parseReleaseResponse({ tag_name: 123, html_url: 'x', body: 'y', published_at: 'z' })).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run tests — expect FAIL**

Run: `npm test -- server/updates/github-release.test.ts`
Expected: FAIL with "Cannot find module './github-release'" — the implementation file doesn't exist yet.

- [ ] **Step 1.3: Create the implementation**

Create `server/updates/github-release.ts`:

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

const VERSION_RE = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/;

export function parseVersion(raw: string): ParsedVersion | null {
  const match = VERSION_RE.exec(raw.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] !== undefined ? Number(match[3]) : 0,
  };
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

export function parseReleaseResponse(raw: unknown): GitHubRelease | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isString(r.tag_name) || !isString(r.html_url) || !isString(r.body) || !isString(r.published_at)) {
    return null;
  }
  return {
    tagName: r.tag_name,
    htmlUrl: r.html_url,
    body: r.body,
    publishedAt: r.published_at,
  };
}
```

- [ ] **Step 1.4: Run tests — expect PASS**

Run: `npm test -- server/updates/github-release.test.ts`
Expected: all tests PASS (approximately 19 assertions across ~14 `it()` blocks).

- [ ] **Step 1.5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 1.6: Commit**

```bash
git add server/updates/github-release.ts server/updates/github-release.test.ts
git commit -m "$(cat <<'EOF'
Add github-release pure helpers for update-check

parseVersion accepts "v1.2.3" / "1.2.3" / "1.2" and rejects
non-semver strings. compareVersions does strict numeric ordering
on major → minor → patch. parseReleaseResponse defensively coerces
unknown JSON into a typed GitHubRelease or returns null on any
shape mismatch.

All pure, node-env testable. Consumed by the upcoming
update-check orchestrator in Task 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `update-check.ts` orchestrator + tests

**Files:**
- Create: `server/updates/update-check.ts`
- Create: `server/updates/update-check.test.ts`

### Steps

- [ ] **Step 2.1: Create the module**

Create `server/updates/update-check.ts`:

```typescript
import type { Alert } from '../../shared/types';
import packageJson from '../../package.json' with { type: 'json' };
import {
  type GitHubRelease,
  compareVersions,
  parseReleaseResponse,
  parseVersion,
} from './github-release';

const OWNER = 'OniNoKen4192';
const REPO = 'SkyFrame';
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

const currentVersion: string = packageJson.version;

export interface AvailableUpdate {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseBody: string;
  checkedAt: string;
}

// Module-level state (reset per server run)
let cachedAvailableUpdate: AvailableUpdate | null = null;
let scheduledTimerId: ReturnType<typeof setTimeout> | null = null;

export function getCachedUpdate(): AvailableUpdate | null {
  return cachedAvailableUpdate;
}

export function clearCachedUpdate(): void {
  cachedAvailableUpdate = null;
}

export function msUntilNextLocalMidnight(from: Date): number {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime() - from.getTime();
}

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

export async function performUpdateCheck(now: Date): Promise<void> {
  const release = await fetchLatestRelease();
  if (!release) return;

  const latestParsed = parseVersion(release.tagName);
  const currentParsed = parseVersion(currentVersion);
  if (!latestParsed || !currentParsed) return;

  if (compareVersions(latestParsed, currentParsed) <= 0) {
    // Release is same or older — nothing to surface.
    cachedAvailableUpdate = null;
    return;
  }

  cachedAvailableUpdate = {
    currentVersion,
    latestVersion: release.tagName,
    releaseUrl: release.htmlUrl,
    releaseBody: release.body,
    checkedAt: now.toISOString(),
  };
}

export function startUpdateScheduler(): void {
  // Kick off an immediate check (fire-and-forget), then schedule the next
  // midnight firing. Each midnight firing re-schedules itself.
  void performUpdateCheck(new Date());

  const scheduleNext = () => {
    const ms = msUntilNextLocalMidnight(new Date());
    scheduledTimerId = setTimeout(async () => {
      await performUpdateCheck(new Date());
      scheduleNext();
    }, ms);
  };
  scheduleNext();
}

export function stopUpdateScheduler(): void {
  if (scheduledTimerId !== null) {
    clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
  }
}

// Build the synthetic Alert injected into the alert pipeline when an update
// is available. Called from server/nws/normalizer.ts.
export function buildUpdateAlert(update: AvailableUpdate): Alert {
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

- [ ] **Step 2.2: Create tests**

Create `server/updates/update-check.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCachedUpdate,
  clearCachedUpdate,
  performUpdateCheck,
  msUntilNextLocalMidnight,
  buildUpdateAlert,
} from './update-check';

describe('msUntilNextLocalMidnight', () => {
  it('returns 24h at start-of-day', () => {
    const startOfDay = new Date(2026, 3, 20, 0, 0, 0, 0);  // month is 0-indexed: 3 = April
    expect(msUntilNextLocalMidnight(startOfDay)).toBe(24 * 60 * 60 * 1000);
  });
  it('returns ~12h at noon', () => {
    const noon = new Date(2026, 3, 20, 12, 0, 0, 0);
    expect(msUntilNextLocalMidnight(noon)).toBe(12 * 60 * 60 * 1000);
  });
  it('returns 1 minute just before midnight', () => {
    const almostMidnight = new Date(2026, 3, 20, 23, 59, 0, 0);
    expect(msUntilNextLocalMidnight(almostMidnight)).toBe(60 * 1000);
  });
});

describe('performUpdateCheck', () => {
  beforeEach(() => {
    clearCachedUpdate();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates the cache when GitHub returns a newer release', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        tag_name: 'v99.0.0',
        html_url: 'https://github.com/owner/repo/releases/tag/v99.0.0',
        body: 'Big update.',
        published_at: '2026-04-20T12:00:00Z',
      }), { status: 200 }),
    );

    await performUpdateCheck(new Date('2026-04-20T13:00:00Z'));

    const cached = getCachedUpdate();
    expect(cached).not.toBeNull();
    expect(cached!.latestVersion).toBe('v99.0.0');
    expect(cached!.releaseBody).toBe('Big update.');
    expect(cached!.checkedAt).toBe('2026-04-20T13:00:00.000Z');
  });

  it('leaves the cache null when the release matches the current version', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        tag_name: 'v0.0.1',  // lower than package.json's version; simulate no-update
        html_url: 'https://example.com',
        body: 'Old.',
        published_at: '2020-01-01T00:00:00Z',
      }), { status: 200 }),
    );

    await performUpdateCheck(new Date());

    expect(getCachedUpdate()).toBeNull();
  });

  it('silently skips on fetch network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    await expect(performUpdateCheck(new Date())).resolves.toBeUndefined();
    expect(getCachedUpdate()).toBeNull();
  });

  it('silently skips on malformed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not json', { status: 200 }),
    );

    await expect(performUpdateCheck(new Date())).resolves.toBeUndefined();
    expect(getCachedUpdate()).toBeNull();
  });
});

describe('buildUpdateAlert', () => {
  it('produces a valid advisory Alert with stable id', () => {
    const update = {
      currentVersion: '1.2.1',
      latestVersion: 'v1.3.0',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v1.3.0',
      releaseBody: 'Release notes.',
      checkedAt: '2026-04-20T12:00:00Z',
    };

    const alert = buildUpdateAlert(update);

    expect(alert.id).toBe('update-v1.3.0');
    expect(alert.tier).toBe('advisory');
    expect(alert.event).toBe('Update Available');
    expect(alert.headline).toBe('SkyFrame v1.3.0 is available');
    expect(alert.description).toContain('Release notes.');
    expect(alert.description).toContain('https://github.com/owner/repo/releases/tag/v1.3.0');
    expect(alert.description).toContain('you are on 1.2.1');
    expect(alert.issuedAt).toBe('2026-04-20T12:00:00Z');
    // Far-future expires
    expect(Date.parse(alert.expires)).toBeGreaterThan(Date.parse('2098-01-01T00:00:00Z'));
  });
});
```

- [ ] **Step 2.3: Run tests + typecheck**

Run: `npm test -- server/updates/update-check.test.ts`
Expected: all 9 tests PASS.

Run: `npm run typecheck`
Expected: no errors.

Run the full suite: `npm test`
Expected: all tests pass — old 228 + 14 from Task 1 + 9 from Task 2 = 251 tests across 15 files.

- [ ] **Step 2.4: Commit**

```bash
git add server/updates/update-check.ts server/updates/update-check.test.ts
git commit -m "$(cat <<'EOF'
Add update-check orchestrator + buildUpdateAlert

Exposes a small public surface over module-level mutable state:
- getCachedUpdate / clearCachedUpdate for consumers
- performUpdateCheck(now) — one-shot fetch + compare + cache write
- startUpdateScheduler / stopUpdateScheduler — kicks off the
  startup check and schedules the next local-midnight firing;
  the midnight callback re-schedules itself
- msUntilNextLocalMidnight — exported for direct unit testing
- buildUpdateAlert — produces the synthetic advisory Alert
  consumed by the normalizer; stable id = "update-${tag}"

fetchLatestRelease is the only outbound call — unauthenticated
GET to api.github.com/repos/OniNoKen4192/SkyFrame/releases/latest
with a SkyFrame-Update-Check/{version} User-Agent. All errors
(fetch, non-2xx, malformed JSON) swallow to silent no-op.

Tests cover msUntilNextLocalMidnight at start-of-day / noon /
just-before-midnight, performUpdateCheck success + already-latest
+ fetch-error + malformed-response, and buildUpdateAlert shape
incl. stable id and far-future expires.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Config schema + `/api/setup` + `/api/config` + startup wiring

Compound commit: extends the server config, the two route handlers, and the startup block in `server/index.ts`. Touching them together keeps the typecheck coherent (the handler body uses fields the config and types just added).

**Files:**
- Modify: `server/config.ts`
- Modify: `server/routes.ts`
- Modify: `server/index.ts`
- Modify: `server/routes.test.ts` (fixture + new tests)

### Steps

- [ ] **Step 3.1: Extend `server/config.ts`**

In `server/config.ts`, extend `SkyFrameLocationConfig` to include the new field:

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
  updateCheckEnabled?: boolean;   // NEW — optional for backwards compat with existing configs
}
```

In `buildConfig`, surface the value in the returned runtime object. Add this block right before the `return { ... }` starts collecting the runtime shape:

```typescript
  const updateCheckEnabled = saved?.updateCheckEnabled ?? false;
```

And add to the returned object (alongside `debug:`):

```typescript
  return {
    configured,
    // ...existing fields unchanged...
    debug: {
      injectTiers: parseDebugTiers(process.env.SKYFRAME_DEBUG_TIERS),
    },
    updateCheckEnabled,
  };
```

- [ ] **Step 3.2: Extend `server/routes.ts` — `/api/config` response**

In `server/routes.ts`, replace the existing `/api/config` handler:

```typescript
  app.get('/api/config', async () => {
    return {
      configured: CONFIG.configured,
      locationName: CONFIG.location.name,
    };
  });
```

with:

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
      email: CONFIG.nws.userAgent.match(/\(([^)]+)\)/)?.[1] ?? '',
      updateCheckEnabled: CONFIG.updateCheckEnabled,
    };
  });
```

Email extraction note: the User-Agent string is already `"SkyFrame/0.1 ({email})"`, so a simple regex pulls it back out. Avoids adding a parallel field to the runtime config just for this.

- [ ] **Step 3.3: Extend `server/routes.ts` — `/api/setup` body + scheduler toggle**

Modify the imports at the top of `server/routes.ts` to add:

```typescript
import { startUpdateScheduler, stopUpdateScheduler, clearCachedUpdate } from './updates/update-check';
```

Then replace the `/api/setup` handler. Change the Body type and the handler body:

```typescript
  app.post<{
    Body: { location: string; email: string; updateCheckEnabled?: boolean };
    Reply: { success: true; locationName: string } | ErrorReply;
  }>('/api/setup', async (req, reply) => {
    try {
      const { location, email, updateCheckEnabled } = req.body;
      if (!location || !email) {
        reply.code(400);
        return { error: 'invalid_input', message: 'Both location and email are required.' };
      }

      const previousUpdateEnabled = CONFIG.updateCheckEnabled;
      const resolved = await resolveSetup({ location, email });
      const newUpdateEnabled = updateCheckEnabled ?? false;

      // Persist with the new updateCheckEnabled flag
      saveSkyFrameConfig({ ...resolved, updateCheckEnabled: newUpdateEnabled });
      reloadConfig();
      cache.clear();

      // Reconcile the scheduler against the new flag state
      if (newUpdateEnabled && !previousUpdateEnabled) {
        startUpdateScheduler();
        app.log.info('Update check enabled — scheduler started');
      } else if (!newUpdateEnabled && previousUpdateEnabled) {
        stopUpdateScheduler();
        clearCachedUpdate();
        app.log.info('Update check disabled — scheduler stopped, cache cleared');
      }

      app.log.info(`Location configured: ${resolved.locationName} (${resolved.lat}, ${resolved.lon})`);
      return { success: true as const, locationName: resolved.locationName };
    } catch (err) {
      app.log.error({ err }, 'Setup failed');
      reply.code(400);
      return { error: 'setup_failed', message: (err as Error).message };
    }
  });
```

- [ ] **Step 3.4: Wire startup in `server/index.ts`**

In `server/index.ts`, add an import near the top:

```typescript
import { startUpdateScheduler } from './updates/update-check';
```

And add a new block right after the existing debug-tiers block, before `await registerRoutes(app)`:

```typescript
  if (CONFIG.updateCheckEnabled) {
    startUpdateScheduler();
    app.log.info('Update check enabled — will query GitHub at startup and local midnight');
  }
```

- [ ] **Step 3.5: Update `server/routes.test.ts` fixtures and add new tests**

Find the existing `FIXTURE_RESPONSE.meta` block in `server/routes.test.ts` — it was updated in Feature 5 to include `forecastGeneratedAt`. Leave it alone (this fixture is for `/api/weather`, not `/api/setup`).

Find the describe block for `/api/setup` tests (or the single test for setup if there's only one). Add these tests inside an appropriate `describe`:

```typescript
  describe('/api/setup with updateCheckEnabled', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('accepts updateCheckEnabled: true and persists it', async () => {
      const saveSpy = vi.spyOn(await import('../server/config'), 'saveSkyFrameConfig').mockImplementation(() => {});
      // ... adapt to the existing test harness for POST /api/setup ...
      // The concrete assertion: saveSpy was called with an object whose
      // updateCheckEnabled === true.
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ updateCheckEnabled: true }),
      );
    });

    it('defaults updateCheckEnabled to false when omitted', async () => {
      const saveSpy = vi.spyOn(await import('../server/config'), 'saveSkyFrameConfig').mockImplementation(() => {});
      // POST without the field; verify saveSpy was called with updateCheckEnabled: false.
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ updateCheckEnabled: false }),
      );
    });
  });
```

Note: the exact shape of these tests depends on how the existing `server/routes.test.ts` drives the `/api/setup` route. If the existing test file doesn't cover `/api/setup` at all, skip this step and rely on manual validation in Task 6 — a standalone test file for the `/api/setup` scheduler-toggle behavior would be valuable but introducing a full HTTP-test harness is out of scope for this PR. Read the existing file; if there's a pattern that covers setup, extend it; if not, leave the scheduler-toggle behavior to manual validation. **If skipping, note this in the commit message.**

- [ ] **Step 3.6: Run tests + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (251 + however many route tests were added in step 3.5).

- [ ] **Step 3.7: Commit**

```bash
git add server/config.ts server/routes.ts server/index.ts server/routes.test.ts
git commit -m "$(cat <<'EOF'
Wire updateCheckEnabled through config, routes, and startup

server/config.ts: SkyFrameLocationConfig gains updateCheckEnabled
(optional — defaults to false when loading older configs that
lack the field). buildConfig surfaces it on the runtime CONFIG
object.

server/routes.ts: /api/config now returns the current value for
Settings to pre-populate, plus a synthesized "lat, lon" string
and the email extracted from the NWS User-Agent. /api/setup
accepts an optional updateCheckEnabled field in the body,
persists it to skyframe.config.json, and reconciles the
scheduler against the new state — starting it when toggled on,
stopping it + clearing cache when toggled off.

server/index.ts: starts the scheduler at boot when the flag is
true, logging so a server-side observer sees the check is active.

(Optional route-handler tests deferred to manual validation in
Task 6 if the existing test harness doesn't cover /api/setup —
note whether they were included here.)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Inject update alert in `normalizer.ts` + test

**Files:**
- Modify: `server/nws/normalizer.ts`
- Modify: `server/nws/normalizer.test.ts`

### Steps

- [ ] **Step 4.1: Write the failing test**

Append to `server/nws/normalizer.test.ts`:

```typescript
  describe('update alert injection', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('injects a cached update alert into the sorted alert list', async () => {
      const { buildUpdateAlert } = await import('../updates/update-check');
      vi.spyOn(await import('../updates/update-check'), 'getCachedUpdate').mockReturnValue({
        currentVersion: '1.2.0',
        latestVersion: 'v1.3.0',
        releaseUrl: 'https://github.com/owner/repo/releases/tag/v1.3.0',
        releaseBody: 'Release notes.',
        checkedAt: '2026-04-20T12:00:00Z',
      });

      mockWithAlerts({
        features: [
          { properties: { id: 'real-1', event: 'Tornado Warning', severity: 'Extreme', headline: 'T', description: 'x', sent: '2026-04-16T16:28:00Z', effective: '2026-04-16T16:28:00Z', expires: '2026-04-16T17:00:00Z', areaDesc: 'Here' } },
        ],
      });

      const result = await normalizeWeather();

      // Two alerts: the real tornado (rank 3) first, the update (rank 13) last.
      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0]!.tier).toBe('tornado-warning');
      expect(result.alerts[1]!.tier).toBe('advisory');
      expect(result.alerts[1]!.id).toBe('update-v1.3.0');
      expect(result.alerts[1]!.event).toBe('Update Available');
    });

    it('does not inject anything when the cache is null', async () => {
      vi.spyOn(await import('../updates/update-check'), 'getCachedUpdate').mockReturnValue(null);

      mockWithAlerts({ features: [] });

      const result = await normalizeWeather();

      expect(result.alerts).toHaveLength(0);
    });
  });
```

Place this block inside the existing `describe('normalizeWeather', ...)` at the top level, next to other injection-related describes. The existing `mockWithAlerts` helper is reused.

- [ ] **Step 4.2: Verify the tests FAIL**

Run: `npm test -- server/nws/normalizer.test.ts`
Expected: the new tests FAIL because the injection logic doesn't exist yet.

- [ ] **Step 4.3: Add the injection logic**

In `server/nws/normalizer.ts`, add an import at the top:

```typescript
import { getCachedUpdate, buildUpdateAlert } from '../updates/update-check';
```

Find the section inside `normalizeWeather` where alerts are normalized. It looks like:

```typescript
  const alerts = normalizeAlerts(alertsResult.data);
```

Replace with:

```typescript
  const alerts = normalizeAlerts(alertsResult.data);

  // Inject the cached update alert (if any). Advisory tier ranks last so the
  // sort places it at the bottom of the stack, below any weather alerts.
  const cachedUpdate = getCachedUpdate();
  if (cachedUpdate) {
    alerts.push(buildUpdateAlert(cachedUpdate));
    alerts.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  }
```

- [ ] **Step 4.4: Run tests — expect PASS**

Run: `npm test -- server/nws/normalizer.test.ts`
Expected: the two new injection tests PASS; existing tests still PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4.5: Commit**

```bash
git add server/nws/normalizer.ts server/nws/normalizer.test.ts
git commit -m "$(cat <<'EOF'
Inject cached update alert into the alert list in normalizeWeather

When the update-check cache is non-null, append buildUpdateAlert's
output to the normalized alerts and re-sort by tier rank. The
advisory tier ranks last (13), so the synthetic alert lands at
the bottom of any stack, below real weather alerts.

When the cache is null (feature disabled or no update available),
the behavior is unchanged — the push-and-resort block is skipped.

Two new tests cover both paths via vi.spyOn on getCachedUpdate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Client refactor — `Settings.tsx` + hamburger + App.tsx wire-up

Compound commit because the rename + TopBar prop + App.tsx wire-up all need to land together for typecheck to pass.

**Files:**
- Rename + modify: `client/components/LocationSetup.tsx` → `client/components/Settings.tsx`
- Modify: `client/components/TopBar.tsx`
- Modify: `client/App.tsx`
- Modify: `client/styles/hud.css` (append hamburger styles)

### Steps

- [ ] **Step 5.1: Rename + rewrite `LocationSetup.tsx` as `Settings.tsx`**

Delete `client/components/LocationSetup.tsx` and create `client/components/Settings.tsx` with:

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

export interface SettingsInitialConfig {
  location: string;
  email: string;
  updateCheckEnabled: boolean;
}

interface SettingsProps {
  onComplete: () => void;
  onCancel?: () => void;
  initialConfig: SettingsInitialConfig;
}

export function Settings({ onComplete, onCancel, initialConfig }: SettingsProps) {
  const [location, setLocation] = useState(initialConfig.location);
  const [email, setEmail] = useState(initialConfig.email);
  const [updateCheckEnabled, setUpdateCheckEnabled] = useState(initialConfig.updateCheckEnabled);
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
        body: JSON.stringify({
          location: location.trim(),
          email: email.trim(),
          updateCheckEnabled,
        }),
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
        <div className="setup-title">■ SKYFRAME SETTINGS</div>

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
          {!gpsAvailable ? 'GPS LOCATION UNAVAILABLE' : locating ? 'LOCATING...' : '⌖ USE MY LOCATION'}
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

        <label className="setup-label setup-checkbox-label">
          UPDATES
          <label className="setup-checkbox-row">
            <input
              type="checkbox"
              checked={updateCheckEnabled}
              onChange={(e) => setUpdateCheckEnabled(e.target.checked)}
            />
            <span>Check GitHub for new SkyFrame releases</span>
          </label>
          <span className="setup-hint">
            When enabled, SkyFrame checks the GitHub releases page at startup and once a day.
            New releases appear as a dismissible advisory alert. Leave unchecked to stop all
            outbound requests beyond the NWS forecast feed.
          </span>
        </label>

        <label className="setup-label">
          COSMETIC SKIN
          <select className="setup-input" disabled value="default">
            <option value="default">Default (HUD cyan)</option>
          </select>
          <span className="setup-hint">Coming soon.</span>
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

**Diff from the previous `LocationSetup`:**
- `export function LocationSetup` → `export function Settings`
- New `SettingsInitialConfig` export
- Props gain `initialConfig: SettingsInitialConfig`
- State initialized from `initialConfig`
- POST body includes `updateCheckEnabled`
- Title changed from `SKYFRAME SETUP` to `SKYFRAME SETTINGS`
- Two new label blocks: UPDATES checkbox + COSMETIC SKIN disabled-select placeholder

- [ ] **Step 5.2: Append hamburger + checkbox CSS to `hud.css`**

Append to the end of `client/styles/hud.css`:

```css
/* ============================================================
   TopBar settings hamburger (v1.2.1). Muted triple-bar glyph,
   brightens on hover. Same styling pattern as the forecast-inline
   trigger from v1.2 Feature 5.
   ============================================================ */
.hud-topbar-settings {
  background: none;
  border: none;
  color: var(--accent);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 10px;
  opacity: 0.55;
  text-shadow: 0 0 6px rgba(var(--accent-rgb), 0.5);
  margin-left: 12px;
}

.hud-topbar-settings:hover {
  opacity: 1;
}

.hud-topbar-settings:focus-visible {
  outline: 1px dashed currentColor;
  outline-offset: 2px;
}

/* ============================================================
   Settings modal checkbox row (v1.2.1). The UPDATES label
   contains a checkbox + inline text; this gives it the right
   inline layout without disturbing the existing .setup-label
   vertical rhythm.
   ============================================================ */
.setup-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: none;
  color: var(--accent);
  cursor: pointer;
}

.setup-checkbox-row input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--accent);
}
```

- [ ] **Step 5.3: Add hamburger to `TopBar.tsx`**

In `client/components/TopBar.tsx`, add `onOpenSettings: () => void` to `TopBarProps`:

```typescript
interface TopBarProps {
  stationId: string | null;
  error: string | null;
  locationName: string;
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onLocationClick: () => void;
  onOpenSettings: () => void;   // NEW
}
```

Destructure the new prop in the function signature. Then add the button as the last element in the TopBar's returned JSX — place it AFTER the `<div className="clock">` block:

```tsx
      <div className="clock">
        {/* ...existing clock JSX unchanged... */}
      </div>
      <button
        type="button"
        className="hud-topbar-settings"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
      >
        ≡
      </button>
    </div>
  );
}
```

- [ ] **Step 5.4: Update `client/App.tsx`**

Apply these edits to `client/App.tsx`:

**(a) Rename import:**

```typescript
import { LocationSetup } from './components/LocationSetup';
```

becomes:

```typescript
import { Settings, type SettingsInitialConfig } from './components/Settings';
```

**(b) Extend the config-fetch effect** — the existing effect calls `/api/config` and only reads `configured`. Extend it to also read `location`, `email`, and `updateCheckEnabled`:

Find:

```typescript
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: { configured: boolean }) => {
        setConfigured(cfg.configured);
        if (!cfg.configured) setShowSetup(true);
      })
      .catch(() => setConfigured(false));
  }, []);
```

Replace with:

```typescript
  const [settingsInitial, setSettingsInitial] = useState<SettingsInitialConfig>({
    location: '',
    email: '',
    updateCheckEnabled: false,
  });

  const fetchConfig = () => {
    return fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: {
        configured: boolean;
        location?: string;
        email?: string;
        updateCheckEnabled?: boolean;
      }) => {
        setConfigured(cfg.configured);
        setSettingsInitial({
          location: cfg.location ?? '',
          email: cfg.email ?? '',
          updateCheckEnabled: cfg.updateCheckEnabled ?? false,
        });
        if (!cfg.configured) setShowSetup(true);
      })
      .catch(() => setConfigured(false));
  };

  useEffect(() => {
    void fetchConfig();
  }, []);
```

**(c) Add `showSettings`-on-demand trigger.** The existing `showSetup` state handles first-run auto-open. Rename the variable for clarity:

```typescript
  const [showSetup, setShowSetup] = useState(false);
```

stays as-is (the name is fine — it's the gate that hides the dashboard when unconfigured OR when the user opens Settings). What changes: we now ALSO re-fetch the current config right before opening Settings from the hamburger, so the form reflects the latest persisted values.

Add a handler near the existing `handleSetupComplete`:

```typescript
  const handleOpenSettings = () => {
    // Refresh initialConfig from the server before opening, so any changes
    // made outside this tab (or on a prior save cycle) are reflected.
    void fetchConfig().then(() => setShowSetup(true));
  };
```

**(d) Replace the `<LocationSetup>` render** with `<Settings>`:

Find:

```tsx
      {showSetup && (
        <LocationSetup
          onComplete={handleSetupComplete}
          onCancel={configured ? () => setShowSetup(false) : undefined}
        />
      )}
```

Replace with:

```tsx
      {showSetup && (
        <Settings
          onComplete={handleSetupComplete}
          onCancel={configured ? () => setShowSetup(false) : undefined}
          initialConfig={settingsInitial}
        />
      )}
```

**(e) Wire the hamburger to `TopBar`**. Find the `<TopBar ... />` invocation and add the new prop:

```tsx
      <TopBar
        stationId={data?.meta?.stationId ?? null}
        error={error}
        locationName={data?.meta?.locationName ?? ''}
        activeView={activeView}
        onViewChange={setActiveView}
        onLocationClick={handleOpenSettings}
        onOpenSettings={handleOpenSettings}
      />
```

Note: `onLocationClick` is updated to call `handleOpenSettings` too — clicking the TopBar location now opens Settings instead of a legacy flow. Same destination, two triggers (location link + hamburger).

- [ ] **Step 5.5: Typecheck + tests + build**

Run: `npm run typecheck`
Expected: no errors. The rename means TS sees `Settings` everywhere it previously saw `LocationSetup`; the new props flow through correctly.

Run: `npm test`
Expected: all tests pass (same count as after Task 4).

Run: `npm run build`
Expected: clean build.

- [ ] **Step 5.6: Commit**

```bash
git add client/components/LocationSetup.tsx client/components/Settings.tsx client/components/TopBar.tsx client/App.tsx client/styles/hud.css
git commit -m "$(cat <<'EOF'
Replace LocationSetup with Settings modal + hamburger

LocationSetup.tsx → Settings.tsx with expanded form body:
existing location/email/GPS sections unchanged; new UPDATES
section with an opt-in checkbox default-off; new COSMETIC SKIN
placeholder (disabled select, "coming soon"). Props gain
initialConfig: SettingsInitialConfig so App can pre-populate
from /api/config on open, and the POST body to /api/setup gains
updateCheckEnabled.

TopBar gains a trailing ≡ hamburger button (new
.hud-topbar-settings class, same styling pattern as the
forecast-inline trigger). onOpenSettings prop threads through
from App.

App.tsx fetches /api/config and holds the result in
settingsInitial state. Both the hamburger and the existing
TopBar location link now call handleOpenSettings, which
re-fetches before opening so the form reflects the latest
persisted state.

Existing .setup-* CSS class names retained — the chrome was
already right for the new form.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Version bump + manual validation + PROJECT_STATUS + PR

**Files:**
- Modify: `package.json`
- Modify: `PROJECT_STATUS.md`

### Steps

- [ ] **Step 6.1: Bump `package.json` version**

In `package.json`, change:

```json
"version": "0.1.0",
```

to:

```json
"version": "1.2.1",
```

This is the version `update-check.ts` reads via `packageJson.version` and compares against GitHub's `/releases/latest`. Bumping now ensures the shipping app knows its own version correctly.

- [ ] **Step 6.2: Typecheck + build + tests once more**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run build`
Expected: clean.

Run: `npm test`
Expected: all tests pass. Note the `performUpdateCheck` test that feeds `tag_name: 'v0.0.1'` was checking "older than current" — it still is, since 0.0.1 < 1.2.1.

- [ ] **Step 6.3: Manual validation scenarios**

Run the dev server and client:

```powershell
npm run server
```

```bash
npm run dev
```

Scenarios:

**A) First-run flow (simulate unconfigured):**
1. Stop the server. Rename `skyframe.config.json` to `skyframe.config.json.bak`.
2. Start server, open `http://localhost:5173`.
3. Settings modal auto-opens with title `■ SKYFRAME SETTINGS`, CANCEL button absent, Esc/backdrop close disabled.
4. Form fields: LOCATION empty, EMAIL empty, UPDATES checkbox unchecked, COSMETIC SKIN select disabled and showing "Default (HUD cyan)" with "Coming soon" hint.
5. Click `⌖ USE MY LOCATION` or type a ZIP; fill email.
6. Leave UPDATES unchecked.
7. Click SAVE → modal closes, dashboard renders.
8. Check `skyframe.config.json` — has `"updateCheckEnabled": false`.
9. Check server log — no "Update check enabled" line.

**B) Anytime-edit flow (turn updates ON):**
1. Dashboard visible. Click ≡ hamburger in TopBar.
2. Settings opens pre-populated with the location (as `"lat, lon"`), email, and checkbox unchecked.
3. Check the UPDATES checkbox.
4. Click SAVE → modal closes.
5. Server log shows `Update check enabled — scheduler started`.
6. Check `skyframe.config.json` — has `"updateCheckEnabled": true`.

**C) Alert appears (forced via version rollback):**
1. Stop server. In `package.json`, temporarily change `"version": "1.2.1"` to `"version": "0.0.1"`.
2. Start server. Watch for log line `Update check enabled — will query GitHub at startup and local midnight`.
3. Within a few seconds, the server has fetched `/releases/latest` and cached the result.
4. Reload browser. An `advisory`-tier alert (base cyan) appears at the bottom of the alert banner with `Update Available` text.
5. Click the event name → TerminalModal opens showing the release notes body.
6. × to close modal.
7. × on the alert banner to dismiss. Alert disappears.
8. Reload page. Alert stays dismissed (localStorage persists).
9. Stop server, restore `"version": "1.2.1"`, restart.
10. On next poll (within ~90s), the check runs, finds current ≥ latest, clears cache. No alert. (You may need to wait for the next poll to clear the cache client-side; a fresh page load shows nothing because the `dismissed` set pruned the ID.)

**D) Toggle updates off mid-session (with alert visible):**
1. Repeat step C1-C4 so an alert is visible.
2. Click hamburger → Settings → uncheck UPDATES → SAVE.
3. Server log shows `Update check disabled — scheduler stopped, cache cleared`.
4. On the next client poll (~90s) the alert disappears. (Faster to verify: stop + restart server.)

**E) Network-error path:**
1. Block `api.github.com` in DevTools (Network tab → Block request domain).
2. Settings → toggle updates ON → SAVE. Server log shows "scheduler started."
3. Server-side the `fetchLatestRelease` returns null silently.
4. No alert appears. No console errors on client or server beyond the normal log.

- [ ] **Step 6.4: Update `PROJECT_STATUS.md`**

Update the "Last updated" line:

```
**Last updated:** 2026-04-20 (v1.2.1)
```

Update the test count — run `npm test` to get the exact number. Approximate: 228 pre-existing + 14 (Task 1) + 9 (Task 2) + 2 (Task 4) = 253. Adjust the number in these two lines:

```
- **Tests:** Vitest (253 tests across 15 files — ...
npm test             # Vitest (253 tests — ...
```

Add a new section under "Implemented features", after the Alert sounds entry:

```markdown
### Settings modal + GitHub update notifications (v1.2.1)
- `LocationSetup` replaced with an always-accessible `Settings` modal reachable from a `≡` hamburger button in the TopBar. Same chrome as LocationSetup (corners, HUD styling); expanded form body with Location + GPS + Email (existing), a new "Check GitHub for new SkyFrame releases" checkbox (default **off**), and a disabled "Cosmetic skin — coming soon" placeholder.
- When the checkbox is enabled, the server performs a `GET /repos/OniNoKen4192/SkyFrame/releases/latest` check at startup and at local midnight. If a newer release is found, a synthetic `advisory`-tier alert is injected into the normalizer's alert list with `id: "update-${tag}"`. The alert appears at the bottom of the alert stack, clickable for release notes in the existing TerminalModal, dismissible via the existing dismissal flow.
- No outbound requests to GitHub when the checkbox is off. Explicit UI consent model per CLAUDE.md's "no transmitted data beyond the forecast" hard rule — checkbox hint text explains what enabling it does.
- `package.json` bumped from `0.1.0` to `1.2.1`. `skyframe.config.json` gains `updateCheckEnabled: boolean`; `/api/setup` accepts it, `/api/config` returns it for Settings pre-population.
```

- [ ] **Step 6.5: Commit the version bump + docs**

```bash
git add package.json PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
Bump to v1.2.1 + document Settings + updates in PROJECT_STATUS

package.json version bumps from 0.1.0 to 1.2.1. This is what the
update-check reads and compares against GitHub's /releases/latest
— bumping before shipping ensures the released app knows its
own version correctly.

PROJECT_STATUS gets a new v1.2.1 entry covering the Settings
refactor and the opt-in update notifications, plus bumped test
count and last-updated line.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6.6: Push branch and open PR**

```bash
git push -u origin feat/settings-and-updates
```

Open the PR with `gh pr create`. Match the house style from PRs #9–#12: summary bullets, decisions-settled table, test plan checklist, commit map, links to spec and plan. Include a brief note that this is v1.2.1 closing out v1.2's final roadmap item.

---

## Summary of commits

1. Add github-release pure helpers for update-check
2. Add update-check orchestrator + buildUpdateAlert
3. Wire updateCheckEnabled through config, routes, and startup
4. Inject cached update alert into the alert list in normalizeWeather
5. Replace LocationSetup with Settings modal + hamburger
6. Bump to v1.2.1 + document Settings + updates in PROJECT_STATUS

Plus the already-committed spec.

---

## Self-review

**Spec coverage:**

- `github-release.ts` pure helpers (parseVersion, compareVersions, parseReleaseResponse) → Task 1 ✅
- `update-check.ts` orchestrator (getCachedUpdate, clearCachedUpdate, performUpdateCheck, start/stopUpdateScheduler, msUntilNextLocalMidnight, buildUpdateAlert) → Task 2 ✅
- Hardcoded OWNER/REPO constants + User-Agent pattern → Task 2 ✅
- `package.json` JSON-import version read → Task 2 ✅
- Config schema extension (`updateCheckEnabled`) → Task 3 ✅
- `/api/setup` accepts new field + toggles scheduler → Task 3 ✅
- `/api/config` returns full config for pre-population → Task 3 ✅
- Startup wiring in `server/index.ts` → Task 3 ✅
- `normalizer.ts` injection + re-sort → Task 4 ✅
- `Settings.tsx` rename + expanded form → Task 5 ✅
- Hamburger trigger in TopBar → Task 5 ✅
- App.tsx state + config fetch + prop threading → Task 5 ✅
- `package.json` version bump to 1.2.1 → Task 6 ✅
- Manual validation + `PROJECT_STATUS` + PR → Task 6 ✅

**Placeholder scan:** one soft spot in Task 3 Step 3.5 — the route-test additions are described but fall through to "defer to manual validation if the existing test harness doesn't cover /api/setup." That's a conditional flow rather than a placeholder; the implementer reads the existing test file and decides. Acceptable. Every other step has concrete code + exact commands.

**Type consistency:**

- `SettingsInitialConfig` exported from Settings.tsx, imported by App.tsx — matching shape (`location`, `email`, `updateCheckEnabled`) ✅
- `AvailableUpdate` shape identical between update-check.ts definition and the test's mock ✅
- `/api/setup` body type in routes.ts matches what Settings posts (`location`, `email`, `updateCheckEnabled?`) ✅
- `/api/config` response shape documented in the spec matches what App.tsx parses ✅
- `Alert` type returned by `buildUpdateAlert` matches the existing `Alert` interface — same fields, same types ✅
- Scheduler lifecycle: `startUpdateScheduler` / `stopUpdateScheduler` / `clearCachedUpdate` signatures match between Task 2's exports and Task 3's imports ✅
