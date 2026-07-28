import "server-only";

// ── NFL Pick 'Em week-winner reward resolution (Phase 7) ────────────────────
//
// An `nfl_pickem_challenge` reward created with winCondition "game_winner" goes
// to whoever has the MOST CORRECT PICKS at the venue — for one NFL week
// ("weekly" scope) or for the reward's whole run ("season" scope). Nothing in the
// app emits a "week is over" event, so this sweep is what closes a contest out:
// it looks for NFL weeks whose games have all finished and awards their venue
// leaders. Modeled directly on lib/liveTriviaWinnerRewards.ts — read that file's
// header for the shared traps; the NFL-specific ones are below.
//
// IDEMPOTENCY comes from the winner ledger, exactly as for Live Trivia: each
// contest is awarded under its own `cycle_start`, and challenge_cycle_winners is
// unique on (challenge_id, cycle_start, winner_user_id). The cycle key is NOT
// hand-rolled here — it comes from `computeCycleStart`, the same function the
// challenge engine uses, so the resolver and the engine agree on cycle identity
// (a divergent key would mint a SECOND prize for the same week under a second
// key on every re-sweep, and would also hide the winner from the Rewards panel,
// which reads the engine's current cycle). That is why the lookback window can
// be far wider than the daily cron interval: a missed or errored run self-heals.
//
// TIES are NOT co-awarded. Live Trivia widens the quota to the tie count because
// everyone answered the same questions; here the product ships a tiebreaker
// question for exactly this case (docs/nfl-pickem-reward-phase1.md), so the tie
// is broken and EXACTLY ONE guest wins. If the tiebreaker game isn't final yet
// we award nobody and let a later sweep resolve it — a "temporary" arbitrary
// winner would be a real coupon we can't take back. If the tiebreaker cannot
// separate the leaders at all (nobody guessed, or identical guesses),
// rankByTiebreakerProximity falls back to userId ascending; we award that single
// user and flag `tiebreakerUnresolved` so the outcome is visible in the report
// rather than silent.
//
// MINIMUM PARTICIPATION is a locked product decision (3+ guests with picks) that
// is stated to both partners and players, so "no winner this week" is a REPORTED
// outcome (`skippedBelowMinimum`), not a silent `continue`.

import {
  awardCycleWinner,
  computeCycleStart,
  getCampaignCloseTimestampMs,
  listChallengeCampaigns,
  updateChallengeCampaign,
} from "@/lib/challengeCampaigns";
import {
  NFL_PICKEM_SPORT_SLUG,
  getNFLPickEmLeaderboard,
  listNFLPickEmGames,
  listNFLWeeks,
  nflWeekSpanMs,
  type NFLLeaderboardMode,
  type NFLPickEmGame,
  type NFLWeek,
} from "@/lib/nflPickEm";
import { NFL_REWARD_MIN_PICKERS } from "@/lib/nflPickEmRewardWeeks";
import {
  listTiebreakerGuesses,
  rankByTiebreakerProximity,
  settleWeekTiebreaker,
  type NFLTiebreakerProximityGuess,
} from "@/lib/nflPickEmTiebreaker";
import type { RewardDefinitionId } from "@/lib/rewardDefinitions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueTimezone, zonedStartOfDayToUtc } from "@/lib/timezone";
import type { ChallengeCampaign } from "@/types";

/** Only rewards created from this definition are resolved here. */
export const NFL_PICKEM_REWARD_DEFINITION_ID: RewardDefinitionId = "nfl_pickem_challenge";

/**
 * Guests with at least one pick required for a contest to produce a winner.
 * Aliased to the Phase-3 constant rather than re-declared so the number the UI
 * copy promises and the number enforced here cannot drift. Exported under this
 * name because the resolver's own tests and Phase 8's copy both reference it.
 */
export const NFL_WINNER_MIN_PARTICIPANTS = NFL_REWARD_MIN_PICKERS;

/**
 * How far back the sweep looks for weeks to resolve. Deliberately much wider
 * than the daily cron interval so an outage, a bad deploy or a late-corrected
 * final score self-heals; the ledger makes the overlap a no-op. Also wide enough
 * to reach the past weeks seeded by scripts/seed-nfl-pickem-test-data.cjs (up to
 * 28 days back), which is what Phase 9 verifies against.
 */
export const NFL_WINNER_LOOKBACK_DAYS = 35;

/**
 * How long after kickoff a game with both scores but no winner counts as over.
 * `listNFLPickEmGames` only reports status "final" when a winner exists, so a
 * genuine tie game would otherwise leave its week permanently unresolvable. No
 * NFL game is still being played 12 hours after kickoff.
 */
const GAME_FINAL_GRACE_MS = 12 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** PostgREST caps one response at 1000 rows; venue discovery pages explicitly. */
const VENUE_PAGE_SIZE = 1000;
/** Runaway-loop guard: 100 pages of picks is far past any real week. */
const VENUE_MAX_PAGES = 100;

export type NFLWinnerContestKind = "weekly" | "season";

/** Half-open [start, end) instant range the standings/venues are read over. */
type MsRange = { startMs: number; endMsExclusive: number };

type NFLWinnerContest = {
  kind: NFLWinnerContestKind;
  season: number;
  /** The week whose completion resolves the contest (season scope: the last week). */
  week: NFLWeek;
  /**
   * When the contest became live to players — the decisive week's first kickoff.
   * A reward created after this was not on offer for it (see the note on
   * campaignWasLiveForContest).
   */
  startMs: number;
  /** The decisive week's last instant, checked against the campaign's close date. */
  endMs: number;
  /** Which picks count toward the standings. */
  range: MsRange;
  leaderboardMode: NFLLeaderboardMode;
};

export type NFLPickEmWinnerResolution = {
  kind: NFLWinnerContestKind;
  season: number;
  weekId: string;
  weekNumber: number;
  venueId: string;
  campaignId: string;
  campaignName: string;
  /** Users newly awarded on this sweep (already-ledgered winners are excluded). */
  awardedUserIds: string[];
  topCorrectPicks: number;
  /** How many guests tied at the top count before the tiebreaker was applied. */
  tiedCount: number;
  /** True when the tiebreaker couldn't separate the leaders and userId order did. */
  tiebreakerUnresolved: boolean;
};

/** A contest that produced no winner because too few guests played. */
export type NFLPickEmWinnerSkip = {
  kind: NFLWinnerContestKind;
  season: number;
  weekId: string;
  weekNumber: number;
  venueId: string;
  /** Distinct guests with at least one pick. Always < NFL_WINNER_MIN_PARTICIPANTS. */
  participants: number;
  /** The rewards that would have paid out had the gate been met. */
  campaignIds: string[];
};

/** A tie a later sweep must finish: the tiebreaker game isn't final yet. */
export type NFLPickEmWinnerPending = {
  kind: NFLWinnerContestKind;
  season: number;
  weekId: string;
  weekNumber: number;
  venueId: string;
  tiedUserIds: string[];
  campaignIds: string[];
};

export type ResolveNFLPickEmWinnerRewardsReport = {
  weeksExamined: number;
  contestsExamined: number;
  campaignsExamined: number;
  resolutions: NFLPickEmWinnerResolution[];
  skippedBelowMinimum: NFLPickEmWinnerSkip[];
  pendingTiebreaker: NFLPickEmWinnerPending[];
  errors: Array<{ scope: string; message: string }>;
};

const emptyReport = (): ResolveNFLPickEmWinnerRewardsReport => ({
  weeksExamined: 0,
  contestsExamined: 0,
  campaignsExamined: 0,
  resolutions: [],
  skippedBelowMinimum: [],
  pendingTiebreaker: [],
  errors: [],
});

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

// ── Week windows ────────────────────────────────────────────────────────────

const weekStartMs = (week: NFLWeek): number => Date.parse(`${week.weekStartDate}T00:00:00.000Z`);
/** The week's last instant — the boundary compared against a campaign's end date. */
const weekEndMs = (week: NFLWeek): number => Date.parse(`${week.weekEndDate}T23:59:59.999Z`);
/**
 * Half-open pick window for a week: the shared Tue 05:00 UTC → Tue 05:00 UTC
 * span from lib/nflPickEm.ts, so venue discovery and the leaderboard see exactly
 * the same picks — Monday Night Football included.
 */
const weekRange = (week: NFLWeek): MsRange => nflWeekSpanMs(week);

const isValidRange = (range: MsRange): boolean =>
  Number.isFinite(range.startMs) &&
  Number.isFinite(range.endMsExclusive) &&
  range.endMsExclusive > range.startMs;

/**
 * Has this game produced a result? `status === "final"` is the normal answer; the
 * scored-but-winnerless fallback exists for tie games (see GAME_FINAL_GRACE_MS).
 */
const isGameDecided = (game: NFLPickEmGame, nowMs: number): boolean => {
  if (game.status === "final") return true;
  if (game.homeScore === null || game.awayScore === null) return false;
  const kickoffMs = Date.parse(game.startsAt);
  return Number.isFinite(kickoffMs) && nowMs - kickoffMs >= GAME_FINAL_GRACE_MS;
};

/**
 * "All games final" rather than `nfl_pickem_weeks.status === 'complete'`: that
 * column is maintained by the update_nfl_week_status RPC off week DATES, so it
 * flips on the calendar rather than on the last whistle and can be wrong in both
 * directions (complete while a postponed game is unplayed; not-complete while a
 * week with no Monday game is already decided).
 */
const isWeekComplete = (games: NFLPickEmGame[], nowMs: number): boolean =>
  games.length > 0 && games.every((game) => isGameDecided(game, nowMs));

/** The instant the contest became live to players: the week's first kickoff. */
const firstKickoffMs = (week: NFLWeek, games: NFLPickEmGame[]): number => {
  const kickoffs = games.map((game) => Date.parse(game.startsAt)).filter((ms) => Number.isFinite(ms));
  return kickoffs.length > 0 ? Math.min(...kickoffs) : weekStartMs(week);
};

// ── Venue discovery ─────────────────────────────────────────────────────────

/**
 * Which venues had NFL picks in this window.
 *
 * The sweep can't start from campaigns: an unscoped listChallengeCampaigns()
 * caps at 200 rows GLOBALLY, so the venue whose reward is due could be crowded
 * out by unrelated venues' campaigns (the bug documented in
 * lib/liveTriviaWinnerRewards.ts). Starting from the picks gives an exact,
 * unbounded venue list and every campaign read below is venue-scoped, which
 * pushes that cap down to per-venue.
 */
async function listVenueIdsWithNFLPicks(range: MsRange): Promise<string[]> {
  if (!supabaseAdmin) return [];
  const startIso = new Date(range.startMs).toISOString();
  const endIso = new Date(range.endMsExclusive).toISOString();
  const venueIds = new Set<string>();

  for (let page = 0; page < VENUE_MAX_PAGES; page += 1) {
    const from = page * VENUE_PAGE_SIZE;
    const { data, error } = await supabaseAdmin
      .from("pickem_picks")
      .select("venue_id")
      .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("venue_id", { ascending: true })
      .range(from, from + VENUE_PAGE_SIZE - 1)
      .returns<Array<{ venue_id: string | null }>>();

    if (error) {
      throw new Error(`Failed to load NFL pick venues: ${error.message}`);
    }

    const rows = data ?? [];
    for (const row of rows) {
      const venueId = String(row.venue_id ?? "").trim();
      if (venueId) venueIds.add(venueId);
    }
    if (rows.length < VENUE_PAGE_SIZE) break;
  }

  // Sorted so a one-off (season) reward is claimed deterministically when two
  // venues could both resolve it — same reasoning as the oldest-game-first
  // ordering in the Live Trivia resolver.
  return [...venueIds].sort((a, b) => a.localeCompare(b));
}

// ── Campaign eligibility ────────────────────────────────────────────────────

/**
 * An NFL week-winner reward at this venue. `venueIds` must be non-empty: an
 * empty list means "global" to the engine, and a global week-winner reward would
 * fire at every venue at once — deliberately not honored, as for Live Trivia.
 */
function isNFLWeekWinnerCampaign(campaign: ChallengeCampaign): boolean {
  return (
    campaign.isActive &&
    !campaign.winnerUserId &&
    campaign.winCondition === "game_winner" &&
    campaign.rewardDefinitionId === NFL_PICKEM_REWARD_DEFINITION_ID &&
    Boolean(campaign.nflWeekScope) &&
    campaign.venueIds.length > 0
  );
}

/** Does this reward's scope cover this contest? */
function campaignCoversContest(campaign: ChallengeCampaign, contest: NFLWinnerContest): boolean {
  const scope = campaign.nflWeekScope;
  if (!scope) return false;
  if (scope.season !== contest.season) return false;
  if (scope.kind !== contest.kind) return false;
  // A season reward can only be decided by a week at or after the one it started
  // from; anything else would be a contest that hadn't begun.
  if (scope.kind === "season" && scope.fromWeek > contest.week.weekNumber) return false;
  return true;
}

/**
 * Was this reward actually on offer for this contest? Ports
 * campaignWasLiveForOccurrence: the lookback window reaches weeks that finished
 * before the reward existed, and a partner creating a reward on Sunday night
 * must not win it for the week that is about to end.
 *
 * The bar is the DECISIVE week's first kickoff for both scopes. For a weekly
 * contest that is the contest's own start. For a season contest it is stricter
 * than "existed sometime during the season" on purpose — a reward created while
 * the final week was already being played was not on offer to the guests who had
 * been picking all season. Conservative in the direction where the failure mode
 * is a missed payout rather than an unannounced one.
 */
function campaignWasLiveForContest(campaign: ChallengeCampaign, contest: NFLWinnerContest): boolean {
  const createdAtMs = Date.parse(String(campaign.createdAt ?? ""));
  // An unparseable created_at is not a licence to award; fail closed.
  if (!Number.isFinite(createdAtMs)) return false;
  if (contest.startMs < createdAtMs) return false;

  const closeAtMs = getCampaignCloseTimestampMs(campaign);
  if (closeAtMs !== null && contest.endMs > closeAtMs) return false;

  return true;
}

/**
 * The contest's cycle key. Derived from `computeCycleStart` — the challenge
 * engine's own function — rather than from the week dates directly, so the
 * resolver's idea of "this week's cycle" is the engine's by construction.
 *
 * Weekly: anchored by passing an instant inside the NFL week (the week's
 * Thursday at local noon, safely past the campaign's local start time), which
 * makes computeCycleStart return that Thursday's boundary — the same key the
 * points-accrual path lands on for picks made in the same week.
 *
 * Season: the campaign is non-recurring, so computeCycleStart returns its
 * startDate instant regardless of the probe.
 */
export function nflWinnerCycleStart(
  campaign: ChallengeCampaign,
  week: NFLWeek,
  timezone: string,
): Date {
  const [year, month, day] = week.weekStartDate.split("-").map(Number);
  const anchor =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(zonedStartOfDayToUtc(year, month, day, timezone).getTime() + 12 * 60 * 60 * 1000)
      : new Date(weekEndMs(week));
  return computeCycleStart(campaign, anchor, timezone);
}

// ── Tiebreaker ──────────────────────────────────────────────────────────────

type TiebreakerDecision = { winnerUserId: string; tiebreakerUnresolved: boolean };

/**
 * Break a tie for most correct picks with the week's tiebreaker question.
 * Returns null when the tiebreaker game isn't final yet — the caller must then
 * award nobody and leave the contest for a later sweep.
 */
async function decideTiebreaker(params: {
  venueId: string;
  weekId: string;
  tiedUserIds: string[];
}): Promise<TiebreakerDecision | null> {
  const settlement = await settleWeekTiebreaker(params.weekId);
  if (!settlement.settled || settlement.actualTotal === null) return null;
  const actualTotal = settlement.actualTotal;

  // "all" is the server-internal reveal: the resolver is not a user-facing
  // surface, and a hidden guess would silently rank as "no guess".
  const guesses = await listTiebreakerGuesses({
    venueId: params.venueId,
    weekId: params.weekId,
    revealFor: "all",
  });

  const proximityGuesses: NFLTiebreakerProximityGuess[] = guesses.map((guess) => ({
    userId: guess.userId,
    predictedTotal: guess.predictedTotal ?? null,
  }));
  const ranked = rankByTiebreakerProximity(params.tiedUserIds, proximityGuesses, actualTotal);
  const winnerUserId = ranked[0] ?? params.tiedUserIds[0] ?? "";

  // Did the tiebreaker actually separate the top two, or did userId order? The
  // comparison key mirrors rankByTiebreakerProximity's rules 1-3 (distance, then
  // the lower guess, with "no guess" its own bucket): equal keys mean the
  // question decided nothing.
  const guessByUser = new Map<string, number>();
  for (const guess of proximityGuesses) {
    if (guess.predictedTotal !== null && Number.isFinite(guess.predictedTotal)) {
      guessByUser.set(guess.userId, guess.predictedTotal);
    }
  }
  const rankKey = (userId: string): string => {
    const guess = guessByUser.get(userId);
    if (guess === undefined) return "no-guess";
    return `${Math.abs(guess - actualTotal)}|${guess}`;
  };
  const tiebreakerUnresolved = ranked.length > 1 && rankKey(ranked[0]) === rankKey(ranked[1]);

  return { winnerUserId, tiebreakerUnresolved };
}

// ── The sweep ───────────────────────────────────────────────────────────────

/**
 * Resolve every NFL Pick 'Em week-winner reward whose contest has finished.
 * Safe to run repeatedly (see the idempotency note at the top of this file).
 *
 * One bad season, week, venue or campaign never aborts the sweep — failures are
 * collected into `report.errors` so the rest still resolve.
 */
export async function resolveNFLPickEmWinnerRewards(
  nowMs: number = Date.now(),
): Promise<ResolveNFLPickEmWinnerRewardsReport> {
  const report = emptyReport();
  if (!supabaseAdmin) return report;

  const now = new Date(nowMs);
  // The current season, plus the previous one: an NFL season's last weeks fall in
  // JANUARY, so a sweep on Jan 5th that only looked at getFullYear() would never
  // resolve week 18 or the playoffs. The season number itself matches
  // app/api/nfl-pickem/weeks/route.ts and resolveNFLSeasonContext (Phase 4) —
  // there is no canonical season resolver in the codebase.
  const seasons = [now.getFullYear(), now.getFullYear() - 1];
  const oldestEndMs = nowMs - NFL_WINNER_LOOKBACK_DAYS * DAY_MS;

  const contests: NFLWinnerContest[] = [];

  for (const season of seasons) {
    let weeks: NFLWeek[];
    try {
      weeks = await listNFLWeeks(season, true);
    } catch (error) {
      report.errors.push({
        scope: `season:${season}`,
        message: errorMessage(error, "Failed to load NFL weeks."),
      });
      continue;
    }
    if (weeks.length === 0) continue;

    const seasonRange: MsRange = {
      startMs: Math.min(...weeks.map(weekStartMs).filter(Number.isFinite)),
      endMsExclusive: Math.max(...weeks.map((week) => weekRange(week).endMsExclusive).filter(Number.isFinite)),
    };
    const finalWeekNumber = weeks.reduce(
      (highest, week) => Math.max(highest, week.weekNumber),
      Number.NEGATIVE_INFINITY,
    );

    for (const week of weeks) {
      const startMs = weekStartMs(week);
      const endMs = weekEndMs(week);
      // A week the sweep can't place in time, hasn't begun, or that finished
      // before the lookback window is not a candidate.
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      if (startMs > nowMs || endMs < oldestEndMs) continue;

      let games: NFLPickEmGame[];
      try {
        ({ games } = await listNFLPickEmGames({ weekId: week.id }));
      } catch (error) {
        report.errors.push({
          scope: `week:${week.id}`,
          message: errorMessage(error, "Failed to load NFL games."),
        });
        continue;
      }

      report.weeksExamined += 1;
      if (!isWeekComplete(games, nowMs)) continue;

      const contestStartMs = firstKickoffMs(week, games);
      const range = weekRange(week);
      if (isValidRange(range)) {
        contests.push({
          kind: "weekly",
          season,
          week,
          startMs: contestStartMs,
          endMs,
          range,
          leaderboardMode: "week",
        });
      }
      // The season-long contest is decided by the season's LAST week, so it
      // resolves once (and only once) that week is complete.
      if (week.weekNumber === finalWeekNumber && isValidRange(seasonRange)) {
        contests.push({
          kind: "season",
          season,
          week,
          startMs: contestStartMs,
          endMs,
          range: seasonRange,
          leaderboardMode: "season",
        });
      }
    }
  }

  // Oldest contest first: a season reward can only be spent once, so which
  // contest claims it must be deterministic rather than query-order dependent.
  contests.sort((a, b) => a.startMs - b.startMs || a.kind.localeCompare(b.kind));
  report.contestsExamined = contests.length;
  if (contests.length === 0) return report;

  // Season-scope rewards spent earlier in THIS sweep. Campaign lists are cached
  // per venue, so deactivating one in the database does not remove it from the
  // in-memory list — without this set, two contests in one sweep could both
  // claim the same one-off reward.
  const spentCampaignIds = new Set<string>();
  const campaignsByVenue = new Map<string, ChallengeCampaign[]>();
  const timezoneByVenue = new Map<string, string>();
  const examinedCampaignIds = new Set<string>();

  const loadVenueCampaigns = async (venueId: string): Promise<ChallengeCampaign[]> => {
    const cached = campaignsByVenue.get(venueId);
    if (cached) return cached;
    // Venue-scoped (not one unscoped call) — see listVenueIdsWithNFLPicks.
    const campaigns = (await listChallengeCampaigns({ venueId })).filter(
      (campaign) => isNFLWeekWinnerCampaign(campaign) && campaign.venueIds.includes(venueId),
    );
    campaignsByVenue.set(venueId, campaigns);
    for (const campaign of campaigns) examinedCampaignIds.add(campaign.id);
    return campaigns;
  };

  const loadVenueTimezone = async (venueId: string): Promise<string> => {
    const cached = timezoneByVenue.get(venueId);
    if (cached) return cached;
    const timezone = await getVenueTimezone(venueId);
    timezoneByVenue.set(venueId, timezone);
    return timezone;
  };

  for (const contest of contests) {
    let venueIds: string[];
    try {
      venueIds = await listVenueIdsWithNFLPicks(contest.range);
    } catch (error) {
      report.errors.push({
        scope: `${contest.kind}:${contest.week.id}`,
        message: errorMessage(error, "Failed to load venues with NFL picks."),
      });
      continue;
    }

    for (const venueId of venueIds) {
      const scope = `${contest.kind}:${contest.week.id}@${venueId}`;
      try {
        const campaigns = (await loadVenueCampaigns(venueId)).filter(
          (campaign) =>
            !spentCampaignIds.has(campaign.id) &&
            campaignCoversContest(campaign, contest) &&
            campaignWasLiveForContest(campaign, contest),
        );
        if (campaigns.length === 0) continue;

        const standings = await getNFLPickEmLeaderboard({
          venueId,
          mode: contest.leaderboardMode,
          weekId: contest.leaderboardMode === "week" ? contest.week.id : null,
          season: contest.season,
          // Server-internal read: no requesting user, so nothing is revealed as
          // "own picks" and nothing here depends on the privacy gate.
          userId: undefined,
          now,
        });
        const entries = standings.entries;

        // Locked product decision: below the minimum, nobody wins — and it is
        // REPORTED, because this is the outcome partners are surprised by.
        if (entries.length < NFL_WINNER_MIN_PARTICIPANTS) {
          report.skippedBelowMinimum.push({
            kind: contest.kind,
            season: contest.season,
            weekId: contest.week.id,
            weekNumber: contest.week.weekNumber,
            venueId,
            participants: entries.length,
            campaignIds: campaigns.map((campaign) => campaign.id),
          });
          continue;
        }

        // correctPicks, not totalPoints: they are proportional (flat 10 per
        // correct pick) so either sorts the same, but picks is the unit the
        // reward is stated in and survives a future bonus system.
        const topCorrectPicks = entries.reduce(
          (highest, entry) => Math.max(highest, entry.correctPicks),
          0,
        );
        // Nobody got a pick right — no winner. The reward stays active.
        if (topCorrectPicks <= 0) continue;

        const tiedUserIds = entries
          .filter((entry) => entry.correctPicks === topCorrectPicks)
          .map((entry) => entry.userId)
          .sort((a, b) => a.localeCompare(b));

        let winnerUserId = tiedUserIds[0] ?? "";
        let tiebreakerUnresolved = false;
        if (tiedUserIds.length > 1) {
          // A season tie is broken on the FINAL week's tiebreaker — contest.week
          // is that week for both scopes.
          const decision = await decideTiebreaker({
            venueId,
            weekId: contest.week.id,
            tiedUserIds,
          });
          if (!decision) {
            // The tiebreaker game isn't final. Awarding an arbitrary leader here
            // would mint a coupon we cannot take back, so a later sweep decides.
            report.pendingTiebreaker.push({
              kind: contest.kind,
              season: contest.season,
              weekId: contest.week.id,
              weekNumber: contest.week.weekNumber,
              venueId,
              tiedUserIds,
              campaignIds: campaigns.map((campaign) => campaign.id),
            });
            continue;
          }
          winnerUserId = decision.winnerUserId;
          tiebreakerUnresolved = decision.tiebreakerUnresolved;
        }
        if (!winnerUserId) continue;

        const timezone = await loadVenueTimezone(venueId);

        for (const campaign of campaigns) {
          try {
            const { won } = await awardCycleWinner({
              campaign,
              userId: winnerUserId,
              venueId,
              cycleStart: nflWinnerCycleStart(campaign, contest.week, timezone),
              pointsEarned: topCorrectPicks,
              // Exactly one winner per contest — the tiebreaker exists to make
              // that possible. The RPC still enforces the cap atomically.
              winnerQuota: 1,
              now,
            });
            if (!won) continue;

            report.resolutions.push({
              kind: contest.kind,
              season: contest.season,
              weekId: contest.week.id,
              weekNumber: contest.week.weekNumber,
              venueId,
              campaignId: campaign.id,
              campaignName: campaign.name,
              awardedUserIds: [winnerUserId],
              topCorrectPicks,
              tiedCount: tiedUserIds.length,
              tiebreakerUnresolved,
            });

            // A season-scope reward is a single contest: once it has a winner it
            // is spent. A weekly reward stays active and resolves again next
            // week. Marked spent BEFORE the write so a failed update can't let a
            // second contest in this sweep award it again.
            if (contest.kind === "season") {
              spentCampaignIds.add(campaign.id);
              try {
                await updateChallengeCampaign({
                  id: campaign.id,
                  isActive: false,
                  // Retained only as a non-null "resolved" marker for legacy
                  // readers — under multi-winner it no longer means "the winner".
                  winnerUserId: campaign.winnerUserId ?? winnerUserId,
                });
              } catch (error) {
                report.errors.push({
                  scope: `${campaign.id}:deactivate`,
                  message: errorMessage(error, "Failed to deactivate reward."),
                });
              }
            }
          } catch (error) {
            report.errors.push({
              scope: `${campaign.id}@${contest.week.id}`,
              message: errorMessage(error, "Failed to award winner."),
            });
            continue;
          }
        }
      } catch (error) {
        report.errors.push({ scope, message: errorMessage(error, "Failed to resolve contest.") });
        continue;
      }
    }
  }

  report.campaignsExamined = examinedCampaignIds.size;
  return report;
}
