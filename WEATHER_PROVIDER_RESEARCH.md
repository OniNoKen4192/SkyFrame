# Weather Provider Research

Research date: 2026-04-15

## MVP needs

- Fixed location: ZIP `{ZIP}`
- Current conditions
- Hourly forecast
- Daily forecast
- 7-day forecast
- Local app, low complexity, no ads, no tracking

## Shortlist

### 1. NOAA / NWS API

Docs:
- https://www.weather.gov/documentation/services-web-api
- https://api.weather.gov/openapi.json

What it covers well:
- U.S. authoritative forecast data
- Current observations via station endpoints
- Hourly forecast
- Daily forecast
- Alerts

What matters for this project:
- Free and open to use
- No account or billing setup
- Requires a `User-Agent` header
- Uses a point-to-grid flow instead of simple ZIP-first requests

Constraint:
- Official docs state the forecast endpoints return forecast periods over the next seven days, including hourly forecast over the next seven days.

Assessment:
- Best primary source for current conditions and core U.S. forecast data.
- Strong standalone fit now that the MVP target is 7 days.

### 2. Open-Meteo

Docs:
- https://open-meteo.com/en/docs
- https://open-meteo.com/en/about
- https://open-meteo.com/en/docs/gfs-api

What it covers well:
- Current conditions fields
- Hourly forecast
- Daily forecast
- Forecast horizon up to 16 days

What matters for this project:
- JSON is simple and developer-friendly
- No API key required for non-commercial use
- Easy to request exactly the fields needed
- Uses latitude/longitude directly

Constraint:
- For U.S. weather it is aggregating forecast-model data from sources such as NOAA models rather than giving you the NWS point forecast product directly.

Assessment:
- Still the easiest provider to integrate for a clean single-provider MVP.
- Less necessary now that NOAA/NWS can satisfy the trimmed scope directly.

### 3. WeatherAPI.com

Docs:
- https://www.weatherapi.com/docs/
- https://www.weatherapi.com/api.aspx

What it covers well:
- Current conditions
- Hourly forecast
- Daily forecast
- Up to 14-day forecast
- Direct ZIP-code query support

What matters for this project:
- Very straightforward JSON API
- ZIP queries are easy
- Good single-provider ergonomics

Constraint:
- Requires an API key
- Proprietary hosted provider rather than a government/open-data-first path

Assessment:
- Good backup option if you want a very simple commercial-style API and do not mind key management.

### 4. Tomorrow.io

Docs:
- https://docs.tomorrow.io/reference/weather-forecast
- https://docs.tomorrow.io/reference/realtime-weather

What it covers well:
- Realtime endpoint
- Hourly forecast endpoint
- Managed developer experience

Constraint:
- Official forecast docs describe hourly forecasts for the next 120 hours and daily forecasts for the next 5 days.
- That is below the 7-day daily forecast target.

Assessment:
- Not a strong fit for this MVP.

### 5. OpenWeather

Docs:
- https://openweathermap.org/api

What it covers well:
- Current conditions
- Hourly forecast
- Daily forecast

Constraint:
- Official One Call API marketing describes forecast coverage from 1-minute to 8-day forecasts.
- That would satisfy the 7-day requirement, but it is no longer compelling versus NOAA/NWS for this project.

Assessment:
- Easy enough to use, but not aligned with the 10-day target.

## Recommendation

### Recommended source strategy

Option A: Recommended MVP
- Use NOAA/NWS only.
- Hardcode latitude/longitude for ZIP `{ZIP}` or resolve it once during setup.
- Normalize the NWS point, forecast, hourly, and observation responses into one local backend shape.

Why:
- Matches the trimmed 7-day scope directly
- Authoritative U.S. source
- No key management
- Keeps the stack aligned with the original product goal

Tradeoff:
- Slightly more awkward integration than Open-Meteo because NWS uses point/grid/station flows instead of one compact forecast payload

Option B: Simpler implementation
- Use Open-Meteo only.
- Hardcode latitude/longitude for ZIP `{ZIP}`.
- Use one normalized backend response for current, hourly, daily, and 7-day views.

Why:
- Lowest integration friction
- Very digestible JSON
- No key management

Tradeoff:
- Less direct than using the NWS point forecast and station observation products

## Recommended MVP decision

For v1, use NOAA/NWS as the primary and likely only provider.

If your priority is:
- "I want the cleanest implementation path": choose Open-Meteo only.
- "I want the app aligned with official U.S. weather data": choose NOAA/NWS only.
