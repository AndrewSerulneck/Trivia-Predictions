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
