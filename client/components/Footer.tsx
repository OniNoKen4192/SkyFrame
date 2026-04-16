import type { WeatherMeta } from '../../shared/types';

interface FooterProps {
  meta: WeatherMeta | null;
  error: string | null;
}

function formatHM(iso: string | undefined): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}:${map.second}`;
}

export function Footer({ meta, error }: FooterProps) {
  const stationId = meta?.stationId ?? 'KMKE';
  const lastPull = formatHM(meta?.fetchedAt);
  const nextPull = formatHM(meta?.nextRefreshAt);

  return (
    <div className="hud-footer">
      <span className={error ? 'dot dot-error' : 'dot'}></span>
      {error ? 'LINK FAIL' : `LINK.${stationId}`}
      &nbsp;·&nbsp; LAST PULL {lastPull} &nbsp;·&nbsp; NEXT {nextPull}
    </div>
  );
}
