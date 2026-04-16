import type {
  WeatherResponse, CurrentConditions, HourlyPeriod, DailyPeriod, Wind,
} from '../../shared/types';
import { CONFIG } from '../config';
import { fetchNws } from './client';
import { mapNwsIcon } from './icon-mapping';
import { computeTrend, type TimedValue } from './trends';
import { buildPrecipOutlook } from './precip';

// ========== Unit conversion helpers ==========

const cToF = (c: number | null | undefined): number =>
  c == null ? NaN : Math.round(c * 9 / 5 + 32);

const kmhToMph = (kmh: number | null | undefined): number =>
  kmh == null ? NaN : Math.round(kmh * 0.6213711922);

const paToInHg = (pa: number | null | undefined): number =>
  pa == null ? NaN : Math.round(pa * 0.000295299830714 * 100) / 100;

const mToMi = (m: number | null | undefined): number =>
  m == null ? NaN : Math.round(m * 0.0006213711922);

const degToCardinal = (deg: number | null | undefined): string => {
  if (deg == null) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16]!;
};

// Parse a string like "12 mph" to a number of mph
const parseWindSpeedString = (s: string | null | undefined): number => {
  if (!s) return 0;
  const match = s.match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(parseFloat(match[1]!)) : 0;
};

// ========== Hourly period filtering ==========

const HOUR_MS = 60 * 60 * 1000;

// NWS hourly responses are generated on their own schedule and can lead with
// periods whose hour has already ended. Drop those, keeping the period for the
// current hour (whose endTime is still in the future).
function dropPastHours<T extends { startTime: string }>(periods: T[], now: Date): T[] {
  const nowMs = now.getTime();
  return periods.filter((p) => Date.parse(p.startTime) + HOUR_MS > nowMs);
}

// ========== Time formatting ==========

function formatHourMinute(iso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}`;
}

function formatDayOfWeek(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .format(new Date(iso)).toUpperCase();
}

function formatDateLabel(iso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: '2-digit' });
  return fmt.format(new Date(iso)).toUpperCase();
}

function formatDateISO(iso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(iso));
}

// ========== NWS response interfaces ==========

interface NwsPointResponse {
  properties: {
    forecast: string;
    forecastHourly: string;
    astronomicalData?: { sunrise?: string; sunset?: string };
  };
}

interface NwsForecastResponse {
  properties: {
    periods: Array<{
      name: string;
      startTime: string;
      endTime: string;
      isDaytime: boolean;
      temperature: number;
      shortForecast: string;
      icon: string;
      probabilityOfPrecipitation?: { value: number | null };
    }>;
  };
}

interface NwsHourlyResponse {
  properties: {
    periods: Array<{
      startTime: string;
      temperature: number;
      shortForecast: string;
      icon: string;
      probabilityOfPrecipitation?: { value: number | null };
      windSpeed: string;
      windDirection: string;
    }>;
  };
}

interface NwsObsProperties {
  timestamp: string;
  temperature: { value: number | null };
  dewpoint: { value: number | null };
  windSpeed: { value: number | null };
  windDirection: { value: number | null };
  barometricPressure: { value: number | null };
  visibility: { value: number | null };
  relativeHumidity: { value: number | null };
  heatIndex: { value: number | null };
  windChill: { value: number | null };
  textDescription: string | null;
  icon: string;
}

interface NwsObsResponse {
  properties: NwsObsProperties;
}

interface NwsObsListResponse {
  features: Array<{ properties: NwsObsProperties }>;
}

// ========== Station fallback ==========

const STALENESS_MS = CONFIG.stations.stalenessMinutes * 60 * 1000;

interface ObsFetchResult {
  obsLatest: NwsObsResponse;
  obsHistory: NwsObsListResponse;
  stationId: string;
  fellBack: boolean;
}

function isObservationUsable(obs: NwsObsProperties, now: Date): boolean {
  const ageMs = now.getTime() - Date.parse(obs.timestamp);
  if (ageMs > STALENESS_MS) return false;
  if (obs.temperature.value == null) return false;
  if (obs.windSpeed.value == null) return false;
  if (!obs.textDescription || obs.textDescription.trim() === '') return false;
  return true;
}

async function fetchObservationsWithFallback(now: Date): Promise<ObsFetchResult> {
  const { stations } = CONFIG;

  try {
    const primaryLatest = await fetchNws<NwsObsResponse>(
      `/stations/${stations.primary}/observations/latest`,
    );
    if (isObservationUsable(primaryLatest.properties, now)) {
      const primaryHistory = await fetchNws<NwsObsListResponse>(
        `/stations/${stations.primary}/observations?limit=6`,
      );
      return { obsLatest: primaryLatest, obsHistory: primaryHistory, stationId: stations.primary, fellBack: false };
    }
  } catch {
    // Swallow; fall through to secondary
  }

  const secondaryLatest = await fetchNws<NwsObsResponse>(
    `/stations/${stations.fallback}/observations/latest`,
  );
  const secondaryHistory = await fetchNws<NwsObsListResponse>(
    `/stations/${stations.fallback}/observations?limit=6`,
  );
  return { obsLatest: secondaryLatest, obsHistory: secondaryHistory, stationId: stations.fallback, fellBack: true };
}

// ========== Main normalizer ==========

export async function normalizeWeather(): Promise<WeatherResponse> {
  const { nws, location } = CONFIG;

  // 1. Fetch point metadata (sunrise/sunset mainly)
  const point = await fetchNws<NwsPointResponse>(
    `/points/${location.lat.toFixed(4)},${location.lon.toFixed(4)}`,
  );

  // 2. Fetch forecast, hourly forecast, and observations (with fallback) in parallel
  const now = new Date();
  const [forecast, hourly, obsResult] = await Promise.all([
    fetchNws<NwsForecastResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast`),
    fetchNws<NwsHourlyResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast/hourly`),
    fetchObservationsWithFallback(now),
  ]);
  const { obsLatest, obsHistory, stationId: activeStationId, fellBack } = obsResult;

  // 3. Normalize current conditions
  const current = normalizeCurrent(
    obsLatest.properties,
    obsHistory,
    hourly,
    activeStationId,
    nws.timezone,
    point,
  );

  // 4. Normalize hourly (first 12 periods, after dropping past hours)
  const hourlyPeriods: HourlyPeriod[] = dropPastHours(hourly.properties.periods, now).slice(0, 12).map((p) => ({
    startTime: p.startTime,
    hourLabel: formatHourMinute(p.startTime, nws.timezone),
    tempF: p.temperature,
    iconCode: mapNwsIcon(p.icon, p.probabilityOfPrecipitation?.value ?? null),
    precipProbPct: p.probabilityOfPrecipitation?.value ?? 0,
    wind: {
      speedMph: parseWindSpeedString(p.windSpeed),
      directionDeg: 0,
      cardinal: p.windDirection,
    },
    shortDescription: p.shortForecast,
  }));

  // 5. Normalize daily (collapse day+night period pairs)
  const dailyPeriods = collapseDailyPeriods(forecast.properties.periods, nws.timezone);

  // 6. Assemble meta
  const meta = {
    fetchedAt: now.toISOString(),
    nextRefreshAt: new Date(now.getTime() + CONFIG.cache.observationMs).toISOString(),
    cacheHit: false,
    stationId: activeStationId,
    ...(fellBack ? { error: 'station_fallback' as const } : {}),
  };

  return { current, hourly: hourlyPeriods, daily: dailyPeriods, meta };
}

function normalizeCurrent(
  obs: NwsObsProperties,
  history: NwsObsListResponse,
  hourly: NwsHourlyResponse,
  stationId: string,
  timeZone: string,
  point: NwsPointResponse,
): CurrentConditions {
  const tempF = cToF(obs.temperature.value);
  const dewpointF = cToF(obs.dewpoint.value);
  const feelsLikeF = obs.heatIndex.value != null
    ? cToF(obs.heatIndex.value)
    : obs.windChill.value != null
      ? cToF(obs.windChill.value)
      : tempF;

  const wind: Wind = {
    speedMph: kmhToMph(obs.windSpeed.value),
    directionDeg: obs.windDirection.value ?? 0,
    cardinal: degToCardinal(obs.windDirection.value),
  };

  // Build trend series from history for each metric (convert to display units first)
  const toTimedValues = (extractor: (p: NwsObsProperties) => number | null): TimedValue[] =>
    history.features.map((f) => ({ timestamp: f.properties.timestamp, value: extractor(f.properties) }));

  const trends = {
    temp:       computeTrend(toTimedValues((p) => p.temperature.value != null ? p.temperature.value * 9 / 5 + 32 : null), CONFIG.trendThresholds.temperatureF),
    wind:       computeTrend(toTimedValues((p) => p.windSpeed.value != null ? p.windSpeed.value * 0.6213711922 : null), CONFIG.trendThresholds.windMph),
    humidity:   computeTrend(toTimedValues((p) => p.relativeHumidity.value), CONFIG.trendThresholds.humidityPct),
    pressure:   computeTrend(toTimedValues((p) => p.barometricPressure.value != null ? p.barometricPressure.value * 0.000295299830714 : null), CONFIG.trendThresholds.pressureInHg),
    visibility: computeTrend(toTimedValues((p) => p.visibility.value != null ? p.visibility.value * 0.0006213711922 : null), CONFIG.trendThresholds.visibilityMi),
    dewpoint:   computeTrend(toTimedValues((p) => p.dewpoint.value != null ? p.dewpoint.value * 9 / 5 + 32 : null), CONFIG.trendThresholds.dewpointF),
  };

  // Precipitation outlook (filter past hours so "RAIN IN Xm" / "DRY THRU HH:MM" reflect the future)
  const precipNow = new Date();
  const precipOutlook = buildPrecipOutlook({
    hours: dropPastHours(hourly.properties.periods, precipNow).slice(0, 12).map((h) => ({
      startTime: h.startTime,
      probabilityOfPrecipitation: h.probabilityOfPrecipitation?.value ?? null,
    })),
    currentTextDescription: obs.textDescription ?? '',
    now: precipNow,
    timeZone,
  });

  // Sunrise / sunset from point metadata
  const astroSunrise = point.properties.astronomicalData?.sunrise;
  const astroSunset  = point.properties.astronomicalData?.sunset;

  return {
    observedAt: obs.timestamp,
    stationId,
    stationDistanceKm: 7, // KMKE is ~7 km from 53154; future: compute from station metadata
    tempF,
    feelsLikeF,
    conditionText: (obs.textDescription ?? '').toUpperCase(),
    iconCode: mapNwsIcon(obs.icon),
    precipOutlook,
    humidityPct: Math.round(obs.relativeHumidity.value ?? 0),
    pressureInHg: paToInHg(obs.barometricPressure.value),
    visibilityMi: mToMi(obs.visibility.value),
    dewpointF,
    wind,
    trends,
    sunrise: astroSunrise ? formatHourMinute(astroSunrise, timeZone) : '--:--',
    sunset:  astroSunset  ? formatHourMinute(astroSunset,  timeZone) : '--:--',
  };
}

function collapseDailyPeriods(
  periods: NwsForecastResponse['properties']['periods'],
  timeZone: string,
): DailyPeriod[] {
  // NWS returns alternating day/night periods. Collapse each day+night pair
  // into a single DailyPeriod. High comes from the day period, low from night.
  const daily: DailyPeriod[] = [];
  let i = 0;

  while (i < periods.length && daily.length < 7) {
    const a = periods[i]!;
    const b = periods[i + 1];

    if (a.isDaytime && b && !b.isDaytime) {
      // Day + night pair
      const pairProb = Math.max(a.probabilityOfPrecipitation?.value ?? 0, b.probabilityOfPrecipitation?.value ?? 0);
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: b.temperature,
        iconCode: mapNwsIcon(a.icon, pairProb),
        precipProbPct: pairProb,
        shortDescription: a.shortForecast,
      });
      i += 2;
    } else if (!a.isDaytime) {
      // At late-night/early-morning, NWS serves an "Overnight" period that
      // shares its local-timezone date with the next "Day" period (today's
      // daytime). Skip it so the day+night pair below produces the canonical
      // entry without a duplicate row.
      if (b && b.isDaytime && formatDateISO(a.startTime, timeZone) === formatDateISO(b.startTime, timeZone)) {
        i += 1;
        continue;
      }
      // Otherwise: late-evening "Tonight" before tomorrow's day starts —
      // emit standalone with night temp as both high and low.
      const nightProb = a.probabilityOfPrecipitation?.value ?? 0;
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: a.temperature,
        iconCode: mapNwsIcon(a.icon, nightProb),
        precipProbPct: nightProb,
        shortDescription: a.shortForecast,
      });
      i += 1;
    } else {
      // Orphaned day period at the end of the forecast window
      const dayProb = a.probabilityOfPrecipitation?.value ?? 0;
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: a.temperature,
        iconCode: mapNwsIcon(a.icon, dayProb),
        precipProbPct: dayProb,
        shortDescription: a.shortForecast,
      });
      i += 1;
    }
  }

  return daily;
}
