import { parseDebugTiers } from './nws/debug-alerts';

export const CONFIG = {
  // Location (ZIP 53154, Oak Creek, WI)
  location: {
    lat: 42.89387888628059,
    lon: -87.92605499945817,
    zip: '53154',
    cityState: 'Oak Creek, WI',
  },

  // NWS point metadata (resolved once; these are stable for this lat/lon)
  nws: {
    forecastOffice: 'MKX',
    gridX: 88,
    gridY: 58,
    timezone: 'America/Chicago',
    forecastZone: 'WIZ066',
    userAgent: 'SkyFrame/0.1 (ken.culver@gmail.com)',
    baseUrl: 'https://api.weather.gov',
  },

  // Observation station preference
  stations: {
    primary: 'KMKE',
    fallback: 'KRAC',
    stalenessMinutes: 90, // fallback if primary's latest obs is older than this
  },

  // Cache TTLs (milliseconds)
  cache: {
    forecastMs: 5 * 60 * 1000,      // 5 min for forecast endpoints
    observationMs: 90 * 1000,        // 90 sec for observations
    pointMetadataMs: 24 * 60 * 60 * 1000, // 24 hours for /points (re-fetch daily for astronomicalData)
    alertsMs: 5 * 60 * 1000,        // 5 minutes — alerts change faster than forecasts
  },

  // Trend computation thresholds (per hour) — see design doc §4.2
  trendThresholds: {
    temperatureF: 0.5,
    dewpointF: 0.3,
    pressureInHg: 0.01,
    humidityPct: 0.5,
    windMph: 1.0,
    visibilityMi: 0.3,
  },

  // Server config
  server: {
    port: 3000,
    host: '127.0.0.1',
  },

  // Dev-only: when SKYFRAME_DEBUG_TIERS env var is set, synthetic alerts
  // for the listed tiers replace the real NWS alerts fetch. Empty in production.
  debug: {
    injectTiers: parseDebugTiers(process.env.SKYFRAME_DEBUG_TIERS),
  },
} as const;
