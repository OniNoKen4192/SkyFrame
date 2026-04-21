import type { FastifyInstance } from 'fastify';
import type { WeatherResponse } from '../shared/types';
import { normalizeWeather } from './nws/normalizer';
import { resolveSetup } from './nws/setup';
import { TTLCache } from './nws/cache';
import { CONFIG, reloadConfig, saveSkyFrameConfig, loadSavedConfig } from './config';
import { startUpdateScheduler, stopUpdateScheduler, clearCachedUpdate } from './updates/update-check';
import { fetchNws } from './nws/client';
import { summarizeStation, type StationSummary } from './nws/station-preview';

const WEATHER_CACHE_KEY = 'weather';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const cache = new TTLCache();

  app.get('/api/config', async () => {
    if (!CONFIG.configured) {
      return {
        configured: false as const,
        updateCheckEnabled: CONFIG.updateCheckEnabled,
      };
    }
    return {
      configured: true as const,
      locationName: CONFIG.location.name,
      location: `${CONFIG.location.lat.toFixed(4)}, ${CONFIG.location.lon.toFixed(4)}`,
      email: CONFIG.email,
      updateCheckEnabled: CONFIG.updateCheckEnabled,
      timezone: CONFIG.nws.timezone,
    };
  });

  type ErrorReply = { error: string; message: string };

  app.get<{ Reply: WeatherResponse | ErrorReply }>('/api/weather', async (_req, reply) => {
    if (!CONFIG.configured) {
      reply.code(503);
      return { error: 'not_configured', message: 'Location not set. POST /api/setup first.' };
    }

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

  app.post<{
    Body: { location: string; email: string; updateCheckEnabled?: boolean };
    Reply: { success: true; locationName: string } | ErrorReply;
  }>('/api/setup', async (req, reply) => {
    try {
      const { location, email, updateCheckEnabled } = req.body;
      if (!location || !email) {
        reply.code(400);
        return { error: 'invalid_input', message: 'Both location and email are required.' };
      }

      const previousUpdateEnabled = CONFIG.updateCheckEnabled;
      const resolved = await resolveSetup({ location, email });
      const newUpdateEnabled = updateCheckEnabled ?? false;

      // Persist with the new updateCheckEnabled flag
      saveSkyFrameConfig({ ...resolved, updateCheckEnabled: newUpdateEnabled });
      reloadConfig();
      cache.clear();

      // Reconcile the scheduler against the new flag state
      if (newUpdateEnabled && !previousUpdateEnabled) {
        startUpdateScheduler();
        app.log.info('Update check enabled — scheduler started');
      } else if (!newUpdateEnabled && previousUpdateEnabled) {
        stopUpdateScheduler();
        clearCachedUpdate();
        app.log.info('Update check disabled — scheduler stopped, cache cleared');
      }

      app.log.info(`Location configured: ${resolved.locationName} (${resolved.lat}, ${resolved.lon})`);
      return { success: true as const, locationName: resolved.locationName };
    } catch (err) {
      app.log.error({ err }, 'Setup failed');
      reply.code(400);
      return { error: 'setup_failed', message: (err as Error).message };
    }
  });

  app.post<{
    Body: { mode: 'auto' | 'force-secondary' };
    Reply: { success: true } | ErrorReply;
  }>('/api/station-override', async (req, reply) => {
    if (!CONFIG.configured) {
      reply.code(503);
      return { error: 'not_configured', message: 'Location not set.' };
    }

    const { mode } = req.body;
    if (mode !== 'auto' && mode !== 'force-secondary') {
      reply.code(400);
      return { error: 'invalid_input', message: 'mode must be "auto" or "force-secondary"' };
    }

    const saved = loadSavedConfig();
    if (!saved) {
      reply.code(500);
      return { error: 'config_missing', message: 'skyframe.config.json not found despite configured state' };
    }
    saveSkyFrameConfig({ ...saved, stationOverride: mode });
    reloadConfig();
    cache.clear();  // invalidate weather cache so the flip takes effect immediately

    app.log.info(`Station override set to ${mode}`);
    return { success: true as const };
  });

  interface NwsObsResponse {
    properties: {
      timestamp: string;
      temperature: { value: number | null };
    };
  }

  app.get<{
    Reply: { primary: StationSummary; fallback: StationSummary } | ErrorReply;
  }>('/api/stations/preview', async (_req, reply) => {
    if (!CONFIG.configured) {
      reply.code(503);
      return { error: 'not_configured', message: 'Location not set.' };
    }

    const { primary, fallback } = CONFIG.stations;
    const now = new Date();
    const [primaryResult, fallbackResult] = await Promise.allSettled([
      fetchNws<NwsObsResponse>(`/stations/${primary}/observations/latest`),
      fetchNws<NwsObsResponse>(`/stations/${fallback}/observations/latest`),
    ]);

    return {
      primary: summarizeStation(primary, primaryResult, now),
      fallback: summarizeStation(fallback, fallbackResult, now),
    };
  });
}
