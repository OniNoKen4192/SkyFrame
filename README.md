# SkyFrame

Local, ad-free weather dashboard powered by NOAA/NWS. Runs on your own computer, works for any US location, and renders a cyan-on-black HUD-style display in your browser. No API keys, no accounts, no tracking.

![SkyFrame dashboard](docs/Screenshot.png)

## Features

- **Current conditions, hourly forecast, and 7-day outlook** in one HUD-styled dashboard
- **Weather alerts** with a 13-tier color system and audible beeps for severe warnings
- **NWS narrative forecasts** for any day, inline via a terminal-styled modal
- **Station override** — manually pin to the secondary station when the primary reports bad data
- **GPS autodetect** and **opt-in GitHub update notifications** in a persistent Settings modal
- **No ads, no analytics, no telemetry, no API keys** — data comes straight from NOAA/NWS

See the **[User's Guide](docs/USER_GUIDE.md)** for a full walkthrough of the dashboard with screenshots.

## Requirements

- **[Node.js 20+](https://nodejs.org/)** and **npm** (npm is included with Node.js)
- A US location (NWS only covers the United States and its territories)
- A contact email (NWS requires one in the User-Agent header — it is never sent anywhere else)

## Easy install (Windows, no developer tools needed)

1. Click the green **Code** button at the top of this page → **Download ZIP**.
2. Extract the ZIP anywhere (Desktop, Documents, etc.).
3. Open the extracted folder and double-click **Install.bat**.
   - If Node.js isn't installed, Install.bat will offer to install it for you.
   - Windows may show a UAC ("Do you want to allow...?") prompt once — that's the Node.js installer.
   - First run takes 1–2 minutes.
4. When setup finishes, double-click **SkyFrame.bat**.
   Your browser will open automatically to SkyFrame.
5. **First launch:** SkyFrame will show a Settings panel — enter a ZIP code (or `lat, lon`) and a contact email (required by the National Weather Service), click SAVE, and you're done. You only do this once.

To stop SkyFrame: close the black console window that opened with it.
To update later: download the new ZIP, replace the folder, and run Install.bat again.

## Quick start

```bash
git clone https://github.com/OniNoKen4192/SkyFrame.git
cd SkyFrame
npm install
npm run build
npm run server
```

Open **http://localhost:3000** in your browser.

On first launch you will see the Settings modal with the location / email fields empty. Enter a location (ZIP code or `lat, lon` — there's also a `⌖ USE MY LOCATION` button if you're on localhost) and a contact email. SkyFrame calls the NWS `/points` API to resolve your forecast office, grid coordinates, timezone, observation stations, and forecast zone automatically. The result is saved to `skyframe.config.json` (gitignored) so you only do this once — and you can edit it anytime from the `≡` hamburger in the TopBar.

## Usage

### Production (daily use)

```bash
npm run build    # compile the React client into dist/client
npm run server   # start Fastify on http://localhost:3000
```

Or in one shot:

```bash
npm run start:prod
```

### Development (hot reload)

```bash
npm run server   # terminal 1 — Fastify backend on :3000
npm run dev      # terminal 2 — Vite dev server on :5173 with /api proxy
```

Open **http://localhost:5173** — Vite handles the frontend with HMR; `/api` calls proxy to the backend.

### Tests

```bash
npm test           # run once
npm run test:watch # watch mode
npm run typecheck  # TypeScript check without building
```

## Configuration

All location data lives in `skyframe.config.json`, created automatically by the first-run setup. You can also configure via a `.env` file (copy `.env.example` to `.env`). The config file takes priority over `.env` values.

To reconfigure your location, open Settings from the `≡` hamburger in the TopBar and change the fields. (Deleting `skyframe.config.json` and restarting the server also works — Settings will auto-open in first-run mode.)

### Advanced: manual `.env` setup

If you prefer to skip the browser setup flow, copy `.env.example` to `.env` and fill in the values manually. You will need your NWS grid metadata:

```bash
curl -H "User-Agent: SkyFrame/0.1 (you@example.com)" \
  "https://api.weather.gov/points/{lat},{lon}"
```

The response contains the forecast office, grid coordinates, timezone, and forecast zone. See the comments in `.env.example` for which fields map where.

## How it works

NWS does not expose weather by ZIP code or lat/lon directly. Instead there is a two-step flow:

1. **Resolve** your lat/lon to a grid point via `/points/{lat},{lon}` (done once during setup)
2. **Fetch** forecasts, observations, and alerts using the grid-based endpoints

The Fastify backend acts as a thin local proxy: your browser calls `/api/weather`, the server calls NWS with the required `User-Agent` header (browsers forbid setting it directly), normalizes the response, and returns a single clean JSON shape. An in-memory cache prevents redundant NWS requests.

## Project structure

```
shared/types.ts  — WeatherResponse type contract (server + client)
server/          — Fastify backend, NWS proxy, cache, setup flow
client/          — React + Vite frontend (three HUD panels)
```

## Privacy

- No ads, no analytics, no telemetry
- No data leaves your machine beyond the NWS API requests themselves
- Your email is only used in the `User-Agent` header sent to NWS (their terms of service require it)
- All config stays local in `skyframe.config.json`

## License

All rights reserved. See [LICENSE](LICENSE) when published.
