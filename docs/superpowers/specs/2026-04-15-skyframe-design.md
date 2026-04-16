# SkyFrame v1 Design

**Date:** 2026-04-15
**Status:** Design locked, ready for implementation planning.
**Context:** see [PROJECT_SPEC.md](../../../PROJECT_SPEC.md), [WEATHER_PROVIDER_RESEARCH.md](../../../WEATHER_PROVIDER_RESEARCH.md), and [CLAUDE.md](../../../CLAUDE.md).

This doc is deliberately lightweight. It captures the things you can't recover by reading the mockups — data contracts, backend architecture, caching strategy, implementation notes — and points at the mockups for everything visual.

---

## 1. Visual design

**All four views are fully locked as HTML mockups in [docs/mockups/](../../mockups/).** When building the React components, port the styles and DOM structure from those files as closely as practical. Do not re-derive spacing, colors, opacity tiers, grid column widths, or animation timing from this doc — the mockups are the source of truth.

| View | Mockup | Description |
|---|---|---|
| Current conditions | [current-conditions.html](../../mockups/current-conditions.html) | Top bar (location + live clock + date), corner-bracketed hero temp readout with feels-like and trend arrow, weather condition icon next to it, description line (`MOSTLY CLOUDY · DRY THRU 19:00 · ↑ 06:08 ↓ 19:35`), 5 rainmeter-style segmented bars (WIND/HUM/PRES/VIS/DEW) each with trend arrow + signed hourly rate, footer with pulsing link status dot and last/next pull times. |
| Hourly forecast | [hourly.html](../../mockups/hourly.html) | Section label with range indicator, temperature line chart across 12 hours (temp values above each dot, no y-axis labels, single faint midline for grounding), condition icon row, precipitation probability bars with 3 opacity tiers + labels on >30% hours, `HH:MM` hour labels. |
| 7-day outlook | [outlook.html](../../mockups/outlook.html) | Folds the spec's "daily forecast" and "7-day forecast" into a single view since NWS returns 14 day/night periods as one payload. Seven rows, each with date, 30px condition icon, precipitation % (opacity modulated), a range bar on a shared min-to-max scale showing that day's low-to-high segment with endpoint tick marks, and low/high temps on the right. Scale axis above the grid provides absolute reference (`46° · 53° · 59° · 66° · 72°`). |

**The four views stack vertically as sections of a single-page dashboard.** Each view shares the top bar (live clock, location label) and the footer (link status, last/next pull). No routing, no tabs, no navigation.

**Nine icons in the set**, drawn inline as SVG symbols using `stroke="currentColor"` so they inherit the panel's cyan color and can be recolored by CSS without asset regeneration. See the icon palette strip at the bottom of [current-conditions.html](../../mockups/current-conditions.html). If the user replaces these with hand-drawn PNGs later, the mockups document the resolution target (512×512 master, white-on-transparent alpha, loaded via CSS `mask-image` to preserve `currentColor` inheritance).

---

## 2. Hard rules (enforce during implementation)

These are not preferences. Do not relax without explicit confirmation.

- **No ads, analytics, telemetry, or third-party trackers** of any kind, including transitively via dependencies.
- **No API keys, no account-gated providers.** NOAA/NWS is the sole upstream. If NWS fails, surface an error state — do not introduce a fallback provider that requires a key.
- **No CDN-hosted fonts, images, or scripts.** All assets bundled locally.
- **Minimize dependencies.** Before adding a package, ask whether ~100 lines of hand-written code would cover the same need.
- **No persistent user data** beyond in-memory cache. No database, no localStorage for anything sensitive, no cookies.

---

## 3. Technical decisions (already locked)

Full details live in [CLAUDE.md](../../../CLAUDE.md). Summary:

- **Frontend:** React + Vite + TypeScript. SPA served as static files by the backend.
- **Backend:** Fastify + TypeScript, running on Node.js via `tsx` during dev.
- **Repo structure:** single `package.json`, three source directories (`server/`, `client/`, `shared/`). No monorepo workspaces.
- **Location:** hardcoded lat/lon `42.89387888628059, -87.92605499945817` (ZIP 53154, Oak Creek, WI).
- **NWS point metadata** (cached forever, resolved once): office `MKX`, grid `88,58`, radar `KMKX`, timezone `America/Chicago`, forecast zone `WIZ066`.
- **Observation station:** primary `KMKE`, fallback `KRAC`.
- **User-Agent header (required by NWS):** `SkyFrame/0.1 (ken.culver@gmail.com)`.
- **Units:** Fahrenheit, mph, inches of mercury, miles, 12/24-hour time per context.

---

## 4. Backend architecture

### 4.1 Upstream endpoints

| Endpoint | Purpose | Cache TTL |
|---|---|---|
| `GET /points/42.8939,-87.9261` | One-time metadata resolution (grid, radar, zone, astronomicalData) | Forever (resolved at server startup, never re-fetched) |
| `GET /gridpoints/MKX/88,58/forecast` | 14-period day/night forecast (7-day outlook source) | 5 min |
| `GET /gridpoints/MKX/88,58/forecast/hourly` | Hourly forecast (156 periods) — we use first 12 | 5 min |
| `GET /stations/KMKE/observations/latest` | Current conditions snapshot | 90 sec |
| `GET /stations/KMKE/observations?limit=6` | ≈3 hours of history for trend computation | 90 sec |
| `GET /alerts/active?point=42.8939,-87.9261` | Weather alerts (deferred to v1.1, not v1) | n/a |

**All requests include:** `User-Agent: SkyFrame/0.1 (ken.culver@gmail.com)` and `Accept: application/geo+json`.

**Station fallback logic:** if the latest KMKE observation is older than 90 minutes or has `null` in any core field (`temperature`, `windSpeed`, `textDescription`), retry against KRAC. If both fail, surface an error state to the client with `meta.stationError` set and show the last successfully cached observation with an "OBS STALE" indicator in the link-status footer.

### 4.2 Trend computation

Trends are derived on the backend from the observation history, not passed through from NWS (NWS does not expose a `pressureTendency` or `temperatureTrend` field). For each metric in `[temperature, dewpoint, barometricPressure, relativeHumidity, windSpeed, visibility]`:

1. Fetch the last ~6 observations (≈3 hours).
2. Filter out observations where the metric is `null` (heatIndex, windChill, seaLevelPressure, etc. frequently null-out; the bar metrics less often but it happens).
3. If fewer than 2 non-null observations, emit `{ direction: 'steady', deltaPerHour: 0, confidence: 'missing' }`.
4. Otherwise compute `deltaPerHour = (latestValue - earliestValue) / hoursSpan`.
5. Apply metric-specific thresholds to pick `direction`:

| Metric | Steady threshold (per hour) | Notes |
|---|---|---|
| Temperature (°F) | ±0.5 | Below threshold → `steady`. |
| Dewpoint (°F) | ±0.3 | Lower threshold because dewpoint moves slowly. |
| Pressure (inHg) | ±0.01 | Meteorological standard is 3-hour change; we use hourly for display consistency with other metrics. |
| Humidity (%) | ±0.5 | |
| Wind (mph) | ±1.0 | Looser threshold because wind is noisy. |
| Visibility (mi) | ±0.3 | Usually just `steady`. |

6. Emit `{ direction, deltaPerHour, confidence: 'ok' }`.

### 4.3 Precipitation outlook (description line)

The `"DRY THRU 19:00"` text on the current-conditions description line is computed by scanning the first 12 hourly forecast periods for the first period with `probabilityOfPrecipitation.value > 30`:

- If the first expected rain is within the next hour: `RAIN IN NNm` (minutes until it starts).
- If within the next 12 hours: `DRY THRU HH:00` (local time of first >30% period).
- If nothing >30% in the next 12 hours: `DRY 24H+`.
- If currently precipitating (detected from `textDescription` matching `/rain|snow|shower|storm|drizzle|sleet/i` on the latest observation — NWS `precipitationLastHour` is unreliable and often null, so don't depend on it): `RAIN NOW · EASING HH:00` (first period after current where `probabilityOfPrecipitation <= 30`).

The backend emits one ready-to-render string for the client; the client does not do any precipitation logic.

### 4.4 Sunrise / sunset

Comes from the `/points` response's `astronomicalData` block — already in hand after the one-time point fetch. The `astronomicalData` is recomputed by NWS per-request, so technically the sunrise/sunset values drift if we cache `/points` forever. In practice we resolve `/points` at startup and cache `astronomicalData` alongside it, re-fetching once per day at midnight Chicago time to refresh the values for the new day.

### 4.5 Caching implementation

- **In-memory only.** Simple `Map<string, { expiresAt: number; data: unknown }>`. No Redis, no disk persistence.
- **Separate TTLs per resource** as listed in 4.1.
- **Cache key is the endpoint path.** Query strings included.
- **On cache miss:** fetch from NWS, store result, emit response with `meta.cacheHit = false`.
- **On cache hit:** emit response with `meta.cacheHit = true` and `meta.nextRefresh` set to the earliest cached entry's expiration.
- **No cache stampede protection.** If two simultaneous requests both miss, both fetch. Volume is too low for this to matter.

### 4.6 Error strategy

- **Transient NWS failure (timeout, 5xx):** retry once after 1 second. If the retry fails, fall through to station fallback (for observations) or surface `meta.error` for forecasts.
- **Rate limit (429):** back off, return cached data with `meta.error = 'rate_limited'` flag. Client renders last-known-good data with a warning in the footer.
- **Malformed response (JSON parse error or schema mismatch):** log and return `meta.error = 'upstream_malformed'`. Never crash the request handler.
- **Missing User-Agent header:** not our problem — we always send it. If NWS rejects us for UA reasons we've broken something in the config.

---

## 5. Shared data contract

The backend exposes a single `GET /api/weather` endpoint that returns the full payload for all four views. This type lives in [shared/types.ts](../../../shared/types.ts) and is imported by both sides.

```typescript
export type IconCode =
  | 'sun' | 'moon'
  | 'partly-day' | 'partly-night'
  | 'cloud' | 'rain' | 'snow' | 'thunder' | 'fog';

export type TrendDirection = 'up' | 'down' | 'steady';

export interface Trend {
  direction: TrendDirection;
  deltaPerHour: number;       // signed, in the metric's native unit
  confidence: 'ok' | 'missing';
}

export interface Wind {
  speedMph: number;
  directionDeg: number;       // 0-359, meteorological (from)
  cardinal: string;           // 'NW', 'ENE', etc.
}

export interface CurrentConditions {
  observedAt: string;         // ISO 8601 UTC
  stationId: string;          // 'KMKE' or 'KRAC' on fallback
  stationDistanceKm: number;  // for the user to know how local the obs is
  tempF: number;
  feelsLikeF: number;         // NWS heatIndex or windChill, or tempF if neither applies
  conditionText: string;      // 'MOSTLY CLOUDY'
  iconCode: IconCode;
  precipOutlook: string;      // pre-rendered string: 'DRY THRU 19:00'
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
  sunrise: string;            // 'HH:MM' in America/Chicago
  sunset: string;             // 'HH:MM' in America/Chicago
}

export interface HourlyPeriod {
  startTime: string;          // ISO 8601
  hourLabel: string;          // 'HH:MM' local, ready to render
  tempF: number;
  iconCode: IconCode;
  precipProbPct: number;
  wind: Wind;
  shortDescription: string;
}

export interface DailyPeriod {
  dateISO: string;            // 'YYYY-MM-DD'
  dayOfWeek: string;          // 'WED'
  dateLabel: string;          // 'APR 15'
  highF: number;
  lowF: number;
  iconCode: IconCode;
  precipProbPct: number;
  shortDescription: string;   // NWS's short forecast, e.g., 'Chance Showers'
}

export interface WeatherMeta {
  fetchedAt: string;          // ISO — when backend served this response
  nextRefreshAt: string;      // ISO — when the soonest-to-expire cache entry becomes stale
  cacheHit: boolean;          // true if all resources served from cache
  stationId: string;          // which station we ended up using
  error?: 'rate_limited' | 'upstream_malformed' | 'station_fallback' | 'partial';
}

export interface WeatherResponse {
  current: CurrentConditions;
  hourly: HourlyPeriod[];     // first 12 periods
  daily: DailyPeriod[];       // 7 days (aggregated from NWS's 14 day/night periods)
  meta: WeatherMeta;
}
```

**Note on daily aggregation:** NWS `/forecast` returns 14 periods, alternating day and night starting from whichever half of the current day we're in. The server collapses day+night pairs into a single `DailyPeriod` where `highF` comes from the day period and `lowF` comes from the night period. When the current time is in a night period, the "today" daily row uses that night's low and the *previous* day's high (if still available) — or just the night's temp if nothing else.

**Icon mapping:** NWS forecast periods include an `icon` URL like `https://api.weather.gov/icons/land/day/few?size=medium`. Parse the slug (`few`, `sct`, `bkn`, `ovc`, `rain`, `rain_showers`, `tsra`, `tsra_sct`, `tsra_hi`, `snow`, `fog`, etc.) and the `day`/`night` segment to pick an `IconCode`. Mapping is a ~20-line switch statement; specific NWS slugs are documented at https://api.weather.gov/icons.

---

## 6. Frontend implementation notes

- **Single page, no router.** The four views are sections in one scrollable page.
- **Single `GET /api/weather` call on load**, repeated every 90 seconds via a `setInterval` in the root component. No manual refresh button needed for v1 (the auto-refresh cadence matches the observation cache TTL).
- **Loading state:** render the full HUD shell with placeholder dashes (`--`, `--:--`, empty bars) on initial mount. When the first response arrives, fill in. Do not show a spinner — the HUD aesthetic is the loading state.
- **Error state:** if `/api/weather` fails or returns `meta.error`, the link-status footer switches from a cyan pulsing dot to a red static dot, and the text changes to `LINK FAIL · CACHED HH:MM:SS` showing the last successful fetch time. Content stays rendered from the last good response.
- **Live clock:** implemented as JavaScript in the root component, not in a global tick. Uses `Intl.DateTimeFormat` with `timeZone: 'America/Chicago'` and `hourCycle: 'h23'`. Updates via `setInterval(tick, 1000)`.
- **Animations:** none, except the pulsing link-status dot (CSS `@keyframes hudBlink`) and the one-time page-load fade-in for the whole panel (optional, 200ms, can be cut).
- **Fonts:** monospace stack `'SF Mono','Consolas','Courier New',monospace`. All system fonts — no web fonts downloaded.

---

## 7. Project structure

```
e:/SkyFrame/
├── package.json              # Single package, all deps here
├── tsconfig.json             # Base TS config
├── tsconfig.server.json      # Extends base for Node backend
├── tsconfig.client.json      # Extends base for Vite/React client
├── vite.config.ts
├── index.html                # Vite entry HTML
├── .gitattributes            # Add when scaffolding (line-ending normalization)
├── shared/
│   └── types.ts              # The WeatherResponse contract, imported by both sides
├── server/
│   ├── index.ts              # Fastify entry, routes, static serving of client dist
│   ├── nws/
│   │   ├── client.ts         # HTTP wrapper with User-Agent, retries, errors
│   │   ├── cache.ts          # In-memory TTL cache
│   │   ├── normalizer.ts     # NWS → shared/types.ts transformation
│   │   ├── trends.ts         # Trend computation per metric
│   │   ├── precip.ts         # Precipitation outlook string logic
│   │   └── icon-mapping.ts   # NWS slug → IconCode
│   └── config.ts             # Hardcoded lat/lon, station IDs, thresholds, User-Agent
└── client/
    ├── main.tsx              # React entry
    ├── App.tsx               # Root, owns fetch/refresh lifecycle
    ├── components/
    │   ├── TopBar.tsx        # Shared top bar with live clock
    │   ├── CurrentPanel.tsx  # Current conditions view
    │   ├── HourlyPanel.tsx   # Hourly forecast view
    │   ├── OutlookPanel.tsx  # 7-day outlook view
    │   ├── Footer.tsx        # Shared footer with link status
    │   └── WxIcon.tsx        # <svg><use href="#wxicon-..." /></svg> wrapper
    ├── styles/
    │   └── hud.css           # All HUD styles, ported from the mockups
    └── icons.svg             # Sprite file with all 9 <symbol> elements
```

---

## 8. Explicit non-goals for v1

These are **intentionally out of scope** and should not be added without reopening a design conversation.

- **UV index.** Not in NWS station observations; would require a second upstream (EPA UV API or gridpoint `uvIndex` field), and the trend semantics don't match weather trends anyway. Reconsider for v1.1 with a "peak + time-to-peak" display if needed.
- **Weather alerts.** Endpoint is `api.weather.gov/alerts/active?point=...` and the data is easy to fetch, but the UI work for an alert banner plus alert detail view isn't scoped here. Defer to v1.1.
- **User preferences.** No settings page, no toggle for °F/°C, no ZIP change. Everything hardcoded. A preferences layer gets added in v2 if multi-location or unit-switching is ever needed.
- **Historical data.** No charts of past conditions, no "today vs. average" comparisons.
- **Radar imagery.** The spec lists it as a "nice to have." Defer — radar tile rendering is a whole sub-project with its own design pass.
- **Offline mode.** No service worker, no IndexedDB persistence. If the server is down, the app is down.
- **Responsive mobile layout.** The HUD is desktop-first. It will render on mobile but the dense grids won't be comfortable below ~600px wide. Acceptable for v1 since the target user is on desktop.
- **Accessibility beyond basics.** Semantic HTML, keyboard-operable (though there's nothing to operate), sufficient color contrast on the cyan-on-black palette. No screen-reader-specific treatment of SVG icons, no ARIA live regions for updating data.
- **Multi-location support.** One ZIP, hardcoded.
- **Animation revisit.** The user explicitly wanted the bar animations dropped from v1 as "looking amateur next to everything else." The pulsing link-status dot is the only intentional motion. Any future animation work is a dedicated design pass, not a casual addition.

---

## 9. Open implementation questions

None blocking. These can be resolved during coding:

- **Precise grid cell widths on the outlook view** when rendered in React — the mockup hardcodes `112px 38px 52px 1fr 68px`. When ported, these may need minor adjustment for the React layout container. Use the mockup as the starting point and tune if something looks off.
- **Error state styling for the link-status footer** — the mockup uses the cyan pulsing dot for the happy path, but doesn't show the error variant. Implementation should add a red (`#ff4444`?) static dot variant that replaces the blink animation on error.
- **How long to display stale cached data before giving up** — if NWS has been unreachable for a long time and we're still rendering data from 2 hours ago, at what point do we show a full-panel error state instead of a small footer warning? Current thinking: 30 minutes of unavailability flips to full error state. Confirm during implementation.

---

## 10. Next step

Invoke the `superpowers:writing-plans` skill to produce a detailed implementation plan from this spec. The plan should break the work into independent task chunks that can either be executed linearly in one session or dispatched in parallel if the tasks have clean boundaries.
