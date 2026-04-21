import { describe, it, expect } from 'vitest';
import { summarizeStation } from './station-preview';

const LIVE_OBS = {
  properties: {
    timestamp: '2026-04-20T14:25:00+00:00',
    temperature: { value: 16.7, unitCode: 'wmoUnit:degC' },
    dewpoint: { value: 9.4, unitCode: 'wmoUnit:degC' },
    windSpeed: { value: 19.3, unitCode: 'wmoUnit:km_h-1' },
    windDirection: { value: 315, unitCode: 'wmoUnit:degree_(angle)' },
    barometricPressure: { value: 101999, unitCode: 'wmoUnit:Pa' },
    visibility: { value: 16093, unitCode: 'wmoUnit:m' },
    relativeHumidity: { value: 64, unitCode: 'wmoUnit:percent' },
    heatIndex: { value: null },
    windChill: { value: null },
    textDescription: 'Mostly Cloudy',
    icon: 'https://api.weather.gov/icons/land/day/bkn?size=medium',
  },
};

describe('summarizeStation', () => {
  const now = new Date('2026-04-20T14:30:00+00:00');

  it('returns status: live for a recent observation', () => {
    const result = summarizeStation('KMKE', { status: 'fulfilled', value: LIVE_OBS }, now);
    expect(result).toEqual({
      stationId: 'KMKE',
      observedAt: '2026-04-20T14:25:00+00:00',
      tempF: 62,
      status: 'live',
    });
  });

  it('returns status: stale for an observation older than 90 minutes', () => {
    const staleObs = {
      properties: {
        ...LIVE_OBS.properties,
        timestamp: '2026-04-20T12:00:00+00:00',  // 2.5 hours ago
      },
    };
    const result = summarizeStation('KMKE', { status: 'fulfilled', value: staleObs }, now);
    expect(result.status).toBe('stale');
    expect(result.tempF).toBe(62);  // temp still returned even when stale
  });

  it('returns status: error when the fetch promise rejected', () => {
    const result = summarizeStation('KMKE', { status: 'rejected', reason: new Error('boom') }, now);
    expect(result).toEqual({
      stationId: 'KMKE',
      observedAt: null,
      tempF: null,
      status: 'error',
    });
  });

  it('returns tempF: null when the observation has a null temperature', () => {
    const nullTempObs = {
      properties: {
        ...LIVE_OBS.properties,
        temperature: { value: null, unitCode: 'wmoUnit:degC' },
      },
    };
    const result = summarizeStation('KMKE', { status: 'fulfilled', value: nullTempObs }, now);
    expect(result.tempF).toBeNull();
    expect(result.status).toBe('live');  // null temp doesn't degrade status
  });
});
