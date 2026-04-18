# PDS Tornado + Destructive T-Storm alert tier escalations

**Date:** 2026-04-17
**Status:** Draft — pending user review
**Trigger:** A severe-weather event exposed that `tornado-warning` and `tornado-emergency` are the only tornado tiers we model, with no representation for Particularly Dangerous Situation (PDS) tornado warnings, which are a distinct severity level between the two. The parallel problem exists for severe thunderstorms: Destructive Severe Thunderstorm warnings (WEA-triggering) are currently flattened into the plain `severe-warning` tier.

## Goal

Add two new alert tiers — `tornado-pds` and `tstorm-destructive` — and drive detection from the NWS Impact-Based Warning (IBW) damage-threat parameters rather than from the `event` field alone. Keep the existing 9 tiers working unchanged so current live alerts continue to route correctly.

## Background: how NWS encodes these escalations

Neither "PDS Tornado Warning" nor "Destructive Severe Thunderstorm Warning" appears as a distinct `event` value in the NWS API. Both are modifiers applied to the base warning event. NWS exposes the modifier through the structured `parameters` block on the CAP alert:

- `parameters.tornadoDamageThreat`: `"CONSIDERABLE"` → PDS tornado; `"CATASTROPHIC"` → Tornado Emergency.
- `parameters.thunderstormDamageThreat`: `"CONSIDERABLE"` → escalated but not destructive (stays in `severe-warning`); `"DESTRUCTIVE"` → destructive t-storm (WEA-triggering).

Parameter values arrive as arrays of strings (e.g. `"tornadoDamageThreat": ["CONSIDERABLE"]`).

A **related correctness bug** exists in the current code: the `EVENT_TO_TIER` map has an entry for event `"Tornado Emergency"`, but NWS issues Tornado Emergencies as `event: "Tornado Warning"` with `tornadoDamageThreat: "CATASTROPHIC"`. The literal `"Tornado Emergency"` event string does not appear in live API responses, so the current code never successfully classifies a real Tornado Emergency. This spec folds in the fix.

## Tier structure after this change

New `AlertTier` union, in rank order:

| Rank | Tier | Base color | Stripe color | How it's detected |
|---|---|---|---|---|
| 1 | `tornado-emergency` | `#9400D3` (violet, unchanged) | `#5a007e` | event `Tornado Warning` + `tornadoDamageThreat=CATASTROPHIC`, or legacy event `Tornado Emergency` |
| 2 | `tornado-pds` *(new)* | `#d400a8` (hot magenta) | `#800065` | event `Tornado Warning` + `tornadoDamageThreat=CONSIDERABLE` |
| 3 | `tornado-warning` | `#ff4444` (unchanged) | `#a02828` | event `Tornado Warning` with no tornadoDamageThreat or unknown value |
| 4 | `tstorm-destructive` *(new)* | `#c8102e` (crimson) | `#78091c` | event `Severe Thunderstorm Warning` + `thunderstormDamageThreat=DESTRUCTIVE` |
| 5 | `severe-warning` | `#ff8800` (unchanged) | `#a05500` | event `Severe Thunderstorm Warning` with no threat, CONSIDERABLE, or unknown value |
| 6 | `blizzard` | `#ffffff` | `#bbbbbb` | unchanged |
| 7 | `winter-storm` | `#4488ff` | `#2a55a0` | unchanged |
| 8 | `flood` | `#22cc66` | `#147a3d` | unchanged |
| 9 | `heat` | `#ff5533` | `#a0331c` | unchanged |
| 10 | `special-weather-statement` | `#ee82ee` | `#9d539d` | unchanged |
| 11 | `watch` | `#ffdd33` | `#a08820` | unchanged |

**Ranking rationale:** `tstorm-destructive` ranks below `tornado-warning` because "any tornado activity above any thunderstorm activity" is the existing convention for alert stacking and banner headline selection. A destructive t-storm is severe, but when both a tornado warning and a destructive t-storm are active the tornado is the more specific and more urgent signal.

**Color rationale:** PDS tornado uses hot magenta (not a second shade of violet) so it's distinguishable from Tornado Emergency at a glance, matching broadcast-TV convention. Destructive t-storm stays in the red family (crimson, darker than `tornado-warning`'s `#ff4444`) so that "it's a thunderstorm, not a tornado" remains legible from color alone.

## Detection logic

New pure function in `shared/alert-tiers.ts`:

```ts
export function classifyAlert(
  event: string,
  parameters?: Record<string, string[] | string> | undefined,
): AlertTier | null {
  // Tornado family: damage-threat wins, event name is fallback
  if (event === 'Tornado Warning' || event === 'Tornado Emergency') {
    const threat = firstValue(parameters?.tornadoDamageThreat)?.toUpperCase();
    if (threat === 'CATASTROPHIC') return 'tornado-emergency';
    if (threat === 'CONSIDERABLE') return 'tornado-pds';
    if (event === 'Tornado Emergency') return 'tornado-emergency'; // legacy path
    return 'tornado-warning';
  }
  // T-storm family
  if (event === 'Severe Thunderstorm Warning') {
    const threat = firstValue(parameters?.thunderstormDamageThreat)?.toUpperCase();
    if (threat === 'DESTRUCTIVE') return 'tstorm-destructive';
    return 'severe-warning';
  }
  // Everything else: unchanged event-name table
  return mapEventToTier(event);
}
```

`firstValue` helper handles the array-or-string shape of NWS parameter values and returns `undefined` when the field is absent or empty. Comparison is case-normalised via `.toUpperCase()` so mixed-case values don't slip through.

Unknown damage-threat values (e.g. a future third enum) fall through to the base tier. Safe default — no crash, no misclassification.

`mapEventToTier` stays in place and is used by every non-escalation event. This keeps the current 9 mappings (`Blizzard Warning`, `Flood Warning`, `Heat Advisory`, etc.) working unchanged.

## Changes by file

### `shared/types.ts`

Extend `AlertTier` with the two new variants in rank order (see table above).

### `shared/alert-tiers.ts`

- Remove the `'Tornado Emergency'` → `'tornado-emergency'` row from `EVENT_TO_TIER` (its behaviour moves into `classifyAlert`'s legacy path). Remove the `'Tornado Warning'` row from `EVENT_TO_TIER` as well, since tornado events are now handled exclusively by `classifyAlert`. Remove `'Severe Thunderstorm Warning'` for the same reason.
- Add two `TIER_RANK` entries for `tornado-pds` (rank 2) and `tstorm-destructive` (rank 4). All lower-priority tiers' rank numbers shift down by 2.
- Add two `TIER_COLORS` entries with the hex values from the table.
- Add `classifyAlert(event, parameters)` exported function.
- Add `firstValue(value)` helper, not exported.

### `server/nws/normalizer.ts`

- Extend `NwsAlertsResponse.features[].properties` with `parameters?: Record<string, string[]>`.
- Change `normalizeAlerts` to call `classifyAlert(f.properties.event, f.properties.parameters)` instead of `mapEventToTier(f.properties.event)`. The rest of `normalizeAlerts` is unchanged.

### `server/nws/debug-alerts.ts`

- Change the existing `'tornado-emergency'` entry's `event` from `'Tornado Emergency'` to `'Tornado Warning'` so the synthetic feature mirrors how NWS actually issues Tornado Emergencies on the live API (base event + CATASTROPHIC damage threat). Keeping the legacy event value here would mask bugs in the new classifier path.
- Add two entries to `TIER_SPECS`:
  - `'tornado-pds'`: `{ event: 'Tornado Warning', severity: 'Extreme' }`
  - `'tstorm-destructive'`: `{ event: 'Severe Thunderstorm Warning', severity: 'Extreme' }`
- When synthesising a feature for `tornado-emergency`, `tornado-pds`, or `tstorm-destructive`, attach the appropriate `parameters` block to the synthetic feature — e.g. `tornado-emergency` → `{ tornadoDamageThreat: ['CATASTROPHIC'] }`, `tornado-pds` → `{ tornadoDamageThreat: ['CONSIDERABLE'] }`, `tstorm-destructive` → `{ thunderstormDamageThreat: ['DESTRUCTIVE'] }`. This routes the synthetic alert through the real `classifyAlert` path so debug injection genuinely exercises detection.

### `client/styles/hud.css`

- Add `.alert-banner[data-tier="tornado-pds"]` and `.alert-banner[data-tier="tstorm-destructive"]` blocks matching the pattern at line 730.
- Add `.hud-showcase[data-alert-tier="tornado-pds"]` and `.hud-showcase[data-alert-tier="tstorm-destructive"]` accent-override blocks matching the pattern at line 782.

### `CLAUDE.md`

Update the list of valid debug tier names in the "Debug alert injection" section to include `tornado-pds` and `tstorm-destructive`.

### `PROJECT_STATUS.md`

Add to the "Implemented features" list once shipped.

## Testing

### `shared/alert-tiers.test.ts`

New test group for `classifyAlert` covering:

- `Tornado Warning` with no parameters → `tornado-warning`.
- `Tornado Warning` with `tornadoDamageThreat: ['CONSIDERABLE']` → `tornado-pds`.
- `Tornado Warning` with `tornadoDamageThreat: ['CATASTROPHIC']` → `tornado-emergency`.
- `Tornado Warning` with `tornadoDamageThreat: ['UNKNOWN_FUTURE_VALUE']` → `tornado-warning` (falls through).
- Lower-case threat value (`'considerable'`) → `tornado-pds` (case-insensitive).
- Bare-string parameter value (not array) → still classified correctly.
- Legacy event `Tornado Emergency` with no parameters → `tornado-emergency`.
- `Severe Thunderstorm Warning` with no parameters → `severe-warning`.
- `Severe Thunderstorm Warning` with `thunderstormDamageThreat: ['DESTRUCTIVE']` → `tstorm-destructive`.
- `Severe Thunderstorm Warning` with `thunderstormDamageThreat: ['CONSIDERABLE']` → `severe-warning`.
- Unrelated event (`Blizzard Warning`) routes through `mapEventToTier` unchanged.

Plus a completeness assertion: every `AlertTier` variant has a `TIER_RANK` entry and a `TIER_COLORS` entry. (Add if the test file doesn't already have this.)

### `server/nws/normalizer.test.ts`

Extend existing alert fixtures with one case that includes a `parameters` block, and assert the resulting `Alert.tier` matches the expected classification.

### `server/nws/debug-alerts.test.ts`

For each of `tornado-emergency`, `tornado-pds`, `tstorm-destructive`: synthesise the feature via `synthesizeDebugAlerts`, pass it through `normalizeAlerts`, and assert the output `Alert.tier` matches the input tier. This verifies the detection path end-to-end, not just that the synthesiser emits a blob.

## Risks and edge cases

- **No regression in the normal case.** Non-escalated live alerts omit the damage-threat parameter. `classifyAlert`'s "no params" branches return the same tier the old code returned, and existing normalizer fixtures (which don't include a `parameters` block) will continue to pass unchanged.
- **Unknown future parameter values** fall through to the base tier. No crash.
- **Parameter value shape variance.** NWS returns arrays, but `firstValue` tolerates bare strings defensively — one fewer thing that can break if the upstream contract shifts.
- **Stacking order** for multi-alert banners is determined by `TIER_RANK`. Verify visually (via `SKYFRAME_DEBUG_TIERS=tornado-pds,tstorm-destructive,severe-warning`) that stacking matches the documented rank order.

## Out of scope

- `thunderstormDamageThreat: CONSIDERABLE` is not getting its own tier. It maps to ordinary `severe-warning`. (Decision from brainstorming — the "considerable" tag is informational and doesn't materially change user response; carrying it as a distinct tier fragments the thunderstorm palette without adding signal.)
- Hail/wind quantitative tags (`maxHailSize`, `maxWindGust`) in the parameters block are not consumed. Possible future work if we ever want to show "baseball-sized hail" in the banner body.
- UI/copy changes to the banner component beyond the new color. The PDS/destructive alerts will render with the same headline/expand behaviour as existing tiers.
