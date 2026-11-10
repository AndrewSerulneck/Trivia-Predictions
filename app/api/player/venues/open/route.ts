import { NextResponse } from "next/server";
import { openVenueProfileForSession } from "@/lib/playerVenues";
import { createSessionCookie, isSessionEnforced, readSession } from "@/lib/serverSession";

// POST /api/player/venues/open { venueId, userId? } — open a bar the player isn't at, view-only
// (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C1). Switches the signed session to the
// account's EXISTING profile at that bar, as joining does but with no location check: it never creates a
// profile and records no presence, so presence-checked writes stay shut until the player is there.
// `userId` is the player the browser is signed in as (`tp:user-id`); it must match the session (404 otherwise).
// Refuses (503) without SESSION_SECRET: dev shares the production database, and an unsigned claim proves nothing.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSessionEnforced()) {
    return NextResponse.json({ ok: false, error: "Unavailable." }, { status: 503, headers: NO_STORE });
  }
  const sessionUserId = readSession(request);
  if (!sessionUserId) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => ({}))) as { venueId?: unknown; userId?: unknown };
  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  const claimedUserId = typeof body.userId === "string" ? body.userId.trim() || null : null;
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400, headers: NO_STORE });
  }

  const user = await openVenueProfileForSession(sessionUserId, claimedUserId, venueId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers: NO_STORE });
  }
  const response = NextResponse.json({ ok: true, user }, { headers: NO_STORE });
  response.headers.append("Set-Cookie", createSessionCookie(user.id));
  return response;
}
