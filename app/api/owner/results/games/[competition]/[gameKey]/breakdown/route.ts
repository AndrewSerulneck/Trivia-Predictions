import { withOwnerVenue } from "@/lib/ownerHistoryRoute";
import { decodeResultsPathParam } from "@/lib/results/pathParams";
import { getResultsBreakdown } from "@/lib/results/ownerResults";

/**
 * GET /api/owner/results/games/[competition]/[gameKey]/breakdown?venueId=…&entry=… — one player's
 * answers in that game: right/wrong and points per question, with the question text, NEVER the
 * player's typed answer (docs/partner-results-page-plan.md §5d, R1). `entry` is the opaque token
 * from that game's standings; a token from another venue or game is a 404. No SESSION_SECRET → 503.
 * Owner + venue are checked before any read; `Cache-Control: no-store`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ competition: string; gameKey: string }> }) {
  const { competition, gameKey } = await params;
  const entry = new URL(request.url).searchParams.get("entry")?.trim() ?? "";
  return withOwnerVenue(request, (venueId) =>
    getResultsBreakdown({
      venueId,
      competitionId: decodeResultsPathParam(competition),
      gameKey: decodeResultsPathParam(gameKey),
      entry,
    }),
  );
}
