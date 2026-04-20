# Terminal Modal Typography Refactor — Design

**Date:** 2026-04-20
**Status:** Approved for implementation planning
**v1.2 follow-up:** UI polish for the shared modal primitive introduced in Features 4 ([alert-detail-modal](2026-04-18-alert-detail-modal-design.md)) and 5 ([forecast-modal](2026-04-19-forecast-modal-design.md)).
**Branch:** `chore/terminal-modal-typography`, off `main`

## Summary

Refresh the typography and title-bar treatment of the shared `TerminalModal` primitive so it reads as part of the same visual family as the `Settings` modal. No React component changes, no new files — stylesheet-only update to `client/styles/terminal-modal.css`.

## Motivation

The `TerminalModal` chrome (built for alert detail, reused for forecast narrative) shipped with ad-hoc typography — `12px` body, `0.05em` title letterspacing, no title-bar background tint. Meanwhile the earlier `Settings` modal established a Settings-style HUD type system: `13px` titles with `0.18em` letterspacing + glow, section labels at `10–11px` with `0.18em` letterspacing + reduced opacity, and a readable `13px` body. The two modals look like they're from different products.

Separately, the modal is currently rendering in the **browser default sans-serif**, not the HUD monospace stack. `TerminalModal` uses `createPortal(content, document.body)` so it renders outside the `.hud-showcase` scope where `font-family: 'SF Mono','Consolas','Courier New',monospace;` is set ([hud.css:22](../../../client/styles/hud.css#L22)). `.terminal-modal { font-family: inherit; }` therefore inherits from `<body>`, which has no font set, and falls through to the browser default. This bug is the reason forecast-narrative body text looks proportional while the rest of the HUD is monospaced.

This refactor aligns the `TerminalModal` to the Settings type system, adds a subtle recessed title-bar band so the chrome reads as a terminal console strip rather than a flat colored line, and fixes the portal-font-inheritance bug so the type treatment actually lands against the HUD monospace font it was designed for.

## Decisions settled during brainstorming

| Decision | Choice | Notes |
|---|---|---|
| Scope | Type-only refactor (keep full border + title bar) | Rejected: full corner-bracket shell swap. User preferred minimal structural change. |
| Title-bar background | Darker recessed band (`#050a10`) | Rejected: lighter raised band, tier-tinted band. Recessed reads as a console strip; tint-by-tier could clash with watch/advisory yellows. |
| Component changes | None | React components, props, tests, animations unchanged. |

## Scope

**In scope:**
- Modal container: explicit `font-family` (fix portal-breaks-inherit bug)
- Title bar background tint + typography (title text + right-side metadata)
- Modal body base typography (size, line-height, letterspacing, padding)
- Alert-detail content: meta line and prefix (HAZARD/SOURCE/IMPACT) treatment
- Forecast-narrative content: section header letterspacing
- Close button size adjustment for proportion with the new title

**Out of scope:**
- Any React component changes (`TerminalModal.tsx`, `AlertDetailBody.tsx`, `ForecastBody.tsx`)
- Props, state, accessibility attributes, keyboard/click behavior
- Corner geometry (stays right-angled, 1px border)
- Accent-color-per-tier system (unchanged)
- Overlay, fade-in animation, backdrop behavior
- Modal width / max-height / positioning
- New stylesheet files or CSS variables beyond what already exists

## Affected file

Only `client/styles/terminal-modal.css`.

No other files touched. `TerminalModal.tsx`, `AlertDetailBody.tsx`, `ForecastBody.tsx`, `hud.css`, test files — all unchanged.

## Specification

### Modal container — `.terminal-modal`

| Property | Current | New |
|---|---|---|
| `font-family` | `inherit` | `'SF Mono','Consolas','Courier New',monospace` |

This is the portal-inheritance fix described in Motivation. Setting the stack explicitly on the modal container fixes both consumers (alert detail and forecast narrative) since they share this class. All other `.terminal-modal` properties (`background`, `border`, `box-shadow`, `width`, `max-height`, `display`, `flex-direction`, `animation`) stay unchanged.

### Title bar — `.terminal-modal-titlebar`

| Property | Current | New |
|---|---|---|
| `background` | inherits `#08121a` | `#050a10` |
| `padding` | `10px 14px` | `10px 16px` |
| `border-bottom` | `1px solid color-mix(in srgb, accent 30%, transparent)` | unchanged |
| `position: sticky; top: 0;` | unchanged | unchanged |

The `background: inherit` line needs to be replaced with the explicit `#050a10` so the band is visible against the body.

### Title text — `.terminal-modal-title`

| Property | Current | New |
|---|---|---|
| `font-size` | `12px` | `13px` |
| `font-weight` | `700` | `700` |
| `letter-spacing` | `0.05em` | `0.18em` |
| `color` | `var(--terminal-modal-accent)` | unchanged |
| `text-shadow` | none | `0 0 8px color-mix(in srgb, var(--terminal-modal-accent) 50%, transparent)` |

The `text-shadow` uses `color-mix` with the accent variable so each tier retains its own glow color. Matches Settings' title glow at `0 0 8px var(--accent-glow-soft)`.

### Title-right metadata — `.terminal-modal-title-right`

| Property | Current | New |
|---|---|---|
| `font-size` | `11px` | `10px` |
| `letter-spacing` | `0.04em` | `0.12em` |
| `color` | `#8b95a7` | unchanged |
| `opacity` | (implicit 1) | `0.55` |
| `gap` | `14px` | unchanged |

### Close button — `.terminal-modal-close`

| Property | Current | New |
|---|---|---|
| `font-size` | `18px` | `16px` |

Color, hover behavior, `aria-label`, and position stay identical. `18px` looked overbuilt next to the smaller, letterspaced title; `16px` reads proportional.

### Modal body — `.terminal-modal-body`

| Property | Current | New |
|---|---|---|
| `padding` | `14px` | `18px 20px` |
| `font-size` | `12px` | `13px` |
| `line-height` | `1.55` | `1.65` |
| `letter-spacing` | (inherited) | `0.04em` |
| `overflow-y` | `auto` | unchanged |

### Alert-detail meta line — `.alert-detail-meta`

Converted from inline-accent-bold to section-label treatment. Matches Settings' `LOCATION` / `CONTACT EMAIL` header style.

| Property | Current | New |
|---|---|---|
| `color` | `var(--terminal-modal-accent)` | unchanged |
| `font-size` | `11px` | `10px` |
| `letter-spacing` | `0.04em` | `0.18em` |
| `margin-bottom` | `10px` | `14px` |
| `font-weight` | `700` | `700` |
| `opacity` | (implicit 1) | `0.85` |

### Alert-detail prefix — `.alert-detail-prefix`

The `HAZARD...` / `SOURCE...` / `IMPACT...` keywords at the start of each paragraph.

| Property | Current | New |
|---|---|---|
| `color` | `var(--terminal-modal-accent)` | unchanged |
| `font-weight` | `700` | `700` |
| `letter-spacing` | (inherited) | `0.08em` |

Gives the prefix a small label-like feel without making it visually dominant.

### Alert-detail paragraph — `.alert-detail-paragraph`

| Property | Current | New |
|---|---|---|
| `margin` | `0 0 9px` | `0 0 10px` |
| `white-space` | `pre-wrap` | unchanged |

Single-px bump for rhythm with the new body line-height.

### Forecast section header — `.forecast-section-header`

The FRIDAY / FRIDAY NIGHT / SATURDAY band labels inside the forecast narrative modal.

| Property | Current | New |
|---|---|---|
| `font-size` | `12px` | `11px` |
| `letter-spacing` | `0.1em` | `0.18em` |
| `font-weight` | `700` | `700` |
| `color` | `var(--terminal-modal-accent)` | unchanged |
| `margin` | `0 0 8px` | unchanged |

Matches the updated `.alert-detail-meta` treatment — same "section label" visual role.

The existing `.forecast-section-header:not(:first-child) { margin-top: 16px; }` rule stays as-is.

### Forecast narrative paragraph — `.forecast-narrative`

| Property | Current | New |
|---|---|---|
| `margin` | `0 0 9px` | `0 0 10px` |
| `white-space` | `pre-wrap` | unchanged |

## Non-goals

- **No new CSS variables.** The refactor uses the existing `--terminal-modal-accent` variable system. No introduction of `--modal-bg`, `--titlebar-bg`, or similar — YAGNI until a second theme actually ships.
- **No dark-mode toggle awareness.** SkyFrame is dark-only today; the new `#050a10` is a literal hex like everything else in the stylesheet.
- **No visual regression test harness.** Consistent with the project's existing "test pure logic, validate React manually" discipline (per Feature 4 brainstorm decision).

## Validation

Manual validation via `SKYFRAME_DEBUG_TIERS`:

0. **Font fix sanity check** — open any modal (alert or forecast). Body text (paragraphs, not just section headers) should now render in the HUD monospace stack, matching the rest of the HUD. Easy diff: a capital "M" and a lowercase "i" should be the same width. Before the fix, the body text was proportional.
1. **Alert detail modal** — inject a tornado-warning, open the detail modal. Verify:
   - Title bar background is visibly darker than body
   - Title text has heavier letterspacing and a red glow
   - Timestamp in the right slot is small and quiet
   - Meta line (ISSUED ... · EXPIRES ...) reads as a small uppercase label band
   - HAZARD/SOURCE/IMPACT prefixes read as labels, not shouty
2. **Tier accent carryover** — inject a flood alert; verify the title glow, meta line, and prefixes pick up the flood-tier green (accent variable still flows through correctly).
3. **Forecast narrative modal** — open any day from the outlook; verify:
   - Section headers (FRIDAY, FRIDAY NIGHT...) have heavier letterspacing and match the new meta-line treatment
   - Body paragraphs render at the new larger size with looser leading
4. **Close button** — visually verify the × is proportional to the new title and still centered vertically.
5. **Focus / close / accessibility** — no change expected; spot-check Esc and overlay-click still work.

No unit-test changes. Existing tests in `alert-detail-format.test.ts` and any forecast-format tests exercise pure logic and are not coupled to the stylesheet.

## Documentation updates when shipped

- Update `PROJECT_STATUS.md` → "Implemented features" with a short entry under a v1.2.2 banner (or follow the project's current versioning convention at ship time).
- No `CLAUDE.md` updates — this is a polish pass, not a landmark decision.

## Ship path

Branch off `main` as `chore/terminal-modal-typography`. Ship via PR (not local merge) per `feedback_pr_workflow` memory.
