import { useEffect, useState } from 'react';
import type { Alert } from '../../shared/types';

const DISMISSED_KEY = 'skyframe.alerts.dismissed';

interface AlertBannerProps {
  alerts: Alert[];
}

function formatExpires(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  return fmt.format(new Date(iso)).toUpperCase();
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    // Quota exceeded or storage unavailable — silently degrade.
  }
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [expanded, setExpanded] = useState(false);

  // Prune dismissed ids to only include currently-active alerts so the list
  // doesn't grow unbounded across days/weeks.
  useEffect(() => {
    const activeIds = new Set(alerts.map((a) => a.id));
    let changed = false;
    const pruned = new Set<string>();
    for (const id of dismissed) {
      if (activeIds.has(id)) {
        pruned.add(id);
      } else {
        changed = true;
      }
    }
    if (changed) {
      setDismissed(pruned);
      saveDismissed(pruned);
    }
    // Only re-run when the alert id set changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.id).join('|')]);

  const visible = alerts.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  const primary = visible[0]!;
  const headline = visible.length === 1
    ? `${primary.event.toUpperCase()} · UNTIL ${formatExpires(primary.expires)}`
    : `${visible.length} ACTIVE ALERTS · ${primary.event.toUpperCase()} UNTIL ${formatExpires(primary.expires)}`;

  const canExpand = visible.length > 1;

  const dismissPrimary = () => {
    const next = new Set(dismissed);
    next.add(primary.id);
    setDismissed(next);
    saveDismissed(next);
  };

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
          <span className="alert-banner-headline">{headline}</span>
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
        <button
          type="button"
          className="alert-banner-dismiss"
          onClick={dismissPrimary}
          aria-label={`Dismiss ${primary.event}`}
        >
          ×
        </button>
      </div>
      {expanded && (
        <ul className="alert-banner-list">
          {visible.map((a) => (
            <li key={a.id}>
              <span className="alert-banner-list-event">{a.event}</span>
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
