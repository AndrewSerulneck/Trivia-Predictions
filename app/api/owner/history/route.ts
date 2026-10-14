import { NextResponse } from "next/server";
import { listOwnerGameHistory, listOwnerRewardHistory } from "@/lib/ownerHistory";
import { withOwnerVenue } from "@/lib/ownerHistoryRoute";

/**
 * GET /api/owner/history?venueId=…&kind=games|rewards&before=… — one page of a venue's Past Winners
 * (docs/live-trivia-weekly-places-reward-plan.md §5f). `before` is the previous page's `nextBefore`.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (kind !== "games" && kind !== "rewards") {
    return NextResponse.json({ ok: false, error: "kind must be games or rewards." }, { status: 400 });
  }
  const before = params.get("before");
  return withOwnerVenue(request, (venueId) =>
    kind === "games" ? listOwnerGameHistory({ venueId, before }) : listOwnerRewardHistory({ venueId, before }),
  );
}
