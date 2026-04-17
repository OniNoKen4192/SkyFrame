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
