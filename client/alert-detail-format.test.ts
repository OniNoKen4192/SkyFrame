import { describe, it, expect } from 'vitest';
import { parseDescription } from './alert-detail-format';

describe('parseDescription', () => {
  it('returns an empty array for an empty string', () => {
    expect(parseDescription('')).toEqual([]);
  });

  it('returns one paragraph with null prefix for plain text', () => {
    expect(parseDescription('A tornado has been reported.')).toEqual([
      { prefix: null, text: 'A tornado has been reported.' },
    ]);
  });

  it('splits paragraphs on double newline', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'First paragraph.' },
      { prefix: null, text: 'Second paragraph.' },
    ]);
  });

  it('classifies HAZARD, SOURCE, IMPACT prefixes and strips them from text', () => {
    const input = [
      'The NWS has issued a warning.',
      '',
      'HAZARD...Tornado and quarter size hail.',
      '',
      'SOURCE...Radar indicated rotation.',
      '',
      'IMPACT...Flying debris will be dangerous.',
    ].join('\n');

    expect(parseDescription(input)).toEqual([
      { prefix: null,     text: 'The NWS has issued a warning.' },
      { prefix: 'HAZARD', text: 'Tornado and quarter size hail.' },
      { prefix: 'SOURCE', text: 'Radar indicated rotation.' },
      { prefix: 'IMPACT', text: 'Flying debris will be dangerous.' },
    ]);
  });

  it('normalizes Windows-style \\r\\n line endings', () => {
    const input = 'First line.\r\n\r\nSecond line.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'First line.' },
      { prefix: null, text: 'Second line.' },
    ]);
  });

  it('drops trailing empty paragraphs', () => {
    const input = 'Only paragraph.\n\n\n\n';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Only paragraph.' },
    ]);
  });

  it('drops leading empty paragraphs', () => {
    const input = '\n\nOnly paragraph.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Only paragraph.' },
    ]);
  });

  it('preserves internal single newlines within a paragraph', () => {
    const input = 'Line one.\nLine two still same paragraph.\n\nNext paragraph.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Line one.\nLine two still same paragraph.' },
      { prefix: null, text: 'Next paragraph.' },
    ]);
  });

  it('does not classify prefixes that are lowercase or not at paragraph start', () => {
    const input = 'Some text mentioning HAZARD...inline.\n\nhazard...not uppercase.';
    expect(parseDescription(input)).toEqual([
      { prefix: null, text: 'Some text mentioning HAZARD...inline.' },
      { prefix: null, text: 'hazard...not uppercase.' },
    ]);
  });
});

import { formatAlertMeta, formatTime, isUpdateAlert } from './alert-detail-format';
import type { Alert } from '../shared/types';

const SAMPLE_ALERT: Alert = {
  id: 'x',
  event: 'Tornado Warning',
  tier: 'tornado-warning',
  severity: 'Extreme',
  headline: 'Tornado Warning',
  description: 'irrelevant',
  issuedAt: '2026-04-16T19:14:00Z',  // 2:14 PM CDT
  effective: '2026-04-16T19:14:00Z',
  expires:   '2026-04-16T20:00:00Z',  // 3:00 PM CDT
  areaDesc: 'Linn County, IA',
};

describe('formatAlertMeta', () => {
  it('renders issued / expires / area in uppercase with bullet separators', () => {
    const result = formatAlertMeta(SAMPLE_ALERT, 'America/Chicago');
    expect(result).toBe('ISSUED 2:14 PM CDT \u00B7 EXPIRES 3:00 PM CDT \u00B7 LINN COUNTY, IA');
  });

  it('handles expires crossing midnight', () => {
    const alert: Alert = {
      ...SAMPLE_ALERT,
      issuedAt: '2026-04-16T04:30:00Z',  // 11:30 PM CDT previous day
      expires:  '2026-04-16T06:00:00Z',  // 1:00 AM CDT
    };
    const result = formatAlertMeta(alert, 'America/Chicago');
    expect(result).toBe('ISSUED 11:30 PM CDT \u00B7 EXPIRES 1:00 AM CDT \u00B7 LINN COUNTY, IA');
  });

  it('omits the EXPIRES segment for update alerts (id starts with "update-")', () => {
    const alert: Alert = {
      ...SAMPLE_ALERT,
      id: 'update-v1.3.0',
      event: 'Update Available',
      tier: 'advisory',
      areaDesc: 'Update',
    };
    const result = formatAlertMeta(alert, 'America/Chicago');
    expect(result).toBe('ISSUED 2:14 PM CDT \u00B7 UPDATE');
    expect(result).not.toContain('EXPIRES');
  });
});

describe('isUpdateAlert', () => {
  it('returns true when id starts with "update-"', () => {
    expect(isUpdateAlert({ ...SAMPLE_ALERT, id: 'update-v1.3.0' })).toBe(true);
  });
  it('returns false for other ids', () => {
    expect(isUpdateAlert({ ...SAMPLE_ALERT, id: 'urn:oid:nws.alerts.1' })).toBe(false);
    expect(isUpdateAlert({ ...SAMPLE_ALERT, id: 'debug-tornado-warning-0' })).toBe(false);
  });
});

describe('formatTime timezone parameter', () => {
  const iso = '2026-04-20T20:00:00Z';  // 8 PM UTC = 3 PM CDT = 4 PM EDT

  it('renders in America/Chicago when that timezone is passed', () => {
    expect(formatTime(iso, 'America/Chicago')).toBe('3:00 PM CDT');
  });

  it('renders in America/New_York when that timezone is passed', () => {
    expect(formatTime(iso, 'America/New_York')).toBe('4:00 PM EDT');
  });

  it('falls back to browser timezone when timezone is null', () => {
    const result = formatTime(iso, null);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
