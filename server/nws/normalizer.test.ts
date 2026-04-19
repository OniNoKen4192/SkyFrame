// server/nws/normalizer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeWeather } from './normalizer';
import * as client from './client';
import { CONFIG } from '../config';
import type { AlertTier } from '../../shared/types';

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
      if (path.includes('/alerts/active')) return { features: [] } as never;
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

  describe('alerts', () => {
    const FIXTURE_ALERTS_TWO_TIERS = {
      features: [
        {
          properties: {
            id: 'urn:oid:nws.alerts.1',
            event: 'Tornado Watch',
            severity: 'Severe',
            headline: 'Tornado Watch issued April 16 at 2:00PM CDT until April 16 at 9:00PM CDT by NWS',
            description: 'A Tornado Watch has been issued...',
            effective: '2026-04-16T14:00:00-05:00',
            expires:   '2026-04-16T21:00:00-05:00',
            areaDesc:  'Milwaukee, WI; Waukesha, WI',
          },
        },
        {
          properties: {
            id: 'urn:oid:nws.alerts.2',
            event: 'Tornado Warning',
            severity: 'Extreme',
            headline: 'Tornado Warning issued April 16 at 4:30PM CDT until April 16 at 5:15PM CDT by NWS',
            description: 'At 4:30PM, a confirmed tornado was located near {CITY}...',
            effective: '2026-04-16T16:30:00-05:00',
            expires:   '2026-04-16T17:15:00-05:00',
            areaDesc:  'Milwaukee, WI',
          },
        },
      ],
    };

    // Pin time to 5 min after FIXTURE_OBS_LATEST so KMKE is fresh (not stale).
    // Without this, real wall-clock time causes the 90-min staleness check to
    // fire, making fellBack=true and metaError='station_fallback' instead of
    // the alerts-specific value we want to assert.
    const ALERTS_NOW = '2026-04-15T19:30:00+00:00';

    function mockWithAlerts(alertsResponse: unknown) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(ALERTS_NOW));
      vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
        if (path.includes('/points/')) return FIXTURE_POINT as never;
        if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
        if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
        if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
        if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
        if (path.includes('/alerts/active')) return alertsResponse as never;
        throw new Error('Unexpected path: ' + path);
      });
    }

    it('exposes alerts sorted by tierRank (highest severity first)', async () => {
      mockWithAlerts(FIXTURE_ALERTS_TWO_TIERS);
      const result = await normalizeWeather();
      vi.useRealTimers();

      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0]!.event).toBe('Tornado Warning');
      expect(result.alerts[0]!.tier).toBe('tornado-warning');
      expect(result.alerts[1]!.event).toBe('Tornado Watch');
      expect(result.alerts[1]!.tier).toBe('watch');
      expect(result.meta.error).toBeUndefined();
    });

    it('classifies advisory-high events instead of dropping them (Wind Advisory, Frost Advisory)', async () => {
      mockWithAlerts({
        features: [
          { properties: { id: 'a', event: 'Wind Advisory',       severity: 'Minor',    headline: 'Wind',      description: '', effective: '2026-04-16T10:00:00Z', expires: '2026-04-16T20:00:00Z', areaDesc: 'WI' } },
          { properties: { id: 'b', event: 'Tornado Warning',     severity: 'Extreme',  headline: 'Tornado',   description: '', effective: '2026-04-16T16:30:00Z', expires: '2026-04-16T17:15:00Z', areaDesc: 'WI' } },
          { properties: { id: 'c', event: 'Frost Advisory',      severity: 'Minor',    headline: 'Frost',     description: '', effective: '2026-04-16T20:00:00Z', expires: '2026-04-17T08:00:00Z', areaDesc: 'WI' } },
        ],
      });
      const result = await normalizeWeather();
      vi.useRealTimers();

      // Wind Advisory and Frost Advisory now map to advisory-high; all 3 alerts pass through.
      // Sorted by tierRank: tornado-warning (3) first, then advisory-high (12) x2.
      expect(result.alerts).toHaveLength(3);
      expect(result.alerts[0]!.event).toBe('Tornado Warning');
      expect(result.alerts[0]!.tier).toBe('tornado-warning');
      expect(result.alerts[1]!.tier).toBe('advisory-high');
      expect(result.alerts[2]!.tier).toBe('advisory-high');
    });

    it('classifies Tornado Warning with CONSIDERABLE damage threat as tornado-pds', async () => {
      mockWithAlerts({
        features: [
          {
            properties: {
              id: 'urn:oid:nws.alerts.pds',
              event: 'Tornado Warning',
              severity: 'Extreme',
              headline: 'Tornado Warning - PDS',
              description: 'Particularly dangerous situation.',
              effective: '2026-04-17T17:00:00-05:00',
              expires: '2026-04-17T18:00:00-05:00',
              areaDesc: 'Somewhere County',
              parameters: { tornadoDamageThreat: ['CONSIDERABLE'] },
            },
          },
        ],
      });

      const result = await normalizeWeather();
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.tier).toBe('tornado-pds');
      vi.useRealTimers();
    });

    it('classifies Tornado Warning with CATASTROPHIC damage threat as tornado-emergency', async () => {
      mockWithAlerts({
        features: [
          {
            properties: {
              id: 'urn:oid:nws.alerts.emerg',
              event: 'Tornado Warning',
              severity: 'Extreme',
              headline: 'Tornado Emergency',
              description: 'Tornado emergency in effect.',
              effective: '2026-04-17T17:00:00-05:00',
              expires: '2026-04-17T18:00:00-05:00',
              areaDesc: 'Somewhere County',
              parameters: { tornadoDamageThreat: ['CATASTROPHIC'] },
            },
          },
        ],
      });

      const result = await normalizeWeather();
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.tier).toBe('tornado-emergency');
      vi.useRealTimers();
    });

    it('classifies Severe Thunderstorm Warning with DESTRUCTIVE threat as tstorm-destructive', async () => {
      mockWithAlerts({
        features: [
          {
            properties: {
              id: 'urn:oid:nws.alerts.destructive',
              event: 'Severe Thunderstorm Warning',
              severity: 'Severe',
              headline: 'Severe Thunderstorm Warning - Destructive',
              description: 'Destructive severe thunderstorm.',
              effective: '2026-04-17T17:00:00-05:00',
              expires: '2026-04-17T18:00:00-05:00',
              areaDesc: 'Somewhere County',
              parameters: { thunderstormDamageThreat: ['DESTRUCTIVE'] },
            },
          },
        ],
      });

      const result = await normalizeWeather();
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.tier).toBe('tstorm-destructive');
      vi.useRealTimers();
    });

    it('leaves Severe Thunderstorm Warning with CONSIDERABLE threat as severe-warning', async () => {
      mockWithAlerts({
        features: [
          {
            properties: {
              id: 'urn:oid:nws.alerts.considerable',
              event: 'Severe Thunderstorm Warning',
              severity: 'Severe',
              headline: 'Severe Thunderstorm Warning - Considerable',
              description: 'Considerable damage threat.',
              effective: '2026-04-17T17:00:00-05:00',
              expires: '2026-04-17T18:00:00-05:00',
              areaDesc: 'Somewhere County',
              parameters: { thunderstormDamageThreat: ['CONSIDERABLE'] },
            },
          },
        ],
      });

      const result = await normalizeWeather();
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.tier).toBe('severe-warning');
      vi.useRealTimers();
    });

    it('returns empty alerts array when NWS alerts response is empty', async () => {
      mockWithAlerts({ features: [] });
      const result = await normalizeWeather();
      vi.useRealTimers();
      expect(result.alerts).toEqual([]);
      expect(result.meta.error).toBeUndefined();
    });

    it('returns empty alerts array when NWS alerts fetch fails (non-fatal)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(ALERTS_NOW));
      vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
        if (path.includes('/points/')) return FIXTURE_POINT as never;
        if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
        if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
        if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
        if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
        if (path.includes('/alerts/active')) throw new Error('Network error');
        throw new Error('Unexpected path: ' + path);
      });

      const result = await normalizeWeather();
      vi.useRealTimers();
      expect(result.alerts).toEqual([]);
      // Other parts of the response are still populated
      expect(result.current).toBeDefined();
      expect(result.hourly).toBeDefined();
      expect(result.meta.error).toBe('partial');
    });

    it('populates alert fields from NWS properties', async () => {
      mockWithAlerts({
        features: [
          {
            properties: {
              id: 'urn:oid:nws.alerts.specific',
              event: 'Tornado Warning',
              severity: 'Extreme',
              headline: 'Tornado Warning until 5:15PM',
              description: 'A tornado was sighted near {CITY}',
              effective: '2026-04-16T16:30:00-05:00',
              expires:   '2026-04-16T17:15:00-05:00',
              areaDesc:  'Milwaukee, WI',
            },
          },
        ],
      });
      const result = await normalizeWeather();
      vi.useRealTimers();
      const a = result.alerts[0]!;
      expect(a.id).toBe('urn:oid:nws.alerts.specific');
      expect(a.event).toBe('Tornado Warning');
      expect(a.tier).toBe('tornado-warning');
      expect(a.severity).toBe('Extreme');
      expect(a.headline).toBe('Tornado Warning until 5:15PM');
      expect(a.description).toBe('A tornado was sighted near {CITY}');
      expect(a.effective).toBe('2026-04-16T16:30:00-05:00');
      expect(a.expires).toBe('2026-04-16T17:15:00-05:00');
      expect(a.areaDesc).toBe('Milwaukee, WI');
    });

    it('populates issuedAt from NWS sent field', async () => {
      mockWithAlerts({
        features: [
          {
            properties: {
              id: 'urn:oid:nws.alerts.issued',
              event: 'Tornado Warning',
              severity: 'Extreme',
              headline: 'Tornado',
              description: 'A tornado has been reported.',
              sent:      '2026-04-16T16:28:00Z',
              effective: '2026-04-16T16:30:00Z',
              expires:   '2026-04-16T17:15:00Z',
              areaDesc:  'Linn County, IA',
            },
          },
        ],
      });

      const result = await normalizeWeather();
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.issuedAt).toBe('2026-04-16T16:28:00Z');
      vi.useRealTimers();
    });

    it('falls back to effective when sent is missing', async () => {
      mockWithAlerts({
        features: [
          {
            properties: {
              id: 'urn:oid:nws.alerts.nosent',
              event: 'Wind Advisory',
              severity: 'Minor',
              headline: 'Wind',
              description: 'Breezy.',
              effective: '2026-04-16T10:00:00Z',
              expires:   '2026-04-16T20:00:00Z',
              areaDesc:  'Somewhere',
            },
          },
        ],
      });

      const result = await normalizeWeather();
      expect(result.alerts[0]!.issuedAt).toBe('2026-04-16T10:00:00Z');
      vi.useRealTimers();
    });
  });

  describe('debug alert injection', () => {
    // CONFIG.debug.injectTiers is `as const` readonly at compile time but a
    // plain mutable array at runtime. Mutate via type-cast and restore after.
    const originalTiers: AlertTier[] = [...CONFIG.debug.injectTiers];

    afterEach(() => {
      const arr = CONFIG.debug.injectTiers as AlertTier[];
      arr.length = 0;
      arr.push(...originalTiers);
    });

    it('returns synthetic alerts and skips the NWS alerts fetch when injectTiers is set', async () => {
      const arr = CONFIG.debug.injectTiers as AlertTier[];
      arr.length = 0;
      arr.push('tornado-warning', 'flood');

      const fetchSpy = vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
        if (path.includes('/points/')) return FIXTURE_POINT as never;
        if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
        if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
        if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
        if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
        if (path.includes('/alerts/active')) throw new Error('alerts endpoint should not be called in debug mode');
        throw new Error('Unexpected path: ' + path);
      });

      const result = await normalizeWeather();

      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0]!.event).toBe('Tornado Warning');
      expect(result.alerts[0]!.tier).toBe('tornado-warning');
      expect(result.alerts[1]!.event).toBe('Flood Warning');
      expect(result.alerts[1]!.tier).toBe('flood');
      // Confirm no /alerts/active call was attempted.
      const alertCalls = fetchSpy.mock.calls.filter(([p]) => typeof p === 'string' && p.includes('/alerts/active'));
      expect(alertCalls).toHaveLength(0);
    });
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
        if (path.includes('/alerts/active')) return { features: [] } as never;
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
