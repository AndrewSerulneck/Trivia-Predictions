import { NextResponse } from "next/server";
import { listOwnerCompetitions } from "@/lib/ownerCompetitions";
import { listOwnerSchedules, ownsVenue } from "@/lib/ownerSchedule";
import { listOwnerVenues } from "@/lib/ownerVenueList";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** One section's answer. Separate per list so one failure still shows the other. */
type ListPayload<T> = { ok: true; items: T[] } | { ok: false; error: string };

/**
 * Turn a lister into its own `ok`/`error` payload. Deliberately NOT a rejected
 * `Promise.all`: a broken schedules query must not blank the rewards section,
 * which is exactly today's per-section behaviour on the dashboard.
 */
const settle = async <T,>(load: Promise<T[]>, fallback: string): Promise<ListPayload<T>> => {
  try {
    return { ok: true, items: await load };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : fallback };
  }
};

/**
 * GET /api/owner/dashboard?venueId=... — everything the Partner Dashboard's first
 * paint needs, in ONE round trip
 * (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 5 / finding F4).
 *
 * It replaces `GET /api/owner/venues` → then `/api/owner/schedule` +
 * `/api/owner/competitions`: three invocations and three `requireOwnerAuth` calls
 * (6 of its 9 queries were the same two auth queries, run three times) become one
 * invocation and ~5 queries. The three per-list routes stay live and unchanged —
 * the venue switch, a section Retry and the post-save refetch still use them.
 *
 * `venueId` is attacker-controlled and is never trusted as proof of anything: a
 * venue the caller does not own is answered with their OWN first venue, the same
 * answer as sending no `venueId` at all (it is a "which tab was open" hint, not
 * an access grant — so it is a fallback, not a 403).
 */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  // The ONE auth check. Same 401 contract (no_session / no_venue) as every other
  // /api/owner route, so ownerAuthRecoveryPath still routes a purged signup.
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  let venues;
  try {
    venues = await listOwnerVenues(auth.venueIds);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load venues." },
      { status: 500 },
    );
  }

  const requestedVenueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const venueId =
    requestedVenueId && ownsVenue(auth, requestedVenueId)
      ? requestedVenueId
      : (venues[0]?.id ?? "");

  // No venue at all: `requireOwnerAuth` normally 401s (no_venue) first, so this is
  // the defensive branch. Null lists, not empty ones — nothing was asked for.
  if (!venueId) {
    return NextResponse.json({
      ok: true,
      venues,
      venueId: null,
      schedules: null,
      competitions: null,
    });
  }

  // No gameType -> merged calendar across both engines, exactly as
  // GET /api/owner/schedule with no filter.
  const [schedules, competitions] = await Promise.all([
    settle(listOwnerSchedules(venueId), "Failed to load schedules."),
    settle(listOwnerCompetitions(auth.ownerId, venueId), "Failed to load competitions."),
  ]);

  return NextResponse.json({ ok: true, venues, venueId, schedules, competitions });
}
