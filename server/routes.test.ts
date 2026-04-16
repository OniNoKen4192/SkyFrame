import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './routes';
import * as normalizer from './nws/normalizer';

const FIXTURE_RESPONSE = {
  current: {
    observedAt: '2026-04-15T19:25:00Z',
    stationId: 'KMKE',
    stationDistanceKm: 7,
    tempF: 62, feelsLikeF: 58, conditionText: 'MOSTLY CLOUDY',
    iconCode: 'cloud' as const,
    precipOutlook: 'DRY THRU 19:00',
    humidityPct: 64, pressureInHg: 30.12, visibilityMi: 10, dewpointF: 49,
    wind: { speedMph: 12, directionDeg: 315, cardinal: 'NW' },
    trends: {
      temp:       { direction: 'up'    as const, deltaPerHour: 1.2, confidence: 'ok' as const },
      wind:       { direction: 'up'    as const, deltaPerHour: 0.7, confidence: 'ok' as const },
      humidity:   { direction: 'down'  as const, deltaPerHour: -1.3, confidence: 'ok' as const },
      pressure:   { direction: 'up'    as const, deltaPerHour: 0.02, confidence: 'ok' as const },
      visibility: { direction: 'steady'as const, deltaPerHour: 0, confidence: 'ok' as const },
      dewpoint:   { direction: 'down'  as const, deltaPerHour: -0.3, confidence: 'ok' as const },
    },
    sunrise: '06:08', sunset: '19:35',
  },
  hourly: [],
  daily: [],
  meta: {
    fetchedAt: '2026-04-15T19:25:00Z',
    nextRefreshAt: '2026-04-15T19:26:30Z',
    cacheHit: false,
    stationId: 'KMKE',
  },
};

describe('GET /api/weather', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.spyOn(normalizer, 'normalizeWeather').mockResolvedValue(FIXTURE_RESPONSE);
    app = Fastify();
    await registerRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('responds with the normalized WeatherResponse', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/weather' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current.tempF).toBe(62);
    expect(body.current.iconCode).toBe('cloud');
  });

  it('serves from cache on second request within TTL', async () => {
    await app.inject({ method: 'GET', url: '/api/weather' });
    const res2 = await app.inject({ method: 'GET', url: '/api/weather' });
    expect(normalizer.normalizeWeather).toHaveBeenCalledTimes(1);
    expect(res2.json().meta.cacheHit).toBe(true);
  });

  it('returns 503 with error flag when normalizer throws', async () => {
    vi.spyOn(normalizer, 'normalizeWeather').mockRejectedValue(new Error('boom'));
    const freshApp = Fastify();
    await registerRoutes(freshApp);
    const res = await freshApp.inject({ method: 'GET', url: '/api/weather' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: expect.any(String) });
    await freshApp.close();
  });
});
