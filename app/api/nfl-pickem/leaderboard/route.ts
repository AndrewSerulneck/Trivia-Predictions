import { NextResponse } from "next/server";
import { getNFLPickEmLeaderboard, type NFLLeaderboardMode } from "@/lib/nflPickEm";
import { getWeekTiebreakerGame, listTiebreakerGuesses, rankByTiebreakerProximity } from "@/lib/nflPickEmTiebreaker";
import { resolveRequestUserId } from "@/lib/serverSession";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = (searchParams.get("venueId") ?? searchParams.get("venue") ?? "").trim();
    const mode: NFLLeaderboardMode = searchParams.get("mode") === "season" ? "season" : "week";
    const weekId = (searchParams.get("weekId") ?? "").trim();
    const seasonParam = (searchParams.get("season") ?? "").trim();
    // `userId` decides whose picks get un-hidden before kickoff, so it must be
    // the session's user — never the caller's word for it.
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    if (viewer.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required" }, { status: 400 });
    }

    if (mode === "week" && !weekId) {
      return NextResponse.json({ ok: false, error: "weekId is required when mode=week" }, { status: 400 });
    }

    const season = Number(seasonParam);
    if (mode === "season" && (!seasonParam || !Number.isFinite(season))) {
      return NextResponse.json({ ok: false, error: "season is required when mode=season" }, { status: 400 });
    }

    const result = await getNFLPickEmLeaderboard({
      venueId,
      mode,
      weekId: mode === "week" ? weekId : null,
      season: mode === "season" ? season : null,
      userId: viewer.userId,
    });

    // Tiebreaker guesses only apply to a single week's contest, not the
    // cumulative season view — there is no one "last game" to attach to.
    if (mode !== "week" || !result.weekId || result.entries.length === 0) {
      return NextResponse.json({
        ok: true,
        mode: result.mode,
        weekId: result.weekId,
        season: result.season,
        entries: result.entries,
      });
    }

    const guesses = await listTiebreakerGuesses({
      venueId,
      weekId: result.weekId,
      revealFor: { userId: viewer.userId ?? "" },
    });
    const guessByUser = new Map(guesses.map((guess) => [guess.userId, guess]));

    // "Closest guess among tied leaders": only meaningful once the tiebreaker
    // game is final and more than one entry shares the top rank.
    const tiedLeaders = result.entries.filter((entry) => entry.rank === result.entries[0].rank);
    let tiebreakerWinnerUserId: string | null = null;
    if (tiedLeaders.length > 1) {
      const game = await getWeekTiebreakerGame(result.weekId);
      const actualTotal =
        game?.isFinal && game.homeScore !== null && game.awayScore !== null
          ? game.homeScore + game.awayScore
          : null;
      if (actualTotal !== null) {
        const ranked = rankByTiebreakerProximity(
          tiedLeaders.map((entry) => entry.userId),
          tiedLeaders.map((entry) => ({
            userId: entry.userId,
            predictedTotal: guessByUser.get(entry.userId)?.predictedTotal ?? null,
          })),
          actualTotal
        );
        tiebreakerWinnerUserId = ranked[0] ?? null;
      }
    }

    const entries = result.entries.map((entry) => {
      const guess = guessByUser.get(entry.userId);
      return {
        ...entry,
        tiebreaker: guess
          ? { isHidden: guess.isHidden, predictedTotal: guess.predictedTotal, actualTotal: guess.actualTotal }
          : undefined,
        isTiebreakerWinner: tiebreakerWinnerUserId !== null && entry.userId === tiebreakerWinnerUserId,
      };
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      weekId: result.weekId,
      season: result.season,
      entries,
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error fetching leaderboard:", error);
    const message = error instanceof Error ? error.message : "Failed to load leaderboard";
    const status = /not found/i.test(message) ? 404 : /is required/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
