/**
 * Placeholder geocoding: a small fixed city -> lat/lon lookup, standing in for the real
 * geocoding the pipeline will eventually do against `GeoPoint`/`place_nuts`. Enough to compute
 * a straight-line distance between a company's home base and a tender's place of performance
 * for the geography criterion in `engine.ts`. Unknown cities fall through to `null`, which the
 * engine treats honestly as "distance not known" rather than guessing.
 */
export const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  augsburg: { lat: 48.3705, lon: 10.8978 },
  münchen: { lat: 48.1351, lon: 11.582 },
  munich: { lat: 48.1351, lon: 11.582 },
  plauen: { lat: 50.4952, lon: 12.1378 },
  hamburg: { lat: 53.5511, lon: 9.9937 },
  bremen: { lat: 53.0793, lon: 8.8017 },
  kiel: { lat: 54.3233, lon: 10.1228 },
  tuttlingen: { lat: 47.9833, lon: 8.8167 },
  gessertshausen: { lat: 48.2833, lon: 10.7333 },
  berlin: { lat: 52.52, lon: 13.405 },
  frankfurt: { lat: 50.1109, lon: 8.6821 },
  köln: { lat: 50.9375, lon: 6.9603 },
  koeln: { lat: 50.9375, lon: 6.9603 },
  cologne: { lat: 50.9375, lon: 6.9603 },
  stuttgart: { lat: 48.7758, lon: 9.1829 },
  dresden: { lat: 51.0504, lon: 13.7373 },
  leipzig: { lat: 51.3397, lon: 12.3731 },
  reichenbach: { lat: 50.6167, lon: 12.3 },
};

function normalize(city: string): string {
  return city.trim().toLowerCase();
}

export function lookupCity(city: string | null | undefined): { lat: number; lon: number } | null {
  if (!city) return null;
  return CITY_COORDS[normalize(city)] ?? null;
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
