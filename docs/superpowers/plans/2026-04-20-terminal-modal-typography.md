# Terminal Modal Typography Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the shared `TerminalModal` primitive's typography and title-bar treatment with the Settings modal's HUD type system, and fix the portal-inheritance bug that causes modal body text to render in browser sans-serif instead of the HUD monospace stack.

**Architecture:** Single stylesheet refactor — all changes land in [client/styles/terminal-modal.css](../../../client/styles/terminal-modal.css). No React component changes, no new files, no new CSS variables. Each task groups changes by visual checkpoint so each commit produces a diff that's reviewable and bisect-able.

**Tech Stack:** Plain CSS + React 18 + Vite 5 dev server. Validation is manual (per `PROJECT_SPEC`/CLAUDE.md discipline — no visual-regression test harness). Debug alerts are injected via `SKYFRAME_DEBUG_TIERS`.

**Reference spec:** [docs/superpowers/specs/2026-04-20-terminal-modal-typography-design.md](../specs/2026-04-20-terminal-modal-typography-design.md). Every property value below is pulled directly from the spec — when in doubt, treat the spec as the source of truth.

---

## Pre-flight

**Branch setup.** The spec currently lives on `chore/docs-refresh`. The implementation branch cuts fresh from `main` — the spec is not needed in the implementation commit history, only as a reference document.

```bash
# From project root, on any branch, with working tree clean
git checkout main
git pull origin main
git checkout -b chore/terminal-modal-typography
```

If the working tree isn't clean, stash first: `git stash push -m "pre-typography-branch"`.

**Dev server.** Start it in a separate terminal so you can eyeball changes after each task:

```powershell
$env:SKYFRAME_DEBUG_TIERS = "tornado-warning,flood"
npm run dev
```

This injects a tornado (red accent) and flood (green accent) alert so you can validate tier accent carryover without waiting for real weather. Open http://localhost:5173 and keep it visible.

**Baseline screenshot (optional but recommended).** Open the forecast modal (click "Today" on the current panel) and take a screenshot. Keep it for before/after comparison.

---

## Task 1: Fix portal-inheritance font bug

**Files:**
- Modify: `client/styles/terminal-modal.css:21-32` (the `.terminal-modal` block)

This is the biggest visual delta in the whole refactor. Isolating it as its own commit makes the bug fix reviewable on its own and lets every subsequent typography commit land against a baseline that already uses monospace.

- [ ] **Step 1: Read the current `.terminal-modal` block**

Open [client/styles/terminal-modal.css](../../../client/styles/terminal-modal.css) and confirm the current block matches:

```css
.terminal-modal {
  background: #08121a;
  color: #cfd8e3;
  width: clamp(480px, 75vw, 960px);
  max-height: calc(100vh - 90px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--terminal-modal-accent, #22d3ee);
  box-shadow: 0 0 18px color-mix(in srgb, var(--terminal-modal-accent, #22d3ee) 25%, transparent);
  font-family: inherit;
  animation: terminal-modal-fade 120ms ease-out;
}
```

If the `border` line says `2px` instead of `1px`, your branch is missing PR #15. Rebase on main or merge it in before continuing.

- [ ] **Step 2: Replace `font-family: inherit` with the explicit HUD stack**

Change:

```css
  font-family: inherit;
```

to:

```css
  font-family: 'SF Mono','Consolas','Courier New',monospace;
```

Nothing else in the block changes.

- [ ] **Step 3: Verify in the browser**

With the dev server running and a debug alert active, click the headline event name in the red top banner to open the alert detail modal. The body paragraphs (the long `IMPACT...` text) should now be monospace — every character the same width. A capital "M" and a lowercase "i" should occupy the same horizontal space.

Close the alert modal. Open the forecast modal by clicking "Today" on the Current panel. The `Mostly sunny, with a high near X...` paragraphs should also be monospace now. This is the same bug fixed in one place for both modals.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.client.json
```

Expected: no output (no errors). CSS changes don't affect typecheck but this is cheap insurance against an accidental TS edit.

- [ ] **Step 5: Commit**

```bash
git add client/styles/terminal-modal.css
git commit -m "Fix portal-breaks-inherit font bug in TerminalModal

TerminalModal uses createPortal to render into document.body, which sits
outside the .hud-showcase scope where the HUD monospace stack is set.
font-family: inherit therefore fell through to the browser default sans
— visible in forecast narrative body paragraphs that rendered
proportional while the rest of the HUD was monospace.

Set font-family explicitly on .terminal-modal so both consumers (alert
detail and forecast narrative) pick up the intended HUD font."
```

---

## Task 2: Title bar chrome (background + title + right-side metadata + close button)

**Files:**
- Modify: `client/styles/terminal-modal.css:34-74` (the `.terminal-modal-titlebar`, `.terminal-modal-title`, `.terminal-modal-title-right`, and `.terminal-modal-close` blocks)

All four selectors live next to each other and change together to produce one coherent title bar treatment. Bundling them avoids an intermediate commit where the bar is half-refactored.

- [ ] **Step 1: Update `.terminal-modal-titlebar`**

Find the block:

```css
.terminal-modal-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--terminal-modal-accent, #22d3ee) 30%, transparent);
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 1;
}
```

Change two properties:
- `padding: 10px 14px;` → `padding: 10px 16px;`
- `background: inherit;` → `background: #050a10;`

Leave everything else (`display`, `justify-content`, `align-items`, `border-bottom`, `position: sticky`, `top: 0`, `z-index: 1`) unchanged.

Resulting block:

```css
.terminal-modal-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--terminal-modal-accent, #22d3ee) 30%, transparent);
  position: sticky;
  top: 0;
  background: #050a10;
  z-index: 1;
}
```

- [ ] **Step 2: Update `.terminal-modal-title`**

Find the block:

```css
.terminal-modal-title {
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 12px;
}
```

Replace with:

```css
.terminal-modal-title {
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 13px;
  text-shadow: 0 0 8px color-mix(in srgb, var(--terminal-modal-accent, #22d3ee) 50%, transparent);
}
```

The `color-mix` in the `text-shadow` follows the same pattern as the existing `box-shadow` on `.terminal-modal` — accent-variable in, transparent-blended glow out, per-tier color retained.

- [ ] **Step 3: Update `.terminal-modal-title-right`**

Find the block:

```css
.terminal-modal-title-right {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #8b95a7;
  font-size: 11px;
  letter-spacing: 0.04em;
}
```

Replace with:

```css
.terminal-modal-title-right {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #8b95a7;
  font-size: 10px;
  letter-spacing: 0.12em;
  opacity: 0.55;
}
```

Three properties change: `font-size` 11→10, `letter-spacing` 0.04→0.12, add `opacity: 0.55`. `display`, `align-items`, `gap`, `color` unchanged.

- [ ] **Step 4: Update `.terminal-modal-close`**

Find the block:

```css
.terminal-modal-close {
  background: none;
  border: none;
  color: #8b95a7;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
```

Change `font-size: 18px;` to `font-size: 16px;`. Everything else stays.

Do **not** touch the `.terminal-modal-close:hover` block below it.

- [ ] **Step 5: Verify in the browser**

Reload the dev server tab. Open both modals (alert detail via the banner event link, forecast via clicking "Today").

Expected visual state:
- Title bar is a visibly darker band than the body (recessed console-strip look)
- Title text is larger than before, heavier letterspacing, and has a colored glow around it that matches the alert tier (red for tornado, green for flood, cyan for forecast)
- Right-side timestamp is small and dim — reads as fine-print metadata, not a competing focal point
- × button is proportionally smaller and still vertically centered

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.client.json
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add client/styles/terminal-modal.css
git commit -m "Refresh TerminalModal title bar typography + recessed band

- Darker #050a10 title-bar background for console-strip contrast against
  the body background
- Title: 13px, 0.18em letterspacing, accent-colored text-shadow glow
  matching Settings' hero treatment
- Right-side timestamp: smaller (10px), looser letterspacing, reduced
  opacity so it reads as fine print
- Close button: 16px (down from 18px) for proportion with the new title"
```

---

## Task 3: Modal body base typography

**Files:**
- Modify: `client/styles/terminal-modal.css:76-81` (the `.terminal-modal-body` block)

Single-block change. Affects both alert-detail and forecast-narrative body text.

- [ ] **Step 1: Update `.terminal-modal-body`**

Find the block:

```css
.terminal-modal-body {
  padding: 14px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.55;
}
```

Replace with:

```css
.terminal-modal-body {
  padding: 18px 20px;
  overflow-y: auto;
  font-size: 13px;
  letter-spacing: 0.04em;
  line-height: 1.65;
}
```

Four changes: padding `14px` → `18px 20px`, `font-size` 12→13, `line-height` 1.55→1.65, add `letter-spacing: 0.04em`.

- [ ] **Step 2: Verify in the browser**

Reload and open both modals. Body paragraphs should be visibly larger and more breathable — more whitespace around the edges, more air between lines. Text should still fit the modal width comfortably (no horizontal scroll).

- [ ] **Step 3: Commit**

```bash
git add client/styles/terminal-modal.css
git commit -m "Enlarge TerminalModal body text + looser padding/leading

Body scale now matches Settings (13px + 1.65 line-height + 0.04em
letterspacing). Padding bumped from 14px to 18px 20px for more
breathing room without reaching Settings' 32px cavern."
```

---

## Task 4: Alert-detail content styles

**Files:**
- Modify: `client/styles/terminal-modal.css:91-107` (the `.alert-detail-meta`, `.alert-detail-paragraph`, `.alert-detail-prefix` blocks)

- [ ] **Step 1: Update `.alert-detail-meta`**

Find the block:

```css
.alert-detail-meta {
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 11px;
  letter-spacing: 0.04em;
  margin-bottom: 10px;
  font-weight: 700;
}
```

Replace with:

```css
.alert-detail-meta {
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 10px;
  letter-spacing: 0.18em;
  margin-bottom: 14px;
  font-weight: 700;
  opacity: 0.85;
}
```

Three property changes: `font-size` 11→10, `letter-spacing` 0.04→0.18, `margin-bottom` 10→14. Add `opacity: 0.85`. Color and weight unchanged.

- [ ] **Step 2: Update `.alert-detail-paragraph`**

Find the block:

```css
.alert-detail-paragraph {
  margin: 0 0 9px;
  white-space: pre-wrap;
}
```

Change `margin: 0 0 9px;` to `margin: 0 0 10px;`. Leave `white-space: pre-wrap;` alone.

- [ ] **Step 3: Update `.alert-detail-prefix`**

Find the block:

```css
.alert-detail-prefix {
  color: var(--terminal-modal-accent, #22d3ee);
  font-weight: 700;
}
```

Add a `letter-spacing: 0.08em;` line so the block becomes:

```css
.alert-detail-prefix {
  color: var(--terminal-modal-accent, #22d3ee);
  font-weight: 700;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 4: Verify in the browser**

Open the tornado-warning alert detail modal. Expected:
- Meta line (ISSUED ... · EXPIRES ... · COUNTY) reads as a small letterspaced uppercase label — visually similar to Settings' `LOCATION` / `CONTACT EMAIL` labels
- Tier accent still flows through (the meta line is red for tornado; switch to a flood alert to verify it turns green)
- HAZARD / SOURCE / IMPACT prefixes read as small labels before their paragraph text, not shouting caps

- [ ] **Step 5: Commit**

```bash
git add client/styles/terminal-modal.css
git commit -m "Restyle alert-detail meta + prefix as section labels

Meta line converted from inline-accent-bold to Settings-style
letterspaced-caps section label (10px, 0.18em, 0.85 opacity). HAZARD /
SOURCE / IMPACT prefix gets a small letterspacing bump so it reads as a
label rather than shouting text. Paragraph margin bumped 1px for rhythm
with the new body line-height."
```

---

## Task 5: Forecast-narrative content styles

**Files:**
- Modify: `client/styles/terminal-modal.css:112-127` (the `.forecast-section-header` and `.forecast-narrative` blocks)

- [ ] **Step 1: Update `.forecast-section-header`**

Find the block:

```css
.forecast-section-header {
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin: 0 0 8px;
}
```

Replace with:

```css
.forecast-section-header {
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  margin: 0 0 8px;
}
```

Two changes: `font-size` 12→11, `letter-spacing` 0.1em→0.18em. Color, weight, margin unchanged.

Do **not** touch the `.forecast-section-header:not(:first-child) { margin-top: 16px; }` rule immediately below.

- [ ] **Step 2: Update `.forecast-narrative`**

Find the block:

```css
.forecast-narrative {
  margin: 0 0 9px;
  white-space: pre-wrap;
}
```

Change `margin: 0 0 9px;` to `margin: 0 0 10px;`. `white-space` unchanged.

- [ ] **Step 3: Verify in the browser**

Open the forecast modal from the Current panel's "Today" button and a day from the Outlook. Expected:
- Section headers (THIS AFTERNOON, TONIGHT, FRIDAY, FRIDAY NIGHT, etc.) have heavier letterspacing and match the alert-detail meta-line treatment visually — same "section label" family
- Body paragraphs render at the new 13px monospace size with looser leading (already live from Tasks 1 + 3 — this task just tightens the rhythm)
- Header→body spacing feels consistent with the alert-detail modal's meta→prefix→body flow

- [ ] **Step 4: Commit**

```bash
git add client/styles/terminal-modal.css
git commit -m "Match forecast section headers to alert-detail meta treatment

Section headers (FRIDAY, FRIDAY NIGHT, etc.) now share the same
letterspaced-caps section-label look as the alert-detail meta line —
11px, 0.18em letterspacing. Forecast narrative paragraph margin
bumped 1px for the same rhythm reason as alert-detail paragraphs."
```

---

## Task 6: Full-path validation + ship

**Files:**
- No CSS changes. This task is validation + docs.
- Modify: `PROJECT_STATUS.md` → "Implemented features" list

- [ ] **Step 1: Full manual-validation pass**

With the dev server still running and `SKYFRAME_DEBUG_TIERS=tornado-warning,flood` set, walk through each spec validation step:

**0. Font fix sanity:** Both modals — body paragraphs are monospace. Capital M and lowercase i are the same width.

**1. Alert detail modal (tornado):**
- Title bar background is visibly darker than body (recessed band)
- Title: larger, heavier letterspacing, red glow
- Timestamp right: small, quiet, letterspaced
- Meta line: small letterspaced uppercase red label
- HAZARD / SOURCE / IMPACT prefixes: small labels, not shouty

**2. Tier accent carryover:** Click the flood alert's event link instead. Title glow, meta line, and prefixes should all pick up flood-tier green (`#22cc66` per `shared/alert-tiers.ts`).

**3. Forecast narrative modal:**
- Section headers: heavy letterspacing, match alert-detail meta treatment
- Body paragraphs: new larger size, looser leading, monospace

**4. Close button:** × reads proportional to the new title, vertically centered.

**5. Accessibility spot-check:**
- Esc closes both modals
- Overlay click closes both modals
- Tab cycles through modal focusable elements
- Screen-reader label on × button unchanged (still `aria-label="Close"`)

If any step looks wrong, go back to the task that introduced the property and adjust. Do **not** add extra scope here.

- [ ] **Step 2: Typecheck + test suite**

```bash
npx tsc --noEmit -p tsconfig.client.json
npx tsc --noEmit -p tsconfig.server.json
npm test
```

Expected: no type errors, all existing tests pass. No tests should need to change — the refactor is stylesheet-only.

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Open [PROJECT_STATUS.md](../../../PROJECT_STATUS.md) and find the "Implemented features" section. Add a new entry under whatever the most recent version banner is (check with `git log --oneline main -10` for the latest version bump — likely needs a new v1.2.2 banner if the link-status PR #15 has merged, or an entry under v1.2.1 if it hasn't yet).

Example entry under the appropriate banner:

```markdown
- **Terminal modal typography refresh.** Aligned the shared alert-detail
  and forecast-narrative modal primitive with the Settings modal type
  system: larger body text in HUD monospace (fixing a portal-inheritance
  bug that rendered it in browser sans), letterspaced-caps section
  labels for meta lines and forecast headers, recessed title-bar band,
  proportional close button.
```

Copy the surrounding formatting from the nearest existing entries — PROJECT_STATUS entries have a consistent house style.

- [ ] **Step 4: Commit docs update**

```bash
git add PROJECT_STATUS.md
git commit -m "Document terminal modal typography refresh in PROJECT_STATUS"
```

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin chore/terminal-modal-typography
gh pr create --title "Refresh TerminalModal typography + fix portal-inheritance font bug" --body "$(cat <<'EOF'
## Summary
Aligns the shared TerminalModal primitive (alert detail + forecast narrative) with the Settings modal's HUD type system, per the [design spec](docs/superpowers/specs/2026-04-20-terminal-modal-typography-design.md).

- Fixes a `font-family: inherit` bug where portaled modal content fell back to browser sans-serif instead of the HUD monospace stack.
- Title: larger, heavier letterspacing, accent-colored text-shadow glow.
- Recessed title-bar band (`#050a10`) for console-strip contrast against the body.
- Body: 13px monospace, looser padding and line-height, section-label treatment for alert-detail meta lines and forecast headers.
- Close button proportioned down (18px → 16px) to match the lighter title weight.

Stylesheet-only refactor. No React, component-prop, or test changes.

## Test plan
- [ ] `SKYFRAME_DEBUG_TIERS=tornado-warning,flood npm run dev`
- [ ] Open the tornado-warning alert detail modal — title bar darker than body, title glow red, meta line reads as letterspaced label, HAZARD/SOURCE/IMPACT prefixes read as mini-labels
- [ ] Click the flood alert's event link — same treatment with green accent carryover
- [ ] Open the forecast modal from Current panel's "Today" — section headers match the alert-detail meta-line treatment, body monospace at 13px
- [ ] Esc + overlay click still close both modals
- [ ] `npx tsc --noEmit -p tsconfig.client.json` clean
- [ ] `npm test` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollback

If after shipping the refactor looks wrong in a way we can't quickly fix, the entire branch is one stylesheet file. `git revert <merge-commit-sha>` on the PR is clean — no schema migrations, no data implications, no component-API breakage.

## What's out of scope for this plan (per spec)

- React component changes (`TerminalModal.tsx`, `AlertDetailBody.tsx`, `ForecastBody.tsx`)
- Corner geometry, overlay, backdrop, fade-in animation
- Modal width / max-height / positioning
- Accent-color-per-tier system (unchanged — still flows through `--terminal-modal-accent`)
- New CSS variables
- Visual-regression test harness
- `CLAUDE.md` landmark updates (this is polish, not a decision)
