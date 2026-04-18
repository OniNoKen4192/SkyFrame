# Icon Fixes Implementation Plan (v1.2 Feature 2a + 2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two icon presentation bugs: (a) daily forecast periods showing sunny icons when precipitation is highly likely, and (b) clear-sky icons (sun/moon) not visually centered in the CurrentPanel hero area.

**Architecture:** A new `mapNwsDailyIcon` function in `server/nws/icon-mapping.ts` wraps the existing `mapNwsIcon` and applies an upgrade rule for daily periods only — if precipProb ≥ 50% and the chosen icon is non-precip, upgrade to rain/snow/thunder based on `shortForecast` keyword match. Normalizer's three daily call sites swap to the new function; hourly + current-conditions behavior unchanged. For 2b, CurrentPanel sets a `data-clear` attribute on `.hud-hero-icon` when the icon code is sun or moon, and a new CSS rule expands and centers the icon container in that case.

**Tech Stack:** TypeScript, Vitest (existing). No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-04-17-v1.2-roadmap-design.md](../specs/2026-04-17-v1.2-roadmap-design.md) Section 2 (Daily icon override + Centered sun/moon parts only; full icon-set expansion (2c) deferred pending user-produced SVG art).

**Test scope note:** Server-side icon mapping is unit-tested per existing pattern (`icon-mapping.test.ts`). React + CSS changes are validated manually per the established codebase pattern (no UI test infrastructure).

---

## File Structure

**Modified files:**
- `server/nws/icon-mapping.ts` — add `HIGH_PRECIP_THRESHOLD` constant + `mapNwsDailyIcon` exported function
- `server/nws/icon-mapping.test.ts` — extend with new `describe('mapNwsDailyIcon')` block
- `server/nws/normalizer.ts` — swap three daily call sites from `mapNwsIcon` to `mapNwsDailyIcon`
- `client/components/CurrentPanel.tsx` — set `data-clear` attribute on `.hud-hero-icon`
- `client/styles/hud.css` — new rule for `.hud-hero-icon[data-clear="true"]`
- `PROJECT_STATUS.md` — document shipped fixes + note 2c deferral

---

## Task 1: `mapNwsDailyIcon` (TDD)

**Files:**
- Modify: `server/nws/icon-mapping.ts`
- Modify: `server/nws/icon-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/nws/icon-mapping.test.ts`, add this `describe` block at the end of the file (inside the existing top-level `describe('mapNwsIcon', ...)` is wrong — add it as a sibling top-level describe):

```typescript
import { mapNwsDailyIcon } from './icon-mapping';

describe('mapNwsDailyIcon', () => {
  const SUN_DAY = 'https://api.weather.gov/icons/land/day/skc?size=medium';
  const MOON_NIGHT = 'https://api.weather.gov/icons/land/night/skc?size=medium';
  const PARTLY_DAY = 'https://api.weather.gov/icons/land/day/sct?size=medium';
  const PARTLY_NIGHT = 'https://api.weather.gov/icons/land/night/sct?size=medium';
  const CLOUD_DAY = 'https://api.weather.gov/icons/land/day/ovc?size=medium';
  const RAIN_DAY = 'https://api.weather.gov/icons/land/day/rain?size=medium';
  const SNOW_DAY = 'https://api.weather.gov/icons/land/day/snow?size=medium';
  const THUNDER_DAY = 'https://api.weather.gov/icons/land/day/tsra?size=medium';
  const FOG_DAY = 'https://api.weather.gov/icons/land/day/fog?size=medium';

  describe('passes through to mapNwsIcon when no upgrade applies', () => {
    it('returns sun for clear day with no precip prob', () => {
      expect(mapNwsDailyIcon(SUN_DAY, null, 'Sunny')).toBe('sun');
    });

    it('returns sun for clear day with low precip prob', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 20, 'Mostly sunny')).toBe('sun');
    });

    it('returns partly-day for partly-cloudy with sub-threshold precip', () => {
      expect(mapNwsDailyIcon(PARTLY_DAY, 49, 'Partly sunny')).toBe('partly-day');
    });

    it('returns rain unchanged when NWS already chose rain', () => {
      expect(mapNwsDailyIcon(RAIN_DAY, 80, 'Rain showers')).toBe('rain');
    });
  });

  describe('upgrades non-precip icons when precipProb >= 50', () => {
    it('upgrades sun to rain when precipProb 50 and shortForecast mentions showers', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 50, 'Showers likely')).toBe('rain');
    });

    it('upgrades partly-day to rain when precipProb 90 and shortForecast mentions rain', () => {
      expect(mapNwsDailyIcon(PARTLY_DAY, 90, 'Rain likely')).toBe('rain');
    });

    it('upgrades partly-night to rain at high precip', () => {
      expect(mapNwsDailyIcon(PARTLY_NIGHT, 75, 'Rain likely')).toBe('rain');
    });

    it('upgrades cloud to rain at high precip', () => {
      expect(mapNwsDailyIcon(CLOUD_DAY, 70, 'Rain likely')).toBe('rain');
    });

    it('upgrades to thunder when shortForecast mentions thunderstorms', () => {
      expect(mapNwsDailyIcon(PARTLY_DAY, 80, 'Thunderstorms likely')).toBe('thunder');
    });

    it('upgrades to thunder for "chance of thunderstorms"', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 60, 'Sunny then chance of thunderstorms')).toBe('thunder');
    });

    it('upgrades to snow when shortForecast mentions snow', () => {
      expect(mapNwsDailyIcon(PARTLY_NIGHT, 80, 'Snow likely')).toBe('snow');
    });

    it('upgrades to snow when shortForecast mentions flurries', () => {
      expect(mapNwsDailyIcon(CLOUD_DAY, 70, 'Snow flurries')).toBe('snow');
    });

    it('upgrades to snow when shortForecast mentions blizzard', () => {
      expect(mapNwsDailyIcon(CLOUD_DAY, 80, 'Blizzard conditions')).toBe('snow');
    });

    it('thunder takes priority over snow if both are mentioned', () => {
      // Edge case: rare but possible during convective winter storms
      expect(mapNwsDailyIcon(PARTLY_DAY, 80, 'Thunderstorms with snow')).toBe('thunder');
    });

    it('defaults to rain when shortForecast has no precip keyword', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 90, 'Increasing clouds')).toBe('rain');
    });

    it('defaults to rain when shortForecast is undefined', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 90, undefined)).toBe('rain');
    });
  });

  describe('does not upgrade precip icons or fog', () => {
    it('leaves rain icon unchanged at high precip', () => {
      expect(mapNwsDailyIcon(RAIN_DAY, 90, 'Heavy rain')).toBe('rain');
    });

    it('leaves snow icon unchanged at high precip', () => {
      expect(mapNwsDailyIcon(SNOW_DAY, 90, 'Heavy snow')).toBe('snow');
    });

    it('leaves thunder icon unchanged at high precip', () => {
      expect(mapNwsDailyIcon(THUNDER_DAY, 90, 'Severe thunderstorms')).toBe('thunder');
    });

    it('leaves fog icon unchanged at high precip', () => {
      // Fog is a visibility indicator — preserve NWS choice rather than override
      expect(mapNwsDailyIcon(FOG_DAY, 80, 'Dense fog with rain')).toBe('fog');
    });
  });

  describe('handles edge cases', () => {
    it('handles missing precipProb (null) — no upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, null, 'Showers likely')).toBe('sun');
    });

    it('handles undefined precipProb — no upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, undefined, 'Showers likely')).toBe('sun');
    });

    it('boundary: precipProb exactly 50 triggers upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 50, 'Showers')).toBe('rain');
    });

    it('boundary: precipProb 49 does not trigger upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 49, 'Showers')).toBe('sun');
    });

    it('upgrades night sun (moon) the same as day sun', () => {
      expect(mapNwsDailyIcon(MOON_NIGHT, 80, 'Rain likely')).toBe('rain');
    });

    it('handles malformed URL by deferring to mapNwsIcon (returns cloud)', () => {
      // mapNwsIcon returns 'cloud' for bad URLs; cloud gets upgraded to rain at high precip
      expect(mapNwsDailyIcon('', 80, 'Rain')).toBe('rain');
    });

    it('keyword match is case-insensitive', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 80, 'THUNDERSTORMS LIKELY')).toBe('thunder');
    });
  });
});
```

The `import { mapNwsDailyIcon }` should be added to the existing import line at the top of the file: change `import { mapNwsIcon } from './icon-mapping';` to `import { mapNwsIcon, mapNwsDailyIcon } from './icon-mapping';`.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- server/nws/icon-mapping.test.ts`

Expected: All new `mapNwsDailyIcon` tests fail with "mapNwsDailyIcon is not a function" or similar. Existing `mapNwsIcon` tests still pass.

(If you hit a transient "No test suite found" error on first run, re-run the command — there's a known Windows + Vitest cache glitch that resolves on retry.)

- [ ] **Step 3: Implement `mapNwsDailyIcon`**

In `server/nws/icon-mapping.ts`, add a new constant and a new exported function. Keep the existing `mapNwsIcon` and `baseIconFromSlug` unchanged.

Add at the top of the file, near `PRECIP_PROB_THRESHOLD`:

```typescript
// Above this threshold, daily forecast icons that NWS chose as non-precip
// (sun/moon/partly-*/cloud) get upgraded to a precip icon. Mirror of the
// hourly downgrade rule, inverted: hourly says "if NWS gave us rain but
// precip is unlikely, downgrade"; daily says "if NWS gave us sun but
// precip is highly likely, upgrade." Hourly behavior unchanged.
const HIGH_PRECIP_THRESHOLD = 50;
```

Add at the bottom of the file, after `mapNwsIcon`:

```typescript
function pickPrecipIcon(shortForecast: string | undefined): IconCode {
  // Keyword-match the NWS forecast text. Order matters: thunder beats
  // snow beats rain — convective storms are the dominant signal.
  const fc = (shortForecast ?? '').toLowerCase();
  if (fc.includes('thunder')) return 'thunder';
  if (fc.includes('snow') || fc.includes('flurries') || fc.includes('blizzard')) return 'snow';
  return 'rain';
}

export function mapNwsDailyIcon(
  url: string,
  precipProb?: number | null,
  shortForecast?: string,
): IconCode {
  const baseIcon = mapNwsIcon(url, precipProb);

  if (precipProb == null || precipProb < HIGH_PRECIP_THRESHOLD) return baseIcon;

  // Already a precip icon (or fog, which is a visibility indicator we
  // preserve rather than override) — no upgrade needed.
  if (baseIcon === 'rain' || baseIcon === 'snow' || baseIcon === 'thunder' || baseIcon === 'fog') {
    return baseIcon;
  }

  return pickPrecipIcon(shortForecast);
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test -- server/nws/icon-mapping.test.ts`

Expected: all tests pass (existing + new).

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npm test`

Expected: all tests pass. (If first run shows the transient "No test suite found" glitch, re-run — known Windows issue.)

- [ ] **Step 6: Commit**

```bash
git add server/nws/icon-mapping.ts server/nws/icon-mapping.test.ts
git commit -m "Add mapNwsDailyIcon with high-precip upgrade rule

Daily forecast periods with precipProb >= 50% and a non-precip
NWS-chosen icon (sun/moon/partly-*/cloud) upgrade to rain/snow/thunder
based on shortForecast keyword match. Mirror of the existing hourly
downgrade rule, inverted. Fog and existing precip icons pass through
unchanged. Hourly + current behavior unaffected."
```

---

## Task 2: Wire normalizer call sites

**Files:**
- Modify: `server/nws/normalizer.ts`

- [ ] **Step 1: Update the import**

At the top of `server/nws/normalizer.ts`, find the existing import (line 6):

```typescript
import { mapNwsIcon } from './icon-mapping';
```

Replace with:

```typescript
import { mapNwsIcon, mapNwsDailyIcon } from './icon-mapping';
```

- [ ] **Step 2: Swap the three daily call sites**

There are exactly three daily-period icon assignments in `normalizer.ts` (lines 413, 436, 450 in the current file). Each currently looks like:

```typescript
iconCode: mapNwsIcon(a.icon, pairProb),
// or
iconCode: mapNwsIcon(a.icon, nightProb),
// or
iconCode: mapNwsIcon(a.icon, dayProb),
```

For each of these three sites, swap to `mapNwsDailyIcon` and pass the corresponding `shortForecast`. The shortForecast string is available in the same surrounding context as the precipProb — look at lines 415, 438, 452 which already reference `a.shortForecast` for `shortDescription`.

After the change, each daily call site reads:

```typescript
iconCode: mapNwsDailyIcon(a.icon, pairProb, a.shortForecast),
// or
iconCode: mapNwsDailyIcon(a.icon, nightProb, a.shortForecast),
// or
iconCode: mapNwsDailyIcon(a.icon, dayProb, a.shortForecast),
```

**Do NOT change** the hourly call site (line 289: `mapNwsIcon(p.icon, p.probabilityOfPrecipitation?.value ?? null)`) or the current-conditions call site (line 378: `mapNwsIcon(obs.icon)`). Those keep `mapNwsIcon`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`

Expected: typecheck clean, all tests pass.

Manually confirm by grepping: `git diff server/nws/normalizer.ts` should show exactly 4 changed lines (1 import + 3 daily call sites). The hourly + current-conditions call sites should be untouched.

- [ ] **Step 4: Commit**

```bash
git add server/nws/normalizer.ts
git commit -m "Use mapNwsDailyIcon for daily forecast periods

Swaps the three daily-period icon assignments to use the new
mapNwsDailyIcon. Hourly forecast and current-conditions assignments
keep using mapNwsIcon (unchanged). Daily periods now get appropriate
precip icons when precipProb is high but NWS chose a non-precip icon."
```

---

## Task 3: Wire `data-clear` on the hero icon container

**Files:**
- Modify: `client/components/CurrentPanel.tsx`

- [ ] **Step 1: Add the data attribute**

In `client/components/CurrentPanel.tsx`, find the existing `.hud-hero-icon` container (currently a single line near the bottom of the hero JSX):

```tsx
<div className="hud-hero-icon">
  <WxIcon code={current.iconCode} size={112} />
</div>
```

Replace with:

```tsx
<div
  className="hud-hero-icon"
  data-clear={current.iconCode === 'sun' || current.iconCode === 'moon' ? 'true' : 'false'}
>
  <WxIcon code={current.iconCode} size={112} />
</div>
```

The attribute is always present (either `"true"` or `"false"`) rather than conditionally added — keeps the CSS selector simple (`[data-clear="true"]`) and avoids React's quirky boolean-attribute serialization.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: clean.

Do NOT commit yet — Task 4 adds the matching CSS rule and they form a single logical change. Commit after Task 4.

---

## Task 4: CSS rule for centered clear-sky icon + commit Tasks 3+4

**Files:**
- Modify: `client/styles/hud.css`

- [ ] **Step 1: Add the centering rule**

In `client/styles/hud.css`, find the existing `.hud-hero-icon` block (currently lines 267-271):

```css
.hud-hero-icon {
  color: var(--accent);
  filter: drop-shadow(0 0 8px var(--accent-glow-soft));
  flex-shrink: 0;
}
```

Add the following NEW rule immediately after it (do not modify the existing block):

```css
.hud-hero-icon[data-clear="true"] {
  flex-grow: 1;
  display: flex;
  justify-content: center;
}
```

The default behavior (non-clear icons) is unchanged: `.hud-hero-icon` is a non-growing flex child sitting to the right of the readout. When `data-clear="true"`, the icon container expands to fill available space (`flex-grow: 1`) and centers its SVG child horizontally (`display: flex; justify-content: center`). The vertical centering is already handled by the parent `.hud-hero` rule's `align-items: center`.

This is a minimal first-pass implementation. The exact visual result may want tuning during the smoke test — adjust `flex-grow` value, add `justify-self`, or revisit if the icon ends up too far from the readout.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`

Expected: typecheck clean, tests pass.

- [ ] **Step 3: Commit Tasks 3 + 4 together**

```bash
git add client/components/CurrentPanel.tsx client/styles/hud.css
git commit -m "Center hero icon when current conditions are clear sky

Sets data-clear='true' on the hero icon container when the icon code
is sun or moon. New CSS rule expands and centers the icon container in
that case. Other icons (cloudy, precip, etc.) render with the existing
right-aligned flex layout. Pure presentation change; no data flow
impact."
```

---

## Task 5: Smoke test + PROJECT_STATUS.md update + 2c deferral note

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Smoke test in dev**

Run `npm run start:prod` (builds client + serves on port 3000) and open the dashboard in a browser.

Test 2a (daily icon override):

If real weather conditions don't show a discrepancy currently, you can verify the logic is wired up correctly by:
1. Watching the 7-day outlook over the next several days — any day with high precip% (≥50) should show rain/snow/thunder, never sun/partly-cloudy. If you previously saw a sun-with-90%-rain mismatch, that's now fixed.
2. Or check the network tab: `GET /api/weather` response, look at `daily[*].iconCode` values vs `daily[*].precipProbPct` and `daily[*].shortDescription`. Any daily period with `precipProbPct >= 50` and a non-precip icon (sun/moon/partly-*/cloud) is a bug — should show rain/snow/thunder.

Test 2b (centered clear-sky icon):

1. View the Current panel.
2. **If current conditions are clear (sun or moon shown):** confirm the icon is now visually centered in the hero area (taking up the right-side space, not crammed to the right edge).
3. **If current conditions are not clear (cloudy/rainy/etc.):** confirm icon renders unchanged from before (right-aligned).
4. The visual centering may need adjustment — if the icon looks awkward (too far from readout, too small relative to its space), note what feels off and we can tweak the CSS in a follow-up commit.

Stop the dev server with Ctrl+C when done.

- [ ] **Step 2: Update PROJECT_STATUS.md**

Add a new entry under "Implemented features" matching the format of the existing "### °F/°C toggle (post-v1.1)" entry. Suggested:

```markdown
### Icon presentation fixes (post-v1.1)
- Daily forecast icons upgrade to rain/snow/thunder when precipProb >= 50% and NWS chose a non-precip icon. Picks target via shortForecast keyword match. Hourly + current-conditions behavior unchanged. (PR #?, 2026-04-18)
- Hero icon centers in the CurrentPanel hero area when current conditions are clear sky (sun/moon). (PR #?, 2026-04-18)
```

Replace `PR #?` with the actual PR number when opening the PR (likely PR #7).

Also update the "What's pending → Future version backlog" section to add a note about deferred 2c. Find the section and add this bullet:

```markdown
- **Icon set expansion (v1.2 Section 2c):** New SVG icons for the ~25 NWS weather states currently lumped or falling through to generic cloud (tornado, hurricane, sleet, wind variants, etc.). Gap list at `docs/icon-gaps.md`. Deferred pending user-produced icon art.
```

- [ ] **Step 3: Final commit**

```bash
git add PROJECT_STATUS.md
git commit -m "Document icon fixes and defer icon-set expansion to backlog"
```

- [ ] **Step 4: Verify clean state**

Run: `git status && npm test && npm run typecheck`

Expected: working tree clean, all tests pass, typecheck passes. (Re-run npm test if it hits the transient first-run glitch.)

---

## Done

Feature branch ready for the orchestrator's branch-finishing flow.
