import { describe, it, expect } from 'vitest';
import { computeTrend } from './trends';

describe('computeTrend', () => {
  const threeHoursAgo = new Date('2026-04-15T12:00:00Z').toISOString();
  const twoHoursAgo   = new Date('2026-04-15T13:00:00Z').toISOString();
  const oneHourAgo    = new Date('2026-04-15T14:00:00Z').toISOString();
  const now           = new Date('2026-04-15T15:00:00Z').toISOString();

  it('returns "up" with positive delta when values rise above threshold', () => {
    const series = [
      { timestamp: threeHoursAgo, value: 60 },
      { timestamp: twoHoursAgo,   value: 61 },
      { timestamp: oneHourAgo,    value: 62 },
      { timestamp: now,           value: 63 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('up');
    expect(result.deltaPerHour).toBeCloseTo(1, 1);
    expect(result.confidence).toBe('ok');
  });

  it('returns "down" with negative delta when values fall', () => {
    const series = [
      { timestamp: threeHoursAgo, value: 70 },
      { timestamp: now,           value: 64 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('down');
    expect(result.deltaPerHour).toBeCloseTo(-2, 1);
  });

  it('returns "steady" when delta per hour is within threshold', () => {
    const series = [
      { timestamp: threeHoursAgo, value: 60 },
      { timestamp: now,           value: 60.3 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('steady');
    expect(result.deltaPerHour).toBeCloseTo(0.1, 2);
  });

  it('filters out null values before computing', () => {
    const series = [
      { timestamp: threeHoursAgo, value: null },
      { timestamp: twoHoursAgo,   value: 60 },
      { timestamp: now,           value: 62 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('up');
    expect(result.confidence).toBe('ok');
  });

  it('returns missing confidence when fewer than 2 non-null values', () => {
    const series = [
      { timestamp: threeHoursAgo, value: null },
      { timestamp: now,           value: 60 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.confidence).toBe('missing');
    expect(result.direction).toBe('steady');
    expect(result.deltaPerHour).toBe(0);
  });

  it('returns missing confidence for empty series', () => {
    const result = computeTrend([], 0.5);
    expect(result.confidence).toBe('missing');
  });
});
