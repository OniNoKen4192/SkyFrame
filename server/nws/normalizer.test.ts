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
    const result = await normalizeWeather();
    expect(result.hourly).toHaveLength(12);
    expect(result.hourly[0]!.tempF).toBe(63);
    expect(result.hourly[0]!.iconCode).toBe('partly-day');
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
    const result = await normalizeWeather();
    expect(result.meta.stationId).toBe('KMKE');
  });
});
