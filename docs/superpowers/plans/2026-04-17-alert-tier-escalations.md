# PDS Tornado + Destructive T-Storm Alert Tier Escalations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new alert tiers (`tornado-pds`, `tstorm-destructive`) driven by NWS IBW damage-threat parameters, and fix the latent Tornado Emergency detection bug in the process.

**Architecture:** A new pure function `classifyAlert(event, parameters)` in `shared/alert-tiers.ts` replaces the direct event-name lookup for tornado-family and t-storm events. It reads `parameters.tornadoDamageThreat` / `parameters.thunderstormDamageThreat` from the NWS CAP alert to pick the right tier, falling back to the existing event-name map (`mapEventToTier`) for every other event. The normalizer is rewired to call `classifyAlert` instead of `mapEventToTier`. Debug alert synthesis emits matching parameters so the debug path exercises the real classifier.

**Tech Stack:** TypeScript, vitest, CSS. No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-04-17-alert-tier-escalations-design.md](../specs/2026-04-17-alert-tier-escalations-design.md)

---

## Context the implementer needs

- **Test runner is vitest.** Run all tests with `npm test`. Run a single file with `npx vitest run path/to/file.test.ts`. Filter by test name with `-t "pattern"`.
- **TypeScript is strict.** `TIER_COLORS: Record<AlertTier, ...>` and `TIER_RANK` are exhaustive over `AlertTier`. When you add a union variant, the compiler will flag every registry that's missing the new key — listen to it.
- **Vitest's `it.each`** with a typed tuple array is the pattern used throughout these tests. Match that style in new tests.
- **NWS parameter shape.** On the live API, `parameters` is a plain object whose values are arrays of strings, e.g. `{ tornadoDamageThreat: ['CONSIDERABLE'] }`. The classifier must tolerate bare strings defensively (defensive typing, not observed behavior).
- **Ranking convention.** Lower rank number = higher severity / shown first. New ranks: emergency=1, pds=2, warning=3, destructive=4, severe=5, blizzard=6, winter-storm=7, flood=8, heat=9, special-weather-statement=10, watch=11.
- **Don't touch** `CLAUDE.md`, `PROJECT_STATUS.md`, or `docs/icon-gaps.md` outside their dedicated task — those files already have unrelated uncommitted changes.

## File map

| File | Why it changes |
|---|---|
| `shared/types.ts` | Add 2 variants to `AlertTier` union |
| `shared/alert-tiers.ts` | Expand `TIER_RANK` + `TIER_COLORS`, add `classifyAlert`, prune `EVENT_TO_TIER` |
| `shared/alert-tiers.test.ts` | Tests for new tiers + new `classifyAlert` |
| `server/nws/normalizer.ts` | Wire `classifyAlert` in; extend `NwsAlertsResponse` for `parameters` |
| `server/nws/normalizer.test.ts` | One new fixture + test for damage-threat-driven classification |
| `server/nws/debug-alerts.ts` | Update existing `tornado-emergency` spec; add 2 new tier specs; emit `parameters` for escalated tiers |
| `server/nws/debug-alerts.test.ts` | Tests for new tiers + parameters emission |
| `client/styles/hud.css` | 2 banner blocks + 2 accent-override blocks |
| `CLAUDE.md` | Update valid debug tier names |
| `PROJECT_STATUS.md` | Record shipped feature |

---

## Task 1: Extend `AlertTier` union and expand tier registries

**Files:**
- Modify: `shared/types.ts:84-93`
- Modify: `shared/alert-tiers.ts:19-52`
- Modify: `shared/alert-tiers.test.ts:37-70`

TypeScript will enforce exhaustiveness once the union gains new variants — `TIER_RANK` and `TIER_COLORS` will stop compiling until they contain entries for `tornado-pds` and `tstorm-destructive`. This task updates all three together so the codebase stays compilable, and updates the registry tests to cover the new tiers + new rank ordering.

- [ ] **Step 1: Update `tierRank` and `TIER_COLORS` tests**

Edit `shared/alert-tiers.test.ts`. Replace the existing `describe('tierRank', …)` and `describe('TIER_COLORS', …)` blocks with:

```ts
describe('tierRank', () => {
  it('orders all tiers from most-severe (1) to least-severe (11)', () => {
    expect(tierRank('tornado-emergency')).toBe(1);
    expect(tierRank('tornado-pds')).toBe(2);
    expect(tierRank('tornado-warning')).toBe(3);
    expect(tierRank('tstorm-destructive')).toBe(4);
    expect(tierRank('severe-warning')).toBe(5);
    expect(tierRank('blizzard')).toBe(6);
    expect(tierRank('winter-storm')).toBe(7);
    expect(tierRank('flood')).toBe(8);
    expect(tierRank('heat')).toBe(9);
    expect(tierRank('special-weather-statement')).toBe(10);
    expect(tierRank('watch')).toBe(11);
  });

  it('returns smaller numbers for more-severe tiers', () => {
    expect(tierRank('tornado-emergency')).toBeLessThan(tierRank('tornado-pds'));
    expect(tierRank('tornado-pds')).toBeLessThan(tierRank('tornado-warning'));
    expect(tierRank('tornado-warning')).toBeLessThan(tierRank('tstorm-destructive'));
    expect(tierRank('tstorm-destructive')).toBeLessThan(tierRank('severe-warning'));
    expect(tierRank('severe-warning')).toBeLessThan(tierRank('watch'));
  });
});

describe('TIER_COLORS', () => {
  it('has base + dark for every AlertTier value', () => {
    const tiers: AlertTier[] = [
      'tornado-emergency', 'tornado-pds', 'tornado-warning',
      'tstorm-destructive', 'severe-warning',
      'blizzard', 'winter-storm', 'flood', 'heat',
      'special-weather-statement', 'watch',
    ];
    for (const t of tiers) {
      expect(TIER_COLORS[t]).toBeDefined();
      expect(TIER_COLORS[t].base).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(TIER_COLORS[t].dark).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run tests to see them fail (compile error)**

Run: `npx vitest run shared/alert-tiers.test.ts`
Expected: FAIL — TypeScript compile error, "`tornado-pds` is not assignable to type `AlertTier`", plus exhaustiveness errors on `TIER_RANK` / `TIER_COLORS`.

- [ ] **Step 3: Add the two new variants to `AlertTier`**

In `shared/types.ts`, replace the `AlertTier` union (currently lines 84-93):

```ts
export type AlertTier =
  | 'tornado-emergency'
  | 'tornado-pds'
  | 'tornado-warning'
  | 'tstorm-destructive'
  | 'severe-warning'
  | 'blizzard'
  | 'winter-storm'
  | 'flood'
  | 'heat'
  | 'special-weather-statement'
  | 'watch';
```

- [ ] **Step 4: Expand `TIER_RANK` with new ranks**

In `shared/alert-tiers.ts`, replace the `TIER_RANK` definition (currently lines 19-29) with:

```ts
const TIER_RANK: ReadonlyMap<AlertTier, number> = new Map<AlertTier, number>([
  ['tornado-emergency',          1],
  ['tornado-pds',                2],
  ['tornado-warning',            3],
  ['tstorm-destructive',         4],
  ['severe-warning',             5],
  ['blizzard',                   6],
  ['winter-storm',               7],
  ['flood',                      8],
  ['heat',                       9],
  ['special-weather-statement', 10],
  ['watch',                     11],
]);
```

- [ ] **Step 5: Expand `TIER_COLORS` with two new entries**

In `shared/alert-tiers.ts`, add two entries to `TIER_COLORS` (currently ends around line 52). Final shape:

```ts
export const TIER_COLORS: Record<AlertTier, { base: string; dark: string }> = {
  'tornado-emergency':         { base: '#9400D3', dark: '#5a007e' },
  'tornado-pds':               { base: '#d400a8', dark: '#800065' },
  'tornado-warning':           { base: '#ff4444', dark: '#a02828' },
  'tstorm-destructive':        { base: '#c8102e', dark: '#78091c' },
  'severe-warning':            { base: '#ff8800', dark: '#a05500' },
  'blizzard':                  { base: '#ffffff', dark: '#bbbbbb' },
  'winter-storm':              { base: '#4488ff', dark: '#2a55a0' },
  'flood':                     { base: '#22cc66', dark: '#147a3d' },
  'heat':                      { base: '#ff5533', dark: '#a0331c' },
  'special-weather-statement': { base: '#ee82ee', dark: '#9d539d' },
  'watch':                     { base: '#ffdd33', dark: '#a08820' },
};
```

- [ ] **Step 6: Run tests to confirm pass**

Run: `npx vitest run shared/alert-tiers.test.ts`
Expected: PASS (all existing `mapEventToTier` tests + updated `tierRank` + `TIER_COLORS` tests).

- [ ] **Step 7: Typecheck whole repo**

Run: `npm run typecheck`
Expected: PASS (no compile errors anywhere — any file that referenced `AlertTier` exhaustively will now fail if it's missing the new variants; fix any that surface).

- [ ] **Step 8: Commit**

```bash
git add shared/types.ts shared/alert-tiers.ts shared/alert-tiers.test.ts
git commit -m "Add tornado-pds and tstorm-destructive to AlertTier union"
```

---

## Task 2: Add `classifyAlert` function and its tests

**Files:**
- Modify: `shared/alert-tiers.ts` (add new function + helper at end of file)
- Modify: `shared/alert-tiers.test.ts` (add new describe block at end of file)

This introduces the new classifier without modifying `EVENT_TO_TIER`. Both paths coexist briefly — the normalizer will migrate in Task 3, and the now-redundant event-name entries are pruned in Task 5.

- [ ] **Step 1: Write failing tests for `classifyAlert`**

First, extend the existing import at the top of `shared/alert-tiers.test.ts` to include `classifyAlert`:

```ts
import { mapEventToTier, tierRank, TIER_COLORS, classifyAlert } from './alert-tiers';
```

Then add at the end of the file:

```ts
describe('classifyAlert', () => {
  describe('tornado family', () => {
    it('Tornado Warning with no parameters → tornado-warning', () => {
      expect(classifyAlert('Tornado Warning')).toBe('tornado-warning');
    });

    it('Tornado Warning with tornadoDamageThreat=CONSIDERABLE → tornado-pds', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['CONSIDERABLE'] }))
        .toBe('tornado-pds');
    });

    it('Tornado Warning with tornadoDamageThreat=CATASTROPHIC → tornado-emergency', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['CATASTROPHIC'] }))
        .toBe('tornado-emergency');
    });

    it('Tornado Warning with unknown damage threat → tornado-warning (fallback)', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['UNKNOWN_FUTURE'] }))
        .toBe('tornado-warning');
    });

    it('accepts lowercase damage threat values (case-insensitive)', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: ['considerable'] }))
        .toBe('tornado-pds');
    });

    it('tolerates bare string parameter value (not wrapped in array)', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: 'CONSIDERABLE' }))
        .toBe('tornado-pds');
    });

    it('legacy event "Tornado Emergency" with no parameters → tornado-emergency', () => {
      expect(classifyAlert('Tornado Emergency')).toBe('tornado-emergency');
    });

    it('legacy event "Tornado Emergency" with CONSIDERABLE threat → still tornado-emergency', () => {
      // Structured threat wins if present; but legacy event alone also resolves correctly.
      expect(classifyAlert('Tornado Emergency', { tornadoDamageThreat: ['CATASTROPHIC'] }))
        .toBe('tornado-emergency');
    });

    it('ignores empty parameter array', () => {
      expect(classifyAlert('Tornado Warning', { tornadoDamageThreat: [] }))
        .toBe('tornado-warning');
    });
  });

  describe('thunderstorm family', () => {
    it('Severe Thunderstorm Warning with no parameters → severe-warning', () => {
      expect(classifyAlert('Severe Thunderstorm Warning')).toBe('severe-warning');
    });

    it('Severe Thunderstorm Warning with thunderstormDamageThreat=DESTRUCTIVE → tstorm-destructive', () => {
      expect(classifyAlert('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['DESTRUCTIVE'] }))
        .toBe('tstorm-destructive');
    });

    it('Severe Thunderstorm Warning with thunderstormDamageThreat=CONSIDERABLE → severe-warning (not promoted)', () => {
      expect(classifyAlert('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['CONSIDERABLE'] }))
        .toBe('severe-warning');
    });

    it('Severe Thunderstorm Warning with unknown threat value → severe-warning (fallback)', () => {
      expect(classifyAlert('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['UNKNOWN'] }))
        .toBe('severe-warning');
    });
  });

  describe('other events', () => {
    it('delegates to mapEventToTier for non-tornado, non-tstorm events', () => {
      expect(classifyAlert('Blizzard Warning')).toBe('blizzard');
      expect(classifyAlert('Flash Flood Warning')).toBe('flood');
      expect(classifyAlert('Tornado Watch')).toBe('watch');
    });

    it('returns null for unknown events', () => {
      expect(classifyAlert('Made Up Alert')).toBeNull();
    });

    it('ignores parameters on non-escalation events', () => {
      // Garbage parameters on a blizzard don't change the outcome.
      expect(classifyAlert('Blizzard Warning', { tornadoDamageThreat: ['CATASTROPHIC'] }))
        .toBe('blizzard');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/alert-tiers.test.ts -t "classifyAlert"`
Expected: FAIL — `classifyAlert is not a function` / compile error "Module has no exported member 'classifyAlert'".

- [ ] **Step 3: Implement `firstValue` helper and `classifyAlert` function**

Append to `shared/alert-tiers.ts` (after `TIER_COLORS`):

```ts
function firstValue(value: string[] | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return value.length > 0 ? value[0] : undefined;
}

export function classifyAlert(
  event: string,
  parameters?: Record<string, string[] | string> | undefined,
): AlertTier | null {
  if (event === 'Tornado Warning' || event === 'Tornado Emergency') {
    const threat = firstValue(parameters?.tornadoDamageThreat)?.toUpperCase();
    if (threat === 'CATASTROPHIC') return 'tornado-emergency';
    if (threat === 'CONSIDERABLE') return 'tornado-pds';
    if (event === 'Tornado Emergency') return 'tornado-emergency';
    return 'tornado-warning';
  }
  if (event === 'Severe Thunderstorm Warning') {
    const threat = firstValue(parameters?.thunderstormDamageThreat)?.toUpperCase();
    if (threat === 'DESTRUCTIVE') return 'tstorm-destructive';
    return 'severe-warning';
  }
  return mapEventToTier(event);
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run shared/alert-tiers.test.ts`
Expected: PASS — all `classifyAlert` cases plus previously-passing `mapEventToTier`, `tierRank`, `TIER_COLORS` tests.

- [ ] **Step 5: Commit**

```bash
git add shared/alert-tiers.ts shared/alert-tiers.test.ts
git commit -m "Add classifyAlert for IBW damage-threat driven classification"
```

---

## Task 3: Wire `classifyAlert` into the normalizer

**Files:**
- Modify: `server/nws/normalizer.ts:140-153` (extend `NwsAlertsResponse`)
- Modify: `server/nws/normalizer.ts:222-249` (swap `mapEventToTier` for `classifyAlert` in `normalizeAlerts`)
- Modify: `server/nws/normalizer.ts:9` (adjust import)

- [ ] **Step 1: Update the import in `normalizer.ts`**

Change line 9 from:

```ts
import { mapEventToTier, tierRank } from '../../shared/alert-tiers';
```

To:

```ts
import { classifyAlert, tierRank } from '../../shared/alert-tiers';
```

- [ ] **Step 2: Extend `NwsAlertsResponse` with the `parameters` field**

In `normalizer.ts`, replace the existing `NwsAlertsResponse` interface (lines 140-153) with:

```ts
export interface NwsAlertsResponse {
  features: Array<{
    properties: {
      id: string;
      event: string;
      severity: string;
      headline: string;
      description: string;
      effective: string;
      expires: string;
      areaDesc: string;
      parameters?: Record<string, string[] | string>;
    };
  }>;
}
```

- [ ] **Step 3: Swap `mapEventToTier` for `classifyAlert` in `normalizeAlerts`**

In `normalizer.ts`, update the inside of the `normalizeAlerts` loop (around line 227) from:

```ts
const tier = mapEventToTier(f.properties.event);
if (tier === null) continue;
```

To:

```ts
const tier = classifyAlert(f.properties.event, f.properties.parameters);
if (tier === null) continue;
```

- [ ] **Step 4: Run normalizer tests to verify no regression**

Run: `npx vitest run server/nws/normalizer.test.ts`
Expected: PASS — existing tests use fixtures without a `parameters` block, and `classifyAlert` returns the same tier as `mapEventToTier` did for every event currently covered by fixtures.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS — everything still green.

- [ ] **Step 6: Commit**

```bash
git add server/nws/normalizer.ts
git commit -m "Route alert classification through classifyAlert in normalizer"
```

---

## Task 4: Add normalizer test for damage-threat-driven classification

**Files:**
- Modify: `server/nws/normalizer.test.ts` (add tests inside the existing `describe('alerts', …)` block, around line 348 — just before `it('returns empty alerts array when NWS alerts response is empty', …)`)

This is the integration-level assertion: a raw NWS alert payload with a `parameters` block end-to-end produces the right tier on the emitted `Alert`.

- [ ] **Step 1: Add fixture + test cases**

In `server/nws/normalizer.test.ts`, inside the existing `describe('alerts', …)` block, add:

```ts
it('classifies Tornado Warning with CONSIDERABLE damage threat as tornado-pds', async () => {
  mockWithAlerts({
    features: [
      {
        properties: {
          id: 'urn:oid:nws.alerts.pds',
          event: 'Tornado Warning',
          severity: 'Extreme',
          headline: 'Tornado Warning - PDS',
          description: 'Particularly dangerous situation.',
          effective: '2026-04-17T17:00:00-05:00',
          expires: '2026-04-17T18:00:00-05:00',
          areaDesc: 'Somewhere County',
          parameters: { tornadoDamageThreat: ['CONSIDERABLE'] },
        },
      },
    ],
  });

  const result = await normalizeWeather();
  expect(result.alerts).toHaveLength(1);
  expect(result.alerts[0]!.tier).toBe('tornado-pds');
});

it('classifies Tornado Warning with CATASTROPHIC damage threat as tornado-emergency', async () => {
  mockWithAlerts({
    features: [
      {
        properties: {
          id: 'urn:oid:nws.alerts.emerg',
          event: 'Tornado Warning',
          severity: 'Extreme',
          headline: 'Tornado Emergency',
          description: 'Tornado emergency in effect.',
          effective: '2026-04-17T17:00:00-05:00',
          expires: '2026-04-17T18:00:00-05:00',
          areaDesc: 'Somewhere County',
          parameters: { tornadoDamageThreat: ['CATASTROPHIC'] },
        },
      },
    ],
  });

  const result = await normalizeWeather();
  expect(result.alerts).toHaveLength(1);
  expect(result.alerts[0]!.tier).toBe('tornado-emergency');
});

it('classifies Severe Thunderstorm Warning with DESTRUCTIVE threat as tstorm-destructive', async () => {
  mockWithAlerts({
    features: [
      {
        properties: {
          id: 'urn:oid:nws.alerts.destructive',
          event: 'Severe Thunderstorm Warning',
          severity: 'Severe',
          headline: 'Severe Thunderstorm Warning - Destructive',
          description: 'Destructive severe thunderstorm.',
          effective: '2026-04-17T17:00:00-05:00',
          expires: '2026-04-17T18:00:00-05:00',
          areaDesc: 'Somewhere County',
          parameters: { thunderstormDamageThreat: ['DESTRUCTIVE'] },
        },
      },
    ],
  });

  const result = await normalizeWeather();
  expect(result.alerts).toHaveLength(1);
  expect(result.alerts[0]!.tier).toBe('tstorm-destructive');
});

it('leaves Severe Thunderstorm Warning with CONSIDERABLE threat as severe-warning', async () => {
  mockWithAlerts({
    features: [
      {
        properties: {
          id: 'urn:oid:nws.alerts.considerable',
          event: 'Severe Thunderstorm Warning',
          severity: 'Severe',
          headline: 'Severe Thunderstorm Warning - Considerable',
          description: 'Considerable damage threat.',
          effective: '2026-04-17T17:00:00-05:00',
          expires: '2026-04-17T18:00:00-05:00',
          areaDesc: 'Somewhere County',
          parameters: { thunderstormDamageThreat: ['CONSIDERABLE'] },
        },
      },
    ],
  });

  const result = await normalizeWeather();
  expect(result.alerts).toHaveLength(1);
  expect(result.alerts[0]!.tier).toBe('severe-warning');
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx vitest run server/nws/normalizer.test.ts`
Expected: PASS — all new classification tests plus existing tests.

- [ ] **Step 3: Commit**

```bash
git add server/nws/normalizer.test.ts
git commit -m "Test damage-threat-driven tier classification in normalizer"
```

---

## Task 5: Prune redundant entries from `EVENT_TO_TIER`

**Files:**
- Modify: `shared/alert-tiers.ts:3-17` (`EVENT_TO_TIER` map)
- Modify: `shared/alert-tiers.test.ts:6-34` (`mapEventToTier` tests)

After this task, `mapEventToTier` no longer knows about `Tornado Warning`, `Tornado Emergency`, or `Severe Thunderstorm Warning` — those events are handled exclusively by `classifyAlert`. Calling `mapEventToTier('Tornado Warning')` directly now returns null, which is correct: without a `parameters` block, callers can't know which tier (warning vs PDS vs emergency) is right, so routing through `classifyAlert` is the only safe path.

- [ ] **Step 1: Remove the three tornado/t-storm rows from `EVENT_TO_TIER`**

In `shared/alert-tiers.ts`, replace `EVENT_TO_TIER` (lines 3-17) with:

```ts
const EVENT_TO_TIER: ReadonlyMap<string, AlertTier> = new Map<string, AlertTier>([
  ['Blizzard Warning',           'blizzard'],
  ['Winter Storm Warning',       'winter-storm'],
  ['Flood Warning',              'flood'],
  ['Flash Flood Warning',        'flood'],
  ['Heat Advisory',              'heat'],
  ['Excessive Heat Warning',     'heat'],
  ['Excessive Heat Watch',       'heat'],
  ['Special Weather Statement',  'special-weather-statement'],
  ['Tornado Watch',              'watch'],
  ['Severe Thunderstorm Watch',  'watch'],
]);
```

- [ ] **Step 2: Update `mapEventToTier` tests to reflect the prune**

In `shared/alert-tiers.test.ts`, update the `describe('mapEventToTier', …)` block's `it.each` table. Remove the three tornado/t-storm rows from the passing-table, and add them to the null-returning table. Final shape:

```ts
describe('mapEventToTier', () => {
  it.each([
    ['Blizzard Warning',           'blizzard'],
    ['Winter Storm Warning',       'winter-storm'],
    ['Flood Warning',              'flood'],
    ['Flash Flood Warning',        'flood'],
    ['Heat Advisory',              'heat'],
    ['Excessive Heat Warning',     'heat'],
    ['Excessive Heat Watch',       'heat'],
    ['Special Weather Statement',  'special-weather-statement'],
    ['Tornado Watch',              'watch'],
    ['Severe Thunderstorm Watch',  'watch'],
  ] as Array<[string, AlertTier]>)('maps "%s" to %s', (event, tier) => {
    expect(mapEventToTier(event)).toBe(tier);
  });

  it.each([
    'Tornado Warning',            // now handled by classifyAlert only
    'Tornado Emergency',          // now handled by classifyAlert only
    'Severe Thunderstorm Warning', // now handled by classifyAlert only
    'Wind Advisory',
    'Air Quality Alert',
    'Frost Advisory',
    'Dense Fog Advisory',
    'Hurricane Warning',
    '',
    'Some Made Up Alert',
  ])('returns null for unmapped event "%s"', (event) => {
    expect(mapEventToTier(event)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run shared/alert-tiers.test.ts`
Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS — classifyAlert still routes tornado/t-storm events correctly, and the normalizer uses classifyAlert so live alert handling is unchanged.

- [ ] **Step 5: Commit**

```bash
git add shared/alert-tiers.ts shared/alert-tiers.test.ts
git commit -m "Prune tornado/tstorm events from EVENT_TO_TIER now that classifyAlert owns them"
```

---

## Task 6: Update debug synthesizer for new tiers + parameter emission

**Files:**
- Modify: `server/nws/debug-alerts.ts:9-19` (`TIER_SPECS`)
- Modify: `server/nws/debug-alerts.ts:31-52` (`synthesizeDebugAlerts`)
- Modify: `server/nws/debug-alerts.test.ts:38-45` (exhaustive-tier test) and `:55-73` (tier synthesis cases)

The existing `tornado-emergency` spec uses event `'Tornado Emergency'`, which never occurs on the live API. Change it to mirror reality — `'Tornado Warning'` + `tornadoDamageThreat: ['CATASTROPHIC']` — so the debug path genuinely exercises the classifier instead of hitting the legacy event-name shortcut.

- [ ] **Step 1: Write failing tests for the new synthesizer behavior**

Replace the existing `it.each([...])('synthesizes %s …)` block in `server/nws/debug-alerts.test.ts` (around lines 55-73) with:

```ts
it.each([
  ['tornado-emergency',          'Tornado Warning',             'Extreme'],
  ['tornado-pds',                'Tornado Warning',             'Extreme'],
  ['tornado-warning',            'Tornado Warning',             'Extreme'],
  ['tstorm-destructive',         'Severe Thunderstorm Warning', 'Extreme'],
  ['severe-warning',             'Severe Thunderstorm Warning', 'Severe'],
  ['blizzard',                   'Blizzard Warning',            'Extreme'],
  ['winter-storm',               'Winter Storm Warning',        'Severe'],
  ['flood',                      'Flood Warning',               'Severe'],
  ['heat',                       'Heat Advisory',               'Moderate'],
  ['special-weather-statement',  'Special Weather Statement',   'Moderate'],
  ['watch',                      'Tornado Watch',               'Severe'],
] as Array<[AlertTier, string, string]>)(
  'synthesizes %s with event "%s" and severity %s',
  (tier, event, severity) => {
    const result = synthesizeDebugAlerts([tier], NOW);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]!.properties.event).toBe(event);
    expect(result.features[0]!.properties.severity).toBe(severity);
  },
);
```

Also expand the `'accepts every defined AlertTier value'` test (around line 38) to include the two new tiers:

```ts
it('accepts every defined AlertTier value', () => {
  const all: AlertTier[] = [
    'tornado-emergency', 'tornado-pds', 'tornado-warning',
    'tstorm-destructive', 'severe-warning',
    'blizzard', 'winter-storm', 'flood', 'heat',
    'special-weather-statement', 'watch',
  ];
  expect(parseDebugTiers(all.join(','))).toEqual(all);
});
```

Then add a new describe block at the end of the file testing parameter emission + end-to-end classification round-trip:

```ts
describe('synthesizeDebugAlerts — escalated tier parameters', () => {
  const NOW2 = new Date('2026-04-17T17:00:00-05:00');

  it('emits tornadoDamageThreat=CATASTROPHIC for tornado-emergency', () => {
    const result = synthesizeDebugAlerts(['tornado-emergency'], NOW2);
    expect(result.features[0]!.properties.parameters).toEqual({
      tornadoDamageThreat: ['CATASTROPHIC'],
    });
  });

  it('emits tornadoDamageThreat=CONSIDERABLE for tornado-pds', () => {
    const result = synthesizeDebugAlerts(['tornado-pds'], NOW2);
    expect(result.features[0]!.properties.parameters).toEqual({
      tornadoDamageThreat: ['CONSIDERABLE'],
    });
  });

  it('emits thunderstormDamageThreat=DESTRUCTIVE for tstorm-destructive', () => {
    const result = synthesizeDebugAlerts(['tstorm-destructive'], NOW2);
    expect(result.features[0]!.properties.parameters).toEqual({
      thunderstormDamageThreat: ['DESTRUCTIVE'],
    });
  });

  it('omits parameters for non-escalated tiers', () => {
    const result = synthesizeDebugAlerts(['tornado-warning', 'severe-warning', 'blizzard'], NOW2);
    for (const feature of result.features) {
      expect(feature.properties.parameters).toBeUndefined();
    }
  });
});

describe('synthesizeDebugAlerts — end-to-end classification round-trip', () => {
  // Verifies that a synthesized feature, when run through the real classifier,
  // resolves to the same tier it was synthesized for. This is the load-bearing
  // guarantee of debug injection: what you inject is what you see.
  const NOW3 = new Date('2026-04-17T17:00:00-05:00');

  it.each([
    'tornado-emergency',
    'tornado-pds',
    'tornado-warning',
    'tstorm-destructive',
    'severe-warning',
  ] as const)('synthesized %s classifies back to itself', (tier) => {
    const result = synthesizeDebugAlerts([tier], NOW3);
    const props = result.features[0]!.properties;
    expect(classifyAlert(props.event, props.parameters)).toBe(tier);
  });
});
```

Add the `classifyAlert` import at the top of the test file:

```ts
import { classifyAlert } from '../../shared/alert-tiers';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/nws/debug-alerts.test.ts`
Expected: FAIL — the existing `tornado-emergency` synthesis test will fail because the current code emits `event: 'Tornado Emergency'`, not `'Tornado Warning'`. New tiers will fail to match `TIER_SPECS`. Parameter-emission tests will fail because the current synthesizer never emits `parameters`.

- [ ] **Step 3: Update `TIER_SPECS` — change tornado-emergency event, add new tiers**

Replace the `TIER_SPECS` definition in `server/nws/debug-alerts.ts` (lines 9-19) with:

```ts
const TIER_SPECS: Record<AlertTier, TierSpec> = {
  'tornado-emergency':         { event: 'Tornado Warning',             severity: 'Extreme'  },
  'tornado-pds':               { event: 'Tornado Warning',             severity: 'Extreme'  },
  'tornado-warning':           { event: 'Tornado Warning',             severity: 'Extreme'  },
  'tstorm-destructive':        { event: 'Severe Thunderstorm Warning', severity: 'Extreme'  },
  'severe-warning':            { event: 'Severe Thunderstorm Warning', severity: 'Severe'   },
  'blizzard':                  { event: 'Blizzard Warning',            severity: 'Extreme'  },
  'winter-storm':              { event: 'Winter Storm Warning',        severity: 'Severe'   },
  'flood':                     { event: 'Flood Warning',               severity: 'Severe'   },
  'heat':                      { event: 'Heat Advisory',               severity: 'Moderate' },
  'special-weather-statement': { event: 'Special Weather Statement',   severity: 'Moderate' },
  'watch':                     { event: 'Tornado Watch',               severity: 'Severe'   },
};
```

- [ ] **Step 4: Emit `parameters` for escalated tiers in `synthesizeDebugAlerts`**

Add a helper + use it inside the `features.map(...)`. Replace the `synthesizeDebugAlerts` function (lines 31-52) with:

```ts
function parametersForTier(tier: AlertTier): Record<string, string[]> | undefined {
  switch (tier) {
    case 'tornado-emergency':  return { tornadoDamageThreat: ['CATASTROPHIC'] };
    case 'tornado-pds':        return { tornadoDamageThreat: ['CONSIDERABLE'] };
    case 'tstorm-destructive': return { thunderstormDamageThreat: ['DESTRUCTIVE'] };
    default:                   return undefined;
  }
}

export function synthesizeDebugAlerts(tiers: AlertTier[], now: Date): NwsAlertsResponse {
  const effective = now.toISOString();
  const expires = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  return {
    features: tiers.map((tier, index) => {
      const spec = TIER_SPECS[tier];
      const parameters = parametersForTier(tier);
      return {
        properties: {
          id: `debug-${tier}-${index}`,
          event: spec.event,
          severity: spec.severity,
          headline: `DEBUG: ${spec.event} issued for {CITY} (synthetic)`,
          description: 'Synthetic alert for development (SKYFRAME_DEBUG_TIERS env var is active).',
          effective,
          expires,
          areaDesc: 'Debug Mode',
          ...(parameters ? { parameters } : {}),
        },
      };
    }),
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/nws/debug-alerts.test.ts`
Expected: PASS — all synthesis tests including the new parameter-emission block and the end-to-end classification round-trip.

- [ ] **Step 6: Run full test suite to confirm no collateral damage**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/nws/debug-alerts.ts server/nws/debug-alerts.test.ts
git commit -m "Synthesize escalated debug alerts with matching damage-threat parameters"
```

---

## Task 7: Add CSS for `tornado-pds` and `tstorm-destructive`

**Files:**
- Modify: `client/styles/hud.css:730-773` (banner tier blocks — add 2 new blocks after `tornado-warning` and `severe-warning` respectively, or at the end of that section — ordering is stylistic only, CSS selectors are specificity-identical)
- Modify: `client/styles/hud.css:782-817` (showcase accent-override blocks)

No tests — this is a visual-only change. Verify manually via `SKYFRAME_DEBUG_TIERS` after the change.

- [ ] **Step 1: Add two banner tier blocks**

Insert into `client/styles/hud.css` after the existing `tornado-emergency` block (line 730-733) and before the `tornado-warning` block:

```css
.alert-banner[data-tier="tornado-pds"] {
  color: #d400a8;
  text-shadow: 0 0 8px rgba(212, 0, 168, 0.7);
}
```

Insert after the existing `tornado-warning` block (line 734-737) and before `severe-warning`:

```css
.alert-banner[data-tier="tstorm-destructive"] {
  color: #c8102e;
  text-shadow: 0 0 8px rgba(200, 16, 46, 0.7);
}
```

- [ ] **Step 2: Add two showcase accent-override blocks**

Insert into `client/styles/hud.css` inside the "UI ACCENT COLOR OVERRIDE" section (after line 785's `tornado-emergency`, before line 786's `tornado-warning`):

```css
.hud-showcase[data-alert-tier="tornado-pds"] {
  --accent: #d400a8;
  --accent-rgb: 212, 0, 168;
}
```

Insert after line 789's `tornado-warning` showcase block, before line 790's `severe-warning`:

```css
.hud-showcase[data-alert-tier="tstorm-destructive"] {
  --accent: #c8102e;
  --accent-rgb: 200, 16, 46;
}
```

- [ ] **Step 3: Manual verification via debug tiers**

Start the server with debug tiers active:

```bash
SKYFRAME_DEBUG_TIERS=tornado-pds,tstorm-destructive npm run server
```

In another terminal, start the client: `npm run dev`. Open the dashboard, confirm:
- A hot magenta banner for PDS tornado (`#d400a8`) — distinct from the deep violet of tornado-emergency.
- A crimson banner for destructive t-storm (`#c8102e`) — darker than the standard red tornado-warning.
- The accent color on the rest of the HUD (border glows, icons) also flips to the tier color.

Then verify multi-alert stacking rank:

```bash
SKYFRAME_DEBUG_TIERS=tornado-emergency,tornado-pds,tornado-warning,tstorm-destructive,severe-warning npm run server
```

Confirm the banner shows `tornado-emergency` as the primary (highest-priority) alert, with the rest listed below in rank order.

- [ ] **Step 4: Commit**

```bash
git add client/styles/hud.css
git commit -m "Style tornado-pds (magenta) and tstorm-destructive (crimson) banners"
```

---

## Task 8: Documentation updates

**Files:**
- Modify: `CLAUDE.md` (the "Debug alert injection" section — "Valid tier names" list)
- Modify: `PROJECT_STATUS.md` (the "Implemented features" list)

Both files have unrelated uncommitted changes in the working tree at the start of this work. Only stage the specific lines touched by this task, not the entire file.

- [ ] **Step 1: Update valid tier names in `CLAUDE.md`**

Find the line in the "Debug alert injection" section reading:

```
Valid tier names: `tornado-emergency`, `tornado-warning`, `severe-warning`, `blizzard`, `winter-storm`, `flood`, `heat`, `special-weather-statement`, `watch`.
```

Replace with:

```
Valid tier names: `tornado-emergency`, `tornado-pds`, `tornado-warning`, `tstorm-destructive`, `severe-warning`, `blizzard`, `winter-storm`, `flood`, `heat`, `special-weather-statement`, `watch`.
```

- [ ] **Step 2: Add entry to `PROJECT_STATUS.md` "Implemented features"**

Find the "Implemented features" section and add a new bullet in the appropriate location (likely at the end of the alerts-related items):

```
- PDS Tornado and Destructive Severe Thunderstorm alert tiers, classified from NWS Impact-Based Warning damage-threat parameters (hot magenta and crimson respectively). Fixes latent Tornado Emergency detection bug in the same change.
```

- [ ] **Step 3: Stage only the lines touched and commit**

Use `git add -p` to stage only the new documentation lines (not any unrelated edits already present in these files):

```bash
git add -p CLAUDE.md PROJECT_STATUS.md
```

In the interactive `git add -p` prompts, accept (`y`) only the hunks corresponding to the new tier names list in `CLAUDE.md` and the new feature bullet in `PROJECT_STATUS.md`. Reject (`n`) any hunks from the pre-existing uncommitted edits.

Then:

```bash
git commit -m "Document PDS and destructive tiers in CLAUDE.md and PROJECT_STATUS.md"
```

- [ ] **Step 4: Final full-suite verification**

Run: `npm test && npm run typecheck`
Expected: PASS on both.

---

## Implementation notes

- **Tasks land in order.** The ordering is chosen so that every commit leaves the codebase compiling and passing tests. Task 5 (pruning EVENT_TO_TIER) deliberately comes after Task 3 (normalizer rewire) — if you swap them, alert classification in the normalizer temporarily regresses between commits.
- **No runtime behavior change from Task 5 alone.** After Task 3, the normalizer uses `classifyAlert`, which internally handles tornado/t-storm events before ever consulting `EVENT_TO_TIER`. Pruning those entries in Task 5 only affects direct callers of `mapEventToTier` — and the only such callers are tests.
- **Debug synthesizer parameter emission is load-bearing.** The end-to-end classification round-trip test in Task 6 is the proof that what you inject via `SKYFRAME_DEBUG_TIERS=tornado-pds` will actually render as `tornado-pds` through the full normalizer pipeline. If that test fails, the debug fixture shape is out of sync with the real classifier.
- **Don't over-commit unrelated files.** `CLAUDE.md`, `PROJECT_STATUS.md`, and `docs/icon-gaps.md` have existing uncommitted changes from before this work. Use `git add -p` in Task 8 so only the lines this plan touches get staged.
