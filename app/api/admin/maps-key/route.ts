import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { browserGoogleMapsKey } from "@/lib/googleMapsKeys";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });
  }

  // Same browser key the public /api/signup/maps-key serves — see
  // lib/googleMapsKeys.ts. Adding the HTTP-referrer restriction for the signup
  // flow must be verified against the admin venue map too, since it is this key.
  const apiKey = browserGoogleMapsKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Maps API not configured." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, apiKey });
}
