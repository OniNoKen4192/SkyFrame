import { useEffect, useState } from 'react';
import type { ViewKey } from '../App';

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

interface TopBarProps {
  stationId: string | null;
  error: string | null;
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

const TABS: Array<{ key: ViewKey; label: string }> = [
  { key: 'current', label: 'CURRENT' },
  { key: 'hourly',  label: 'HOURLY' },
  { key: 'outlook', label: 'OUTLOOK' },
  { key: 'all',     label: 'ALL' },
];

export function TopBar({ stationId, error, activeView, onViewChange }: TopBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = partsToMap(TIME_FORMAT.formatToParts(now));
  const d = partsToMap(DATE_FORMAT.formatToParts(now));

  const digits = `${t.hour}:${t.minute}:${t.second}`;
  const tz = t.timeZoneName ?? '';
  const dateStr = `${d.weekday?.toUpperCase() ?? ''} · ${d.month?.toUpperCase() ?? ''} ${d.day ?? ''} · ${d.year ?? ''}`;

  const linkText = error ? 'LINK.OFFLINE' : `LINK.${stationId ?? 'KMKE'}`;
  const linkClass = error ? 'link link-offline' : 'link';
  const locClass = error ? 'loc loc-offline' : 'loc';

  return (
    <div className="hud-topbar">
      <div className="hud-topbar-left">
        <div className={locClass}>
          ■ SKYFRAME &nbsp;·&nbsp;
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
    </div>
  );
}
