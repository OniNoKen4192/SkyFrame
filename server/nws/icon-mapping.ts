import type { IconCode } from '../../shared/types';

// Below this threshold, NWS-supplied precip icons (rain/snow/thunder) are
// downgraded to partly-day/night. Matches HIGH_POP_THRESHOLD in precip.ts so
// the icon and the precip outlook string agree on what counts as "meaningful".
const PRECIP_PROB_THRESHOLD = 30;

function baseIconFromSlug(slug: string, dayOrNight: string): IconCode {
  switch (slug) {
    case 'skc':
    case 'few':
      return dayOrNight === 'night' ? 'moon' : 'sun';

    case 'sct':
    case 'bkn':
      return dayOrNight === 'night' ? 'partly-night' : 'partly-day';

    case 'ovc':
      return 'cloud';

    case 'rain':
    case 'rain_showers':
    case 'rain_showers_hi':
    case 'hi_shwrs':
    case 'fzra':
    case 'fzra_sct':
    case 'ra_fzra':
    case 'ra_sn':
      return 'rain';

    case 'tsra':
    case 'tsra_sct':
    case 'tsra_hi':
    case 'scttsra':
      return 'thunder';

    case 'snow':
    case 'sn':
    case 'blizzard':
    case 'cold':
      return 'snow';

    case 'fog':
    case 'haze':
    case 'smoke':
    case 'dust':
      return 'fog';

    default:
      return 'cloud';
  }
}

// Above this threshold, daily forecast icons that NWS chose as non-precip
// (sun/moon/partly-*/cloud) get upgraded to a precip icon. Mirror of the
// hourly downgrade rule, inverted: hourly says "if NWS gave us rain but
// precip is unlikely, downgrade"; daily says "if NWS gave us sun but
// precip is highly likely, upgrade." Hourly behavior unchanged.
const HIGH_PRECIP_THRESHOLD = 50;

export function mapNwsIcon(url: string, precipProb?: number | null): IconCode {
  if (!url || typeof url !== 'string') return 'cloud';

  const match = url.match(/\/(day|night)\/([^/?]+)/);
  if (!match) return 'cloud';

  const dayOrNight = match[1]!;
  const slug = match[2]!.split(',')[0]!.split('?')[0]!;

  const icon = baseIconFromSlug(slug, dayOrNight);

  if (
    precipProb != null
    && precipProb < PRECIP_PROB_THRESHOLD
    && (icon === 'rain' || icon === 'snow' || icon === 'thunder')
  ) {
    return dayOrNight === 'night' ? 'partly-night' : 'partly-day';
  }

  return icon;
}

function pickPrecipIcon(shortForecast: string | undefined): IconCode {
  // Keyword-match the NWS forecast text. Order matters: thunder beats
  // snow beats rain — convective storms are the dominant signal.
  const fc = (shortForecast ?? '').toLowerCase();
  if (fc.includes('thunder')) return 'thunder';
  if (fc.includes('snow') || fc.includes('flurries') || fc.includes('blizzard')) return 'snow';
  return 'rain';
}

export function mapNwsDailyIcon(
  url: string,
  precipProb?: number | null,
  shortForecast?: string,
): IconCode {
  const baseIcon = mapNwsIcon(url, precipProb);

  if (precipProb == null || precipProb < HIGH_PRECIP_THRESHOLD) return baseIcon;

  // Already a precip icon (or fog, which is a visibility indicator we
  // preserve rather than override) — no upgrade needed.
  if (baseIcon === 'rain' || baseIcon === 'snow' || baseIcon === 'thunder' || baseIcon === 'fog') {
    return baseIcon;
  }

  return pickPrecipIcon(shortForecast);
}
