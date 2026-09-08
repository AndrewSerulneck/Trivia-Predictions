import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { fetchVenueStaticMap } from "@/lib/venueStaticMap";

// The Static Maps builder lives in lib/venueStaticMap.ts, shared with the public
// signup sibling (app/api/signup/venue-map/route.ts). This route differs only in
// its admin radius bounds (25–2000 m) and indigo circle colour.

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return new NextResponse("Unauthorized", { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const radius = Math.max(25, Math.min(2000, Number(searchParams.get("radius")) || 150));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new NextResponse("Invalid coordinates", { status: 400 });
  }

  const result = await fetchVenueStaticMap({
    lat,
    lon,
    radiusMeters: radius,
    size: "600x280",
    strokeColor: "0x4f46e5ff",
    fillColor: "0x4f46e520",
  });
  if (!result.ok) {
    return new NextResponse(
      result.status === 500 ? "Maps API not configured" : "Failed to fetch map",
      { status: result.status }
    );
  }

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
    },
  });
}
