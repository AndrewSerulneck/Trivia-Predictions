import { NextResponse } from "next/server";
import { publicBrowserGoogleMapsKey } from "@/lib/googleMapsKeys";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

// GET /api/owner/maps-key — the browser Maps key for the Partner Dashboard's Venue Location page.
// Owner-authenticated sibling of /api/admin/maps-key and /api/signup/maps-key. Not flag-gated:
// admin-activated partners need the map whatever NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED says.
//
// FAILS CLOSED, like the signup route: publicBrowserGoogleMapsKey() (GOOGLE_MAPS_BROWSER_KEY,
// referrer-restricted) or 503. Never the unrestricted server key — anyone who completes a
// self-serve signup is a partner, so this is not a trusted surface.

export async function GET(request: Request): Promise<Response> {
  try {
    await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const apiKey = publicBrowserGoogleMapsKey();
  if (!apiKey) {
    console.error("[OwnerMapsKey] browser-key-unset — set GOOGLE_MAPS_BROWSER_KEY; see docs/self-serve-signup-runbook.md §2");
    return NextResponse.json(
      { ok: false, error: "Maps are temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true, apiKey }, { headers: { "Cache-Control": "no-store" } });
}
