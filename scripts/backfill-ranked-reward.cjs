#!/usr/bin/env node
// Pay a weekly places reward's PAST weeks — the weeks before the reward existed, which the
// weekly resolver never settles (docs/live-trivia-weekly-places-reward-plan.md Phase 5, D8).
// A thin CLI over lib/rankedRewardBackfill.ts: same week keys, ranking and award RPC as the
// resolver, so a re-run is a no-op and it can never pay a week the resolver pays.
//
// Dry run (default) — reads only, prints the table to approve:
//   npm run rewards:backfill-ranked -- --campaign <id> --from 2026-08-05
// Apply — PRODUCTION, issues real coupons + in-app notifications:
//   npm run rewards:backfill-ranked -- --campaign <id> --from 2026-08-05 --expiry-days 30 --apply --expect-coupons <n>
//
// --expect-coupons must equal the dry run's coupon count, or nothing is written.
// Run from the repo root. Never prints secrets or player ids beyond usernames.

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
};

const formatPrize = (prize) => {
  if (!prize) return "(no prize)";
  if (prize.prizeKind === "gift_card") return `$${prize.prizeGiftCertificateAmount} gift card`;
  return `menu item (${prize.prizeMenuItemName ?? prize.prizeMenuItem ?? "item"})`;
};

const localDate = (date, timezone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

async function main() {
  const campaignId = argValue("--campaign");
  const fromDate = argValue("--from");
  const apply = args.includes("--apply");
  const expiryDays = argValue("--expiry-days") === null ? 30 : Number(argValue("--expiry-days"));
  const expectRaw = argValue("--expect-coupons");
  if (!campaignId || !fromDate) {
    console.error(
      "Usage: … scripts/backfill-ranked-reward.cjs --campaign <id> --from YYYY-MM-DD [--expiry-days 30] [--apply --expect-coupons <n>]",
    );
    process.exitCode = 1;
    return;
  }
  if (apply && expectRaw === null) {
    console.error("--apply needs --expect-coupons <n> (the coupon count from the approved dry run).");
    process.exitCode = 1;
    return;
  }

  const { planRankedRewardBackfill, applyRankedRewardBackfill } = require("@/lib/rankedRewardBackfill");
  const plan = await planRankedRewardBackfill({ campaignId, fromDate });

  console.log(`Reward: ${plan.campaign.name} (${plan.campaign.id})`);
  console.log(`Venue:  ${plan.venueId} · ${plan.timezone} · created ${plan.campaign.createdAt}`);
  console.log(`Weeks the backfill owns from ${fromDate}: ${plan.weeks.length}\n`);
  for (const week of plan.weeks) {
    const games = week.games.map((game) => game.occurrenceDate.slice(5)).join(", ");
    const head = `Week of ${localDate(week.cycleStart, plan.timezone)} (key ${week.cycleStart.toISOString()}) · games ${games}`;
    if (week.alreadySettled) {
      console.log(`${head}\n  already settled — skipped\n`);
      continue;
    }
    console.log(`${head} · ${week.participantCount} players · ${week.outcome}`);
    for (const place of week.places) {
      console.log(
        `  ${place.place}. ${place.username ?? "(no username)"} — ${place.totalPoints} pts (reached ${place.reachedAt}) → ${formatPrize(place.prize)}`,
      );
    }
    if (week.tiebreakUnresolved) console.log("  ! a paid place was decided by user id (identical score and time)");
    console.log("");
  }
  console.log(`Coupons to issue: ${plan.couponCount} · gift cards total $${plan.giftCardDollars}`);

  if (!apply) {
    console.log(`\nDry run. Nothing written. To apply: --apply --expect-coupons ${plan.couponCount} --expiry-days ${expiryDays}`);
    return;
  }

  const results = await applyRankedRewardBackfill({ plan, expectCoupons: Number(expectRaw), expiryDays });
  console.log("\nApplied:");
  for (const result of results) console.log(`  ${result.cycleStart}  ${result.status}  winners ${result.winnersAwarded}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
