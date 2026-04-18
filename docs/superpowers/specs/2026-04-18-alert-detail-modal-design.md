# Alert Detail Terminal Modal — Design

**Date:** 2026-04-18
**Status:** Approved for implementation planning
**v1.2 scope:** Feature 4 ([2026-04-17-v1.2-roadmap-design.md](2026-04-17-v1.2-roadmap-design.md), Section 4)
**Branch:** `feat/alert-detail-modal`, off `main`

## Summary

Click an alert's event name in an `AlertBanner` to open a terminal-styled modal showing the full NWS `description` text. Introduces a reusable `TerminalModal` primitive that Feature 5 (forecast narrative popup) will reuse.

## Decisions settled during brainstorming

| Decision | Choice | Notes |
|---|---|---|
| UI test infrastructure (RTL + jsdom) | **No** — keep existing "test pure logic, validate React manually" discipline | Extract correctness-sensitive rendering logic into pure functions; reassess if Feature 5 surfaces regression pain |
| Type retention | `description` already retained; add `issuedAt` only | Normalizer already passes `description` through. `issuedAt` sources from NWS `sent` (not `effective`) |
| Component shape | Shape 1 — `TerminalModal` primitive + `AlertDetailBody` wrapper | Feature 5 reuses the primitive with a `ForecastBody` wrapper |
| Single-alert clickability | Headline event-name becomes the trigger; list items too in multi-alert case | Fixes the spec-literal coverage gap where a single-alert banner had no click target |

## Scope

**In scope:**
- Click event name in banner (headline for single-alert case; list items for multi-alert case) → opens detail modal
- Modal with title bar, meta line, `description` body, HAZARD/SOURCE/IMPACT prefix highlighting
- Close via × button, Esc key, or overlay click
- Focus returns to triggering element on close

**Out of scope:**
- Feature 5 (forecast narrative popup) — separate feature, will reuse `TerminalModal`
- Keyboard navigation between alerts from inside the modal
- Focus trap (Tab can escape; Esc always closes)
- Deep-link / URL hash for open modal
- Per-alert dismissal from inside the modal
- RTL / jsdom test infrastructure
- Mobile-specific layout tuning
- Scroll lock on body when modal open

## Data model

### Type changes — `shared/types.ts`

```typescript
export interface Alert {
  // ...existing fields (description, effective, expires, headline, etc. — unchanged)
  issuedAt: string;  // NEW — ISO timestamp from NWS `sent` field
}
```

`description` is already on the type and already retained by the normalizer; no change there. Only `issuedAt` is added.

### Normalizer changes — `server/nws/normalizer.ts`

- `NwsAlertsResponse.features[].properties`: add `sent: string`
- `normalizeAlerts`: add `issuedAt: f.properties.sent` to the constructed `Alert`

### Debug-alert synthesizer — `server/nws/debug-alerts.ts`

- Synthetic alerts set `issuedAt` to the same `effective` value (already `now.toISOString()`)

## Component layout

### New files

```
client/components/TerminalModal.tsx      # Reusable chrome primitive
client/components/AlertDetailBody.tsx    # Alert-specific content
client/alert-detail-format.ts            # Pure helpers (testable)
client/alert-detail-format.test.ts       # Vitest tests for pure helpers
client/styles/terminal-modal.css         # Primitive stylesheet
```

### Modified files

| File | Change |
|---|---|
| `client/components/AlertBanner.tsx` | Event names become clickable triggers; new `onOpenDetail` prop |
| `client/App.tsx` | Owns `detailAlertId` state; renders `<TerminalModal>` with `<AlertDetailBody>` child |
| `shared/types.ts` | Add `issuedAt` to `Alert` |
| `server/nws/normalizer.ts` | Pull `sent`, populate `issuedAt` |
| `server/nws/debug-alerts.ts` | Synthesize `issuedAt` |
| `client/styles/hud.css` | Import `terminal-modal.css`; add `.alert-banner-event-trigger` styles |
| `PROJECT_STATUS.md` | Mark Feature 4 shipped |

### Component boundaries

**`TerminalModal`** — primitive with no alert-specific code.

```typescript
interface TerminalModalProps {
  open: boolean;
  onClose: () => void;
  titleGlyph: string;          // e.g. "▲" or "▸"
  titleText: string;           // e.g. "TORNADO WARNING"
  titleRight: React.ReactNode; // timestamp string or JSX
  accentColor: string;         // CSS variable reference, e.g. var(--tier-tornado-warning)
  children: React.ReactNode;   // body content
}
```

Responsibilities: overlay, portal to `document.body`, title bar, × button, keyboard/overlay close, accent border, fade-in animation. Nothing about alerts or forecasts.

**`AlertDetailBody`** — alert-specific content, stateless.

```typescript
interface AlertDetailBodyProps {
  alert: Alert;
}
```

Renders the meta line and the parsed description paragraphs. No state, no effects. Thin map over `parseDescription(alert.description)` output.

**State ownership.** The `detailAlertId: string | null` state lives in `App.tsx`, not in `AlertBanner` or `TerminalModal`. Rationale: neither child should know about the other. `App.tsx` is the parent that knows about both.

## Interactions

### Open
Click on an event-name trigger in `AlertBanner` → `onOpenDetail(alert.id)` propagates to `App` → `App` sets `detailAlertId` → `TerminalModal` renders with matching alert as body.

### Close (any path)
- Click × button in title bar
- Click the dark overlay (guarded by mousedown+mouseup both on overlay, to avoid closing when a selection drag exits the modal)
- Press Esc

All three call the same `onClose`.

### Focus management
- On open: focus moves to the × button.
- On close: focus returns to the element that was active at open time (`document.activeElement` snapshot).
- **No focus trap.** Tab can escape the modal; Esc always closes. Acceptable for a single-user localhost dashboard.

### Rendering
- `createPortal(modalJSX, document.body)` — keeps z-index and positioning independent of where `App` renders it.
- 120ms opacity fade-in on overlay + modal together; no slide or scale.

### Accessibility
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title text id.

### Non-dismissible alerts (tornado-warning etc.)
The modal opens and closes normally. The alert banner's dismiss-× stays hidden per existing rules. The modal's × only closes the modal, not the alert — two different × buttons, two different scopes.

### Stale-alert edge case
If an active modal's alert disappears from a later poll (alert expired / cleared by NWS), `App` closes the modal via a `useEffect` that watches the alerts list: if `detailAlertId` is set and no alert in the current list matches, `setDetailAlertId(null)`. No crash, no stale data.

## Content rendering

### Meta line

Pure function `formatAlertMeta(alert): string`, returns:

```
ISSUED 2:14 PM · EXPIRES 3:00 PM · LINN COUNTY, IA
```

Timestamps use the existing `Intl.DateTimeFormat` config (`America/Chicago`, `h:mm a`, TZ abbrev). Area from `alert.areaDesc`.

### Description rendering

Pure function `parseDescription(text): Paragraph[]`:

```typescript
type Paragraph = {
  prefix: 'HAZARD' | 'SOURCE' | 'IMPACT' | null;
  text: string;  // paragraph text with the prefix keyword stripped
};
```

Splitting rules:
- Normalize line endings: `\r\n` → `\n`
- Split on double-newline (`\n\n`) into paragraphs
- Drop empty paragraphs at the start or end
- Single-newline breaks *within* a paragraph are preserved via `white-space: pre-wrap` on the `<p>` element
- For each paragraph: match `/^(HAZARD|SOURCE|IMPACT)\.\.\./`. If matched, `prefix` is the keyword; the prefix (`HAZARD...` or `SOURCE...` or `IMPACT...`) is stripped from `text` so the component can render the prefix and body text separately.

Rendering in `AlertDetailBody`:
- For paragraphs with a prefix: render `<span class="alert-detail-prefix">{prefix}...</span> {text}` inside the `<p>`. The span gets tier-color bold styling.
- For paragraphs with `prefix: null`: render `<p>{text}</p>` plainly.

### Tests planned for `alert-detail-format.test.ts`

| Case | Validates |
|---|---|
| Standard meta-line inputs | Happy-path formatting |
| Meta-line crossing midnight | Formatter behavior on date rollover |
| Three HAZARD/SOURCE/IMPACT paragraphs | Prefix classification |
| No special prefixes | All paragraphs plain |
| `\r\n` line endings | Windows-style normalization |
| Trailing blank lines | No empty trailing paragraph |
| Empty description | Returns `[]`, no crash |

## Styling

### New stylesheet — `client/styles/terminal-modal.css`

- `.terminal-modal-overlay` — `position: fixed; inset: 0; background: rgba(0,0,0,0.5);`
- `.terminal-modal` — width `clamp(480px, 75vw, 960px)`, max-height `80vh`, centered via flex on overlay, monospace font inherited
- Border: `2px solid var(--terminal-modal-accent)` where `--terminal-modal-accent` is set as an inline CSS variable: `style={{ '--terminal-modal-accent': accentColor }}`
- Outer glow: `box-shadow: 0 0 18px color-mix(in srgb, var(--terminal-modal-accent) 25%, transparent);`
- Title bar: `position: sticky; top: 0;` — stays pinned when body scrolls
- Body: `overflow-y: auto; padding: 14px;`
- Fade-in: 120ms `@keyframes` on mount
- **No `border-radius` anywhere.** Right angles match existing HUD language.

### Banner trigger styling — `client/styles/hud.css`

- `.alert-banner-event-trigger` — inline element, `cursor: pointer`, `text-decoration: underline` on hover, focus ring matches existing HUD focus style

### Accent color source

`AlertDetailBody` resolves the tier CSS variable (e.g. `var(--tier-tornado-warning)`) based on `alert.tier` and passes it up to `TerminalModal` via the `accentColor` prop. This reuses Feature 3's per-tier CSS variables — no new color work.

## Testing strategy

**Unit tests (vitest, node env):**
- `alert-detail-format.test.ts` — all pure function cases listed above

**Manual validation (via `SKYFRAME_DEBUG_TIERS`):**
- Inject single alert at each tier: verify clickable trigger in headline, modal opens with correct accent color
- Inject multiple alerts: verify expand-list items are clickable, each opens correct detail
- Inject a tornado-warning: verify non-dismissible banner + modal × both work
- Close paths: ×, Esc, overlay click — all three close the modal
- Focus: open then close → focus returns to the trigger
- Long description: scroll within modal, title bar stays pinned

## Documentation updates when shipped

- Update `PROJECT_STATUS.md` → "Implemented features" with Feature 4 entry
- Mark Feature 4 complete in [2026-04-17-v1.2-roadmap-design.md](2026-04-17-v1.2-roadmap-design.md) Section 4 (or leave as-is; roadmap docs are historical)

## Ship path

Branch off `main` as `feat/alert-detail-modal`. Ship via PR (not local merge) per `feedback_pr_workflow` memory.
