import "server-only";

// ── One-off backfill of a weekly places reward's PAST weeks ─────────────────
//
// docs/live-trivia-weekly-places-reward-plan.md Phase 5. A weekly places reward
// created today is settled by the resolver from its creation week on (D8); the
// weeks before it existed are paid only by an operator running
// scripts/backfill-ranked-reward.cjs, which is a thin CLI over this module.
//
// It adds NOTHING to the money path: the weeks come from planBackfillRankedWeeks
// (the resolver's own game list and computeCycleStart key), the places from
// rankWeekPlaces, the totals from loadLiveTriviaWeekTotals, and the payout from
// awardRankedCyclePlaces → the award_ranked_cycle_places RPC — the only writer,
// which refuses a week already settled. So a re-run is a no-op, and the backfill
// and the resolver can never both pay a week.
//
// DRY RUN FIRST: planRankedRewardBackfill reads only. applyRankedRewardBackfill
// refuses unless the caller states how many coupons it expects to issue, so what
// gets paid is exactly the dry-run table the developer approved (plan D11).

import {
  awardRankedCyclePlaces,
  listActiveRankedPlaceCampaigns,
  listChallengeCycleSettlements,
  type RankedCycleAwardStatus,
} from "@/lib/challengeCampaigns";
import { loadLiveTriviaSchedulesForVenues } from "@/lib/liveShowdownEngine";
import {
  isWeekSettled,
  isLiveTriviaRankedCampaign,
  planBackfillRankedWeeks,
  rankedRewardConfigError,
  SETTLED_WEEK_MATCH_TOLERANCE_MS,
  type RankedWeekGame,
} from "@/lib/liveTriviaRankedRewards";
import { loadLiveTriviaWeekTotals } from "@/lib/liveTriviaWeekTotals";
import { rankWeekPlaces, type RankedWeekOutcome } from "@/lib/rankedPlaceRewards";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign, RewardPlacePrize } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** D3: backfilled coupons last 30 days from the day they are issued. */
export const BACKFILL_DEFAULT_EXPIRY_DAYS = 30;

export type BackfillPlace = {
  place: number;
  userId: string;
  username: string | null;
  totalPoints: number;
  reachedAt: string | null;
  prize: RewardPlacePrize | null;
};

export type BackfillWeek = {
  /** computeCycleStart of the week: the settlement / ledger key. */
  cycleStart: Date;
  games: RankedWeekGame[];
  /** Already settled (by an earlier backfill run): skipped, never re-ranked. */
  alreadySettled: boolean;
  participantCount: number;
  outcome: RankedWeekOutcome | null;
  places: BackfillPlace[];
  /** A paid place was decided by user id, not by who got there first (D1). Look at it. */
  tiebreakUnresolved: boolean;
};

export type RankedRewardBackfillPlan = {
  campaign: ChallengeCampaign;
  venueId: string;
  timezone: string;
  fromDate: string;
  weeks: BackfillWeek[];
  /** Coupons an apply would issue now (unsettled weeks only). */
  couponCount: number;
  /** Sum of the gift-card amounts of those coupons, in dollars (menu-item prizes add 0). */
  giftCardDollars: number;
};

export type BackfillWeekResult = {
  cycleStart: string;
  status: RankedCycleAwardStatus | "skipped_settled";
  winnersAwarded: number;
};

const usernamesById = async (userIds: readonly string[]): Promise<Map<string, string>> => {
  const ids = [...new Set(userIds)];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, username")
    .in("id", ids)
    .returns<Array<{ id: string; username: string | null }>>();
  if (error) throw new Error(`Failed to load usernames: ${error.message}`);
  for (const row of data ?? []) if (row.username) map.set(row.id, row.username);
  return map;
};

/**
 * Read-only: which past weeks the backfill owns, who places in each, and what an apply
 * would issue. Throws when the reward isn't an active, sweepable weekly places reward.
 */
export async function planRankedRewardBackfill(params: {
  campaignId: string;
  fromDate: string;
  nowMs?: number;
}): Promise<RankedRewardBackfillPlan> {
  const nowMs = params.nowMs ?? Date.now();
  const campaign = (await listActiveRankedPlaceCampaigns()).find(
    (row) => row.id === params.campaignId && isLiveTriviaRankedCampaign(row),
  );
  if (!campaign) {
    throw new Error(`No active, unresolved weekly places reward with id ${params.campaignId}.`);
  }
  const configError = rankedRewardConfigError(campaign);
  if (configError) throw new Error(configError);
  const venueId = campaign.venueIds[0];

  const [schedules, timezone] = await Promise.all([
    loadLiveTriviaSchedulesForVenues([venueId]),
    getVenueTimezone(venueId),
  ]);
  const owned = planBackfillRankedWeeks({
    campaign,
    venueId,
    schedules,
    timezone,
    nowMs,
    fromDate: params.fromDate,
  });

  const settlements =
    owned.length === 0
      ? []
      : await listChallengeCycleSettlements({
          challengeIds: [campaign.id],
          cycleStartFrom: new Date(owned[0].cycleStart.getTime() - SETTLED_WEEK_MATCH_TOLERANCE_MS),
        });

  const placeCount = campaign.placePrizes?.length ?? 0;
  const weeks: BackfillWeek[] = [];
  for (const week of owned) {
    if (isWeekSettled(settlements, campaign.id, week.cycleStart.getTime())) {
      weeks.push({
        cycleStart: week.cycleStart,
        games: week.games,
        alreadySettled: true,
        participantCount: 0,
        outcome: null,
        places: [],
        tiebreakUnresolved: false,
      });
      continue;
    }
    const ranked = rankWeekPlaces({
      totals: await loadLiveTriviaWeekTotals(week.games),
      placeCount,
      minPlayers: campaign.minPlayers ?? null,
    });
    weeks.push({
      cycleStart: week.cycleStart,
      games: week.games,
      alreadySettled: false,
      participantCount: ranked.participantCount,
      outcome: ranked.outcome,
      places: ranked.places.map((place) => ({
        place: place.place,
        userId: place.userId,
        username: null,
        totalPoints: place.totalPoints,
        reachedAt: place.reachedAt,
        prize: campaign.placePrizes?.find((prize) => prize.place === place.place) ?? null,
      })),
      tiebreakUnresolved: ranked.tiebreakUnresolved,
    });
  }

  const names = await usernamesById(weeks.flatMap((week) => week.places.map((place) => place.userId)));
  for (const week of weeks) {
    for (const place of week.places) place.username = names.get(place.userId) ?? null;
  }

  const paid = weeks.filter((week) => !week.alreadySettled).flatMap((week) => week.places);
  return {
    campaign,
    venueId,
    timezone,
    fromDate: params.fromDate,
    weeks,
    couponCount: paid.length,
    giftCardDollars: paid.reduce(
      (sum, place) =>
        sum + (place.prize?.prizeKind === "gift_card" ? Number(place.prize.prizeGiftCertificateAmount) || 0 : 0),
      0,
    ),
  };
}

/**
 * Pay a plan's unsettled weeks, oldest first, through the award RPC (one transaction per
 * week). Refuses — before writing anything — unless `expectCoupons` equals the plan's
 * coupon count, so an apply can only issue what the approved dry run showed. Weeks nobody
 * scored in are settled too (recorded as no_scorers), so the Game Results history and the
 * resolver both see them as done. Stops at the first error; a re-run skips settled weeks.
 */
export async function applyRankedRewardBackfill(params: {
  plan: RankedRewardBackfillPlan;
  expectCoupons: number;
  expiryDays?: number;
  nowMs?: number;
}): Promise<BackfillWeekResult[]> {
  const { plan } = params;
  if (!Number.isInteger(params.expectCoupons) || params.expectCoupons !== plan.couponCount) {
    throw new Error(
      `Refusing to apply: the plan issues ${plan.couponCount} coupons but ${params.expectCoupons} were expected. ` +
        "Re-run the dry run and compare.",
    );
  }
  const expiryDays = params.expiryDays ?? BACKFILL_DEFAULT_EXPIRY_DAYS;
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365) {
    throw new Error(`Invalid expiry days: ${expiryDays} (1-365).`);
  }
  const now = new Date(params.nowMs ?? Date.now());
  const prizeExpiresAt = new Date(now.getTime() + expiryDays * DAY_MS);

  const results: BackfillWeekResult[] = [];
  for (const week of plan.weeks) {
    const cycleStart = week.cycleStart.toISOString();
    if (week.alreadySettled) {
      results.push({ cycleStart, status: "skipped_settled", winnersAwarded: 0 });
      continue;
    }
    const { status, winnersAwarded } = await awardRankedCyclePlaces({
      campaign: plan.campaign,
      venueId: plan.venueId,
      cycleStart: week.cycleStart,
      places: week.places.map((place) => ({
        place: place.place,
        userId: place.userId,
        totalPoints: place.totalPoints,
        reachedAt: place.reachedAt,
      })),
      participantCount: week.participantCount,
      now,
      prizeExpiresAt,
    });
    results.push({ cycleStart, status, winnersAwarded });
  }
  return results;
}
