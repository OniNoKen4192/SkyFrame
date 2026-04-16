import type { Trend } from '../../shared/types';

export interface TimedValue {
  timestamp: string;
  value: number | null;
}

export function computeTrend(series: TimedValue[], steadyThresholdPerHour: number): Trend {
  const nonNull = series.filter((s): s is { timestamp: string; value: number } => s.value !== null);

  if (nonNull.length < 2) {
    return { direction: 'steady', deltaPerHour: 0, confidence: 'missing' };
  }

  nonNull.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const earliest = nonNull[0]!;
  const latest = nonNull[nonNull.length - 1]!;

  const spanMs = Date.parse(latest.timestamp) - Date.parse(earliest.timestamp);
  const spanHours = spanMs / (1000 * 60 * 60);

  if (spanHours <= 0) {
    return { direction: 'steady', deltaPerHour: 0, confidence: 'missing' };
  }

  const deltaPerHour = (latest.value - earliest.value) / spanHours;

  let direction: 'up' | 'down' | 'steady';
  if (Math.abs(deltaPerHour) <= steadyThresholdPerHour) {
    direction = 'steady';
  } else if (deltaPerHour > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  return {
    direction,
    deltaPerHour: Math.round(deltaPerHour * 100) / 100,
    confidence: 'ok',
  };
}
