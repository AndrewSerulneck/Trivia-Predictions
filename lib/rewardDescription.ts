// Client-safe reward description composer (docs/reward-descriptions-plan.md).
//
// Every reward card answers four questions — when, how often, what to do, what
// you win — in sentences composed at READ time from the campaign's structured
// fields, not from the `rules` string frozen at creation. Reading them fresh
// means existing rewards get the new wording with no data migration, a retimed
// schedule never leaves a stale time on a card, and relative words ("this week")
// are computed when the guest looks.
//
// No "server-only" import, no Supabase, no I/O: the server (Phase 2) resolves the
// venue's schedule and the NFL calendar into the fact blocks below, and the
// Create Reward wizard (Phase 3) feeds the same function its in-progress answers,
// so a partner previews exactly what guests will read.
//
// The definition-specific sentences live in the registry
// (RewardDefinition.description, lib/rewardDefinitions.ts) so adding a reward is
// still one registry entry; this module owns only the structural copy around
// them. A campaign with no reward definition (legacy, hand-written by an admin)
// keeps its stored `rules` verbatim.

import type { ChallengeCampaign, ChallengeWinCondition, RewardDescription } from "@/types";
import {
  describeRewardPrizeInSentence,
  getRewardDefinition,
  type RewardDefinition,
  type RewardPrizeSummaryInput,
} from "@/lib/rewardDefinitions";
import {
  normalizeGameWinnerSlots,
  REWARD_WEEKDAY_KEYS,
  REWARD_WEEKDAY_LABEL,
  isRewardWeekday,
  slotKey,
  type RewardGameSlot,
  type RewardWeekday,
} from "@/lib/rewardGameSlots";
import { NFL_REWARD_MIN_PICKERS, normalizeNFLWeekScope } from "@/lib/nflPickEmRewardWeeks";

// ── Types ───────────────────────────────────────────────────────────────────

// The output shape lives in types/index.ts so ChallengeCampaign can carry it.
export type { RewardDescription };

/**
 * One scheduled Live Trivia game, already formatted in the SCHEDULE's timezone.
 * Exactly the fields of RewardGameSlot (lib/rewardGameSlots.ts) the composer
 * reads, so `enumerateGameSlots(toGameScheduleShapes(schedules))` — the server
 * path — and the wizard's `context.gameSlots` both pass straight in.
 */
export type RewardScheduleSlotFact = Pick<
  RewardGameSlot,
  "scheduleId" | "weekday" | "recurring" | "timeLabel" | "dateLabel"
>;

/**
 * The venue's live-or-upcoming games for the reward's game. Pass `null` when the
 * schedule couldn't be read; the composer then never states a time (it says
 * "Check the … schedule for the next game." instead).
 */
export type RewardDescriptionSchedule = {
  slots: readonly RewardScheduleSlotFact[];
};

/** NFL calendar facts, resolved from `nfl_pickem_weeks` by the caller. */
export type RewardDescriptionNFLFacts = {
  /**
   * YYYY-MM-DD the reward's first covered NFL week begins, present ONLY while it
   * is still in the future — exactly nflRewardUpcomingStartDate's value
   * (lib/nflPickEmRewardWeeks.ts), which the server and the wizard preview share.
   */
  upcomingStartDate?: string | null;
  /** YYYY-MM-DD `week_end_date` of the scope season's last week. Drives the off-season line. */
  seasonEndDate?: string | null;
};

/**
 * The campaign fields the composer reads (a ChallengeCampaign spreads straight
 * in) plus the pre-resolved facts. Everything optional is optional so the wizard
 * can describe a reward that doesn't exist yet.
 */
export type RewardDescriptionInput = Pick<
  ChallengeCampaign,
  "rules" | "recurringType" | "activeDays" | "winnerQuota" | "pointsRequiredToWin"
> &
  Partial<
    Pick<
      ChallengeCampaign,
      "rewardDefinitionId" | "gameWinnerSlots" | "nflWeekScope" | "quotaRemaining" | "isActive" | "endDate"
    >
  > &
  RewardPrizeSummaryInput & {
    winCondition?: ChallengeWinCondition | null;
    /** The venue's IANA timezone — formats instants (next cycle start). Schedule times arrive pre-formatted. */
    timezone?: string | null;
    /** Live-Trivia-calendar rewards. Omitted/null = schedule unknown. */
    schedule?: RewardDescriptionSchedule | null;
    /** NFL-calendar rewards. */
    nfl?: RewardDescriptionNFLFacts | null;
    /**
     * ISO instant the next cycle starts. Read only when this cycle's quota is
     * filled (`quotaRemaining === 0`) on a recurring reward.
     */
    nextCycleStart?: string | null;
  };

/** What the prize-wallet coupon needs to say what a guest won a reward FOR. */
export type RewardWinFacts = {
  /** The redemption's `cycle_start` (for a Live Trivia game winner, the game's start instant). */
  cycleStart: string | null;
  /**
   * IANA timezone for turning `cycleStart` into a local date: the game's own
   * schedule zone for a Live Trivia game win, else the venue's. Missing →
   * America/New_York (the venue default), never UTC.
   */
  timezone?: string | null;
  /** The NFL week the win belongs to, resolved by the caller from `nfl_pickem_weeks`. */
  nflWeekNumber?: number | null;
};

/** lib/timezone.ts getVenueTimezone's default — the zone a date falls back to, so never UTC. */
const DEFAULT_VENUE_TIMEZONE = "America/New_York";

/**
 * May a coupon still describe its win from the reward's CURRENT terms?
 *
 * `termsUpdatedAt` is `challenge_campaigns.terms_updated_at`, stamped by a
 * trigger only when a column the "You won …" sentence reads changes
 * (supabase/migrations/20261004170244_challenge_campaigns_terms_updated_at.sql).
 * `wonAt` is the coupon's award time (`challenge_campaign_redemptions.created_at`).
 *
 * No stamp → never edited since the column existed → true (earlier edits are
 * unknowable; that is today's behaviour). A stamp we can't compare against the
 * win → false, so the coupon says "Won from: {name}" rather than risk describing
 * terms the guest never played under.
 */
export function rewardTermsUnchangedSinceWin(
  termsUpdatedAt: string | null | undefined,
  wonAt: string | null | undefined,
): boolean {
  if (!termsUpdatedAt) return true;
  const editedMs = Date.parse(termsUpdatedAt);
  const wonMs = Date.parse(String(wonAt ?? ""));
  if (!Number.isFinite(editedMs) || !Number.isFinite(wonMs)) return false;
  return editedMs <= wonMs;
}

// ── Shared copy ─────────────────────────────────────────────────────────────

/** The NFL calendar is published in US Eastern time (lib/rewards.ts NFL_SEASON_TIMEZONE). */
const NFL_TIMEZONE = "America/New_York";

const checkScheduleLine = (gameName: string): string => `Check the ${gameName} schedule for the next game.`;

const PERIOD_WORD: Record<"daily" | "weekly" | "monthly" | "yearly", { thisPeriod: string; eachPeriod: string }> = {
  daily: { thisPeriod: "today", eachPeriod: "each day" },
  weekly: { thisPeriod: "this week", eachPeriod: "each week" },
  monthly: { thisPeriod: "this month", eachPeriod: "each month" },
  yearly: { thisPeriod: "this year", eachPeriod: "each year" },
};

// ── Small helpers ───────────────────────────────────────────────────────────

/** Substitute `{key}` placeholders. Unknown keys are left untouched (and caught by the tests). */
const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));

/** "A", "A and B", "A, B and C". */
const listAnd = (items: readonly string[]): string =>
  items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** "A", "A or B", "A, B or C". */
const listOr = (items: readonly string[]): string =>
  items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

const formatCount = (value: number): string =>
  Math.max(1, Math.round(Number(value) || 1)).toLocaleString("en-US");

const weekdayIndex = (weekday: string): number =>
  REWARD_WEEKDAY_KEYS.indexOf(String(weekday).trim().toLowerCase() as RewardWeekday);

/** Week order (Sunday first), stable within a day so a 6 PM game stays ahead of a 9 PM one. */
const sortByWeekday = <T extends { weekday: string }>(slots: readonly T[]): T[] =>
  slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => weekdayIndex(a.slot.weekday) - weekdayIndex(b.slot.weekday) || a.index - b.index)
    .map(({ slot }) => slot);

/** Minutes past midnight from a "8:00 PM" label, or null when it doesn't parse. */
const minutesFromTimeLabel = (label: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(label.trim());
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "P" ? 12 : 0);
  return hour * 60 + Number(match[2]);
};

/** "Tue, Oct 7" for an instant, in `timezone` (falling back to the runtime zone on a bad zone). */
const formatInstantDate = (iso: string | null | undefined, timezone: string | null | undefined): string | null => {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return null;
  const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone || "UTC" }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat("en-US", options).format(new Date(ms));
  }
};

/** Local calendar parts of an instant in `timezone`. */
const zonedParts = (
  iso: string | null | undefined,
  timezone: string | null | undefined,
): { year: number; month: number; day: number } | null => {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return null;
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric" };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone || "UTC" }).formatToParts(new Date(ms));
  } catch {
    parts = new Intl.DateTimeFormat("en-US", options).formatToParts(new Date(ms));
  }
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) ? { year, month, day } : null;
};

/** "Fri, Sep 4" for a YYYY-MM-DD calendar date — no timezone shift, it already IS a local date. */
const formatCalendarDate = (date: string | null | undefined): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "").trim());
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
};

const calendarDateKey = (now: Date, timezone: string): string | null => {
  const parts = zonedParts(now.toISOString(), timezone);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

const isRecurringCadence = (
  recurringType: string,
): recurringType is "daily" | "weekly" | "monthly" | "yearly" =>
  recurringType === "daily" || recurringType === "weekly" || recurringType === "monthly" || recurringType === "yearly";

/** "The first player to hit 500 each week wins." / "The first 3 players … win." */
const firstPlayersLine = (quota: number, goal: string, tail: string): string => {
  const count = Math.max(1, Math.round(Number(quota) || 1));
  const subject = count === 1 ? "The first player" : `The first ${count} players`;
  const verb = count === 1 ? "wins" : "win";
  return `${subject} ${goal}${tail ? ` ${tail}` : ""} ${verb}.`;
};

// ── Schedule phrasing ───────────────────────────────────────────────────────

type TimeGroup = { timeLabel: string; weekdays: RewardWeekday[] };

/** Group recurring slots by start time, days in week order: 8 PM → [Tue, Thu]. */
const groupByTime = (slots: readonly RewardScheduleSlotFact[]): TimeGroup[] => {
  const groups: TimeGroup[] = [];
  for (const slot of sortByWeekday(slots)) {
    if (!isRewardWeekday(slot.weekday)) continue;
    const weekday = slot.weekday;
    const timeLabel = slot.timeLabel.trim();
    const group = groups.find((entry) => entry.timeLabel === timeLabel);
    if (!group) groups.push({ timeLabel, weekdays: [weekday] });
    else if (!group.weekdays.includes(weekday)) group.weekdays.push(weekday);
  }
  return groups;
};

const timeSuffix = (timeLabel: string): string => (timeLabel ? ` at ${timeLabel}` : "");

/** "Tuesdays and Thursdays at 8:00 PM and Saturdays at 9:00 PM" / "every day at 8:00 PM". */
const describeRunsOn = (slots: readonly RewardScheduleSlotFact[]): string =>
  listAnd(
    groupByTime(slots).map(({ timeLabel, weekdays }) =>
      weekdays.length === 7
        ? `every day${timeSuffix(timeLabel)}`
        : `${listAnd(weekdays.map((day) => `${REWARD_WEEKDAY_LABEL[day]}s`))}${timeSuffix(timeLabel)}`,
    ),
  );

/** "8:00 PM every Tuesday and Thursday and 9:00 PM every Saturday". */
const describeStartsAt = (slots: readonly RewardScheduleSlotFact[]): string =>
  listAnd(
    groupByTime(slots).map(({ timeLabel, weekdays }) => {
      const days = weekdays.length === 7 ? "day" : listAnd(weekdays.map((day) => REWARD_WEEKDAY_LABEL[day]));
      return `${timeLabel ? `${timeLabel} ` : ""}every ${days}`;
    }),
  );

/**
 * "Tuesday night" / "Tuesday and Thursday nights" / "any night". "night" is
 * dropped only when a game is KNOWN to start before 4 PM; an unknown time keeps
 * the approved wording.
 */
const describeNights = (weekdays: readonly RewardWeekday[], timeLabels: readonly string[]): string => {
  const daytime = timeLabels.some((label) => {
    const minutes = minutesFromTimeLabel(label);
    return minutes !== null && minutes < 16 * 60;
  });
  if (weekdays.length === 7) return daytime ? "any day" : "any night";
  const days = listAnd(weekdays.map((day) => REWARD_WEEKDAY_LABEL[day]));
  if (daytime) return days;
  return `${days} ${weekdays.length === 1 ? "night" : "nights"}`;
};

// ── Venue-schedule rewards (Live Trivia) ────────────────────────────────────

type ScheduleTemplates = Extract<RewardDefinition["description"], { calendar: "venue_schedule" }>;

const describeScheduleReward = (
  definition: RewardDefinition,
  templates: ScheduleTemplates,
  input: RewardDescriptionInput,
  prize: string,
): RewardDescription => {
  const game = definition.gameName;
  const threshold = formatCount(input.pointsRequiredToWin);
  const quota = Math.max(1, Math.round(Number(input.winnerQuota) || 1));
  const allSlots = input.schedule?.slots ?? null;
  const recurringSlots = allSlots?.filter((slot) => slot.recurring) ?? [];
  const runsLine = recurringSlots.length > 0 ? `${game} runs ${describeRunsOn(recurringSlots)}.` : checkScheduleLine(game);

  if (input.winCondition === "game_winner") {
    const pinned = normalizeGameWinnerSlots(input.gameWinnerSlots ?? null);

    // Legacy "award at every game" (no pinned slots).
    if (pinned === null) {
      const period = isRecurringCadence(input.recurringType) ? PERIOD_WORD[input.recurringType].thisPeriod : "";
      return {
        summary: fill(templates.gameWinnerAnyGame, { prize, period }).replace(/\s{2,}/g, " "),
        when: runsLine,
        fineprint: "One winner per game.",
        isCustom: false,
      };
    }

    // Resolve every pinned game against the venue's real schedule. One missing
    // game (deleted, moved, or the schedule unreadable) and NO time is shown —
    // a stale time is worse than none.
    // A pinned game must also still be the KIND of game the reward was made for: a
    // weekly reward's game that has since become a one-off (same schedule id and
    // weekday, so the key still matches) would otherwise read "8:00 PM every
    // Thursday" for a game that no longer repeats — and the reverse for a one-off
    // reward. The weekday itself is covered by the key: enumerateGameSlots only
    // emits a slot for a weekday the schedule still runs on.
    const wantsRecurring = input.recurringType !== "none";
    const byKey = new Map((allSlots ?? []).map((slot) => [slotKey(slot), slot] as const));
    const matched = sortByWeekday(pinned).map((slot) => {
      const current = byKey.get(slotKey(slot)) ?? null;
      return current && current.recurring === wantsRecurring ? current : null;
    });
    const resolved = matched.every((slot): slot is RewardScheduleSlotFact => slot !== null)
      ? (matched as RewardScheduleSlotFact[])
      : null;

    if (input.recurringType === "none") {
      const only = resolved?.[0] ?? null;
      const date = only?.dateLabel ?? null;
      return {
        summary: date
          ? fill(templates.gameWinnerOneOff, { prize, date })
          : fill(templates.gameWinnerRecurring, {
              prize,
              nights: describeNights([sortByWeekday(pinned)[0].weekday], []),
            }),
        when: only && only.timeLabel ? `It starts at ${only.timeLabel}. One game only.` : checkScheduleLine(game),
        fineprint: "One winner.",
        isCustom: false,
      };
    }

    const weekdays = REWARD_WEEKDAY_KEYS.filter((day) => pinned.some((slot) => slot.weekday === day));
    const summary = fill(templates.gameWinnerRecurring, {
      prize,
      nights: describeNights(weekdays, resolved?.map((slot) => slot.timeLabel) ?? []),
    });
    if (!resolved) {
      return { summary, when: checkScheduleLine(game), fineprint: "One winner per game.", isCustom: false };
    }
    const anyOf =
      resolved.length > 1
        ? ` Win any of these games: ${listOr(
            resolved.map((slot) =>
              [REWARD_WEEKDAY_LABEL[slot.weekday], slot.timeLabel].filter(Boolean).join(" "),
            ),
          )}.`
        : "";
    return {
      summary,
      when: `${game} starts at ${describeStartsAt(resolved)}. Be here and signed in when it starts.`,
      fineprint: `One winner per game.${anyOf}`,
      isCustom: false,
    };
  }

  // ── Points target ──
  if (isRecurringCadence(input.recurringType)) {
    const words = PERIOD_WORD[input.recurringType];
    const anchor = String(input.activeDays?.[0] ?? "").trim().toLowerCase();
    const reset =
      input.recurringType === "weekly"
        ? isRewardWeekday(anchor)
          ? `every ${REWARD_WEEKDAY_LABEL[anchor]}`
          : null
        : input.recurringType === "daily"
          ? "every day"
          : input.recurringType === "monthly"
            ? "on the 1st of every month"
            : "every January 1";
    return {
      summary: fill(templates.pointsRecurring, { prize, threshold, period: words.thisPeriod }),
      when: reset ? `${runsLine} Your points reset ${reset}.` : runsLine,
      fineprint: firstPlayersLine(quota, `to hit ${threshold}`, words.eachPeriod),
      isCustom: false,
    };
  }

  // One-time points target. It has no date of its own (createReward writes no
  // startDate), so it names a game only when the venue has exactly one game and
  // that game is a dated one-off — otherwise any date would be a guess.
  const onlyGame = allSlots && allSlots.length === 1 && !allSlots[0].recurring ? allSlots[0] : null;
  if (onlyGame?.dateLabel) {
    return {
      summary: fill(templates.pointsOneOff, { prize, threshold, date: onlyGame.dateLabel }),
      when: onlyGame.timeLabel ? `It starts at ${onlyGame.timeLabel}.` : checkScheduleLine(game),
      fineprint: firstPlayersLine(quota, `to hit ${threshold}`, ""),
      isCustom: false,
    };
  }
  return {
    summary: fill(templates.pointsUndated, { prize, threshold }),
    when: runsLine,
    fineprint: firstPlayersLine(quota, `to hit ${threshold}`, ""),
    isCustom: false,
  };
};

// ── NFL-season rewards ──────────────────────────────────────────────────────

type NFLTemplates = Extract<RewardDefinition["description"], { calendar: "nfl_season" }>;

const NFL_MIN_PICKERS_LINE = `At least ${NFL_REWARD_MIN_PICKERS} players need to make picks for a winner to be named.`;

const describeNFLReward = (
  templates: NFLTemplates,
  input: RewardDescriptionInput,
  prize: string,
  now: Date,
): RewardDescription | null => {
  const scope = normalizeNFLWeekScope(input.nflWeekScope ?? null);
  if (!scope) return null;

  const threshold = formatCount(input.pointsRequiredToWin);
  const quota = Math.max(1, Math.round(Number(input.winnerQuota) || 1));
  const mostPicks = input.winCondition === "game_winner";
  const fromWeek = scope.kind === "season" ? String(scope.fromWeek) : "";

  let summary: string;
  let when: string;
  let fineprint: string;
  if (mostPicks && scope.kind === "weekly") {
    summary = fill(templates.mostPicksWeekly, { prize });
    when = "A new contest starts every Thursday of the NFL season. Make your picks before each game kicks off.";
    fineprint = `Ties are broken by this week's tiebreaker question. ${NFL_MIN_PICKERS_LINE}`;
  } else if (mostPicks) {
    summary = fill(templates.mostPicksSeason, { prize, fromWeek });
    when = "One contest, all season long. Make your picks every week before kickoff.";
    fineprint = `Ties are broken by the final week's tiebreaker question. ${NFL_MIN_PICKERS_LINE}`;
  } else if (scope.kind === "weekly") {
    summary = fill(templates.picksTargetWeekly, { prize, threshold });
    when = "Resets every Thursday during the NFL season.";
    fineprint = firstPlayersLine(quota, "to get there", "each week");
  } else {
    summary = fill(templates.picksTargetSeason, { prize, threshold });
    when = `Counts from Week ${fromWeek} on.`;
    fineprint = firstPlayersLine(quota, "to get there", "");
  }

  // State overrides replace the When line only (plan §3), most specific first.
  const today = calendarDateKey(now, NFL_TIMEZONE);
  const seasonEnd = String(input.nfl?.seasonEndDate ?? "").trim();
  const upcoming = formatCalendarDate(input.nfl?.upcomingStartDate);
  if (scope.kind === "weekly" && today && /^\d{4}-\d{2}-\d{2}$/.test(seasonEnd) && today > seasonEnd) {
    when = "Back when the NFL season starts.";
  } else if (upcoming) {
    when = `Starts ${upcoming}. Get your picks in early.`;
  } else {
    when = nextContestLine(input, NFL_TIMEZONE) ?? when;
  }

  return { summary, when, fineprint, isCustom: false };
};

/**
 * "Next contest starts Thu, Oct 9." — only when this cycle's quota is filled on a
 * recurring reward that will actually run again: never for a paused reward
 * (`isActive === false`), and never when the next cycle begins after its
 * `endDate` (a local calendar date, inclusive). `isActive` undefined = unknown =
 * active, so the wizard's not-yet-saved reward is unaffected.
 */
const nextContestLine = (input: RewardDescriptionInput, fallbackZone: string | null): string | null => {
  if (input.quotaRemaining !== 0 || !isRecurringCadence(input.recurringType)) return null;
  if (input.isActive === false) return null;
  const zone = input.timezone || fallbackZone;
  const endDate = String(input.endDate ?? "").trim();
  if (endDate) {
    const nextMs = Date.parse(String(input.nextCycleStart ?? ""));
    const nextDay = Number.isFinite(nextMs) ? calendarDateKey(new Date(nextMs), zone || "UTC") : null;
    if (nextDay && nextDay > endDate) return null;
  }
  const date = formatInstantDate(input.nextCycleStart, zone);
  return date ? `Next contest starts ${date}.` : null;
};

// ── Public API ──────────────────────────────────────────────────────────────

const legacyDescription = (input: RewardDescriptionInput): RewardDescription => ({
  summary: String(input.rules ?? ""),
  when: null,
  fineprint: null,
  isCustom: true,
});

/**
 * The guest-facing description of a reward, per docs/reward-descriptions-plan.md
 * §3. Pure: `now` is the only clock it reads (for the NFL off-season check).
 *
 * A campaign without a known reward definition — or a definition-based one whose
 * structured fields can't be read (a malformed NFL scope) — falls back to its
 * stored `rules`, verbatim, with `isCustom: true`.
 */
export function describeReward(input: RewardDescriptionInput, now: Date): RewardDescription {
  const definition = input.rewardDefinitionId ? getRewardDefinition(input.rewardDefinitionId) : null;
  if (!definition) return legacyDescription(input);

  const prize = describeRewardPrizeInSentence(input);
  const templates = definition.description;

  if (templates.calendar === "nfl_season") {
    return describeNFLReward(templates, input, prize, now) ?? legacyDescription(input);
  }

  const description = describeScheduleReward(definition, templates, input, prize);
  const next = nextContestLine(input, null);
  return next ? { ...description, when: next } : description;
}

/**
 * The past-tense "what you won it for" line on a prize-wallet coupon — "You got
 * the most NFL picks right in Week 5", "You won Live Trivia on Tue, Oct 7". No
 * trailing period (it replaces the "Won from: …" label).
 *
 * Returns null for a campaign with no known reward definition (the coupon keeps
 * "Won from: {name}") or when the win can't be dated where the sentence needs a
 * date.
 */
export function describeRewardWin(input: RewardDescriptionInput, win: RewardWinFacts): string | null {
  const definition = input.rewardDefinitionId ? getRewardDefinition(input.rewardDefinitionId) : null;
  if (!definition) return null;
  const templates = definition.description;
  const threshold = formatCount(input.pointsRequiredToWin);

  // A one-time reward's cycle_start is the epoch sentinel when it has no
  // startDate (computeCycleStart) — that is "no date", not 1 January 1970.
  const cycleMs = Date.parse(String(win.cycleStart ?? ""));
  const cycleStart = Number.isFinite(cycleMs) && cycleMs > 0 ? String(win.cycleStart) : null;

  if (templates.calendar === "nfl_season") {
    const scope = normalizeNFLWeekScope(input.nflWeekScope ?? null);
    if (!scope) return null;
    let when: string | null;
    if (scope.kind === "season") {
      when = `in the ${scope.season} season`;
    } else if (win.nflWeekNumber && Number.isInteger(win.nflWeekNumber) && win.nflWeekNumber > 0) {
      when = `in Week ${win.nflWeekNumber}`;
    } else {
      const date = zonedParts(cycleStart, win.timezone || NFL_TIMEZONE);
      when = date ? `the week of ${monthDay(date)}` : null;
    }
    if (!when) return null;
    const template = input.winCondition === "game_winner" ? templates.wonMostPicks : templates.wonPicksTarget;
    return fill(template, { threshold, when });
  }

  const zone = win.timezone || DEFAULT_VENUE_TIMEZONE;
  if (input.winCondition === "game_winner") {
    const date = formatInstantDate(cycleStart, zone);
    return date ? fill(templates.wonGameWinner, { date }) : null;
  }

  const parts = zonedParts(cycleStart, zone);
  let when = "";
  if (parts) {
    if (input.recurringType === "weekly") when = `the week of ${monthDay(parts)}`;
    else if (input.recurringType === "daily") when = `on ${formatInstantDate(cycleStart, zone)}`;
    else if (input.recurringType === "monthly") when = `in ${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
    else if (input.recurringType === "yearly") when = `in ${parts.year}`;
  }
  return fill(templates.wonPoints, { threshold, when }).trim();
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "Oct 6". */
const monthDay = (parts: { month: number; day: number }): string =>
  `${MONTH_NAMES[parts.month - 1].slice(0, 3)} ${parts.day}`;
