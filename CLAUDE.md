# SkyFrame

Local, ad-free weather dashboard for ZIP `{ZIP}`. Single user. Serves on localhost.

Full context lives in [PROJECT_SPEC.md](PROJECT_SPEC.md) and [WEATHER_PROVIDER_RESEARCH.md](WEATHER_PROVIDER_RESEARCH.md). Read those rather than trusting a summary — they are the source of truth for scope and provider reasoning.

## Hard rules

These are not preferences, they are product requirements. Do not relax them without explicit confirmation from the user.

- **No ads, no analytics, no telemetry, no third-party trackers** of any kind.
- **No API keys, no account-gated providers.** NOAA/NWS is the primary and intended sole data source; a key-requiring fallback would contradict the spec.
- **No transmitted data beyond what is needed to fetch the forecast.** This rules out crash reporters, usage pings, CDN-hosted fonts with referer leakage, etc.
- **Minimize dependencies.** The spec explicitly calls out low operational cost and minimal bloat. Prefer a small, vetted set of packages over convenience-first pulls.

## Location + identity config

All location-specific values (lat/lon, NWS grid coordinates, observation stations, contact email for User-Agent) live in `.env` (gitignored). Copy `.env.example` to `.env` and fill in your values.

To find your NWS metadata: `curl https://api.weather.gov/points/{lat},{lon}` — the response contains the forecast office, grid coordinates, timezone, forecast zone, and nearby observation stations.

**NWS endpoints** (constructed at runtime from `.env` values):
- Daily / 7-day: `/gridpoints/{office}/{gridX},{gridY}/forecast`
- Hourly: `/gridpoints/{office}/{gridX},{gridY}/forecast/hourly`
- Current conditions: `/stations/{stationId}/observations/latest`
- Alerts: `/alerts/active?point={lat},{lon}`

**Station fallback:** when the primary station's latest observation is older than ~90 min or has null core fields, the server falls back to the secondary station configured in `.env`. The user can also manually pin to the secondary by clicking the `LINK.XXXX` button in the Footer — useful when the primary is responding but reporting physically impossible values (a scenario the automatic staleness check can't catch).

**User-Agent** (required by NWS on every request): `SkyFrame/0.1 ({SKYFRAME_EMAIL from .env})`

## Collaboration style

- **Educational tone.** When making a judgment call, explain *why* and what the tradeoff is. When the user needs to choose between options, lay out pros and cons for each, don't just ask. Override the default "short and concise" posture for design and config decisions — brevity still applies to mechanical updates.
- **Don't add features beyond what was asked.** No speculative abstraction, no "while I'm here" cleanup, no hypothetical future-proofing. Three similar lines beats a premature abstraction.
- **Don't narrate the obvious.** Educational ≠ exhaustive. Explain the non-obvious choice; skip the restatement of what the code plainly does.
- **Stack is committed.** React 18 + Vite 5 (client) + Fastify 5 + TypeScript 5.4 + Vitest 1.6 (server). See `PROJECT_STATUS.md` for the current file tree. Stack-level changes (swapping Fastify, adding a state library, etc.) still warrant a brainstorm — but the default is "use what's there."

## Dev tools

### Debug alert injection (PR #3, 2026-04-16)

Set `SKYFRAME_DEBUG_TIERS` to a comma-separated list of `AlertTier` values to replace the real NWS alerts fetch with synthetic alerts. Useful for visually verifying tier colors, banner dismiss/expand behavior, and multi-alert layout without waiting for real weather.

```
SKYFRAME_DEBUG_TIERS=tornado-warning npm run server          # single red banner
SKYFRAME_DEBUG_TIERS=tornado-warning,flood,watch npm run server  # 3 alerts, expand toggle
```

Valid tier names: `tornado-emergency`, `tornado-pds`, `tornado-warning`, `tstorm-destructive`, `severe-warning`, `blizzard`, `winter-storm`, `flood`, `heat`, `special-weather-statement`, `watch`, `advisory-high`, `advisory`. Unknown names are silently dropped. When unset, production behavior is unchanged.

A startup log line confirms when debug mode is active — safety net against leaving it set accidentally.

Implementation: `server/nws/debug-alerts.ts` (parser + synthesizer), wired through `CONFIG.debug.injectTiers` in `server/config.ts`.

## Housekeeping

- **Update the feature list** in `PROJECT_STATUS.md` → "Implemented features" whenever a feature is completed. This is the source of truth for what's shipped — keeps us from having to crawl the codebase to check.

## Provider integration notes

NWS is a point→grid→station flow, not a single-endpoint API. The `/points` call returns URLs for the forecast, hourly forecast, and nearby station list; we resolve it once and cache the result indefinitely. Current conditions come from a separate `/stations/{id}/observations/latest` call, which occasionally returns null for individual fields — that's why a fallback station exists.

NWS requires a `User-Agent` header identifying the app and contact email. Missing or generic User-Agent headers can be rate-limited or rejected.
