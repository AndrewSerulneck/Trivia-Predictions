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
// There is no third shape. A partner cannot express "Weeks 12–16": an arbitrary
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

export const NFL_REWARD_WEEK_SCOPE_KINDS = ["weekly", "season"] as const;

export type NFLRewardWeekScopeKind = (typeof NFL_REWARD_WEEK_SCOPE_KINDS)[number];

export const isNFLRewardWeekScopeKind = (value: unknown): value is NFLRewardWeekScopeKind =>
  (NFL_REWARD_WEEK_SCOPE_KINDS as readonly string[]).includes(
    String(value ?? "").trim().toLowerCase(),
  );

/**
 * The minimum number of guests with picks at a venue for a week (or season) to
 * produce a winner. Stated to partners on the wizard and to players on the
 * Pick 'Em page; enforced by the resolver.
 */
export const NFL_REWARD_MIN_PICKERS = 3;

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
  /** `week_end_date` of the season's final week (YYYY-MM-DD). */
  seasonEndDate: string;
  /** Weeks from `fromWeek` to the end of the season, inclusive — wizard readback. */
  weeksRemaining: number;
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
  /** `week_start_date` of the scope's `fromWeek`. Season scope only. */
  startDate?: string | null;
  /** `week_end_date` of the season's final week. Season scope only. */
  endDate?: string | null;
};

export type NFLWeekScopeTermsResult =
  | { ok: true; terms: NFLWeekScopeTerms }
  | { ok: false; message: string };

export const NFL_WEEK_SCOPE_INVALID_MESSAGE =
  "Choose whether this reward runs every NFL week or once for the whole season.";
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

  return toCalendarDate(dates.campaignStartDate) ?? seasonFirst;
};

// ── Copy ────────────────────────────────────────────────────────────────────

export type NFLWeekScopeDescription = {
  /** Winners per cycle (points-target rewards only; a week winner is always 1). */
  quantity: number;
  /** Correct picks needed (points-target rewards only). */
  threshold: number;
};

/**
 * Confirm-screen readback. Always states the minimum-participation rule for a
 * winner-takes-it reward, because "no winner this week" is the one outcome a
 * partner is surprised by (docs/nfl-pickem-reward-plan.md, locked decisions).
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
    if (normalized.kind === "weekly") {
      return `Each week, the guest with the most correct NFL picks at your venue wins this reward — 1 winner per week. Ties are broken by the weekly tiebreaker question. A week with fewer than ${NFL_REWARD_MIN_PICKERS} players making picks has no winner.`;
    }
    return `At the end of the season, the guest with the most correct NFL picks at your venue wins this reward — 1 winner for the season. Ties are broken by the final week's tiebreaker question. A season with fewer than ${NFL_REWARD_MIN_PICKERS} players making picks has no winner.`;
  }

  // "the first guest … wins" reads better than "the first 1 guests … win", so a
  // quantity of 1 drops the number and takes the singular verb.
  const guests = quantity === 1 ? "guest" : `${quantity} guests`;
  const verb = quantity === 1 ? "wins" : "win";
  if (normalized.kind === "weekly") {
    return `Each week, the first ${guests} to get ${threshold} NFL picks right ${verb} this reward.`;
  }
  return `The first ${guests} to get ${threshold} NFL picks right this season ${verb} this reward.`;
};
