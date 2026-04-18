# Alert Detail Terminal Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Feature 4 from the v1.2 roadmap — clicking an alert's event name in the `AlertBanner` opens a terminal-styled modal showing the full NWS description, issued/expires times, and affected area.

**Architecture:** Introduce a reusable `TerminalModal` primitive that owns chrome (overlay, title bar, close, accent border) and a feature-specific `AlertDetailBody` that owns alert content. Correctness-sensitive rendering logic (description parsing, meta-line formatting) lives in pure functions with unit tests. All React behavior is validated manually per the project's existing "test pure logic, validate React manually" discipline.

**Tech Stack:** React 18, TypeScript, Vitest (node env), Fastify (server), NWS `/alerts/active` endpoint.

**Design spec:** [`docs/superpowers/specs/2026-04-18-alert-detail-modal-design.md`](../specs/2026-04-18-alert-detail-modal-design.md)

**Branch:** `feat/alert-detail-modal` (already created off `main`).

---

## Pre-work checklist

Confirm environment before starting:

- [ ] On branch `feat/alert-detail-modal`: run `git branch --show-current`, expect `feat/alert-detail-modal`
- [ ] Working tree clean: run `git status`, expect `nothing to commit, working tree clean`
- [ ] Tests green: run `npm test`, expect all passing
- [ ] Typecheck green: run `npm run typecheck`, expect no errors

---

## Task 1: Data — add `issuedAt` to `Alert` type + normalizer + debug synthesizer

**Files:**
- Modify: [`shared/types.ts`](../../../shared/types.ts) — add `issuedAt: string` to `Alert`
- Modify: [`server/nws/normalizer.ts`](../../../server/nws/normalizer.ts) — add `sent` to `NwsAlertsResponse`, pull into `issuedAt`
- Modify: [`server/nws/debug-alerts.ts`](../../../server/nws/debug-alerts.ts) — synthesize `sent`
- Test: [`server/nws/normalizer.test.ts`](../../../server/nws/normalizer.test.ts) — assert `issuedAt` populated

### Steps

- [ ] **Step 1.1: Write the failing test**

Add this to `server/nws/normalizer.test.ts` inside the existing `describe('alerts', ...)` block (after the last existing `it(...)`):

```typescript
it('populates issuedAt from NWS sent field', async () => {
  mockWithAlerts({
    features: [
      {
        properties: {
          id: 'urn:oid:nws.alerts.issued',
          event: 'Tornado Warning',
          severity: 'Extreme',
          headline: 'Tornado',
          description: 'A tornado has been reported.',
          sent:      '2026-04-16T16:28:00Z',
          effective: '2026-04-16T16:30:00Z',
          expires:   '2026-04-16T17:15:00Z',
          areaDesc:  'Linn County, IA',
        },
      },
    ],
  });

  const result = await normalizeWeather();
  expect(result.alerts).toHaveLength(1);
  expect(result.alerts[0]!.issuedAt).toBe('2026-04-16T16:28:00Z');
});

it('falls back to effective when sent is missing', async () => {
  mockWithAlerts({
    features: [
      {
        properties: {
          id: 'urn:oid:nws.alerts.nosent',
          event: 'Wind Advisory',
          severity: 'Minor',
          headline: 'Wind',
          description: 'Breezy.',
          effective: '2026-04-16T10:00:00Z',
          expires:   '2026-04-16T20:00:00Z',
          areaDesc:  'Somewhere',
        },
      },
    ],
  });

  const result = await normalizeWeather();
  expect(result.alerts[0]!.issuedAt).toBe('2026-04-16T10:00:00Z');
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- server/nws/normalizer.test.ts`

Expected: the two new tests FAIL. Reason: `issuedAt` is `undefined` because the type doesn't have it yet and the normalizer doesn't populate it. (Typecheck may also fail before the test runs — that's fine, fix it in the next steps.)

- [ ] **Step 1.3: Add `issuedAt` to the `Alert` type**

In [`shared/types.ts`](../../../shared/types.ts), modify the `Alert` interface (currently lines 99–109) to add `issuedAt`:

```typescript
export interface Alert {
  id: string;
  event: string;
  tier: AlertTier;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  headline: string;
  description: string;
  issuedAt: string;         // NEW — ISO timestamp from NWS `sent` field
  effective: string;
  expires: string;
  areaDesc: string;
}
```

- [ ] **Step 1.4: Pull `sent` in the normalizer**

In [`server/nws/normalizer.ts`](../../../server/nws/normalizer.ts):

Modify `NwsAlertsResponse` (currently around lines 140–154) to add `sent: string`:

```typescript
export interface NwsAlertsResponse {
  features: Array<{
    properties: {
      id: string;
      event: string;
      severity: string;
      headline: string;
      description: string;
      sent?: string;         // NEW — CAP-spec issuance time; optional for tolerance
      effective: string;
      expires: string;
      areaDesc: string;
      parameters?: Record<string, string[] | string>;
    };
  }>;
}
```

Inside `normalizeAlerts` (around line 223), modify the object literal that constructs each `Alert` to add `issuedAt` right after `description`:

```typescript
result.push({
  id: f.properties.id,
  event: f.properties.event,
  tier,
  severity,
  headline: f.properties.headline,
  description: f.properties.description,
  issuedAt: f.properties.sent ?? f.properties.effective,
  effective: f.properties.effective,
  expires: f.properties.expires,
  areaDesc: f.properties.areaDesc,
});
```

(Adjust property ordering if the existing code uses a different order — the important thing is `issuedAt` is set.)

- [ ] **Step 1.5: Synthesize `sent` in debug-alerts**

In [`server/nws/debug-alerts.ts`](../../../server/nws/debug-alerts.ts), modify `synthesizeDebugAlerts` (around line 44) to include `sent`. The feature's `properties` object (around lines 52–63) should add `sent: effective` right above `effective`:

```typescript
return {
  properties: {
    id: `debug-${tier}-${index}`,
    event: spec.event,
    severity: spec.severity,
    headline: `DEBUG: ${spec.event} issued for {CITY} (synthetic)`,
    description: 'Synthetic alert for development (SKYFRAME_DEBUG_TIERS env var is active).',
    sent: effective,
    effective,
    expires,
    areaDesc: 'Debug Mode',
    ...(parameters ? { parameters } : {}),
  },
};
```

- [ ] **Step 1.6: Run tests and typecheck**

Run: `npm test -- server/nws/normalizer.test.ts`
Expected: both new tests PASS. Existing tests in the same file continue to PASS.

Run: `npm run typecheck`
Expected: no errors.

Run the full test suite: `npm test`
Expected: all passing.

- [ ] **Step 1.7: Commit**

```bash
git add shared/types.ts server/nws/normalizer.ts server/nws/debug-alerts.ts server/nws/normalizer.test.ts
git commit -m "$(cat <<'EOF'
Add issuedAt to Alert type, sourced from NWS sent field

The alert detail modal's title-bar timestamp is semantically the
issuance time (CAP sent), not the effective time. Pull sent from
the NWS /alerts/active response and expose it as issuedAt on the
normalized Alert type. Falls back to effective when sent is
missing so older fixtures remain valid.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure function — `parseDescription`

**Files:**
- Create: [`client/alert-detail-format.ts`](../../../client/alert-detail-format.ts)
- Create: [`client/alert-detail-format.test.ts`](../../../client/alert-detail-format.test.ts)

### Steps

- [ ] **Step 2.1: Write the failing test file**

Create `client/alert-detail-format.test.ts` with these test cases:

```typescript
import { describe, it, expect } from 'vitest';
import { parseDescription } from './alert-detail-format';

describe('parseDescription', () => {
  it('returns an empty array for an empty string', () => {
    expect(parseDescription('')).toEqual([]);
  });

  it('returns one paragraph with null prefix for plain text', () => {
    expect(parseDescription('A tornado has been reported.')).toEqual([
      { prefix: null, text: 'A tornado has been reported.' },
    ]);
  });

  it('splits paragraphs on double newline', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'First paragraph.' },
      { prefix: null, text: 'Second paragraph.' },
    ]);
  });

  it('classifies HAZARD, SOURCE, IMPACT prefixes and strips them from text', () => {
    const input = [
      'The NWS has issued a warning.',
      '',
      'HAZARD...Tornado and quarter size hail.',
      '',
      'SOURCE...Radar indicated rotation.',
      '',
      'IMPACT...Flying debris will be dangerous.',
    ].join('\n');

    expect(parseDescription(input)).toEqual([
      { prefix: null,     text: 'The NWS has issued a warning.' },
      { prefix: 'HAZARD', text: 'Tornado and quarter size hail.' },
      { prefix: 'SOURCE', text: 'Radar indicated rotation.' },
      { prefix: 'IMPACT', text: 'Flying debris will be dangerous.' },
    ]);
  });

  it('normalizes Windows-style \\r\\n line endings', () => {
    const input = 'First line.\r\n\r\nSecond line.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'First line.' },
      { prefix: null, text: 'Second line.' },
    ]);
  });

  it('drops trailing empty paragraphs', () => {
    const input = 'Only paragraph.\n\n\n\n';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Only paragraph.' },
    ]);
  });

  it('drops leading empty paragraphs', () => {
    const input = '\n\nOnly paragraph.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Only paragraph.' },
    ]);
  });

  it('preserves internal single newlines within a paragraph', () => {
    const input = 'Line one.\nLine two still same paragraph.\n\nNext paragraph.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Line one.\nLine two still same paragraph.' },
      { prefix: null, text: 'Next paragraph.' },
    ]);
  });

  it('does not classify prefixes that are lowercase or not at paragraph start', () => {
    const input = 'Some text mentioning HAZARD...inline.\n\nhazard...not uppercase.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Some text mentioning HAZARD...inline.' },
      { prefix: null, text: 'hazard...not uppercase.' },
    ]);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npm test -- client/alert-detail-format.test.ts`

Expected: FAIL with "Cannot find module './alert-detail-format'" or similar — the file doesn't exist yet.

- [ ] **Step 2.3: Implement `parseDescription`**

Create `client/alert-detail-format.ts`:

```typescript
export type AlertDescriptionParagraph = {
  prefix: 'HAZARD' | 'SOURCE' | 'IMPACT' | null;
  text: string;
};

const PREFIX_RE = /^(HAZARD|SOURCE|IMPACT)\.\.\.\s*/;

export function parseDescription(raw: string): AlertDescriptionParagraph[] {
  if (raw === '') return [];

  const normalized = raw.replace(/\r\n/g, '\n');
  const chunks = normalized.split(/\n{2,}/);

  const paragraphs: AlertDescriptionParagraph[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed === '') continue;

    const match = PREFIX_RE.exec(trimmed);
    if (match) {
      const prefix = match[1] as 'HAZARD' | 'SOURCE' | 'IMPACT';
      paragraphs.push({ prefix, text: trimmed.slice(match[0].length) });
    } else {
      paragraphs.push({ prefix: null, text: trimmed });
    }
  }

  return paragraphs;
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npm test -- client/alert-detail-format.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 2.5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2.6: Commit**

```bash
git add client/alert-detail-format.ts client/alert-detail-format.test.ts
git commit -m "$(cat <<'EOF'
Add parseDescription helper for NWS alert body rendering

Pure function that splits NWS description text into paragraphs and
classifies the HAZARD/SOURCE/IMPACT prefixes NWS uses for
structured alert sections. Tested against the edge cases that
matter for rendering: line-ending normalization, blank-paragraph
trimming, and inline vs. start-of-paragraph prefix detection.

Consumed by the upcoming AlertDetailBody component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pure function — `formatAlertMeta`

**Files:**
- Modify: [`client/alert-detail-format.ts`](../../../client/alert-detail-format.ts)
- Modify: [`client/alert-detail-format.test.ts`](../../../client/alert-detail-format.test.ts)

### Steps

- [ ] **Step 3.1: Write the failing test**

Append to `client/alert-detail-format.test.ts`:

```typescript
import { formatAlertMeta } from './alert-detail-format';
import type { Alert } from '../shared/types';

const SAMPLE_ALERT: Alert = {
  id: 'x',
  event: 'Tornado Warning',
  tier: 'tornado-warning',
  severity: 'Extreme',
  headline: 'Tornado Warning',
  description: 'irrelevant',
  issuedAt: '2026-04-16T19:14:00Z',  // 2:14 PM CDT
  effective: '2026-04-16T19:14:00Z',
  expires:   '2026-04-16T20:00:00Z',  // 3:00 PM CDT
  areaDesc: 'Linn County, IA',
};

describe('formatAlertMeta', () => {
  it('renders issued / expires / area in uppercase with bullet separators', () => {
    const result = formatAlertMeta(SAMPLE_ALERT);
    expect(result).toBe('ISSUED 2:14 PM CDT \u00B7 EXPIRES 3:00 PM CDT \u00B7 LINN COUNTY, IA');
  });

  it('handles expires crossing midnight', () => {
    const alert: Alert = {
      ...SAMPLE_ALERT,
      issuedAt: '2026-04-16T04:30:00Z',  // 11:30 PM CDT previous day
      expires:  '2026-04-16T06:00:00Z',  // 1:00 AM CDT
    };
    const result = formatAlertMeta(alert);
    expect(result).toBe('ISSUED 11:30 PM CDT \u00B7 EXPIRES 1:00 AM CDT \u00B7 LINN COUNTY, IA');
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npm test -- client/alert-detail-format.test.ts`
Expected: FAIL with "formatAlertMeta is not a function" (or similar — symbol not exported).

- [ ] **Step 3.3: Implement `formatAlertMeta`**

Append to `client/alert-detail-format.ts`:

```typescript
import type { Alert } from '../shared/types';

const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso)).toUpperCase();
}

export function formatAlertMeta(alert: Alert): string {
  const issued = formatTime(alert.issuedAt);
  const expires = formatTime(alert.expires);
  const area = alert.areaDesc.toUpperCase();
  return `ISSUED ${issued} \u00B7 EXPIRES ${expires} \u00B7 ${area}`;
}
```

Notes on choices:
- Same `America/Chicago` hardcoded timezone as `AlertBanner.formatExpires` — consistent with the rest of the app. If the app later grows a configurable timezone, this and the other hardcoded call both move together.
- `\u00B7` is the middle-dot (`·`) character; using the escape avoids any encoding ambiguity in the source file.

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npm test -- client/alert-detail-format.test.ts`
Expected: all tests PASS (both `parseDescription` group and new `formatAlertMeta` group).

- [ ] **Step 3.5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3.6: Commit**

```bash
git add client/alert-detail-format.ts client/alert-detail-format.test.ts
git commit -m "$(cat <<'EOF'
Add formatAlertMeta helper for the detail-modal meta line

Formats an Alert's issued/expires timestamps plus the affected
area into the one-line string shown above the alert description
body: "ISSUED 2:14 PM CDT · EXPIRES 3:00 PM CDT · LINN COUNTY,
IA". Reuses the same America/Chicago Intl formatter pattern as
AlertBanner.formatExpires.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `TerminalModal` primitive + stylesheet

**Files:**
- Create: [`client/components/TerminalModal.tsx`](../../../client/components/TerminalModal.tsx)
- Create: [`client/styles/terminal-modal.css`](../../../client/styles/terminal-modal.css)
- Modify: [`index.html`](../../../index.html) — add `<link>` for the new stylesheet

This task builds UI. Per the decision recorded in the spec (no RTL / jsdom), it ships with no unit tests; correctness is validated manually in Task 8.

### Steps

- [ ] **Step 4.1: Create the stylesheet**

Create `client/styles/terminal-modal.css`:

```css
/* ============================================================
   Terminal Modal — reusable primitive for alert detail (v1.2 #4)
   and forecast narrative (v1.2 #5). Chrome only; content is
   passed as children.

   Right-angled HUD aesthetic — no border-radius anywhere.
   ============================================================ */

.terminal-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: terminal-modal-fade 120ms ease-out;
}

.terminal-modal {
  background: #08121a;
  color: #cfd8e3;
  width: clamp(480px, 75vw, 960px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--terminal-modal-accent, #22d3ee);
  box-shadow: 0 0 18px color-mix(in srgb, var(--terminal-modal-accent, #22d3ee) 25%, transparent);
  font-family: inherit;
  animation: terminal-modal-fade 120ms ease-out;
}

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

.terminal-modal-title {
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 12px;
}

.terminal-modal-title-right {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #8b95a7;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.terminal-modal-close {
  background: none;
  border: none;
  color: #8b95a7;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.terminal-modal-close:hover {
  color: #cfd8e3;
}

.terminal-modal-body {
  padding: 14px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.55;
}

@keyframes terminal-modal-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

- [ ] **Step 4.2: Wire the stylesheet into `index.html`**

Modify [`index.html`](../../../index.html) to add a second `<link>` tag after the existing one:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SkyFrame</title>
    <link rel="stylesheet" href="/client/styles/hud.css" />
    <link rel="stylesheet" href="/client/styles/terminal-modal.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/client/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4.3: Create `TerminalModal.tsx`**

Create `client/components/TerminalModal.tsx`:

```typescript
import { useEffect, useId, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

interface TerminalModalProps {
  open: boolean;
  onClose: () => void;
  titleGlyph: string;
  titleText: string;
  titleRight: ReactNode;
  accentColor: string;
  children: ReactNode;
}

export function TerminalModal({
  open,
  onClose,
  titleGlyph,
  titleText,
  titleRight,
  accentColor,
  children,
}: TerminalModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayMouseDownRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    // Snapshot the element that had focus at open time so we can restore
    // it when the modal closes — keyboard users land back on the trigger
    // they pressed, not on document.body.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  // Overlay click-to-close: require mousedown AND mouseup to both land on the
  // overlay itself. Prevents closing when a text-selection drag starts inside
  // the modal body and releases over the overlay.
  const onOverlayMouseDown = (e: React.MouseEvent) => {
    overlayMouseDownRef.current = e.target === e.currentTarget;
  };
  const onOverlayMouseUp = (e: React.MouseEvent) => {
    if (overlayMouseDownRef.current && e.target === e.currentTarget) {
      onClose();
    }
    overlayMouseDownRef.current = false;
  };

  const modalStyle = { '--terminal-modal-accent': accentColor } as CSSProperties;

  const content = (
    <div
      className="terminal-modal-overlay"
      onMouseDown={onOverlayMouseDown}
      onMouseUp={onOverlayMouseUp}
    >
      <div
        className="terminal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={modalStyle}
      >
        <div className="terminal-modal-titlebar">
          <div id={titleId} className="terminal-modal-title">
            {titleGlyph} {titleText}
          </div>
          <div className="terminal-modal-title-right">
            <span>{titleRight}</span>
            <button
              ref={closeRef}
              type="button"
              className="terminal-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="terminal-modal-body">{children}</div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
```

- [ ] **Step 4.4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4.5: Commit**

```bash
git add client/components/TerminalModal.tsx client/styles/terminal-modal.css index.html
git commit -m "$(cat <<'EOF'
Add TerminalModal reusable primitive

Introduces the modal chrome used by the Feature 4 alert detail
modal and the upcoming Feature 5 forecast narrative popup.
Handles overlay rendering via portal, focus on open, Esc and
backdrop close, accent-colored border driven by a CSS variable,
and a sticky title bar so scrolling body content stays below the
title.

No alert- or forecast-specific code; content is passed as
children.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `AlertDetailBody` component

**Files:**
- Create: [`client/components/AlertDetailBody.tsx`](../../../client/components/AlertDetailBody.tsx)

### Steps

- [ ] **Step 5.1: Create `AlertDetailBody.tsx`**

```typescript
import type { Alert } from '../../shared/types';
import { formatAlertMeta, parseDescription } from '../alert-detail-format';

interface AlertDetailBodyProps {
  alert: Alert;
}

export function AlertDetailBody({ alert }: AlertDetailBodyProps) {
  const meta = formatAlertMeta(alert);
  const paragraphs = parseDescription(alert.description);

  return (
    <>
      <div className="alert-detail-meta">{meta}</div>
      {paragraphs.map((p, i) => (
        <p key={i} className="alert-detail-paragraph">
          {p.prefix && <span className="alert-detail-prefix">{p.prefix}...</span>}
          {p.prefix ? ' ' : ''}{p.text}
        </p>
      ))}
    </>
  );
}
```

- [ ] **Step 5.2: Add styles for the body**

Append to `client/styles/terminal-modal.css`:

```css
/* Alert-detail-specific content styles. Lives with the modal
   stylesheet because it's tightly coupled to how the body renders
   inside the modal; splitting would be one more file to trace. */
.alert-detail-meta {
  color: var(--terminal-modal-accent, #22d3ee);
  font-size: 11px;
  letter-spacing: 0.04em;
  margin-bottom: 10px;
  font-weight: 700;
}

.alert-detail-paragraph {
  margin: 0 0 9px;
  white-space: pre-wrap;
}

.alert-detail-prefix {
  color: var(--terminal-modal-accent, #22d3ee);
  font-weight: 700;
}
```

- [ ] **Step 5.3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5.4: Commit**

```bash
git add client/components/AlertDetailBody.tsx client/styles/terminal-modal.css
git commit -m "$(cat <<'EOF'
Add AlertDetailBody modal content component

Renders the meta line and parsed description paragraphs for a
single alert inside the TerminalModal shell. Thin map over the
parseDescription and formatAlertMeta helpers; no state or
effects.

HAZARD / SOURCE / IMPACT prefixes render in the modal's accent
color (matching the alert tier) to preserve NWS's visual
hierarchy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `AlertBanner` — event-name click triggers

**Files:**
- Modify: [`client/components/AlertBanner.tsx`](../../../client/components/AlertBanner.tsx)
- Modify: [`client/styles/hud.css`](../../../client/styles/hud.css) — add `.alert-banner-event-trigger` styles

### Steps

- [ ] **Step 6.1: Modify `AlertBanner.tsx`**

Replace the entire file contents with:

```typescript
import { useState } from 'react';
import type { Alert } from '../../shared/types';
import { tierRank } from '../../shared/alert-tiers';

// Tornado Emergency, PDS Tornado, Tornado Warning, Destructive Severe
// Thunderstorm Warning, and Severe Thunderstorm Warning — imminent /
// short-duration threats. The user shouldn't be able to silence these.
// Longer-duration alerts (blizzard, winter storm, flood, heat, SWS,
// watches) remain dismissible so they don't nag for hours.
const NON_DISMISSIBLE_RANK_THRESHOLD = 5;

interface AlertBannerProps {
  alerts: Alert[];                    // already filtered to visible by App
  onDismiss: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

function formatExpires(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  return fmt.format(new Date(iso)).toUpperCase();
}

export function AlertBanner({ alerts, onDismiss, onOpenDetail }: AlertBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const primary = alerts[0]!;
  const primaryEventUpper = primary.event.toUpperCase();
  const expiresLabel = formatExpires(primary.expires);

  const canExpand = alerts.length > 1;
  const canDismiss = tierRank(primary.tier) > NON_DISMISSIBLE_RANK_THRESHOLD;

  return (
    <div
      className={`alert-banner ${expanded ? 'alert-banner-expanded' : ''}`}
      data-tier={primary.tier}
      role="status"
      aria-live="polite"
    >
      <div className="alert-banner-row">
        <div className="alert-banner-stripes alert-banner-stripes-left" aria-hidden="true" />
        <div className="alert-banner-content">
          <span className="alert-banner-glyph">▲</span>
          <span className="alert-banner-headline">
            {alerts.length === 1 ? (
              <>
                <button
                  type="button"
                  className="alert-banner-event-trigger"
                  onClick={() => onOpenDetail(primary.id)}
                  aria-label={`Show details for ${primary.event}`}
                >
                  {primaryEventUpper}
                </button>
                {' · UNTIL '}{expiresLabel}
              </>
            ) : (
              <>
                {alerts.length}{' ACTIVE ALERTS · '}
                <button
                  type="button"
                  className="alert-banner-event-trigger"
                  onClick={() => onOpenDetail(primary.id)}
                  aria-label={`Show details for ${primary.event}`}
                >
                  {primaryEventUpper}
                </button>
                {' UNTIL '}{expiresLabel}
              </>
            )}
          </span>
        </div>
        <div className="alert-banner-stripes alert-banner-stripes-right" aria-hidden="true" />
        {canExpand && (
          <button
            type="button"
            className="alert-banner-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse alerts list' : 'Expand alerts list'}
          >
            {expanded ? '▴' : '▾'}
          </button>
        )}
        {canDismiss && (
          <button
            type="button"
            className="alert-banner-dismiss"
            onClick={() => onDismiss(primary.id)}
            aria-label={`Dismiss ${primary.event}`}
          >
            ×
          </button>
        )}
      </div>
      {expanded && (
        <ul className="alert-banner-list">
          {alerts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="alert-banner-event-trigger alert-banner-list-event"
                onClick={() => onOpenDetail(a.id)}
                aria-label={`Show details for ${a.event}`}
              >
                {a.event}
              </button>
              <span className="alert-banner-list-sep"> · </span>
              <span className="alert-banner-list-expires">until {formatExpires(a.expires)}</span>
              <span className="alert-banner-list-sep">  ·  </span>
              <span className="alert-banner-list-area">({a.areaDesc})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Key changes:
- New `onOpenDetail` prop
- Single-alert headline: event name is now a `<button class="alert-banner-event-trigger">` wrapping `primaryEventUpper`
- Multi-alert headline: same — the event-name portion is a button; the count and " ACTIVE ALERTS · " text around it remain plain text
- Expanded list items: the leading `<span class="alert-banner-list-event">` is replaced with a `<button>` that has both `alert-banner-event-trigger` and `alert-banner-list-event` classes (keeping the existing class for any CSS selectors that already reference it)

- [ ] **Step 6.2: Add trigger styling to `hud.css`**

Append to `client/styles/hud.css` (at the end of the file is fine):

```css
/* ============================================================
   Clickable alert event names — opens the alert detail modal
   (v1.2 Feature 4). Inline button styled to look like text; the
   underline-on-hover is the only visible affordance.
   ============================================================ */
.alert-banner-event-trigger {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  padding: 0;
  cursor: pointer;
  text-shadow: inherit;
}

.alert-banner-event-trigger:hover {
  text-decoration: underline;
}

.alert-banner-event-trigger:focus-visible {
  outline: 1px dashed currentColor;
  outline-offset: 2px;
}
```

- [ ] **Step 6.3: Typecheck**

Run: `npm run typecheck`
Expected: errors in `App.tsx` ("Property 'onOpenDetail' is missing in type") — these get fixed in Task 7. Don't commit this task until Task 7 is done. **Skip Step 6.4 and go directly to Task 7.**

---

## Task 7: `App.tsx` — wire up modal state, render `TerminalModal` + `AlertDetailBody`

**Files:**
- Modify: [`client/App.tsx`](../../../client/App.tsx)

### Steps

- [ ] **Step 7.1: Modify `App.tsx`**

Apply these changes:

**(a) Add imports** at the top, next to the existing `AlertBanner` import:

```typescript
import { AlertBanner } from './components/AlertBanner';
import { TerminalModal } from './components/TerminalModal';
import { AlertDetailBody } from './components/AlertDetailBody';
import { TIER_COLORS } from '../shared/alert-tiers';
```

**(b) Add state** inside `App()` — right after the existing `useState` for `units`:

```typescript
const [detailAlertId, setDetailAlertId] = useState<string | null>(null);
```

**(c) Add stale-alert-cleanup `useEffect`** after the existing `dismissed`-pruning effect (the block ending around line 183):

```typescript
// If the alert whose modal is open disappears from a later poll (expired
// on the NWS side), close the modal rather than render a stale title.
useEffect(() => {
  if (detailAlertId === null) return;
  if (!alerts.some((a) => a.id === detailAlertId)) {
    setDetailAlertId(null);
  }
}, [alerts, detailAlertId]);
```

**(d) Derive the active-detail alert** — add this right before the `return (` statement:

```typescript
const detailAlert = detailAlertId !== null
  ? alerts.find((a) => a.id === detailAlertId) ?? null
  : null;

const detailIssuedLabel = detailAlert
  ? new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).format(new Date(detailAlert.issuedAt)).toUpperCase()
  : '';
```

**(e) Pass `onOpenDetail` to `AlertBanner` and render the modal** — replace the existing `<AlertBanner>` line with:

```typescript
{visible.length > 0 && (
  <AlertBanner
    alerts={visible}
    onDismiss={dismissAlert}
    onOpenDetail={setDetailAlertId}
  />
)}
```

**(f) Render the modal** — add at the top of the returned JSX, alongside the existing `{showSetup && ...}` and banner:

```typescript
<TerminalModal
  open={detailAlert !== null}
  onClose={() => setDetailAlertId(null)}
  titleGlyph="▲"
  titleText={detailAlert?.event.toUpperCase() ?? ''}
  titleRight={detailIssuedLabel}
  accentColor={detailAlert ? TIER_COLORS[detailAlert.tier].base : '#22d3ee'}
>
  {detailAlert && <AlertDetailBody alert={detailAlert} />}
</TerminalModal>
```

Placement note: order doesn't really matter (modal is portaled to `document.body`), but put it right after the `<AlertBanner>` render for proximity. The `open={false}` case renders `null`, so the empty defaults (`titleText=''`, `accentColor='#22d3ee'`) are never seen.

**(g) Verify the final JSX** looks roughly like this:

```typescript
return (
  <div className="hud-showcase" data-alert-tier={primaryTier}>
    {showSetup && (
      <LocationSetup
        onComplete={handleSetupComplete}
        onCancel={configured ? () => setShowSetup(false) : undefined}
      />
    )}
    {visible.length > 0 && (
      <AlertBanner
        alerts={visible}
        onDismiss={dismissAlert}
        onOpenDetail={setDetailAlertId}
      />
    )}
    <TerminalModal
      open={detailAlert !== null}
      onClose={() => setDetailAlertId(null)}
      titleGlyph="▲"
      titleText={detailAlert?.event.toUpperCase() ?? ''}
      titleRight={detailIssuedLabel}
      accentColor={detailAlert ? TIER_COLORS[detailAlert.tier].base : '#22d3ee'}
    >
      {detailAlert && <AlertDetailBody alert={detailAlert} />}
    </TerminalModal>
    <TopBar ... />
    {renderView()}
    <Footer ... />
  </div>
);
```

- [ ] **Step 7.2: Typecheck**

Run: `npm run typecheck`
Expected: no errors now (Task 6's missing-prop error is resolved).

- [ ] **Step 7.3: Run full test suite**

Run: `npm test`
Expected: all tests pass — no test touches React components.

- [ ] **Step 7.4: Build succeeds**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 7.5: Commit Task 6 + Task 7 together**

The AlertBanner changes and the App wire-up are a single coherent change from the compiler's perspective (the prop added in one is consumed by the other). Commit them together:

```bash
git add client/components/AlertBanner.tsx client/styles/hud.css client/App.tsx
git commit -m "$(cat <<'EOF'
Wire up alert detail modal in AlertBanner and App

AlertBanner: event names in the single-alert headline and
multi-alert expanded list become clickable buttons that call a
new onOpenDetail prop. Styling keeps the inline-text look — only
a hover underline and focus-visible outline signal
interactivity.

App: owns the detailAlertId state, resolves the matching alert,
passes tier color and issued-time label into TerminalModal.
Clears the state on next poll if the alert disappears (expired)
so the modal never shows stale data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual validation + `PROJECT_STATUS.md` update

**Files:**
- Modify: [`PROJECT_STATUS.md`](../../../PROJECT_STATUS.md)

### Steps

- [ ] **Step 8.1: Run the dev server with a single non-dismissible alert**

In a PowerShell terminal:

```powershell
$env:SKYFRAME_DEBUG_TIERS='tornado-warning'; npm run server
```

In a second terminal:

```bash
npm run dev
```

Open `http://localhost:5173` in a browser.

**Validate:**
- [ ] The banner shows `▲ TORNADO WARNING · UNTIL {time}` in red
- [ ] `TORNADO WARNING` is underlined on hover, shows a focus outline on keyboard focus
- [ ] No × dismiss button (non-dismissible tier)
- [ ] No expand toggle (single alert)
- [ ] Clicking `TORNADO WARNING` opens the modal: red border + subtle red glow, `▲ TORNADO WARNING` left, time + × right
- [ ] Meta line shows `ISSUED ... · EXPIRES ... · DEBUG MODE` in red
- [ ] Body renders the synthetic description text
- [ ] × button closes the modal
- [ ] Esc key closes the modal
- [ ] Clicking the dark overlay closes the modal
- [ ] Dragging a text selection from inside the body that ends over the overlay does NOT close the modal
- [ ] After closing, keyboard focus returns to the `TORNADO WARNING` trigger (press Tab to see where the focus ring lands)

- [ ] **Step 8.2: Test with multiple alerts**

Stop the server (Ctrl+C in the server terminal). Restart with multiple tiers:

```powershell
$env:SKYFRAME_DEBUG_TIERS='tornado-warning,flood,advisory-high'; npm run server
```

Reload the browser.

**Validate:**
- [ ] Banner shows `3 ACTIVE ALERTS · TORNADO WARNING UNTIL {time}` with underline-on-hover on `TORNADO WARNING`
- [ ] Expand toggle (`▾`) appears
- [ ] Clicking expand shows the three alerts; each event name is underlined on hover
- [ ] Clicking `Tornado Warning` in the list opens the modal with red accent
- [ ] Close the modal, click `Flood Warning` — modal reopens with green accent
- [ ] Close, click `Wind Advisory` — modal reopens with honey-orange accent
- [ ] Clicking the banner's × (visible because the primary is non-dismissible? no — actually tornado-warning is non-dismissible, so × is hidden; skip this bullet if so)

- [ ] **Step 8.3: Test a dismissible alert with long description**

This validates the scrollable body + sticky title bar. Edit the synthesizer temporarily *only for this test* (don't commit) to give the description real paragraph structure — or just use an advisory alert and trust the manual-lorem synthetic text is long enough. Stop the server and restart:

```powershell
$env:SKYFRAME_DEBUG_TIERS='flood'; npm run server
```

Open the Flood Warning modal.

**Validate:**
- [ ] Scrolling inside the body works (if the synthetic description is short, optionally paste a long fake description temporarily into `debug-alerts.ts` to test — revert before committing)
- [ ] The title bar stays pinned to the top while the body scrolls beneath

- [ ] **Step 8.4: Stop the dev server and debug env var**

Close both terminals. In a fresh terminal, confirm the env var is unset:

```powershell
Get-ChildItem Env:SKYFRAME_DEBUG_TIERS
```

Expected: "Cannot find path" error (var is not set). If set, close and reopen the terminal.

- [ ] **Step 8.5: Update `PROJECT_STATUS.md`**

Add Feature 4 to the "Implemented features" section in [`PROJECT_STATUS.md`](../../../PROJECT_STATUS.md). Match the style of the most recent v1.2 entry — short imperative bullet under a dated subsection. Exact wording for you to use:

```markdown
- **v1.2 Feature 4** ✅ Alert detail terminal modal — click an alert event name in the banner (single-alert headline or multi-alert expanded list) to open a terminal-styled modal with full NWS description text, issued/expires timestamps, and HAZARD/SOURCE/IMPACT prefix highlighting in the tier color. Introduces the reusable `TerminalModal` primitive (shared with upcoming Feature 5).
```

Place it near the other v1.2 entries, keeping the list chronological.

- [ ] **Step 8.6: Commit the status update**

```bash
git add PROJECT_STATUS.md
git commit -m "$(cat <<'EOF'
Document Feature 4 alert detail modal in PROJECT_STATUS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8.7: Push branch and open PR**

```bash
git push -u origin feat/alert-detail-modal
```

Then use `gh pr create` with a summary body covering: what shipped, manual validation performed, link to the design spec. Match the house style of prior merged PRs.

---

## Summary of commits

1. Add issuedAt to Alert type, sourced from NWS sent field
2. Add parseDescription helper for NWS alert body rendering
3. Add formatAlertMeta helper for the detail-modal meta line
4. Add TerminalModal reusable primitive
5. Add AlertDetailBody modal content component
6. Wire up alert detail modal in AlertBanner and App
7. Document Feature 4 alert detail modal in PROJECT_STATUS

Plus the already-committed spec on `feat/alert-detail-modal`.

---

## Self-review

**Spec coverage check:**
- `issuedAt` type + normalizer + debug synth → Task 1 ✅
- `parseDescription` pure function with all 7 test cases from spec → Task 2 ✅
- `formatAlertMeta` pure function → Task 3 ✅
- `TerminalModal` primitive with all props from spec, portal, Esc, backdrop click, focus on close, sticky title bar → Task 4 ✅
- No `border-radius` → Task 4 stylesheet explicitly omits it ✅
- `AlertDetailBody` → Task 5 ✅
- AlertBanner single-alert headline clickable + list items clickable → Task 6 ✅
- App owns `detailAlertId`, stale-alert useEffect, tier-color lookup from `TIER_COLORS` → Task 7 ✅
- Manual validation across tiers, close paths, focus return, long-description scroll → Task 8 ✅
- `PROJECT_STATUS.md` update → Task 8 ✅

**Placeholder scan:** none remaining. Every step has actual code or actual commands.

**Type-consistency scan:**
- `AlertDescriptionParagraph` exported from `alert-detail-format.ts`; consumed (via structural return type) in `AlertDetailBody` — ✅
- `TerminalModalProps.accentColor: string`; `App` passes `TIER_COLORS[tier].base` which is a `string` — ✅
- `onOpenDetail: (id: string) => void` — matches `setDetailAlertId` signature (`React.Dispatch<React.SetStateAction<string | null>>` accepts a `string` arg) — ✅
- Return-focus on close: TerminalModal captures `document.activeElement` when `open` becomes true and restores focus in the effect cleanup. Matches the spec requirement; validated in Task 8 Step 8.1.
