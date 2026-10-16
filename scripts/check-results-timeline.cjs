#!/usr/bin/env node
/* Read-only: prints every page of a venue's Partner Dashboard Results timeline exactly as
 * GET /api/owner/results would build it (docs/partner-results-page-plan.md §5b, Phase 2), so the
 * reward-placement rules can be checked against production. Never writes. Prints usernames and
 * dates only (never a player id — the timeline carries none).
 * Usage: node --env-file=.env.local --conditions react-server --import tsx \
 *          scripts/check-results-timeline.cjs <venueId> [<venueId> …] */
const { getResultsTimelinePage } = require("@/lib/results/ownerResults");

const venueIds = process.argv.slice(2);
if (venueIds.length === 0) {
  console.error("Usage: … scripts/check-results-timeline.cjs <venueId> [<venueId> …]");
  process.exit(1);
}

const winnersText = (winners) =>
  winners.map((w) => `${w.place ? `#${w.place} ` : ""}${w.username ?? "Deleted player"} ${w.points}`).join(", ");

(async () => {
  for (const venueId of venueIds) {
    console.log(`\n=== ${venueId}`);
    let before = null;
    for (let page = 1; page <= 30; page += 1) {
      const result = await getResultsTimelinePage({ venueId, before });
      console.log(`-- page ${page} before=${before} → nextBefore=${result.nextBefore}${"firstGameDate" in result ? ` firstGameDate=${result.firstGameDate}` : ""}`);
      for (const game of result.games) {
        console.log(`  GAME   ${game.date} ${game.title} players=${game.playerCount} top=${game.topScore} winners=${game.winners.map((w) => w ?? "Deleted player").join("/")} startsAt=${game.startsAt}${game.inProgress ? " (playing)" : ""}`);
      }
      for (const item of result.rewards) {
        const where = item.attach.kind === "game" ? `game ${item.attach.gameKey.split(":").pop()}` : item.attach.kind === "week" ? `week of ${item.attach.weekStart}` : `day ${item.attach.date}`;
        console.log(`  REWARD ${item.date} [${where}] ${item.name} · ${item.cycleLabel} · ${item.howWon} · ${winnersText(item.winners) || item.note || "—"}`);
      }
      if (!result.nextBefore) break;
      before = result.nextBefore;
    }
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
