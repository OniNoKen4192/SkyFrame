# SkyFrame Mockups

Static HTML mockups for SkyFrame v1. These are the *locked* visual designs for each view, produced during the design brainstorming session on 2026-04-15.

## Files

- [current-conditions.html](current-conditions.html) — current conditions panel (hero temp, trends, icon, bars, clock)
- [hourly.html](hourly.html) — 12-hour hourly forecast (temperature line chart, icons, precip bars, hours)
- [outlook.html](outlook.html) — 7-day outlook (date, icon, precip, shared-scale range bar, low/high)

## How to view

Open any of them directly in a browser — they're self-contained and include all CSS, SVG icons, and JavaScript inline. No server needed. The live clock in the top-right will tick from system time reformatted to `America/Chicago`.

The mockups use static sample data (the "currently 62°F" and the 12-hour forecast values are hard-coded placeholders that approximate real NWS responses for Oak Creek, WI). The real implementation fetches this data from NOAA/NWS and drops it into the same DOM structure.

## Relationship to the real app

The mockups are the **source of truth for the visual design**, including colors, spacing, typography, icon glyphs, CSS animations (none currently — the pulsing link-status dot is the only animation), data-layout conventions, and the exact CSS classes that should exist in the React components. When implementing, port the styles and structure from these files verbatim where possible — the brainstorming session did a lot of iteration to lock down details like grid column widths, opacity tiers, and the 20-segment bar structure, and re-deriving them from prose would lose information.
