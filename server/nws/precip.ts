const PRECIPITATING_RE = /rain|snow|shower|storm|drizzle|sleet|hail/i;
const HIGH_POP_THRESHOLD = 30;

export interface PrecipInput {
  hours: Array<{ startTime: string; probabilityOfPrecipitation: number | null }>;
  currentTextDescription: string;
  now: Date;
  timeZone: string;
}

function formatHourLabel(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:00`;
}

export function buildPrecipOutlook(input: PrecipInput): string {
  const { hours, currentTextDescription, now, timeZone } = input;
  const currentlyPrecipitating = PRECIPITATING_RE.test(currentTextDescription);

  if (currentlyPrecipitating) {
    const firstDry = hours.find(
      (h) => (h.probabilityOfPrecipitation ?? 100) <= HIGH_POP_THRESHOLD,
    );
    if (!firstDry) return 'RAIN CONTINUES';
    const label = formatHourLabel(new Date(firstDry.startTime), timeZone);
    return `RAIN NOW \u00b7 EASING ${label}`;
  }

  const firstWet = hours.find(
    (h) => (h.probabilityOfPrecipitation ?? 0) > HIGH_POP_THRESHOLD,
  );

  if (!firstWet) return 'DRY 24H+';

  const msUntil = Date.parse(firstWet.startTime) - now.getTime();
  const minutesUntil = Math.round(msUntil / 60000);

  if (minutesUntil > 0 && minutesUntil < 60) {
    return `RAIN IN ${minutesUntil}m`;
  }

  const label = formatHourLabel(new Date(firstWet.startTime), timeZone);
  return `DRY THRU ${label}`;
}
