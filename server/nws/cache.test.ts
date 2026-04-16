import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTLCache } from './cache';

describe('TTLCache', () => {
  let cache: TTLCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new TTLCache();
  });

  it('returns undefined on miss', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns value on hit', () => {
    cache.set('key', { foo: 1 }, 1000);
    expect(cache.get('key')).toEqual({ foo: 1 });
  });

  it('expires after TTL', () => {
    cache.set('key', { foo: 1 }, 1000);
    vi.advanceTimersByTime(1001);
    expect(cache.get('key')).toBeUndefined();
  });

  it('reports next-expiring entry for meta.nextRefreshAt', () => {
    vi.setSystemTime(new Date('2026-04-15T14:00:00Z'));
    cache.set('short', 'a', 1000);  // expires 14:00:01
    cache.set('long', 'b', 10000);  // expires 14:00:10
    const next = cache.nextExpiryTime();
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(new Date('2026-04-15T14:00:01Z').getTime());
  });

  it('overwrites existing key with new TTL', () => {
    cache.set('key', 'v1', 1000);
    vi.advanceTimersByTime(500);
    cache.set('key', 'v2', 1000);
    vi.advanceTimersByTime(700);  // past original TTL, within new
    expect(cache.get('key')).toBe('v2');
  });
});
