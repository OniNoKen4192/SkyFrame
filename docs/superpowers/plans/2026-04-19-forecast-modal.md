# NWS Narrative Forecast Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Feature 5 from the v1.2 roadmap — clicking a `▸` button in the TopBar or a day row in the 7-day outlook opens a terminal-styled modal showing NWS's human-written day/night forecast narratives for the selected date.

**Architecture:** Reuse the `TerminalModal` primitive shipped in Feature 4. Add four nullable narrative/period-name fields to `DailyPeriod` plus a `forecastGeneratedAt` timestamp to `WeatherMeta`. A stateless `ForecastBody` renders the day + night sections inside the modal; a stateless `ForecastButton` provides the TopBar trigger. `App` owns a discriminated-union `forecastTrigger` state that drives the title text (`TODAY` vs `FRI APR 17`) and resolves the selected `DailyPeriod`.

**Tech Stack:** React 18, TypeScript, Vitest (node env), Fastify (server), NWS `/gridpoints/{office}/{gx},{gy}/forecast` endpoint.

**Design spec:** [`docs/superpowers/specs/2026-04-19-forecast-modal-design.md`](../specs/2026-04-19-forecast-modal-design.md)

**Branch:** `feat/forecast-modal` (already created off `main`).

---

## Pre-work checklist

- [ ] On branch `feat/forecast-modal`: run `git branch --show-current`, expect `feat/forecast-modal`
- [ ] Working tree clean: run `git status`, expect `nothing to commit, working tree clean`
- [ ] Tests green: run `npm test`, expect 217 passing
- [ ] Typecheck green: run `npm run typecheck`, expect no errors

---

## Task 1: Data layer — `DailyPeriod` + `WeatherMeta` + normalizer + fixtures + tests

**Files:**
- Modify: `shared/types.ts` — add 4 fields to `DailyPeriod`, 1 field to `WeatherMeta`
- Modify: `server/nws/normalizer.ts` — extend `NwsForecastResponse`, populate new DailyPeriod fields, surface `forecastGeneratedAt`
- Modify: `server/nws/normalizer.test.ts` — extend existing fixtures with the new NWS fields, add new tests

### Steps

- [ ] **Step 1.1: Update existing fixtures to include the new NWS fields (prerequisite, or tests won't even compile once types change)**

In `server/nws/normalizer.test.ts`, replace the existing `FIXTURE_FORECAST` constant (currently around lines 21-30) with:

```typescript
const FIXTURE_FORECAST = {
  properties: {
    generatedAt: '2026-04-15T13:30:00Z',
    periods: [
      { name: 'This Afternoon', startTime: '2026-04-15T14:00:00-05:00', endTime: '2026-04-15T18:00:00-05:00', isDaytime: true,  temperature: 68, shortForecast: 'Mostly Cloudy', detailedForecast: 'Mostly cloudy this afternoon. High near 68. West wind 10 to 15 mph.', icon: 'https://api.weather.gov/icons/land/day/bkn?size=medium',  probabilityOfPrecipitation: { value: 20 } },
      { name: 'Tonight',        startTime: '2026-04-15T18:00:00-05:00', endTime: '2026-04-16T06:00:00-05:00', isDaytime: false, temperature: 52, shortForecast: 'Cloudy',        detailedForecast: 'Cloudy tonight. Low around 52. Northwest wind 5 to 10 mph.',      icon: 'https://api.weather.gov/icons/land/night/bkn?size=medium', probabilityOfPrecipitation: { value: 20 } },
      { name: 'Thursday',       startTime: '2026-04-16T06:00:00-05:00', endTime: '2026-04-16T18:00:00-05:00', isDaytime: true,  temperature: 62, shortForecast: 'Rain Likely',   detailedForecast: 'Rain likely Thursday. High near 62. Chance of precipitation is 70%.', icon: 'https://api.weather.gov/icons/land/day/rain,70?size=medium', probabilityOfPrecipitation: { value: 70 } },
      { name: 'Thursday Night', startTime: '2026-04-16T18:00:00-05:00', endTime: '2026-04-17T06:00:00-05:00', isDaytime: false, temperature: 48, shortForecast: 'Rain',          detailedForecast: 'Rain Thursday night. Low around 48.',                                icon: 'https://api.weather.gov/icons/land/night/rain?size=medium',   probabilityOfPrecipitation: { value: 70 } },
    ],
  },
};
```

Now replace `FIXTURE_FORECAST_OVERNIGHT` (currently around lines 607-617) with:

```typescript
const FIXTURE_FORECAST_OVERNIGHT = {
  properties: {
    generatedAt: '2026-04-16T00:10:00Z',
    periods: [
      { name: 'Overnight',      startTime: '2026-04-16T00:00:00-05:00', endTime: '2026-04-16T06:00:00-05:00', isDaytime: false, temperature: 50, shortForecast: 'Mostly Clear', detailedForecast: 'Mostly clear overnight. Low around 50.',         icon: 'https://api.weather.gov/icons/land/night/few?size=medium', probabilityOfPrecipitation: { value: 5 } },
      { name: 'Thursday',       startTime: '2026-04-16T06:00:00-05:00', endTime: '2026-04-16T18:00:00-05:00', isDaytime: true,  temperature: 65, shortForecast: 'Sunny',        detailedForecast: 'Sunny Thursday. High near 65.',                   icon: 'https://api.weather.gov/icons/land/day/few?size=medium',   probabilityOfPrecipitation: { value: 0 } },
      { name: 'Thursday Night', startTime: '2026-04-16T18:00:00-05:00', endTime: '2026-04-17T06:00:00-05:00', isDaytime: false, temperature: 48, shortForecast: 'Cloudy',       detailedForecast: 'Cloudy Thursday night. Low around 48.',           icon: 'https://api.weather.gov/icons/land/night/bkn?size=medium', probabilityOfPrecipitation: { value: 10 } },
      { name: 'Friday',         startTime: '2026-04-17T06:00:00-05:00', endTime: '2026-04-17T18:00:00-05:00', isDaytime: true,  temperature: 70, shortForecast: 'Sunny',        detailedForecast: 'Sunny Friday. High near 70.',                     icon: 'https://api.weather.gov/icons/land/day/few?size=medium',   probabilityOfPrecipitation: { value: 5 } },
      { name: 'Friday Night',   startTime: '2026-04-17T18:00:00-05:00', endTime: '2026-04-18T06:00:00-05:00', isDaytime: false, temperature: 52, shortForecast: 'Clear',        detailedForecast: 'Clear Friday night. Low around 52.',              icon: 'https://api.weather.gov/icons/land/night/skc?size=medium', probabilityOfPrecipitation: { value: 0 } },
    ],
  },
};
```

Now replace `FIXTURE_FORECAST_LATE_EVENING` (currently around lines 622-630) with:

```typescript
const FIXTURE_FORECAST_LATE_EVENING = {
  properties: {
    generatedAt: '2026-04-16T22:10:00Z',
    periods: [
      { name: 'Tonight',      startTime: '2026-04-16T22:00:00-05:00', endTime: '2026-04-17T06:00:00-05:00', isDaytime: false, temperature: 47, shortForecast: 'Clear', detailedForecast: 'Clear tonight. Low around 47.',  icon: 'https://api.weather.gov/icons/land/night/skc?size=medium', probabilityOfPrecipitation: { value: 0 } },
      { name: 'Friday',       startTime: '2026-04-17T06:00:00-05:00', endTime: '2026-04-17T18:00:00-05:00', isDaytime: true,  temperature: 70, shortForecast: 'Sunny', detailedForecast: 'Sunny Friday. High near 70.',    icon: 'https://api.weather.gov/icons/land/day/few?size=medium',   probabilityOfPrecipitation: { value: 5 } },
      { name: 'Friday Night', startTime: '2026-04-17T18:00:00-05:00', endTime: '2026-04-18T06:00:00-05:00', isDaytime: false, temperature: 52, shortForecast: 'Clear', detailedForecast: 'Clear Friday night. Low near 52.', icon: 'https://api.weather.gov/icons/land/night/skc?size=medium', probabilityOfPrecipitation: { value: 0 } },
    ],
  },
};
```

Don't commit yet — we need types, normalizer, and tests aligned before anything compiles.

- [ ] **Step 1.2: Write the failing tests**

Append these tests to `server/nws/normalizer.test.ts`. They go at the end of the existing `describe('normalizeWeather', ...)` block (i.e., before the final `});` that closes the outer describe — there is already one at the file's end around after the overnight/late-evening orphan block). Find where the outer describe closes and add this block just before that closing `});`:

```typescript
  describe('forecast narratives and generatedAt', () => {
    function mockWithForecast(forecast: typeof FIXTURE_FORECAST) {
      vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
        if (path.includes('/points/')) return FIXTURE_POINT as never;
        if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
        if (path.includes('/forecast')) return forecast as never;
        if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
        if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
        if (path.includes('/alerts/active')) return { features: [] } as never;
        throw new Error('Unexpected path: ' + path);
      });
    }

    it('populates dayDetailedForecast and nightDetailedForecast from a day+night pair', async () => {
      mockWithForecast(FIXTURE_FORECAST);
      const result = await normalizeWeather();

      expect(result.daily[0]!.dayDetailedForecast).toBe('Mostly cloudy this afternoon. High near 68. West wind 10 to 15 mph.');
      expect(result.daily[0]!.nightDetailedForecast).toBe('Cloudy tonight. Low around 52. Northwest wind 5 to 10 mph.');
    });

    it('populates dayPeriodName and nightPeriodName from the NWS period name field', async () => {
      mockWithForecast(FIXTURE_FORECAST);
      const result = await normalizeWeather();

      expect(result.daily[0]!.dayPeriodName).toBe('This Afternoon');
      expect(result.daily[0]!.nightPeriodName).toBe('Tonight');
      expect(result.daily[1]!.dayPeriodName).toBe('Thursday');
      expect(result.daily[1]!.nightPeriodName).toBe('Thursday Night');
    });

    it('leaves day fields null for a standalone-night orphan at the start of the window', async () => {
      mockWithForecast(FIXTURE_FORECAST_LATE_EVENING);
      const result = await normalizeWeather();

      // First row is the "Tonight" orphan.
      expect(result.daily[0]!.dayDetailedForecast).toBeNull();
      expect(result.daily[0]!.dayPeriodName).toBeNull();
      expect(result.daily[0]!.nightDetailedForecast).toBe('Clear tonight. Low around 47.');
      expect(result.daily[0]!.nightPeriodName).toBe('Tonight');
    });

    it('surfaces the forecast generatedAt as meta.forecastGeneratedAt', async () => {
      mockWithForecast(FIXTURE_FORECAST);
      const result = await normalizeWeather();

      expect(result.meta.forecastGeneratedAt).toBe('2026-04-15T13:30:00Z');
    });
  });
```

Note: we're deliberately not adding a dedicated "end-of-window day-only orphan" test because all existing fixtures only produce that path when the forecast ends on a day period — none of the current fixtures happen to. If the orphan-day-at-end path needs coverage later, a new fixture can be added then. The `else` branch in `collapseDailyPeriods` is still covered structurally by the type changes.

- [ ] **Step 1.3: Run tests to verify they fail**

Run: `npm test -- server/nws/normalizer.test.ts`

Expected: the four new tests fail because the types don't yet declare the new fields, the normalizer doesn't populate them, and TypeScript likely refuses to compile the test file because `dayDetailedForecast` etc. don't exist on `DailyPeriod` yet. Both compile failures and test failures are acceptable "failures" for the TDD red step.

- [ ] **Step 1.4: Update the types**

In `shared/types.ts`, modify the `DailyPeriod` interface (currently lines 56-65) to add four new fields. The final interface should be:

```typescript
export interface DailyPeriod {
  dateISO: string;
  dayOfWeek: string;
  dateLabel: string;
  highF: number;
  lowF: number;
  iconCode: IconCode;
  precipProbPct: number;
  shortDescription: string;
  dayDetailedForecast: string | null;    // NEW — NWS detailed narrative for the day period
  nightDetailedForecast: string | null;  // NEW — NWS detailed narrative for the night period
  dayPeriodName: string | null;          // NEW — NWS period name ("This Afternoon", "Friday")
  nightPeriodName: string | null;        // NEW — NWS period name ("Tonight", "Friday Night")
}
```

Then modify the `WeatherMeta` interface (currently lines 67-74) to add the timestamp:

```typescript
export interface WeatherMeta {
  fetchedAt: string;
  nextRefreshAt: string;
  cacheHit: boolean;
  stationId: string;
  locationName: string;
  forecastGeneratedAt: string;  // NEW — NWS top-level generatedAt from /gridpoints/.../forecast
  error?: 'rate_limited' | 'upstream_malformed' | 'station_fallback' | 'partial';
}
```

- [ ] **Step 1.5: Update the NWS response interface**

In `server/nws/normalizer.ts`, modify `NwsForecastResponse` (currently around lines 88-101) to require `generatedAt`, `name`, and `detailedForecast`:

```typescript
interface NwsForecastResponse {
  properties: {
    generatedAt: string;
    periods: Array<{
      name: string;
      startTime: string;
      endTime: string;
      isDaytime: boolean;
      temperature: number;
      shortForecast: string;
      detailedForecast: string;
      icon: string;
      probabilityOfPrecipitation?: { value: number | null };
    }>;
  };
}
```

- [ ] **Step 1.6: Populate new fields in `collapseDailyPeriods`**

In `server/nws/normalizer.ts`, update each of the three `daily.push({ ... })` calls inside `collapseDailyPeriods` (currently around lines 409, 432, 446). Each call needs four new fields added:

**The day+night pair branch** (currently around lines 406-419 — replace the `daily.push({ ... })` with):

```typescript
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: b.temperature,
        iconCode: mapNwsDailyIcon(a.icon, pairProb, a.shortForecast),
        precipProbPct: pairProb,
        shortDescription: a.shortForecast,
        dayDetailedForecast: a.detailedForecast,
        nightDetailedForecast: b.detailedForecast,
        dayPeriodName: a.name,
        nightPeriodName: b.name,
      });
```

**The standalone-night orphan branch** (currently around lines 429-441 — replace the `daily.push({ ... })` with):

```typescript
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: a.temperature,
        iconCode: mapNwsDailyIcon(a.icon, nightProb, a.shortForecast),
        precipProbPct: nightProb,
        shortDescription: a.shortForecast,
        dayDetailedForecast: null,
        nightDetailedForecast: a.detailedForecast,
        dayPeriodName: null,
        nightPeriodName: a.name,
      });
```

**The orphan-day-at-end branch** (currently around lines 443-455 — replace the `daily.push({ ... })` with):

```typescript
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: a.temperature,
        iconCode: mapNwsDailyIcon(a.icon, dayProb, a.shortForecast),
        precipProbPct: dayProb,
        shortDescription: a.shortForecast,
        dayDetailedForecast: a.detailedForecast,
        nightDetailedForecast: null,
        dayPeriodName: a.name,
        nightPeriodName: null,
      });
```

- [ ] **Step 1.7: Surface `forecastGeneratedAt` in `normalizeWeather`**

In `server/nws/normalizer.ts`, modify the `meta` object assembly in `normalizeWeather` (currently around lines 310-317). Change from:

```typescript
  const meta = {
    fetchedAt: now.toISOString(),
    nextRefreshAt: new Date(now.getTime() + CONFIG.cache.observationMs).toISOString(),
    cacheHit: false,
    stationId: activeStationId,
    locationName: CONFIG.location.name,
    ...(metaError ? { error: metaError } : {}),
  };
```

to:

```typescript
  const meta = {
    fetchedAt: now.toISOString(),
    nextRefreshAt: new Date(now.getTime() + CONFIG.cache.observationMs).toISOString(),
    cacheHit: false,
    stationId: activeStationId,
    locationName: CONFIG.location.name,
    forecastGeneratedAt: forecast.properties.generatedAt,
    ...(metaError ? { error: metaError } : {}),
  };
```

- [ ] **Step 1.8: Run tests and typecheck**

Run: `npm test -- server/nws/normalizer.test.ts`
Expected: the four new tests PASS. All existing tests still PASS.

Run: `npm run typecheck`
Expected: no errors.

Run the full suite: `npm test`
Expected: 221 tests pass (the previous 217 plus the 4 new).

- [ ] **Step 1.9: Commit**

```bash
git add shared/types.ts server/nws/normalizer.ts server/nws/normalizer.test.ts
git commit -m "$(cat <<'EOF'
Surface NWS forecast narratives and generatedAt for Feature 5

DailyPeriod gains four nullable fields — dayDetailedForecast,
nightDetailedForecast, dayPeriodName, nightPeriodName — populated
by collapseDailyPeriods from the relevant NWS period(s). Orphan
cases (standalone Tonight at start, day-only at end of window)
get null for the missing half.

WeatherMeta gains forecastGeneratedAt, piped from the forecast
response's top-level generatedAt.

Fixtures updated with the new NWS fields (generatedAt at
properties level, detailedForecast on each period). Four new
tests cover the happy-path pair, period-name preservation, the
night-orphan case, and the generatedAt pipeline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `ForecastBody` component + stylesheet

**Files:**
- Create: `client/components/ForecastBody.tsx`
- Modify: `client/styles/terminal-modal.css` (append)

No unit tests — per the project's "test pure logic, validate React manually" discipline. This component has no pure logic worth extracting.

### Steps

- [ ] **Step 2.1: Create `ForecastBody.tsx`**

Create `client/components/ForecastBody.tsx`:

```typescript
import type { DailyPeriod } from '../../shared/types';

interface ForecastBodyProps {
  period: DailyPeriod;
}

export function ForecastBody({ period }: ForecastBodyProps) {
  return (
    <>
      {period.dayPeriodName && period.dayDetailedForecast && (
        <>
          <h3 className="forecast-section-header">{period.dayPeriodName.toUpperCase()}</h3>
          <p className="forecast-narrative">{period.dayDetailedForecast}</p>
        </>
      )}
      {period.nightPeriodName && period.nightDetailedForecast && (
        <>
          <h3 className="forecast-section-header">{period.nightPeriodName.toUpperCase()}</h3>
          <p className="forecast-narrative">{period.nightDetailedForecast}</p>
        </>
      )}
    </>
  );
}
```

Both fields of each pair are checked — when one is non-null the other should be too in practice, but this defends against a malformed NWS response where they diverge.

- [ ] **Step 2.2: Append styles to `terminal-modal.css`**

Append to the end of `client/styles/terminal-modal.css`:

```css
/* Forecast-narrative content styles (v1.2 Feature 5). Lives with
   the modal stylesheet for the same reason the alert-detail
   styles do — tight coupling to modal-body layout. */
.forecast-section-header {
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin: 0 0 8px;
}

.forecast-section-header:not(:first-child) {
  margin-top: 16px;
}

.forecast-narrative {
  margin: 0 0 9px;
  white-space: pre-wrap;
}
```

- [ ] **Step 2.3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
git add client/components/ForecastBody.tsx client/styles/terminal-modal.css
git commit -m "$(cat <<'EOF'
Add ForecastBody modal content component

Renders the day and night narrative sections for a single
DailyPeriod inside the TerminalModal shell. Thin, stateless —
skips the day or night half when the corresponding period is
orphaned (null fields). Section headers reuse the modal's accent
CSS variable, so forecast bodies pick up base cyan while alert
bodies pick up the tier color — same markup, different consumer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ForecastButton` component + TopBar styling

**Files:**
- Create: `client/components/ForecastButton.tsx`
- Modify: `client/styles/hud.css` (append)

### Steps

- [ ] **Step 3.1: Create `ForecastButton.tsx`**

Create `client/components/ForecastButton.tsx`:

```typescript
interface ForecastButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function ForecastButton({ onClick, disabled = false }: ForecastButtonProps) {
  return (
    <button
      type="button"
      className="hud-topbar-forecast"
      onClick={onClick}
      disabled={disabled}
      aria-label="Open today's forecast narrative"
      title="Open today's forecast narrative"
    >
      ▸
    </button>
  );
}
```

- [ ] **Step 3.2: Append styles to `hud.css`**

Append to the end of `client/styles/hud.css`:

```css
/* ============================================================
   TopBar forecast button (v1.2 Feature 5). Opens today's
   forecast narrative in a TerminalModal. Muted by default,
   brightens on hover — HUD aesthetic, not a primary action.
   ============================================================ */
.hud-topbar-forecast {
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
}

.hud-topbar-forecast:hover:not(:disabled) {
  opacity: 1;
}

.hud-topbar-forecast:disabled {
  cursor: not-allowed;
  opacity: 0.25;
}

.hud-topbar-forecast:focus-visible {
  outline: 1px dashed currentColor;
  outline-offset: 2px;
}
```

- [ ] **Step 3.3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3.4: Commit**

```bash
git add client/components/ForecastButton.tsx client/styles/hud.css
git commit -m "$(cat <<'EOF'
Add ForecastButton TopBar trigger

Stateless ▸ glyph button that opens today's forecast narrative.
Muted by default with base-accent color and glow, brightens on
hover, disabled state for the no-data case. aria-label and title
attribute give the icon a clear name for screen readers and
tooltip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Compound integration — `OutlookPanel` + `TopBar` + `App.tsx` + outlook-trigger styling

This task is committed as a single coherent change because the props added to `OutlookPanel` and `TopBar` are required, and only `App.tsx` supplies them. Typecheck will fail between sub-steps until all three are applied.

**Files:**
- Modify: `client/components/OutlookPanel.tsx`
- Modify: `client/components/TopBar.tsx`
- Modify: `client/App.tsx`
- Modify: `client/styles/hud.css` (append `.outlook-date-trigger` styles)

### Steps

- [ ] **Step 4.1: Modify `OutlookPanel.tsx` — date labels become clickable triggers**

Replace the entire contents of `client/components/OutlookPanel.tsx` with:

```typescript
import type { DailyPeriod } from '../../shared/types';
import { convertTempF, type TempUnit } from '../../shared/units';
import { WxIcon } from './WxIcon';

interface OutlookPanelProps {
  daily: DailyPeriod[];
  units: TempUnit;
  onOpenForecastDay: (dateISO: string) => void;
}

function precipClass(pct: number): string {
  if (pct >= 50) return 'precip high';
  if (pct >= 26) return 'precip med';
  if (pct >= 10) return 'precip low';
  return 'precip zero';
}

export function OutlookPanel({ daily, units, onOpenForecastDay }: OutlookPanelProps) {
  if (daily.length === 0) return null;

  // Compute shared scale from all days' highs/lows in chosen unit
  const lows = daily.map((d) => convertTempF(d.lowF, units));
  const highs = daily.map((d) => convertTempF(d.highF, units));
  const scaleMin = Math.floor(Math.min(...lows) / 2) * 2;
  const scaleMax = Math.ceil(Math.max(...highs) / 2) * 2;
  const scaleRange = Math.max(1, scaleMax - scaleMin);

  const scalePoints = [
    scaleMin,
    Math.round(scaleMin + scaleRange * 0.25),
    Math.round(scaleMin + scaleRange * 0.5),
    Math.round(scaleMin + scaleRange * 0.75),
    scaleMax,
  ];

  return (
    <div className="hud-outlook-section">
      <div className="hud-section-label">
        <span>■ 7-DAY OUTLOOK &nbsp;·&nbsp; KMKE &nbsp;/&nbsp; MKX GRID 88,58 &nbsp;/&nbsp; WIZ066</span>
        <span>RANGE {scaleMin}° — {scaleMax}°{units}</span>
      </div>

      <div className="outlook-scale">
        <div></div><div></div><div></div>
        <div className="scale-axis">
          {scalePoints.map((n) => <span key={n}>{n}°</span>)}
        </div>
        <div></div>
      </div>

      <div className="outlook">
        {daily.map((day) => {
          const lo = convertTempF(day.lowF, units);
          const hi = convertTempF(day.highF, units);
          const leftPct = ((lo - scaleMin) / scaleRange) * 100;
          const rightPct = ((scaleMax - hi) / scaleRange) * 100;

          return (
            <OutlookRow
              key={day.dateISO}
              day={day}
              displayLow={Math.round(lo)}
              displayHigh={Math.round(hi)}
              leftPct={leftPct}
              rightPct={rightPct}
              onOpenForecastDay={onOpenForecastDay}
            />
          );
        })}
      </div>
    </div>
  );
}

interface OutlookRowProps {
  day: DailyPeriod;
  displayLow: number;
  displayHigh: number;
  leftPct: number;
  rightPct: number;
  onOpenForecastDay: (dateISO: string) => void;
}

function OutlookRow({ day, displayLow, displayHigh, leftPct, rightPct, onOpenForecastDay }: OutlookRowProps) {
  return (
    <>
      <div className="date">
        <button
          type="button"
          className="outlook-date-trigger"
          onClick={() => onOpenForecastDay(day.dateISO)}
          aria-label={`Show forecast narrative for ${day.dayOfWeek} ${day.dateLabel}`}
        >
          <span className="dow">{day.dayOfWeek}</span>
          <span className="dot">·</span>
          <span className="dt">{day.dateLabel}</span>
        </button>
      </div>
      <div className="icon">
        <WxIcon code={day.iconCode} size={30} />
      </div>
      <div className={precipClass(day.precipProbPct)}>
        {day.precipProbPct}%
      </div>
      <div className="range">
        <div className="seg" style={{ left: `${leftPct}%`, right: `${rightPct}%` }}></div>
        <div className="tick" style={{ left: `${leftPct}%` }}></div>
        <div className="tick" style={{ left: `${100 - rightPct}%` }}></div>
      </div>
      <div className="lh">
        <span className="l">{displayLow}</span>
        <span className="sep">·</span>
        <span className="h">{displayHigh}</span>
      </div>
    </>
  );
}
```

Key changes:
- New `onOpenForecastDay: (dateISO: string) => void` prop on `OutlookPanelProps` and `OutlookRowProps`
- The three spans that used to be direct children of `<div className="date">` are now wrapped in a `<button class="outlook-date-trigger">` whose click calls `onOpenForecastDay(day.dateISO)`
- `aria-label` describes the action in terms of the day being clicked

- [ ] **Step 4.2: Append `.outlook-date-trigger` styles to `hud.css`**

Append to the end of `client/styles/hud.css`:

```css
/* ============================================================
   Clickable outlook day labels (v1.2 Feature 5). Opens the
   forecast narrative modal for that specific day. Mirrors the
   .alert-banner-event-trigger pattern from Feature 4 — inline
   button that looks like text, underline-on-hover.
   ============================================================ */
.outlook-date-trigger {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  padding: 0;
  cursor: pointer;
  text-shadow: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.outlook-date-trigger:hover {
  text-decoration: underline;
}

.outlook-date-trigger:focus-visible {
  outline: 1px dashed currentColor;
  outline-offset: 2px;
}
```

The `display: inline-flex` + `gap` preserves the layout of the three inner spans (`dow`, `dot`, `dt`) since the wrapping button is now the flex container rather than the parent `<div class="date">`.

- [ ] **Step 4.3: Modify `TopBar.tsx` — render `ForecastButton` in a right-side cluster**

Replace the entire contents of `client/components/TopBar.tsx` with:

```typescript
import { useEffect, useState } from 'react';
import type { ViewKey } from '../App';
import { ForecastButton } from './ForecastButton';

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

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

interface TopBarProps {
  stationId: string | null;
  error: string | null;
  locationName: string;
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onLocationClick: () => void;
  onOpenForecastToday: () => void;
  forecastButtonDisabled: boolean;
}

const TABS: Array<{ key: ViewKey; label: string }> = [
  { key: 'current', label: 'CURRENT' },
  { key: 'hourly',  label: 'HOURLY' },
  { key: 'outlook', label: 'OUTLOOK' },
  { key: 'all',     label: 'ALL' },
];

export function TopBar({
  stationId,
  error,
  locationName,
  activeView,
  onViewChange,
  onLocationClick,
  onOpenForecastToday,
  forecastButtonDisabled,
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = partsToMap(TIME_FORMAT.formatToParts(now));
  const d = partsToMap(DATE_FORMAT.formatToParts(now));

  const digits = `${t.hour}:${t.minute}:${t.second}`;
  const tz = t.timeZoneName ?? '';
  const dateStr = `${d.weekday?.toUpperCase() ?? ''} · ${d.month?.toUpperCase() ?? ''} ${d.day ?? ''} · ${d.year ?? ''}`;

  const linkText = error || !stationId ? 'LINK.OFFLINE' : `LINK.${stationId}`;
  const offline = error || !stationId;
  const linkClass = offline ? 'link link-offline' : 'link';
  const locClass = offline ? 'loc loc-offline' : 'loc';

  return (
    <div className="hud-topbar">
      <div className="hud-topbar-left">
        <div className={locClass}>
          <span className="loc-brand">■ SKYFRAME\\</span> &nbsp;·&nbsp;
          <span className="loc-link" onClick={onLocationClick} role="button" tabIndex={0}>
            {locationName || 'SET LOCATION'} ✎
          </span>
          &nbsp;·&nbsp;
          <span className={linkClass}>{linkText}</span>
        </div>
        <nav className="tabs" aria-label="View selector">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeView ? 'tab tab-active' : 'tab'}
              onClick={() => onViewChange(tab.key)}
              aria-pressed={tab.key === activeView}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="hud-topbar-right">
        <ForecastButton onClick={onOpenForecastToday} disabled={forecastButtonDisabled} />
        <div className="clock">
          <div className="clock-time">
            <span className="clock-digits">{digits}</span>
            <span className="tz clock-tz">{tz}</span>
          </div>
          <div className="clock-date">{dateStr}</div>
        </div>
      </div>
    </div>
  );
}
```

Key changes:
- Two new props: `onOpenForecastToday: () => void` and `forecastButtonDisabled: boolean`
- Import of `ForecastButton` from its sibling file
- The `.clock` element is now wrapped alongside `<ForecastButton>` inside a new `<div className="hud-topbar-right">` cluster
- No other behavior change

Note: the existing `.hud-topbar` CSS likely uses `justify-content: space-between` on the outer flex. The new `.hud-topbar-right` becomes the right flex child (replacing the bare `.clock`), and internally uses flex-row to lay out button + clock. No stylesheet change is needed for `.hud-topbar-right` specifically if the default browser flex stacks adequately — but we'll add one rule for clarity:

Append this rule to `client/styles/hud.css` (right after the forecast-button rules added in Task 3 is fine):

```css
.hud-topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
```

- [ ] **Step 4.4: Modify `App.tsx` — forecast state, derived period, modal render**

Apply these edits to `client/App.tsx`:

**(a) Add imports** alongside existing component imports:

```typescript
import { ForecastBody } from './components/ForecastBody';
```

Note: `TerminalModal` and `formatTime` are already imported from Feature 4.

**(b) Define the `ForecastTrigger` discriminated union** at the top of the file, just after the existing `ViewKey` type export (around line 12):

```typescript
export type ForecastTrigger =
  | { kind: 'today' }
  | { kind: 'day'; dateISO: string };
```

**(c) Add state** inside `App()`, right after the existing `detailAlertId` state:

```typescript
const [forecastTrigger, setForecastTrigger] = useState<ForecastTrigger | null>(null);
```

**(d) Extract a stable `daily` const** (makes the next effect's dep-key cleaner). Find the `const alerts = data?.alerts ?? [];` line (currently around line 166) and add right after it:

```typescript
const daily = data?.daily ?? [];
```

**(e) Add a stale-trigger `useEffect`** after the existing alert stale-cleanup effect (the block ending around line 197). Use this:

```typescript
// Close the forecast modal if the day it points at falls off the
// end of the window (e.g. next-day rollover) or if the daily list
// empties entirely.
useEffect(() => {
  if (forecastTrigger === null) return;
  if (forecastTrigger.kind === 'today' && daily.length === 0) {
    setForecastTrigger(null);
    return;
  }
  if (forecastTrigger.kind === 'day' && !daily.some((d) => d.dateISO === forecastTrigger.dateISO)) {
    setForecastTrigger(null);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [daily.map((d) => d.dateISO).join('|'), forecastTrigger]);
```

**(f) Add derived values** right after the existing `detailIssuedLabel` derivation (around line 225):

```typescript
const forecastPeriod: DailyPeriod | null =
  forecastTrigger?.kind === 'today' ? (daily[0] ?? null) :
  forecastTrigger?.kind === 'day'   ? (daily.find((d) => d.dateISO === forecastTrigger.dateISO) ?? null) :
  null;

const forecastTitleText = forecastTrigger?.kind === 'today'
  ? '▸ FORECAST · TODAY'
  : forecastPeriod
  ? `▸ FORECAST · ${forecastPeriod.dayOfWeek.toUpperCase()} ${forecastPeriod.dateLabel.toUpperCase()}`
  : '';

const forecastGeneratedLabel = data?.meta?.forecastGeneratedAt
  ? formatTime(data.meta.forecastGeneratedAt)
  : '';
```

And add this import to the same file if not already present (it likely IS, since Feature 4 imports it):

```typescript
import type { DailyPeriod } from '../shared/types';
```

If the existing imports don't include `DailyPeriod` specifically, add it to the existing `import type { ... }` block rather than creating a new line.

**(g) Wire up `OutlookPanel`** — find the three places it's rendered in `renderView()` (currently at lines ~150 and ~155 within the `'outlook'` and `'all'` cases). Replace each `<OutlookPanel daily={data.daily} units={units} />` with:

```tsx
<OutlookPanel daily={data.daily} units={units} onOpenForecastDay={(dateISO) => setForecastTrigger({ kind: 'day', dateISO })} />
```

**(h) Wire up `TopBar`** — find the existing `<TopBar ... />` invocation (currently around line 252). Add two props:

```tsx
<TopBar
  stationId={data?.meta?.stationId ?? null}
  error={error}
  locationName={data?.meta?.locationName ?? ''}
  activeView={activeView}
  onViewChange={setActiveView}
  onLocationClick={() => setShowSetup(true)}
  onOpenForecastToday={() => setForecastTrigger({ kind: 'today' })}
  forecastButtonDisabled={daily.length === 0}
/>
```

**(i) Render the forecast `TerminalModal`** — add this right after the existing alert-detail `<TerminalModal>` block (around line 251):

```tsx
<TerminalModal
  open={forecastPeriod !== null}
  onClose={() => setForecastTrigger(null)}
  titleGlyph="▸"
  titleText={forecastTitleText}
  titleRight={forecastGeneratedLabel}
  accentColor="#22d3ee"
>
  {forecastPeriod && <ForecastBody period={forecastPeriod} />}
</TerminalModal>
```

Note the title text is assembled into a single string via `forecastTitleText` — so `titleGlyph` here is cosmetic and `titleText` contains the full `▸ FORECAST · ...` string. That's consistent with how Feature 4's alert modal passes `titleText={detailAlert?.event.toUpperCase() ?? ''}` without embedding the glyph twice.

Actually — look at how `TerminalModal` renders the title in the Feature 4 code: `{titleGlyph} {titleText}`. That means the glyph is rendered separately, so if we pass `titleText={'▸ FORECAST · TODAY'}` and `titleGlyph="▸"` we get `"▸ ▸ FORECAST · TODAY"` — double glyph. Fix this by passing `titleGlyph=""` or by stripping the leading `▸ ` from `forecastTitleText`. The cleaner fix: drop the leading `▸ ` from our derived `forecastTitleText` and let `titleGlyph="▸"` provide it.

Replace the `forecastTitleText` derivation in Step 4.4(f) with:

```typescript
const forecastTitleText = forecastTrigger?.kind === 'today'
  ? 'FORECAST · TODAY'
  : forecastPeriod
  ? `FORECAST · ${forecastPeriod.dayOfWeek.toUpperCase()} ${forecastPeriod.dateLabel.toUpperCase()}`
  : '';
```

And keep `titleGlyph="▸"` in the `<TerminalModal>` render. The rendered title will be `▸ FORECAST · TODAY` with a single glyph.

- [ ] **Step 4.5: Typecheck, tests, build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: 221 tests pass.

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4.6: Commit all four files together**

```bash
git add client/components/OutlookPanel.tsx client/components/TopBar.tsx client/App.tsx client/styles/hud.css
git commit -m "$(cat <<'EOF'
Wire up forecast narrative modal in TopBar, OutlookPanel, and App

OutlookPanel: each day row's date label becomes a button that
opens the forecast modal for that specific dateISO.

TopBar: right side gains a new .hud-topbar-right cluster wrapping
the ForecastButton and the clock together. Two new props carry
the today-click callback and the disabled state when no daily
data is available.

App: owns the ForecastTrigger discriminated union state. Derives
the selected DailyPeriod and the title-bar strings (TODAY vs day
label, plus the NWS-generatedAt timestamp). Renders a second
TerminalModal instance in base cyan for the forecast body. A
stale-trigger useEffect closes the modal when the selected day
falls off the forecast window.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Manual validation + `PROJECT_STATUS.md` update + PR

**Files:**
- Modify: `PROJECT_STATUS.md`

### Steps

- [ ] **Step 5.1: Start the dev server and verify the TopBar trigger**

In a PowerShell terminal:

```powershell
npm run server
```

In another terminal:

```bash
npm run dev
```

Open `http://localhost:5173`. Check:
- [ ] A `▸` glyph appears in the TopBar, to the left of the clock
- [ ] Hovering the glyph brightens it (accent-color full opacity)
- [ ] Clicking the glyph opens the modal just below the (absent) banner: cyan border + glow, title `▸ FORECAST · TODAY`, right-side shows an issuance timestamp like `1:30 PM CDT`
- [ ] Body shows today's day section (e.g. `THIS AFTERNOON` or whatever NWS currently uses for this period) and tonight section stacked
- [ ] Narratives render with `pre-wrap` — any embedded line breaks in NWS text are preserved
- [ ] × button / Esc / overlay click all close the modal
- [ ] After close, focus returns to the `▸` button (press Tab and see where the ring lands)

- [ ] **Step 5.2: Verify the outlook-row trigger**

Switch to the OUTLOOK tab (or ALL). Check each row:
- [ ] Hovering the date label (`FRI · APR 17` etc.) underlines the whole thing
- [ ] Clicking it opens the modal with title `▸ FORECAST · FRI APR 17` (day-of-week + date; NOT `TODAY`, even for the first row)
- [ ] Body shows that specific day's day+night narratives
- [ ] Close, click a different day — modal reopens with the new day's narratives
- [ ] Temperature range / icon / precip-% elements around the date label still work as before (the button only wraps the date text, not the whole row)

- [ ] **Step 5.3: Verify the edge cases**

- [ ] Compare modal positioning to the alert modal shipped in Feature 4 — it sits at the same top-offset, just below where the banner would be. If an alert is active, verify the two modals don't fight (a single alert plus an open forecast modal should work — the forecast modal covers the banner, which is fine)
- [ ] Refresh the page right after startup — confirm the button is `disabled` (greyed out) for the brief window before the first weather response arrives, then enables once `daily` has data
- [ ] Open the forecast modal, keep it open through one poll cycle (~90s) — the title bar's `forecastGeneratedAt` label should potentially update if NWS generated a fresh forecast in that window. Nothing should crash.

- [ ] **Step 5.4: Update `PROJECT_STATUS.md`**

Update `PROJECT_STATUS.md`:

Update the "Last updated" date at the top to match today.

Update the test-count line ("Tests: Vitest (217 tests across 12 files..." — bump `217` to `221`).

Update the `npm test` command line (same number bump).

Add a new entry to the "Implemented features" section, after the "### Alert detail terminal modal (v1.2 Feature 4)" block:

```markdown
### NWS narrative forecast modal (v1.2 Feature 5)
- Click the `▸` button in the TopBar to open today's NWS forecast narrative, or click any day row in the 7-day outlook to open that day's narrative. Modal shows day and night sections stacked with NWS-preserved period names (`THIS AFTERNOON` / `TONIGHT` for today; `FRIDAY` / `FRIDAY NIGHT` for future days). Reuses the `TerminalModal` primitive from Feature 4 — proves out the "chrome + thin wrapper" architecture across a second feature.
- `DailyPeriod` gains four nullable fields (`dayDetailedForecast`, `nightDetailedForecast`, `dayPeriodName`, `nightPeriodName`) populated by the normalizer from the NWS forecast response. Orphan periods (standalone `Tonight` at window start, day-only at window end) leave the missing half null.
- `WeatherMeta` gains `forecastGeneratedAt` — the NWS `/gridpoints/.../forecast` top-level `generatedAt` timestamp, shown in the modal title bar.
```

- [ ] **Step 5.5: Commit the status update**

```bash
git add PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
Document Feature 5 narrative forecast modal in PROJECT_STATUS

Also bumps the test count (217 → 221) from the four new forecast
narrative tests added to normalizer.test.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.6: Push branch and open PR**

```bash
git push -u origin feat/forecast-modal
```

Then open a PR with `gh pr create`. Match the house style from PR #9 (Feature 4): summary bullets, decisions-settled table, test plan checklist, commit map, link to spec and plan.

---

## Summary of commits

1. Surface NWS forecast narratives and generatedAt for Feature 5 (Task 1)
2. Add ForecastBody modal content component (Task 2)
3. Add ForecastButton TopBar trigger (Task 3)
4. Wire up forecast narrative modal in TopBar, OutlookPanel, and App (Task 4)
5. Document Feature 5 narrative forecast modal in PROJECT_STATUS (Task 5)

Plus the already-committed spec on `feat/forecast-modal`.

---

## Self-review

**Spec coverage:**
- `DailyPeriod` four new fields + `WeatherMeta.forecastGeneratedAt` + normalizer + fixtures + tests → Task 1 ✅
- `ForecastBody` component → Task 2 ✅
- `ForecastButton` component → Task 3 ✅
- `OutlookPanel` date-label triggers → Task 4 ✅
- `TopBar` right-cluster with ForecastButton → Task 4 ✅
- `App.tsx` `ForecastTrigger` state + stale-cleanup effect + derived period + TerminalModal render → Task 4 ✅
- Styling (`.forecast-*`, `.hud-topbar-forecast`, `.hud-topbar-right`, `.outlook-date-trigger`) → Tasks 2, 3, 4 ✅
- Manual validation (TopBar trigger, outlook trigger, edge cases) → Task 5 ✅
- `PROJECT_STATUS` update + PR → Task 5 ✅

**Placeholder scan:** Every step contains actual code or actual commands. No TBD / TODO / "similar to Task N" / "add appropriate X".

**Type consistency:**
- `ForecastTrigger` type union shape consistent between Task 4(b) definition and Task 4(f) usage ✅
- `onOpenForecastDay: (dateISO: string) => void` signature consistent between OutlookPanel prop and App's handler `(dateISO) => setForecastTrigger({ kind: 'day', dateISO })` ✅
- `onOpenForecastToday: () => void` signature consistent between TopBar prop and App's handler `() => setForecastTrigger({ kind: 'today' })` ✅
- `accentColor="#22d3ee"` literal matches the spec's "always base cyan" decision ✅
- The title-bar glyph doubling caught during plan-writing (fixed by stripping `▸ ` from `forecastTitleText` and letting `titleGlyph="▸"` supply it via TerminalModal's `{titleGlyph} {titleText}` layout) ✅
