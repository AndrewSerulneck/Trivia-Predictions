import { NextResponse } from "next/server";
import { buildAssetLinks, WELL_KNOWN_CACHE_CONTROL } from "@/lib/nativeAppLinks";

// Android App Links + passkey trust file (docs/native-app-store-plan.md Phase 3),
// on both hosts; content and env vars in lib/nativeAppLinks.ts. 404 until
// ANDROID_APP_CERT_SHA256 is set.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const body = buildAssetLinks(request.headers.get("host"));
  if (!body) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  return NextResponse.json(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": WELL_KNOWN_CACHE_CONTROL },
  });
}
