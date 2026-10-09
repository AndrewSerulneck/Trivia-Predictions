import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation, WELL_KNOWN_CACHE_CONTROL } from "@/lib/nativeAppLinks";

// iOS Universal Links + passkey trust file (docs/native-app-store-plan.md Phase 3).
// No file extension, served as application/json, on both hosts; content and env
// vars in lib/nativeAppLinks.ts. 404 until APPLE_TEAM_ID is set.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const body = buildAppleAppSiteAssociation(request.headers.get("host"));
  if (!body) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  return NextResponse.json(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": WELL_KNOWN_CACHE_CONTROL },
  });
}
