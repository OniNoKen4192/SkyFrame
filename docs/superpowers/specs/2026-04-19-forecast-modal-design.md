# NWS Narrative Forecast Modal — Design

**Date:** 2026-04-19
**Status:** Approved for implementation planning
**v1.2 scope:** Feature 5 ([2026-04-17-v1.2-roadmap-design.md](2026-04-17-v1.2-roadmap-design.md), Section 5)
**Branch:** `feat/forecast-modal`, off `main`

## Summary

Reuse the `TerminalModal` primitive (shipped in Feature 4) to display NWS's human-written daily forecast narratives. Two triggers open it: a `▤` icon button inline with the CurrentPanel `TEMP / FEEL` tag and the HourlyPanel section label (opens today's forecast), and clicking a day row's date label in the 7-day `OutlookPanel` (opens that day's forecast). Body shows stacked day + night narratives with contextual section headers.

## Decisions settled during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Day/night narrative shape on `DailyPeriod` | Two nullable string fields (`dayDetailedForecast`, `nightDetailedForecast`) | Smallest delta; null cases match the normalizer's existing orphan handling |
| Section header wording | Use NWS period `name` verbatim (preserved as `dayPeriodName`, `nightPeriodName`) | Matches weather.gov; naturally handles "This Afternoon" / "Overnight" for today without custom logic |
| `▤` trigger placement | Inline at the end of the CurrentPanel `TEMP / FEEL` tag AND the HourlyPanel `■ HOURLY FORECAST ...` section label. (Revised during manual validation — the originally-specified TopBar placement felt disconnected from the weather data it opens; moving it inline with the panel labels reads more naturally. HOURLY-tab users keep access via the Hourly label trigger; OUTLOOK-tab users already have per-day triggers from the day-row buttons.) | The trigger now lives beside the data it relates to rather than in the dashboard chrome |

## Scope

**In scope:**
- New fields on `DailyPeriod` to carry day/night narrative text and period names
- New `WeatherMeta.forecastGeneratedAt` field for the title-bar issuance timestamp
- Normalizer pulls the relevant NWS fields and populates these
- `ForecastButton` component renders inline inside CurrentPanel's `TEMP / FEEL` tag and HourlyPanel's section label
- `OutlookPanel` date labels become clickable triggers
- `ForecastBody` component renders the day/night narratives inside `TerminalModal`
- `App` owns a discriminated-union `forecastTrigger` state and renders the modal

**Out of scope:**
- Next / previous-day navigation inside the modal
- Keyboard shortcut for opening the modal
- Deep-link / URL hash
- Exclusivity enforcement between the forecast modal and the alert detail modal
- Caching `generatedAt` client-side
- Mobile-specific layout
- Highlighting / styling within narrative text (no regex prefixes — forecasts aren't structured like alerts)

## Data model

### `DailyPeriod` additions — `shared/types.ts`

```typescript
export interface DailyPeriod {
  // ...existing fields unchanged
  dayDetailedForecast: string | null;    // NEW
  nightDetailedForecast: string | null;  // NEW
  dayPeriodName: string | null;          // NEW — e.g. "This Afternoon", "Friday"
  nightPeriodName: string | null;        // NEW — e.g. "Tonight", "Overnight", "Friday Night"
}
```

Nullable fields cover the orphan cases the normalizer already produces: standalone `Tonight` at the start of the window (no day half) and a day-only period at the end of the window (no night half).

### `WeatherMeta` addition — `shared/types.ts`

```typescript
export interface WeatherMeta {
  // ...existing fields unchanged
  forecastGeneratedAt: string;  // NEW — ISO; NWS top-level generatedAt from /gridpoints/.../forecast
}
```

Drives the title-bar right-side timestamp on the forecast modal.

### Normalizer changes — `server/nws/normalizer.ts`

- `NwsForecastResponse.properties`: add `generatedAt: string`
- `NwsForecastResponse.properties.periods[]`: add `name: string` (already returned by NWS; not currently pulled) and `detailedForecast: string`
- `collapseDailyPeriods`: for each emitted `DailyPeriod`, populate the four new fields from the contributing NWS period(s). Orphan halves get `null` for the missing side.
- `normalizeWeather`: pipe the forecast response's top-level `generatedAt` into `meta.forecastGeneratedAt`

## Component layout

### New files

```
client/components/ForecastBody.tsx      # Modal content (day + night narratives)
client/components/ForecastButton.tsx    # Inline ▤ trigger used by CurrentPanel and HourlyPanel
```

### Modified files

| File | Change |
|---|---|
| `shared/types.ts` | Add 4 fields to `DailyPeriod`, 1 field to `WeatherMeta` |
| `server/nws/normalizer.ts` | Pull `generatedAt`, `detailedForecast`, `name`; populate new DailyPeriod fields |
| `server/nws/normalizer.test.ts` | Add tests covering the new fields for both full-pair and orphan cases |
| `client/components/CurrentPanel.tsx` | Render `<ForecastButton>` inside the `TEMP / FEEL` tag; new `onOpenForecastToday` and `forecastButtonDisabled` props |
| `client/components/HourlyPanel.tsx` | Render `<ForecastButton>` at the end of the section-label text (`■ HOURLY FORECAST · NEXT 12H · MKX GRID 88,58 ▤`); same two new props |
| `client/components/OutlookPanel.tsx` | Date label becomes a clickable trigger; new `onOpenForecastDay` prop |
| `client/App.tsx` | Add `forecastTrigger` state, resolve selected period, render `<TerminalModal>` with `<ForecastBody>` child |
| `client/styles/terminal-modal.css` | Append `.forecast-*` styles |
| `client/styles/hud.css` | Append `.forecast-inline-trigger` styles and `.outlook-date-trigger` styles |
| `PROJECT_STATUS.md` | Mark Feature 5 shipped |

### Component boundaries

**`ForecastBody`** — alert-free content for the shared primitive:

```typescript
interface ForecastBodyProps {
  period: DailyPeriod;
}
```

Renders the day section (header + narrative) and the night section (header + narrative), each guarded by the relevant nullable fields. Section header text is `dayPeriodName.toUpperCase()` / `nightPeriodName.toUpperCase()`. Stateless.

**`ForecastButton`** — stateless inline trigger used inside CurrentPanel and HourlyPanel label text:

```typescript
interface ForecastButtonProps {
  onClick: () => void;
  disabled?: boolean;
}
```

Renders `▤` with hover/focus chrome and `aria-label="Open today's forecast narrative"`. Disabled when there's no daily data yet (cold-start / fallback).

### State ownership — `App.tsx`

```typescript
type ForecastTrigger =
  | { kind: 'today' }
  | { kind: 'day'; dateISO: string };

const [forecastTrigger, setForecastTrigger] = useState<ForecastTrigger | null>(null);
```

Discriminated union preserves which trigger opened the modal — lets the title-bar render `TODAY` for the TopBar button vs `FRI APR 17` for outlook-row clicks.

**Selected-period resolution:**

```typescript
const forecastPeriod: DailyPeriod | null =
  forecastTrigger?.kind === 'today' ? (daily[0] ?? null) :
  forecastTrigger?.kind === 'day'   ? (daily.find(d => d.dateISO === forecastTrigger.dateISO) ?? null) :
  null;
```

## Interactions

### Open paths
- CurrentPanel / HourlyPanel `▤` click → `setForecastTrigger({ kind: 'today' })`
- Outlook day-row date label click → `setForecastTrigger({ kind: 'day', dateISO: d.dateISO })`

Both render the same `<TerminalModal>` instance. Title text differs:

| Trigger | `titleText` |
|---|---|
| `kind: 'today'` | `▤ FORECAST · TODAY` |
| `kind: 'day'` | `▤ FORECAST · ${period.dayOfWeek.toUpperCase()} ${period.dateLabel.toUpperCase()}` |

Example (day): `▤ FORECAST · FRI APR 17`. The `dayOfWeek` field in `DailyPeriod` is already the short form (`FRI`, `SAT`) used in OutlookPanel.

### Title bar
- Glyph: `▤`
- Right side: `meta.forecastGeneratedAt` formatted via the shared `formatTime` helper (same America/Chicago formatter used by the alert modal)
- Accent color: literal `#22d3ee` (base cyan). No tier logic.

### Close
`TerminalModal` owns Esc, overlay click, and × button behavior — same as the alert modal. Focus returns to the trigger element automatically via the primitive's snapshot-and-restore.

### Stale-data useEffect
```typescript
useEffect(() => {
  if (forecastTrigger === null) return;
  if (forecastTrigger.kind === 'today' && daily.length === 0) {
    setForecastTrigger(null);
    return;
  }
  if (forecastTrigger.kind === 'day' && !daily.some(d => d.dateISO === forecastTrigger.dateISO)) {
    setForecastTrigger(null);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [daily.map(d => d.dateISO).join('|'), forecastTrigger]);
```

Matches the established pattern (dismissed-alerts pruning, alert modal stale-cleanup).

### Orphan-period handling inside the modal
If `period.dayPeriodName` is null (standalone-night orphan), the modal renders only the night section. If `period.nightPeriodName` is null (end-of-window day orphan), only the day section. No "— no narrative available —" placeholder; absent halves are simply omitted.

### Modal exclusivity
Not enforced. The user can't easily trigger both modals because whichever is open covers ~75vw of the screen. If manual validation surfaces a real conflict path, add exclusivity in a follow-up.

## Content rendering

### `ForecastBody` JSX shape

```tsx
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
```

Both fields checked per half so TypeScript's nullable guarantees line up with what ends up in the DOM. In practice, when one of a pair is non-null the other should be non-null too — this is defensive against a malformed NWS response where they diverge.

### Rendering rules
- Section headers: `<h3>`, uppercase, monospace (inherited), base-cyan color, letter-spaced — matches existing HUD section-label aesthetic
- Narrative paragraphs: `<p>` with `white-space: pre-wrap` so embedded newlines in NWS text are preserved
- No regex-based prefix highlighting (NWS forecast narratives don't use `HAZARD...`/`SOURCE...` structure)

### No client-side pure-function extraction
Unlike Feature 4's `parseDescription` / `formatAlertMeta`, `ForecastBody` has no correctness-sensitive transform worth unit-testing. The only operation is `.toUpperCase()` on strings — trivial. The title-bar timestamp reuses `formatTime` from `client/alert-detail-format.ts` (already tested).

### Server-side tests added to `server/nws/normalizer.test.ts`

| Test | Validates |
|---|---|
| Daily periods expose `dayDetailedForecast` and `nightDetailedForecast` from both halves of a day+night pair | Happy path |
| Daily periods expose `dayPeriodName` and `nightPeriodName` from NWS period `name` | Period name preservation |
| Standalone-night orphan has null `day*` fields; `night*` populated | First-slot `Tonight` handling |
| End-of-window day-only orphan has null `night*` fields; `day*` populated | Orphan day handling |
| `meta.forecastGeneratedAt` surfaces the top-level NWS `generatedAt` | Timestamp pipeline |

## Styling

### Append to `client/styles/terminal-modal.css`

```css
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

### Append to `client/styles/hud.css`

**Inline forecast trigger** (used by CurrentPanel and HourlyPanel):

```css
.forecast-inline-trigger {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
  text-shadow: inherit;
  padding: 0 4px;
  margin-left: 6px;
  opacity: 0.6;
}
.forecast-inline-trigger:hover:not(:disabled) {
  opacity: 1;
  text-decoration: underline;
}
.forecast-inline-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
.forecast-inline-trigger:focus-visible {
  outline: 1px dashed currentColor;
  outline-offset: 2px;
}
```

**Outlook date-label trigger** (mirrors `.alert-banner-event-trigger` from Feature 4):

```css
.outlook-date-trigger {
  background: none; border: none; color: inherit; font: inherit;
  letter-spacing: inherit; text-transform: inherit; padding: 0;
  cursor: pointer; text-shadow: inherit;
}
.outlook-date-trigger:hover { text-decoration: underline; }
.outlook-date-trigger:focus-visible {
  outline: 1px dashed currentColor;
  outline-offset: 2px;
}
```

Two copies of the same "inline text trigger" pattern now exist (alert-banner-event-trigger + outlook-date-trigger). That's still below the three-similar-lines threshold for abstraction. If Feature 8 or later adds a third, extract a shared `.clickable-text-trigger` class.

## Edge cases

- **Empty daily array:** `ForecastButton` is rendered with `disabled={daily.length === 0}` so clicks are dead. `App` also wouldn't open the modal because `forecastPeriod` resolves to null → `open={false}`.
- **Today is a night-only orphan (late evening):** `daily[0]` has only `nightPeriodName`/`nightDetailedForecast`. Modal title remains `TODAY`; body shows just the night section. Accurate — it's today's remaining forecast.
- **Outlook-row click on `daily[0]`:** title is `FRI APR 17`, not `TODAY`. Title is a function of trigger source, not of which date resolves. Intentional — the row click unambiguously identifies a date.
- **`forecastGeneratedAt` null/invalid:** NWS always sends it, but if missing, `formatTime` called on a bad input returns a harmless string (no crash). No defensive test — same posture as other `meta` fields.

## Accent color source

`App.tsx` passes a literal hex string (`'#22d3ee'`) to `TerminalModal`'s `accentColor` prop for the forecast modal. No tier lookup, no per-alert logic — this is always base cyan. The `TerminalModal` primitive applies it the same way as the alert modal (inline CSS custom property on the modal root; stylesheet rules reference `var(--terminal-modal-accent)`).

## Documentation updates when shipped

- Update `PROJECT_STATUS.md` → "Implemented features" with Feature 5 entry
- Feature 5 finishes the modal primitive's second consumer, which validates the Task 4 architecture choice from Feature 4

## Ship path

Branch off `main` as `feat/forecast-modal`. Ship via PR (not local merge), matching the Feature 4 workflow.
