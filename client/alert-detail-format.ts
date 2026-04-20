import type { Alert } from '../shared/types';

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

const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

export function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso)).toUpperCase();
}

// Synthetic "Update Available" alerts (from the server's update-check module)
// carry a far-future expires that's meaningless to the user — the alert
// persists until dismissed or the app version catches up. Detect them here
// so the banner and modal can skip the "UNTIL {time}" / "EXPIRES {time}"
// display that implies a real deadline.
export function isUpdateAlert(alert: Alert): boolean {
  return alert.id.startsWith('update-');
}

export function formatAlertMeta(alert: Alert): string {
  const issued = formatTime(alert.issuedAt);
  const area = alert.areaDesc.toUpperCase();
  if (isUpdateAlert(alert)) {
    return `ISSUED ${issued} \u00B7 ${area}`;
  }
  const expires = formatTime(alert.expires);
  return `ISSUED ${issued} \u00B7 EXPIRES ${expires} \u00B7 ${area}`;
}
