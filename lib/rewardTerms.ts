// Client-safe Reward "terms" logic — the fill-in-the-blank contract a partner
// signs when creating a reward:
//
//     I want to make [number] of these rewards available every
//     [day/week/month/year]. (points-target; game-winner keeps "give out" — see
//     renderTermsSentence and docs/rewards-game-winner-picker-plan.md)
//
// No "server-only" import and no Supabase dependency, so the Create Reward wizard
// and the server-side createReward validate against the SAME rules (mirrors the
// lib/rewardDefinitions.ts split). The wizard hides impossible options; this
// module is what makes the server refuse them anyway.
//
// Everything here answers one question: given the Live Trivia games a venue
// actually has on its schedule, which (period, quantity) pairs are promises the
// venue can keep? See docs/rewards-terms-sentence-plan.md §1b/§1c.

import type { CampaignRecurringType, ChallengeWinCondition } from "@/types";

/**
 * The game a sentence/refusal names. Every string below takes it as a trailing
 * argument defaulting to "Live Trivia", so existing callers and copy are
 * unchanged while a second definition (NFL Pick 'Em, docs/nfl-pickem-reward-plan.md)
 * can render the same wording for its own game. Only the COPY is parameterized —
 * every rule here still judges a venue's Live Trivia schedule, and NFL rewards
 * don't route through validateRewardTerms at all (they gate on the NFL season
 * calendar, not on a venue schedule).
 */
export const DEFAULT_REWARD_GAME_LABEL = "Live Trivia";

/** The recurring periods a reward's sentence can name. */
export type RewardPeriod = "daily" | "weekly" | "monthly" | "yearly";

export const REWARD_PERIODS: readonly RewardPeriod[] = ["daily", "weekly", "monthly", "yearly"];

/** The noun that completes "…every ___". */
export const REWARD_PERIOD_NOUN: Record<RewardPeriod, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/** Adjective form, for summaries and campaign listings ("Weekly"). */
export const REWARD_PERIOD_LABEL: Record<RewardPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function isRewardPeriod(value: string): value is RewardPeriod {
  return (REWARD_PERIODS as readonly string[]).includes(value);
}

/** Quantities the sentence's number dropdown offers. Capped well under the engine's 100. */
export const REWARD_QUANTITY_OPTIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25];
export const REWARD_MAX_QUANTITY = 100;

/**
 * How many games of the required type a venue is GUARANTEED in each period.
 * Deliberately a floor, never an average: a month contains four whole weeks, so a
 * Tuesday-night venue is guaranteed 4 games a month — the 5th Tuesday that shows
 * up eight months a year is a bonus, not something the partner promised.
 */
export type ScheduleGameCounts = Record<RewardPeriod, number>;

export const EMPTY_GAME_COUNTS: ScheduleGameCounts = { daily: 0, weekly: 0, monthly: 0, yearly: 0 };

/**
 * One live-or-upcoming schedule, reduced to what the counting needs.
 * `weekdayCount` is how many distinct weekdays a weekly schedule runs on (a
 * Tue+Thu schedule is 2 games a week); ignored for other recurrence types.
 */
export type RewardScheduleShape = {
  recurringType: CampaignRecurringType;
  weekdayCount: number;
};

/**
 * Roll a venue's schedules up into guaranteed games-per-period.
 *
 * The rollups use whole-period floors — 4 weeks per month, 52 weeks per year —
 * rather than 30/365-day approximations, because these numbers become a promise
 * of how many real coupons get handed out.
 */
export function computeScheduleGameCounts(schedules: readonly RewardScheduleShape[]): ScheduleGameCounts {
  let perDay = 0;
  let weeklyOwn = 0;
  let monthlyOwn = 0;
  let yearlyOwn = 0;

  for (const schedule of schedules) {
    const days = Math.max(1, Math.round(Number(schedule.weekdayCount) || 0));
    if (schedule.recurringType === "daily") perDay += 1;
    else if (schedule.recurringType === "weekly") weeklyOwn += days;
    else if (schedule.recurringType === "monthly") monthlyOwn += 1;
    else if (schedule.recurringType === "yearly") yearlyOwn += 1;
    // "none" is a one-off occurrence — it recurs in no period, so it contributes
    // nothing here. isOneOffOnly (below) is what surfaces it.
  }

  const weekly = perDay * 7 + weeklyOwn;
  return {
    daily: perDay,
    weekly,
    monthly: weekly * 4 + monthlyOwn,
    // NOT monthly * 12 — that would compound the 4-week floor into 48 weeks and
    // undercount a weekly schedule by a month's worth of games.
    yearly: weekly * 52 + monthlyOwn * 12 + yearlyOwn,
  };
}

/**
 * The game count for a period when it is EXACTLY the same in every instance of
 * that period, or null when it varies.
 *
 * This is the gate for "winner of the game" rewards, where the quantity is locked
 * to the game count: a weekly venue cannot honestly promise "4 rewards every
 * month" when eight months of the year have five Tuesdays and would mint a fifth.
 */
export function exactGameCountForPeriod(
  schedules: readonly RewardScheduleShape[],
  period: RewardPeriod,
): number | null {
  // A genuine one-off schedule mixed in alongside recurring ones adds a game in
  // whichever period it happens to land in, then never again — the period's game
  // count isn't the same "every instance" once that happens. Refuse the lock
  // rather than silently drop the one-off and overpromise a fixed count.
  const hasOneOff = schedules.some((schedule) => schedule.recurringType === "none");
  const kinds = new Set(schedules.map((schedule) => schedule.recurringType));
  kinds.delete("none");
  if (kinds.size === 0) return null;
  if (hasOneOff) return null;

  const counts = computeScheduleGameCounts(schedules);
  const only = (...allowed: CampaignRecurringType[]) =>
    [...kinds].every((kind) => allowed.includes(kind));

  // A day holds a fixed number of games only if nothing weekly/monthly/yearly
  // adds an extra one on some days.
  if (period === "daily") return only("daily") ? counts.daily : null;
  // A week holds a fixed number of games as long as every schedule repeats within
  // the week.
  if (period === "weekly") return only("daily", "weekly") ? counts.weekly : null;
  // Months and years vary in how many weeks they contain, so anything week-scoped
  // disqualifies them.
  if (period === "monthly") return only("monthly") ? counts.monthly : null;
  return only("monthly", "yearly") ? counts.yearly : null;
}

/** Everything the wizard and the server need to judge a proposed sentence. */
export type RewardScheduleFacts = {
  /** Whether the required game is on the venue's schedule at all. */
  scheduled: boolean;
  /** Scheduled, but every schedule is a one-off — no recurrence to hang a period on. */
  isOneOffOnly: boolean;
  counts: ScheduleGameCounts;
  schedules: readonly RewardScheduleShape[];
};

export function summarizeRewardSchedules(schedules: readonly RewardScheduleShape[]): RewardScheduleFacts {
  const recurring = schedules.filter((schedule) => schedule.recurringType !== "none");
  return {
    scheduled: schedules.length > 0,
    isOneOffOnly: schedules.length > 0 && recurring.length === 0,
    counts: computeScheduleGameCounts(schedules),
    schedules,
  };
}

/**
 * Periods the venue may pick, for this win condition.
 *  - points target: any period that contains at least one game, since several
 *    guests can clear a points target at the same game.
 *  - winner of the game: only periods with an exact game count (see above), since
 *    the quantity is locked to it.
 */
export function allowedPeriodsFor(
  facts: RewardScheduleFacts,
  winCondition: ChallengeWinCondition,
): RewardPeriod[] {
  if (!facts.scheduled || facts.isOneOffOnly) return [];
  return REWARD_PERIODS.filter((period) =>
    winCondition === "game_winner"
      ? (exactGameCountForPeriod(facts.schedules, period) ?? 0) >= 1
      : facts.counts[period] >= 1,
  );
}

/**
 * The quantity a "winner of the game" reward is locked to for a period, or null
 * when the partner chooses the number themselves (points-target rewards) or the
 * period is unusable. A one-off game-winner reward is always exactly 1 — one
 * game, one winner.
 */
export function lockedQuantityFor(
  facts: RewardScheduleFacts,
  winCondition: ChallengeWinCondition,
  period: RewardPeriod | null,
): number | null {
  if (winCondition !== "game_winner") return null;
  if (period === null) return facts.scheduled ? 1 : null;
  return exactGameCountForPeriod(facts.schedules, period);
}

// ── Copy ────────────────────────────────────────────────────────────────────

const plural = (count: number, noun: string) => (count === 1 ? noun : `${noun}s`);

/**
 * The sentence itself, for the confirm screen and any summary. "these rewards"
 * stays plural at any count — it names the reward type being handed out, not the
 * individual coupons.
 *
 * Points-target rewards read as "make N available" — a promotion the venue is
 * running, not a giveaway — while game-winner keeps "give out" (its sentence is
 * being replaced by a game picker; see docs/rewards-game-winner-picker-plan.md,
 * so this wording is legacy/flag-off display only, not a new decision).
 */
export function renderTermsSentence(
  quantity: number,
  period: RewardPeriod | null,
  winCondition: ChallengeWinCondition = "points_threshold",
  gameLabel: string = DEFAULT_REWARD_GAME_LABEL,
): string {
  const count = Math.max(1, Math.round(quantity));
  if (winCondition === "game_winner") {
    if (period === null) {
      return `I want to give out ${count} of these rewards at my next ${gameLabel} game.`;
    }
    return `I want to give out ${count} of these rewards every ${REWARD_PERIOD_NOUN[period]}.`;
  }
  if (period === null) {
    return `I want to make ${count} of these rewards available at my next ${gameLabel} game.`;
  }
  return `I want to make ${count} of these rewards available every ${REWARD_PERIOD_NOUN[period]}.`;
}

// States the problem only — the wizard always appends its own "Schedule Live
// Trivia" link right after this (CreateRewardWizard.tsx), so the message
// itself must not restate that CTA or the two run together as a duplicate
// ("Schedule Live Trivia ... Schedule Live Trivia.").
export function notScheduledMessage(gameLabel: string = DEFAULT_REWARD_GAME_LABEL): string {
  return `${gameLabel} isn't scheduled at this venue yet.`;
}

export function oneOffOnlyMessage(gameLabel: string = DEFAULT_REWARD_GAME_LABEL): string {
  return `You only have a single ${gameLabel} game scheduled. Schedule recurring ${gameLabel} to offer a recurring reward.`;
}

export const REWARD_TERMS_NOT_SCHEDULED_MESSAGE = notScheduledMessage();
export const REWARD_TERMS_ONE_OFF_ONLY_MESSAGE = oneOffOnlyMessage();

export function periodHasNoGameMessage(
  period: RewardPeriod,
  gameLabel: string = DEFAULT_REWARD_GAME_LABEL,
): string {
  const noun = REWARD_PERIOD_NOUN[period];
  return `You don't run ${gameLabel} every ${noun}. Choose a longer period, or schedule ${gameLabel} every ${noun}.`;
}

export function tooManyWinnerRewardsMessage(
  period: RewardPeriod,
  available: number,
  gameLabel: string = DEFAULT_REWARD_GAME_LABEL,
): string {
  const noun = REWARD_PERIOD_NOUN[period];
  if (available < 1) {
    return `You don't run the same number of ${gameLabel} games every ${noun}, so you can't promise a fixed number of "winner of the game" rewards per ${noun}. Choose a different period.`;
  }
  return `You run ${available} ${gameLabel} ${plural(available, "game")} each ${noun}, and each game has one winner — so you can offer at most ${available} "winner of the game" ${plural(available, "reward")} per ${noun}. Schedule more ${gameLabel} games to offer more.`;
}

export function fixedWinnerRewardsMessage(
  period: RewardPeriod,
  available: number,
  gameLabel: string = DEFAULT_REWARD_GAME_LABEL,
): string {
  const noun = REWARD_PERIOD_NOUN[period];
  return `Every ${gameLabel} game has a winner, and you run ${available} ${plural(available, "game")} each ${noun} — so this reward gives out exactly ${available} per ${noun}. To hand out fewer, use a points target instead.`;
}

export function singleGameWinnerQuantityMessage(
  gameLabel: string = DEFAULT_REWARD_GAME_LABEL,
): string {
  return `A single ${gameLabel} game has one winner, so a "winner of the game" reward for one game is worth exactly 1 prize.`;
}

export function quantityOutOfRangeMessage(): string {
  return `Choose between 1 and ${REWARD_MAX_QUANTITY} rewards.`;
}

// ── Validation ──────────────────────────────────────────────────────────────

export type RewardTermsInput = {
  winCondition: ChallengeWinCondition;
  /** null = the one-off sentence ("at my next Live Trivia game"), i.e. cadence "none". */
  period: RewardPeriod | null;
  quantity: number;
};

/**
 * Validate a proposed sentence against the venue's real schedule. Returns the
 * partner-facing error, or null when the terms are honorable. The wizard calls
 * this to render errors live; createReward calls it as the authoritative gate.
 */
export function validateRewardTerms(
  facts: RewardScheduleFacts,
  input: RewardTermsInput,
  gameLabel: string = DEFAULT_REWARD_GAME_LABEL,
): string | null {
  if (!facts.scheduled) return notScheduledMessage(gameLabel);

  const quantity = Math.round(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > REWARD_MAX_QUANTITY) {
    return quantityOutOfRangeMessage();
  }

  if (input.period === null) {
    // One-off reward. A game has a single winner, so a game-winner reward can
    // only be worth one prize at one game.
    if (input.winCondition === "game_winner" && quantity !== 1) {
      return singleGameWinnerQuantityMessage(gameLabel);
    }
    return null;
  }

  if (facts.isOneOffOnly) return oneOffOnlyMessage(gameLabel);

  if (input.winCondition === "game_winner") {
    const exact = exactGameCountForPeriod(facts.schedules, input.period);
    if (exact === null || exact < 1) {
      return tooManyWinnerRewardsMessage(input.period, exact ?? 0, gameLabel);
    }
    // The quantity is LOCKED to the game count, not merely capped by it. Every
    // finished game resolves its own winner (lib/liveTriviaWinnerRewards.ts keys
    // each award on the occurrence, and never consults winner_quota), so a venue
    // that stored "1 per week" while running two games would quietly hand out
    // two. Storing a number the resolver won't honor is worse than refusing it.
    if (quantity > exact) return tooManyWinnerRewardsMessage(input.period, exact, gameLabel);
    if (quantity < exact) return fixedWinnerRewardsMessage(input.period, exact, gameLabel);
    return null;
  }

  if (facts.counts[input.period] < 1) return periodHasNoGameMessage(input.period, gameLabel);
  return null;
}

// ── Engine mapping ──────────────────────────────────────────────────────────

/** The sentence's period IS the campaign's recurrence; the one-off form is "none". */
export function cadenceForPeriod(period: RewardPeriod | null): CampaignRecurringType {
  return period ?? "none";
}

export function periodForCadence(cadence: CampaignRecurringType): RewardPeriod | null {
  return isRewardPeriod(cadence) ? cadence : null;
}
