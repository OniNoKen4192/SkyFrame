// Small helper used by GET /api/stations/preview. Shares the staleness
// threshold with fetchObservationsWithFallback in normalizer.ts, but is
// intentionally decoupled — this endpoint is diagnostic/UI-facing and has
// different latency tolerances than the main weather path.

const STALENESS_MS = 90 * 60 * 1000;  // 90 minutes — matches CONFIG.stations.stalenessMinutes

// Narrow structural type — matches the subset of NwsObsResponse we read.
interface ObsLike {
  properties: {
    timestamp: string;
    temperature: { value: number | null };
  };
}

export interface StationSummary {
  stationId: string;
  observedAt: string | null;
  tempF: number | null;
  status: 'live' | 'stale' | 'error';
}

const cToF = (c: number | null): number | null =>
  c == null ? null : Math.round(c * 9 / 5 + 32);

export function summarizeStation(
  stationId: string,
  result: PromiseSettledResult<ObsLike>,
  now: Date,
): StationSummary {
  if (result.status === 'rejected') {
    return { stationId, observedAt: null, tempF: null, status: 'error' };
  }

  const props = result.value.properties;
  const ageMs = now.getTime() - Date.parse(props.timestamp);
  const status: 'live' | 'stale' = ageMs > STALENESS_MS ? 'stale' : 'live';

  return {
    stationId,
    observedAt: props.timestamp,
    tempF: cToF(props.temperature.value),
    status,
  };
}
