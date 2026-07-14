// DEPRECATED (SlimCD): superseded by the Stripe billing flow — POST /api/owner/billing/checkout,
// POST /api/owner/billing/portal, and the webhook /api/webhooks/stripe. Retained only
// for any legacy subscriptions created before the Stripe cutover; no new code should
// call this route. Slated for removal once no active SlimCD subscriptions remain.
import { NextResponse } from "next/server";

// This route has been replaced by the Secure Sessions flow:
//   POST /api/owner/billing/session?intent=update_card  → creates a SlimCD hosted-page session
//   GET  /api/owner/billing/return                      → handles the post-payment redirect

export async function PUT() {
  return NextResponse.json(
    { ok: false, error: "This endpoint has been replaced. Use /api/owner/billing/session with intent=update_card." },
    { status: 410 }
  );
}
