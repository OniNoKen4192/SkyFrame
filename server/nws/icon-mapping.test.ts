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

  describe('precip probability threshold', () => {
    const RAIN_DAY = 'https://api.weather.gov/icons/land/day/rain_showers?size=medium';
    const RAIN_NIGHT = 'https://api.weather.gov/icons/land/night/rain_showers?size=medium';
    const SNOW_DAY = 'https://api.weather.gov/icons/land/day/snow?size=medium';
    const THUNDER_DAY = 'https://api.weather.gov/icons/land/day/tsra?size=medium';
    const CLOUD_DAY = 'https://api.weather.gov/icons/land/day/ovc?size=medium';
    const SUN_DAY = 'https://api.weather.gov/icons/land/day/skc?size=medium';

    it('downgrades rain to partly-day when precipProb < 30', () => {
      expect(mapNwsIcon(RAIN_DAY, 24)).toBe('partly-day');
      expect(mapNwsIcon(RAIN_DAY, 0)).toBe('partly-day');
      expect(mapNwsIcon(RAIN_DAY, 29)).toBe('partly-day');
    });

    it('downgrades rain to partly-night for night URLs when precipProb < 30', () => {
      expect(mapNwsIcon(RAIN_NIGHT, 24)).toBe('partly-night');
    });

    it('keeps rain icon when precipProb >= 30', () => {
      expect(mapNwsIcon(RAIN_DAY, 30)).toBe('rain');
      expect(mapNwsIcon(RAIN_DAY, 70)).toBe('rain');
      expect(mapNwsIcon(RAIN_DAY, 100)).toBe('rain');
    });

    it('downgrades snow and thunder the same way', () => {
      expect(mapNwsIcon(SNOW_DAY, 20)).toBe('partly-day');
      expect(mapNwsIcon(THUNDER_DAY, 20)).toBe('partly-day');
      expect(mapNwsIcon(SNOW_DAY, 50)).toBe('snow');
      expect(mapNwsIcon(THUNDER_DAY, 50)).toBe('thunder');
    });

    it('does not affect non-precip icons (cloud, sun) regardless of precipProb', () => {
      expect(mapNwsIcon(CLOUD_DAY, 0)).toBe('cloud');
      expect(mapNwsIcon(CLOUD_DAY, 80)).toBe('cloud');
      expect(mapNwsIcon(SUN_DAY, 25)).toBe('sun');
    });

    it('does not downgrade when precipProb is undefined or null (e.g. observation context)', () => {
      expect(mapNwsIcon(RAIN_DAY)).toBe('rain');
      expect(mapNwsIcon(RAIN_DAY, undefined)).toBe('rain');
      expect(mapNwsIcon(RAIN_DAY, null)).toBe('rain');
    });
  });
});
