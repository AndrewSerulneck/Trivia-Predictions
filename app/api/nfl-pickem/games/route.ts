import { NextResponse } from "next/server";
import {
  getNFLWeekById,
  isNFLWeekLocked,
  isNFLWeekOpenForPicks,
  isPreseasonPreviewWeek,
  listNFLPickEmGames,
  listNFLWeeks,
} from "@/lib/nflPickEm";
import { resolveRequestUserId } from "@/lib/serverSession";
import { getVenueNFLPickEmScoringMode, type NFLPickEmScoringMode } from "@/lib/venueGameSettings";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get("weekId");
    const venueId = searchParams.get("venueId") || undefined;

    // Picks are attached for this user, so it must be the session's user —
    // otherwise anyone can read a victim's pre-kickoff pick off this endpoint.
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    if (viewer.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const userId = viewer.userId ?? undefined;
    const scoringMode: NFLPickEmScoringMode = venueId
      ? await getVenueNFLPickEmScoringMode(venueId)
      : "standard";

    if (!weekId) {
      return NextResponse.json(
        { ok: false, error: "weekId is required" },
        { status: 400 }
      );
    }

    // Future weeks are never selectable — see docs/nfl-pickem-improvements-plan.md.
    // A client-only filter isn't enough since ?week=/?weekId= is user-controllable.
    const requestedWeek = await getNFLWeekById(weekId);
    if (!requestedWeek) {
      return NextResponse.json(
        { ok: false, error: "NFL Week not found" },
        { status: 404 }
      );
    }
    // isNFLWeekOpenForPicks is the same predicate buildNFLGameWeekOptions uses
    // for the client's week list, so this gate and that list cannot disagree.
    if (!isNFLWeekOpenForPicks(requestedWeek)) {
      // Preseason exception (see buildNFLGameWeekOptions): before any week is
      // open, the single earliest upcoming week is still readable/pickable
      // as a preview. Re-derived server-side — weekId is user-controllable, so
      // "the client's week list included this one" is never sufficient alone.
      const seasonWeeks = await listNFLWeeks(requestedWeek.season, true);
      if (!isPreseasonPreviewWeek(requestedWeek, seasonWeeks)) {
        return NextResponse.json(
          { ok: false, error: "This week has not started yet" },
          { status: 400 }
        );
      }
    }

    // Pass the mode we already resolved: it saves listNFLPickEmGames a second
    // settings read, and it is what lets a standard-mode venue skip the
    // spread-line refresh entirely.
    const result = await listNFLPickEmGames({ weekId, userId, venueId, scoringMode });

    return NextResponse.json({
      ok: true,
      scoringMode,
      // Only meaningful under spread scoring — a standard venue never asked for
      // lines, so their absence is not a degradation to report.
      spreadsUnavailable:
        scoringMode === "spread" ? result.spreadLinesUnavailable : undefined,
      week: {
        id: result.week.id,
        weekNumber: result.week.weekNumber,
        weekStartDate: result.week.weekStartDate,
        weekEndDate: result.week.weekEndDate,
        thursdayKickoff: result.week.thursdayKickoff,
        status: result.week.status,
        isLocked: isNFLWeekLocked(result.week),
      },
      games: result.games.map((game) => ({
        ...game,
        homeSpread: scoringMode === "spread" ? game.homeSpread ?? null : undefined,
        awaySpread: scoringMode === "spread" ? game.awaySpread ?? null : undefined,
      })),
      userSummary: result.userSummary,
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error fetching games:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Failed to load games" 
      },
      { status: 500 }
    );
  }
}
