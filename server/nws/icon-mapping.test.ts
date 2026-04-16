import { describe, it, expect } from 'vitest';
import { mapNwsIcon } from './icon-mapping';

describe('mapNwsIcon', () => {
  it.each([
    ['https://api.weather.gov/icons/land/day/skc?size=medium', 'sun'],
    ['https://api.weather.gov/icons/land/night/skc?size=medium', 'moon'],
    ['https://api.weather.gov/icons/land/day/few?size=medium', 'sun'],
    ['https://api.weather.gov/icons/land/night/few?size=medium', 'moon'],
    ['https://api.weather.gov/icons/land/day/sct?size=medium', 'partly-day'],
    ['https://api.weather.gov/icons/land/night/sct?size=medium', 'partly-night'],
    ['https://api.weather.gov/icons/land/day/bkn?size=medium', 'partly-day'],
    ['https://api.weather.gov/icons/land/night/bkn?size=medium', 'partly-night'],
    ['https://api.weather.gov/icons/land/day/ovc?size=medium', 'cloud'],
    ['https://api.weather.gov/icons/land/night/ovc?size=medium', 'cloud'],
    ['https://api.weather.gov/icons/land/day/rain?size=medium', 'rain'],
    ['https://api.weather.gov/icons/land/day/rain_showers?size=medium', 'rain'],
    ['https://api.weather.gov/icons/land/day/rain_showers_hi?size=medium', 'rain'],
    ['https://api.weather.gov/icons/land/day/tsra?size=medium', 'thunder'],
    ['https://api.weather.gov/icons/land/day/tsra_sct?size=medium', 'thunder'],
    ['https://api.weather.gov/icons/land/day/tsra_hi?size=medium', 'thunder'],
    ['https://api.weather.gov/icons/land/day/snow?size=medium', 'snow'],
    ['https://api.weather.gov/icons/land/day/blizzard?size=medium', 'snow'],
    ['https://api.weather.gov/icons/land/day/fog?size=medium', 'fog'],
    ['https://api.weather.gov/icons/land/day/haze?size=medium', 'fog'],
  ])('maps %s to %s', (url, expected) => {
    expect(mapNwsIcon(url)).toBe(expected);
  });

  it('falls back to cloud for unknown slugs', () => {
    expect(mapNwsIcon('https://api.weather.gov/icons/land/day/weird_code?size=medium')).toBe('cloud');
  });

  it('handles composite slugs like rain,60', () => {
    expect(mapNwsIcon('https://api.weather.gov/icons/land/day/rain,60?size=medium')).toBe('rain');
  });

  it('returns cloud for missing or malformed URL', () => {
    expect(mapNwsIcon('')).toBe('cloud');
    expect(mapNwsIcon('not-a-url')).toBe('cloud');
  });
});
