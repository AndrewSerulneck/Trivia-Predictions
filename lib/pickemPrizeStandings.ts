// Who has won a Pick 'Em Prize, and when a period is ready to pay (docs/pickem-college-football-and-prize-plan.md
// Phase 4b). Pure: no I/O, no clock of its own. The award sweep (lib/pickemPrizeAwards.ts) reads the
// picks and the ledger, asks these functions what to pay, and pays it through the RPCs.
//
// The rules, decided here and nowhere else:
//   - WHICH PERIODS: a period counts once it has begun, if it ends after the prize was created (Andrew,
//     2026-10-31: a repeating prize created on a Saturday afternoon pays that Saturday, and picks made
//     before the prize existed count). It is looked at until PICKEM_PRIZE_LOOKBACK_MS after its end.
//   - A PICK COUNTS when it is in the prize's games (scope) and its GAME starts inside the period.
//     Cancelled picks never count. A push is graded but not correct.
//   - "X OUT OF N" counts only a player's FIRST N picks in the period, by when they were made (the 4a
//     contract that lets the pick limit fail open: a pick that slipped past N can't help). A player is
//     paid once all of those N are graded, or at the period's final pass with whatever they have (D4:
//     the top tier reached, one prize per player per period — the RPC enforces both).
//   - "GET N RIGHT" pays the moment a player has N correct picks, first come first served by when the
//     N-th was graded, up to the prize's quantity.
//   - "MOST PICKS RIGHT" pays only at the final pass: among players with at least the minimum picks,
//     the most correct (more than 0); the partner's minimum players counts everyone with a pick; a tie
//     goes to the tiebreaker guess (rankPickEmPrizeTiebreak).
//   - THE FINAL PASS runs once the period has ended and either no pick in its games is still pending
//     at the venue, or PICKEM_PRIZE_SETTLE_GRACE_MS has passed (a pick still pending then just doesn't count).

import { addPickEmPrizeDays, pickemPrizePeriodForDate, pickemScopeCovers, type PickEmPrizePeriod } from "@/lib/pickemPrizes";
import { formatZonedDate } from "@/lib/categoryBlitzScheduleTime";
import type { PickEmPrizeScope, PickEmPrizeWindow } from "@/types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** After a period ends, how long the final pass waits for its last picks to be graded. */
export const PICKEM_PRIZE_SETTLE_GRACE_MS = 3 * DAY_MS;
/** After a period ends, how long the sweep keeps looking at it (grace + slack for an outage). */
export const PICKEM_PRIZE_LOOKBACK_MS = 5 * DAY_MS;
/** An ended Pick 'Em Prize's card stays on the venue Prizes panel this long after its shown period ends (plan 7.6.2, F22). */
export const PICKEM_PRIZE_ENDED_CARD_MS = DAY_MS;
/** "Graded in the last few minutes": the cron runs every minute; the overlap absorbs a missed run. */
export const PICKEM_PRIZE_RECENT_GRADING_MS = 5 * MINUTE_MS;
/** An ended, unsettled period with nothing newly graded is re-checked once every this many minutes. */
export const PICKEM_PRIZE_RETRY_EVERY_MINUTES = 10;

export type PickEmPrizePickStatus = "pending" | "won" | "lost" | "push" | "canceled";

/** One pickem_picks row as the sweep reads it. */
export type PickEmPrizePick = {
  id: string;
  userId: string;
  status: PickEmPrizePickStatus;
  createdAt: string;
  startsAt: string;
  resolvedAt: string | null;
  sportSlug: string;
  sportKey: string;
};

const parseMs = (value: string | null | undefined): number => {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : Number.NaN;
};

// ── Periods ────────────────────────────────────────────────────────────────────────────────────

/**
 * The periods of `window` the sweep should look at now: begun, ending after the prize was created,
 * and ended no more than PICKEM_PRIZE_LOOKBACK_MS ago. Oldest first, each once. An unreadable
 * created_at fails closed (no periods).
 */
export const pickemPrizeCandidatePeriods = (
  window: PickEmPrizeWindow,
  createdAt: string | null | undefined,
  nowMs: number,
  timeZone: string,
): PickEmPrizePeriod[] => {
  const createdMs = parseMs(createdAt);
  if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) return [];
  const today = formatZonedDate(nowMs, timeZone);
  const daysBack = Math.ceil(PICKEM_PRIZE_LOOKBACK_MS / DAY_MS) + 1;
  const byStart = new Map<string, PickEmPrizePeriod>();
  for (let offset = daysBack; offset >= 0; offset -= 1) {
    const period = pickemPrizePeriodForDate(window, addPickEmPrizeDays(today, -offset), timeZone);
    if (!period || byStart.has(period.startDate)) continue;
    if (period.startMs > nowMs) continue;
    if (period.endMsExclusive <= createdMs) continue;
    if (nowMs - period.endMsExclusive > PICKEM_PRIZE_LOOKBACK_MS) continue;
    byStart.set(period.startDate, period);
  }
  return [...byStart.values()].sort((a, b) => a.startMs - b.startMs);
};

/** What the venue Prizes card shows for a Pick 'Em Prize (plan Phase 7.2, finding F2). */
export type PickEmPrizeCardPeriod = {
  /** The period whose winners the card shows: the one running now, else the last one that counted; null before the first. */
  shown: PickEmPrizePeriod | null;
  /** Venue-local first day of the next period while none is running (null when one is running or none is left). */
  nextStartDate: string | null;
  /** No period is running or left, and the last one ended more than PICKEM_PRIZE_LOOKBACK_MS ago (the sweep has stopped looking). */
  pastLookback: boolean;
};

/**
 * Which period the venue Prizes card is about at `nowMs`. Same counting rule as
 * pickemPrizeCandidatePeriods: a period counts if it ends after the prize was created. A one-day or
 * date-range prize has its one period; a weekday prize between its days shows the last day it ran and
 * names the next; a weekly prize always has one running. An unreadable created_at counts every period.
 */
export const pickemPrizeCardPeriod = (
  window: PickEmPrizeWindow,
  createdAt: string | null | undefined,
  nowMs: number,
  timeZone: string,
): PickEmPrizeCardPeriod => {
  const createdMs = Number.isFinite(parseMs(createdAt)) ? parseMs(createdAt) : Number.NEGATIVE_INFINITY;
  if (window.kind === "day" || window.kind === "range") {
    const only = pickemPrizePeriodForDate(window, window.kind === "day" ? window.date : window.from, timeZone);
    if (!only) return { shown: null, nextStartDate: null, pastLookback: false };
    if (nowMs < only.startMs) return { shown: null, nextStartDate: only.startDate, pastLookback: false };
    return { shown: only, nextStartDate: null, pastLookback: nowMs - only.endMsExclusive > PICKEM_PRIZE_LOOKBACK_MS };
  }
  const today = formatZonedDate(nowMs, timeZone);
  const current = pickemPrizePeriodForDate(window, today, timeZone);
  if (current && current.endMsExclusive > createdMs) return { shown: current, nextStartDate: null, pastLookback: false };
  let last: PickEmPrizePeriod | null = null;
  let next: PickEmPrizePeriod | null = null;
  for (let offset = 1; offset <= 7 && (!last || !next); offset += 1) {
    last ??= pickemPrizePeriodForDate(window, addPickEmPrizeDays(today, -offset), timeZone);
    next ??= pickemPrizePeriodForDate(window, addPickEmPrizeDays(today, offset), timeZone);
  }
  return {
    shown: last && last.endMsExclusive > createdMs ? last : null,
    nextStartDate: next?.startDate ?? null,
    pastLookback: false,
  };
};

/** The picks that count for a prize in a period: in scope, game inside the period, not cancelled. */
export const picksForPickEmPrizePeriod = (
  picks: readonly PickEmPrizePick[],
  scope: PickEmPrizeScope,
  period: Pick<PickEmPrizePeriod, "startMs" | "endMsExclusive">,
): PickEmPrizePick[] =>
  picks.filter((pick) => {
    if (pick.status === "canceled") return false;
    const startsMs = parseMs(pick.startsAt);
    if (!(startsMs >= period.startMs && startsMs < period.endMsExclusive)) return false;
    return pickemScopeCovers(scope, pick);
  });

/** Has the period ended and is it ready for its final pass? See the header. */
export const isPickEmPrizeFinalPassReady = (params: {
  period: Pick<PickEmPrizePeriod, "endMsExclusive">;
  periodPicks: readonly PickEmPrizePick[];
  nowMs: number;
}): boolean => {
  const { period, periodPicks, nowMs } = params;
  if (nowMs < period.endMsExclusive) return false;
  if (nowMs >= period.endMsExclusive + PICKEM_PRIZE_SETTLE_GRACE_MS) return true;
  return !periodPicks.some((pick) => pick.status === "pending");
};

/**
 * Should the sweep read this period's picks on this run? Only when something can have changed: a pick
 * in it was graded in the last few minutes; or it has ended and is not settled — right after its end,
 * once grace has passed, and otherwise every PICKEM_PRIZE_RETRY_EVERY_MINUTES (self-healing, bounded).
 */
export const isPickEmPrizePeriodDue = (params: {
  period: Pick<PickEmPrizePeriod, "endMsExclusive">;
  recentlyGraded: boolean;
  nowMs: number;
}): boolean => {
  const { period, recentlyGraded, nowMs } = params;
  if (recentlyGraded) return true;
  if (nowMs < period.endMsExclusive) return false;
  if (nowMs - period.endMsExclusive < PICKEM_PRIZE_RECENT_GRADING_MS) return true;
  if (nowMs >= period.endMsExclusive + PICKEM_PRIZE_SETTLE_GRACE_MS) return true;
  return Math.floor(nowMs / MINUTE_MS) % PICKEM_PRIZE_RETRY_EVERY_MINUTES === 0;
};

// ── "X out of N" ───────────────────────────────────────────────────────────────────────────────

export type PickEmPrizeTierStanding = {
  userId: string;
  /** Picks among the player's first N (≤ N). */
  counted: number;
  correct: number;
  pending: number;
  /** When the last of the counted picks was graded (NaN while any is pending). */
  completedAtMs: number;
};

const byMadeOrder = (a: PickEmPrizePick, b: PickEmPrizePick): number => {
  const diff = parseMs(a.createdAt) - parseMs(b.createdAt);
  if (Number.isFinite(diff) && diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Each player's first N picks in the period, by when they were made, and how those stand. */
export const pickemPrizeTierStandings = (
  periodPicks: readonly PickEmPrizePick[],
  limit: number,
): PickEmPrizeTierStanding[] => {
  const byUser = new Map<string, PickEmPrizePick[]>();
  for (const pick of periodPicks) {
    const list = byUser.get(pick.userId) ?? [];
    list.push(pick);
    byUser.set(pick.userId, list);
  }
  const standings: PickEmPrizeTierStanding[] = [];
  for (const [userId, list] of byUser) {
    const counted = [...list].sort(byMadeOrder).slice(0, Math.max(0, limit));
    const pending = counted.filter((pick) => pick.status === "pending").length;
    standings.push({
      userId,
      counted: counted.length,
      correct: counted.filter((pick) => pick.status === "won").length,
      pending,
      completedAtMs: pending > 0 ? Number.NaN : Math.max(...counted.map((pick) => parseMs(pick.resolvedAt)).filter(Number.isFinite), 0),
    });
  }
  return standings;
};

/**
 * Who to pay on this run, earliest finisher first (so a scarce top tier goes to whoever got there
 * first): players not yet paid this period, at or above the lowest tier, whose first N are all graded
 * — or anyone at the final pass, with what they have. The RPC picks the tier.
 */
export const planPickEmTierAwards = (params: {
  periodPicks: readonly PickEmPrizePick[];
  limit: number;
  lowestTierCorrect: number;
  alreadyWon: ReadonlySet<string>;
  finalPass: boolean;
}): Array<{ userId: string; correct: number }> =>
  pickemPrizeTierStandings(params.periodPicks, params.limit)
    .filter((standing) => !params.alreadyWon.has(standing.userId))
    .filter((standing) => standing.correct >= params.lowestTierCorrect)
    .filter((standing) => params.finalPass || (standing.pending === 0 && standing.counted >= params.limit))
    .sort((a, b) => {
      const aMs = Number.isFinite(a.completedAtMs) ? a.completedAtMs : Number.POSITIVE_INFINITY;
      const bMs = Number.isFinite(b.completedAtMs) ? b.completedAtMs : Number.POSITIVE_INFINITY;
      if (aMs !== bMs) return aMs - bMs;
      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    })
    .map((standing) => ({ userId: standing.userId, correct: standing.correct }));

// ── "Get N right" ──────────────────────────────────────────────────────────────────────────────

/**
 * Who to pay on this run: players not yet paid this period with at least `target` correct picks, in
 * the order they reached it (when their target-th correct pick was graded), at most the prizes left.
 */
export const planPickEmTargetAwards = (params: {
  periodPicks: readonly PickEmPrizePick[];
  target: number;
  prizesLeft: number;
  alreadyWon: ReadonlySet<string>;
}): Array<{ userId: string; correct: number }> => {
  if (params.prizesLeft <= 0 || params.target < 1) return [];
  const winsByUser = new Map<string, number[]>();
  for (const pick of params.periodPicks) {
    if (pick.status !== "won") continue;
    const list = winsByUser.get(pick.userId) ?? [];
    const resolvedMs = parseMs(pick.resolvedAt);
    list.push(Number.isFinite(resolvedMs) ? resolvedMs : Number.POSITIVE_INFINITY);
    winsByUser.set(pick.userId, list);
  }
  return [...winsByUser.entries()]
    .filter(([userId, wins]) => wins.length >= params.target && !params.alreadyWon.has(userId))
    .map(([userId, wins]) => ({ userId, correct: wins.length, reachedAtMs: [...wins].sort((a, b) => a - b)[params.target - 1] }))
    .sort((a, b) => (a.reachedAtMs !== b.reachedAtMs ? a.reachedAtMs - b.reachedAtMs : a.userId < b.userId ? -1 : 1))
    .slice(0, params.prizesLeft)
    .map(({ userId, correct }) => ({ userId, correct }));
};

// ── "Most picks right" ─────────────────────────────────────────────────────────────────────────

export type PickEmMostRightOutcome =
  | { kind: "below_minimum"; participants: number }
  | { kind: "no_winner"; participants: number }
  | { kind: "winner"; participants: number; userId: string; correct: number }
  | { kind: "tie"; participants: number; leaders: string[]; correct: number };

/** The final pass of a "most picks right" period, before any tiebreaker. */
export const planPickEmMostRight = (params: {
  periodPicks: readonly PickEmPrizePick[];
  minPicks: number | null;
  minPlayers: number | null | undefined;
}): PickEmMostRightOutcome => {
  const tally = new Map<string, { picks: number; correct: number }>();
  for (const pick of params.periodPicks) {
    const entry = tally.get(pick.userId) ?? { picks: 0, correct: 0 };
    entry.picks += 1;
    if (pick.status === "won") entry.correct += 1;
    tally.set(pick.userId, entry);
  }
  const participants = tally.size;
  if (params.minPlayers && participants < params.minPlayers) return { kind: "below_minimum", participants };
  const minPicks = Math.max(1, params.minPicks ?? 1);
  const eligible = [...tally.entries()].filter(([, entry]) => entry.picks >= minPicks);
  const best = Math.max(0, ...eligible.map(([, entry]) => entry.correct));
  if (best <= 0) return { kind: "no_winner", participants };
  const leaders = eligible
    .filter(([, entry]) => entry.correct === best)
    .map(([userId]) => userId)
    .sort();
  if (leaders.length === 1) return { kind: "winner", participants, userId: leaders[0], correct: best };
  return { kind: "tie", participants, leaders, correct: best };
};

export type PickEmPrizeTiebreakGuess = { userId: string; predictedTotal: number; savedAt: string };

/**
 * Tied leaders, best first (D8). Same shape as NFL Pick 'Em's tiebreaker, with the plan's last rule:
 *   1. closest to the actual total; 2. equal distance → the lower guess;
 *   3. a player with no guess below every guesser;
 *   4. still tied → the earliest saved guess; 5. then user id (so a re-run never picks someone else).
 * `actualTotal` null (no final score) → guessers by earliest guess, then the rest by id.
 */
export const rankPickEmPrizeTiebreak = (
  userIds: readonly string[],
  guesses: readonly PickEmPrizeTiebreakGuess[],
  actualTotal: number | null,
): string[] => {
  const guessByUser = new Map<string, PickEmPrizeTiebreakGuess>();
  for (const guess of guesses) {
    if (Number.isFinite(guess.predictedTotal)) guessByUser.set(guess.userId, guess);
  }
  const hasActual = actualTotal !== null && Number.isFinite(actualTotal);
  return [...new Set(userIds)].sort((a, b) => {
    const guessA = guessByUser.get(a);
    const guessB = guessByUser.get(b);
    if (!guessA || !guessB) {
      if (guessA || guessB) return guessA ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    }
    if (hasActual) {
      const distance = Math.abs(guessA.predictedTotal - (actualTotal as number)) - Math.abs(guessB.predictedTotal - (actualTotal as number));
      if (distance !== 0) return distance;
      if (guessA.predictedTotal !== guessB.predictedTotal) return guessA.predictedTotal - guessB.predictedTotal;
    }
    const savedA = parseMs(guessA.savedAt);
    const savedB = parseMs(guessB.savedAt);
    if (Number.isFinite(savedA) && Number.isFinite(savedB) && savedA !== savedB) return savedA - savedB;
    return a < b ? -1 : a > b ? 1 : 0;
  });
};
