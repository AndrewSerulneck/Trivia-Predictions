#!/usr/bin/env node
/* Read-only: for every game on a venue's Partner Dashboard Results timeline, opens the game screen
 * (full standings + rewards won at it) and every tappable player's breakdown exactly as the routes
 * would (docs/partner-results-page-plan.md §5d, Phase 3), and checks that each breakdown adds up to
 * the player's standings score and that no response carries a user id. Never writes. Prints
 * usernames, scores and counts only (never a player id, a typed answer or a token).
 *
 * Usage: SESSION_SECRET=<any throwaway value> node --env-file=.env.local --conditions react-server \
 *          --import tsx scripts/check-results-breakdown.cjs <venueId> [<venueId> …]
 * (npm run results:check-breakdown -- <venueId>). Tokens only need to round-trip inside this one
 * process, so any secret works; an environment value takes precedence over .env.local. */
const { getResultsBreakdown, getResultsGameScreen, getResultsTimelinePage } = require("@/lib/results/ownerResults");

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const venueIds = process.argv.slice(2);
if (venueIds.length === 0) {
  console.error("Usage: … scripts/check-results-breakdown.cjs <venueId> [<venueId> …]");
  process.exit(1);
}

/** Any UUID in a response that isn't one of the game keys' schedule ids is a leak. */
const leakedIds = (value, allowed) => [...JSON.stringify(value).matchAll(UUID)].map((m) => m[0]).filter((id) => !allowed.has(id));

(async () => {
  let failures = 0;
  for (const venueId of venueIds) {
    console.log(`\n=== ${venueId}`);
    const games = [];
    let before = null;
    for (let page = 1; page <= 30; page += 1) {
      const result = await getResultsTimelinePage({ venueId, before });
      games.push(...result.games);
      if (!result.nextBefore) break;
      before = result.nextBefore;
    }
    for (const row of games) {
      const scheduleId = row.gameKey.split(":")[0];
      const allowed = new Set([scheduleId]);
      const screen = await getResultsGameScreen({ venueId, competitionId: row.competitionId, gameKey: row.gameKey });
      const tappable = screen.standings.filter((standing) => standing.entry);
      const leaks = leakedIds(screen, allowed);
      const rewards = screen.rewards.map((item) => item.name).join(", ") || "—";
      console.log(
        `  ${row.date} ${screen.game.title}: ${screen.standings.length} scorers (${tappable.length} tappable), players=${screen.game.playerCount}, rewards at game: ${rewards}${leaks.length ? `  ✗ ${leaks.length} id(s) in response` : ""}`,
      );
      if (leaks.length) failures += 1;
      for (const standing of tappable) {
        const breakdown = await getResultsBreakdown({ venueId, competitionId: row.competitionId, gameKey: row.gameKey, entry: standing.entry });
        const blank = breakdown.rows.filter((item) => !item.detail).length;
        const ok = breakdown.total === standing.score && leakedIds(breakdown, allowed).length === 0;
        if (!ok) failures += 1;
        console.log(
          `    #${standing.rank} ${standing.username} ${standing.score} → ${breakdown.rows.length} answers, ${breakdown.rows.filter((item) => item.outcome === "right").length} right, total ${breakdown.total}${blank ? `, ${blank} without question text` : ""} ${ok ? "✓" : "✗ MISMATCH/LEAK"}`,
        );
      }
    }
  }
  console.log(failures ? `\n${failures} problem(s).` : "\nAll breakdowns match their standings; no player ids in any response.");
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
