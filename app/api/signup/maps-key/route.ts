import { NextResponse } from "next/server";

import { publicBrowserGoogleMapsKey } from "@/lib/googleMapsKeys";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isSelfServeSignupEnabled } from "@/lib/selfServeSignup";

// Public sibling of app/api/admin/maps-key/route.ts. Same payload, but gated on
// the self-serve flag + the signup rate limiter instead of requireAdminAuth,
// because the caller is a signed-out stranger part-way through /owner/signup.
//
// THIS ROUTE FAILS CLOSED (Finding #5, docs/self-serve-signup-review-fixes-plan.md
// Phase 2). It serves publicBrowserGoogleMapsKey() — GOOGLE_MAPS_BROWSER_KEY and
// nothing else. It must NEVER fall back to GOOGLE_MAPS_API_KEY: that key is
// deliberately not referrer-restricted (server fetches carry no Referer) and
// also carries Places, Geocoding and Static Maps, so handing it to a stranger at
// 10 req/min/IP is a billable key leak. Its authenticated sibling keeps the
// fallback; only this one drops it.
//
// OPS PREREQUISITE (docs/self-serve-signup-runbook.md §2): create the
// referrer-restricted browser key and set GOOGLE_MAPS_BROWSER_KEY BEFORE
// flipping NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED. With the flag on and the key
// unset this route 503s and the wizard's map steps cannot load — a loud,
// greppable failure ([SignupMapsKey] browser-key-unset) instead of a silent
// leak. That is the intended shape of a mid-rollout env skew.

const notFound = () =>
  NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

export async function GET(request: Request) {
  if (!isSelfServeSignupEnabled()) return notFound();

  const limit = await rateLimit(request, "mapsKey");
  if (!limit.allowed) return rateLimitResponse(limit);

  const apiKey = publicBrowserGoogleMapsKey();
  if (!apiKey) {
    console.error(
      "[SignupMapsKey] browser-key-unset — set GOOGLE_MAPS_BROWSER_KEY (referrer-restricted) before enabling self-serve signup; see docs/self-serve-signup-runbook.md §2"
    );
    return NextResponse.json(
      { ok: false, error: "Address maps are temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({ ok: true, apiKey }, { headers: { "Cache-Control": "no-store" } });
}
