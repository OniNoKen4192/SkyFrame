import type { Trend } from './types';

export type TempUnit = 'F' | 'C';

export function convertTempF(value: number, unit: TempUnit): number {
  if (unit === 'F') return value;
  return (value - 32) * 5 / 9;
}

export function scaleTempTrend(t: Trend, unit: TempUnit): Trend {
  if (unit === 'F') return t;
  return { ...t, deltaPerHour: t.deltaPerHour * 5 / 9 };
}
