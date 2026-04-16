# WxDeck

Local ad-free weather dashboard for ZIP 53154 (Oak Creek, WI). Single-purpose utility that pulls directly from NOAA/NWS and renders the data as a cyan-on-black HUD-style dashboard in your browser.

See [PROJECT_SPEC.md](PROJECT_SPEC.md) for product context, [WEATHER_PROVIDER_RESEARCH.md](WEATHER_PROVIDER_RESEARCH.md) for the NWS evaluation, and [docs/superpowers/specs/2026-04-15-wxdeck-design.md](docs/superpowers/specs/2026-04-15-wxdeck-design.md) for the implementation design.

## Setup

Requires Node.js 20+ and npm.

```bash
git clone <repo>
cd WxDeck
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

NWS requires a `User-Agent` header identifying your app and contact email. Browsers forbid `fetch()` from setting `User-Agent` (it's on the forbidden headers list), so a pure client-side WxDeck couldn't comply with NWS terms. The Fastify backend acts as a thin local proxy: browser calls `/api/weather`, the server calls NWS with the required headers, normalizes the response, and returns a single clean JSON shape.
