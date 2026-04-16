import type { FastifyInstance } from 'fastify';
import type { WeatherResponse } from '../shared/types';
import { normalizeWeather } from './nws/normalizer';
import { TTLCache } from './nws/cache';
import { CONFIG } from './config';

const WEATHER_CACHE_KEY = 'weather';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const cache = new TTLCache();
  type ErrorReply = { error: string; message: string };
  app.get<{ Reply: WeatherResponse | ErrorReply }>('/api/weather', async (_req, reply) => {
    const cached = cache.get<WeatherResponse>(WEATHER_CACHE_KEY);
    if (cached) {
      return {
        ...cached,
        meta: { ...cached.meta, cacheHit: true },
      };
    }

    try {
      const fresh = await normalizeWeather();
      cache.set(WEATHER_CACHE_KEY, fresh, CONFIG.cache.observationMs);
      return fresh;
    } catch (err) {
      app.log.error({ err }, 'normalizeWeather failed');
      reply.code(503);
      return {
        error: 'upstream_unavailable',
        message: (err as Error).message,
      };
    }
  });
}
