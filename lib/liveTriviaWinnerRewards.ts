import "server-only";

// ── Game-winner reward resolution ───────────────────────────────────────────
//
// A reward created with winCondition "game_winner" is NOT won by accruing
// points — it goes to whoever WINS a Live Trivia game, whatever the score. Live
// Trivia has no "game over" event (occurrences are time windows derived from
// trivia_schedules), so there is nothing to hook; instead this module sweeps for
// occurrences that have finished and awards their top scorer(s).
//
// Idempotency comes for free from the winner ledger: each occurrence is awarded
// under its OWN cycle_start (the occurrence start instant), and
// challenge_cycle_winners is unique on (challenge_id, cycle_start,
// winner_user_id). Re-running the sweep over an already-resolved game re-awards
// nobody — award_cycle_winner returns won:false for players already in the
// ledger. That is why the sweep can safely use a lookback window wider than the
// cron interval.
//
// TIES: Live Trivia ranks with competition ranking, so a tie for first is real
// (everyone answers the same questions). All players tied for the top score win
// — the quota passed to the RPC is widened to the tie count rather than picking
// an arbitrary single winner. A 4-way tie hands out 4 prizes; the alternative
// (silently denying three legitimate co-winners) creates a worse problem at the
// venue. Only players who actually scored above zero are eligible, so an empty
// or all-zero game awards nobody.
//
// TIE CAP: "widen the quota to the tie count" is unbounded on its own — an easy
// game where a dozen players answer everything correctly would mint a dozen real
// gift cards from a reward the partner configured as one prize. The tie count is
// therefore capped (GAME_WINNER_TIE_QUOTA_CAP). When the cap bites we award the
// lowest user ids deterministically and flag `tieCapApplied` on the resolution so
// the cron report shows it happened rather than swallowing it. Determinism
// matters for more than fairness: standings order among equal scores comes from
// DB row order, which is not stable across queries, so an unsorted subset could
// award a DIFFERENT set of players on a re-sweep and blow past the cap.

import {
  awardCycleWinner,
  getCampaignCloseTimestampMs,
  listChallengeCampaigns,
  updateChallengeCampaign,
} from "@/lib/challengeCampaigns";
import {
  findEndedOccurrences,
  loadOccurrenceFinalStandings,
} from "@/lib/liveShowdownEngine";
import { isRewardsEnabled } from "@/lib/rewardsFlags";
import type { ChallengeCampaign } from "@/types";

/**
 * Most co-winners a single game may mint prizes for. See the TIE CAP note above:
 * without a ceiling, one unusually easy game turns a one-prize reward into an
 * unbounded payout. Tune deliberately — every unit is a real coupon.
 */
export const GAME_WINNER_TIE_QUOTA_CAP = 5;

export type GameWinnerResolution = {
  scheduleId: string;
  occurrenceDate: string;
  venueId: string;
  campaignId: string;
  campaignName: string;
  /** Users newly awarded on this sweep (already-ledgered winners are excluded). */
  awardedUserIds: string[];
  topPoints: number;
  /** How many players tied for first (>1 means co-winners). */
  tiedCount: number;
  /** True when tiedCount exceeded GAME_WINNER_TIE_QUOTA_CAP and the field was trimmed. */
  tieCapApplied: boolean;
};

export type ResolveGameWinnerRewardsReport = {
  occurrencesExamined: number;
  campaignsExamined: number;
  resolutions: GameWinnerResolution[];
  errors: Array<{ scope: string; message: string }>;
};

/** Does this campaign apply to the given venue? Mirrors campaignMatchesVenue's intent. */
function campaignCoversVenue(campaign: ChallengeCampaign, venueId: string): boolean {
  // A game-winner reward is always created with a non-empty venue_ids (createReward
  // enforces this). An empty list would mean "global", which we deliberately do NOT
  // honor here — a global game-winner reward would fire at every venue at once.
  return campaign.venueIds.length > 0 && campaign.venueIds.includes(venueId);
}

/**
 * Was this reward actually on offer for this game? The sweep's lookback window is
 * deliberately wider than the cron interval so missed runs self-heal, which means
 * it also reaches games that finished BEFORE the reward existed. Without this
 * check a partner who creates a game-winner reward at 9:50pm immediately mints a
 * prize for the 9:00pm game that just ended — a payout nobody announced and no
 * player was playing for.
 *
 * The bar is "the reward existed when the game STARTED", not merely when it
 * ended: a reward created mid-game was not on offer to the players who were
 * already playing. Deliberately conservative, because the failure mode on the
 * other side is spending real money.
 */
function campaignWasLiveForOccurrence(
  campaign: ChallengeCampaign,
  occurrence: { startMs: number; endMs: number },
): boolean {
  // Already resolved — matches isCampaignEligibleAtTime's first gate.
  if (campaign.winnerUserId) return false;

  const createdAtMs = Date.parse(String(campaign.createdAt ?? ""));
  // An unparseable created_at is not a licence to award; fail closed.
  if (!Number.isFinite(createdAtMs)) return false;
  if (occurrence.startMs < createdAtMs) return false;

  // A campaign past its end date must not keep awarding. createReward never sets
  // endDate today, so this guards admin-edited rows (the raw edit form can set
  // one on any campaign, including a wizard-created reward).
  const closeAtMs = getCampaignCloseTimestampMs(campaign);
  if (closeAtMs !== null && occurrence.endMs > closeAtMs) return false;

  return true;
}

/**
 * Resolve every game-winner reward whose venue finished a Live Trivia game in
 * the lookback window. Safe to run repeatedly (see idempotency note above).
 *
 * One bad occurrence or campaign never aborts the sweep — failures are collected
 * into the report so the rest still resolve.
 */
export async function resolveGameWinnerRewards(
  nowMs: number = Date.now(),
): Promise<ResolveGameWinnerRewardsReport> {
  const report: ResolveGameWinnerRewardsReport = {
    occurrencesExamined: 0,
    campaignsExamined: 0,
    resolutions: [],
    errors: [],
  };

  // With the Rewards flag off, multi-winner behavior is clamped elsewhere; a
  // game-winner reward can't be created at all in that state (createReward
  // rejects it — see REWARD_GAME_WINNER_DISABLED_MESSAGE in lib/rewards.ts),
  // but an existing row must not be resolved by a flag-off deployment either.
  if (!isRewardsEnabled()) return report;

  // Oldest game first. A one-off reward can only be spent once, so which game
  // claims it must be deterministic (the earliest eligible one) rather than a
  // function of whatever order the schedule rows came back in.
  const occurrences = (await findEndedOccurrences(nowMs)).sort((a, b) => a.startMs - b.startMs);
  report.occurrencesExamined = occurrences.length;
  if (occurrences.length === 0) return report;

  // Fetch per venue rather than one unscoped listChallengeCampaigns() call —
  // that call caps at 200 rows globally, so a venue's game-winner campaign
  // could be truncated by unrelated campaigns at OTHER venues filling the cap
  // first. Scoping by venue pushes the cap to apply per venue instead (see
  // listChallengeCampaigns's venue_ids overlap filter in challengeCampaigns.ts).
  const venueIds = Array.from(new Set(occurrences.map((occurrence) => occurrence.venueId)));
  const campaignsByVenue = await Promise.all(
    venueIds.map((venueId) => listChallengeCampaigns({ venueId })),
  );
  const gameWinnerCampaignById = new Map<string, ChallengeCampaign>();
  for (const campaigns of campaignsByVenue) {
    for (const campaign of campaigns) {
      if (campaign.isActive && campaign.winCondition === "game_winner") {
        gameWinnerCampaignById.set(campaign.id, campaign);
      }
    }
  }
  const gameWinnerCampaigns = Array.from(gameWinnerCampaignById.values());
  report.campaignsExamined = gameWinnerCampaigns.length;
  if (gameWinnerCampaigns.length === 0) return report;

  // One-off rewards spent earlier in THIS sweep. gameWinnerCampaigns is captured
  // once up front, so deactivating a campaign in the database does not remove it
  // from this in-memory list — without this set, a venue whose 6pm and 9pm games
  // both land in the lookback window would award the same one-off reward twice.
  const spentCampaignIds = new Set<string>();

  for (const occurrence of occurrences) {
    const campaigns = gameWinnerCampaigns.filter(
      (campaign) =>
        !spentCampaignIds.has(campaign.id) &&
        campaignCoversVenue(campaign, occurrence.venueId) &&
        campaignWasLiveForOccurrence(campaign, occurrence),
    );
    if (campaigns.length === 0) continue;

    let standings: Array<{ userId: string; totalPoints: number }>;
    try {
      standings = await loadOccurrenceFinalStandings(
        occurrence.scheduleId,
        occurrence.occurrenceDate,
      );
    } catch (error) {
      report.errors.push({
        scope: `${occurrence.scheduleId}@${occurrence.occurrenceDate}`,
        message: error instanceof Error ? error.message : "Failed to load standings.",
      });
      continue;
    }

    // Nobody scored — no winner to award. Leave the reward active so the next
    // game can resolve it.
    const topPoints = standings[0]?.totalPoints ?? 0;
    if (topPoints <= 0) continue;

    // Sorted by user id so the tied field is in a STABLE order across sweeps —
    // see the TIE CAP note. Without this, a capped tie could award a different
    // subset on each sweep and exceed the cap in aggregate.
    const tiedForFirst = standings
      .filter((entry) => entry.totalPoints === topPoints)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const tieCapApplied = tiedForFirst.length > GAME_WINNER_TIE_QUOTA_CAP;
    const winners = tiedForFirst.slice(0, GAME_WINNER_TIE_QUOTA_CAP);

    // The occurrence's own start instant is the cycle key — one game, one cycle.
    // This is what makes re-running the sweep a no-op.
    const cycleStart = new Date(occurrence.startMs);
    const now = new Date(nowMs);

    for (const campaign of campaigns) {
      const awardedUserIds: string[] = [];
      try {
        for (const winner of winners) {
          const { won } = await awardCycleWinner({
            campaign,
            userId: winner.userId,
            venueId: occurrence.venueId,
            cycleStart,
            pointsEarned: winner.totalPoints,
            // Widen the quota to the (capped) tie count so every co-winner we
            // honor is honored. The RPC still enforces this cap atomically.
            winnerQuota: winners.length,
            now,
          });
          if (won) awardedUserIds.push(winner.userId);
        }
      } catch (error) {
        report.errors.push({
          scope: `${campaign.id}@${occurrence.occurrenceDate}`,
          message: error instanceof Error ? error.message : "Failed to award winner.",
        });
        continue;
      }

      if (awardedUserIds.length > 0) {
        report.resolutions.push({
          scheduleId: occurrence.scheduleId,
          occurrenceDate: occurrence.occurrenceDate,
          venueId: occurrence.venueId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          awardedUserIds,
          topPoints,
          tiedCount: tiedForFirst.length,
          tieCapApplied,
        });
      }

      // A one-off (non-recurring) game-winner reward is spent once its game has
      // produced winners: deactivate it so the next night's game doesn't award
      // it again. Recurring rewards stay active and resolve every occurrence.
      const isRecurring = Boolean(campaign.recurringType && campaign.recurringType !== "none");
      if (!isRecurring && awardedUserIds.length > 0) {
        // Mark it spent BEFORE the write: if the update fails we still must not
        // award this reward again later in the same sweep.
        spentCampaignIds.add(campaign.id);
        try {
          await deactivateResolvedReward(campaign, awardedUserIds[0]);
        } catch (error) {
          report.errors.push({
            scope: `${campaign.id}:deactivate`,
            message: error instanceof Error ? error.message : "Failed to deactivate reward.",
          });
        }
      }
    }
  }

  return report;
}

/**
 * Mark a one-off game-winner reward as spent. winner_user_id is retained only as
 * a non-null "resolved" marker for legacy readers — under multi-winner it no
 * longer means "the winner" (see the same note in challengeCampaigns.ts).
 */
async function deactivateResolvedReward(
  campaign: ChallengeCampaign,
  fallbackWinnerId: string,
): Promise<void> {
  await updateChallengeCampaign({
    id: campaign.id,
    isActive: false,
    winnerUserId: campaign.winnerUserId ?? fallbackWinnerId,
  });
}
