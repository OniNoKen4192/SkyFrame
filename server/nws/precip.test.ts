import { describe, it, expect } from 'vitest';
import { buildPrecipOutlook } from './precip';

interface FakeHour {
  startTime: string;
  probabilityOfPrecipitation: number | null;
}

const nowChicago = '2026-04-15T14:30:00-05:00';

function hour(offsetHours: number, pop: number | null): FakeHour {
  const ts = new Date(Date.parse(nowChicago) + offsetHours * 3600 * 1000);
  return { startTime: ts.toISOString(), probabilityOfPrecipitation: pop };
}

describe('buildPrecipOutlook', () => {
  it('returns "DRY 24H+" when nothing >30% in the next 12h', () => {
    const hours = Array.from({ length: 12 }, (_, i) => hour(i + 1, 10));
    const result = buildPrecipOutlook({
      hours,
      currentTextDescription: 'Mostly Cloudy',
      now: new Date(nowChicago),
      timeZone: 'America/Chicago',
    });
    expect(result).toBe('DRY 24H+');
  });

  it('returns "DRY THRU HH:00" for first >30% period beyond 1 hour', () => {
    const hours = [
      hour(1, 10), hour(2, 15), hour(3, 20), hour(4, 25),
      hour(5, 45), hour(6, 60), hour(7, 50), hour(8, 30),
    ];
    const result = buildPrecipOutlook({
      hours,
      currentTextDescription: 'Cloudy',
      now: new Date(nowChicago),
      timeZone: 'America/Chicago',
    });
    expect(result).toBe('DRY THRU 19:00');
  });

  it('returns "RAIN IN NNm" when first >30% period is within the next hour', () => {
    const hours = [
      { startTime: new Date(Date.parse(nowChicago) + 20 * 60 * 1000).toISOString(), probabilityOfPrecipitation: 60 },
      hour(1, 70), hour(2, 50),
    ];
    const result = buildPrecipOutlook({
      hours,
      currentTextDescription: 'Cloudy',
      now: new Date(nowChicago),
      timeZone: 'America/Chicago',
    });
    expect(result).toBe('RAIN IN 20m');
  });

  it('returns "RAIN NOW · EASING HH:00" when currently precipitating', () => {
    const hours = [
      hour(1, 80), hour(2, 70), hour(3, 40), hour(4, 20),
    ];
    const result = buildPrecipOutlook({
      hours,
      currentTextDescription: 'Light Rain and Fog',
      now: new Date(nowChicago),
      timeZone: 'America/Chicago',
    });
    expect(result).toBe('RAIN NOW · EASING 18:00');
  });

  it('detects snow as precipitating', () => {
    const hours = [hour(1, 60), hour(2, 20)];
    const result = buildPrecipOutlook({
      hours,
      currentTextDescription: 'Light Snow Showers',
      now: new Date(nowChicago),
      timeZone: 'America/Chicago',
    });
    expect(result).toMatch(/^RAIN NOW · EASING/);
  });
});
