import { useRef, useState } from 'react';
import type { WeatherMeta } from '../../shared/types';
import { StationPopover, type StationOverrideMode } from './StationPopover';

interface FooterProps {
  meta: WeatherMeta | null;
  error: string | null;
  nextRetryAt?: string | null;
  timezone: string | null;
  stationOverride: StationOverrideMode | null;
  primaryStationId: string | null;
  fallbackStationId: string | null;
  onOverrideChange: (mode: StationOverrideMode) => Promise<void>;
}

function formatHM(iso: string | undefined, tz: string | null): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}:${map.second}`;
}

export function Footer({
  meta,
  error,
  nextRetryAt,
  timezone,
  stationOverride,
  primaryStationId,
  fallbackStationId,
  onOverrideChange,
}: FooterProps) {
  const offline = !!error || !meta;
  const autoFallback = !offline && meta.error === 'station_fallback';
  const pinned = stationOverride === 'force-secondary';
  const amber = autoFallback || pinned;

  const lastPull = formatHM(meta?.fetchedAt, timezone);
  const nextPull = error && nextRetryAt
    ? formatHM(nextRetryAt, timezone)
    : formatHM(meta?.nextRefreshAt, timezone);

  const dotClass = offline ? 'dot dot-error' : amber ? 'dot dot-fallback' : 'dot';
  const linkClass = amber ? 'footer-link footer-link-fallback' : 'footer-link';

  const linkRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const linkClickable = !offline && primaryStationId !== null && fallbackStationId !== null;
  const linkLabel = offline ? 'LINK.OFFLINE' : `LINK.${meta.stationId}`;

  const handleLinkClick = () => {
    if (!linkClickable) return;
    setPopoverOpen((v) => !v);
  };

  const handleOverrideChange = async (mode: StationOverrideMode) => {
    await onOverrideChange(mode);
  };

  return (
    <div className="hud-footer">
      <span className={dotClass}></span>
      <button
        ref={linkRef}
        type="button"
        className={`${linkClass} footer-link-button`}
        disabled={!linkClickable}
        onClick={handleLinkClick}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
      >
        {linkLabel}
      </button>
      {pinned && <span className="footer-link-pin">[PIN]</span>}
      &nbsp;·&nbsp; LAST PULL {lastPull} &nbsp;·&nbsp; NEXT {nextPull}

      {popoverOpen && linkClickable && stationOverride && primaryStationId && fallbackStationId && (
        <StationPopover
          anchorRef={linkRef}
          currentMode={stationOverride}
          primaryStationId={primaryStationId}
          fallbackStationId={fallbackStationId}
          timezone={timezone}
          onChange={handleOverrideChange}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  );
}
