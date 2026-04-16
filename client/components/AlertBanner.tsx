import { useState } from 'react';
import type { Alert } from '../../shared/types';

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

export function AlertBanner({ alerts }: AlertBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const primary = alerts[0]!;
  const headline = alerts.length === 1
    ? `${primary.event.toUpperCase()} · UNTIL ${formatExpires(primary.expires)}`
    : `${alerts.length} ACTIVE ALERTS · ${primary.event.toUpperCase()} UNTIL ${formatExpires(primary.expires)}`;

  const canExpand = alerts.length > 1;

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
      </div>
      {expanded && (
        <ul className="alert-banner-list">
          {alerts.map((a) => (
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
