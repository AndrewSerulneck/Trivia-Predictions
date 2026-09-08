import "server-only";

import { serverGoogleMapsKey } from "@/lib/googleMapsKeys";

/**
 * The one Google Static Maps thumbnail builder, shared by
 * `app/api/admin/venue-map/route.ts` and its public signup sibling
 * `app/api/signup/venue-map/route.ts` (Finding #10 of
 * docs/self-serve-signup-review-fixes-plan.md). The two routes previously carried
 * byte-identical copies of `buildCirclePath` and the param assembly and differed
 * only in radius bounds (clamped by the caller, not here) and circle colour
 * (`strokeColor` / `fillColor` arguments). Do not fork this again.
 *
 * The API key is read through `serverGoogleMapsKey()` — the single server-side
 * reader of `GOOGLE_MAPS_API_KEY` (Finding #9). It never reaches the browser on
 * this path.
 */

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";
const CIRCLE_POINTS = 24;

/**
 * `dLon = radius / (111320 * cos(latRad))` divides by ~6e-17 at a pole and emits
 * absurd longitudes, spending a Google request that returns 400. The circle is a
 * cosmetic overlay on a venue geofence, so clamping the latitude used for the
 * cosine (never the plotted point) keeps the maths finite everywhere with no
 * visible change away from the poles.
 */
const MAX_ABS_LAT_FOR_COSINE = 89.9;

export type VenueStaticMapRequest = {
  lat: number;
  lon: number;
  radiusMeters: number;
  /** e.g. "600x280" (admin) or "600x260" (signup). */
  size: string;
  /** 8-hex ARGB-less RGBA, e.g. "0x4f46e5ff". */
  strokeColor: string;
  /** 8-hex, e.g. "0x4f46e520". */
  fillColor: string;
};

export type VenueStaticMapResult =
  | { ok: true; body: ArrayBuffer; contentType: string }
  | { ok: false; status: number; error: string };

function buildCirclePath(lat: number, lon: number, radiusMeters: number): string {
  const cosineLat = Math.max(-MAX_ABS_LAT_FOR_COSINE, Math.min(MAX_ABS_LAT_FOR_COSINE, lat));
  const latRad = (cosineLat * Math.PI) / 180;
  const points: string[] = [];
  for (let i = 0; i <= CIRCLE_POINTS; i++) {
    const angle = (i / CIRCLE_POINTS) * 2 * Math.PI;
    const dLat = (radiusMeters / 111320) * Math.cos(angle);
    const dLon = (radiusMeters / (111320 * Math.cos(latRad))) * Math.sin(angle);
    points.push(`${(lat + dLat).toFixed(6)},${(lon + dLon).toFixed(6)}`);
  }
  return points.join("|");
}

export async function fetchVenueStaticMap(
  req: VenueStaticMapRequest
): Promise<VenueStaticMapResult> {
  const apiKey = serverGoogleMapsKey();
  if (!apiKey) {
    return { ok: false, status: 500, error: "Maps API not configured." };
  }

  const { lat, lon, radiusMeters, size, strokeColor, fillColor } = req;
  const params = new URLSearchParams({
    center: `${lat},${lon}`,
    zoom: "16",
    size,
    scale: "2",
    maptype: "roadmap",
    markers: `color:red|${lat},${lon}`,
    key: apiKey,
  });
  const circlePath = `color:${strokeColor}|weight:2|fillcolor:${fillColor}|${buildCirclePath(
    lat,
    lon,
    radiusMeters
  )}`;
  const url = `${STATIC_MAPS_BASE}?${params.toString()}&path=${encodeURIComponent(circlePath)}`;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return { ok: false, status: response.status, error: "Failed to fetch map." };
  }

  const body = await response.arrayBuffer();
  return {
    ok: true,
    body,
    contentType: response.headers.get("Content-Type") ?? "image/png",
  };
}
