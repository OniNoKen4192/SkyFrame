import { useState } from 'react';
import type { Alert } from '../../shared/types';
import { tierRank } from '../../shared/alert-tiers';
import { isUpdateAlert } from '../alert-detail-format';

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
  onAcknowledgeSounds: () => void;
  anyLooping: boolean;
  timezone: string | null;
}

function formatExpires(iso: string, tz: string | null): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  return fmt.format(new Date(iso)).toUpperCase();
}

export function AlertBanner({ alerts, onDismiss, onOpenDetail, onAcknowledgeSounds, anyLooping, timezone }: AlertBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const primary = alerts[0]!;
  const primaryEventUpper = primary.event.toUpperCase();
  const expiresLabel = formatExpires(primary.expires, timezone);

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
                {isUpdateAlert(primary) ? null : <>{' · UNTIL '}{expiresLabel}</>}
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
                {isUpdateAlert(primary) ? null : <>{' UNTIL '}{expiresLabel}</>}
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
        {anyLooping && (
          <button
            type="button"
            className="alert-banner-silence"
            onClick={onAcknowledgeSounds}
            aria-label="Silence alert sound"
          >
            SILENCE
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
              {!isUpdateAlert(a) && (
                <>
                  <span className="alert-banner-list-sep"> · </span>
                  <span className="alert-banner-list-expires">until {formatExpires(a.expires, timezone)}</span>
                </>
              )}
              <span className="alert-banner-list-sep">  ·  </span>
              <span className="alert-banner-list-area">({a.areaDesc})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
