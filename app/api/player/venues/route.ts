import { NextResponse } from "next/server";
import { listRecentVenuesForSession } from "@/lib/playerVenues";
import { readSession } from "@/lib/serverSession";

// GET /api/player/venues?userId=U[&venueId=X] — "Your bars" (docs/cancelled-prizes-pick-windows-away-mode-plan.md,
// D6 + Phase C1): the bars the SIGNED-IN player checked in at in the last 90 days, newest first, plus `venueId`
// when their account has a profile there. The player is the signed `tp_sess` session's only; no session (or no
// SESSION_SECRET) is an empty list, never someone else's bars. `userId` is the player the browser is signed in as
// (`tp:user-id`); a session for another player answers an empty list (lib/playerVenues.ts, readSessionUser).

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const sessionUserId = readSession(request);
  if (!sessionUserId) {
    return NextResponse.json({ ok: true, venues: [] }, { headers: NO_STORE });
  }
  const params = new URL(request.url).searchParams;
  const claimedUserId = params.get("userId")?.trim() || null;
  const requestedVenueId = params.get("venueId")?.trim() || null;
  const venues = await listRecentVenuesForSession(sessionUserId, claimedUserId, requestedVenueId);
  if (!venues) {
    return NextResponse.json({ ok: false, error: "Unavailable." }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, venues }, { headers: NO_STORE });
}
