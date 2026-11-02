import "server-only";

// The Pick 'Em Prize award sweep (docs/pickem-college-football-and-prize-plan.md Phase 4b), run at the
// end of every /api/cron/pickem-settle (once a minute), after grading. The rules — which periods,
// which picks count, who wins — are lib/pickemPrizeStandings.ts; this file reads, pays and records.
//
// HOW EACH KIND PAYS (all keyed by pickemPrizeCycleStart, lib/pickemPrizes.ts):
//   - "Get N right"     → award_cycle_winner at the period's tier-0 key, quota = the prize's quantity,
//                         as soon as a player has N correct picks.
//   - "X out of N"      → award_pickem_tier_prize (one prize per player per period, top tier reached
//                         with a prize left), once the player's first N picks are graded, else at the
//                         final pass.
//   - "Most picks right"→ award_cycle_winner at the tier-0 key, quota 1, at the final pass only; a tie
//                         waits for the tiebreaker game's final score (until the grace runs out).
// After a period's final pass it gets a pickem_prize_settlements row and is never read again. A one-day
// or date-range prize has one period, so once that is settled the next run ends the prize (endPickEmPrize:
// is_active = false), which is how the venue Prizes card and the partner's list know it is over (7.2).
//
// SAFE TO REPEAT: every payment is quota- and once-guarded inside its RPC; two overlapping runs can
// only both ask. A failure on one prize/period is reported and the rest carry on; that period is
// asked again on a later run (it isn't settled).
//
// ONLY ITS OWN PRIZES: the list read is filtered on rewardDefinitionId (tests/prize-sweep-ownership-
// contract.test.ts). A prize for more than one venue is skipped and logged (createReward makes one).
//
// COST per run: one read of active Pick 'Em Prizes (returns at once when there are none — the normal
// case today). With prizes: the venues' time zones (cached 10 min), one settlements read, one
// "graded in the last 5 minutes" read (index idx_pickem_picks_resolved_at). Then, only for periods
// where something can have changed (isPickEmPrizePeriodDue): one picks read per (venue, period span),
// paged at 1,000 rows, and one ledger read. A tie adds one guesses read and one provider request.

import {
  awardCycleWinner,
  awardPickEmTierPrize,
  endPickEmPrize,
  listAllActivePickEmPrizeCampaigns,
  type PickEmPrizeTerms,
} from "@/lib/challengeCampaigns";
import { PICKEM_PRIZE_DEFINITION_ID, pickemPrizeCycleStart, pickemPrizeWinKind, pickemScopeCovers, type PickEmPrizePeriod } from "@/lib/pickemPrizes";
import {
  PICKEM_PRIZE_RECENT_GRADING_MS,
  PICKEM_PRIZE_SETTLE_GRACE_MS,
  isPickEmPrizeFinalPassReady,
  isPickEmPrizePeriodDue,
  pickemPrizeCandidatePeriods,
  picksForPickEmPrizePeriod,
  planPickEmMostRight,
  planPickEmTargetAwards,
  planPickEmTierAwards,
  rankPickEmPrizeTiebreak,
  type PickEmPrizePick,
  type PickEmPrizePickStatus,
} from "@/lib/pickemPrizeStandings";
import { listPickEmPrizeGuesses, pickemPrizeGameTotal } from "@/lib/pickemPrizeTiebreaker";
import { chunkIds } from "@/lib/postgrestIds";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign } from "@/types";

const PAGE_SIZE = 1000;
/** Most picks one (venue, period) read pages through (far above a real bar's period). */
const PICKS_PAGE_CAP = 20;
const TIER_KEY_SPAN_MS = 3000;

type PrizeCampaign = ChallengeCampaign & PickEmPrizeTerms;

type Candidate = {
  campaign: PrizeCampaign;
  venueId: string;
  period: PickEmPrizePeriod;
  /** The tier-0 key. */
  key: Date;
};

export type PickEmPrizeSweepReport = {
  prizes: number;
  periodsChecked: number;
  awarded: number;
  settled: number;
  /** One-off prizes ended this run (their only period was settled on an earlier run). */
  ended: number;
  errors: string[];
};

const emptyReport = (prizes = 0): PickEmPrizeSweepReport => ({
  prizes,
  periodsChecked: 0,
  awarded: 0,
  settled: 0,
  ended: 0,
  errors: [],
});

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type PickRow = {
  id: string;
  user_id: string;
  status: PickEmPrizePickStatus;
  created_at: string;
  starts_at: string;
  resolved_at: string | null;
  sport_slug: string;
  sport_key: string;
};

const mapPick = (row: PickRow): PickEmPrizePick => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  createdAt: row.created_at,
  startsAt: row.starts_at,
  resolvedAt: row.resolved_at,
  sportSlug: row.sport_slug,
  sportKey: row.sport_key,
});

/** Every non-cancelled pick at a venue whose game starts in [fromMs, toMs), paged. Throws on error. */
async function readVenuePicks(venueId: string, fromMs: number, toMs: number): Promise<PickEmPrizePick[]> {
  const db = supabaseAdmin!;
  const picks: PickEmPrizePick[] = [];
  for (let page = 0; page < PICKS_PAGE_CAP; page += 1) {
    const { data, error } = await db
      .from("pickem_picks")
      .select("id, user_id, status, created_at, starts_at, resolved_at, sport_slug, sport_key")
      .eq("venue_id", venueId)
      .gte("starts_at", new Date(fromMs).toISOString())
      .lt("starts_at", new Date(toMs).toISOString())
      .neq("status", "canceled")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .returns<PickRow[]>();
    if (error) throw new Error(`picks read: ${error.message}`);
    const rows = data ?? [];
    picks.push(...rows.map(mapPick));
    if (rows.length < PAGE_SIZE) return picks;
  }
  // Refuse to judge a period on part of its picks.
  throw new Error(`picks read capped at ${PICKS_PAGE_CAP * PAGE_SIZE} rows for venue ${venueId}`);
}

/**
 * Award the Pick 'Em Prizes that are due. Never throws: every failure is in `errors` (and logged once
 * as `[PickEmPrize] sweep-error`).
 */
export async function settlePickEmPrizes(now: Date = new Date()): Promise<PickEmPrizeSweepReport> {
  if (!supabaseAdmin) return { ...emptyReport(), errors: ["Supabase admin client is not configured."] };
  const db = supabaseAdmin;
  const nowMs = now.getTime();

  let campaigns: PrizeCampaign[];
  try {
    // Only this file's own kind of prize (tests/prize-sweep-ownership-contract.test.ts).
    campaigns = (await listAllActivePickEmPrizeCampaigns()).filter(
      (campaign) => campaign.rewardDefinitionId === PICKEM_PRIZE_DEFINITION_ID,
    );
  } catch (error) {
    return { ...emptyReport(), errors: [`prizes read: ${errorMessage(error)}`] };
  }
  if (campaigns.length === 0) return emptyReport();
  const report = emptyReport(campaigns.length);
  const fail = (message: string, context: Record<string, unknown> = {}) => {
    report.errors.push(message);
    console.error("[PickEmPrize] sweep-error", { message, ...context });
  };

  try {
    // ── Which periods ───────────────────────────────────────────────────────────────────────
    const candidates: Candidate[] = [];
    for (const campaign of campaigns) {
      if (campaign.venueIds.length !== 1) {
        fail("prize is not for exactly one venue", { campaignId: campaign.id });
        continue;
      }
      const venueId = campaign.venueIds[0];
      const timeZone = await getVenueTimezone(venueId);
      for (const period of pickemPrizeCandidatePeriods(campaign.pickemWindow, campaign.createdAt, nowMs, timeZone)) {
        const key = pickemPrizeCycleStart(period, 0);
        if (key) candidates.push({ campaign, venueId, period, key });
      }
    }
    if (candidates.length === 0) return report;

    // ── Drop settled periods ────────────────────────────────────────────────────────────────
    const minKeyMs = Math.min(...candidates.map((candidate) => candidate.key.getTime()));
    const settled = new Set<string>();
    for (const chunk of chunkIds([...new Set(candidates.map((candidate) => candidate.campaign.id))])) {
      const { data, error } = await db
        .from("pickem_prize_settlements")
        .select("challenge_id, period_start")
        .in("challenge_id", chunk)
        .gte("period_start", new Date(minKeyMs).toISOString())
        .returns<Array<{ challenge_id: string; period_start: string }>>();
      if (error) throw new Error(`settlements read: ${error.message}`);
      for (const row of data ?? []) settled.add(`${row.challenge_id}|${Date.parse(row.period_start)}`);
    }
    const isSettled = (candidate: Candidate) => settled.has(`${candidate.campaign.id}|${candidate.key.getTime()}`);

    // ── End one-off prizes whose only period is settled (self-healing: a failed write is retried next run) ──
    for (const candidate of candidates) {
      const kind = candidate.campaign.pickemWindow.kind;
      if ((kind !== "day" && kind !== "range") || !isSettled(candidate)) continue;
      try {
        await endPickEmPrize(candidate.campaign.id);
        report.ended += 1;
        console.info("[PickEmPrize] prize-ended", { campaignId: candidate.campaign.id, venueId: candidate.venueId });
      } catch (error) {
        fail(`end prize: ${errorMessage(error)}`, { campaignId: candidate.campaign.id });
      }
    }

    const open = candidates.filter((candidate) => !isSettled(candidate));
    if (open.length === 0) return report;

    // ── What was graded in the last few minutes ─────────────────────────────────────────────
    const recent: Array<{ venue_id: string; sport_slug: string; sport_key: string; starts_at: string }> = [];
    for (const chunk of chunkIds([...new Set(open.map((candidate) => candidate.venueId))])) {
      // Ordered and paged: an unordered single page could hide a venue on a very busy minute (F6).
      for (let page = 0; page < PICKS_PAGE_CAP; page += 1) {
        const { data, error } = await db
          .from("pickem_picks")
          .select("venue_id, sport_slug, sport_key, starts_at")
          .in("venue_id", chunk)
          .gte("resolved_at", new Date(nowMs - PICKEM_PRIZE_RECENT_GRADING_MS).toISOString())
          .order("resolved_at", { ascending: false })
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
          .returns<typeof recent>();
        if (error) throw new Error(`recent grading read: ${error.message}`);
        recent.push(...(data ?? []));
        if ((data ?? []).length < PAGE_SIZE) break;
      }
    }
    const due = open.filter((candidate) =>
      isPickEmPrizePeriodDue({
        period: candidate.period,
        nowMs,
        recentlyGraded: recent.some((row) => {
          if (row.venue_id !== candidate.venueId) return false;
          const startsMs = Date.parse(row.starts_at);
          if (!(startsMs >= candidate.period.startMs && startsMs < candidate.period.endMsExclusive)) return false;
          return pickemScopeCovers(candidate.campaign.pickemScope, { sportSlug: row.sport_slug, sportKey: row.sport_key });
        }),
      }),
    );
    if (due.length === 0) return report;
    report.periodsChecked = due.length;

    // ── The ledger for the due periods ──────────────────────────────────────────────────────
    const winnersByPeriod = new Map<string, Set<string>>();
    const periodKey = (candidate: Candidate) => `${candidate.campaign.id}|${candidate.key.getTime()}`;
    const dueMinMs = Math.min(...due.map((candidate) => candidate.key.getTime()));
    const dueMaxMs = Math.max(...due.map((candidate) => candidate.key.getTime())) + TIER_KEY_SPAN_MS;
    for (const chunk of chunkIds([...new Set(due.map((candidate) => candidate.campaign.id))])) {
      for (let page = 0; ; page += 1) {
        const { data, error } = await db
          .from("challenge_cycle_winners")
          .select("id, challenge_id, cycle_start, winner_user_id")
          .in("challenge_id", chunk)
          .gte("cycle_start", new Date(dueMinMs).toISOString())
          .lte("cycle_start", new Date(dueMaxMs).toISOString())
          .order("cycle_start", { ascending: true })
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
          .returns<Array<{ id: string; challenge_id: string; cycle_start: string; winner_user_id: string | null }>>();
        if (error) throw new Error(`winners read: ${error.message}`);
        for (const row of data ?? []) {
          const cycleMs = Date.parse(row.cycle_start);
          const owner = due.find(
            (candidate) =>
              candidate.campaign.id === row.challenge_id &&
              cycleMs >= candidate.key.getTime() &&
              cycleMs <= candidate.key.getTime() + TIER_KEY_SPAN_MS,
          );
          if (!owner) continue;
          const set = winnersByPeriod.get(periodKey(owner)) ?? new Set<string>();
          // A deleted player's row (winner_user_id NULL) still used a prize.
          set.add(row.winner_user_id ?? `deleted:${row.id}`);
          winnersByPeriod.set(periodKey(owner), set);
        }
        if ((data ?? []).length < PAGE_SIZE) break;
      }
    }

    // ── Pay each due period ─────────────────────────────────────────────────────────────────
    const picksBySpan = new Map<string, Promise<PickEmPrizePick[]>>();
    for (const candidate of due) {
      const { campaign, venueId, period, key } = candidate;
      try {
        const spanKey = `${venueId}|${period.startMs}|${period.endMsExclusive}`;
        let venuePicks = picksBySpan.get(spanKey);
        if (!venuePicks) {
          venuePicks = readVenuePicks(venueId, period.startMs, period.endMsExclusive);
          picksBySpan.set(spanKey, venuePicks);
        }
        const periodPicks = picksForPickEmPrizePeriod(await venuePicks, campaign.pickemScope, period);
        const alreadyWon = winnersByPeriod.get(periodKey(candidate)) ?? new Set<string>();
        const finalPass = isPickEmPrizeFinalPassReady({ period, periodPicks, nowMs });
        const afterGrace = nowMs >= period.endMsExclusive + PICKEM_PRIZE_SETTLE_GRACE_MS;
        const winKind = pickemPrizeWinKind(campaign);
        let newWinners = 0;
        let outcome: "awarded" | "no_winner" | "below_minimum" | null = null;
        let participants = new Set(periodPicks.map((pick) => pick.userId)).size;

        if (winKind === "target") {
          const plan = planPickEmTargetAwards({
            periodPicks,
            target: campaign.pointsRequiredToWin,
            prizesLeft: Math.max(1, campaign.winnerQuota) - alreadyWon.size,
            alreadyWon,
          });
          for (const award of plan) {
            const { won, exhausted } = await awardCycleWinner({
              campaign,
              userId: award.userId,
              venueId,
              cycleStart: key,
              pointsEarned: award.correct,
              winnerQuota: Math.max(1, campaign.winnerQuota),
              now,
            });
            if (won) newWinners += 1;
            if (exhausted) break;
          }
        } else if (winKind === "tiers") {
          const tiers = campaign.pickemTiers ?? [];
          const plan = planPickEmTierAwards({
            periodPicks,
            limit: campaign.pickemPickLimit ?? 0,
            lowestTierCorrect: Math.min(...tiers.map((tier) => tier.correct)),
            alreadyWon,
            finalPass,
          });
          for (const award of plan) {
            const { status } = await awardPickEmTierPrize({
              campaign,
              venueId,
              userId: award.userId,
              periodStart: key,
              correct: award.correct,
              now,
            });
            if (status === "awarded") newWinners += 1;
          }
        } else if (finalPass) {
          const plan = planPickEmMostRight({ periodPicks, minPicks: campaign.pickemMinPicks, minPlayers: campaign.minPlayers });
          participants = plan.participants;
          let winner: { userId: string; correct: number } | null = null;
          if (plan.kind === "winner") winner = { userId: plan.userId, correct: plan.correct };
          if (plan.kind === "tie") {
            const ranked = await breakTie({ campaign, key, leaders: plan.leaders, afterGrace });
            if (ranked === null) continue; // Wait for the tiebreaker game's final score.
            winner = { userId: ranked[0], correct: plan.correct };
          }
          if (winner && alreadyWon.size === 0) {
            const { won } = await awardCycleWinner({
              campaign,
              userId: winner.userId,
              venueId,
              cycleStart: key,
              pointsEarned: winner.correct,
              winnerQuota: 1,
              now,
            });
            if (won) newWinners += 1;
          }
          if (plan.kind === "below_minimum") outcome = "below_minimum";
        }
        report.awarded += newWinners;

        if (!finalPass) continue;
        const winnerCount = alreadyWon.size + newWinners;
        outcome = winnerCount > 0 ? "awarded" : (outcome ?? "no_winner");
        const { error } = await db.from("pickem_prize_settlements").upsert(
          {
            challenge_id: campaign.id,
            period_start: key.toISOString(),
            venue_id: venueId,
            outcome,
            participant_count: participants,
            winner_count: winnerCount,
          },
          { onConflict: "challenge_id,period_start", ignoreDuplicates: true },
        );
        if (error) throw new Error(`settlement write: ${error.message}`);
        report.settled += 1;
        console.info("[PickEmPrize] period-settled", {
          campaignId: campaign.id,
          venueId,
          periodStart: period.startDate,
          outcome,
          participants,
          winners: winnerCount,
        });
      } catch (error) {
        fail(errorMessage(error), { campaignId: campaign.id, periodStart: period.startDate });
      }
    }
  } catch (error) {
    fail(errorMessage(error));
  }
  return report;
}

/**
 * Rank tied "most picks right" leaders by their tiebreaker guesses. Null = wait: someone guessed, the
 * game they guessed on isn't final yet, and the grace hasn't run out. Throws on a read error.
 */
async function breakTie(params: {
  campaign: PrizeCampaign;
  key: Date;
  leaders: string[];
  afterGrace: boolean;
}): Promise<string[] | null> {
  const guesses = (
    await Promise.all(
      chunkIds(params.leaders).map((userIds) =>
        listPickEmPrizeGuesses({ challengeId: params.campaign.id, periodStart: params.key, userIds }),
      ),
    )
  ).flat();
  if (guesses.length === 0) return rankPickEmPrizeTiebreak(params.leaders, [], null);
  // Every guess for a period names the same game unless the schedule moved; the latest one is the question.
  const game = [...guesses].sort((a, b) => {
    const diff = Date.parse(b.gameStartsAt) - Date.parse(a.gameStartsAt);
    return diff !== 0 ? diff : a.gameId < b.gameId ? -1 : 1;
  })[0];
  const actual = await pickemPrizeGameTotal({ sportKey: game.sportKey, gameId: game.gameId, startsAt: game.gameStartsAt });
  if (actual === null && !params.afterGrace) return null;
  if (actual === null) console.error("[PickEmPrize] tiebreaker-no-final", { campaignId: params.campaign.id, gameId: game.gameId });
  return rankPickEmPrizeTiebreak(params.leaders, guesses, actual);
}
