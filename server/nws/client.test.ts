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

  it('passes an AbortSignal to fetch so requests can be cancelled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    );

    await fetchNws('/test');

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws NwsError with code "timeout" when fetch exceeds the configured timeout', async () => {
    vi.useFakeTimers();

    // Mock fetch to respect the abort signal and otherwise never resolve.
    // Real NWS never replying is exactly the scenario this guards against.
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const settled = fetchNws('/test').catch((e) => e);

    // Attempt 1 hangs → timeout fires
    await vi.advanceTimersByTimeAsync(CONFIG.nws.timeoutMs + 1);
    // Retry backoff
    await vi.advanceTimersByTimeAsync(1100);
    // Attempt 2 hangs → timeout fires
    await vi.advanceTimersByTimeAsync(CONFIG.nws.timeoutMs + 1);

    const result = await settled;
    expect(result).toBeInstanceOf(NwsError);
    expect((result as NwsError).code).toBe('timeout');

    vi.useRealTimers();
  });
});
