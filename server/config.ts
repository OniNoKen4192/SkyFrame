import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDebugTiers } from './nws/debug-alerts';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env before anything reads process.env.
const envPath = resolve(PROJECT_ROOT, '.env');
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

// Persistent config saved by the setup flow. Takes priority over .env.
export interface SkyFrameLocationConfig {
  lat: number;
  lon: number;
  email: string;
  forecastOffice: string;
  gridX: number;
  gridY: number;
  timezone: string;
  forecastZone: string;
  stationPrimary: string;
  stationFallback: string;
  locationName: string;
  updateCheckEnabled?: boolean;   // optional for backwards compat
}

const CONFIG_FILE = resolve(PROJECT_ROOT, 'skyframe.config.json');

function loadSavedConfig(): SkyFrameLocationConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    if (typeof raw.lat !== 'number' || typeof raw.email !== 'string') return null;
    return raw as SkyFrameLocationConfig;
  } catch {
    return null;
  }
}

export function saveSkyFrameConfig(cfg: SkyFrameLocationConfig): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

// Build the runtime config. Location fields are nullable when unconfigured.
function buildConfig() {
  const saved = loadSavedConfig();

  // Location: prefer saved config.json > .env > null (unconfigured)
  const lat = saved?.lat ?? (process.env.SKYFRAME_LAT ? Number(process.env.SKYFRAME_LAT) : null);
  const lon = saved?.lon ?? (process.env.SKYFRAME_LON ? Number(process.env.SKYFRAME_LON) : null);
  const email = saved?.email ?? process.env.SKYFRAME_EMAIL ?? null;
  const updateCheckEnabled = saved?.updateCheckEnabled ?? false;

  const configured = lat != null && lon != null && email != null;

  return {
    configured,
    email: email ?? '',

    location: {
      lat: lat ?? 0,
      lon: lon ?? 0,
      name: saved?.locationName ?? process.env.SKYFRAME_LOCATION_NAME ?? '',
    },

    nws: {
      forecastOffice: saved?.forecastOffice ?? process.env.SKYFRAME_FORECAST_OFFICE ?? '',
      gridX: saved?.gridX ?? (process.env.SKYFRAME_GRID_X ? Number(process.env.SKYFRAME_GRID_X) : 0),
      gridY: saved?.gridY ?? (process.env.SKYFRAME_GRID_Y ? Number(process.env.SKYFRAME_GRID_Y) : 0),
      timezone: saved?.timezone ?? process.env.SKYFRAME_TIMEZONE ?? 'America/Chicago',
      forecastZone: saved?.forecastZone ?? process.env.SKYFRAME_FORECAST_ZONE ?? '',
      userAgent: email ? `SkyFrame/0.1 (${email})` : 'SkyFrame/0.1 (unconfigured)',
      baseUrl: 'https://api.weather.gov',
    },

    stations: {
      primary: saved?.stationPrimary ?? process.env.SKYFRAME_STATION_PRIMARY ?? '',
      fallback: saved?.stationFallback ?? process.env.SKYFRAME_STATION_FALLBACK ?? '',
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
    updateCheckEnabled,
  };
}

export let CONFIG = buildConfig();

export function reloadConfig(): void {
  CONFIG = buildConfig();
}
