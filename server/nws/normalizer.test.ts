// server/nws/normalizer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeWeather } from './normalizer';
import * as client from './client';

// Minimal but realistic fixture payloads. Real NWS responses have many more
// fields; these include just what the normalizer reads.
const FIXTURE_POINT = {
  properties: {
    forecast: 'https://api.weather.gov/gridpoints/MKX/88,58/forecast',
    forecastHourly: 'https://api.weather.gov/gridpoints/MKX/88,58/forecast/hourly',
    astronomicalData: {
      sunrise: '2026-04-15T06:08:00-05:00',
      sunset: '2026-04-15T19:35:00-05:00',
    },
  },
};

const FIXTURE_FORECAST = {
  properties: {
    periods: [
      { name: 'This Afternoon', startTime: '2026-04-15T14:00:00-05:00', endTime: '2026-04-15T18:00:00-05:00', isDaytime: true,  temperature: 68, shortForecast: 'Mostly Cloudy', icon: 'https://api.weather.gov/icons/land/day/bkn?size=medium', probabilityOfPrecipitation: { value: 20 } },
      { name: 'Tonight',        startTime: '2026-04-15T18:00:00-05:00', endTime: '2026-04-16T06:00:00-05:00', isDaytime: false, temperature: 52, shortForecast: 'Cloudy',        icon: 'https://api.weather.gov/icons/land/night/bkn?size=medium', probabilityOfPrecipitation: { value: 20 } },
      { name: 'Thursday',       startTime: '2026-04-16T06:00:00-05:00', endTime: '2026-04-16T18:00:00-05:00', isDaytime: true,  temperature: 62, shortForecast: 'Rain Likely',   icon: 'https://api.weather.gov/icons/land/day/rain,70?size=medium', probabilityOfPrecipitation: { value: 70 } },
      { name: 'Thursday Night', startTime: '2026-04-16T18:00:00-05:00', endTime: '2026-04-17T06:00:00-05:00', isDaytime: false, temperature: 48, shortForecast: 'Rain',          icon: 'https://api.weather.gov/icons/land/night/rain?size=medium', probabilityOfPrecipitation: { value: 70 } },
    ],
  },
};

const FIXTURE_HOURLY = {
  properties: {
    periods: Array.from({ length: 12 }, (_, i) => ({
      startTime: new Date(Date.parse('2026-04-15T15:00:00-05:00') + i * 3600 * 1000).toISOString(),
      temperature: 63 - i,
      shortForecast: i < 4 ? 'Mostly Cloudy' : i < 8 ? 'Rain' : 'Mostly Cloudy',
      icon: `https://api.weather.gov/icons/land/${i < 9 ? 'day' : 'night'}/${i < 4 ? 'bkn' : i < 8 ? 'rain' : 'sct'}?size=medium`,
      probabilityOfPrecipitation: { value: [10, 10, 15, 20, 45, 60, 70, 50, 20, 10, 5, 5][i]! },
      windSpeed: '12 mph',
      windDirection: 'NW',
    })),
  },
};

const FIXTURE_OBS_LATEST = {
  properties: {
    timestamp: '2026-04-15T19:25:00+00:00',
    temperature: { value: 16.7, unitCode: 'wmoUnit:degC' },           // 62°F
    dewpoint: { value: 9.4, unitCode: 'wmoUnit:degC' },               // 49°F
    windSpeed: { value: 19.3, unitCode: 'wmoUnit:km_h-1' },           // 12 mph
    windDirection: { value: 315, unitCode: 'wmoUnit:degree_(angle)' }, // NW
    barometricPressure: { value: 101999, unitCode: 'wmoUnit:Pa' },    // 30.12 inHg
    visibility: { value: 16093, unitCode: 'wmoUnit:m' },              // 10 mi
    relativeHumidity: { value: 64, unitCode: 'wmoUnit:percent' },
    heatIndex: { value: null },
    windChill: { value: null },
    textDescription: 'Mostly Cloudy',
    icon: 'https://api.weather.gov/icons/land/day/bkn?size=medium',
  },
};

const FIXTURE_OBS_HISTORY = {
  features: [
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T19:25:00+00:00', temperature: { value: 16.7, unitCode: 'wmoUnit:degC' } } },
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T18:25:00+00:00', temperature: { value: 16.1, unitCode: 'wmoUnit:degC' } } },
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T17:25:00+00:00', temperature: { value: 15.5, unitCode: 'wmoUnit:degC' } } },
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T16:25:00+00:00', temperature: { value: 15.0, unitCode: 'wmoUnit:degC' } } },
  ],
};

describe('normalizeWeather', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetchNws to return the right fixture based on path
    vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
      if (path.includes('/points/')) return FIXTURE_POINT as never;
      if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
      if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
      if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
      if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
      throw new Error('Unexpected path: ' + path);
    });
  });

  it('returns a complete WeatherResponse with current, hourly, and daily', async () => {
    const result = await normalizeWeather();
    expect(result).toHaveProperty('current');
    expect(result).toHaveProperty('hourly');
    expect(result).toHaveProperty('daily');
    expect(result).toHaveProperty('meta');
  });

  it('converts temperature from Celsius to Fahrenheit', async () => {
    const result = await normalizeWeather();
    // 16.7°C ≈ 62°F
    expect(result.current.tempF).toBe(62);
  });

  it('converts wind speed from km/h to mph', async () => {
    const result = await normalizeWeather();
    // 19.3 km/h ≈ 12 mph
    expect(result.current.wind.speedMph).toBe(12);
  });

  it('converts pressure from Pa to inHg', async () => {
    const result = await normalizeWeather();
    // 101999 Pa ≈ 30.12 inHg
    expect(result.current.pressureInHg).toBeCloseTo(30.12, 1);
  });

  it('converts visibility from meters to miles', async () => {
    const result = await normalizeWeather();
    expect(result.current.visibilityMi).toBe(10);
  });

  it('populates 12 hourly periods', async () => {
    // Pin now to before the fixture's first period so no past-hour filtering occurs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T14:00:00-05:00'));
    const result = await normalizeWeather();
    expect(result.hourly).toHaveLength(12);
    expect(result.hourly[0]!.tempF).toBe(63);
    expect(result.hourly[0]!.iconCode).toBe('partly-day');
    vi.useRealTimers();
  });

  it('drops hourly periods whose hour has already ended, keeping the current hour', async () => {
    // Fixture starts at 15:00 CDT. Pin now to 17:30 CDT.
    // Period 0 (15:00) ends 16:00 — past, drop.
    // Period 1 (16:00) ends 17:00 — past, drop.
    // Period 2 (17:00) ends 18:00 — current hour (17:30 < 18:00), keep.
    // Periods 3-11 — future, keep.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T17:30:00-05:00'));
    const result = await normalizeWeather();
    expect(result.hourly).toHaveLength(10);
    expect(Date.parse(result.hourly[0]!.startTime)).toBe(
      Date.parse('2026-04-15T17:00:00-05:00'),
    );
    // Fixture period 2 has tempF = 63 - 2 = 61
    expect(result.hourly[0]!.tempF).toBe(61);
    vi.useRealTimers();
  });

  it('advances the first hourly period at the top of each hour boundary', async () => {
    // At 17:59:59 — period 2 (17:00) is still the current hour.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T17:59:59-05:00'));
    let result = await normalizeWeather();
    expect(Date.parse(result.hourly[0]!.startTime)).toBe(
      Date.parse('2026-04-15T17:00:00-05:00'),
    );

    // At 18:00:00 sharp — period 2 just ended; period 3 (18:00) is the new current hour.
    vi.setSystemTime(new Date('2026-04-15T18:00:00-05:00'));
    result = await normalizeWeather();
    expect(Date.parse(result.hourly[0]!.startTime)).toBe(
      Date.parse('2026-04-15T18:00:00-05:00'),
    );
    vi.useRealTimers();
  });

  it('collapses 4 day+night periods into 2 DailyPeriod entries', async () => {
    const result = await normalizeWeather();
    expect(result.daily.length).toBeGreaterThanOrEqual(2);
    expect(result.daily[0]!.highF).toBe(68);
    expect(result.daily[0]!.lowF).toBe(52);
    expect(result.daily[1]!.highF).toBe(62);
    expect(result.daily[1]!.lowF).toBe(48);
  });

  it('maps day bkn icon to partly-day', async () => {
    const result = await normalizeWeather();
    expect(result.current.iconCode).toBe('partly-day');
  });

  it('computes an up trend for temperature from the observation history', async () => {
    const result = await normalizeWeather();
    // Temperature rose from 15.0 → 16.7 over ~3 hours → slight up
    expect(result.current.trends.temp.direction).toBe('up');
    expect(result.current.trends.temp.confidence).toBe('ok');
  });

  it('formats sunrise and sunset as HH:MM in local timezone', async () => {
    const result = await normalizeWeather();
    expect(result.current.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(result.current.sunset).toMatch(/^\d{2}:\d{2}$/);
    expect(result.current.sunrise).toBe('06:08');
    expect(result.current.sunset).toBe('19:35');
  });

  it('populates meta.stationId', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T19:30:00+00:00'));
    const result = await normalizeWeather();
    expect(result.meta.stationId).toBe('KMKE');
    vi.useRealTimers();
  });

  it('falls back to KRAC when KMKE observation is older than 90 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T19:30:00+00:00'));

    vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
      if (path.includes('/points/')) return FIXTURE_POINT as never;
      if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
      if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
      if (path.includes('KMKE/observations/latest')) {
        return {
          properties: {
            ...FIXTURE_OBS_LATEST.properties,
            timestamp: '2026-04-15T12:00:00+00:00', // stale: 7.5 hours ago
          },
        } as never;
      }
      if (path.includes('KRAC/observations/latest')) return FIXTURE_OBS_LATEST as never;
      if (path.includes('KRAC/observations')) return FIXTURE_OBS_HISTORY as never;
      if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
      if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
      throw new Error('Unexpected path: ' + path);
    });

    const result = await normalizeWeather();
    expect(result.meta.stationId).toBe('KRAC');
    expect(result.meta.error).toBe('station_fallback');
    expect(result.current.stationId).toBe('KRAC');

    vi.useRealTimers();
  });

  it('falls back to KRAC when KMKE observation has null temperature', async () => {
    vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
      if (path.includes('/points/')) return FIXTURE_POINT as never;
      if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
      if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
      if (path.includes('KMKE/observations/latest')) {
        return {
          properties: {
            ...FIXTURE_OBS_LATEST.properties,
            temperature: { value: null, unitCode: 'wmoUnit:degC' },
          },
        } as never;
      }
      if (path.includes('KRAC/observations/latest')) return FIXTURE_OBS_LATEST as never;
      if (path.includes('KRAC/observations')) return FIXTURE_OBS_HISTORY as never;
      if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
      if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
      throw new Error('Unexpected path: ' + path);
    });

    const result = await normalizeWeather();
    expect(result.meta.stationId).toBe('KRAC');
    expect(result.meta.error).toBe('station_fallback');
  });

  it('uses KMKE without error flag when primary is fresh and complete', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T19:30:00+00:00'));

    // FIXTURE_OBS_LATEST.timestamp is '2026-04-15T19:25:00+00:00' — only 5 min old
    const result = await normalizeWeather();
    expect(result.meta.stationId).toBe('KMKE');
    expect(result.meta.error).toBeUndefined();

    vi.useRealTimers();
  });

  describe('daily collapse — overnight orphan handling', () => {
    // NWS at late-night/early-morning serves an "Overnight" period that shares
    // its local-timezone date label with the next "Day" period. Without
    // dedup, that produced two THU rows (one night-only orphan + one
    // day+night pair). The collapse logic must skip the orphan in that case.
    const FIXTURE_FORECAST_OVERNIGHT = {
      properties: {
        periods: [
          { name: 'Overnight',      startTime: '2026-04-16T00:00:00-05:00', endTime: '2026-04-16T06:00:00-05:00', isDaytime: false, temperature: 50, shortForecast: 'Mostly Clear', icon: 'https://api.weather.gov/icons/land/night/few?size=medium', probabilityOfPrecipitation: { value: 5 } },
          { name: 'Thursday',       startTime: '2026-04-16T06:00:00-05:00', endTime: '2026-04-16T18:00:00-05:00', isDaytime: true,  temperature: 65, shortForecast: 'Sunny',        icon: 'https://api.weather.gov/icons/land/day/few?size=medium',   probabilityOfPrecipitation: { value: 0 } },
          { name: 'Thursday Night', startTime: '2026-04-16T18:00:00-05:00', endTime: '2026-04-17T06:00:00-05:00', isDaytime: false, temperature: 48, shortForecast: 'Cloudy',       icon: 'https://api.weather.gov/icons/land/night/bkn?size=medium', probabilityOfPrecipitation: { value: 10 } },
          { name: 'Friday',         startTime: '2026-04-17T06:00:00-05:00', endTime: '2026-04-17T18:00:00-05:00', isDaytime: true,  temperature: 70, shortForecast: 'Sunny',        icon: 'https://api.weather.gov/icons/land/day/few?size=medium',   probabilityOfPrecipitation: { value: 5 } },
          { name: 'Friday Night',   startTime: '2026-04-17T18:00:00-05:00', endTime: '2026-04-18T06:00:00-05:00', isDaytime: false, temperature: 52, shortForecast: 'Clear',        icon: 'https://api.weather.gov/icons/land/night/skc?size=medium', probabilityOfPrecipitation: { value: 0 } },
        ],
      },
    };

    // Late-evening case: NWS serves "Tonight" first, dated today, but the
    // next period is the NEXT day. Different dates → orphan must be PRESERVED
    // so the user sees the rest-of-tonight as today's row.
    const FIXTURE_FORECAST_LATE_EVENING = {
      properties: {
        periods: [
          { name: 'Tonight',      startTime: '2026-04-16T22:00:00-05:00', endTime: '2026-04-17T06:00:00-05:00', isDaytime: false, temperature: 47, shortForecast: 'Clear', icon: 'https://api.weather.gov/icons/land/night/skc?size=medium', probabilityOfPrecipitation: { value: 0 } },
          { name: 'Friday',       startTime: '2026-04-17T06:00:00-05:00', endTime: '2026-04-17T18:00:00-05:00', isDaytime: true,  temperature: 70, shortForecast: 'Sunny', icon: 'https://api.weather.gov/icons/land/day/few?size=medium',   probabilityOfPrecipitation: { value: 5 } },
          { name: 'Friday Night', startTime: '2026-04-17T18:00:00-05:00', endTime: '2026-04-18T06:00:00-05:00', isDaytime: false, temperature: 52, shortForecast: 'Clear', icon: 'https://api.weather.gov/icons/land/night/skc?size=medium', probabilityOfPrecipitation: { value: 0 } },
        ],
      },
    };

    function mockForecast(forecast: typeof FIXTURE_FORECAST_OVERNIGHT) {
      vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
        if (path.includes('/points/')) return FIXTURE_POINT as never;
        if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
        if (path.includes('/forecast')) return forecast as never;
        if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
        if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
        throw new Error('Unexpected path: ' + path);
      });
    }

    it('skips the overnight orphan when its date matches the next day period', async () => {
      mockForecast(FIXTURE_FORECAST_OVERNIGHT);
      const result = await normalizeWeather();

      // Should produce 2 daily entries (Thursday day+night collapsed, Friday day+night collapsed).
      // NOT 3 (which would mean the Overnight orphan was emitted as its own THU row).
      expect(result.daily).toHaveLength(2);

      // First entry should be the canonical Thursday from the day+night pair.
      expect(result.daily[0]!.dateLabel).toBe('APR 16');
      expect(result.daily[0]!.highF).toBe(65);
      expect(result.daily[0]!.lowF).toBe(48);

      // Second entry should be Friday.
      expect(result.daily[1]!.dateLabel).toBe('APR 17');
      expect(result.daily[1]!.highF).toBe(70);
      expect(result.daily[1]!.lowF).toBe(52);
    });

    it('preserves the late-evening orphan when its date does NOT match the next day period', async () => {
      mockForecast(FIXTURE_FORECAST_LATE_EVENING);
      const result = await normalizeWeather();

      // Should produce 2 entries: tonight (orphan), then Friday day+night.
      expect(result.daily).toHaveLength(2);

      // First entry is the orphan night — high == low == night temp.
      expect(result.daily[0]!.dateLabel).toBe('APR 16');
      expect(result.daily[0]!.highF).toBe(47);
      expect(result.daily[0]!.lowF).toBe(47);

      // Second entry is Friday.
      expect(result.daily[1]!.dateLabel).toBe('APR 17');
      expect(result.daily[1]!.highF).toBe(70);
    });
  });
});
