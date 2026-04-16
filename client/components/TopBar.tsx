import { useEffect, useState } from 'react';

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
}

export function TopBar({ stationId, error }: TopBarProps) {
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
      <div className={locClass}>
        ■ SKYFRAME &nbsp;·&nbsp; OAK CREEK 53154 &nbsp;·&nbsp;
        <span className={linkClass}>{linkText}</span>
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
