# WxDeck

Local, ad-free weather dashboard for ZIP `53154`. Single user. Serves on localhost.

Full context lives in [PROJECT_SPEC.md](PROJECT_SPEC.md) and [WEATHER_PROVIDER_RESEARCH.md](WEATHER_PROVIDER_RESEARCH.md). Read those rather than trusting a summary — they are the source of truth for scope and provider reasoning.

## Hard rules

These are not preferences, they are product requirements. Do not relax them without explicit confirmation from the user.

- **No ads, no analytics, no telemetry, no third-party trackers** of any kind.
- **No API keys, no account-gated providers.** NOAA/NWS is the primary and intended sole data source; a key-requiring fallback would contradict the spec.
- **No transmitted data beyond what is needed to fetch the forecast.** This rules out crash reporters, usage pings, CDN-hosted fonts with referer leakage, etc.
- **Minimize dependencies.** The spec explicitly calls out low operational cost and minimal bloat. Prefer a small, vetted set of packages over convenience-first pulls.

## Locked technical decisions (2026-04-15)

These were derived from live NOAA/NWS queries and confirmed by the user. They are stable and should not be re-derived.

- **Location:** hardcoded lat/lon `42.89387888628059, -87.92605499945817` (Oak Creek, WI). No runtime ZIP→coord resolution.
- **NWS point metadata** (resolved from `/points/42.8939,-87.9261`, cache-forever):
  - Forecast office: `MKX` (Milwaukee/Sullivan WFO)
  - Grid: `MKX / 88 / 58`
  - Radar: `KMKX`
  - Timezone: `America/Chicago`
  - Forecast zone: `WIZ066`
- **NWS endpoints per view:**
  - Daily / 7-day: `https://api.weather.gov/gridpoints/MKX/88,58/forecast`
  - Hourly: `https://api.weather.gov/gridpoints/MKX/88,58/forecast/hourly`
  - Current conditions: `https://api.weather.gov/stations/{stationId}/observations/latest`
  - Alerts: `https://api.weather.gov/alerts/active?point=42.8939,-87.9261`
- **Observation station:** primary `KMKE` (Milwaukee Mitchell Intl, ~7 km N — first-class ASOS, same side of Lake Michigan at similar distance from shore). Fallback `KRAC` (Racine Batten Intl, ~17 km S) when the latest KMKE observation is older than ~90 min or has null core fields.
- **User-Agent** (required by NWS on every request): `WxDeck/0.1 (ken.culver@gmail.com)`

## Collaboration style

- **Educational tone.** When making a judgment call, explain *why* and what the tradeoff is. When the user needs to choose between options, lay out pros and cons for each, don't just ask. Override the default "short and concise" posture for design and config decisions — brevity still applies to mechanical updates.
- **Don't add features beyond what was asked.** No speculative abstraction, no "while I'm here" cleanup, no hypothetical future-proofing. Three similar lines beats a premature abstraction.
- **Don't narrate the obvious.** Educational ≠ exhaustive. Explain the non-obvious choice; skip the restatement of what the code plainly does.
- **Stack is not yet chosen.** The spec proposes React + Node.js but nothing is committed. Discuss stack options with tradeoffs before scaffolding.

## Provider integration notes

NWS is a point→grid→station flow, not a single-endpoint API. The `/points` call returns URLs for the forecast, hourly forecast, and nearby station list; we resolve it once and cache the result indefinitely. Current conditions come from a separate `/stations/{id}/observations/latest` call, which occasionally returns null for individual fields — that's why a fallback station exists.

NWS requires a `User-Agent` header identifying the app and contact email. Missing or generic User-Agent headers can be rate-limited or rejected.
