import { describe, it, expect } from 'vitest';
import { mapNwsIcon, mapNwsDailyIcon } from './icon-mapping';

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

describe('mapNwsDailyIcon', () => {
  const SUN_DAY = 'https://api.weather.gov/icons/land/day/skc?size=medium';
  const MOON_NIGHT = 'https://api.weather.gov/icons/land/night/skc?size=medium';
  const PARTLY_DAY = 'https://api.weather.gov/icons/land/day/sct?size=medium';
  const PARTLY_NIGHT = 'https://api.weather.gov/icons/land/night/sct?size=medium';
  const CLOUD_DAY = 'https://api.weather.gov/icons/land/day/ovc?size=medium';
  const RAIN_DAY = 'https://api.weather.gov/icons/land/day/rain?size=medium';
  const SNOW_DAY = 'https://api.weather.gov/icons/land/day/snow?size=medium';
  const THUNDER_DAY = 'https://api.weather.gov/icons/land/day/tsra?size=medium';
  const FOG_DAY = 'https://api.weather.gov/icons/land/day/fog?size=medium';

  describe('passes through to mapNwsIcon when no upgrade applies', () => {
    it('returns sun for clear day with no precip prob', () => {
      expect(mapNwsDailyIcon(SUN_DAY, null, 'Sunny')).toBe('sun');
    });

    it('returns sun for clear day with low precip prob', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 20, 'Mostly sunny')).toBe('sun');
    });

    it('returns partly-day for partly-cloudy with sub-threshold precip', () => {
      expect(mapNwsDailyIcon(PARTLY_DAY, 49, 'Partly sunny')).toBe('partly-day');
    });

    it('returns rain unchanged when NWS already chose rain', () => {
      expect(mapNwsDailyIcon(RAIN_DAY, 80, 'Rain showers')).toBe('rain');
    });
  });

  describe('upgrades non-precip icons when precipProb >= 50', () => {
    it('upgrades sun to rain when precipProb 50 and shortForecast mentions showers', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 50, 'Showers likely')).toBe('rain');
    });

    it('upgrades partly-day to rain when precipProb 90 and shortForecast mentions rain', () => {
      expect(mapNwsDailyIcon(PARTLY_DAY, 90, 'Rain likely')).toBe('rain');
    });

    it('upgrades partly-night to rain at high precip', () => {
      expect(mapNwsDailyIcon(PARTLY_NIGHT, 75, 'Rain likely')).toBe('rain');
    });

    it('upgrades cloud to rain at high precip', () => {
      expect(mapNwsDailyIcon(CLOUD_DAY, 70, 'Rain likely')).toBe('rain');
    });

    it('upgrades to thunder when shortForecast mentions thunderstorms', () => {
      expect(mapNwsDailyIcon(PARTLY_DAY, 80, 'Thunderstorms likely')).toBe('thunder');
    });

    it('upgrades to thunder for "chance of thunderstorms"', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 60, 'Sunny then chance of thunderstorms')).toBe('thunder');
    });

    it('upgrades to snow when shortForecast mentions snow', () => {
      expect(mapNwsDailyIcon(PARTLY_NIGHT, 80, 'Snow likely')).toBe('snow');
    });

    it('upgrades to snow when shortForecast mentions flurries', () => {
      expect(mapNwsDailyIcon(CLOUD_DAY, 70, 'Snow flurries')).toBe('snow');
    });

    it('upgrades to snow when shortForecast mentions blizzard', () => {
      expect(mapNwsDailyIcon(CLOUD_DAY, 80, 'Blizzard conditions')).toBe('snow');
    });

    it('thunder takes priority over snow if both are mentioned', () => {
      expect(mapNwsDailyIcon(PARTLY_DAY, 80, 'Thunderstorms with snow')).toBe('thunder');
    });

    it('defaults to rain when shortForecast has no precip keyword', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 90, 'Increasing clouds')).toBe('rain');
    });

    it('defaults to rain when shortForecast is undefined', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 90, undefined)).toBe('rain');
    });
  });

  describe('does not upgrade precip icons or fog', () => {
    it('leaves rain icon unchanged at high precip', () => {
      expect(mapNwsDailyIcon(RAIN_DAY, 90, 'Heavy rain')).toBe('rain');
    });

    it('leaves snow icon unchanged at high precip', () => {
      expect(mapNwsDailyIcon(SNOW_DAY, 90, 'Heavy snow')).toBe('snow');
    });

    it('leaves thunder icon unchanged at high precip', () => {
      expect(mapNwsDailyIcon(THUNDER_DAY, 90, 'Severe thunderstorms')).toBe('thunder');
    });

    it('leaves fog icon unchanged at high precip', () => {
      expect(mapNwsDailyIcon(FOG_DAY, 80, 'Dense fog with rain')).toBe('fog');
    });
  });

  describe('handles edge cases', () => {
    it('handles missing precipProb (null) — no upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, null, 'Showers likely')).toBe('sun');
    });

    it('handles undefined precipProb — no upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, undefined, 'Showers likely')).toBe('sun');
    });

    it('boundary: precipProb exactly 50 triggers upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 50, 'Showers')).toBe('rain');
    });

    it('boundary: precipProb 49 does not trigger upgrade', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 49, 'Showers')).toBe('sun');
    });

    it('upgrades night sun (moon) the same as day sun', () => {
      expect(mapNwsDailyIcon(MOON_NIGHT, 80, 'Rain likely')).toBe('rain');
    });

    it('handles malformed URL by deferring to mapNwsIcon (returns cloud)', () => {
      expect(mapNwsDailyIcon('', 80, 'Rain')).toBe('rain');
    });

    it('keyword match is case-insensitive', () => {
      expect(mapNwsDailyIcon(SUN_DAY, 80, 'THUNDERSTORMS LIKELY')).toBe('thunder');
    });
  });
});
