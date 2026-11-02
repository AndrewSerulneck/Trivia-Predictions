// The Pick 'Em Prize's steps in the Create Prize wizard (docs/pickem-college-football-and-prize-plan.md
// Phase 5): Games → When → How to win. Pure and client-safe. The wizard holds the partner's answers as
// text (a half-typed number isn't lost); this file turns them into the terms createReward validates
// with the SAME rules (validatePickEmPrizeTerms in lib/pickemPrizes.ts), so the wizard can't promise
// anything the server would refuse. The server re-checks everything, including the overlap rule (D6).
//
// Partner-facing words come only from PICKEM_PRIZE_PARTNER_COPY in lib/rewardDefinitions.ts.

import {
  PICKEM_PRIZE_MAX_TIERS,
  PICKEM_PRIZE_SPORTS,
  PICKEM_PRIZE_WINDOW_MESSAGE,
  describePickEmPrizeScope,
  describePickEmPrizeWindow,
  normalizePickEmPrizeScope,
  pickemPrizeCampaignCalendar,
  validatePickEmPrizeTerms,
  validatePickEmPrizeWindow,
  type PickEmPrizeTermsInput,
  type PickEmPrizeWeekday,
  type PickEmPrizeWinKind,
} from "@/lib/pickemPrizes";
import { PICKEM_PRIZE_PARTNER_COPY } from "@/lib/rewardDefinitions";
import type { CampaignRecurringType, ChallengeWinCondition, PickEmPrizeScope, PickEmPrizeSportSlug, PickEmPrizeWindow } from "@/types";

// ── Games ──────────────────────────────────────────────────────────────────────────────────────

/** The Games step's answer: whole sports, plus single leagues of the sports that aren't whole. */
export type PickEmScopeDraft = { sports: PickEmPrizeSportSlug[]; leagues: string[] };

export const EMPTY_PICKEM_SCOPE_DRAFT: PickEmScopeDraft = { sports: [], leagues: [] };

const sportEntry = (slug: PickEmPrizeSportSlug) => PICKEM_PRIZE_SPORTS.find((sport) => sport.slug === slug);

/** Turn a whole sport on (its single leagues are then covered) or off (nothing of it is left). */
export const togglePickEmScopeSport = (draft: PickEmScopeDraft, slug: PickEmPrizeSportSlug): PickEmScopeDraft => {
  const leagueKeys = new Set((sportEntry(slug)?.leagues ?? []).map((league) => league.sportKey));
  const leagues = draft.leagues.filter((key) => !leagueKeys.has(key));
  return draft.sports.includes(slug)
    ? { sports: draft.sports.filter((s) => s !== slug), leagues }
    : { sports: [...draft.sports, slug], leagues };
};

/**
 * Tap one league. While its whole sport is on, the tap takes that league OUT (the rest stay chosen,
 * as single leagues); otherwise it toggles the league. Picking every league of a sport one by one
 * becomes the whole sport, so later leagues are covered too.
 */
export const togglePickEmScopeLeague = (draft: PickEmScopeDraft, sportKey: string): PickEmScopeDraft => {
  const sport = PICKEM_PRIZE_SPORTS.find((entry) => entry.leagues.some((league) => league.sportKey === sportKey));
  if (!sport) return draft;
  const slug = sport.slug as PickEmPrizeSportSlug;
  const allKeys = sport.leagues.map((league) => league.sportKey);
  if (draft.sports.includes(slug)) {
    return {
      sports: draft.sports.filter((s) => s !== slug),
      leagues: [...draft.leagues, ...allKeys.filter((key) => key !== sportKey)],
    };
  }
  const leagues = draft.leagues.includes(sportKey)
    ? draft.leagues.filter((key) => key !== sportKey)
    : [...draft.leagues, sportKey];
  if (allKeys.every((key) => leagues.includes(key))) {
    return { sports: [...draft.sports, slug], leagues: leagues.filter((key) => !allKeys.includes(key)) };
  }
  return { sports: draft.sports, leagues };
};

/** Is this league counted (chosen alone, or through its whole sport)? */
export const isPickEmScopeLeagueOn = (draft: PickEmScopeDraft, sportKey: string): boolean => {
  const sport = PICKEM_PRIZE_SPORTS.find((entry) => entry.leagues.some((league) => league.sportKey === sportKey));
  return draft.leagues.includes(sportKey) || (sport ? draft.sports.includes(sport.slug as PickEmPrizeSportSlug) : false);
};

/** The scope the server will store, or null while nothing is chosen. */
export const pickemScopeFromDraft = (draft: PickEmScopeDraft): PickEmPrizeScope | null => normalizePickEmPrizeScope(draft);

// ── When ───────────────────────────────────────────────────────────────────────────────────────

export type PickEmWindowKind = PickEmPrizeWindow["kind"];

/** The When step's answer. Every field is kept so switching kinds doesn't lose a typed date. */
export type PickEmWindowDraft = {
  kind: PickEmWindowKind | null;
  date: string;
  weekday: PickEmPrizeWeekday;
  from: string;
  to: string;
};

/** Nothing chosen yet; the dates start at the venue's today. */
export const pickemWindowDraftFor = (today: string): PickEmWindowDraft => ({
  kind: null,
  date: today,
  weekday: "sat",
  from: today,
  to: today,
});

export const PICKEM_WINDOW_KINDS: ReadonlyArray<{ kind: PickEmWindowKind; label: string; help: string }> = [
  { kind: "day", label: "One day", help: "One contest on the day you choose." },
  { kind: "weekday", label: "Every week, one day", help: "A new contest every week on that day." },
  { kind: "week", label: "Each week", help: "A new contest every Monday to Sunday." },
  { kind: "range", label: "Date range", help: "One contest across the days you choose." },
];

export const PICKEM_WEEKDAY_CHIPS: ReadonlyArray<{ weekday: PickEmPrizeWeekday; label: string }> = [
  { weekday: "mon", label: "Mon" },
  { weekday: "tue", label: "Tue" },
  { weekday: "wed", label: "Wed" },
  { weekday: "thu", label: "Thu" },
  { weekday: "fri", label: "Fri" },
  { weekday: "sat", label: "Sat" },
  { weekday: "sun", label: "Sun" },
];

/** The window the server will store, or a refusal (judged against the venue's `today`, like the server). */
export const pickemWindowFromDraft = (
  draft: PickEmWindowDraft,
  today: string,
): { ok: true; window: PickEmPrizeWindow } | { ok: false; message: string } => {
  let window: PickEmPrizeWindow | null = null;
  if (draft.kind === "day" && draft.date) window = { kind: "day", date: draft.date };
  else if (draft.kind === "weekday") window = { kind: "weekday", weekday: draft.weekday };
  else if (draft.kind === "week") window = { kind: "week" };
  else if (draft.kind === "range" && draft.from && draft.to) window = { kind: "range", from: draft.from, to: draft.to };
  if (!window) return { ok: false, message: PICKEM_PRIZE_WINDOW_MESSAGE };
  const message = validatePickEmPrizeWindow(window, today);
  return message ? { ok: false, message } : { ok: true, window };
};

// ── How to win ─────────────────────────────────────────────────────────────────────────────────

export type PickEmTierDraft = { correct: string; quantity: string };

/** The How to win step's answer. Numbers stay text until they are read. */
export type PickEmTermsDraft = {
  winKind: PickEmPrizeWinKind | null;
  minPicks: string;
  target: string;
  quantity: string;
  pickLimit: string;
  tiers: PickEmTierDraft[];
};

export const DEFAULT_PICKEM_TERMS_DRAFT: PickEmTermsDraft = {
  winKind: null,
  minPicks: "5",
  target: "10",
  quantity: "1",
  pickLimit: "20",
  tiers: [{ correct: "12", quantity: "1" }],
};

export const PICKEM_WIN_KINDS: ReadonlyArray<{ kind: PickEmPrizeWinKind; label: string; help: string }> = [
  { kind: "most_right", label: "Most picks right", help: "The player with the most picks right wins." },
  { kind: "target", label: "Get N right", help: "Anyone who gets enough picks right wins, until the prizes run out." },
  { kind: "tiers", label: "X out of N", help: "Everyone gets the same number of picks. More right wins a bigger prize." },
];

/** The next tier's suggested number: 3 more than the last, never above the picks each player gets. */
export const nextPickEmTierDraft = (draft: PickEmTermsDraft): PickEmTierDraft | null => {
  if (draft.tiers.length >= PICKEM_PRIZE_MAX_TIERS) return null;
  const last = parseInt(draft.tiers[draft.tiers.length - 1]?.correct ?? "0", 10) || 0;
  const limit = parseInt(draft.pickLimit, 10) || last + 3;
  return { correct: String(Math.min(limit, last + 3)), quantity: "1" };
};

/** "12" → 12; anything that isn't a plain whole number → NaN (validation then refuses it). */
const wholeNumber = (text: string): number => (/^\s*\d+\s*$/.test(text) ? parseInt(text, 10) : Number.NaN);

/** The partner's numbers as the server will read them, or a refusal in the server's own words. */
export const pickemTermsFromDraft = (
  draft: PickEmTermsDraft,
  scope: PickEmPrizeScope,
  window: PickEmPrizeWindow,
  today: string,
): { ok: true; terms: PickEmPrizeTermsInput } | { ok: false; message: string } => {
  if (!draft.winKind) return { ok: false, message: "Choose how this prize is won." };
  const terms: PickEmPrizeTermsInput =
    draft.winKind === "most_right"
      ? { winKind: "most_right", scope, window, minPicks: wholeNumber(draft.minPicks) }
      : draft.winKind === "target"
        ? { winKind: "target", scope, window, target: wholeNumber(draft.target), quantity: wholeNumber(draft.quantity) }
        : {
            winKind: "tiers",
            scope,
            window,
            pickLimit: wholeNumber(draft.pickLimit),
            tiers: draft.tiers.map((tier) => ({ correct: wholeNumber(tier.correct), quantity: wholeNumber(tier.quantity) })),
          };
  const message = validatePickEmPrizeTerms(terms, today);
  return message ? { ok: false, message } : { ok: true, terms };
};

/**
 * What the wizard sends and previews for valid terms — the same mapping createPickEmReward stores
 * (lib/rewards.ts): most right = game_winner, 1 winner; get N right = the target and its quantity;
 * tiers = the lowest tier and every tier's quantity. The calendar comes from the window.
 */
export const pickemEngineTerms = (
  terms: PickEmPrizeTermsInput,
): { winCondition: ChallengeWinCondition; threshold: number; winnerQuota: number; cadence: CampaignRecurringType; activeDays: string[] } => {
  const calendar = pickemPrizeCampaignCalendar(terms.window);
  const tiers = terms.tiers ?? [];
  return {
    winCondition: terms.winKind === "most_right" ? "game_winner" : "points_threshold",
    threshold: terms.winKind === "target" ? Number(terms.target) : terms.winKind === "tiers" ? tiers[0]?.correct ?? 1 : 1,
    winnerQuota:
      terms.winKind === "target"
        ? Number(terms.quantity)
        : terms.winKind === "tiers"
          ? tiers.reduce((sum, tier) => sum + tier.quantity, 0)
          : 1,
    cadence: calendar.recurringType,
    activeDays: calendar.activeDays,
  };
};

// ── The partner's words ────────────────────────────────────────────────────────────────────────

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

/**
 * D5's notice: "Players at your bar will be limited to 20 college football picks on Sat, Nov 7, so
 * everyone plays the same 20." Null when the numbers aren't usable yet.
 */
export const pickemPickLimitNotice = (limit: number, scope: PickEmPrizeScope, window: PickEmPrizeWindow): string | null => {
  if (!Number.isInteger(limit) || limit < 1) return null;
  return fill(PICKEM_PRIZE_PARTNER_COPY.limit, {
    limit: limit.toLocaleString("en-US"),
    scope: describePickEmPrizeScope(scope),
    window: describePickEmPrizeWindow(window),
  });
};

/** The terms restated on Confirm: who wins, when. */
export const describePickEmPrizeTermsForPartner = (terms: PickEmPrizeTermsInput): string => {
  const scope = describePickEmPrizeScope(terms.scope);
  const window = describePickEmPrizeWindow(terms.window);
  if (terms.winKind === "tiers") return pickemPickLimitNotice(Number(terms.pickLimit), terms.scope, terms.window) ?? "";
  if (terms.winKind === "target") {
    return fill(PICKEM_PRIZE_PARTNER_COPY.target, {
      quantity: Number(terms.quantity).toLocaleString("en-US"),
      winners: Number(terms.quantity) === 1 ? "winner" : "winners",
      threshold: Number(terms.target).toLocaleString("en-US"),
      scope,
      window,
    });
  }
  return fill(PICKEM_PRIZE_PARTNER_COPY.mostRight, { scope, window });
};
