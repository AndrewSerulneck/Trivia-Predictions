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

    // A venue_game_settings read error must not take the games list down —
    // getVenueGameSettings throws on any Supabase error, so an unguarded call
    // here 500s NFL Pick 'Em for every venue, including standard-mode venues
    // that never opted into spread scoring. (A *missing* row is not an error;
    // it maps to "standard" inside the lib.)
    //
    // On failure we report the mode as unresolved rather than guessing, because
    // both guesses are wrong in ways that only show up later:
    //   - "standard": a spread venue's players pick with no line on screen, and
    //     once the read recovers the settlement sweep grades those same picks
    //     against the spread — shown one game, graded on another.
    //   - "spread": standard venues see spreads they are not graded on.
    // Unresolved is honest and costs nothing extra: the client already has a
    // degraded "spreads unavailable" surface to share (Phase 3).
    // 503-ing the venue is also honest but takes the whole week's games down
    // for what is a display-only unknown.
    let scoringMode: NFLPickEmScoringMode | null = venueId ? null : "standard";
    if (venueId) {
      try {
        scoringMode = await getVenueNFLPickEmScoringMode(venueId);
      } catch (error) {
        console.warn(
          `[NFL Pick 'Em] Could not resolve scoring mode for venue ${venueId}; reporting it as unresolved.`,
          error
        );
      }
    }

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
    // spread-line refresh entirely. When we could not resolve it, pass
    // undefined so the lib re-resolves with its own degradation
    // (resolveScoringModeForLineRefresh: refresh the lines anyway, since
    // skipping the refresh for a venue that is actually on spread is what
    // strands picks later).
    const result = await listNFLPickEmGames({
      weekId,
      userId,
      venueId,
      scoringMode: scoringMode ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      // null = we could not read the venue's mode on this request. Deliberately
      // not coerced to a mode; see the comment at the read above.
      scoringMode,
      // Distinct from `spreadsUnavailable`: "we don't know the rules" is not the
      // same state as "spread venue, lines missing", and the client says
      // something different for each.
      scoringModeUnresolved: scoringMode === null ? true : undefined,
      // Only meaningful under spread scoring — a standard venue never asked for
      // lines, so their absence is not a degradation to report. Left undefined
      // when the mode is unresolved too: with no mode we cannot say whether
      // lines were even applicable, and collapsing "not applicable" and
      // "unknown" into one value is what this phase exists to avoid.
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
      // An unresolved mode hides spreads, same as standard: showing a line we
      // cannot confirm the player is graded against is the one outcome worse
      // than showing none.
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
