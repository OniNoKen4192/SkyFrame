import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCachedUpdate,
  clearCachedUpdate,
  performUpdateCheck,
  msUntilNextLocalMidnight,
  buildUpdateAlert,
} from './update-check';

describe('msUntilNextLocalMidnight', () => {
  it('returns 24h at start-of-day', () => {
    const startOfDay = new Date(2026, 3, 20, 0, 0, 0, 0);  // month is 0-indexed: 3 = April
    expect(msUntilNextLocalMidnight(startOfDay)).toBe(24 * 60 * 60 * 1000);
  });
  it('returns ~12h at noon', () => {
    const noon = new Date(2026, 3, 20, 12, 0, 0, 0);
    expect(msUntilNextLocalMidnight(noon)).toBe(12 * 60 * 60 * 1000);
  });
  it('returns 1 minute just before midnight', () => {
    const almostMidnight = new Date(2026, 3, 20, 23, 59, 0, 0);
    expect(msUntilNextLocalMidnight(almostMidnight)).toBe(60 * 1000);
  });
});

describe('performUpdateCheck', () => {
  beforeEach(() => {
    clearCachedUpdate();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates the cache when GitHub returns a newer release', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        tag_name: 'v99.0.0',
        html_url: 'https://github.com/owner/repo/releases/tag/v99.0.0',
        body: 'Big update.',
        published_at: '2026-04-20T12:00:00Z',
      }), { status: 200 }),
    );

    await performUpdateCheck(new Date('2026-04-20T13:00:00Z'));

    const cached = getCachedUpdate();
    expect(cached).not.toBeNull();
    expect(cached!.latestVersion).toBe('v99.0.0');
    expect(cached!.releaseBody).toBe('Big update.');
    expect(cached!.checkedAt).toBe('2026-04-20T13:00:00.000Z');
  });

  it('leaves the cache null when the release matches the current version', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        tag_name: 'v0.0.1',  // lower than package.json's version; simulate no-update
        html_url: 'https://example.com',
        body: 'Old.',
        published_at: '2020-01-01T00:00:00Z',
      }), { status: 200 }),
    );

    await performUpdateCheck(new Date());

    expect(getCachedUpdate()).toBeNull();
  });

  it('silently skips on fetch network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    await expect(performUpdateCheck(new Date())).resolves.toBeUndefined();
    expect(getCachedUpdate()).toBeNull();
  });

  it('silently skips on malformed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not json', { status: 200 }),
    );

    await expect(performUpdateCheck(new Date())).resolves.toBeUndefined();
    expect(getCachedUpdate()).toBeNull();
  });
});

describe('buildUpdateAlert', () => {
  it('produces a valid advisory Alert with stable id', () => {
    const update = {
      currentVersion: '1.2.1',
      latestVersion: 'v1.3.0',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v1.3.0',
      releaseBody: 'Release notes.',
      checkedAt: '2026-04-20T12:00:00Z',
    };

    const alert = buildUpdateAlert(update);

    expect(alert.id).toBe('update-v1.3.0');
    expect(alert.tier).toBe('advisory');
    expect(alert.event).toBe('Update Available');
    expect(alert.headline).toBe('SkyFrame v1.3.0 is available');
    expect(alert.description).toContain('Release notes.');
    expect(alert.description).toContain('https://github.com/owner/repo/releases/tag/v1.3.0');
    expect(alert.description).toContain('you are on 1.2.1');
    expect(alert.issuedAt).toBe('2026-04-20T12:00:00Z');
    // Far-future expires
    expect(Date.parse(alert.expires)).toBeGreaterThan(Date.parse('2098-01-01T00:00:00Z'));
  });
});
