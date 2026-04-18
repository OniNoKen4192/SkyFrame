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
