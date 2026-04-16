import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNws, NwsError } from './client';
import { CONFIG } from '../config';

describe('fetchNws', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the configured User-Agent header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    );

    await fetchNws('/test');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers(init!.headers);
    expect(headers.get('user-agent')).toBe(CONFIG.nws.userAgent);
    expect(headers.get('accept')).toBe('application/geo+json');
  });

  it('retries once on 5xx before succeeding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
      );

    const result = await fetchNws<{ ok: boolean }>('/test');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('throws NwsError after retry still fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('server error', { status: 503 }));

    await expect(fetchNws('/test')).rejects.toBeInstanceOf(NwsError);
  });

  it('throws NwsError with code "rate_limited" on 429', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('too many', { status: 429 }));

    await expect(fetchNws('/test')).rejects.toMatchObject({
      name: 'NwsError',
      code: 'rate_limited',
    });
  });

  it('throws NwsError with code "upstream_malformed" on invalid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json at all', { status: 200, headers: { 'content-type': 'application/json' } })
    );

    await expect(fetchNws('/test')).rejects.toMatchObject({
      name: 'NwsError',
      code: 'upstream_malformed',
    });
  });
});
