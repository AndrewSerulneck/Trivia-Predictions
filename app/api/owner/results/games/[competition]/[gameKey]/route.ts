import { withOwnerVenue } from "@/lib/ownerHistoryRoute";
import { decodeResultsPathParam } from "@/lib/results/pathParams";
import { getResultsGameScreen } from "@/lib/results/ownerResults";

/**
 * GET /api/owner/results/games/[competition]/[gameKey]?venueId=… — one game's full standings (each
 * scorer with an opaque `entry` for their breakdown) and the rewards won at it
 * (docs/partner-results-page-plan.md §5e). Owner + venue are checked before any read; another
 * venue's game is a 404; `Cache-Control: no-store`. Usernames and scores only, never a player id.
 */
export async function GET(request: Request, { params }: { params: Promise<{ competition: string; gameKey: string }> }) {
  const { competition, gameKey } = await params;
  return withOwnerVenue(request, (venueId) =>
    getResultsGameScreen({
      venueId,
      competitionId: decodeResultsPathParam(competition),
      gameKey: decodeResultsPathParam(gameKey),
    }),
  );
}
