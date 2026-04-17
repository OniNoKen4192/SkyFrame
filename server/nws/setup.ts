import type { SkyFrameLocationConfig } from '../config';

const NWS_BASE = 'https://api.weather.gov';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

const ZIP_RE = /^\d{5}$/;
const LATLON_RE = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/;

interface SetupInput {
  location: string;
  email: string;
}

interface ResolvedLocation {
  lat: number;
  lon: number;
}

async function geocodeZip(zip: string, userAgent: string): Promise<ResolvedLocation> {
  const url = `${NOMINATIM_BASE}/search?postalcode=${zip}&country=US&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
  const data = await res.json() as Array<{ lat: string; lon: string }>;
  if (!data.length) throw new Error(`No results for ZIP ${zip}`);
  return { lat: parseFloat(data[0]!.lat), lon: parseFloat(data[0]!.lon) };
}

function parseLatLon(input: string): ResolvedLocation | null {
  const match = input.trim().match(LATLON_RE);
  if (!match) return null;
  const lat = parseFloat(match[1]!);
  const lon = parseFloat(match[2]!);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

interface NwsPointProps {
  gridId: string;
  gridX: number;
  gridY: number;
  timeZone: string;
  forecastZone: string;
  observationStations: string;
  relativeLocation: {
    properties: {
      city: string;
      state: string;
    };
  };
}

export async function resolveSetup(input: SetupInput): Promise<SkyFrameLocationConfig> {
  const { location, email } = input;
  const userAgent = `SkyFrame/0.1 (${email})`;

  // 1. Parse input → lat/lon
  let coords: ResolvedLocation;
  if (ZIP_RE.test(location.trim())) {
    coords = await geocodeZip(location.trim(), userAgent);
  } else {
    const parsed = parseLatLon(location);
    if (!parsed) throw new Error('Enter a 5-digit ZIP code or lat,lon coordinates.');
    coords = parsed;
  }

  // 2. Call NWS /points to get grid metadata
  const pointsUrl = `${NWS_BASE}/points/${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
  const pointsRes = await fetch(pointsUrl, { headers: { 'User-Agent': userAgent } });
  if (!pointsRes.ok) throw new Error(`NWS /points returned ${pointsRes.status}. Check your coordinates.`);
  const pointsData = await pointsRes.json() as { properties: NwsPointProps };
  const props = pointsData.properties;

  // 3. Extract forecast zone from the URL (last segment)
  const zoneMatch = props.forecastZone.match(/([A-Z]{3}\d{3})$/);
  const forecastZone = zoneMatch ? zoneMatch[1]! : props.forecastZone;

  // 4. Get nearby observation stations
  const stationsRes = await fetch(props.observationStations, {
    headers: { 'User-Agent': userAgent },
  });
  if (!stationsRes.ok) throw new Error(`NWS /stations returned ${stationsRes.status}`);
  const stationsData = await stationsRes.json() as {
    features: Array<{ properties: { stationIdentifier: string } }>;
  };
  const stationIds = stationsData.features.map((f) => f.properties.stationIdentifier);
  if (stationIds.length < 1) throw new Error('No observation stations found near this location.');

  // 5. Assemble the config
  const city = props.relativeLocation.properties.city.toUpperCase();
  const state = props.relativeLocation.properties.state.toUpperCase();

  return {
    lat: coords.lat,
    lon: coords.lon,
    email,
    forecastOffice: props.gridId,
    gridX: props.gridX,
    gridY: props.gridY,
    timezone: props.timeZone,
    forecastZone,
    stationPrimary: stationIds[0]!,
    stationFallback: stationIds[1] ?? stationIds[0]!,
    locationName: `${city} ${state}`,
  };
}
