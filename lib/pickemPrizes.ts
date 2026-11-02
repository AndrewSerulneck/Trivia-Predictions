// The Pick 'Em Prize (docs/pickem-college-football-and-prize-plan.md Phase 4a). Pure and client-safe:
// shared by the reward registry, the description composer, createReward, the pick limit
// (lib/pickemPrizeLimit.ts), the award sweep (Phase 4b) and the Prize wizard (Phase 5).
//
// A partner picks:
//   - WHICH GAMES (scope): whole sports and/or single leagues. A sport means every league in it,
//     including leagues added later; a league is a provider sport key ("soccer_epl"). Never the NFL.
//   - WHEN (window), in the venue's time zone: one chosen day, a repeating weekday, each Mon–Sun
//     week, or a date range. Each window is cut into PERIODS (one day, one week, the whole range).
//     A pick belongs to the period containing its GAME's start (venue-local date).
//   - HOW TO WIN:
//       most_right — most correct picks in the period (game_winner, 1 winner), among players with at
//                    least `pickem_min_picks` picks; ties → the tiebreaker guess (Phase 4b).
//       target     — "Get N right" (points_threshold, N = points_required_to_win, quota = quantity).
//       tiers      — "X out of N": players get N picks in the scope per period (D5) and win the top
//                    tier they reach (D4); 1–3 tiers, each its own prize and quantity.
//
// THE cycle key is pickemPrizeCycleStart() below — the one place that decides it. For tier 0 (most
// right, target) it equals computeCycleStart() for the campaign createReward stores, so generic
// cycle readers agree with it.
//
// A LEAF MODULE: lib/rewardDefinitions.ts imports it, so it must not import anything that imports
// the registry back (lib/rankedPlaceRewards.ts does) — tier prizes live in lib/pickemPrizeTiers.ts.

import { formatZonedDate, zonedDateTimeToUtcMs } from "@/lib/categoryBlitzScheduleTime";
import {
  PICKEM_SPORT_CATALOG,
  pickEmLeagueByKey,
  pickEmSportBySlug,
  pickEmSportOfLeague,
  type PickEmSportCatalogEntry,
} from "@/lib/pickemSports";
import type { ChallengeWinCondition, PickEmPrizeScope, PickEmPrizeSportSlug, PickEmPrizeWindow } from "@/types";

export const PICKEM_PRIZE_DEFINITION_ID = "pickem_challenge";

/**
 * May the Create Prize wizard offer the Pick 'Em Prize? Yes since Phase 5 built its steps (Games,
 * When, How to win). Kept as a switch so turning the tile off is one edit.
 */
export const isPickEmPrizeOffered = (): boolean => true;

// ── Limits (also the database checks in 20261031200417_pickem_prizes.sql) ────────────────────────

export const PICKEM_PRIZE_MAX_PICK_LIMIT = 100;
export const PICKEM_PRIZE_MAX_MIN_PICKS = 100;
export const PICKEM_PRIZE_MAX_TARGET = 500;
export const PICKEM_PRIZE_MAX_TIERS = 3;
/** Per tier, and in total across tiers (WINNER_QUOTA_CAP in lib/rewards.ts). */
export const PICKEM_PRIZE_MAX_QUANTITY = 100;
export const PICKEM_PRIZE_MAX_RANGE_DAYS = 180;
/** A one-day or date-range prize may start at most this many days ahead. */
export const PICKEM_PRIZE_MAX_DAYS_AHEAD = 365;

// ── Messages (on screen: "prize", never "reward") ─────────────────────────────────────────────

export const PICKEM_PRIZE_SCOPE_MESSAGE = "Choose at least one Pick 'Em sport or league. NFL Pick 'Em has its own prize.";
export const PICKEM_PRIZE_WINDOW_MESSAGE = "Choose when this prize runs.";
export const PICKEM_PRIZE_WINDOW_PAST_MESSAGE = "Choose a day that hasn't passed yet.";
export const PICKEM_PRIZE_WINDOW_TOO_FAR_MESSAGE = "Choose a day within the next year.";
export const PICKEM_PRIZE_RANGE_ORDER_MESSAGE = "The last day must be on or after the first day.";
export const PICKEM_PRIZE_RANGE_LENGTH_MESSAGE = `A date range can be up to ${PICKEM_PRIZE_MAX_RANGE_DAYS} days.`;
export const PICKEM_PRIZE_MIN_PICKS_MESSAGE = `Enter how many picks a player must make to be ranked, from 1 to ${PICKEM_PRIZE_MAX_MIN_PICKS}.`;
export const PICKEM_PRIZE_MOST_RIGHT_SCORES_MESSAGE =
  "Most picks right needs a sport with scores for its tiebreaker. Add a sport other than MMA or tennis.";
export const PICKEM_PRIZE_TARGET_MESSAGE = `Enter how many picks right wins, from 1 to ${PICKEM_PRIZE_MAX_TARGET}.`;
export const PICKEM_PRIZE_QUANTITY_MESSAGE = `Enter how many of this prize are available, from 1 to ${PICKEM_PRIZE_MAX_QUANTITY}.`;
export const PICKEM_PRIZE_PICK_LIMIT_MESSAGE = `Enter how many picks each player gets, from 1 to ${PICKEM_PRIZE_MAX_PICK_LIMIT}.`;
export const PICKEM_PRIZE_TIER_COUNT_MESSAGE = `Add 1 to ${PICKEM_PRIZE_MAX_TIERS} tiers.`;
export const PICKEM_PRIZE_TIER_ORDER_MESSAGE = "Each tier needs more picks right than the one before it.";
export const PICKEM_PRIZE_TIER_QUANTITY_MESSAGE = `Enter how many of each tier's prize are available. All tiers together can have up to ${PICKEM_PRIZE_MAX_QUANTITY}.`;
export const PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE = "This prize's settings don't match how it's won. Check How to win.";
export const pickemPrizeTierAboveLimitMessage = (limit: number): string =>
  `A tier can't need more picks right than the ${limit} picks each player gets.`;

// ── Scope ──────────────────────────────────────────────────────────────────────────────────────

/** The sports a Pick 'Em Prize can cover, in catalog order (never the NFL). */
export const PICKEM_PRIZE_SPORTS: readonly PickEmSportCatalogEntry[] = PICKEM_SPORT_CATALOG.filter(
  (sport) => sport.slug !== "nfl",
);
const PRIZE_SPORT_SLUGS = new Set<string>(PICKEM_PRIZE_SPORTS.map((sport) => sport.slug));
const PRIZE_LEAGUE_ORDER = PICKEM_PRIZE_SPORTS.flatMap((sport) => sport.leagues.map((league) => league.sportKey));

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const stringList = (value: unknown): string[] | null => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
};

/**
 * A scope with known sports and leagues only, in catalog order, each once — or null for anything
 * else (unknown, the NFL, empty). A league whose whole sport is chosen is dropped (already covered).
 */
export const normalizePickEmPrizeScope = (value: unknown): PickEmPrizeScope | null => {
  const record = asRecord(value);
  if (!record) return null;
  const sports = stringList(record.sports);
  const leagues = stringList(record.leagues);
  if (!sports || !leagues) return null;
  if (sports.some((slug) => !PRIZE_SPORT_SLUGS.has(slug))) return null;
  if (leagues.some((key) => !PRIZE_LEAGUE_ORDER.includes(key))) return null;
  const chosenSports = PICKEM_PRIZE_SPORTS.filter((sport) => sports.includes(sport.slug)).map(
    (sport) => sport.slug as PickEmPrizeSportSlug,
  );
  const chosenLeagues = PRIZE_LEAGUE_ORDER.filter(
    (key) => leagues.includes(key) && !chosenSports.includes(pickEmSportOfLeague(key)?.slug as PickEmPrizeSportSlug),
  );
  if (chosenSports.length === 0 && chosenLeagues.length === 0) return null;
  return { sports: chosenSports, leagues: chosenLeagues };
};

/** Does the prize count this game (or pick)? By its sport slug and its league's sport key. */
export const pickemScopeCovers = (
  scope: PickEmPrizeScope,
  game: { sportSlug: string; sportKey: string },
): boolean =>
  (scope.sports as readonly string[]).includes(game.sportSlug) || scope.leagues.includes(game.sportKey);

/** Every league a scope covers today (a sport expands to its current leagues). */
export const pickemScopeLeagueKeys = (scope: PickEmPrizeScope): string[] => {
  const keys = new Set(scope.leagues);
  for (const slug of scope.sports) for (const league of pickEmSportBySlug(slug)?.leagues ?? []) keys.add(league.sportKey);
  return PRIZE_LEAGUE_ORDER.filter((key) => keys.has(key));
};

/** Do two scopes share a league? Sharing a whole sport counts too (it covers future leagues). */
export const pickemScopesOverlap = (a: PickEmPrizeScope, b: PickEmPrizeScope): boolean => {
  if (a.sports.some((slug) => b.sports.includes(slug))) return true;
  const bKeys = new Set(pickemScopeLeagueKeys(b));
  return pickemScopeLeagueKeys(a).some((key) => bKeys.has(key));
};

/** Does the scope include games with a final score (needed for a tiebreaker)? */
export const pickemScopeHasScoreGames = (scope: PickEmPrizeScope): boolean =>
  scope.sports.some((slug) => pickEmSportBySlug(slug)?.hasScores) ||
  scope.leagues.some((key) => pickEmSportOfLeague(key)?.hasScores);

const listAnd = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** "college football", "EPL and NBA", "soccer, MLB and NHL" — inside a sentence, before "picks". */
export const describePickEmPrizeScope = (scope: PickEmPrizeScope): string =>
  listAnd([
    ...scope.sports.map((slug) => pickEmSportBySlug(slug)?.phrase ?? slug),
    ...scope.leagues.map((key) => pickEmLeagueByKey(key)?.label ?? key),
  ]);

// ── Calendar dates (YYYY-MM-DD, no time zone: they already ARE venue-local dates) ──────────────

export const PICKEM_PRIZE_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type PickEmPrizeWeekday = (typeof PICKEM_PRIZE_WEEKDAYS)[number];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAY_MS = 86_400_000;

const dateUtcMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

export const isPickEmPrizeDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = dateUtcMs(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
};

export const addPickEmPrizeDays = (date: string, days: number): string =>
  new Date(dateUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string): number => Math.round((dateUtcMs(to) - dateUtcMs(from)) / DAY_MS);

export const pickemPrizeWeekdayOf = (date: string): PickEmPrizeWeekday =>
  PICKEM_PRIZE_WEEKDAYS[new Date(dateUtcMs(date)).getUTCDay()];

/** The Monday on or before `date` (prize weeks run Monday to Sunday). */
const mondayOf = (date: string): string => addPickEmPrizeDays(date, -((new Date(dateUtcMs(date)).getUTCDay() + 6) % 7));

/** "Sat, Nov 7". */
export const formatPickEmPrizeDate = (date: string): string => {
  const d = new Date(dateUtcMs(date));
  return `${WEEKDAY_NAMES[d.getUTCDay()].slice(0, 3)}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** "Nov 7". */
const monthDay = (date: string): string => {
  const d = new Date(dateUtcMs(date));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// ── Window ─────────────────────────────────────────────────────────────────────────────────────

/** A window of a known shape with real dates — or null. Says nothing about whether it's sensible. */
export const normalizePickEmPrizeWindow = (value: unknown): PickEmPrizeWindow | null => {
  const record = asRecord(value);
  if (!record) return null;
  switch (record.kind) {
    case "day":
      return isPickEmPrizeDate(record.date) ? { kind: "day", date: record.date } : null;
    case "weekday":
      return (PICKEM_PRIZE_WEEKDAYS as readonly unknown[]).includes(record.weekday)
        ? { kind: "weekday", weekday: record.weekday as PickEmPrizeWeekday }
        : null;
    case "week":
      return { kind: "week" };
    case "range":
      return isPickEmPrizeDate(record.from) && isPickEmPrizeDate(record.to)
        ? { kind: "range", from: record.from, to: record.to }
        : null;
    default:
      return null;
  }
};

/** Why a new prize can't run on this window (judged against the venue's `today`), or null. */
export const validatePickEmPrizeWindow = (window: PickEmPrizeWindow, today: string): string | null => {
  const latestStart = addPickEmPrizeDays(today, PICKEM_PRIZE_MAX_DAYS_AHEAD);
  if (window.kind === "day") {
    if (window.date < today) return PICKEM_PRIZE_WINDOW_PAST_MESSAGE;
    if (window.date > latestStart) return PICKEM_PRIZE_WINDOW_TOO_FAR_MESSAGE;
  }
  if (window.kind === "range") {
    if (window.from < today) return PICKEM_PRIZE_WINDOW_PAST_MESSAGE;
    if (window.to < window.from) return PICKEM_PRIZE_RANGE_ORDER_MESSAGE;
    if (window.from > latestStart) return PICKEM_PRIZE_WINDOW_TOO_FAR_MESSAGE;
    if (daysBetween(window.from, window.to) + 1 > PICKEM_PRIZE_MAX_RANGE_DAYS) return PICKEM_PRIZE_RANGE_LENGTH_MESSAGE;
  }
  return null;
};

/** Is `date` a day the window runs on (ignoring when the prize was created)? */
export const pickemWindowCoversDate = (window: PickEmPrizeWindow, date: string): boolean => {
  if (window.kind === "day") return date === window.date;
  if (window.kind === "weekday") return pickemPrizeWeekdayOf(date) === window.weekday;
  if (window.kind === "week") return true;
  return date >= window.from && date <= window.to;
};

/** The first and last day a window can run, from `from` on (null last day = repeats forever). */
const windowBounds = (window: PickEmPrizeWindow, from: string): { first: string; last: string | null } | null => {
  if (window.kind === "day") return window.date >= from ? { first: window.date, last: window.date } : null;
  if (window.kind === "range") {
    if (window.to < from) return null;
    return { first: window.from > from ? window.from : from, last: window.to };
  }
  return { first: from, last: null };
};

/**
 * Do two windows run on a common day, on or after `from` (the venue's today)? Scans the shared
 * span, at most 7 days of it: past a week every weekly pattern has repeated.
 */
export const pickemWindowsShareADay = (a: PickEmPrizeWindow, b: PickEmPrizeWindow, from: string): boolean => {
  const boundsA = windowBounds(a, from);
  const boundsB = windowBounds(b, from);
  if (!boundsA || !boundsB) return false;
  const first = boundsA.first > boundsB.first ? boundsA.first : boundsB.first;
  const lasts = [boundsA.last, boundsB.last].filter((day): day is string => day !== null);
  const last = lasts.length > 0 ? lasts.reduce((min, day) => (day < min ? day : min)) : null;
  if (last !== null && last < first) return false;
  const span = last === null ? 7 : Math.min(7, daysBetween(first, last) + 1);
  for (let offset = 0; offset < span; offset += 1) {
    const day = addPickEmPrizeDays(first, offset);
    if (pickemWindowCoversDate(a, day) && pickemWindowCoversDate(b, day)) return true;
  }
  return false;
};

/** "on Sat, Nov 7", "each Saturday", "each week (Monday to Sunday)", "from Sun, Nov 1 to Mon, Nov 30". */
export const describePickEmPrizeWindow = (window: PickEmPrizeWindow): string => {
  if (window.kind === "day") return `on ${formatPickEmPrizeDate(window.date)}`;
  if (window.kind === "weekday") return `each ${WEEKDAY_NAMES[PICKEM_PRIZE_WEEKDAYS.indexOf(window.weekday)]}`;
  if (window.kind === "week") return "each week (Monday to Sunday)";
  if (window.from === window.to) return `on ${formatPickEmPrizeDate(window.from)}`;
  return `from ${formatPickEmPrizeDate(window.from)} to ${formatPickEmPrizeDate(window.to)}`;
};

// ── Periods and the cycle key ──────────────────────────────────────────────────────────────────

/** One run of a window: its first and last venue-local day, and the instants that bound it. */
export type PickEmPrizePeriod = {
  startDate: string;
  endDate: string;
  /** Venue-local midnight starting `startDate`. */
  startMs: number;
  /** Venue-local midnight after `endDate` (exclusive). */
  endMsExclusive: number;
};

const localMidnightMs = (date: string, timeZone: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return zonedDateTimeToUtcMs(year, month, day, 0, 0, 0, timeZone);
};

/**
 * The period of `window` that contains the venue-local `date`, or null when the window doesn't run
 * that day. One day for "day" and "weekday", the Monday–Sunday week for "week", the whole range for
 * "range". Shape only: a repeating prize's first period may begin before the prize was created —
 * the award step decides what that means (Phase 4b).
 */
export const pickemPrizePeriodForDate = (
  window: PickEmPrizeWindow,
  date: string,
  timeZone: string,
): PickEmPrizePeriod | null => {
  if (!isPickEmPrizeDate(date) || !pickemWindowCoversDate(window, date)) return null;
  let startDate = date;
  let endDate = date;
  if (window.kind === "week") {
    startDate = mondayOf(date);
    endDate = addPickEmPrizeDays(startDate, 6);
  } else if (window.kind === "range") {
    startDate = window.from;
    endDate = window.to;
  }
  return {
    startDate,
    endDate,
    startMs: localMidnightMs(startDate, timeZone),
    endMsExclusive: localMidnightMs(addPickEmPrizeDays(endDate, 1), timeZone),
  };
};

/** The period containing the instant `at` (read as a venue-local date), or null. */
export const pickemPrizePeriodAt = (window: PickEmPrizeWindow, at: Date, timeZone: string): PickEmPrizePeriod | null =>
  pickemPrizePeriodForDate(window, formatZonedDate(at.getTime(), timeZone), timeZone);

/**
 * THE cycle key of a Pick 'Em Prize: the period's start (venue-local midnight, a whole minute)
 * plus the tier in SECONDS — 0 for "most right" and "target", 1–3 for the tiers of an "X out of N"
 * prize. So:
 *   - each period is its own cycle, and each tier of it its own quota (award_cycle_winner counts
 *     winners per challenge + cycle_start);
 *   - the tier reads back from the key alone (pickemPrizeTierOfCycle) for the coupon's words;
 *   - tier 0 equals computeCycleStart() for the campaign createReward stores.
 * Null for a non-finite start or a tier outside 0–3.
 */
export const pickemPrizeCycleStart = (period: Pick<PickEmPrizePeriod, "startMs">, tier = 0): Date | null => {
  if (!Number.isFinite(period.startMs) || !Number.isInteger(tier) || tier < 0 || tier > PICKEM_PRIZE_MAX_TIERS) return null;
  return new Date(Math.floor(period.startMs / 60_000) * 60_000 + tier * 1000);
};

/** The tier (0–3) a Pick 'Em Prize cycle key stands for, or null when it isn't one. */
export const pickemPrizeTierOfCycle = (cycleStart: string | null | undefined): number | null => {
  const ms = Date.parse(String(cycleStart ?? ""));
  if (!Number.isFinite(ms) || ms <= 0 || ms % 1000 !== 0) return null;
  const second = Math.floor((ms % 60_000) / 1000);
  return second <= PICKEM_PRIZE_MAX_TIERS ? second : null;
};

/** The period start date of a cycle key in the venue's zone ("2026-11-07"), for the coupon's words. */
export const pickemPrizeCycleDate = (cycleStart: string | null | undefined, timeZone: string): string | null => {
  const ms = Date.parse(String(cycleStart ?? ""));
  return Number.isFinite(ms) && ms > 0 ? formatZonedDate(Math.floor(ms / 60_000) * 60_000, timeZone) : null;
};

/**
 * "on Sat, Nov 7", "the week of Nov 9", "from Nov 1 to Nov 30" — the period a coupon was won in,
 * from its window and the period's start date.
 */
export const describePickEmPrizePeriodWon = (window: PickEmPrizeWindow, startDate: string): string => {
  if (window.kind === "week") return `the week of ${monthDay(startDate)}`;
  if (window.kind === "range" && window.from !== window.to) return `from ${monthDay(window.from)} to ${monthDay(window.to)}`;
  return `on ${formatPickEmPrizeDate(startDate)}`;
};

/**
 * The challenge_campaigns calendar createReward stores for a window, so the generic cycle math
 * agrees with the prize's own periods: one day / a range = a one-off from its first to its last day;
 * a weekday = weekly on that day; a week = weekly, Monday first (the weekly anchor is activeDays[0]).
 */
export const pickemPrizeCampaignCalendar = (
  window: PickEmPrizeWindow,
): { recurringType: "none" | "weekly"; activeDays: string[]; startDate?: string; endDate?: string } => {
  if (window.kind === "day") return { recurringType: "none", activeDays: [], startDate: window.date, endDate: window.date };
  if (window.kind === "range") return { recurringType: "none", activeDays: [], startDate: window.from, endDate: window.to };
  if (window.kind === "weekday") return { recurringType: "weekly", activeDays: [window.weekday] };
  return { recurringType: "weekly", activeDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] };
};

// ── How it's won ───────────────────────────────────────────────────────────────────────────────

export type PickEmPrizeWinKind = "most_right" | "target" | "tiers";

/** How a stored Pick 'Em Prize is won: game_winner = most right; tiers present = "X out of N". */
export const pickemPrizeWinKind = (campaign: {
  winCondition: ChallengeWinCondition;
  pickemTiers?: readonly unknown[] | null;
}): PickEmPrizeWinKind =>
  campaign.winCondition === "game_winner" ? "most_right" : (campaign.pickemTiers?.length ?? 0) > 0 ? "tiers" : "target";

/** The partner's numbers, before any prize is attached. */
export type PickEmPrizeTermsInput = {
  winKind: PickEmPrizeWinKind;
  scope: PickEmPrizeScope;
  window: PickEmPrizeWindow;
  minPicks?: number | null;
  /** "Get N right": N. */
  target?: number | null;
  /** "Get N right": prizes per period. */
  quantity?: number | null;
  pickLimit?: number | null;
  tiers?: ReadonlyArray<{ correct: number; quantity: number }> | null;
};

const isWholeIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const isSet = (value: unknown): boolean => value !== null && value !== undefined;

/** Why these terms can't make a prize (judged against the venue's `today`), or null. */
export const validatePickEmPrizeTerms = (input: PickEmPrizeTermsInput, today: string): string | null => {
  const windowError = validatePickEmPrizeWindow(input.window, today);
  if (windowError) return windowError;
  const tiers = input.tiers ?? null;

  if (input.winKind === "most_right") {
    if (isSet(input.target) || isSet(input.pickLimit) || (tiers && tiers.length > 0)) return PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE;
    if (!isWholeIn(input.minPicks, 1, PICKEM_PRIZE_MAX_MIN_PICKS)) return PICKEM_PRIZE_MIN_PICKS_MESSAGE;
    if (!pickemScopeHasScoreGames(input.scope)) return PICKEM_PRIZE_MOST_RIGHT_SCORES_MESSAGE;
    return null;
  }

  if (input.winKind === "target") {
    if (isSet(input.minPicks) || isSet(input.pickLimit) || (tiers && tiers.length > 0)) return PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE;
    if (!isWholeIn(input.target, 1, PICKEM_PRIZE_MAX_TARGET)) return PICKEM_PRIZE_TARGET_MESSAGE;
    if (!isWholeIn(input.quantity, 1, PICKEM_PRIZE_MAX_QUANTITY)) return PICKEM_PRIZE_QUANTITY_MESSAGE;
    return null;
  }

  if (isSet(input.minPicks) || isSet(input.target)) return PICKEM_PRIZE_TERMS_MISMATCH_MESSAGE;
  if (!isWholeIn(input.pickLimit, 1, PICKEM_PRIZE_MAX_PICK_LIMIT)) return PICKEM_PRIZE_PICK_LIMIT_MESSAGE;
  if (!tiers || tiers.length < 1 || tiers.length > PICKEM_PRIZE_MAX_TIERS) return PICKEM_PRIZE_TIER_COUNT_MESSAGE;
  let previous = 0;
  let total = 0;
  for (const tier of tiers) {
    if (!isWholeIn(tier.correct, 1, PICKEM_PRIZE_MAX_PICK_LIMIT)) return PICKEM_PRIZE_TIER_ORDER_MESSAGE;
    if (tier.correct <= previous) return PICKEM_PRIZE_TIER_ORDER_MESSAGE;
    if (tier.correct > input.pickLimit) return pickemPrizeTierAboveLimitMessage(input.pickLimit);
    if (!isWholeIn(tier.quantity, 1, PICKEM_PRIZE_MAX_QUANTITY)) return PICKEM_PRIZE_TIER_QUANTITY_MESSAGE;
    previous = tier.correct;
    total += tier.quantity;
  }
  if (total > PICKEM_PRIZE_MAX_QUANTITY) return PICKEM_PRIZE_TIER_QUANTITY_MESSAGE;
  return null;
};

// ── The overlap rule (D6) ──────────────────────────────────────────────────────────────────────

/** What the overlap rule needs to know about a prize (new or already at the venue). */
export type PickEmPrizeOverlapTerms = {
  scope: PickEmPrizeScope;
  window: PickEmPrizeWindow;
  /** "X out of N": N. Null for every other prize. */
  pickLimit: number | null;
  /** "Most picks right": picks needed to be ranked. Null for every other prize. */
  minPicks: number | null;
};

/** "Your college football prize on Sat, Nov 7" — how a refusal names the prize it clashes with. */
export const describePickEmPrizeForPartner = (terms: Pick<PickEmPrizeOverlapTerms, "scope" | "window">): string =>
  `Your ${describePickEmPrizeScope(terms.scope)} prize ${describePickEmPrizeWindow(terms.window)}`;

/**
 * D6, judged from the venue's `today` on: two "out of N" prizes may not cover the same league on the
 * same day; a "most right" prize may not require more picks than an overlapping limit allows (either
 * one may be the new prize). Prizes without a limit overlap freely. Returns the FIRST clash — the
 * existing prize's id and a refusal that names it — or null.
 */
export const findPickEmPrizeConflict = <T extends PickEmPrizeOverlapTerms & { id: string }>(
  candidate: PickEmPrizeOverlapTerms,
  existing: readonly T[],
  today: string,
): { conflictId: string; message: string } | null => {
  for (const other of existing) {
    if (!pickemScopesOverlap(candidate.scope, other.scope)) continue;
    if (!pickemWindowsShareADay(candidate.window, other.window, today)) continue;
    const name = describePickEmPrizeForPartner(other);
    if (candidate.pickLimit !== null && other.pickLimit !== null) {
      return {
        conflictId: other.id,
        message: `${name} already limits picks for some of these games on the same day. Only one prize with a pick limit can cover a game.`,
      };
    }
    if (candidate.minPicks !== null && other.pickLimit !== null && candidate.minPicks > other.pickLimit) {
      return {
        conflictId: other.id,
        message: `${name} gives players ${other.pickLimit} picks, so this prize can't require ${candidate.minPicks}.`,
      };
    }
    if (candidate.pickLimit !== null && other.minPicks !== null && other.minPicks > candidate.pickLimit) {
      return {
        conflictId: other.id,
        message: `${name} requires ${other.minPicks} picks, so players can't be limited to ${candidate.pickLimit}.`,
      };
    }
  }
  return null;
};

// ── The pick limit's words (D5) ────────────────────────────────────────────────────────────────

/**
 * When a period is, in a player's words: "today", "this week", "on Sat, Nov 7", "from Nov 1 to Nov 30".
 * `period` is the one in question; `today` is the venue's today.
 */
export const describePickEmPrizePeriodPhrase = (
  window: PickEmPrizeWindow,
  period: Pick<PickEmPrizePeriod, "startDate" | "endDate">,
  today: string,
): string => {
  if (window.kind === "week") return "this week";
  if (period.startDate !== period.endDate) return `from ${monthDay(period.startDate)} to ${monthDay(period.endDate)}`;
  return period.startDate === today ? "today" : `on ${formatPickEmPrizeDate(period.startDate)}`;
};

/**
 * "This bar's prize counts your first 20 college football picks today, and you've already used all 20."
 * `period` is the one the refused game falls in; `today` is the venue's today.
 */
export const pickemPickLimitMessage = (params: {
  limit: number;
  scope: PickEmPrizeScope;
  window: PickEmPrizeWindow;
  period: Pick<PickEmPrizePeriod, "startDate" | "endDate">;
  today: string;
}): string => {
  const { limit } = params;
  const when = describePickEmPrizePeriodPhrase(params.window, params.period, params.today);
  return `This bar's prize counts your first ${limit} ${describePickEmPrizeScope(params.scope)} picks ${when}, and you've already used all ${limit}.`;
};

// ── Admin edits (plan Phase 7.6.1, F21) ───────────────────────────────────────────────────────────

export const PICKEM_PRIZE_ADMIN_EDIT_MESSAGE =
  "A Pick 'Em Prize can't be turned back on or have its games, dates or numbers changed. Create a new one.";

// What the admin `challenge-campaigns` PATCH may change on a Pick 'Em Prize: how it looks, where it
// sits in the list, and turning it off. Everything else is part of its terms (the sweep reads
// points_required_to_win as "Get N right"'s N, and skips a prize whose venue_ids isn't exactly one
// venue), and that PATCH skips the save lease and the overlap rule (D6). An allowlist, so a field
// added to the PATCH later is refused until someone decides otherwise.
const PICKEM_PRIZE_ADMIN_PATCH_FIELDS: ReadonlySet<string> = new Set([
  "resource",
  "id",
  "name",
  "imageUrl",
  "imageScale",
  "imageFocusX",
  "imageFocusY",
  "imageFit",
  "displayOrder",
  "isActive",
]);

/**
 * Why the admin `challenge-campaigns` PATCH body must not be applied to a Pick 'Em Prize, or null
 * when it may. `isActive` is allowed only as false (Disable; Enable would skip D6). The route asks
 * this first and reads the row's definition only when the answer is not null, so a rename or a
 * reorder costs no extra read. Bulk Enable sends one PATCH per row, so each row gets the same answer.
 */
export const pickemPrizeAdminPatchRefusal = (body: Readonly<Record<string, unknown>>): string | null => {
  for (const [field, value] of Object.entries(body)) {
    if (value !== undefined && !PICKEM_PRIZE_ADMIN_PATCH_FIELDS.has(field)) return PICKEM_PRIZE_ADMIN_EDIT_MESSAGE;
  }
  if (body.isActive !== undefined && body.isActive !== false) return PICKEM_PRIZE_ADMIN_EDIT_MESSAGE;
  return null;
};
