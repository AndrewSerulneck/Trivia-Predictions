import { isScheduleId } from "@/lib/gameReminderOptIns";
import { findUpcomingScheduleOccurrence } from "@/lib/liveShowdownEngine";
import { buildLiveTriviaIcs, venueCalendarLocation } from "@/lib/liveTriviaCalendar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/trivia/live/calendar?venueId=…&scheduleId=…&start=ISO — "Add to calendar" for the next Live
// Trivia game (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3). Returns one .ics event.
//
// Public on purpose: the same game is already public through /api/trivia/live/state (its schedule id and
// start) and the TV screen. Every word in the file comes from the live schedule and the venue row, never
// from the URL, so the link can't be used to serve someone else's text from our domain. A game that
// isn't on (cancelled, moved, already started) is 404.
//
// Cost: only on a tap. Two small reads (the venue's schedules, the venue row); the CDN keeps each game's
// file for 5 minutes.

const notFound = () =>
  new Response("This game isn't scheduled any more.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

type VenueRow = {
  name: string | null;
  display_name: string | null;
  street?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

const loadVenue = async (venueId: string): Promise<VenueRow | null> => {
  if (!supabaseAdmin) return null;
  const full = await supabaseAdmin
    .from("venues")
    .select("name, display_name, street, address, city, state, zip_code")
    .eq("id", venueId)
    .maybeSingle<VenueRow>();
  if (!full.error) return full.data ?? null;
  // Older databases have no `street` column (lib/venues.ts steps down the same way).
  const legacy = await supabaseAdmin
    .from("venues")
    .select("name, display_name, address, city, state, zip_code")
    .eq("id", venueId)
    .maybeSingle<VenueRow>();
  return legacy.error ? null : (legacy.data ?? null);
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const venueId = String(url.searchParams.get("venueId") ?? "").trim();
  const scheduleId = String(url.searchParams.get("scheduleId") ?? "").trim();
  const startMs = Date.parse(String(url.searchParams.get("start") ?? ""));
  if (!venueId || venueId.length > 128 || !isScheduleId(scheduleId) || !Number.isFinite(startMs)) return notFound();

  const nowMs = Date.now();
  let occurrence: Awaited<ReturnType<typeof findUpcomingScheduleOccurrence>>;
  try {
    occurrence = await findUpcomingScheduleOccurrence(venueId, scheduleId, startMs, nowMs);
  } catch {
    return new Response("Try again.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!occurrence) return notFound();

  const venue = await loadVenue(occurrence.venueId);
  const venueName = String(venue?.display_name ?? "").trim() || String(venue?.name ?? "").trim() || null;
  const ics = buildLiveTriviaIcs({
    scheduleId: occurrence.scheduleId,
    venueId: occurrence.venueId,
    venueName,
    location: venue
      ? venueCalendarLocation({
          name: venueName,
          street: venue.street,
          address: venue.address,
          city: venue.city,
          state: venue.state,
          zipCode: venue.zip_code,
        })
      : "",
    startMs: occurrence.startMs,
    endMs: occurrence.endMs,
    nowMs,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="live-trivia.ics"',
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
