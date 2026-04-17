import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDebugTiers } from './nws/debug-alerts';

// Load .env before anything reads process.env. No external deps — just
// splits lines, skips comments, and sets vars that aren't already set.
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill in your values.`);
  return val;
}

function requireEnvNum(name: string): number {
  const val = Number(requireEnv(name));
  if (Number.isNaN(val)) throw new Error(`Env var ${name} must be a number.`);
  return val;
}

export const CONFIG = {
  location: {
    lat: requireEnvNum('SKYFRAME_LAT'),
    lon: requireEnvNum('SKYFRAME_LON'),
  },

  nws: {
    forecastOffice: requireEnv('SKYFRAME_FORECAST_OFFICE'),
    gridX: requireEnvNum('SKYFRAME_GRID_X'),
    gridY: requireEnvNum('SKYFRAME_GRID_Y'),
    timezone: requireEnv('SKYFRAME_TIMEZONE'),
    forecastZone: requireEnv('SKYFRAME_FORECAST_ZONE'),
    userAgent: `SkyFrame/0.1 (${requireEnv('SKYFRAME_EMAIL')})`,
    baseUrl: 'https://api.weather.gov',
  },

  stations: {
    primary: requireEnv('SKYFRAME_STATION_PRIMARY'),
    fallback: requireEnv('SKYFRAME_STATION_FALLBACK'),
    stalenessMinutes: 90,
  },

  cache: {
    forecastMs: 5 * 60 * 1000,
    observationMs: 90 * 1000,
    pointMetadataMs: 24 * 60 * 60 * 1000,
    alertsMs: 5 * 60 * 1000,
  },

  trendThresholds: {
    temperatureF: 0.5,
    dewpointF: 0.3,
    pressureInHg: 0.01,
    humidityPct: 0.5,
    windMph: 1.0,
    visibilityMi: 0.3,
  },

  server: {
    port: 3000,
    host: '127.0.0.1',
  },

  debug: {
    injectTiers: parseDebugTiers(process.env.SKYFRAME_DEBUG_TIERS),
  },
};
