// Client-safe week-scope model for the NFL Pick 'Em Challenge reward.
//
// Every other reward gates on a game the VENUE schedules; this one gates on the
// NFL season calendar (`nfl_pickem_weeks`), which no venue controls. So instead
// of the terms sentence's period/quantity pair, a partner picks a scope:
//
//   - weekly — the reward is its own contest EVERY NFL week it is active. One
//     cycle per NFL week, one winner (or N points-target winners) per week.
//   - season — a single cumulative contest over the REMAINDER of the season,
//     starting at the current/next week. One cycle, one winner at the end.
//
//   - single_week — one contest for ONE chosen NFL week (added 2026-10-12,
//     docs/nfl-pickem-single-week-reward-plan.md). Its dates come from that
//     week's `nfl_pickem_weeks` row, read by the server, never the client.
//
// There is no fourth shape. A partner cannot express "Weeks 12–16": an arbitrary
// week list or range is explicitly rejected by docs/nfl-pickem-reward-plan.md,
// and nothing here can produce one.
//
// No "server-only" import and no Supabase dependency: the wizard (which renders
// the picker) and the server (which re-derives cadence/quota/activeDays from the
// scope before touching the engine) run the SAME rules. Mirrors the
// lib/rewardGameSlots.ts / lib/rewardTerms.ts split.

import type { CampaignRecurringType, ChallengeWinCondition, NFLWeekScope } from "@/types";
import { REWARD_MAX_QUANTITY, quantityOutOfRangeMessage } from "@/lib/rewardTerms";

/**
 * The stored shape — exactly what lands in `challenge_campaigns.nfl_week_scope`.
 * Identical to the canonical `NFLWeekScope` in @/types (Phase 0); aliased here so
 * this module reads as the owner of the rules without a second declaration of the
 * shape that could drift from the column's check constraint.
 */
export type NFLRewardWeekScope = NFLWeekScope;

export const NFL_REWARD_WEEK_SCOPE_KINDS = ["weekly", "season", "single_week"] as const;

export type NFLRewardWeekScopeKind = (typeof NFL_REWARD_WEEK_SCOPE_KINDS)[number];

export const isNFLRewardWeekScopeKind = (value: unknown): value is NFLRewardWeekScopeKind =>
  (NFL_REWARD_WEEK_SCOPE_KINDS as readonly string[]).includes(
    String(value ?? "").trim().toLowerCase(),
  );

/** Weeks are 1-based and the NFL has never run past 18 + 4 playoff rounds. */
const MAX_NFL_WEEK = 30;

const toSeason = (value: unknown): number | null => {
  const season = Number(value);
  if (!Number.isInteger(season) || season < 1920 || season > 2200) return null;
  return season;
};

const toWeek = (value: unknown): number | null => {
  const week = Number(value);
  if (!Number.isInteger(week) || week < 1 || week > MAX_NFL_WEEK) return null;
  return week;
};

/**
 * Read `nfl_week_scope` off a row.
 *
 * Unlike normalizeGameWinnerSlots, **null here means "not an NFL reward"** rather
 * than a legacy fallback: this column was born with the feature, so there is no
 * pre-existing row whose null must keep paying out. A malformed value therefore
 * fails CLOSED — reading garbage as "weekly, this season" would invent a contest
 * the partner never agreed to.
 */
export const normalizeNFLWeekScope = (value: unknown): NFLRewardWeekScope | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = String(record.kind ?? "").trim().toLowerCase();
  const season = toSeason(record.season);
  if (season === null) return null;
  if (kind === "weekly") return { kind: "weekly", season };
  if (kind === "season") {
    const fromWeek = toWeek(record.fromWeek ?? record.from_week);
    if (fromWeek === null) return null;
    return { kind: "season", season, fromWeek };
  }
  if (kind === "single_week") {
    const week = toWeek(record.week);
    if (week === null) return null;
    return { kind: "single_week", season, week };
  }
  return null;
};

/** The value to write to the column, or null when the reward isn't NFL-scoped. */
export const serializeNFLWeekScope = (
  scope: unknown,
): NFLRewardWeekScope | null => normalizeNFLWeekScope(scope ?? null);

// ── Engine mapping ──────────────────────────────────────────────────────────

/**
 * All seven weekdays, **Thursday first** — for BOTH scope kinds. Two independent
 * reasons, both verified in lib/challengeCampaigns.ts:
 *
 *  1. computeCycleStart anchors a weekly cycle on `activeDays[0]`. An NFL week
 *     runs Thursday→Wednesday, so "thu" must lead; anchoring on Sunday would
 *     split every NFL week across two reward cycles.
 *  2. isCampaignEligibleAtTime blocks point accrual entirely on any weekday
 *     absent from activeDays. NFL games settle Thursday, Sunday and Monday (plus
 *     the occasional Friday/Saturday late in the season), so all seven must be
 *     present or accrual silently drops picks.
 *
 * Written as a literal on purpose: weekdaysForSlots / REWARD_WEEKDAY_KEYS
 * (lib/rewardGameSlots.ts) both emit Sunday-first order, which breaks reason 1.
 */
export const NFL_REWARD_ACTIVE_DAYS: readonly string[] = [
  "thu",
  "fri",
  "sat",
  "sun",
  "mon",
  "tue",
  "wed",
];

/**
 * What the server knows about the season a reward would run in — the NFL
 * equivalent of the venue-schedule facts every other reward's context carries.
 *
 * Declared in this client-safe module (not in lib/rewards.ts, which is
 * "server-only") so the wizard's context DTO and the creation path share one
 * shape. Every field is derived from `nfl_pickem_weeks` by the server; the client
 * renders them and never sends them back — createReward re-derives its own copy,
 * because a client-supplied `fromWeek` in the past would backdate a reward over
 * weeks that have already been played.
 */
export type NFLRewardSeasonContext = {
  season: number;
  /** The week a season-long reward starts from: the current week, else the next. */
  fromWeek: number;
  /** `week_start_date` of `fromWeek` (YYYY-MM-DD). */
  fromWeekStartDate: string;
  /**
   * The season's earliest `week_start_date` (YYYY-MM-DD) — where a WEEKLY reward's
   * first covered week begins (resolveNFLRewardStartDate), so the wizard's guest
   * preview can say "Starts …" on exactly the days the venue page will. null when
   * no week is synced; an older server's response simply lacks it, which reads
   * the same (no "Starts" line).
   */
  seasonFirstWeekStartDate: string | null;
  /** `week_end_date` of the season's final week (YYYY-MM-DD). */
  seasonEndDate: string;
  /** Weeks from `fromWeek` to the end of the season, inclusive — wizard readback. */
  weeksRemaining: number;
  /**
   * Weeks a partner may pick for a "Single week" reward, built by
   * buildNFLSelectableWeeks. Empty = the Single-week card is hidden; absent = an
   * older server's response, read the same. Only weeks whose first game has not
   * kicked off, regular season and postseason, with games synced.
   */
  selectableWeeks?: NFLRewardSelectableWeek[];
};

export type NFLRewardSelectableWeek = {
  weekNumber: number;
  /** YYYY-MM-DD */
  weekStartDate: string;
  /** YYYY-MM-DD */
  weekEndDate: string;
  /** e.g. "Week 9 · Oct 29 – Nov 2" */
  label: string;
  gamesCount: number;
};

/** The `nfl_pickem_weeks` facts buildNFLSelectableWeeks reads (a subset of NFLWeek). */
export type NFLSelectableWeekSource = {
  weekNumber: number;
  weekType: string;
  displayLabel?: string | null;
  weekStartDate: string;
  weekEndDate: string;
  /**
   * `nfl_pickem_weeks.thursday_kickoff` (ISO). NOT always the week's first
   * kickoff: the sync stores the earliest game on a UTC THURSDAY when there is
   * one, else the earliest game. See selectableUntilMs.
   */
  thursdayKickoff: string | null;
  gamesCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The instant a week stops being selectable, from its stored `thursday_kickoff`.
 *
 * syncNFLWeeks (and scripts/resync-nfl-weeks.cjs) store the earliest game on a
 * UTC Thursday when the week has one, and the earliest game overall only when it
 * doesn't. So a kickoff on any other UTC day IS the week's first game, but a UTC
 * Thursday kickoff may have an earlier game before it (a Tuesday/Wednesday UTC
 * game, e.g. a Wednesday-afternoon holiday game ahead of a Wednesday-night ET
 * one) that this row can't see. The resolver measures from the true first game,
 * so for those weeks we close at the start of the week's own Tue 05:00 UTC span
 * (nflWeekSpanMs) instead — no game of this week can precede it. Costs a couple
 * of days of selection on Week 1 / Thanksgiving-style weeks; never offers a week
 * whose "most picks" prize could silently never pay.
 */
const selectableUntilMs = (kickoffMs: number): number => {
  const kickoff = new Date(kickoffMs);
  if (kickoff.getUTCDay() !== 4) return kickoffMs;
  const thursdayMidnightMs = Date.UTC(kickoff.getUTCFullYear(), kickoff.getUTCMonth(), kickoff.getUTCDate());
  return thursdayMidnightMs - 2 * DAY_MS + 5 * HOUR_MS;
};

/** Week types a Single-week reward may run in (D2: no preseason). */
const SELECTABLE_WEEK_TYPES: readonly string[] = ["regular", "postseason"];

const WEEK_LABEL_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 29" for a YYYY-MM-DD calendar date (read in UTC so the day never shifts). */
const formatWeekLabelDate = (date: string): string => WEEK_LABEL_DATE.format(new Date(`${date}T00:00:00.000Z`));

/** "Week 9 · Oct 29 – Nov 2" (a postseason week keeps its stored display label). */
export const formatNFLSelectableWeekLabel = (
  week: Pick<NFLSelectableWeekSource, "weekNumber" | "displayLabel" | "weekStartDate" | "weekEndDate">,
): string => {
  const name = String(week.displayLabel ?? "").trim() || `Week ${week.weekNumber}`;
  return `${name} · ${formatWeekLabelDate(week.weekStartDate)} – ${formatWeekLabelDate(week.weekEndDate)}`;
};

/**
 * The weeks a partner may pick for a "Single week" reward (decisions D1/D2),
 * ordered by week number. A week qualifies only when:
 *
 *  - it is a regular-season or postseason week (never preseason, and an unknown
 *    type fails closed);
 *  - it has games synced (`gamesCount > 0`) and real calendar dates;
 *  - its FIRST GAME HAS NOT KICKED OFF. This is load-bearing, not cosmetic: the
 *    winner resolver refuses to award a contest that started before the reward
 *    existed (campaignWasLiveForContest), so offering a started week would sell
 *    a "most picks" prize that silently never pays. Measured from the stored
 *    `thursdayKickoff` (see selectableUntilMs for why a UTC-Thursday value
 *    closes earlier); when it is unknown, the week must not have begun on the
 *    NFL (Eastern) calendar.
 *
 * Deliberately NOT `status`: update_nfl_week_status leaves every week whose
 * kickoff has passed at "locked" forever (its CASE tests "locked" before
 * "complete"), so the column can't tell a finished week from a running one.
 *
 * Pure, so the server (resolveNFLSeasonContext, then createReward's re-check)
 * and the tests run the same rule; the wizard only renders the result.
 */
export const buildNFLSelectableWeeks = (
  weeks: readonly NFLSelectableWeekSource[],
  now: Date,
): NFLRewardSelectableWeek[] => {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return [];
  const today = nflCalendarToday(now);

  return weeks
    .filter((week) => {
      if (!SELECTABLE_WEEK_TYPES.includes(String(week.weekType ?? "").trim().toLowerCase())) return false;
      if (toWeek(week.weekNumber) === null) return false;
      const gamesCount = Number(week.gamesCount);
      if (!Number.isInteger(gamesCount) || gamesCount <= 0) return false;
      const start = toCalendarDate(week.weekStartDate);
      const end = toCalendarDate(week.weekEndDate);
      if (!start || !end || end < start) return false;

      const kickoffMs = week.thursdayKickoff ? Date.parse(week.thursdayKickoff) : Number.NaN;
      if (Number.isFinite(kickoffMs)) return nowMs < selectableUntilMs(kickoffMs);
      return Boolean(today) && start > (today as string);
    })
    .map((week) => ({
      weekNumber: week.weekNumber,
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      label: formatNFLSelectableWeekLabel(week),
      gamesCount: week.gamesCount,
    }))
    .sort((a, b) => a.weekNumber - b.weekNumber);
};

export type NFLWeekScopeTerms = {
  /** Weekly = one cycle per NFL week; season = a single "none" cycle. */
  cadence: CampaignRecurringType;
  /** Always NFL_REWARD_ACTIVE_DAYS — the cycle anchor and the accrual gate. */
  activeDays: string[];
  /** Winners per cycle. */
  quota: number;
  /** YYYY-MM-DD, season scope only. */
  startDate: string | null;
  /** YYYY-MM-DD, season scope only. */
  endDate: string | null;
};

export type NFLWeekScopeTermsOptions = {
  winCondition: ChallengeWinCondition;
  /** The partner's chosen quantity. Ignored (must be 1) for a week winner. */
  quantity: number;
  /** `week_start_date` of the scope's `fromWeek` (season) or `week` (single_week). */
  startDate?: string | null;
  /** `week_end_date` of the season's final week (season) or of `week` (single_week). */
  endDate?: string | null;
  /** The chosen week's game count. Single-week picks-target only: caps the threshold. */
  gamesCount?: number | null;
  /** The partner's picks-target threshold. Checked against `gamesCount` (D3). */
  threshold?: number | null;
};

export type NFLWeekScopeTermsResult =
  | { ok: true; terms: NFLWeekScopeTerms }
  | { ok: false; message: string };

export const NFL_WEEK_SCOPE_INVALID_MESSAGE =
  "Choose whether this reward runs every NFL week, once for the whole season, or for a single week.";
export const NFL_SINGLE_WEEK_INVALID_MESSAGE =
  "That NFL week isn't available any more. Pick a week that hasn't started yet.";
export const nflSingleWeekThresholdTooHighMessage = (week: number, gamesCount: number): string =>
  `Week ${week} has ${gamesCount} ${gamesCount === 1 ? "game" : "games"}, so pick a target of ${gamesCount} or fewer.`;
export const NFL_WEEK_WINNER_QUANTITY_MESSAGE =
  'Only one guest can have the most correct picks, so a "most correct picks" reward is worth exactly 1 prize. Use a picks target to hand out more.';
export const NFL_SEASON_DATES_REQUIRED_MESSAGE =
  "The NFL season's dates couldn't be read. Refresh and try again.";
// The NFL equivalent of REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE (lib/rewards.ts).
// Deliberately NOT that string: a partner can't fix this by scheduling anything,
// so telling them to "Schedule Live Trivia" would send them somewhere that can't
// help. Declared here (not in lib/rewards.ts, which is "server-only") so the
// wizard's "not available" block and the server's 409 mapping read the same
// copy — lib/rewards.ts re-exports it rather than declaring its own.
export const REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE =
  "The NFL season isn't set up yet, so there are no weeks left to run this reward.";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real YYYY-MM-DD (2026-02-31 rolls forward into March, so reject it). */
const toCalendarDate = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  const match = CALENDAR_DATE.exec(text);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
};

/**
 * Derive the campaign's cadence, quota, activeDays and date bounds from the
 * scope. The partner never picks any of these directly — the scope is the terms,
 * exactly as a slot selection is for a Live Trivia game-winner reward
 * (deriveGameWinnerTerms).
 *
 * Season scope REQUIRES both dates. With recurringType "none" and no startDate,
 * computeCycleStart returns the epoch sentinel and getCampaignCloseTimestampMs
 * returns null — the reward would never close and never award. Refusing is the
 * only safe answer; the caller (lib/rewards.ts) reads the real dates out of
 * nfl_pickem_weeks, which is why this module stays I/O-free.
 */
export const deriveNFLWeekScopeTerms = (
  scope: unknown,
  opts: NFLWeekScopeTermsOptions,
): NFLWeekScopeTermsResult => {
  const normalized = normalizeNFLWeekScope(scope);
  if (!normalized) return { ok: false, message: NFL_WEEK_SCOPE_INVALID_MESSAGE };

  const quantity = Math.round(Number(opts.quantity));
  let quota: number;
  if (opts.winCondition === "game_winner") {
    // One venue, one week (or one season), one guest with the most correct
    // picks. A larger number is REFUSED rather than clamped: silently storing 1
    // when the partner advertised 3 prizes is the failure this rule exists to
    // prevent.
    if (Number.isFinite(quantity) && quantity !== 1) {
      return { ok: false, message: NFL_WEEK_WINNER_QUANTITY_MESSAGE };
    }
    quota = 1;
  } else {
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > REWARD_MAX_QUANTITY) {
      return { ok: false, message: quantityOutOfRangeMessage() };
    }
    quota = quantity;
  }

  const activeDays = [...NFL_REWARD_ACTIVE_DAYS];

  if (normalized.kind === "weekly") {
    // The weekly cycle math owns the boundaries; dates supplied by the caller are
    // deliberately dropped so a stale one can't pin a recurring reward open.
    return { ok: true, terms: { cadence: "weekly", activeDays, quota, startDate: null, endDate: null } };
  }

  const startDate = toCalendarDate(opts.startDate);
  const endDate = toCalendarDate(opts.endDate);
  if (!startDate || !endDate || endDate < startDate) {
    return { ok: false, message: NFL_SEASON_DATES_REQUIRED_MESSAGE };
  }

  if (normalized.kind === "single_week" && opts.winCondition !== "game_winner") {
    // A target above the week's game count can never be reached (D3): refuse it.
    // Unknown game count -> no cap here; the server always supplies one.
    const gamesCount = Number(opts.gamesCount);
    if (Number.isFinite(gamesCount) && gamesCount > 0 && Number(opts.threshold) > gamesCount) {
      return { ok: false, message: nflSingleWeekThresholdTooHighMessage(normalized.week, gamesCount) };
    }
  }
  return { ok: true, terms: { cadence: "none", activeDays, quota, startDate, endDate } };
};

// ── Upcoming state ──────────────────────────────────────────────────────────

/**
 * The calendar date (YYYY-MM-DD) on which this reward's FIRST covered NFL week
 * begins, or null when it can't be determined.
 *
 * Used to tell guests "starts Sept 10" instead of showing a live-looking
 * progress bar on a reward that cannot be won for weeks. A weekly reward
 * created before the season has real cycles running immediately (cadence
 * "weekly", startDate null — see deriveNFLWeekScopeTerms), so without this the
 * venue Rewards panel would render it as "In Progress · 0 / N pts" all through
 * the preseason.
 *
 * Both scopes collapse to the same question — "has the first week I cover
 * started?" — which is why this returns a date rather than a boolean:
 *
 *   - weekly: the season's first week. If the reward was created mid-season
 *     that date is already past, so the caller's `> today` test correctly
 *     reports "not upcoming" without needing to know the creation date.
 *   - single_week: the campaign's own startDate (that week's first day), no fallback.
 *   - season: the campaign's own startDate (the scope's `fromWeek` start,
 *     written at creation), falling back to the season's first week.
 */
export const resolveNFLRewardStartDate = (
  scope: unknown,
  dates: { campaignStartDate?: string | null; seasonFirstWeekStartDate?: string | null },
): string | null => {
  const normalized = normalizeNFLWeekScope(scope);
  if (!normalized) return null;

  const seasonFirst = toCalendarDate(dates.seasonFirstWeekStartDate);
  if (normalized.kind === "weekly") return seasonFirst;
  // A single week has no season-first fallback: starting "Sept 10" for a Week 9
  // reward would be a lie. No stored date -> null (no "Starts" line).
  if (normalized.kind === "single_week") return toCalendarDate(dates.campaignStartDate);

  return toCalendarDate(dates.campaignStartDate) ?? seasonFirst;
};

/** The NFL calendar is published in US Eastern time; "today" is asked in that zone. */
const NFL_CALENDAR_TIMEZONE = "America/New_York";

/** YYYY-MM-DD for `now` on the NFL calendar's clock, or null for an invalid Date. */
const nflCalendarToday = (now: Date): string | null => {
  if (!Number.isFinite(now.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NFL_CALENDAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return toCalendarDate(`${part("year")}-${part("month")}-${part("day")}`);
};

/**
 * The date guests are told an NFL reward "Starts …", or null when its first
 * covered week has already begun (or can't be determined). The ONE rule both the
 * venue page (applyNFLRewardUpcomingState, lib/rewards.ts) and the Create Reward
 * wizard's guest preview use, so the two never disagree — e.g. a weekly reward
 * created on a Tuesday mid-season is already running (its first covered week is
 * the season's first), even though the next NFL week starts Thursday.
 *
 * Compared as Eastern calendar days: a reward starting today is live, not upcoming.
 */
export const nflRewardUpcomingStartDate = (
  scope: unknown,
  dates: { campaignStartDate?: string | null; seasonFirstWeekStartDate?: string | null },
  now: Date,
): string | null => {
  const startDate = resolveNFLRewardStartDate(scope, dates);
  const today = nflCalendarToday(now);
  // Calendar-date strings compare correctly lexicographically in YYYY-MM-DD.
  return startDate && today && startDate > today ? startDate : null;
};

// ── Copy ────────────────────────────────────────────────────────────────────

export type NFLWeekScopeDescription = {
  /** Winners per cycle (points-target rewards only; a week winner is always 1). */
  quantity: number;
  /** Correct picks needed (points-target rewards only). */
  threshold: number;
  /**
   * The partner's minimum players (most-picks rewards only). Null or absent = no
   * minimum, so no sentence (docs/reward-minimum-players-plan.md A2).
   */
  minPlayers?: number | null;
};

/**
 * Confirm-screen readback. States the reward's own minimum-participation rule for a
 * winner-takes-it reward whenever it has one, because "no winner this week" is the
 * one outcome a partner is surprised by.
 */
export const describeNFLWeekScope = (
  scope: unknown,
  winCondition: ChallengeWinCondition,
  terms: NFLWeekScopeDescription,
): string => {
  const normalized = normalizeNFLWeekScope(scope);
  if (!normalized) return "";

  const quantity = Math.max(1, Math.round(Number(terms.quantity) || 1));
  const threshold = Math.max(1, Math.round(Number(terms.threshold) || 1));

  if (winCondition === "game_winner") {
    const minimum = Number(terms.minPlayers);
    const hasMinimum = Number.isInteger(minimum) && minimum >= 2;
    if (normalized.kind === "weekly") {
      const rule = hasMinimum ? ` A week with fewer than ${minimum} players making picks has no winner.` : "";
      return `Each week, the guest with the most correct NFL picks at your venue wins this reward — 1 winner per week. Ties are broken by the weekly tiebreaker question.${rule}`;
    }
    if (normalized.kind === "single_week") {
      const rule = hasMinimum ? ` If fewer than ${minimum} players make picks that week, there is no winner.` : "";
      return `After Week ${normalized.week}, the guest with the most correct NFL picks that week at your venue wins this reward — 1 winner. Ties are broken by Week ${normalized.week}'s tiebreaker question.${rule}`;
    }
    const rule = hasMinimum ? ` A season with fewer than ${minimum} players making picks has no winner.` : "";
    return `At the end of the season, the guest with the most correct NFL picks at your venue wins this reward — 1 winner for the season. Ties are broken by the final week's tiebreaker question.${rule}`;
  }

  // "the first guest … wins" reads better than "the first 1 guests … win", so a
  // quantity of 1 drops the number and takes the singular verb.
  const guests = quantity === 1 ? "guest" : `${quantity} guests`;
  const verb = quantity === 1 ? "wins" : "win";
  if (normalized.kind === "weekly") {
    return `Each week, the first ${guests} to get ${threshold} NFL picks right ${verb} this reward.`;
  }
  if (normalized.kind === "single_week") {
    return `In Week ${normalized.week}, the first ${guests} to get ${threshold} NFL picks right ${verb} this reward.`;
  }
  return `The first ${guests} to get ${threshold} NFL picks right this season ${verb} this reward.`;
};
