import { useEffect, useState } from 'react';
import type { ViewKey } from '../App';

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

interface TopBarProps {
  stationId: string | null;
  error: string | null;
  fallback: boolean;
  locationName: string;
  timezone: string | null;
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onLocationClick: () => void;
  onOpenSettings: () => void;
}

const TABS: Array<{ key: ViewKey; label: string }> = [
  { key: 'current', label: 'CURRENT' },
  { key: 'hourly',  label: 'HOURLY' },
  { key: 'outlook', label: 'OUTLOOK' },
  { key: 'all',     label: 'ALL' },
];

export function TopBar({ stationId, error, fallback, locationName, timezone, activeView, onViewChange, onLocationClick, onOpenSettings }: TopBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone ?? undefined,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });

  const dateFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone ?? undefined,
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  const t = partsToMap(timeFormat.formatToParts(now));
  const d = partsToMap(dateFormat.formatToParts(now));

  const digits = `${t.hour}:${t.minute}:${t.second}`;
  const tz = t.timeZoneName ?? '';
  const dateStr = `${d.weekday?.toUpperCase() ?? ''} · ${d.month?.toUpperCase() ?? ''} ${d.day ?? ''} · ${d.year ?? ''}`;

  const linkText = error || !stationId ? 'LINK.OFFLINE' : `LINK.${stationId}`;
  const offline = error || !stationId;
  const linkClass = offline ? 'link link-offline' : fallback ? 'link link-fallback' : 'link';
  const locClass = offline ? 'loc loc-offline' : 'loc';

  return (
    <div className="hud-topbar">
      <div className="hud-topbar-left">
        <div className={locClass}>
          <span className="loc-brand">■ SKYFRAME\\</span> &nbsp;·&nbsp;
          <span className="loc-link" onClick={onLocationClick} role="button" tabIndex={0}>
            {locationName || 'SET LOCATION'} ✎
          </span>
          &nbsp;·&nbsp;
          <span className={linkClass}>{linkText}</span>
        </div>
        <nav className="tabs" aria-label="View selector">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeView ? 'tab tab-active' : 'tab'}
              onClick={() => onViewChange(tab.key)}
              aria-pressed={tab.key === activeView}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="clock">
        <div className="clock-time">
          <span className="clock-digits">{digits}</span>
          <span className="tz clock-tz">{tz}</span>
        </div>
        <div className="clock-date">{dateStr}</div>
      </div>
      <button
        type="button"
        className="hud-topbar-settings"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
      >
        ≡
      </button>
    </div>
  );
}
