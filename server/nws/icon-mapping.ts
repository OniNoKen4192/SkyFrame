import type { IconCode } from '../../shared/types';

export function mapNwsIcon(url: string): IconCode {
  if (!url || typeof url !== 'string') return 'cloud';

  const match = url.match(/\/(day|night)\/([^/?]+)/);
  if (!match) return 'cloud';

  const dayOrNight = match[1]!;
  const slug = match[2]!.split(',')[0]!.split('?')[0]!;

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
