import { withOwnerVenue } from "@/lib/ownerHistoryRoute";
import { getResultsTimelinePage } from "@/lib/results/ownerResults";

/**
 * GET /api/owner/results?venueId=…&before=YYYY-MM-DD — one page of the venue's Results timeline:
 * games and the rewards won, newest first (docs/partner-results-page-plan.md §5e). `before` is the
 * previous page's `nextBefore`. Owner + venue are checked before any read; `Cache-Control: no-store`.
 */
export async function GET(request: Request) {
  const before = new URL(request.url).searchParams.get("before");
  return withOwnerVenue(request, (venueId) => getResultsTimelinePage({ venueId, before }));
}
