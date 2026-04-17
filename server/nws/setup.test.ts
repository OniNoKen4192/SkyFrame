import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSetup, GEOCODER_USER_AGENT, buildNwsUserAgent } from './setup';

// Minimal valid NWS /points response
function nwsPointsResponse() {
  return {
    properties: {
      gridId: 'LOT',
      gridX: 75,
      gridY: 72,
      timeZone: 'America/Chicago',
      forecastZone: 'https://api.weather.gov/zones/forecast/ILZ014',
      observationStations: 'https://api.weather.gov/gridpoints/LOT/75,72/stations',
      relativeLocation: { properties: { city: 'Chicago', state: 'IL' } },
    },
  };
}

function nwsStationsResponse() {
  return {
    features: [
      { properties: { stationIdentifier: 'KORD' } },
      { properties: { stationIdentifier: 'KMDW' } },
    ],
  };
}

describe('resolveSetup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function setupZipMocks() {
    // Nominatim geocode → NWS /points → NWS /stations
    return vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '41.8781', lon: '-87.6298' }]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(nwsPointsResponse()), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(nwsStationsResponse()), { status: 200 }),
      );
  }

  describe('User-Agent headers', () => {
    it('sends app-only User-Agent to Nominatim (no email)', async () => {
      const fetchSpy = setupZipMocks();

      await resolveSetup({ location: '60614', email: 'user@example.com' });

      // First call is to Nominatim
      const [, nominatimInit] = fetchSpy.mock.calls[0]!;
      const ua = new Headers(nominatimInit!.headers).get('user-agent');

      expect(ua).toBe(GEOCODER_USER_AGENT);
      expect(ua).not.toContain('user@example.com');
    });

    it('sends email-bearing User-Agent to NWS /points', async () => {
      const fetchSpy = setupZipMocks();

      await resolveSetup({ location: '60614', email: 'user@example.com' });

      // Second call is NWS /points
      const [, pointsInit] = fetchSpy.mock.calls[1]!;
      expect(new Headers(pointsInit!.headers).get('user-agent')).toBe('SkyFrame/0.1 (user@example.com)');
    });

    it('sends email-bearing User-Agent to NWS /stations', async () => {
      const fetchSpy = setupZipMocks();

      await resolveSetup({ location: '60614', email: 'user@example.com' });

      // Third call is NWS /stations
      const [, stationsInit] = fetchSpy.mock.calls[2]!;
      expect(new Headers(stationsInit!.headers).get('user-agent')).toBe('SkyFrame/0.1 (user@example.com)');
    });

    it('skips Nominatim entirely for lat/lon input', async () => {
      // Only NWS calls: /points → /stations
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify(nwsPointsResponse()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(nwsStationsResponse()), { status: 200 }),
        );

      await resolveSetup({ location: '41.8781, -87.6298', email: 'user@example.com' });

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Both calls should be NWS (email-bearing)
      for (const call of fetchSpy.mock.calls) {
        const [url, init] = call;
        expect(url).toContain('api.weather.gov');
        expect(new Headers(init!.headers).get('user-agent')).toBe('SkyFrame/0.1 (user@example.com)');
      }
    });
  });
});

describe('buildNwsUserAgent', () => {
  it('includes the email in parentheses', () => {
    expect(buildNwsUserAgent('me@test.com')).toBe('SkyFrame/0.1 (me@test.com)');
  });
});

describe('GEOCODER_USER_AGENT', () => {
  it('does not contain any email or parenthesized contact', () => {
    expect(GEOCODER_USER_AGENT).toBe('SkyFrame/0.1');
    expect(GEOCODER_USER_AGENT).not.toContain('@');
    expect(GEOCODER_USER_AGENT).not.toContain('(');
  });
});
