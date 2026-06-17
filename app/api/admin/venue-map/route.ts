import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";
const CIRCLE_POINTS = 24;

function buildCirclePath(lat: number, lon: number, radiusMeters: number): string {
  const latRad = (lat * Math.PI) / 180;
  const points: string[] = [];
  for (let i = 0; i <= CIRCLE_POINTS; i++) {
    const angle = (i / CIRCLE_POINTS) * 2 * Math.PI;
    const dLat = (radiusMeters / 111320) * Math.cos(angle);
    const dLon = (radiusMeters / (111320 * Math.cos(latRad))) * Math.sin(angle);
    points.push(`${(lat + dLat).toFixed(6)},${(lon + dLon).toFixed(6)}`);
  }
  return points.join("|");
}

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

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return new NextResponse("Maps API not configured", { status: 500 });
  }

  const params = new URLSearchParams({
    center: `${lat},${lon}`,
    zoom: "16",
    size: "600x280",
    scale: "2",
    maptype: "roadmap",
    markers: `color:red|${lat},${lon}`,
    key: apiKey,
  });

  const circlePath = `color:0x4f46e5ff|weight:2|fillcolor:0x4f46e520|${buildCirclePath(lat, lon, radius)}`;
  const url = `${STATIC_MAPS_BASE}?${params.toString()}&path=${encodeURIComponent(circlePath)}`;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return new NextResponse("Failed to fetch map", { status: response.status });
  }

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "no-store",
    },
  });
}
