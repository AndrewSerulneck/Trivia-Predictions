import { NextResponse } from "next/server";
import { readNativeAppConfig } from "@/lib/nativeAppConfig";

// GET /api/app/config — public, unauthenticated, no database. The native app
// asks once per launch whether it is still new enough (the "Please update"
// gate, components/native/NativeAppRuntimeImpl.tsx). docs/native-app-store-plan.md
// Phase 3.
//
// Cost: the CDN answers almost every request (s-maxage 5 min, then serves the
// stale copy for up to a day while it refreshes in the background), so the
// function runs about once per 5 minutes per region however many phones ask.
// Website visitors never call it.

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readNativeAppConfig(), {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" },
  });
}
