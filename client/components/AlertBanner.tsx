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
  if (alerts.length === 0) return null;

  const primary = alerts[0]!;
  const headline = alerts.length === 1
    ? `${primary.event.toUpperCase()} · UNTIL ${formatExpires(primary.expires)}`
    : `${alerts.length} ACTIVE ALERTS · ${primary.event.toUpperCase()} UNTIL ${formatExpires(primary.expires)}`;

  return (
    <div className="alert-banner" data-tier={primary.tier} role="status" aria-live="polite">
      <div className="alert-banner-stripes alert-banner-stripes-left" aria-hidden="true" />
      <div className="alert-banner-content">
        <span className="alert-banner-glyph">▲</span>
        <span className="alert-banner-headline">{headline}</span>
      </div>
      <div className="alert-banner-stripes alert-banner-stripes-right" aria-hidden="true" />
    </div>
  );
}
