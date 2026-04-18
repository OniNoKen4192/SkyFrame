import { describe, it, expect } from 'vitest';
import { convertTempF, scaleTempTrend, type TempUnit } from './units';
import type { Trend } from './types';

describe('convertTempF', () => {
  it('returns input unchanged when unit is F', () => {
    expect(convertTempF(72, 'F')).toBe(72);
    expect(convertTempF(-40, 'F')).toBe(-40);
    expect(convertTempF(0, 'F')).toBe(0);
  });

  it('converts °F to °C using (F - 32) * 5/9', () => {
    expect(convertTempF(32, 'C')).toBeCloseTo(0, 5);
    expect(convertTempF(212, 'C')).toBeCloseTo(100, 5);
    expect(convertTempF(-40, 'C')).toBeCloseTo(-40, 5);
    expect(convertTempF(68, 'C')).toBeCloseTo(20, 5);
    expect(convertTempF(98.6, 'C')).toBeCloseTo(37, 1);
  });
});

describe('scaleTempTrend', () => {
  const baseTrend: Trend = { direction: 'up', deltaPerHour: 1.8, confidence: 'ok' };

  it('returns trend unchanged when unit is F', () => {
    const result = scaleTempTrend(baseTrend, 'F');
    expect(result).toEqual(baseTrend);
  });

  it('scales deltaPerHour by 5/9 when unit is C', () => {
    const result = scaleTempTrend(baseTrend, 'C');
    expect(result.deltaPerHour).toBeCloseTo(1.0, 5);
    expect(result.direction).toBe('up');
    expect(result.confidence).toBe('ok');
  });

  it('preserves negative delta sign when scaling', () => {
    const downTrend: Trend = { direction: 'down', deltaPerHour: -0.9, confidence: 'ok' };
    const result = scaleTempTrend(downTrend, 'C');
    expect(result.deltaPerHour).toBeCloseTo(-0.5, 5);
  });

  it('preserves missing-confidence trends without modification', () => {
    const missingTrend: Trend = { direction: 'steady', deltaPerHour: 0, confidence: 'missing' };
    const result = scaleTempTrend(missingTrend, 'C');
    expect(result).toEqual(missingTrend);
  });
});
