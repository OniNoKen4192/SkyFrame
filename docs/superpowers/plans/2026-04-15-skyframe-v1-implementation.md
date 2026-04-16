# SkyFrame v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SkyFrame v1 — a local ad-free weather dashboard for ZIP 53154 that fetches from NOAA/NWS, normalizes the data, and renders a cyan-on-black HUD-style dashboard with current conditions, 12-hour hourly forecast, and 7-day outlook.

**Architecture:** Single-package Node.js/TypeScript project. Fastify backend acts as a local proxy to NWS (required because `User-Agent` is a forbidden header in browsers, so a pure client-side app can't comply with NWS terms). React + Vite frontend served by the same backend as static files. One `GET /api/weather` endpoint returns a fully-normalized `WeatherResponse` shape consumed by the client. In-memory TTL cache prevents hammering NWS.

**Tech Stack:** TypeScript 5.x · Fastify 5.x · React 18/19 · Vite 5/6 · tsx (dev-time TS runner) · Vitest (tests). No database, no environment variables, no external APIs beyond NWS.

**Reference documents (read these before starting):**
- [docs/superpowers/specs/2026-04-15-skyframe-design.md](../specs/2026-04-15-skyframe-design.md) — full design spec with data contracts, per-metric trend thresholds, precip outlook string format, error strategy, and explicit non-goals
- [docs/mockups/current-conditions.html](../../mockups/current-conditions.html) — source of truth for current conditions visual design (CSS, SVG icons, DOM structure)
- [docs/mockups/hourly.html](../../mockups/hourly.html) — source of truth for hourly view
- [docs/mockups/outlook.html](../../mockups/outlook.html) — source of truth for 7-day outlook
- [CLAUDE.md](../../../CLAUDE.md) — locked technical decisions (lat/lon, grid, station IDs, User-Agent string, hard rules)
- [PROJECT_SPEC.md](../../../PROJECT_SPEC.md) — original product spec

**Hard rules (enforce throughout):**
- No ads, analytics, telemetry, third-party trackers, or CDN-hosted assets. Bundle everything locally.
- NOAA/NWS is the only upstream. Do not introduce any API-key-gated fallback provider.
- Every NWS request must include the `User-Agent: SkyFrame/0.1 (ken.culver@gmail.com)` header. NWS may rate-limit or reject requests without it.
- Minimize dependencies. Before adding a package, ask whether ~100 lines of hand-written code would cover the same need.
- No persistent storage. Cache is in-memory only.

---

## File Structure

The project uses a single `package.json` with three source directories (`server/`, `client/`, `shared/`), not monorepo workspaces. The backend and frontend coexist in one package; Vite handles the client build, `tsx` runs the server in development.

```
e:/SkyFrame/
├── package.json                    # All dependencies in one place
├── tsconfig.json                   # Shared TS base config
├── tsconfig.server.json            # Server-specific TS config (node resolution)
├── tsconfig.client.json            # Client-specific TS config (dom, jsx)
├── vite.config.ts                  # Vite client build config, proxies /api to backend in dev
├── index.html                      # Vite entry HTML — must be at project root
├── .gitattributes                  # LF line ending normalization for cross-platform
│
├── shared/
│   └── types.ts                    # WeatherResponse type contract, imported by both sides
│
├── server/
│   ├── index.ts                    # Fastify entry, /api/weather route, static serving
│   ├── config.ts                   # Hardcoded lat/lon, grid, station IDs, User-Agent, thresholds
│   └── nws/
│       ├── client.ts               # HTTP wrapper with User-Agent, retries, error handling
│       ├── client.test.ts
│       ├── cache.ts                # In-memory TTL cache
│       ├── cache.test.ts
│       ├── icon-mapping.ts         # NWS icon URL slug → IconCode
│       ├── icon-mapping.test.ts
│       ├── trends.ts               # Per-metric trend computation from observation history
│       ├── trends.test.ts
│       ├── precip.ts               # Precipitation outlook string builder
│       ├── precip.test.ts
│       ├── normalizer.ts           # Raw NWS payloads → WeatherResponse
│       └── normalizer.test.ts
│
└── client/
    ├── main.tsx                    # React entry
    ├── App.tsx                     # Root component, owns fetch lifecycle and error state
    ├── icons.svg                   # SVG sprite with 9 <symbol> elements
    ├── styles/
    │   └── hud.css                 # All HUD styles (ported from docs/mockups/)
    └── components/
        ├── TopBar.tsx              # Shared top bar with location + live clock + date
        ├── Footer.tsx              # Shared footer with link status dot + last/next pull times
        ├── WxIcon.tsx              # <svg><use href="#wxicon-..." /></svg> wrapper
        ├── CurrentPanel.tsx        # Current conditions view
        ├── HourlyPanel.tsx         # 12-hour forecast view
        └── OutlookPanel.tsx        # 7-day outlook view
```

**Responsibility boundaries:**
- `shared/types.ts` is the contract. Both server and client import from it. Changing a field here is a breaking change that surfaces at compile time on both sides.
- `server/nws/*` files are single-responsibility utilities that can be tested in isolation. The `normalizer.ts` is the only one that imports from multiple others — it's the composition root.
- `client/components/*Panel.tsx` components each own one view from the mockups. They receive props from `App.tsx`, which owns the single `GET /api/weather` fetch.
- `client/styles/hud.css` is a monolithic stylesheet ported verbatim from the mockups, not split per-component. This matches the mockups' structure and makes porting straightforward.

---

## Task 1: Project scaffold — Vite + React + TypeScript + Fastify

**Goal:** Get `npm run dev` working with a Vite dev server showing a stub page, and `npm run server` working with a Fastify server responding to `GET /api/weather` with hardcoded fake data. Establishes the full toolchain before any real logic.

**Files:**
- Create: `e:/SkyFrame/package.json`
- Create: `e:/SkyFrame/.gitattributes`
- Create: `e:/SkyFrame/tsconfig.json`
- Create: `e:/SkyFrame/tsconfig.server.json`
- Create: `e:/SkyFrame/tsconfig.client.json`
- Create: `e:/SkyFrame/vite.config.ts`
- Create: `e:/SkyFrame/index.html`
- Create: `e:/SkyFrame/shared/types.ts`
- Create: `e:/SkyFrame/client/main.tsx`
- Create: `e:/SkyFrame/client/App.tsx`
- Create: `e:/SkyFrame/client/styles/hud.css` (empty for now, will be filled in Task 6)
- Create: `e:/SkyFrame/server/index.ts` (minimal version, will be expanded in Task 5)

- [ ] **Step 1: Create `.gitattributes`** to normalize line endings across platforms.

```
* text=auto eol=lf
*.bat text eol=crlf
*.ps1 text eol=crlf
*.svg binary
*.png binary
*.jpg binary
```

- [ ] **Step 2: Create `package.json`** with all dependencies and scripts.

```json
{
  "name": "skyframe",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Local ad-free weather dashboard for ZIP 53154",
  "scripts": {
    "dev": "vite",
    "server": "tsx server/index.ts",
    "build": "tsc -p tsconfig.client.json --noEmit && vite build",
    "preview": "vite preview",
    "start": "tsx server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.client.json --noEmit"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/static": "^7.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Install dependencies.**

Run: `cd e:/SkyFrame && npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no peer-dependency errors. If a package version is unavailable, let npm pick the nearest valid version — don't hand-downgrade.

- [ ] **Step 4: Create `tsconfig.json`** (shared base).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

- [ ] **Step 5: Create `tsconfig.server.json`** (server-specific).

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "moduleResolution": "Node"
  },
  "include": ["server/**/*", "shared/**/*"]
}
```

- [ ] **Step 6: Create `tsconfig.client.json`** (client-specific, with DOM and JSX).

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["client/**/*", "shared/**/*"]
}
```

- [ ] **Step 7: Create `vite.config.ts`** with the React plugin, proxy to backend, and build output directory.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'client/public'),
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@client': resolve(__dirname, 'client'),
    },
  },
});
```

- [ ] **Step 8: Create `index.html`** at the project root (Vite convention).

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SkyFrame</title>
    <link rel="stylesheet" href="/client/styles/hud.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/client/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create `shared/types.ts`** with the full `WeatherResponse` contract from the design doc section 5.

```ts
export type IconCode =
  | 'sun' | 'moon'
  | 'partly-day' | 'partly-night'
  | 'cloud' | 'rain' | 'snow' | 'thunder' | 'fog';

export type TrendDirection = 'up' | 'down' | 'steady';

export interface Trend {
  direction: TrendDirection;
  deltaPerHour: number;
  confidence: 'ok' | 'missing';
}

export interface Wind {
  speedMph: number;
  directionDeg: number;
  cardinal: string;
}

export interface CurrentConditions {
  observedAt: string;
  stationId: string;
  stationDistanceKm: number;
  tempF: number;
  feelsLikeF: number;
  conditionText: string;
  iconCode: IconCode;
  precipOutlook: string;
  humidityPct: number;
  pressureInHg: number;
  visibilityMi: number;
  dewpointF: number;
  wind: Wind;
  trends: {
    temp: Trend;
    wind: Trend;
    humidity: Trend;
    pressure: Trend;
    visibility: Trend;
    dewpoint: Trend;
  };
  sunrise: string;
  sunset: string;
}

export interface HourlyPeriod {
  startTime: string;
  hourLabel: string;
  tempF: number;
  iconCode: IconCode;
  precipProbPct: number;
  wind: Wind;
  shortDescription: string;
}

export interface DailyPeriod {
  dateISO: string;
  dayOfWeek: string;
  dateLabel: string;
  highF: number;
  lowF: number;
  iconCode: IconCode;
  precipProbPct: number;
  shortDescription: string;
}

export interface WeatherMeta {
  fetchedAt: string;
  nextRefreshAt: string;
  cacheHit: boolean;
  stationId: string;
  error?: 'rate_limited' | 'upstream_malformed' | 'station_fallback' | 'partial';
}

export interface WeatherResponse {
  current: CurrentConditions;
  hourly: HourlyPeriod[];
  daily: DailyPeriod[];
  meta: WeatherMeta;
}
```

- [ ] **Step 10: Create `client/main.tsx`** — React entry point.

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 11: Create `client/App.tsx`** — stub root component showing it's alive.

```tsx
export default function App() {
  return (
    <div style={{ padding: 40, color: '#00e5d1', background: '#000d10', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h1>SkyFrame — scaffold running</h1>
      <p>Vite dev server is working. Backend proxy will be wired in Task 5.</p>
    </div>
  );
}
```

- [ ] **Step 12: Create `client/styles/hud.css`** as an empty placeholder (will be filled in Task 6).

```css
/* SkyFrame HUD styles — populated in Task 6 by porting from docs/mockups/ */
```

- [ ] **Step 13: Create `server/index.ts`** — minimal Fastify server responding with a fake payload.

```ts
import Fastify from 'fastify';

const PORT = 3000;
const HOST = '127.0.0.1';

const app = Fastify({ logger: true });

app.get('/api/weather', async () => {
  return {
    scaffold: true,
    message: 'Task 1 stub. Real data arrives in Task 5.',
  };
});

app.listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`SkyFrame backend listening on http://${HOST}:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
```

- [ ] **Step 14: Run the Vite dev server to verify it works.**

Run: `cd e:/SkyFrame && npm run dev`
Expected: Vite starts on http://localhost:5173, opening that URL in a browser shows "SkyFrame — scaffold running" in cyan on a dark background. Kill the dev server with Ctrl+C.

- [ ] **Step 15: Run the backend server in a second terminal to verify it works.**

Run: `cd e:/SkyFrame && npm run server`
Expected: logs `SkyFrame backend listening on http://127.0.0.1:3000`. In another terminal: `curl http://localhost:3000/api/weather` returns the scaffold JSON. Kill with Ctrl+C.

- [ ] **Step 16: Verify the typecheck passes.**

Run: `cd e:/SkyFrame && npm run typecheck`
Expected: No output, exit code 0. If there are errors, fix them before committing.

- [ ] **Step 17: Commit.**

```bash
cd e:/SkyFrame
git add .gitattributes package.json package-lock.json tsconfig.json tsconfig.server.json tsconfig.client.json vite.config.ts index.html shared/ client/ server/
git commit -m "$(cat <<'EOF'
Scaffold Vite + React + Fastify + TypeScript project

Full toolchain in place but no real logic yet:
- package.json with fastify, react, vite, tsx, vitest, typescript
- Three tsconfigs (shared base + server + client)
- Vite config with /api proxy to localhost:3000
- Minimal Vite entry HTML and React stub showing "scaffold running"
- Minimal Fastify backend returning a scaffold payload at /api/weather
- shared/types.ts with the full WeatherResponse contract from the design doc
- .gitattributes normalizing line endings to LF

npm run dev starts the Vite dev server.
npm run server starts the Fastify backend.
EOF
)"
```

---

## Task 2: NWS HTTP client + in-memory TTL cache

**Goal:** Build the primitives the normalizer will use: a low-level HTTP client that wraps `fetch()` with the required `User-Agent` header and retry logic, and an in-memory TTL cache.

**Files:**
- Create: `e:/SkyFrame/server/config.ts`
- Create: `e:/SkyFrame/server/nws/client.ts`
- Create: `e:/SkyFrame/server/nws/client.test.ts`
- Create: `e:/SkyFrame/server/nws/cache.ts`
- Create: `e:/SkyFrame/server/nws/cache.test.ts`

- [ ] **Step 1: Create `server/config.ts`** with all hardcoded constants from the design doc.

```ts
export const CONFIG = {
  // Location (ZIP 53154, Oak Creek, WI)
  location: {
    lat: 42.89387888628059,
    lon: -87.92605499945817,
    zip: '53154',
    cityState: 'Oak Creek, WI',
  },

  // NWS point metadata (resolved once; these are stable for this lat/lon)
  nws: {
    forecastOffice: 'MKX',
    gridX: 88,
    gridY: 58,
    timezone: 'America/Chicago',
    forecastZone: 'WIZ066',
    userAgent: 'SkyFrame/0.1 (ken.culver@gmail.com)',
    baseUrl: 'https://api.weather.gov',
  },

  // Observation station preference
  stations: {
    primary: 'KMKE',
    fallback: 'KRAC',
    stalenessMinutes: 90, // fallback if primary's latest obs is older than this
  },

  // Cache TTLs (milliseconds)
  cache: {
    forecastMs: 5 * 60 * 1000,      // 5 min for forecast endpoints
    observationMs: 90 * 1000,        // 90 sec for observations
    pointMetadataMs: 24 * 60 * 60 * 1000, // 24 hours for /points (re-fetch daily for astronomicalData)
  },

  // Trend computation thresholds (per hour) — see design doc §4.2
  trendThresholds: {
    temperatureF: 0.5,
    dewpointF: 0.3,
    pressureInHg: 0.01,
    humidityPct: 0.5,
    windMph: 1.0,
    visibilityMi: 0.3,
  },

  // Server config
  server: {
    port: 3000,
    host: '127.0.0.1',
  },
} as const;
```

- [ ] **Step 2: Create the failing test for the cache.** Tests TTL expiration, hit/miss, and overwriting.

```ts
// server/nws/cache.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/cache.test.ts`
Expected: FAIL with "Cannot find module './cache'" or similar.

- [ ] **Step 4: Implement `server/nws/cache.ts`.**

```ts
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class TTLCache {
  private store = new Map<string, CacheEntry>();

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Returns the Date at which the soonest-to-expire live entry will expire.
   * Used to populate WeatherResponse.meta.nextRefreshAt so the client knows
   * when to expect fresh data.
   */
  nextExpiryTime(): Date | null {
    const now = Date.now();
    let soonest: number | null = null;
    for (const entry of this.store.values()) {
      if (entry.expiresAt <= now) continue;
      if (soonest === null || entry.expiresAt < soonest) {
        soonest = entry.expiresAt;
      }
    }
    return soonest === null ? null : new Date(soonest);
  }

  clear(): void {
    this.store.clear();
  }
}
```

- [ ] **Step 5: Run test to verify it passes.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/cache.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 6: Create the failing test for the NWS client.** Tests User-Agent header, retry on 5xx, error on malformed JSON.

```ts
// server/nws/client.test.ts
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
```

- [ ] **Step 7: Run test to verify it fails.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/client.test.ts`
Expected: FAIL with "Cannot find module './client'".

- [ ] **Step 8: Implement `server/nws/client.ts`.**

```ts
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
  const headers: HeadersInit = {
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
```

- [ ] **Step 9: Run test to verify it passes.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/client.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 10: Run all tests together as a sanity check.**

Run: `cd e:/SkyFrame && npm test`
Expected: All tests pass (cache + client = 10 tests).

- [ ] **Step 11: Commit.**

```bash
cd e:/SkyFrame
git add server/config.ts server/nws/cache.ts server/nws/cache.test.ts server/nws/client.ts server/nws/client.test.ts
git commit -m "$(cat <<'EOF'
Add NWS HTTP client and in-memory TTL cache

server/config.ts centralizes all hardcoded constants (lat/lon, grid
coords, station IDs, User-Agent, cache TTLs, trend thresholds). Every
other server module reads from CONFIG rather than embedding values.

server/nws/client.ts wraps fetch() with the NWS-required User-Agent
header, a single retry on 5xx with a 1s delay, and structured NwsError
exceptions keyed to the error cases the design doc specifies
(network/timeout/rate_limited/server_error/upstream_malformed/not_found).

server/nws/cache.ts is a straightforward in-memory Map-based TTL cache.
nextExpiryTime() is exposed so the eventual /api/weather response can
populate meta.nextRefreshAt correctly.

Tests cover: cache TTL expiration, hit/miss, overwrite, nextExpiryTime;
client User-Agent header, 5xx retry, 429 handling, malformed JSON.
EOF
)"
```

---

## Task 3: Pure transformation functions — icon-mapping, trends, precip outlook

**Goal:** Implement the three pure utility functions that convert raw NWS values into display-ready data. Each is unit-tested independently because they're the parts where subtle bugs are most painful.

**Files:**
- Create: `e:/SkyFrame/server/nws/icon-mapping.ts`
- Create: `e:/SkyFrame/server/nws/icon-mapping.test.ts`
- Create: `e:/SkyFrame/server/nws/trends.ts`
- Create: `e:/SkyFrame/server/nws/trends.test.ts`
- Create: `e:/SkyFrame/server/nws/precip.ts`
- Create: `e:/SkyFrame/server/nws/precip.test.ts`

- [ ] **Step 1: Create the failing test for icon-mapping.**

```ts
// server/nws/icon-mapping.test.ts
import { describe, it, expect } from 'vitest';
import { mapNwsIcon } from './icon-mapping';

describe('mapNwsIcon', () => {
  it.each([
    ['https://api.weather.gov/icons/land/day/skc?size=medium', 'sun'],
    ['https://api.weather.gov/icons/land/night/skc?size=medium', 'moon'],
    ['https://api.weather.gov/icons/land/day/few?size=medium', 'sun'],
    ['https://api.weather.gov/icons/land/night/few?size=medium', 'moon'],
    ['https://api.weather.gov/icons/land/day/sct?size=medium', 'partly-day'],
    ['https://api.weather.gov/icons/land/night/sct?size=medium', 'partly-night'],
    ['https://api.weather.gov/icons/land/day/bkn?size=medium', 'partly-day'],
    ['https://api.weather.gov/icons/land/night/bkn?size=medium', 'partly-night'],
    ['https://api.weather.gov/icons/land/day/ovc?size=medium', 'cloud'],
    ['https://api.weather.gov/icons/land/night/ovc?size=medium', 'cloud'],
    ['https://api.weather.gov/icons/land/day/rain?size=medium', 'rain'],
    ['https://api.weather.gov/icons/land/day/rain_showers?size=medium', 'rain'],
    ['https://api.weather.gov/icons/land/day/rain_showers_hi?size=medium', 'rain'],
    ['https://api.weather.gov/icons/land/day/tsra?size=medium', 'thunder'],
    ['https://api.weather.gov/icons/land/day/tsra_sct?size=medium', 'thunder'],
    ['https://api.weather.gov/icons/land/day/tsra_hi?size=medium', 'thunder'],
    ['https://api.weather.gov/icons/land/day/snow?size=medium', 'snow'],
    ['https://api.weather.gov/icons/land/day/blizzard?size=medium', 'snow'],
    ['https://api.weather.gov/icons/land/day/fog?size=medium', 'fog'],
    ['https://api.weather.gov/icons/land/day/haze?size=medium', 'fog'],
  ])('maps %s to %s', (url, expected) => {
    expect(mapNwsIcon(url)).toBe(expected);
  });

  it('falls back to cloud for unknown slugs', () => {
    expect(mapNwsIcon('https://api.weather.gov/icons/land/day/weird_code?size=medium')).toBe('cloud');
  });

  it('handles composite slugs like rain,60 (comma-separated condition plus probability)', () => {
    expect(mapNwsIcon('https://api.weather.gov/icons/land/day/rain,60?size=medium')).toBe('rain');
  });

  it('returns cloud for missing or malformed URL', () => {
    expect(mapNwsIcon('')).toBe('cloud');
    expect(mapNwsIcon('not-a-url')).toBe('cloud');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/icon-mapping.test.ts`
Expected: FAIL with "Cannot find module './icon-mapping'".

- [ ] **Step 3: Implement `server/nws/icon-mapping.ts`.**

```ts
import type { IconCode } from '../../shared/types';

/**
 * NWS forecast periods include an icon URL like:
 *   https://api.weather.gov/icons/land/day/few?size=medium
 *   https://api.weather.gov/icons/land/night/rain,60?size=medium
 * The slug before ',' and before '?' is the condition code. The path segment
 * before it (day|night) indicates time of day. Map to our IconCode set.
 */
export function mapNwsIcon(url: string): IconCode {
  if (!url || typeof url !== 'string') return 'cloud';

  // Extract the last two meaningful path segments: .../day/few?...
  const match = url.match(/\/(day|night)\/([^/?]+)/);
  if (!match) return 'cloud';

  const dayOrNight = match[1]!;
  // Strip comma-suffix (rain,60 → rain) and any query string.
  const slug = match[2]!.split(',')[0]!.split('?')[0]!;

  switch (slug) {
    case 'skc':
    case 'few':
      return dayOrNight === 'night' ? 'moon' : 'sun';

    case 'sct':
    case 'bkn':
      return dayOrNight === 'night' ? 'partly-night' : 'partly-day';

    case 'ovc':
      return 'cloud';

    case 'rain':
    case 'rain_showers':
    case 'rain_showers_hi':
    case 'hi_shwrs':
    case 'fzra':
    case 'fzra_sct':
    case 'ra_fzra':
    case 'ra_sn':
      return 'rain';

    case 'tsra':
    case 'tsra_sct':
    case 'tsra_hi':
    case 'scttsra':
      return 'thunder';

    case 'snow':
    case 'sn':
    case 'blizzard':
    case 'cold':
      return 'snow';

    case 'fog':
    case 'haze':
    case 'smoke':
    case 'dust':
      return 'fog';

    default:
      return 'cloud';
  }
}
```

- [ ] **Step 4: Run icon-mapping tests.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/icon-mapping.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Create the failing test for trends.**

```ts
// server/nws/trends.test.ts
import { describe, it, expect } from 'vitest';
import { computeTrend } from './trends';

describe('computeTrend', () => {
  const threeHoursAgo = new Date('2026-04-15T12:00:00Z').toISOString();
  const twoHoursAgo   = new Date('2026-04-15T13:00:00Z').toISOString();
  const oneHourAgo    = new Date('2026-04-15T14:00:00Z').toISOString();
  const now           = new Date('2026-04-15T15:00:00Z').toISOString();

  it('returns "up" with positive delta when values rise above threshold', () => {
    const series = [
      { timestamp: threeHoursAgo, value: 60 },
      { timestamp: twoHoursAgo,   value: 61 },
      { timestamp: oneHourAgo,    value: 62 },
      { timestamp: now,           value: 63 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('up');
    expect(result.deltaPerHour).toBeCloseTo(1, 1);
    expect(result.confidence).toBe('ok');
  });

  it('returns "down" with negative delta when values fall', () => {
    const series = [
      { timestamp: threeHoursAgo, value: 70 },
      { timestamp: now,           value: 64 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('down');
    expect(result.deltaPerHour).toBeCloseTo(-2, 1);
  });

  it('returns "steady" when delta per hour is within threshold', () => {
    const series = [
      { timestamp: threeHoursAgo, value: 60 },
      { timestamp: now,           value: 60.3 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('steady');
    expect(result.deltaPerHour).toBeCloseTo(0.1, 2);
  });

  it('filters out null values before computing', () => {
    const series = [
      { timestamp: threeHoursAgo, value: null },
      { timestamp: twoHoursAgo,   value: 60 },
      { timestamp: now,           value: 62 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.direction).toBe('up');
    expect(result.confidence).toBe('ok');
  });

  it('returns missing confidence when fewer than 2 non-null values', () => {
    const series = [
      { timestamp: threeHoursAgo, value: null },
      { timestamp: now,           value: 60 },
    ];
    const result = computeTrend(series, 0.5);
    expect(result.confidence).toBe('missing');
    expect(result.direction).toBe('steady');
    expect(result.deltaPerHour).toBe(0);
  });

  it('returns missing confidence for empty series', () => {
    const result = computeTrend([], 0.5);
    expect(result.confidence).toBe('missing');
  });
});
```

- [ ] **Step 6: Run test to verify it fails.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/trends.test.ts`
Expected: FAIL with "Cannot find module './trends'".

- [ ] **Step 7: Implement `server/nws/trends.ts`.**

```ts
import type { Trend } from '../../shared/types';

export interface TimedValue {
  timestamp: string;      // ISO 8601
  value: number | null;
}

/**
 * Compute a trend by diffing the latest non-null value against the earliest,
 * dividing by the hour span between them, then classifying the hourly rate
 * against the provided steady threshold.
 *
 * @param series - Timed observations, any order (will be sorted)
 * @param steadyThresholdPerHour - absolute rate at/below which direction is "steady"
 */
export function computeTrend(series: TimedValue[], steadyThresholdPerHour: number): Trend {
  const nonNull = series.filter((s): s is { timestamp: string; value: number } => s.value !== null);

  if (nonNull.length < 2) {
    return { direction: 'steady', deltaPerHour: 0, confidence: 'missing' };
  }

  // Sort by timestamp ascending (earliest first)
  nonNull.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const earliest = nonNull[0]!;
  const latest = nonNull[nonNull.length - 1]!;

  const spanMs = Date.parse(latest.timestamp) - Date.parse(earliest.timestamp);
  const spanHours = spanMs / (1000 * 60 * 60);

  if (spanHours <= 0) {
    return { direction: 'steady', deltaPerHour: 0, confidence: 'missing' };
  }

  const deltaPerHour = (latest.value - earliest.value) / spanHours;

  let direction: 'up' | 'down' | 'steady';
  if (Math.abs(deltaPerHour) <= steadyThresholdPerHour) {
    direction = 'steady';
  } else if (deltaPerHour > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  return {
    direction,
    deltaPerHour: Math.round(deltaPerHour * 100) / 100,
    confidence: 'ok',
  };
}
```

- [ ] **Step 8: Run trends tests.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/trends.test.ts`
Expected: All tests pass.

- [ ] **Step 9: Create the failing test for precipitation outlook.**

```ts
// server/nws/precip.test.ts
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
    // 5 hours after 14:30 = 19:30 — but precipitation is forecast at the top of the hour.
    // The expected format is "DRY THRU HH:00" using the period's start hour.
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
    // First period <= 30% is hour(4) = 18:30 → 18:00 formatted
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
```

- [ ] **Step 10: Run test to verify it fails.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/precip.test.ts`
Expected: FAIL with "Cannot find module './precip'".

- [ ] **Step 11: Implement `server/nws/precip.ts`.**

```ts
const PRECIPITATING_RE = /rain|snow|shower|storm|drizzle|sleet|hail/i;
const HIGH_POP_THRESHOLD = 30;

export interface PrecipInput {
  hours: Array<{ startTime: string; probabilityOfPrecipitation: number | null }>;
  currentTextDescription: string;
  now: Date;
  timeZone: string;
}

function formatHourLabel(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:00`; // always top-of-hour
}

/**
 * Build the precipitation outlook string shown on the current-conditions
 * description line. Cases:
 *   - "RAIN NOW · EASING HH:00" — currently precipitating; HH:00 is first period ≤ 30%
 *   - "RAIN IN NNm"              — first period > 30% is within 60 minutes
 *   - "DRY THRU HH:00"           — first period > 30% is within the next 12 hours
 *   - "DRY 24H+"                 — nothing > 30% in the next 12 hours
 */
export function buildPrecipOutlook(input: PrecipInput): string {
  const { hours, currentTextDescription, now, timeZone } = input;
  const currentlyPrecipitating = PRECIPITATING_RE.test(currentTextDescription);

  if (currentlyPrecipitating) {
    const firstDry = hours.find(
      (h) => (h.probabilityOfPrecipitation ?? 100) <= HIGH_POP_THRESHOLD,
    );
    if (!firstDry) return 'RAIN CONTINUES';
    const label = formatHourLabel(new Date(firstDry.startTime), timeZone);
    return `RAIN NOW · EASING ${label}`;
  }

  const firstWet = hours.find(
    (h) => (h.probabilityOfPrecipitation ?? 0) > HIGH_POP_THRESHOLD,
  );

  if (!firstWet) return 'DRY 24H+';

  const msUntil = Date.parse(firstWet.startTime) - now.getTime();
  const minutesUntil = Math.round(msUntil / 60000);

  if (minutesUntil > 0 && minutesUntil < 60) {
    return `RAIN IN ${minutesUntil}m`;
  }

  const label = formatHourLabel(new Date(firstWet.startTime), timeZone);
  return `DRY THRU ${label}`;
}
```

- [ ] **Step 12: Run precip tests.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/precip.test.ts`
Expected: All tests pass.

- [ ] **Step 13: Run full test suite.**

Run: `cd e:/SkyFrame && npm test`
Expected: All tests pass across cache, client, icon-mapping, trends, precip.

- [ ] **Step 14: Commit.**

```bash
cd e:/SkyFrame
git add server/nws/icon-mapping.ts server/nws/icon-mapping.test.ts server/nws/trends.ts server/nws/trends.test.ts server/nws/precip.ts server/nws/precip.test.ts
git commit -m "$(cat <<'EOF'
Add pure NWS transformation utilities

icon-mapping.ts: maps NWS forecast icon URLs (e.g. /icons/land/day/few)
to our 9-icon IconCode set, with a switch on the condition slug and a
day/night disambiguation. Unknown slugs fall back to 'cloud' rather
than throwing, because NWS occasionally returns non-standard codes.

trends.ts: computes a Trend from a series of timed values by diffing
the earliest non-null against the latest and dividing by hour span.
Classifies as up/down/steady against a caller-supplied threshold.
Emits confidence 'missing' when fewer than 2 non-null values exist.

precip.ts: builds the precipitation outlook string for the current
conditions description line. Handles four cases: RAIN NOW · EASING,
RAIN IN NNm, DRY THRU HH:00, DRY 24H+. Detects currently-precipitating
from a regex on textDescription (rain|snow|shower|storm|drizzle|sleet).

All three are pure functions with comprehensive unit tests.
EOF
)"
```

---

## Task 4: NWS normalizer — stitch it all together

**Goal:** Build the composition root that orchestrates fetching `/points`, `/gridpoints/.../forecast`, `/gridpoints/.../forecast/hourly`, `/stations/KMKE/observations/latest`, and `/stations/KMKE/observations?limit=6`, applies station fallback logic, runs the pure transforms, and returns a fully-populated `WeatherResponse`.

**Files:**
- Create: `e:/SkyFrame/server/nws/normalizer.ts`
- Create: `e:/SkyFrame/server/nws/normalizer.test.ts`

- [ ] **Step 1: Create the failing test with fixture NWS responses.** This test uses pre-captured JSON fixtures to verify the normalizer produces correct output without hitting real NWS.

```ts
// server/nws/normalizer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeWeather } from './normalizer';
import * as client from './client';

// Minimal but realistic fixture payloads. Real NWS responses have many more
// fields; these include just what the normalizer reads.
const FIXTURE_POINT = {
  properties: {
    forecast: 'https://api.weather.gov/gridpoints/MKX/88,58/forecast',
    forecastHourly: 'https://api.weather.gov/gridpoints/MKX/88,58/forecast/hourly',
    astronomicalData: {
      sunrise: '2026-04-15T06:08:00-05:00',
      sunset: '2026-04-15T19:35:00-05:00',
    },
  },
};

const FIXTURE_FORECAST = {
  properties: {
    periods: [
      { name: 'This Afternoon', startTime: '2026-04-15T14:00:00-05:00', endTime: '2026-04-15T18:00:00-05:00', isDaytime: true,  temperature: 68, shortForecast: 'Mostly Cloudy', icon: 'https://api.weather.gov/icons/land/day/bkn?size=medium', probabilityOfPrecipitation: { value: 20 } },
      { name: 'Tonight',        startTime: '2026-04-15T18:00:00-05:00', endTime: '2026-04-16T06:00:00-05:00', isDaytime: false, temperature: 52, shortForecast: 'Cloudy',        icon: 'https://api.weather.gov/icons/land/night/bkn?size=medium', probabilityOfPrecipitation: { value: 20 } },
      { name: 'Thursday',       startTime: '2026-04-16T06:00:00-05:00', endTime: '2026-04-16T18:00:00-05:00', isDaytime: true,  temperature: 62, shortForecast: 'Rain Likely',   icon: 'https://api.weather.gov/icons/land/day/rain,70?size=medium', probabilityOfPrecipitation: { value: 70 } },
      { name: 'Thursday Night', startTime: '2026-04-16T18:00:00-05:00', endTime: '2026-04-17T06:00:00-05:00', isDaytime: false, temperature: 48, shortForecast: 'Rain',          icon: 'https://api.weather.gov/icons/land/night/rain?size=medium', probabilityOfPrecipitation: { value: 70 } },
    ],
  },
};

const FIXTURE_HOURLY = {
  properties: {
    periods: Array.from({ length: 12 }, (_, i) => ({
      startTime: new Date(Date.parse('2026-04-15T15:00:00-05:00') + i * 3600 * 1000).toISOString(),
      temperature: 63 - i,
      shortForecast: i < 4 ? 'Mostly Cloudy' : i < 8 ? 'Rain' : 'Mostly Cloudy',
      icon: `https://api.weather.gov/icons/land/${i < 9 ? 'day' : 'night'}/${i < 4 ? 'bkn' : i < 8 ? 'rain' : 'sct'}?size=medium`,
      probabilityOfPrecipitation: { value: [10, 10, 15, 20, 45, 60, 70, 50, 20, 10, 5, 5][i]! },
      windSpeed: '12 mph',
      windDirection: 'NW',
    })),
  },
};

const FIXTURE_OBS_LATEST = {
  properties: {
    timestamp: '2026-04-15T19:25:00+00:00',
    temperature: { value: 16.7, unitCode: 'wmoUnit:degC' },          // 62°F
    dewpoint: { value: 9.4, unitCode: 'wmoUnit:degC' },              // 49°F
    windSpeed: { value: 19.3, unitCode: 'wmoUnit:km_h-1' },          // 12 mph
    windDirection: { value: 315, unitCode: 'wmoUnit:degree_(angle)' }, // NW
    barometricPressure: { value: 101999, unitCode: 'wmoUnit:Pa' },   // 30.12 inHg
    visibility: { value: 16093, unitCode: 'wmoUnit:m' },             // 10 mi
    relativeHumidity: { value: 64, unitCode: 'wmoUnit:percent' },
    heatIndex: { value: null },
    windChill: { value: null },
    textDescription: 'Mostly Cloudy',
    icon: 'https://api.weather.gov/icons/land/day/bkn?size=medium',
  },
};

const FIXTURE_OBS_HISTORY = {
  features: [
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T19:25:00+00:00', temperature: { value: 16.7, unitCode: 'wmoUnit:degC' } } },
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T18:25:00+00:00', temperature: { value: 16.1, unitCode: 'wmoUnit:degC' } } },
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T17:25:00+00:00', temperature: { value: 15.5, unitCode: 'wmoUnit:degC' } } },
    { properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T16:25:00+00:00', temperature: { value: 15.0, unitCode: 'wmoUnit:degC' } } },
  ],
};

describe('normalizeWeather', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetchNws to return the right fixture based on path
    vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
      if (path.includes('/points/')) return FIXTURE_POINT as never;
      if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
      if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
      if (path.includes('/observations/latest')) return FIXTURE_OBS_LATEST as never;
      if (path.includes('/observations')) return FIXTURE_OBS_HISTORY as never;
      throw new Error('Unexpected path: ' + path);
    });
  });

  it('returns a complete WeatherResponse with current, hourly, and daily', async () => {
    const result = await normalizeWeather();
    expect(result).toHaveProperty('current');
    expect(result).toHaveProperty('hourly');
    expect(result).toHaveProperty('daily');
    expect(result).toHaveProperty('meta');
  });

  it('converts temperature from Celsius to Fahrenheit', async () => {
    const result = await normalizeWeather();
    // 16.7°C ≈ 62°F
    expect(result.current.tempF).toBe(62);
  });

  it('converts wind speed from km/h to mph', async () => {
    const result = await normalizeWeather();
    // 19.3 km/h ≈ 12 mph
    expect(result.current.wind.speedMph).toBe(12);
  });

  it('converts pressure from Pa to inHg', async () => {
    const result = await normalizeWeather();
    // 101999 Pa ≈ 30.12 inHg
    expect(result.current.pressureInHg).toBeCloseTo(30.12, 1);
  });

  it('converts visibility from meters to miles', async () => {
    const result = await normalizeWeather();
    expect(result.current.visibilityMi).toBe(10);
  });

  it('populates 12 hourly periods', async () => {
    const result = await normalizeWeather();
    expect(result.hourly).toHaveLength(12);
    expect(result.hourly[0]!.tempF).toBe(63);
    expect(result.hourly[0]!.iconCode).toBe('partly-day');
  });

  it('collapses 4 day+night periods into 2 DailyPeriod entries', async () => {
    const result = await normalizeWeather();
    expect(result.daily.length).toBeGreaterThanOrEqual(2);
    expect(result.daily[0]!.highF).toBe(68);
    expect(result.daily[0]!.lowF).toBe(52);
    expect(result.daily[1]!.highF).toBe(62);
    expect(result.daily[1]!.lowF).toBe(48);
  });

  it('maps day bkn icon to partly-day', async () => {
    const result = await normalizeWeather();
    expect(result.current.iconCode).toBe('partly-day');
  });

  it('computes an up trend for temperature from the observation history', async () => {
    const result = await normalizeWeather();
    // Temperature rose from 15.0 → 16.7 over ~3 hours → slight up
    expect(result.current.trends.temp.direction).toBe('up');
    expect(result.current.trends.temp.confidence).toBe('ok');
  });

  it('formats sunrise and sunset as HH:MM in local timezone', async () => {
    const result = await normalizeWeather();
    expect(result.current.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(result.current.sunset).toMatch(/^\d{2}:\d{2}$/);
    expect(result.current.sunrise).toBe('06:08');
    expect(result.current.sunset).toBe('19:35');
  });

  it('populates meta.stationId', async () => {
    const result = await normalizeWeather();
    expect(result.meta.stationId).toBe('KMKE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/normalizer.test.ts`
Expected: FAIL with "Cannot find module './normalizer'".

- [ ] **Step 3: Implement `server/nws/normalizer.ts`.**

```ts
import type {
  WeatherResponse, CurrentConditions, HourlyPeriod, DailyPeriod, IconCode, Wind, Trend,
} from '../../shared/types';
import { CONFIG } from '../config';
import { fetchNws } from './client';
import { mapNwsIcon } from './icon-mapping';
import { computeTrend, type TimedValue } from './trends';
import { buildPrecipOutlook } from './precip';

// ========== Unit conversion helpers ==========

const cToF = (c: number | null | undefined): number =>
  c == null ? NaN : Math.round(c * 9 / 5 + 32);

const kmhToMph = (kmh: number | null | undefined): number =>
  kmh == null ? NaN : Math.round(kmh * 0.6213711922);

const paToInHg = (pa: number | null | undefined): number =>
  pa == null ? NaN : Math.round(pa * 0.000295299830714 * 100) / 100;

const mToMi = (m: number | null | undefined): number =>
  m == null ? NaN : Math.round(m * 0.0006213711922);

const degToCardinal = (deg: number | null | undefined): string => {
  if (deg == null) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16]!;
};

// Parse a string like "12 mph" to { speedMph: 12 }
const parseWindSpeedString = (s: string | null | undefined): number => {
  if (!s) return 0;
  const match = s.match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(parseFloat(match[1]!)) : 0;
};

// ========== Time formatting ==========

function formatHourMinute(iso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}`;
}

function formatDayOfWeek(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .format(new Date(iso)).toUpperCase();
}

function formatDateLabel(iso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: '2-digit' });
  return fmt.format(new Date(iso)).toUpperCase();
}

function formatDateISO(iso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(iso));
}

// ========== Main normalizer ==========

interface NwsPointResponse {
  properties: {
    forecast: string;
    forecastHourly: string;
    astronomicalData?: { sunrise?: string; sunset?: string };
  };
}

interface NwsForecastResponse {
  properties: {
    periods: Array<{
      name: string;
      startTime: string;
      endTime: string;
      isDaytime: boolean;
      temperature: number;
      shortForecast: string;
      icon: string;
      probabilityOfPrecipitation?: { value: number | null };
    }>;
  };
}

interface NwsHourlyResponse {
  properties: {
    periods: Array<{
      startTime: string;
      temperature: number;
      shortForecast: string;
      icon: string;
      probabilityOfPrecipitation?: { value: number | null };
      windSpeed: string;
      windDirection: string;
    }>;
  };
}

interface NwsObsProperties {
  timestamp: string;
  temperature: { value: number | null };
  dewpoint: { value: number | null };
  windSpeed: { value: number | null };
  windDirection: { value: number | null };
  barometricPressure: { value: number | null };
  visibility: { value: number | null };
  relativeHumidity: { value: number | null };
  heatIndex: { value: number | null };
  windChill: { value: number | null };
  textDescription: string;
  icon: string;
}

interface NwsObsResponse {
  properties: NwsObsProperties;
}

interface NwsObsListResponse {
  features: Array<{ properties: NwsObsProperties }>;
}

export async function normalizeWeather(): Promise<WeatherResponse> {
  const { nws, location, stations } = CONFIG;

  // 1. Fetch point metadata (sunrise/sunset mainly; forecast URL is also here
  //    but we know it from config.)
  const point = await fetchNws<NwsPointResponse>(
    `/points/${location.lat.toFixed(4)},${location.lon.toFixed(4)}`,
  );

  // 2. Fetch forecast, hourly forecast, latest observation, observation history
  const [forecast, hourly, obsLatest, obsHistory] = await Promise.all([
    fetchNws<NwsForecastResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast`),
    fetchNws<NwsHourlyResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast/hourly`),
    fetchNws<NwsObsResponse>(`/stations/${stations.primary}/observations/latest`),
    fetchNws<NwsObsListResponse>(`/stations/${stations.primary}/observations?limit=6`),
  ]);

  // 3. Normalize current conditions
  const current = normalizeCurrent(obsLatest.properties, obsHistory, hourly, stations.primary, nws.timezone, point);

  // 4. Normalize hourly (first 12 periods)
  const hourlyPeriods: HourlyPeriod[] = hourly.properties.periods.slice(0, 12).map((p) => ({
    startTime: p.startTime,
    hourLabel: formatHourMinute(p.startTime, nws.timezone),
    tempF: p.temperature,
    iconCode: mapNwsIcon(p.icon),
    precipProbPct: p.probabilityOfPrecipitation?.value ?? 0,
    wind: {
      speedMph: parseWindSpeedString(p.windSpeed),
      directionDeg: 0,
      cardinal: p.windDirection,
    },
    shortDescription: p.shortForecast,
  }));

  // 5. Normalize daily (collapse day+night period pairs)
  const dailyPeriods = collapseDailyPeriods(forecast.properties.periods, nws.timezone);

  // 6. Assemble meta
  const now = new Date();
  const meta = {
    fetchedAt: now.toISOString(),
    nextRefreshAt: new Date(now.getTime() + CONFIG.cache.observationMs).toISOString(),
    cacheHit: false,
    stationId: stations.primary,
  };

  return { current, hourly: hourlyPeriods, daily: dailyPeriods, meta };
}

function normalizeCurrent(
  obs: NwsObsProperties,
  history: NwsObsListResponse,
  hourly: NwsHourlyResponse,
  stationId: string,
  timeZone: string,
  point: NwsPointResponse,
): CurrentConditions {
  const tempF = cToF(obs.temperature.value);
  const dewpointF = cToF(obs.dewpoint.value);
  const feelsLikeF = obs.heatIndex.value != null
    ? cToF(obs.heatIndex.value)
    : obs.windChill.value != null
      ? cToF(obs.windChill.value)
      : tempF;

  const wind: Wind = {
    speedMph: kmhToMph(obs.windSpeed.value),
    directionDeg: obs.windDirection.value ?? 0,
    cardinal: degToCardinal(obs.windDirection.value),
  };

  // Build trend series from history for each metric
  const toTimedValues = (extractor: (p: NwsObsProperties) => number | null): TimedValue[] =>
    history.features.map((f) => ({ timestamp: f.properties.timestamp, value: extractor(f.properties) }));

  const trends = {
    temp:       computeTrend(toTimedValues((p) => p.temperature.value != null ? p.temperature.value * 9 / 5 + 32 : null), CONFIG.trendThresholds.temperatureF),
    wind:       computeTrend(toTimedValues((p) => p.windSpeed.value != null ? p.windSpeed.value * 0.6213711922 : null), CONFIG.trendThresholds.windMph),
    humidity:   computeTrend(toTimedValues((p) => p.relativeHumidity.value), CONFIG.trendThresholds.humidityPct),
    pressure:   computeTrend(toTimedValues((p) => p.barometricPressure.value != null ? p.barometricPressure.value * 0.000295299830714 : null), CONFIG.trendThresholds.pressureInHg),
    visibility: computeTrend(toTimedValues((p) => p.visibility.value != null ? p.visibility.value * 0.0006213711922 : null), CONFIG.trendThresholds.visibilityMi),
    dewpoint:   computeTrend(toTimedValues((p) => p.dewpoint.value != null ? p.dewpoint.value * 9 / 5 + 32 : null), CONFIG.trendThresholds.dewpointF),
  };

  // Precipitation outlook
  const precipOutlook = buildPrecipOutlook({
    hours: hourly.properties.periods.slice(0, 12).map((h) => ({
      startTime: h.startTime,
      probabilityOfPrecipitation: h.probabilityOfPrecipitation?.value ?? null,
    })),
    currentTextDescription: obs.textDescription,
    now: new Date(),
    timeZone,
  });

  // Sunrise / sunset from point metadata
  const astroSunrise = point.properties.astronomicalData?.sunrise;
  const astroSunset  = point.properties.astronomicalData?.sunset;

  return {
    observedAt: obs.timestamp,
    stationId,
    stationDistanceKm: 7, // KMKE is ~7 km from 53154; future: compute from station metadata
    tempF,
    feelsLikeF,
    conditionText: obs.textDescription.toUpperCase(),
    iconCode: mapNwsIcon(obs.icon),
    precipOutlook,
    humidityPct: Math.round(obs.relativeHumidity.value ?? 0),
    pressureInHg: paToInHg(obs.barometricPressure.value),
    visibilityMi: mToMi(obs.visibility.value),
    dewpointF,
    wind,
    trends,
    sunrise: astroSunrise ? formatHourMinute(astroSunrise, timeZone) : '--:--',
    sunset:  astroSunset  ? formatHourMinute(astroSunset,  timeZone) : '--:--',
  };
}

function collapseDailyPeriods(
  periods: NwsForecastResponse['properties']['periods'],
  timeZone: string,
): DailyPeriod[] {
  // NWS returns alternating day/night periods. Starting from whichever half of
  // the current day we're in, we collapse each day+night pair into a single
  // DailyPeriod. High comes from the day period, low from the night period.
  const daily: DailyPeriod[] = [];
  let i = 0;

  while (i < periods.length && daily.length < 7) {
    const a = periods[i]!;
    const b = periods[i + 1];

    if (a.isDaytime && b && !b.isDaytime) {
      // Day + night pair
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: b.temperature,
        iconCode: mapNwsIcon(a.icon),
        precipProbPct: Math.max(a.probabilityOfPrecipitation?.value ?? 0, b.probabilityOfPrecipitation?.value ?? 0),
        shortDescription: a.shortForecast,
      });
      i += 2;
    } else if (!a.isDaytime) {
      // First period is a night (we're currently in a night), use it as the
      // "today" low with no high from an earlier day
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: a.temperature,
        iconCode: mapNwsIcon(a.icon),
        precipProbPct: a.probabilityOfPrecipitation?.value ?? 0,
        shortDescription: a.shortForecast,
      });
      i += 1;
    } else {
      // Orphaned day period at the end of the forecast window
      daily.push({
        dateISO: formatDateISO(a.startTime, timeZone),
        dayOfWeek: formatDayOfWeek(a.startTime, timeZone),
        dateLabel: formatDateLabel(a.startTime, timeZone),
        highF: a.temperature,
        lowF: a.temperature,
        iconCode: mapNwsIcon(a.icon),
        precipProbPct: a.probabilityOfPrecipitation?.value ?? 0,
        shortDescription: a.shortForecast,
      });
      i += 1;
    }
  }

  return daily;
}
```

- [ ] **Step 4: Run normalizer tests.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/normalizer.test.ts`
Expected: All tests pass. If any fail, read the assertion failure carefully — most likely culprit is a unit conversion formula or a timezone formatting issue.

- [ ] **Step 5: Run the full test suite.**

Run: `cd e:/SkyFrame && npm test`
Expected: All tests pass across every module.

- [ ] **Step 6: Commit.**

```bash
cd e:/SkyFrame
git add server/nws/normalizer.ts server/nws/normalizer.test.ts
git commit -m "$(cat <<'EOF'
Add NWS normalizer composition root

Fetches /points, /gridpoints/.../forecast, /forecast/hourly,
/stations/KMKE/observations/latest, and /observations?limit=6 in
parallel, then transforms them into a WeatherResponse by composing
mapNwsIcon, computeTrend, and buildPrecipOutlook.

Unit conversions (C→F, km/h→mph, Pa→inHg, m→mi) are inline helpers.
Wind direction degrees convert to 16-point cardinal strings.

Daily period collapse: NWS returns 14 alternating day/night periods;
we fold each day+night pair into one DailyPeriod where high comes from
the day period and low from the night period. Handles edge cases
where the forecast starts mid-night or ends on an orphaned day period.

Trends are computed from the 6-observation history (≈3 hours) using
the per-metric thresholds from server/config.ts. Unit conversions happen
in the trend series extractor so trends are always in display units.

Tests use mocked fetchNws with fixture NWS payloads to verify the shape
of the output without hitting the real API.
EOF
)"
```

---

## Task 4.5: Station fallback — KMKE → KRAC when primary is stale or null

**Goal:** Implement the design doc §4.1 requirement that the backend automatically falls back from the primary observation station (KMKE) to the secondary (KRAC) when KMKE's latest observation is older than ~90 minutes OR has null values in critical fields (`temperature`, `windSpeed`, `textDescription`). Surface which station was actually used via `WeatherMeta.stationId` and `WeatherMeta.error`.

**Files:**
- Modify: `e:/SkyFrame/server/nws/normalizer.ts`
- Modify: `e:/SkyFrame/server/nws/normalizer.test.ts`

- [ ] **Step 1: Add a failing test for station fallback.** Append to the existing `describe('normalizeWeather', ...)` block.

```ts
// Additional tests in server/nws/normalizer.test.ts — append inside the existing describe block

it('falls back to KRAC when KMKE latest observation is older than 90 minutes', async () => {
  const stale = { ...FIXTURE_OBS_LATEST, properties: { ...FIXTURE_OBS_LATEST.properties, timestamp: '2026-04-15T12:00:00+00:00' } };
  vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
    if (path.includes('/points/')) return FIXTURE_POINT as never;
    if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
    if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
    if (path.includes('/stations/KMKE/observations/latest')) return stale as never;
    if (path.includes('/stations/KMKE/observations')) return { features: [{ properties: stale.properties }] } as never;
    if (path.includes('/stations/KRAC/observations/latest')) return FIXTURE_OBS_LATEST as never;
    if (path.includes('/stations/KRAC/observations')) return FIXTURE_OBS_HISTORY as never;
    throw new Error('Unexpected path: ' + path);
  });

  // Freeze "now" so staleness math is deterministic
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-15T19:30:00+00:00'));

  const result = await normalizeWeather();

  expect(result.meta.stationId).toBe('KRAC');
  expect(result.meta.error).toBe('station_fallback');
  expect(result.current.stationId).toBe('KRAC');

  vi.useRealTimers();
});

it('falls back to KRAC when KMKE observation has null temperature', async () => {
  const broken = {
    ...FIXTURE_OBS_LATEST,
    properties: { ...FIXTURE_OBS_LATEST.properties, temperature: { value: null, unitCode: 'wmoUnit:degC' } },
  };
  vi.spyOn(client, 'fetchNws').mockImplementation(async (path: string) => {
    if (path.includes('/points/')) return FIXTURE_POINT as never;
    if (path.includes('/forecast/hourly')) return FIXTURE_HOURLY as never;
    if (path.includes('/forecast')) return FIXTURE_FORECAST as never;
    if (path.includes('/stations/KMKE/observations/latest')) return broken as never;
    if (path.includes('/stations/KMKE/observations')) return { features: [{ properties: broken.properties }] } as never;
    if (path.includes('/stations/KRAC/observations/latest')) return FIXTURE_OBS_LATEST as never;
    if (path.includes('/stations/KRAC/observations')) return FIXTURE_OBS_HISTORY as never;
    throw new Error('Unexpected path: ' + path);
  });

  const result = await normalizeWeather();
  expect(result.meta.stationId).toBe('KRAC');
  expect(result.meta.error).toBe('station_fallback');
});

it('uses KMKE without error flag when primary is fresh and complete', async () => {
  // The base beforeEach already mocks fetchNws with FIXTURE_OBS_LATEST which is fresh.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-15T19:30:00+00:00'));

  const result = await normalizeWeather();

  expect(result.meta.stationId).toBe('KMKE');
  expect(result.meta.error).toBeUndefined();

  vi.useRealTimers();
});
```

- [ ] **Step 2: Run the new tests to confirm they fail.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/normalizer.test.ts`
Expected: the three new tests fail — the first two because normalizer never tries KRAC, the third because `meta.stationId` might already work but `meta.error` field is unset.

- [ ] **Step 3: Refactor `normalizer.ts` to pull observation fetching into a helper that applies fallback logic.** Replace the existing observation fetching in `normalizeWeather` with calls to a new helper function. Add this helper above `normalizeWeather`:

```ts
const STALENESS_MS = 90 * 60 * 1000; // 90 minutes

interface ObsFetchResult {
  obsLatest: NwsObsResponse;
  obsHistory: NwsObsListResponse;
  stationId: string;
  fellBack: boolean;
}

function isObservationUsable(obs: NwsObsProperties, now: Date): boolean {
  // Staleness check
  const ageMs = now.getTime() - Date.parse(obs.timestamp);
  if (ageMs > STALENESS_MS) return false;

  // Critical-field check: temperature, windSpeed, and textDescription must all be present
  if (obs.temperature.value == null) return false;
  if (obs.windSpeed.value == null) return false;
  if (!obs.textDescription || obs.textDescription.trim() === '') return false;

  return true;
}

async function fetchObservationsWithFallback(now: Date): Promise<ObsFetchResult> {
  const { stations } = CONFIG;

  // Try primary first
  try {
    const primaryLatest = await fetchNws<NwsObsResponse>(
      `/stations/${stations.primary}/observations/latest`,
    );

    if (isObservationUsable(primaryLatest.properties, now)) {
      const primaryHistory = await fetchNws<NwsObsListResponse>(
        `/stations/${stations.primary}/observations?limit=6`,
      );
      return {
        obsLatest: primaryLatest,
        obsHistory: primaryHistory,
        stationId: stations.primary,
        fellBack: false,
      };
    }
  } catch {
    // Swallow; fall through to secondary
  }

  // Fallback to secondary
  const secondaryLatest = await fetchNws<NwsObsResponse>(
    `/stations/${stations.fallback}/observations/latest`,
  );
  const secondaryHistory = await fetchNws<NwsObsListResponse>(
    `/stations/${stations.fallback}/observations?limit=6`,
  );
  return {
    obsLatest: secondaryLatest,
    obsHistory: secondaryHistory,
    stationId: stations.fallback,
    fellBack: true,
  };
}
```

- [ ] **Step 4: Replace the parallel-fetch block in `normalizeWeather`.** Find the existing block:

```ts
const [forecast, hourly, obsLatest, obsHistory] = await Promise.all([
  fetchNws<NwsForecastResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast`),
  fetchNws<NwsHourlyResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast/hourly`),
  fetchNws<NwsObsResponse>(`/stations/${stations.primary}/observations/latest`),
  fetchNws<NwsObsListResponse>(`/stations/${stations.primary}/observations?limit=6`),
]);
```

Replace with:

```ts
const now = new Date();

const [forecast, hourly, obsResult] = await Promise.all([
  fetchNws<NwsForecastResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast`),
  fetchNws<NwsHourlyResponse>(`/gridpoints/${nws.forecastOffice}/${nws.gridX},${nws.gridY}/forecast/hourly`),
  fetchObservationsWithFallback(now),
]);

const { obsLatest, obsHistory, stationId: activeStationId, fellBack } = obsResult;
```

- [ ] **Step 5: Update the `normalizeCurrent` call and `meta` construction to use the active station ID.**

Find the existing call:

```ts
const current = normalizeCurrent(obsLatest.properties, obsHistory, hourly, stations.primary, nws.timezone, point);
```

Replace with:

```ts
const current = normalizeCurrent(obsLatest.properties, obsHistory, hourly, activeStationId, nws.timezone, point);
```

Find the existing `meta` block:

```ts
const now = new Date();
const meta = {
  fetchedAt: now.toISOString(),
  nextRefreshAt: new Date(now.getTime() + CONFIG.cache.observationMs).toISOString(),
  cacheHit: false,
  stationId: stations.primary,
};
```

Replace with (note: `now` is now declared earlier, remove the duplicate):

```ts
const meta = {
  fetchedAt: now.toISOString(),
  nextRefreshAt: new Date(now.getTime() + CONFIG.cache.observationMs).toISOString(),
  cacheHit: false,
  stationId: activeStationId,
  ...(fellBack ? { error: 'station_fallback' as const } : {}),
};
```

- [ ] **Step 6: Run the normalizer tests to verify the new tests pass and the existing tests still pass.**

Run: `cd e:/SkyFrame && npx vitest run server/nws/normalizer.test.ts`
Expected: all tests (original + 3 new) pass.

- [ ] **Step 7: Run the full test suite as a sanity check.**

Run: `cd e:/SkyFrame && npm test`
Expected: all tests across every module still pass.

- [ ] **Step 8: Commit.**

```bash
cd e:/SkyFrame
git add server/nws/normalizer.ts server/nws/normalizer.test.ts
git commit -m "$(cat <<'EOF'
Add station fallback: KMKE → KRAC on stale or null observations

Implements the design doc §4.1 requirement that the backend fall back
to the secondary observation station (KRAC) when the primary (KMKE)
returns an observation older than 90 minutes or with null critical
fields (temperature, windSpeed, textDescription).

fetchObservationsWithFallback() tries the primary station's latest
observation, runs it through isObservationUsable() to check staleness
and required fields, and retries against the secondary station if
either check fails or the primary request itself throws.

The normalizer now records the station that actually produced the
data in meta.stationId and sets meta.error = 'station_fallback' when
the secondary was used, so the client can surface this in the footer
(the Footer component already reads meta.stationId into LINK.XXXX).

Three new tests cover: staleness trigger, null temperature trigger,
and the happy-path (no fallback, no error flag).
EOF
)"
```

---

## Task 5: Fastify server — routes, caching, static serving

**Goal:** Tie the normalizer to an HTTP endpoint. Add the caching layer. Serve the built client from `dist/client`. This is the step where the backend becomes a real, runnable app.

**Files:**
- Modify: `e:/SkyFrame/server/index.ts`
- Create: `e:/SkyFrame/server/routes.ts`
- Create: `e:/SkyFrame/server/routes.test.ts`

- [ ] **Step 1: Create the failing integration test for the routes module.**

```ts
// server/routes.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './routes';
import * as normalizer from './nws/normalizer';

const FIXTURE_RESPONSE = {
  current: {
    observedAt: '2026-04-15T19:25:00Z',
    stationId: 'KMKE',
    stationDistanceKm: 7,
    tempF: 62, feelsLikeF: 58, conditionText: 'MOSTLY CLOUDY',
    iconCode: 'cloud' as const,
    precipOutlook: 'DRY THRU 19:00',
    humidityPct: 64, pressureInHg: 30.12, visibilityMi: 10, dewpointF: 49,
    wind: { speedMph: 12, directionDeg: 315, cardinal: 'NW' },
    trends: {
      temp:       { direction: 'up'    as const, deltaPerHour: 1.2, confidence: 'ok' as const },
      wind:       { direction: 'up'    as const, deltaPerHour: 0.7, confidence: 'ok' as const },
      humidity:   { direction: 'down'  as const, deltaPerHour: -1.3, confidence: 'ok' as const },
      pressure:   { direction: 'up'    as const, deltaPerHour: 0.02, confidence: 'ok' as const },
      visibility: { direction: 'steady'as const, deltaPerHour: 0, confidence: 'ok' as const },
      dewpoint:   { direction: 'down'  as const, deltaPerHour: -0.3, confidence: 'ok' as const },
    },
    sunrise: '06:08', sunset: '19:35',
  },
  hourly: [],
  daily: [],
  meta: {
    fetchedAt: '2026-04-15T19:25:00Z',
    nextRefreshAt: '2026-04-15T19:26:30Z',
    cacheHit: false,
    stationId: 'KMKE',
  },
};

describe('GET /api/weather', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.spyOn(normalizer, 'normalizeWeather').mockResolvedValue(FIXTURE_RESPONSE);
    app = Fastify();
    await registerRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('responds with the normalized WeatherResponse', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/weather' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current.tempF).toBe(62);
    expect(body.current.iconCode).toBe('cloud');
  });

  it('serves from cache on second request within TTL', async () => {
    await app.inject({ method: 'GET', url: '/api/weather' });
    const res2 = await app.inject({ method: 'GET', url: '/api/weather' });
    expect(normalizer.normalizeWeather).toHaveBeenCalledTimes(1);
    expect(res2.json().meta.cacheHit).toBe(true);
  });

  it('returns 503 with error flag when normalizer throws', async () => {
    vi.spyOn(normalizer, 'normalizeWeather').mockRejectedValue(new Error('boom'));
    // Fresh app with no cached value
    const freshApp = Fastify();
    await registerRoutes(freshApp);
    const res = await freshApp.inject({ method: 'GET', url: '/api/weather' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: expect.any(String) });
    await freshApp.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `cd e:/SkyFrame && npx vitest run server/routes.test.ts`
Expected: FAIL with "Cannot find module './routes'".

- [ ] **Step 3: Implement `server/routes.ts`.**

```ts
import type { FastifyInstance } from 'fastify';
import type { WeatherResponse } from '../shared/types';
import { normalizeWeather } from './nws/normalizer';
import { TTLCache } from './nws/cache';
import { CONFIG } from './config';

const cache = new TTLCache();
const WEATHER_CACHE_KEY = 'weather';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/weather', async (_req, reply) => {
    const cached = cache.get<WeatherResponse>(WEATHER_CACHE_KEY);
    if (cached) {
      return {
        ...cached,
        meta: { ...cached.meta, cacheHit: true },
      };
    }

    try {
      const fresh = await normalizeWeather();
      cache.set(WEATHER_CACHE_KEY, fresh, CONFIG.cache.observationMs);
      return fresh;
    } catch (err) {
      app.log.error({ err }, 'normalizeWeather failed');
      reply.code(503);
      return {
        error: 'upstream_unavailable',
        message: (err as Error).message,
      };
    }
  });
}
```

- [ ] **Step 4: Run routes tests.**

Run: `cd e:/SkyFrame && npx vitest run server/routes.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 5: Update `server/index.ts` to wire the routes and serve static client from `dist/client`.**

```ts
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config';
import { registerRoutes } from './routes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = resolve(__dirname, '../dist/client');

async function main() {
  const app = Fastify({ logger: { level: 'info' } });

  await registerRoutes(app);

  // Serve built client assets in production. In dev, Vite serves them on 5173
  // and proxies /api to this server, so this path doesn't get hit.
  try {
    await app.register(fastifyStatic, {
      root: CLIENT_DIST,
      prefix: '/',
    });
  } catch {
    app.log.warn('dist/client not built yet. Run `npm run build` for production serving.');
  }

  await app.listen({ port: CONFIG.server.port, host: CONFIG.server.host });
  app.log.info(`SkyFrame listening on http://${CONFIG.server.host}:${CONFIG.server.port}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Run the server against real NWS.** This is the integration smoke test.

Run: `cd e:/SkyFrame && npm run server`
Expected: logs `SkyFrame listening on http://127.0.0.1:3000`. In another terminal: `curl http://localhost:3000/api/weather | head -c 500`. Expected: a JSON response with real current conditions for Oak Creek, WI. If it fails with an NWS error, check that the User-Agent in `server/config.ts` is set correctly and that you can reach https://api.weather.gov from your machine. Kill with Ctrl+C.

- [ ] **Step 7: Full test suite pass.**

Run: `cd e:/SkyFrame && npm test`
Expected: All tests pass.

- [ ] **Step 8: Commit.**

```bash
cd e:/SkyFrame
git add server/index.ts server/routes.ts server/routes.test.ts
git commit -m "$(cat <<'EOF'
Wire Fastify routes and cache; backend is now functionally complete

server/routes.ts registers GET /api/weather, which consults a module-
level TTLCache before calling the normalizer. On cache hit, returns
the cached response with meta.cacheHit = true. On cache miss, calls
normalizeWeather, caches the result for observationMs, returns it.
Errors from the normalizer return HTTP 503 with an error object.

server/index.ts wires registerRoutes into a full Fastify app and
registers @fastify/static to serve built client assets from dist/client
in production (dev goes through Vite's proxy).

Integration test uses Fastify's .inject() to verify the route shape,
cache hit behavior, and error path without starting a real HTTP server.
EOF
)"
```

---

## Task 6: Port CSS and SVG icon sprite from mockups

**Goal:** Extract the hud styles and the SVG icon sprite from the mockup files and set them up as the client's styling layer. No React yet — just the assets the components will use.

**Files:**
- Modify: `e:/SkyFrame/client/styles/hud.css` (currently empty placeholder)
- Create: `e:/SkyFrame/client/icons.svg`

- [ ] **Step 1: Read the current-conditions mockup to find the CSS rules.**

Run: open `e:/SkyFrame/docs/mockups/current-conditions.html` in an editor. Find the `<style>` block at the top. Copy every CSS rule inside it into `e:/SkyFrame/client/styles/hud.css`, **preserving exact selectors, properties, and values**. Do not rename classes or refactor.

- [ ] **Step 2: Add the additional hourly-view CSS rules from the hourly mockup.**

Open `e:/SkyFrame/docs/mockups/hourly.html`. Find the `<style>` block. The `.hud-showcase`, `.hud-topbar`, `.hud-section-label`, and `.hud-footer` rules will already exist in `hud.css` from step 1. Skip those (they're shared). **Copy the new rules into hud.css**: `.hourly-wrap`, `.hourly-chart`, `.hl-line`, `.hl-point`, `.hl-temp-label`, `.hl-midline`, `.hourly-icons`, `.hourly-precip`, `.hourly-precip .bar.low`, `.hourly-precip .bar.med`, `.hourly-precip .bar.high`, `.hourly-precip .pct`, `.hourly-hours`.

- [ ] **Step 3: Add the additional outlook-view CSS rules from the outlook mockup.**

Open `e:/SkyFrame/docs/mockups/outlook.html`. Same principle: skip the rules you already have, copy the new ones. **New rules to copy**: `.outlook`, `.outlook .date`, `.outlook .icon`, `.outlook .precip.low`, `.outlook .precip.med`, `.outlook .precip.high`, `.outlook .precip.zero`, `.outlook .range`, `.outlook .range .seg`, `.outlook .range .tick`, `.outlook .lh`, `.outlook-scale`.

- [ ] **Step 4: Remove the `display: block !important` and `aspect-ratio: auto !important` from `.hud-showcase`.**

Those `!important` declarations were fighting the brainstorming server's frame template. In the real app there's no frame template to fight, so they're noise. Change:

```css
.hud-showcase {
  display: block !important;
  aspect-ratio: auto !important;
  background: #000d10;
  /* ... */
}
```

To:

```css
.hud-showcase {
  background: #000d10;
  /* ... */
}
```

- [ ] **Step 5: Create `client/icons.svg`** as a standalone sprite file extracted from the current-conditions mockup.

Open `e:/SkyFrame/docs/mockups/current-conditions.html`. Find the hidden `<svg style="display:none">` block that contains the nine `<symbol>` elements. Copy the entire block into a new file `e:/SkyFrame/client/icons.svg`, but wrap it as a standalone SVG document:

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <!-- paste all 9 <symbol> elements here -->
  <symbol id="wxicon-sun" viewBox="0 0 64 64">
    <!-- ... -->
  </symbol>
  <!-- ... -->
</svg>
```

- [ ] **Step 6: Verify the stylesheet loads.**

Run: `cd e:/SkyFrame && npm run dev`
Expected: Vite starts; http://localhost:5173 still shows the stub page, but now the browser's DevTools Network tab shows `hud.css` is being served with the rules inside (check the Elements tab, inspect `<link rel="stylesheet">`). Kill the server.

- [ ] **Step 7: Commit.**

```bash
cd e:/SkyFrame
git add client/styles/hud.css client/icons.svg
git commit -m "$(cat <<'EOF'
Port HUD styles and SVG icon sprite from mockups to client assets

client/styles/hud.css is assembled by concatenating style blocks from
all three mockups (current-conditions.html, hourly.html, outlook.html),
deduplicating shared rules (hud-showcase, hud-topbar, hud-footer,
hud-section-label). The !important flags on hud-showcase were removed
because the brainstorming server's frame template that required them
does not exist in the real app.

client/icons.svg is the 9-symbol sprite extracted from the mockups,
wrapped as a standalone SVG document. Components reference it via
<svg><use href="/icons.svg#wxicon-cloud" /></svg>.
EOF
)"
```

---

## Task 7: Root client — App, TopBar, Footer, WxIcon, live clock, fetch lifecycle

**Goal:** Replace the scaffold stub with a real React root that fetches `/api/weather` on mount, refreshes every 90 seconds, exposes the data to child components via props, and renders the shared TopBar (with live clock) and Footer (with link status dot) around a placeholder middle.

**Files:**
- Modify: `e:/SkyFrame/client/App.tsx`
- Create: `e:/SkyFrame/client/components/TopBar.tsx`
- Create: `e:/SkyFrame/client/components/Footer.tsx`
- Create: `e:/SkyFrame/client/components/WxIcon.tsx`

- [ ] **Step 1: Create `client/components/WxIcon.tsx`** — thin wrapper around `<svg><use />`.

```tsx
import type { IconCode } from '../../shared/types';

interface WxIconProps {
  code: IconCode;
  size?: number;
  className?: string;
}

export function WxIcon({ code, size = 64, className }: WxIconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <use href={`/icons.svg#wxicon-${code}`} />
    </svg>
  );
}
```

- [ ] **Step 2: Create `client/components/TopBar.tsx`** — shared top bar with the location label and live ticking clock.

```tsx
import { useEffect, useState } from 'react';

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

export function TopBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = partsToMap(TIME_FORMAT.formatToParts(now));
  const d = partsToMap(DATE_FORMAT.formatToParts(now));

  const digits = `${t.hour}:${t.minute}:${t.second}`;
  const tz = t.timeZoneName ?? '';
  const dateStr = `${d.weekday?.toUpperCase() ?? ''} · ${d.month?.toUpperCase() ?? ''} ${d.day ?? ''} · ${d.year ?? ''}`;

  return (
    <div className="hud-topbar">
      <div className="loc">■ SKYFRAME &nbsp;·&nbsp; OAK CREEK 53154 &nbsp;·&nbsp; KMKE LINK</div>
      <div className="clock">
        <div className="clock-time">
          <span className="clock-digits">{digits}</span>
          <span className="tz clock-tz">{tz}</span>
        </div>
        <div className="clock-date">{dateStr}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/components/Footer.tsx`** — shared footer with pulsing link-status dot.

```tsx
import type { WeatherMeta } from '../../shared/types';

interface FooterProps {
  meta: WeatherMeta | null;
  error: string | null;
}

function formatHM(iso: string | undefined): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}:${map.second}`;
}

export function Footer({ meta, error }: FooterProps) {
  const stationId = meta?.stationId ?? 'KMKE';
  const lastPull = formatHM(meta?.fetchedAt);
  const nextPull = formatHM(meta?.nextRefreshAt);

  return (
    <div className="hud-footer">
      <span className={error ? 'dot dot-error' : 'dot'}></span>
      {error ? 'LINK FAIL' : `LINK.${stationId}`}
      &nbsp;·&nbsp; LAST PULL {lastPull} &nbsp;·&nbsp; NEXT {nextPull}
    </div>
  );
}
```

- [ ] **Step 4: Add the error-dot style to `client/styles/hud.css`.** Append to the file.

```css
.hud-footer .dot.dot-error {
  background: #ff4444;
  box-shadow: 0 0 6px rgba(255, 68, 68, 0.9);
  animation: none; /* static on error */
}
```

- [ ] **Step 5: Rewrite `client/App.tsx`** — owns the fetch lifecycle and renders TopBar + placeholder middle + Footer.

```tsx
import { useEffect, useState } from 'react';
import type { WeatherResponse } from '../shared/types';
import { TopBar } from './components/TopBar';
import { Footer } from './components/Footer';

const REFRESH_INTERVAL_MS = 90 * 1000;

export default function App() {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as WeatherResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };

    fetchWeather();
    const id = setInterval(fetchWeather, REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="hud-showcase">
      <TopBar />

      <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.5, fontSize: 11, letterSpacing: '0.22em' }}>
        {data ? '■ DATA LOADED · PANELS IN NEXT TASK' : '■ LOADING...'}
      </div>

      <Footer meta={data?.meta ?? null} error={error} />
    </div>
  );
}
```

- [ ] **Step 6: Start both Vite and the backend to verify end-to-end.**

Run in one terminal: `cd e:/SkyFrame && npm run server`
Run in another terminal: `cd e:/SkyFrame && npm run dev`
Open http://localhost:5173 in a browser.

Expected: HUD panel with a working top bar (live ticking Chicago-time clock and date on the right), the middle shows "DATA LOADED · PANELS IN NEXT TASK" in cyan once the fetch succeeds, and the footer shows a pulsing cyan dot with `LINK.KMKE · LAST PULL HH:MM:SS · NEXT HH:MM:SS` where both times are real. If the fetch fails (e.g., backend not running), the dot should become static red and the text should say `LINK FAIL`.

Kill both servers.

- [ ] **Step 7: Commit.**

```bash
cd e:/SkyFrame
git add client/App.tsx client/components/TopBar.tsx client/components/Footer.tsx client/components/WxIcon.tsx client/styles/hud.css
git commit -m "$(cat <<'EOF'
Add root client: App fetch lifecycle, TopBar, Footer, WxIcon

App.tsx owns a single WeatherResponse state, fetches /api/weather on
mount, and refreshes every 90 seconds. Fetch errors set an error
string which propagates to Footer's red dot variant.

TopBar renders the shared location/clock bar. Clock ticks every second
via setInterval and formats with Intl.DateTimeFormat using
timeZone: 'America/Chicago' and hourCycle: 'h23' so it shows correct
Chicago time even from a different-timezone machine. DST handled
automatically by the IANA timezone.

Footer renders the link-status dot (cyan pulsing on success, red
static on error) and the LAST PULL / NEXT times computed from
WeatherMeta.fetchedAt / nextRefreshAt.

WxIcon is a thin wrapper: <svg><use href="/icons.svg#wxicon-..." /></svg>.
EOF
)"
```

---

## Task 8: CurrentPanel component

**Goal:** Render the current conditions view from the fetched data. This is the single largest component; it has the hero temperature readout, the 5 bars with trends, the precipitation/sunrise description line, and the hero icon.

**Files:**
- Create: `e:/SkyFrame/client/components/CurrentPanel.tsx`
- Modify: `e:/SkyFrame/client/App.tsx` (add CurrentPanel to render tree)

- [ ] **Step 1: Create `client/components/CurrentPanel.tsx`.**

The DOM structure must match [docs/mockups/current-conditions.html](../../mockups/current-conditions.html) exactly — same class names in the same nesting, so the ported CSS applies cleanly. Reference that file while writing this component.

```tsx
import type { CurrentConditions, Trend } from '../../shared/types';
import { WxIcon } from './WxIcon';

interface CurrentPanelProps {
  current: CurrentConditions;
}

function trendText(t: Trend): { arrow: string; rate: string; className: string } {
  if (t.confidence === 'missing') return { arrow: '', rate: '', className: 'steady' };
  if (t.direction === 'steady') return { arrow: '=', rate: 'steady', className: 'steady' };
  const arrow = t.direction === 'up' ? '▲' : '▼';
  const sign = t.deltaPerHour >= 0 ? '+' : '';
  const rate = `${sign}${t.deltaPerHour.toFixed(Math.abs(t.deltaPerHour) < 0.1 ? 2 : 1)}/h`;
  return { arrow, rate, className: '' };
}

function renderTrend(t: Trend): string {
  const { arrow, rate } = trendText(t);
  return arrow ? `${arrow} ${rate}` : rate;
}

// Fill percentages for the bar visualizations. These are scaled from the metric's
// typical display range to a 0-100% bar fill.
function fillPercent(metric: string, value: number): number {
  switch (metric) {
    case 'wind':       return Math.min(100, (value / 30) * 100);        // 0-30 mph scale
    case 'humidity':   return Math.min(100, value);                      // direct %
    case 'pressure':   return Math.min(100, Math.max(0, ((value - 29.50) / 1.00) * 100)); // 29.50-30.50
    case 'visibility': return Math.min(100, (value / 10) * 100);         // 0-10 mi scale
    case 'dewpoint':   return Math.min(100, Math.max(0, ((value + 20) / 100) * 100));    // -20 to 80°F
    default:           return 50;
  }
}

export function CurrentPanel({ current }: CurrentPanelProps) {
  const tempTrend = trendText(current.trends.temp);

  return (
    <>
      <div className="hud-hero">
        <div className="hud-readout">
          <span className="corner tl"></span>
          <span className="corner tr"></span>
          <span className="corner bl"></span>
          <span className="corner br"></span>
          <div className="tag">TEMP / FEEL</div>
          <div className="temp">
            {Math.round(current.tempF)}
            <span className="unit">°F</span>
            <span className="feel">/ {Math.round(current.feelsLikeF)}</span>
            {tempTrend.arrow && (
              <span className="trend">{tempTrend.arrow} {tempTrend.rate}</span>
            )}
          </div>
          <div className="desc">
            {current.conditionText}
            <span className="sep">·</span>
            {current.precipOutlook}
            <span className="sep">·</span>
            <span className="suntime">↑ {current.sunrise} ↓ {current.sunset}</span>
          </div>
        </div>
        <div className="hud-hero-icon">
          <WxIcon code={current.iconCode} size={112} />
        </div>
      </div>

      <div className="bars">
        <BarRow label="WIND" value={`${current.wind.speedMph} ${current.wind.cardinal}`} fill={fillPercent('wind', current.wind.speedMph)} trend={current.trends.wind} />
        <BarRow label="HUM"  value={`${current.humidityPct} %`} fill={fillPercent('humidity', current.humidityPct)} trend={current.trends.humidity} />
        <BarRow label="PRES" value={`${current.pressureInHg.toFixed(2)} "`} fill={fillPercent('pressure', current.pressureInHg)} trend={current.trends.pressure} />
        <BarRow label="VIS"  value={`${current.visibilityMi} MI`} fill={fillPercent('visibility', current.visibilityMi)} trend={current.trends.visibility} />
        <BarRow label="DEW"  value={`${Math.round(current.dewpointF)} °F`} fill={fillPercent('dewpoint', current.dewpointF)} trend={current.trends.dewpoint} />
      </div>
    </>
  );
}

interface BarRowProps {
  label: string;
  value: string;
  fill: number;
  trend: Trend;
}

function BarRow({ label, value, fill, trend }: BarRowProps) {
  const t = trendText(trend);
  return (
    <>
      <div className="lbl">{label}</div>
      <div className="sb">
        <div className="sb-off"></div>
        <div className="sb-on" style={{ ['--fill' as string]: `${fill}%` } as React.CSSProperties}></div>
      </div>
      <div className="val">{value}</div>
      <div className={`trend ${t.className}`}>{t.arrow ? `${t.arrow} ${t.rate}` : t.rate}</div>
    </>
  );
}
```

- [ ] **Step 2: Update `client/App.tsx`** to render CurrentPanel when data is loaded.

Replace the middle placeholder `<div>` with:

```tsx
{data ? (
  <CurrentPanel current={data.current} />
) : (
  <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.5, fontSize: 11, letterSpacing: '0.22em' }}>
    ■ LOADING...
  </div>
)}
```

Add the import at the top of `App.tsx`:

```tsx
import { CurrentPanel } from './components/CurrentPanel';
```

- [ ] **Step 3: Verify in the browser.**

Run in one terminal: `cd e:/SkyFrame && npm run server`
Run in another: `cd e:/SkyFrame && npm run dev`
Open http://localhost:5173.

Expected: the HUD panel now shows the current conditions view populated with real Oak Creek data. Top bar with live clock, hero temperature with feels-like and trend arrow, weather condition icon on the right (whatever's current — probably cloud, partly-day, or similar), description line with condition + precip outlook + sunrise/sunset, five bars with their fills + values + trend arrows, and the footer with pulsing dot. Compare side-by-side against [docs/mockups/current-conditions.html](../../mockups/current-conditions.html) — they should be visually very close (not identical because real data replaces the mockup's hardcoded values).

Kill both servers.

- [ ] **Step 4: Commit.**

```bash
cd e:/SkyFrame
git add client/components/CurrentPanel.tsx client/App.tsx
git commit -m "$(cat <<'EOF'
Add CurrentPanel component

Renders the hero temp readout with corner brackets and inline trend,
the weather condition icon via WxIcon at 112px, the description line
(condition + precip outlook + sunrise/sunset), and the five bars
(WIND/HUM/PRES/VIS/DEW) each with label + fill bar + value + trend.

fillPercent() is a per-metric scaling function converting display
units to 0-100% bar fills. Scales come from the mockup values and
match the segmented bar visual from the design.

trendText() converts a Trend object into the display strings shown in
the mockups (▲/▼/= arrow, signed delta, /h rate). When confidence is
'missing', the trend column renders empty rather than a fake value.
EOF
)"
```

---

## Task 9: HourlyPanel component

**Goal:** Render the 12-hour forecast view as an SVG line chart with an icon row, precip bars row, and hour labels row.

**Files:**
- Create: `e:/SkyFrame/client/components/HourlyPanel.tsx`
- Modify: `e:/SkyFrame/client/App.tsx` (add HourlyPanel below CurrentPanel)

- [ ] **Step 1: Create `client/components/HourlyPanel.tsx`.**

Same principle as CurrentPanel: the DOM structure must match [docs/mockups/hourly.html](../../mockups/hourly.html) so the CSS applies cleanly. This one builds the SVG chart from data instead of hardcoded points.

```tsx
import type { HourlyPeriod } from '../../shared/types';
import { WxIcon } from './WxIcon';

interface HourlyPanelProps {
  hourly: HourlyPeriod[];
}

const SVG_WIDTH = 720;
const SVG_HEIGHT = 110;
const Y_TOP = 20;
const Y_BOTTOM = 90;

function computeChartPoints(hourly: HourlyPeriod[]): {
  points: Array<{ x: number; y: number; temp: number }>;
  minTemp: number;
  maxTemp: number;
} {
  const temps = hourly.map((h) => h.tempF);
  const minTemp = Math.floor(Math.min(...temps) / 2) * 2;
  const maxTemp = Math.ceil(Math.max(...temps) / 2) * 2;
  const range = Math.max(1, maxTemp - minTemp);

  const columnWidth = SVG_WIDTH / hourly.length;
  const yScale = Y_BOTTOM - Y_TOP;

  const points = hourly.map((h, i) => ({
    x: (i + 0.5) * columnWidth,
    y: Y_TOP + ((maxTemp - h.tempF) / range) * yScale,
    temp: h.tempF,
  }));

  return { points, minTemp, maxTemp };
}

function precipBarClass(pct: number): string {
  if (pct > 50) return 'bar high';
  if (pct > 25) return 'bar med';
  return 'bar low';
}

export function HourlyPanel({ hourly }: HourlyPanelProps) {
  if (hourly.length === 0) return null;
  const { points, minTemp, maxTemp } = computeChartPoints(hourly);
  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="hud-hourly-section">
      <div className="hud-section-label">
        <span>■ HOURLY FORECAST &nbsp;·&nbsp; NEXT {hourly.length}H &nbsp;·&nbsp; MKX GRID 88,58</span>
        <span>RANGE {minTemp}° — {maxTemp}°F</span>
      </div>

      <div className="hourly-wrap">
        <div className="hourly-chart">
          <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="none">
            <line className="hl-midline" x1="0" y1={(Y_TOP + Y_BOTTOM) / 2} x2={SVG_WIDTH} y2={(Y_TOP + Y_BOTTOM) / 2} />
            <polyline className="hl-line" points={polylinePoints} />
            {points.map((p, i) => (
              <circle key={`pt-${i}`} className="hl-point" cx={p.x} cy={p.y} r="3.5" />
            ))}
            {points.map((p, i) => (
              <text key={`lbl-${i}`} className="hl-temp-label" x={p.x} y={p.y - 10}>
                {Math.round(p.temp)}
              </text>
            ))}
          </svg>
        </div>

        <div className="hourly-icons">
          {hourly.map((h, i) => (
            <div key={`ic-${i}`} className="col">
              <WxIcon code={h.iconCode} size={26} />
            </div>
          ))}
        </div>

        <div className="hourly-precip">
          {hourly.map((h, i) => (
            <div key={`pc-${i}`} className="col">
              <div className={precipBarClass(h.precipProbPct)} style={{ height: `${h.precipProbPct}%` }}></div>
              {h.precipProbPct > 30 && <div className="pct">{h.precipProbPct}%</div>}
            </div>
          ))}
        </div>

        <div className="hourly-hours">
          {hourly.map((h, i) => (
            <div key={`hr-${i}`} className="col">{h.hourLabel}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `App.tsx`** to add HourlyPanel after CurrentPanel.

```tsx
// At the top:
import { HourlyPanel } from './components/HourlyPanel';

// In the render tree, after CurrentPanel:
{data && <HourlyPanel hourly={data.hourly} />}
```

- [ ] **Step 3: Verify in the browser.**

Run backend + Vite as before. Open http://localhost:5173.
Expected: below the current conditions panel, an hourly section appears with the temperature line chart across 12 hours, condition icons, precip bars, and hour labels. The line chart dynamically scales to fit the actual temp range. Icons reflect actual forecast conditions. Precip bars show whatever the NWS hourly forecast reports.

Kill both servers.

- [ ] **Step 4: Commit.**

```bash
cd e:/SkyFrame
git add client/components/HourlyPanel.tsx client/App.tsx
git commit -m "$(cat <<'EOF'
Add HourlyPanel with SVG line chart

Builds the temperature line chart from data rather than hardcoded
points. computeChartPoints() derives y-axis bounds from the actual
min/max temperatures in the 12-hour window, rounded outward to even
degrees, and maps each hour's temp to an (x, y) inside the SVG.

Renders the polyline connecting the points, circle markers at each
point, and a numeric temp label above each dot. Below the chart, a
12-column grid of condition icons, precip bars (with three opacity
tiers keyed on percentage), and HH:MM hour labels.
EOF
)"
```

---

## Task 10: OutlookPanel component

**Goal:** Render the 7-day outlook view with shared-scale range bars for each day.

**Files:**
- Create: `e:/SkyFrame/client/components/OutlookPanel.tsx`
- Modify: `e:/SkyFrame/client/App.tsx` (add OutlookPanel after HourlyPanel)

- [ ] **Step 1: Create `client/components/OutlookPanel.tsx`.**

```tsx
import type { DailyPeriod } from '../../shared/types';
import { WxIcon } from './WxIcon';

interface OutlookPanelProps {
  daily: DailyPeriod[];
}

function precipClass(pct: number): string {
  if (pct >= 50) return 'precip high';
  if (pct >= 26) return 'precip med';
  if (pct >= 10) return 'precip low';
  return 'precip zero';
}

export function OutlookPanel({ daily }: OutlookPanelProps) {
  if (daily.length === 0) return null;

  // Compute shared scale from all days' highs/lows
  const lows = daily.map((d) => d.lowF);
  const highs = daily.map((d) => d.highF);
  const scaleMin = Math.floor(Math.min(...lows) / 2) * 2;
  const scaleMax = Math.ceil(Math.max(...highs) / 2) * 2;
  const scaleRange = Math.max(1, scaleMax - scaleMin);

  const scalePoints = [
    scaleMin,
    Math.round(scaleMin + scaleRange * 0.25),
    Math.round(scaleMin + scaleRange * 0.5),
    Math.round(scaleMin + scaleRange * 0.75),
    scaleMax,
  ];

  return (
    <div className="hud-outlook-section">
      <div className="hud-section-label">
        <span>■ 7-DAY OUTLOOK &nbsp;·&nbsp; KMKE &nbsp;/&nbsp; MKX GRID 88,58 &nbsp;/&nbsp; WIZ066</span>
        <span>RANGE {scaleMin}° — {scaleMax}°F</span>
      </div>

      <div className="outlook-scale">
        <div></div><div></div><div></div>
        <div className="scale-axis">
          {scalePoints.map((n) => <span key={n}>{n}°</span>)}
        </div>
        <div></div>
      </div>

      <div className="outlook">
        {daily.map((day) => {
          const leftPct = ((day.lowF - scaleMin) / scaleRange) * 100;
          const rightPct = ((scaleMax - day.highF) / scaleRange) * 100;

          return (
            <OutlookRow
              key={day.dateISO}
              day={day}
              leftPct={leftPct}
              rightPct={rightPct}
            />
          );
        })}
      </div>
    </div>
  );
}

interface OutlookRowProps {
  day: DailyPeriod;
  leftPct: number;
  rightPct: number;
}

function OutlookRow({ day, leftPct, rightPct }: OutlookRowProps) {
  return (
    <>
      <div className="date">
        <span className="dow">{day.dayOfWeek}</span>
        <span className="dot">·</span>
        <span className="dt">{day.dateLabel}</span>
      </div>
      <div className="icon">
        <WxIcon code={day.iconCode} size={30} />
      </div>
      <div className={precipClass(day.precipProbPct)}>
        {day.precipProbPct}%
      </div>
      <div className="range">
        <div className="seg" style={{ left: `${leftPct}%`, right: `${rightPct}%` }}></div>
        <div className="tick" style={{ left: `${leftPct}%` }}></div>
        <div className="tick" style={{ left: `${100 - rightPct}%` }}></div>
      </div>
      <div className="lh">
        <span className="l">{day.lowF}</span>
        <span className="sep">·</span>
        <span className="h">{day.highF}</span>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update `App.tsx`** to add OutlookPanel after HourlyPanel.

```tsx
// At the top:
import { OutlookPanel } from './components/OutlookPanel';

// In the render tree, after HourlyPanel:
{data && <OutlookPanel daily={data.daily} />}
```

- [ ] **Step 3: Verify in the browser.**

Run backend + Vite. Open http://localhost:5173.
Expected: the dashboard now shows all three views stacked vertically. Current conditions at top, hourly forecast in the middle, 7-day outlook at the bottom. The outlook's range bars should reflect real forecast data with each day's low-high segment positioned on a shared week-wide temperature scale. Compare against [docs/mockups/outlook.html](../../mockups/outlook.html).

- [ ] **Step 4: Typecheck.**

Run: `cd e:/SkyFrame && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Full test suite.**

Run: `cd e:/SkyFrame && npm test`
Expected: all tests still pass.

Kill both servers.

- [ ] **Step 6: Commit.**

```bash
cd e:/SkyFrame
git add client/components/OutlookPanel.tsx client/App.tsx
git commit -m "$(cat <<'EOF'
Add OutlookPanel — SkyFrame v1 is now visually complete

7-day outlook view with shared-scale range bars. The scale min/max
are computed from the actual forecast data (rounded outward to even
degrees), and each day's low-to-high segment is positioned as a
percentage inset within that shared scale. Tick marks at each
segment endpoint.

Icons reflect the forecast's daytime condition slug (partly-day,
sun, cloud, rain, etc.). Precipitation uses four opacity tiers
(zero/low/med/high) to make the "quiet day vs. active day" pattern
visible at a glance.

All three views now stack in App.tsx: CurrentPanel, HourlyPanel,
OutlookPanel, wrapped by TopBar and Footer. v1 is visually complete.
EOF
)"
```

---

## Task 11: Production build and end-to-end smoke test

**Goal:** Verify that `npm run build` produces a working `dist/client` bundle and that the Fastify server can serve it standalone (no Vite dev server needed).

**Files:**
- Modify: `e:/SkyFrame/package.json` (add `start:prod` script)
- Create: `e:/SkyFrame/README.md`

- [ ] **Step 1: Add a `start:prod` script to `package.json`.**

Add to the `scripts` object:

```json
"start:prod": "npm run build && npm run server"
```

- [ ] **Step 2: Run the production build.**

Run: `cd e:/SkyFrame && npm run build`
Expected: Vite builds to `dist/client/`. Output lists assets (index.html, JS bundle, CSS bundle, hashed filenames). No TypeScript errors.

- [ ] **Step 3: Start the server and verify it serves the built client.**

Run: `cd e:/SkyFrame && npm run server`
Open http://localhost:3000 (note: port 3000, not 5173 — we're hitting the backend directly, not Vite).
Expected: the full SkyFrame dashboard loads with real data. All three views render correctly. The live clock ticks. The footer shows LINK.KMKE with pulsing dot and real last/next pull times.

- [ ] **Step 4: Kill the server and verify the dev loop still works.**

Run: `cd e:/SkyFrame && npm run dev`
In another terminal: `cd e:/SkyFrame && npm run server`
Open http://localhost:5173.
Expected: same dashboard loads, this time through the Vite dev server with HMR enabled (for future development). The /api proxy routes /api/weather to localhost:3000.

Kill both.

- [ ] **Step 5: Create `README.md` with setup and run instructions.**

```markdown
# SkyFrame

Local ad-free weather dashboard for ZIP 53154 (Oak Creek, WI). Single-purpose utility that pulls directly from NOAA/NWS and renders the data as a cyan-on-black HUD-style dashboard in your browser.

See [PROJECT_SPEC.md](PROJECT_SPEC.md) for product context, [WEATHER_PROVIDER_RESEARCH.md](WEATHER_PROVIDER_RESEARCH.md) for the NWS evaluation, and [docs/superpowers/specs/2026-04-15-skyframe-design.md](docs/superpowers/specs/2026-04-15-skyframe-design.md) for the implementation design.

## Setup

Requires Node.js 20+ and npm.

```bash
git clone <repo>
cd SkyFrame
npm install
```

## Run

**Production (what you want for daily use):**

```bash
npm run build    # Compiles the React client into dist/client
npm run server   # Starts Fastify on http://localhost:3000
```

Open http://localhost:3000 in your browser.

**Development (with hot reload):**

```bash
npm run server   # Terminal 1: Fastify backend on :3000
npm run dev      # Terminal 2: Vite dev server on :5173 with /api proxy
```

Open http://localhost:5173 — Vite handles the frontend with HMR, /api calls proxy to the backend.

## Tests

```bash
npm test           # Run once
npm run test:watch # Watch mode
npm run typecheck  # TypeScript check without building
```

## Structure

- `shared/types.ts` — WeatherResponse type contract, imported by both server and client
- `server/` — Fastify backend, NWS proxy, in-memory cache
- `client/` — React + Vite frontend with the three HUD views
- `docs/mockups/` — static HTML mockups (source of truth for visual design)
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans

## Why a backend at all?

NWS requires a `User-Agent` header identifying your app and contact email. Browsers forbid `fetch()` from setting `User-Agent` (it's on the forbidden headers list), so a pure client-side SkyFrame couldn't comply with NWS terms. The Fastify backend acts as a thin local proxy: browser calls `/api/weather`, the server calls NWS with the required headers, normalizes the response, and returns a single clean JSON shape.
```

- [ ] **Step 6: Final sanity run — test, typecheck, build, production start.**

```bash
cd e:/SkyFrame
npm test && npm run typecheck && npm run build && echo "All green"
```
Expected: "All green" printed at the end.

- [ ] **Step 7: Commit.**

```bash
cd e:/SkyFrame
git add package.json README.md
git commit -m "$(cat <<'EOF'
Add production build script and README

npm run start:prod builds the client and starts the Fastify server in
production mode, serving the built client from dist/client on port 3000.
No Vite needed at runtime.

README documents setup, dev vs production run flows, and the reason
we need a backend at all (NWS User-Agent header requirement).

SkyFrame v1 is complete. All three views render real NWS data for Oak
Creek, WI. No ads, no trackers, no API keys, no external CDN assets.
EOF
)"
```

---

## Summary — what's built after all 11 tasks

- **Full-stack TypeScript app** with one `package.json`, Fastify backend, React+Vite frontend.
- **Four-way NWS integration:** `/points` metadata (sunrise/sunset), `/gridpoints/.../forecast` (daily), `/gridpoints/.../forecast/hourly` (12-hour chart), `/stations/KMKE/observations/latest` (current), `/observations?limit=6` (trend history).
- **Cyan-on-black HUD dashboard** with current conditions, 12-hour hourly forecast, and 7-day outlook.
- **Nine inline SVG weather icons** using `currentColor` for future color themability.
- **Trend indicators** computed from observation history with per-metric thresholds.
- **Precipitation outlook** string with four cases (DRY THRU, DRY 24H+, RAIN IN NNm, RAIN NOW).
- **Live Chicago-time clock and date** using IANA timezone (DST handled automatically).
- **In-memory TTL cache** with per-resource TTLs (5 min forecasts, 90 sec observations).
- **Error handling** with graceful degradation (retry once, red link-status dot on failure).
- **Test coverage** for all pure transformation functions, cache, HTTP client, normalizer, and routes (via Fastify inject).

**Not built (explicitly deferred per the design doc's section 8):** UV index, weather alerts, user preferences UI, radar imagery, offline mode / service worker, mobile responsive layout, the animation vocabulary revisit the user flagged during brainstorming, and multi-location support. Every one of these is intentionally out of v1 scope and adding them would require reopening a design conversation.
