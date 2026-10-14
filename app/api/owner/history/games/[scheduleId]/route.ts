import { getOwnerGameDetail } from "@/lib/ownerHistory";
import { withOwnerVenue } from "@/lib/ownerHistoryRoute";

/** GET /api/owner/history/games/[scheduleId]?venueId=…&date=YYYY-MM-DD — one past game's final standings. */
export async function GET(request: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  const occurrenceDate = new URL(request.url).searchParams.get("date") ?? "";
  return withOwnerVenue(request, async (venueId) => ({
    game: await getOwnerGameDetail({ venueId, scheduleId, occurrenceDate }),
  }));
}
