import { CONFIG } from '../config';

export type NwsErrorCode =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'upstream_malformed'
  | 'not_found';

export class NwsError extends Error {
  readonly name = 'NwsError';
  constructor(
    message: string,
    readonly code: NwsErrorCode,
    readonly status?: number,
  ) {
    super(message);
  }
}

const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a path from NWS with the required User-Agent header, one retry on 5xx,
 * and structured error classification. Returns parsed JSON on success.
 *
 * @param path - Either a full URL or a path starting with /, which is resolved
 *   against CONFIG.nws.baseUrl.
 */
export async function fetchNws<T = unknown>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${CONFIG.nws.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'User-Agent': CONFIG.nws.userAgent,
    Accept: 'application/geo+json',
  };

  let lastError: NwsError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (e) {
      lastError = new NwsError(`Network error: ${(e as Error).message}`, 'network');
      if (attempt === 0) { await sleep(RETRY_DELAY_MS); continue; }
      throw lastError;
    }

    if (response.status === 429) {
      throw new NwsError(`Rate limited by NWS: ${url}`, 'rate_limited', 429);
    }

    if (response.status === 404) {
      throw new NwsError(`Not found: ${url}`, 'not_found', 404);
    }

    if (response.status >= 500) {
      lastError = new NwsError(`NWS server error ${response.status}: ${url}`, 'server_error', response.status);
      if (attempt === 0) { await sleep(RETRY_DELAY_MS); continue; }
      throw lastError;
    }

    if (!response.ok) {
      throw new NwsError(`NWS request failed ${response.status}: ${url}`, 'server_error', response.status);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new NwsError(`Malformed JSON from ${url}`, 'upstream_malformed');
    }
  }

  throw lastError ?? new NwsError('Unknown NWS error', 'network');
}
