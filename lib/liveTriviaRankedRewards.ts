import "server-only";

// ── Weekly ranked-places reward resolution ──────────────────────────────────
//
// A reward created with winCondition "ranked_places" pays 1st / 2nd / 3rd place
// for a WEEK of Live Trivia: each player's points across every game in the week
// are added up, and the top players get that place's prize
// (docs/live-trivia-weekly-places-reward-plan.md §5c). Live Trivia has no
// "game over" event, so — like the game-winner sweep it runs beside in
// /api/cron/resolve-live-trivia-winners — this module sweeps for weeks whose
// last game has ended and settles them.
//
// WHO PLACES WHERE is rankWeekPlaces (lib/rankedPlaceRewards.ts), never this
// file. WHO GETS PAID is the award_ranked_cycle_places RPC (through
// awardRankedCyclePlaces), the only writer of ranked wins: one transaction writes
// the week's settlement row, ledger rows and coupons, and refuses a week that is
// already settled. That is what makes re-running this sweep a no-op.
//
// SETTLEMENTS FIRST: every week the RPC settles leaves a challenge_cycle_settlements
// row — including weeks nobody won (no scorers, or below the partner's minimum).
// The sweep reads those rows for every due week in ONE query and skips settled
// weeks before touching any scores, which is what keeps a 5-minute cadence cheap:
// scores are read once per reward per week.
//
// THE WEEK KEY is computeCycleStart(campaign, <game start>, venueTz) — the same
// key the Rewards panel reads (resolveCurrentCycleWinnersForSnapshot). A key this
// file invented would mint a second set of prizes on re-sweep and leave the panel
// showing no winners (same trap as lib/nflPickEmWinnerRewards.ts). Games are
// grouped into weeks by that key, so a week is exactly "the games whose start
// falls in that cycle".
//
// WHICH GAMES COUNT: the venue's Live Trivia games, enumerated by
// enumerateScheduleOccurrences (the single source of truth for when games run),
// narrowed by the reward's pinned slots (game_winner_slots; null = every game, the
// same rule as the game-winner sweep).
//
// WHEN A WEEK IS DUE: once now ≥ the end of its last game. There is no grace
// window: nothing changes live_showdown_answers.points_awarded after a game's
// window closes (checked 2026-10-14, Phase 2 handoff §5 — closest-guess points are
// settled by live-state polls DURING the game, and the only other writers are
// deletes: admin schedule reset/delete and player account deletion). Settled
// weeks are final; a correction is a reviewed manual repair, never a re-award.
//
// WHICH WEEKS (D8): a week counts if the reward existed before that week's last
// game ENDED — a reward created mid-week covers the nights already played that
// week. Weeks that ended before the reward existed are never settled here; they
// are the backfill script's (Phase 5: planBackfillRankedWeeks +
// scripts/backfill-ranked-reward.cjs). Lookback is RANKED_WEEK_LOOKBACK_CYCLES
// weeks, so a missed sweep self-heals. Deliberately separate from the
// game-winner sweep's 6-hour ENDED_OCCURRENCE_LOOKBACK_MS.

import {
  awardRankedCyclePlaces,
  computeCycleStart,
  getCampaignCloseTimestampMs,
  listActiveRankedPlaceCampaigns,
  listChallengeCycleSettlements,
  type ChallengeCycleSettlementRecord,
  type RankedCycleAwardStatus,
} from "@/lib/challengeCampaigns";
import {
  enumerateScheduleOccurrences,
  loadLiveTriviaSchedulesForVenues,
  type TriviaScheduleRow,
} from "@/lib/liveShowdownEngine";
import { loadLiveTriviaWeekTotals, type LiveTriviaGameRef } from "@/lib/liveTriviaWeekTotals";
import { rankWeekPlaces } from "@/lib/rankedPlaceRewards";
import { LIVE_TRIVIA_REWARD_DEFINITION_ID } from "@/lib/rewardDefinitions";
import { occurrenceMatchesSlots, weekdayForOccurrenceDate } from "@/lib/rewardGameSlots";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weeks the sweep looks at: the current one and the one before it. */
export const RANKED_WEEK_LOOKBACK_CYCLES = 2;

/**
 * enumerateScheduleOccurrences only lists games from 7 days before to 14 days
 * after its probe instant, so the sweep probes at now, now − 7d and now − 14d to
 * see every game of both lookback weeks (the older one can start 14 days ago).
 */
const ENUMERATION_PROBE_OFFSETS_DAYS = [0, 7, 14] as const;

const probesAround = (nowMs: number): number[] =>
  ENUMERATION_PROBE_OFFSETS_DAYS.map((offsetDays) => nowMs - offsetDays * DAY_MS);

/**
 * A settlement whose cycle_start is within this distance of a due week's key is
 * treated as that week. Weeks are 7 days apart, so this can never confuse two real
 * weeks, while it absorbs a key computed in the wrong timezone: getVenueTimezone
 * falls back to America/New_York on a read error, which would shift the key by the
 * venue's offset and — against an exact-match check alone — mint a second set of
 * prizes for a week already paid. Failing that way skips nothing it should pay:
 * the RPC still refuses the exact key on its own.
 */
export const SETTLED_WEEK_MATCH_TOLERANCE_MS = 12 * 60 * 60 * 1000;

/** One game of a ranked week (venue-local occurrence date — never re-convert it). */
export type RankedWeekGame = LiveTriviaGameRef & { startMs: number; endMs: number };

export type DueRankedWeek = {
  /** computeCycleStart of the week — THE settlement / ledger key. */
  cycleStart: Date;
  games: RankedWeekGame[];
  lastGameEndMs: number;
};

export type RankedWeekSettlement = {
  campaignId: string;
  campaignName: string;
  venueId: string;
  cycleStart: string;
  gameCount: number;
  participantCount: number;
  status: RankedCycleAwardStatus;
  /** Places paid by THIS sweep (empty unless status is "awarded"). */
  winners: Array<{ place: number; userId: string; totalPoints: number }>;
  tiebreakUnresolved: boolean;
};

export type ResolveRankedPlaceRewardsReport = {
  campaignsExamined: number;
  /** Ended weeks inside the lookback that the reward was live for. */
  weeksDue: number;
  /** Due weeks skipped because a settlement row already exists (the normal case). */
  weeksAlreadySettled: number;
  /** Weeks this sweep wrote a settlement for (awarded + noScorers + belowMinimum). */
  weeksSettled: number;
  noScorers: number;
  belowMinimum: number;
  /** Awarded weeks where user id had to break a tie for a paid place — look at these. */
  tiebreakUnresolved: number;
  /** The RPC found the week already settled (a concurrent sweep, or an exact-key ledger row). */
  alreadyResolved: number;
  settlements: RankedWeekSettlement[];
  errors: Array<{ scope: string; message: string }>;
};

/**
 * A Live Trivia weekly places prize — the only kind this sweep (and the backfill) pays. Another
 * game's ranked_places prize, or one with no definition id, is never Live Trivia's to settle
 * (docs/squares-and-brackets-plan.md §13 F1).
 */
export function isLiveTriviaRankedCampaign(campaign: ChallengeCampaign): boolean {
  return campaign.rewardDefinitionId === LIVE_TRIVIA_REWARD_DEFINITION_ID;
}

/**
 * Why this reward can't be swept, or null when it can. createReward (Phase 3)
 * refuses each of these; this guards admin-edited rows. Reported every sweep so a
 * broken reward is visible in the logs rather than silently never paying.
 */
export function rankedRewardConfigError(campaign: ChallengeCampaign): string | null {
  if (campaign.venueIds.length !== 1) {
    return "A weekly places reward must be for exactly one venue.";
  }
  if (campaign.recurringType !== "weekly") {
    return "A weekly places reward must repeat weekly.";
  }
  if (!campaign.placePrizes || campaign.placePrizes.length === 0) {
    return "A weekly places reward has no valid prize ladder.";
  }
  return null;
}

/**
 * The venue's games for each of the given week keys. Pure. The ONE place that decides
 * which games make up a ranked week: the resolver (planDueRankedWeeks) and the Rewards
 * card (planCurrentRankedWeek) both read it, so the card's "so far" is exactly the
 * resolver's final total.
 */
const collectGamesByWeekKey = (params: {
  campaign: ChallengeCampaign;
  venueId: string;
  schedules: readonly TriviaScheduleRow[];
  timezone: string;
  /**
   * Instants to enumerate games around (each sees 7 days back to 14 days ahead) — see
   * probesAround. Together they must cover every week in `keys`.
   */
  probesMs: readonly number[];
  keys: readonly Date[];
}): Map<number, RankedWeekGame[]> => {
  const { campaign, venueId, timezone } = params;
  const gamesByKey = new Map<number, RankedWeekGame[]>(params.keys.map((key) => [key.getTime(), []]));

  const seen = new Set<string>();
  for (const row of params.schedules) {
    if (String(row.venue_id ?? "").trim() !== venueId) continue;
    for (const probeMs of params.probesMs) {
      for (const occurrence of enumerateScheduleOccurrences(row, probeMs)) {
        const gameKey = `${row.id}|${occurrence.occurrenceDate}`;
        if (seen.has(gameKey)) continue;
        seen.add(gameKey);
        // occurrenceDate is already venue-local (see weekdayForOccurrenceDate's note).
        const weekday = weekdayForOccurrenceDate(occurrence.occurrenceDate) ?? "";
        if (!occurrenceMatchesSlots(campaign.gameWinnerSlots, { scheduleId: row.id, weekday })) continue;
        const weekKey = computeCycleStart(campaign, new Date(occurrence.startMs), timezone).getTime();
        gamesByKey.get(weekKey)?.push({
          scheduleId: row.id,
          occurrenceDate: occurrence.occurrenceDate,
          startMs: occurrence.startMs,
          endMs: occurrence.endMs,
        });
      }
    }
  }
  for (const games of gamesByKey.values()) games.sort((a, b) => a.startMs - b.startMs);
  return gamesByKey;
};

/**
 * Whether the reward counts a week whose last game ends at `lastGameEndMs`: it must have
 * existed before that game ended (D8) and not be past its end date. An unparseable
 * created_at is not a licence to award; fail closed.
 */
const rewardCountsWeek = (campaign: ChallengeCampaign, lastGameEndMs: number): boolean => {
  const createdAtMs = Date.parse(String(campaign.createdAt ?? ""));
  if (!Number.isFinite(createdAtMs)) return false;
  if (createdAtMs >= lastGameEndMs) return false; // D8: the reward didn't exist yet
  // A reward past its end date must not keep paying (admin-edited rows only).
  const closeAtMs = getCampaignCloseTimestampMs(campaign);
  return closeAtMs === null || lastGameEndMs <= closeAtMs;
};

/**
 * The reward's weeks inside the lookback whose last game has ended and that the
 * reward was live for, oldest first. Pure: the caller supplies the venue's
 * schedules and timezone. Throws when the reward's week can't be anchored
 * (computeCycleStart's epoch sentinel — no valid first active day).
 */
export function planDueRankedWeeks(params: {
  campaign: ChallengeCampaign;
  venueId: string;
  schedules: readonly TriviaScheduleRow[];
  timezone: string;
  nowMs: number;
}): DueRankedWeek[] {
  const { campaign, timezone, nowMs } = params;

  const currentKey = computeCycleStart(campaign, new Date(nowMs), timezone);
  if (currentKey.getTime() === 0) {
    throw new Error("A weekly places reward has no week start (active days are missing).");
  }
  const keys: Date[] = [currentKey];
  while (keys.length < RANKED_WEEK_LOOKBACK_CYCLES) {
    // One minute before a cycle starts is inside the previous cycle.
    keys.push(computeCycleStart(campaign, new Date(keys[keys.length - 1].getTime() - 60_000), timezone));
  }
  const gamesByKey = collectGamesByWeekKey({ ...params, probesMs: probesAround(nowMs), keys });

  const due: DueRankedWeek[] = [];
  for (const key of [...keys].sort((a, b) => a.getTime() - b.getTime())) {
    const games = gamesByKey.get(key.getTime()) ?? [];
    if (games.length === 0) continue;
    const lastGameEndMs = Math.max(...games.map((game) => game.endMs));
    if (nowMs < lastGameEndMs) continue; // the week's last game hasn't finished
    if (!rewardCountsWeek(campaign, lastGameEndMs)) continue;
    due.push({ cycleStart: key, games, lastGameEndMs });
  }
  return due;
}

export type CurrentRankedWeek = {
  /** computeCycleStart of the week containing `nowMs` — the settlement / ledger key. */
  cycleStart: Date;
  /** Every game of the week, earliest first (played, in progress and still to come). */
  games: RankedWeekGame[];
  /**
   * False when the reward doesn't count this week: no games, or the reward was created
   * after the week's last game ended (D8), so the resolver will never settle it.
   */
  countsForReward: boolean;
};

/**
 * The week containing `nowMs`, for the Rewards card's live standing. Pure. Shares the
 * game list and the D8 rule with planDueRankedWeeks (above). Throws when the reward's
 * week can't be anchored, exactly as planDueRankedWeeks does.
 */
export function planCurrentRankedWeek(params: {
  campaign: ChallengeCampaign;
  venueId: string;
  schedules: readonly TriviaScheduleRow[];
  timezone: string;
  nowMs: number;
}): CurrentRankedWeek {
  const cycleStart = computeCycleStart(params.campaign, new Date(params.nowMs), params.timezone);
  if (cycleStart.getTime() === 0) {
    throw new Error("A weekly places reward has no week start (active days are missing).");
  }
  const games =
    collectGamesByWeekKey({ ...params, probesMs: probesAround(params.nowMs), keys: [cycleStart] }).get(
      cycleStart.getTime(),
    ) ?? [];
  const countsForReward =
    games.length > 0 && rewardCountsWeek(params.campaign, Math.max(...games.map((game) => game.endMs)));
  return { cycleStart, games, countsForReward };
}

/**
 * The weeks the BACKFILL owns (plan Phase 5, scripts/backfill-ranked-reward.cjs): every
 * week whose first game is on or after `fromDate` (venue-local YYYY-MM-DD) and whose last
 * game ended both before `nowMs` and before the reward was created — exactly the weeks
 * planDueRankedWeeks will never settle (D8). The resolver owns the creation week (when the
 * reward existed before its last game ended) and everything after, so the two can never
 * both pay a week; the award RPC refuses a settled key regardless. Oldest first. Pure.
 *
 * Same game list and the same computeCycleStart key as the resolver; only the probe
 * instants differ (one per week, mid-week, instead of "now and the two weeks before").
 * Throws on an unanchorable week or an unreadable created_at (unlike the resolver, which
 * fails closed by skipping: a backfill that can't tell which weeks it owns must stop).
 */
export function planBackfillRankedWeeks(params: {
  campaign: ChallengeCampaign;
  venueId: string;
  schedules: readonly TriviaScheduleRow[];
  timezone: string;
  nowMs: number;
  fromDate: string;
}): DueRankedWeek[] {
  const { campaign, timezone, nowMs, fromDate } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !Number.isFinite(Date.parse(`${fromDate}T12:00:00Z`))) {
    throw new Error(`Invalid from date: ${fromDate} (expected YYYY-MM-DD).`);
  }
  const createdAtMs = Date.parse(String(campaign.createdAt ?? ""));
  if (!Number.isFinite(createdAtMs)) throw new Error("The reward has no readable created_at.");

  // Start a week early so the week containing fromDate is enumerated whatever the
  // timezone; weeks whose first game precedes fromDate are dropped below.
  let key = computeCycleStart(campaign, new Date(Date.parse(`${fromDate}T12:00:00Z`) - 7 * DAY_MS), timezone);
  if (key.getTime() === 0) {
    throw new Error("A weekly places reward has no week start (active days are missing).");
  }
  const keys: Date[] = [];
  while (key.getTime() <= nowMs) {
    keys.push(key);
    // 7½ days after a week's start is inside the next week, across a DST change too.
    const next = computeCycleStart(campaign, new Date(key.getTime() + 7 * DAY_MS + DAY_MS / 2), timezone);
    if (next.getTime() <= key.getTime()) throw new Error("Week keys did not advance.");
    key = next;
  }
  // One probe per week, mid-week: each sees 7 days back to 14 ahead, the whole week.
  const gamesByKey = collectGamesByWeekKey({
    ...params,
    probesMs: keys.map((weekKey) => weekKey.getTime() + 3 * DAY_MS),
    keys,
  });

  const owned: DueRankedWeek[] = [];
  for (const weekKey of keys) {
    const games = gamesByKey.get(weekKey.getTime()) ?? [];
    if (games.length === 0) continue;
    if (games[0].occurrenceDate < fromDate) continue;
    const lastGameEndMs = Math.max(...games.map((game) => game.endMs));
    if (nowMs < lastGameEndMs) continue; // not over yet
    if (createdAtMs < lastGameEndMs) continue; // the resolver's week (D8)
    owned.push({ cycleStart: weekKey, games, lastGameEndMs });
  }
  return owned;
}

export const isWeekSettled = (
  settlements: readonly ChallengeCycleSettlementRecord[],
  campaignId: string,
  cycleStartMs: number,
): boolean =>
  settlements.some(
    (row) =>
      row.challengeId === campaignId &&
      Math.abs(Date.parse(row.cycleStart) - cycleStartMs) < SETTLED_WEEK_MATCH_TOLERANCE_MS,
  );

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Settle every ranked-places reward week that has ended and isn't settled yet.
 * Safe to run repeatedly (see the header). One bad reward or week never stops the
 * others — failures are collected into the report and logged with
 * `[RankedReward]`; the next sweep retries them.
 */
export async function resolveRankedPlaceRewards(
  nowMs: number = Date.now(),
): Promise<ResolveRankedPlaceRewardsReport> {
  const report: ResolveRankedPlaceRewardsReport = {
    campaignsExamined: 0,
    weeksDue: 0,
    weeksAlreadySettled: 0,
    weeksSettled: 0,
    noScorers: 0,
    belowMinimum: 0,
    tiebreakUnresolved: 0,
    alreadyResolved: 0,
    settlements: [],
    errors: [],
  };
  const fail = (scope: string, message: string) => {
    report.errors.push({ scope, message });
    console.error("[RankedReward] sweep-error", { scope, message });
  };

  const campaigns = (await listActiveRankedPlaceCampaigns()).filter(isLiveTriviaRankedCampaign);
  report.campaignsExamined = campaigns.length;

  const sweepable: ChallengeCampaign[] = [];
  for (const campaign of campaigns) {
    const configError = rankedRewardConfigError(campaign);
    if (configError) fail(campaign.id, configError);
    else sweepable.push(campaign);
  }
  if (sweepable.length === 0) return report;

  let schedules: TriviaScheduleRow[];
  try {
    schedules = await loadLiveTriviaSchedulesForVenues(sweepable.map((campaign) => campaign.venueIds[0]));
  } catch (error) {
    fail("schedules", errorMessage(error, "Failed to load Live Trivia schedules."));
    return report;
  }

  const dueWeeks: Array<{ campaign: ChallengeCampaign; venueId: string; week: DueRankedWeek }> = [];
  for (const campaign of sweepable) {
    const venueId = campaign.venueIds[0];
    try {
      const timezone = await getVenueTimezone(venueId);
      for (const week of planDueRankedWeeks({ campaign, venueId, schedules, timezone, nowMs })) {
        dueWeeks.push({ campaign, venueId, week });
      }
    } catch (error) {
      fail(campaign.id, errorMessage(error, "Failed to plan this reward's weeks."));
    }
  }
  report.weeksDue = dueWeeks.length;
  if (dueWeeks.length === 0) return report;

  // Settlements first: one bounded read for every due week. A failed read must
  // not be mistaken for "nothing settled" — stop and let the next sweep retry.
  let settlements: ChallengeCycleSettlementRecord[];
  try {
    const oldestKeyMs = Math.min(...dueWeeks.map((due) => due.week.cycleStart.getTime()));
    settlements = await listChallengeCycleSettlements({
      challengeIds: [...new Set(dueWeeks.map((due) => due.campaign.id))],
      cycleStartFrom: new Date(oldestKeyMs - SETTLED_WEEK_MATCH_TOLERANCE_MS),
    });
  } catch (error) {
    fail("settlements", errorMessage(error, "Failed to load settled weeks."));
    return report;
  }

  const now = new Date(nowMs);
  for (const { campaign, venueId, week } of dueWeeks) {
    const cycleStartIso = week.cycleStart.toISOString();
    if (isWeekSettled(settlements, campaign.id, week.cycleStart.getTime())) {
      report.weeksAlreadySettled += 1;
      continue;
    }
    try {
      const totals = await loadLiveTriviaWeekTotals(week.games);
      const ranked = rankWeekPlaces({
        totals,
        placeCount: campaign.placePrizes?.length ?? 0,
        minPlayers: campaign.minPlayers ?? null,
      });
      const { status } = await awardRankedCyclePlaces({
        campaign,
        venueId,
        cycleStart: week.cycleStart,
        places: ranked.places,
        participantCount: ranked.participantCount,
        now,
      });

      const awarded = status === "awarded";
      if (status === "already_resolved") report.alreadyResolved += 1;
      else report.weeksSettled += 1;
      if (status === "no_scorers") report.noScorers += 1;
      if (status === "below_minimum") report.belowMinimum += 1;
      const tiebreakUnresolved = awarded && ranked.tiebreakUnresolved;
      if (tiebreakUnresolved) {
        report.tiebreakUnresolved += 1;
        console.warn("[RankedReward] tiebreak-unresolved", { campaignId: campaign.id, cycleStart: cycleStartIso });
      }

      const settlement: RankedWeekSettlement = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        venueId,
        cycleStart: cycleStartIso,
        gameCount: week.games.length,
        participantCount: ranked.participantCount,
        status,
        winners: awarded
          ? ranked.places.map((p) => ({ place: p.place, userId: p.userId, totalPoints: p.totalPoints }))
          : [],
        tiebreakUnresolved,
      };
      report.settlements.push(settlement);
      if (status !== "already_resolved") {
        console.info("[RankedReward] week-settled", {
          campaignId: campaign.id,
          cycleStart: cycleStartIso,
          status,
          participantCount: ranked.participantCount,
          places: settlement.winners.length,
        });
      }
    } catch (error) {
      fail(`${campaign.id}@${cycleStartIso}`, errorMessage(error, "Failed to settle this week."));
    }
  }

  return report;
}
