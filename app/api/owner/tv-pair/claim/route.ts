import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { claimPairingCode } from "@/lib/tvPairing";

// Owner-authed: the partner claims the code their TV is showing, binding it to a
// venue they control. Venue ownership is enforced here (mirrors the Phase 4
// schedule boundary) before the code is touched.
export const runtime = "nodejs";

export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as { code?: string; venueId?: string };
  const code = String(body.code ?? "").trim();
  const venueId = String(body.venueId ?? "").trim();

  if (!code) return NextResponse.json({ ok: false, error: "A pairing code is required." }, { status: 400 });
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });

  // Venue ownership is enforced before the code is touched.
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }

  try {
    const result = await claimPairingCode(code, venueId);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    // Map the claim failure reason onto an HTTP status + friendly message.
    if (result.reason === "not_found") {
      return NextResponse.json(
        { ok: false, error: "That code wasn't found. Check the code on your TV and try again." },
        { status: 404 },
      );
    }
    // expired / already_used → 409 (the code is gone or taken).
    return NextResponse.json(
      {
        ok: false,
        error:
          result.reason === "expired"
            ? "That code has expired. Refresh the TV to get a new one."
            : "That code has already been used. Refresh the TV to get a new one.",
      },
      { status: 409 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to link the TV." },
      { status: 500 },
    );
  }
}
