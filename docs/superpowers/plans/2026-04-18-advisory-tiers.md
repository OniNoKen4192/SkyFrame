# Advisory Tiers Implementation Plan (v1.2 Feature 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new alert tiers — `advisory-high` (honey-orange `#ffaa22` for known low-severity NWS advisories like Wind/Winter Weather/Dense Fog) and `advisory` (cyan catch-all for unknown NWS events). Eliminates the current "drop unknown events" bug.

**Architecture:** Pure additive changes to the tier system. The `AlertTier` union grows from 11 to 13. TypeScript exhaustiveness checks will catch every registry that needs an entry (`TIER_RANK`, `TIER_COLORS`, `TIER_SPECS` in debug-alerts). `classifyAlert` return type narrows from `AlertTier | null` to `AlertTier` — unmatched events default to `'advisory'` instead of being dropped. Two new CSS banner rules round out the visual side.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-04-17-v1.2-roadmap-design.md](../specs/2026-04-17-v1.2-roadmap-design.md) Section 3 (revised 2026-04-18 with finalized colors + stripe decision).

**Color/style decision:** Honey-orange `#ffaa22` for `advisory-high`, base cyan (via `--accent`) for `advisory`. Both tiers use animated hazard stripes — the original spec called for `advisory` to render without stripes, but the [visual mockup](../../mockups/alert-tier-colors.html) showed the no-stripes version reads as broken layout.

**Test scope note:** Following the established pattern — pure tier classification logic gets full TDD coverage in `shared/alert-tiers.test.ts`. CSS + banner rendering validated via manual smoke test with the existing `SKYFRAME_DEBUG_TIERS` injection mechanism.

---

## File Structure

**Modified files:**
- `shared/types.ts` — extend `AlertTier` union
- `shared/alert-tiers.ts` — add to `TIER_RANK`, `TIER_COLORS`, `EVENT_TO_TIER`; modify `classifyAlert` return type and unmatched-event handling
- `shared/alert-tiers.test.ts` — extend test coverage for new tiers and catch-all behavior
- `server/nws/debug-alerts.ts` — add `TIER_SPECS` entries (exhaustive map over `AlertTier`)
- `server/nws/debug-alerts.test.ts` — likely affected by the TIER_SPECS exhaustiveness check; verify and adjust
- `server/nws/normalizer.ts` — drop the now-unreachable `if (tier === null) continue` guard
- `client/styles/hud.css` — add 2 banner color rules
- `PROJECT_STATUS.md` — document shipped feature

---

## Task 1: Add advisory tiers to the tier system (TDD)

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/alert-tiers.ts`
- Modify: `shared/alert-tiers.test.ts`
- Modify: `server/nws/debug-alerts.ts`

This task changes the tier registry exhaustively. TypeScript strict mode will flag every place that needs an entry once the union grows — listen to the compiler. The flow is: update tests first (red), then the type union (compile errors), then the registries (compile passes), then the implementation (tests green).

- [ ] **Step 1: Update `shared/alert-tiers.test.ts` with new assertions**

Three changes to the existing file:

**A. Extend the `mapEventToTier` "maps X to Y" parameterized test** with the 7 new advisory-high events. Currently the `it.each` block has 10 entries; add 7 more to make 17. The new entries (insert anywhere in the table — order doesn't matter):

```typescript
['Wind Advisory',              'advisory-high'],
['Winter Weather Advisory',    'advisory-high'],
['Dense Fog Advisory',         'advisory-high'],
['Wind Chill Advisory',        'advisory-high'],
['Freeze Warning',             'advisory-high'],
['Freeze Watch',               'advisory-high'],
['Frost Advisory',             'advisory-high'],
```

**B. Update the `mapEventToTier` "returns null for unmapped" test.** Several events currently in that list are now mapped to `advisory-high` and must be removed. Replace the existing `it.each` with:

```typescript
it.each([
  'Tornado Warning',            // now handled by classifyAlert only
  'Tornado Emergency',          // now handled by classifyAlert only
  'Severe Thunderstorm Warning', // now handled by classifyAlert only
  'Air Quality Alert',
  'Hurricane Warning',
  'Lake Effect Snow Advisory',
  'Beach Hazards Statement',
  '',
  'Some Made Up Alert',
])('returns null for unmapped event "%s"', (event) => {
  expect(mapEventToTier(event)).toBeNull();
});
```

(Removed: `Wind Advisory`, `Frost Advisory`, `Dense Fog Advisory` — they're now mapped. Added: `Air Quality Alert`, `Lake Effect Snow Advisory`, `Beach Hazards Statement` as examples of events that intentionally remain unmapped at the lookup level.)

**C. Replace the `tierRank` describe block** with a version that covers all 13 tiers:

```typescript
describe('tierRank', () => {
  it('orders all tiers from most-severe (1) to least-severe (13)', () => {
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
    expect(tierRank('advisory-high')).toBe(12);
    expect(tierRank('advisory')).toBe(13);
  });

  it('returns smaller numbers for more-severe tiers', () => {
    expect(tierRank('tornado-emergency')).toBeLessThan(tierRank('tornado-pds'));
    expect(tierRank('tornado-pds')).toBeLessThan(tierRank('tornado-warning'));
    expect(tierRank('tornado-warning')).toBeLessThan(tierRank('tstorm-destructive'));
    expect(tierRank('tstorm-destructive')).toBeLessThan(tierRank('severe-warning'));
    expect(tierRank('severe-warning')).toBeLessThan(tierRank('watch'));
    expect(tierRank('watch')).toBeLessThan(tierRank('advisory-high'));
    expect(tierRank('advisory-high')).toBeLessThan(tierRank('advisory'));
  });
});
```

**D. Replace the `TIER_COLORS` describe block** with a version covering all 13 tiers:

```typescript
describe('TIER_COLORS', () => {
  it('has base + dark for every AlertTier value', () => {
    const tiers: AlertTier[] = [
      'tornado-emergency', 'tornado-pds', 'tornado-warning',
      'tstorm-destructive', 'severe-warning',
      'blizzard', 'winter-storm', 'flood', 'heat',
      'special-weather-statement', 'watch',
      'advisory-high', 'advisory',
    ];
    for (const t of tiers) {
      expect(TIER_COLORS[t]).toBeDefined();
      expect(TIER_COLORS[t].base).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(TIER_COLORS[t].dark).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
```

**E. Replace the `classifyAlert` "returns null for unknown events"** test (currently around line 152) with the new catch-all behavior:

Find:
```typescript
it('returns null for unknown events', () => {
  expect(classifyAlert('Made Up Alert')).toBeNull();
});
```

Replace with:
```typescript
it('returns "advisory" (catch-all) for unknown events instead of null', () => {
  expect(classifyAlert('Made Up Alert')).toBe('advisory');
  expect(classifyAlert('Air Quality Alert')).toBe('advisory');
  expect(classifyAlert('Beach Hazards Statement')).toBe('advisory');
  expect(classifyAlert('')).toBe('advisory');
});

it('returns "advisory-high" for known advisory-high events', () => {
  expect(classifyAlert('Wind Advisory')).toBe('advisory-high');
  expect(classifyAlert('Winter Weather Advisory')).toBe('advisory-high');
  expect(classifyAlert('Freeze Warning')).toBe('advisory-high');
});

it('return type is non-nullable AlertTier (never returns null)', () => {
  // Compile-time assertion: TS should narrow this to AlertTier (no null branch).
  const result: AlertTier = classifyAlert('Anything');
  expect(typeof result).toBe('string');
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- shared/alert-tiers.test.ts`

Expected: tests fail because the new tier names aren't in the `AlertTier` type union yet (TypeScript compile errors), and `classifyAlert` still returns `null` for unmatched events.

If you hit the transient "No test suite found" Vitest glitch on first run, retry once.

- [ ] **Step 3: Extend the `AlertTier` union in `shared/types.ts`**

Find the existing union (around line 84):

```typescript
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

Replace with:

```typescript
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
  | 'watch'
  | 'advisory-high'
  | 'advisory';
```

- [ ] **Step 4: Run typecheck — expect targeted errors at the registries**

Run: `npm run typecheck`

Expected: TypeScript flags `TIER_RANK` and `TIER_COLORS` in `shared/alert-tiers.ts` (missing required keys for the new tiers), and `TIER_SPECS` in `server/nws/debug-alerts.ts` (same reason). These are the registries we'll fill in next.

- [ ] **Step 5: Update `shared/alert-tiers.ts`**

Three changes to this file:

**A. Add 7 entries to `EVENT_TO_TIER`.** Find the existing Map (around lines 3-14) and add these entries inside the Map:

```typescript
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
  ['Wind Advisory',              'advisory-high'],
  ['Winter Weather Advisory',    'advisory-high'],
  ['Dense Fog Advisory',         'advisory-high'],
  ['Wind Chill Advisory',        'advisory-high'],
  ['Freeze Warning',             'advisory-high'],
  ['Freeze Watch',               'advisory-high'],
  ['Frost Advisory',             'advisory-high'],
]);
```

**B. Add 2 entries to `TIER_RANK`.** Find the existing Map (around lines 16-28) and add at the end:

```typescript
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
  ['advisory-high',             12],
  ['advisory',                  13],
]);
```

**C. Add 2 entries to `TIER_COLORS`.** Find the existing object (around lines 41-53) and add at the end:

```typescript
export const TIER_COLORS: Record<AlertTier, { base: string; dark: string }> = {
  'tornado-emergency':         { base: '#b052e4', dark: '#6f3490' },
  'tornado-pds':               { base: '#ff55c8', dark: '#a1367e' },
  'tornado-warning':           { base: '#ff4444', dark: '#a02828' },
  'tstorm-destructive':        { base: '#ff4466', dark: '#a12b40' },
  'severe-warning':            { base: '#ff8800', dark: '#a05500' },
  'blizzard':                  { base: '#ffffff', dark: '#bbbbbb' },
  'winter-storm':              { base: '#4488ff', dark: '#2a55a0' },
  'flood':                     { base: '#22cc66', dark: '#147a3d' },
  'heat':                      { base: '#ff5533', dark: '#a0331c' },
  'special-weather-statement': { base: '#ee82ee', dark: '#9d539d' },
  'watch':                     { base: '#ffdd33', dark: '#a08820' },
  'advisory-high':             { base: '#ffaa22', dark: '#a06d15' },
  'advisory':                  { base: '#00e5d1', dark: '#008e82' },
};
```

(`#a06d15` is honey-orange darkened to ~brightness 0.6, matching the existing pattern. `#008e82` is the cyan accent darkened similarly.)

**D. Modify `classifyAlert` to return `AlertTier` (not `AlertTier | null`) and default to `'advisory'`.** Find the function (around lines 61-78) and change:

```typescript
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

Replace with:

```typescript
export function classifyAlert(
  event: string,
  parameters?: Record<string, string[] | string> | undefined,
): AlertTier {
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
  return mapEventToTier(event) ?? 'advisory';
}
```

(`mapEventToTier` still returns `AlertTier | null` — it's the lookup primitive. `classifyAlert` is the higher-level function that promises a tier always exists.)

- [ ] **Step 6: Update `server/nws/debug-alerts.ts` `TIER_SPECS`**

Find the exhaustive map (around lines 9-21) and add 2 entries at the end:

```typescript
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
  'advisory-high':             { event: 'Wind Advisory',               severity: 'Minor'    },
  'advisory':                  { event: 'Air Quality Alert',           severity: 'Minor'    },
};
```

`'Wind Advisory'` is one of the 7 known advisory-high events — synthesizing it through the alert pipeline will produce a real `advisory-high` classification. `'Air Quality Alert'` is intentionally NOT in the EVENT_TO_TIER map, so it'll fall through `classifyAlert`'s catch-all and produce a real `advisory` classification. This means `SKYFRAME_DEBUG_TIERS=advisory-high,advisory` produces banners that exercise both code paths end-to-end.

- [ ] **Step 7: Run typecheck again**

Run: `npm run typecheck`

Expected: clean. All registries are now exhaustive over the expanded `AlertTier`.

- [ ] **Step 8: Run tests and verify they pass**

Run: `npm test -- shared/alert-tiers.test.ts`

Expected: all tests pass. If a test in `server/nws/debug-alerts.test.ts` fails because it asserts the old tier list size, fix it (likely a length assertion or an exhaustive parameterized list).

- [ ] **Step 9: Run full test suite to confirm no regressions**

Run: `npm test`

Expected: all tests pass. (Re-run if you hit the Vitest first-run glitch.)

- [ ] **Step 10: Commit**

```bash
git add shared/types.ts shared/alert-tiers.ts shared/alert-tiers.test.ts server/nws/debug-alerts.ts
# Also stage debug-alerts.test.ts if you needed to update it
git commit -m "Add advisory-high and advisory alert tiers

Extends AlertTier union to 13 tiers. New advisory-high (rank 12,
honey-orange #ffaa22) covers 7 known low-severity NWS events: Wind
Advisory, Winter Weather Advisory, Dense Fog Advisory, Wind Chill
Advisory, Freeze Warning, Freeze Watch, Frost Advisory. New advisory
(rank 13, base cyan) is a catch-all for unknown events.

classifyAlert no longer returns null — unmatched events now resolve
to 'advisory' instead of being silently dropped by the normalizer.
Return type narrowed from AlertTier | null to AlertTier."
```

---

## Task 2: Drop the now-unreachable null guard in normalizer

**File:**
- Modify: `server/nws/normalizer.ts`

- [ ] **Step 1: Remove the null check**

In `server/nws/normalizer.ts`, find the alert classification block (around lines 228-229):

```typescript
const tier = classifyAlert(f.properties.event, f.properties.parameters);
if (tier === null) continue;  // drop unmapped events
```

Replace with:

```typescript
const tier = classifyAlert(f.properties.event, f.properties.parameters);
// classifyAlert always returns a tier — unknowns fall to 'advisory' (catch-all)
```

The `if (tier === null) continue;` is now unreachable (TypeScript would flag it as a comparison to a non-null type). Removing it is required for the file to compile.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`

Expected: typecheck clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/nws/normalizer.ts
git commit -m "Drop unreachable null guard in normalizer alert classification

classifyAlert's return type is now AlertTier (no null), so the guard
that previously dropped unmapped events is unreachable. Removed.
Unknown events now flow through as 'advisory' tier banners."
```

---

## Task 3: Add CSS rules for the two new tiers

**File:**
- Modify: `client/styles/hud.css`

- [ ] **Step 1: Add 2 banner color rules**

Find the existing per-tier color block (currently around lines 742-784, ending with `t-watch`). The `watch` tier has a special rule for heavier dark stripes (line ~788) — insert the new rules AFTER that block.

Append after the watch heavy-stripes block:

```css
.alert-banner[data-tier="advisory-high"] {
  color: #ffaa22;
  text-shadow: 0 0 8px rgba(255, 170, 34, 0.7);
}
.alert-banner[data-tier="advisory"] {
  color: var(--accent);
  text-shadow: 0 0 8px rgba(var(--accent-rgb), 0.7);
}
```

The honey-orange may need heavier dark stripes (similar to `watch`) — the smoke test in Task 4 will tell us. Don't preemptively add the heavy-stripe override; we'll add it only if needed.

**Important:** Do NOT add a `[data-alert-tier="advisory-high"]` or `[data-alert-tier="advisory"]` selector on the root. Per spec, neither tier overrides the global theme accent — the dashboard stays cyan (or whatever a higher-severity active alert sets it to) when only advisory-tier alerts are present.

- [ ] **Step 2: Typecheck (sanity)**

Run: `npm run typecheck`

Expected: clean (CSS isn't typechecked but this confirms nothing else broke).

Do NOT commit yet — Task 4's smoke test may produce a CSS tweak that should commit alongside this change.

---

## Task 4: Manual smoke test (USER)

The orchestrator runs the dev server with both new tiers injected via the existing debug mechanism, and the user verifies visual rendering in the browser.

**Steps the orchestrator runs:**

```bash
SKYFRAME_DEBUG_TIERS=advisory-high,advisory npm run start:prod
```

This builds the client and starts the server with two synthetic alerts: a `Wind Advisory` (classifies to `advisory-high`) and an `Air Quality Alert` (classifies to `advisory` via catch-all).

**User verifies in browser:**

1. Two banners appear in the alert area, with the expand `▾` toggle (since there's more than 1).
2. The primary banner (advisory-high, rank 12) is honey-orange with diagonal hazard stripes, animated.
3. Click expand → both alerts list shows. Second entry (advisory, rank 13) renders cyan with stripes.
4. Honey-orange stripes are clearly visible (not washed-out by the bright base color). If the stripes look faint, we add a heavy-stripes override mirroring the `watch` tier's pattern.
5. The dashboard's accent color does NOT change — the rest of the UI stays cyan. Neither advisory tier should override the global theme.
6. Both banners have a dismiss `×` button (both are dismissible per spec).
7. Click each dismiss → banner disappears, doesn't reappear on next poll (debug alerts persist until env var is unset).

**If stripes need heavier dark overlay** (likely for honey-orange given how watch needed it): orchestrator adds this CSS rule alongside the new banner rules:

```css
.alert-banner[data-tier="advisory-high"] .alert-banner-stripes-left::before {
  background: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.50) 5px, rgba(0,0,0,0.50) 10px);
}
.alert-banner[data-tier="advisory-high"] .alert-banner-stripes-right::before {
  background: repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(0,0,0,0.50) 5px, rgba(0,0,0,0.50) 10px);
}
```

(Use 0.50 — between the default 0.35 and watch's 0.55 — since honey-orange is darker than pure yellow and shouldn't need the same heavy treatment.)

- [ ] **Step 1: Orchestrator starts dev server with debug tiers** (handled by orchestrator, not this checkbox)
- [ ] **Step 2: User verifies items 1-7 above** (USER ACTION)
- [ ] **Step 3: Orchestrator commits Task 3 (and Task 4 stripe tweak if needed)**

```bash
git add client/styles/hud.css
git commit -m "Add CSS rules for advisory-high and advisory tier banners

Honey-orange #ffaa22 for advisory-high; base cyan for advisory.
Both use the existing hazard-stripe layout. Neither overrides the
global theme accent — dashboard stays cyan when only advisory-tier
alerts are present.

[Optionally append: 'Honey-orange uses 0.50 dark-stripe overlay since
the default 0.35 wasn't enough contrast against the bright base.']"
```

---

## Task 5: PROJECT_STATUS update + final commit + verify

**File:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Read existing format**

Read `PROJECT_STATUS.md` and look at the most recent post-v1.1 entries (icon presentation fixes, °F/°C toggle, alert system enhancements). Match their tone.

- [ ] **Step 2: Add a new "Implemented features" entry**

Suggested format under "Implemented features", as a new `###` section after the most recent post-v1.1 entry:

```markdown
### Advisory tiers (post-v1.1)
- Two new alert tiers: advisory-high (honey-orange `#ffaa22`, hazard stripes) for 7 known low-severity NWS events (Wind Advisory, Winter Weather Advisory, Dense Fog Advisory, Wind Chill Advisory, Freeze Warning, Freeze Watch, Frost Advisory), and advisory (base cyan, hazard stripes) as catch-all for unknown events. Neither tier overrides the dashboard theme.
- classifyAlert now always returns an AlertTier — unmatched NWS events fall to the advisory catch-all instead of being silently dropped. (PR #?, 2026-04-18)
```

Replace `PR #?` with the actual PR number when opening the PR (likely PR #8).

- [ ] **Step 3: Update the Tech Stack tier count**

Find the line in the "Tech Stack" section (currently around line 15) that reads `Vitest (server-side only — 163 tests across 10 files)` or similar — update to reflect the new test count after this PR. Run `npm test 2>&1 | grep "Tests"` to get the current count.

- [ ] **Step 4: Final commit**

```bash
git add PROJECT_STATUS.md
git commit -m "Document advisory tiers in PROJECT_STATUS"
```

- [ ] **Step 5: Verify clean state**

Run: `git status && npm test && npm run typecheck`

Expected: working tree clean, all tests pass, typecheck clean. Re-run npm test if you hit the Vitest first-run glitch.

---

## Done

Feature branch ready for the orchestrator's branch-finishing flow. Per the [PR-vs-local-merge memory note](file:C:/Users/kencu/.claude/projects/e--SkyFrame/memory/feedback_pr_workflow.md), this branch is set up to ship via PR (option 2 in the finishing-a-development-branch skill).
