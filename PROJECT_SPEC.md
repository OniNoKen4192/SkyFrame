# Project Spec

## 1. Overview

### Project Name
SkyFrame

### One-Sentence Summary
SkyFrame is a local web app that provides fast, no-ad, low-friction weather information for ZIP code `{ZIP}`.

### Problem Statement
Most weather websites are cluttered with ads, autoplay media, tracking, and unnecessary content. The primary user wants immediate access to accurate weather data in a clean local interface without the bloat of commercial weather sites.

### Goals
- Deliver current and near-term weather information for `{ZIP}` quickly on app load.
- Present core forecast views in a clean, readable, low-distraction UI.
- Use authoritative public weather data sources, ideally NOAA/NWS, with minimal processing overhead.

### Non-Goals
- SkyFrame v1 will not attempt to replicate the full feature set of commercial weather platforms.
- SkyFrame v1 will not include ads, analytics tracking, social features, account systems, or heavy personalization.

## 2. Users

### Target Users
- Primary user: the project owner running the app locally.
- Secondary user: none for v1.

### User Pain Points
- Existing weather sites are slow and cluttered.
- Weather information is often buried behind ads and unrelated content.
- Checking current conditions, hourly, and multi-day views should not require digging through multiple pages.

### Primary Use Cases
1. The user opens the app and immediately sees weather information for `{ZIP}`.
2. The user checks current conditions, hourly, daily, and 7-day forecast data without navigating away or dismissing clutter.
3. The user refreshes the app later in the day and gets updated forecast data for the same default location.

## 3. Product Scope

### Core Features
1. Default location weather dashboard
   - Purpose: Make `{ZIP}` the zero-click default experience.
   - User value: The app is useful immediately on launch.
2. Forecast views
   - Purpose: Show current conditions, hourly forecast, daily forecast, and 7-day forecast in separate but consistent sections.
   - User value: The user can get the exact forecast horizon they need without digging.
3. Lightweight presentation
   - Purpose: Prioritize speed, readability, and low visual noise.
   - User value: The interface stays faster and clearer than ad-supported alternatives.

### v1 Must-Haves
- Default weather view for ZIP code `{ZIP}`.
- Current conditions view.
- Hourly forecast view.
- Daily forecast view.
- 7-day forecast view.
- Local-first operation with no ads and no analytics tracking.

### v1 Nice-to-Haves
- Basic radar or precipitation visualization if available from the chosen data source without major complexity.

### Future Considerations
- Weather alerts and advisories.
- Severe weather emphasis for the default area.
- Sunrise/sunset, air quality, and other secondary weather metrics.
- Optional offline caching of recent forecast responses.

## 4. Functional Requirements

### User Flows
1. User opens the local web app.
2. The app loads weather data for `{ZIP}` automatically.
3. The system displays current conditions, hourly, daily, and 7-day forecast sections.
4. The user refreshes or revisits the app later.
5. The system fetches updated data for `{ZIP}` and renders it with clear loading and failure states.

### Requirements
- The system must default to ZIP code `{ZIP}` on first load.
- The system must retrieve weather data from NOAA/NWS as the primary weather source.
- The system must present current conditions, hourly forecast, daily forecast, and 7-day forecast in clearly separated sections.
- The system should load quickly on a local machine and minimize unnecessary dependencies.
- The system should cache responses briefly to avoid redundant upstream requests and improve responsiveness.
- The system should show a clear loading state and a clear failure state when weather data is unavailable.
- The system should not include ads, third-party trackers, or unrelated content modules.

## 5. UX and Interface

### Platform
- Local web app served on `localhost`.

### UI Expectations
- Single-dashboard layout optimized for fast scanning.
- Clear sections for current/near-term and multi-day outlooks.
- Responsive design that works on desktop and tablet/mobile browser widths.
- Minimal chrome and minimal interaction cost.

### Accessibility
- Keyboard-accessible navigation for all controls.
- Semantic structure for forecast sections so assistive technologies can parse the page reliably.
- Sufficient color contrast for key forecast information and alert states.

## 6. Technical Scope

### Proposed Stack
- Frontend: React-based single-page app or similarly lightweight web UI.
- Backend: Lightweight local API layer in Node.js to fetch, normalize, and cache upstream weather data.
- Data store: none required for v1; optional small local store such as SQLite or JSON for preferences/cache.
- Hosting: local development server on the user's machine.
- Auth: none for v1.

### Integrations
- Primary target: NOAA/NWS data sources.
- Optional fallback: none required for MVP.

### Constraints
- Must run as a local app.
- Team size is effectively one user/developer.
- The app should avoid unnecessary operational cost.
- Source data should be accurate and from correct providers rather than convenience-first consumer APIs.

## 7. Data and Security

### Data Model
- Location: ZIP code, display name, latitude/longitude, default flag.
- Forecast snapshot: source metadata, fetched timestamp, current conditions, hourly periods, daily periods.
- App preferences: default ZIP and refresh settings.

### Privacy / Security Requirements
- No user authentication is required for v1.
- No multi-user authorization model is required for v1.
- The app should avoid transmitting any data other than what is necessary to request weather information from upstream providers.
- The app should avoid third-party analytics and tracking scripts entirely.

## 8. Success Criteria

### Launch Criteria
- The app loads weather information for `{ZIP}` successfully on startup.
- All four required forecast views are available and readable.
- The app remains noticeably cleaner and faster than common commercial weather sites.

### Metrics
- Time to useful weather view on local startup.
- Successful forecast fetch rate.
- Manual satisfaction metric: the user prefers SkyFrame over existing weather sites for routine checks.

## 9. Delivery Plan

### Milestones
1. Confirm NOAA/NWS endpoint strategy for current conditions, hourly, daily, and 7-day forecast.
2. Build a thin backend that fetches and normalizes weather data for `{ZIP}`.
3. Build the local dashboard UI centered on `{ZIP}`.
4. Add loading/error states and lightweight caching.
5. Validate accuracy and usability, then ship as local v1.

### Risks
- NOAA/NWS point, grid, and observation endpoints may require normalization before they fit a simple dashboard shape.
- ZIP-code-based lookup may still require a one-time geocoding step before weather endpoints can be queried, unless coordinates are hardcoded for `{ZIP}`.
- Upstream provider response formats, limits, or availability may require a fallback design.

### Open Questions
- Which exact NOAA/NWS endpoints will power current conditions, hourly, daily, and 7-day forecast views?
- Should the MVP hardcode the latitude/longitude for `{ZIP}`, or derive it from a ZIP lookup at runtime?
- Which nearby observation station should be treated as the preferred current-conditions source for `{ZIP}`?
