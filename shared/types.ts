export type IconCode =
  | 'sun' | 'moon'
  | 'partly-day' | 'partly-night'
  | 'cloud' | 'rain' | 'snow' | 'thunder' | 'fog';

export type TrendDirection = 'up' | 'down' | 'steady';

export interface Trend {
  direction: TrendDirection;
  deltaPerHour: number;
  confidence: 'ok' | 'missing';
}

export interface Wind {
  speedMph: number;
  directionDeg: number;
  cardinal: string;
}

export interface CurrentConditions {
  observedAt: string;
  stationId: string;
  stationDistanceKm: number;
  tempF: number;
  feelsLikeF: number;
  conditionText: string;
  iconCode: IconCode;
  precipOutlook: string;
  humidityPct: number | null;
  pressureInHg: number | null;
  visibilityMi: number | null;
  dewpointF: number | null;
  wind: Wind;
  trends: {
    temp: Trend;
    wind: Trend;
    humidity: Trend;
    pressure: Trend;
    visibility: Trend;
    dewpoint: Trend;
  };
  sunrise: string;
  sunset: string;
}

export interface HourlyPeriod {
  startTime: string;
  hourLabel: string;
  tempF: number;
  iconCode: IconCode;
  precipProbPct: number;
  wind: Wind;
  shortDescription: string;
}

export interface DailyPeriod {
  dateISO: string;
  dayOfWeek: string;
  dateLabel: string;
  highF: number;
  lowF: number;
  iconCode: IconCode;
  precipProbPct: number;
  shortDescription: string;
}

export interface WeatherMeta {
  fetchedAt: string;
  nextRefreshAt: string;
  cacheHit: boolean;
  stationId: string;
  locationName: string;
  error?: 'rate_limited' | 'upstream_malformed' | 'station_fallback' | 'partial';
}

export interface WeatherResponse {
  current: CurrentConditions;
  hourly: HourlyPeriod[];
  daily: DailyPeriod[];
  alerts: Alert[];
  meta: WeatherMeta;
}

export type AlertTier =
  | 'tornado-emergency'
  | 'tornado-warning'
  | 'severe-warning'
  | 'blizzard'
  | 'winter-storm'
  | 'flood'
  | 'heat'
  | 'special-weather-statement'
  | 'watch';

export interface Alert {
  id: string;
  event: string;
  tier: AlertTier;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  headline: string;
  description: string;
  effective: string;
  expires: string;
  areaDesc: string;
}
