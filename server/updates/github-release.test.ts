import { describe, it, expect } from 'vitest';
import { parseVersion, compareVersions, parseReleaseResponse } from './github-release';

describe('parseVersion', () => {
  it('parses "v1.2.3" into { major: 1, minor: 2, patch: 3 }', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  it('parses "1.2.3" without the v prefix', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  it('parses "1.2" with default patch 0', () => {
    expect(parseVersion('1.2')).toEqual({ major: 1, minor: 2, patch: 0 });
  });
  it('parses "0.0.1"', () => {
    expect(parseVersion('0.0.1')).toEqual({ major: 0, minor: 0, patch: 1 });
  });
  it('returns null for empty string', () => {
    expect(parseVersion('')).toBeNull();
  });
  it('returns null for non-numeric', () => {
    expect(parseVersion('abc')).toBeNull();
  });
  it('returns null when components are non-numeric', () => {
    expect(parseVersion('1.a.b')).toBeNull();
  });
  it('returns null for four-segment versions', () => {
    expect(parseVersion('1.2.3.4')).toBeNull();
  });
});

describe('compareVersions', () => {
  const v = (s: string) => parseVersion(s)!;
  it('returns negative when a.major < b.major', () => {
    expect(compareVersions(v('1.0.0'), v('2.0.0'))).toBeLessThan(0);
  });
  it('returns positive when a.major > b.major', () => {
    expect(compareVersions(v('2.0.0'), v('1.0.0'))).toBeGreaterThan(0);
  });
  it('returns negative on minor boundary', () => {
    expect(compareVersions(v('1.1.0'), v('1.2.0'))).toBeLessThan(0);
  });
  it('returns positive on minor boundary', () => {
    expect(compareVersions(v('1.2.0'), v('1.1.0'))).toBeGreaterThan(0);
  });
  it('returns negative on patch boundary', () => {
    expect(compareVersions(v('1.2.3'), v('1.2.4'))).toBeLessThan(0);
  });
  it('returns positive on patch boundary', () => {
    expect(compareVersions(v('1.2.4'), v('1.2.3'))).toBeGreaterThan(0);
  });
  it('returns 0 for identical versions', () => {
    expect(compareVersions(v('1.2.3'), v('1.2.3'))).toBe(0);
  });
});

describe('parseReleaseResponse', () => {
  it('returns a GitHubRelease on a valid payload', () => {
    const raw = {
      tag_name: 'v1.3.0',
      html_url: 'https://github.com/owner/repo/releases/tag/v1.3.0',
      body: 'Release notes here.',
      published_at: '2026-04-20T12:00:00Z',
    };
    expect(parseReleaseResponse(raw)).toEqual({
      tagName: 'v1.3.0',
      htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.3.0',
      body: 'Release notes here.',
      publishedAt: '2026-04-20T12:00:00Z',
    });
  });
  it('returns null when tag_name is missing', () => {
    expect(parseReleaseResponse({ html_url: 'x', body: 'y', published_at: 'z' })).toBeNull();
  });
  it('returns null when input is not an object', () => {
    expect(parseReleaseResponse('not an object')).toBeNull();
    expect(parseReleaseResponse(null)).toBeNull();
  });
  it('returns null when a field is the wrong type', () => {
    expect(parseReleaseResponse({ tag_name: 123, html_url: 'x', body: 'y', published_at: 'z' })).toBeNull();
  });
});
