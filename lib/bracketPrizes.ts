// March Madness bracket Prizes (docs/squares-and-brackets-plan.md, Phase 9a). Pure and client-safe:
// shared by the reward registry, the description composer, the Create Prize wizard, the award step
// (lib/bracketPrizeAwards.ts) and the Results page.
//
// A bracket prize pays 1st / 2nd / 3rd place (the partner's ladder) at its venue for each bracket the
// partner chose: the men's or women's main bracket, or either second chance. It rides on the ordinary
// weekly-places engine: each chosen bracket of each tournament is ONE cycle, settled once through
// award_ranked_cycle_places after that tournament's championship is graded. The cycle key is
// bracketPrizeCycleStart() below — the one place that decides it.
//
// A LEAF MODULE: lib/rewardDefinitions.ts imports it, so it must not import anything that imports the
// registry back (lib/rankedPlaceRewards.ts does) — the partner's terms sentence lives in
// lib/bracketPrizeTerms.ts for that reason.

import { bracketOptionLabel } from "@/lib/bracketsView";
import { BRACKET_GENDERS, BRACKET_KINDS, type BracketGender, type BracketKind } from "@/lib/brackets/tree";
import { SEASONAL_GAME_WINDOWS, isBracketsEnabled, seasonalCalendarDate } from "@/lib/seasonalGames";
import { BRACKET_GAME_NAME } from "@/lib/venueGameCards";

export const BRACKET_PRIZE_DEFINITION_ID = "bracket_challenge";

/** Which brackets a prize can pay. Order = the order they're shown and described in. */
export const BRACKET_PRIZE_KEYS = ["men_main", "women_main", "men_second", "women_second"] as const;
export type BracketPrizeKey = (typeof BRACKET_PRIZE_KEYS)[number];

/** Refusal when a bracket prize can't be created (flag off, or the season is over). */
export const BRACKET_PRIZE_UNAVAILABLE_MESSAGE = `${BRACKET_GAME_NAME} prizes can only be set up during the tournament season.`;
export const BRACKET_PRIZE_KEYS_MESSAGE = "Choose at least one bracket that pays a prize.";
/** A chosen bracket has already locked: its standings are under way, so a prize can't be added. */
export const BRACKET_PRIZE_LOCKED_MESSAGE = "A bracket you chose has already locked. Choose one that hasn't started yet.";
/** The Results note for a bracket that paid nobody because nobody scored. */
export const BRACKET_PRIZE_NO_SCORERS_NOTE = "Nobody scored.";

export const bracketPrizeKey = (gender: BracketGender, kind: BracketKind): BracketPrizeKey => `${gender}_${kind}`;

export const parseBracketPrizeKey = (key: BracketPrizeKey): { gender: BracketGender; kind: BracketKind } => {
  const [gender, kind] = key.split("_") as [BracketGender, BracketKind];
  return { gender, kind };
};

/** "Men's bracket", "Women's second chance" — a chip or a Results label. */
export const bracketPrizeKeyLabel = (key: BracketPrizeKey): string => {
  const { gender, kind } = parseBracketPrizeKey(key);
  return bracketOptionLabel(gender, kind);
};

/** "the men's bracket" — inside a sentence. */
const keyPhrase = (key: BracketPrizeKey): string => `the ${bracketPrizeKeyLabel(key).toLowerCase()}`;

/**
 * The brackets a prize pays, in BRACKET_PRIZE_KEYS order, each once — or null for anything that isn't
 * a non-empty list of known brackets. Mirrors the database check (bracket_keys_valid).
 */
export const normalizeBracketPrizeKeys = (value: unknown): BracketPrizeKey[] | null => {
  if (!Array.isArray(value)) return null;
  const wanted = new Set(value.map((item) => String(item ?? "").trim()));
  if ([...wanted].some((item) => !(BRACKET_PRIZE_KEYS as readonly string[]).includes(item))) return null;
  const keys = BRACKET_PRIZE_KEYS.filter((key) => wanted.has(key));
  return keys.length > 0 ? keys : null;
};

/** "the men's bracket", "the men's bracket or the women's bracket", "a, b or c". */
export const describeBracketPrizeKeys = (keys: readonly BracketPrizeKey[], joiner: "or" | "and" = "or"): string => {
  const phrases = BRACKET_PRIZE_KEYS.filter((key) => keys.includes(key)).map(keyPhrase);
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} ${joiner} ${phrases[phrases.length - 1]}`;
};

/** "top 3", "1st". */
export const bracketPrizeTop = (placeCount: number): string => (placeCount <= 1 ? "1st" : `top ${placeCount}`);

/**
 * May a partner start a bracket prize today? The flag is on and the card window hasn't closed (US
 * Eastern). The server additionally refuses a bracket that has already locked (lib/rewards.ts), and
 * the award step pays only prizes created before their bracket locked.
 */
export const isBracketPrizeOffered = (now: Date): boolean =>
  isBracketsEnabled() && seasonalCalendarDate(now) <= SEASONAL_GAME_WINDOWS.bracket.closesAfter;

/**
 * The prize cycle key for one bracket of one tournament: the minute the tournament row was created,
 * plus the bracket's position in BRACKET_PRIZE_KEYS (1–4) in SECONDS. So:
 *   - every bracket of every tournament is its own cycle (a rehearsal replaying a past season is a
 *     different tournament row, so it never collides with the real one);
 *   - the bracket can be read back from the key alone (bracketPrizeKeyOfCycle) for the coupon's words
 *     and the Results label;
 *   - it never changes: a tournament's created_at is written once.
 * Null when the creation time can't be read.
 */
export const bracketPrizeCycleStart = (tournamentCreatedAt: string, key: BracketPrizeKey): Date | null => {
  const createdMs = Date.parse(tournamentCreatedAt);
  const position = BRACKET_PRIZE_KEYS.indexOf(key);
  if (!Number.isFinite(createdMs) || position < 0) return null;
  return new Date(Math.floor(createdMs / 60_000) * 60_000 + (position + 1) * 1000);
};

/** The bracket a bracket-prize cycle key stands for, or null when it isn't one. */
export const bracketPrizeKeyOfCycle = (cycleStart: string | null | undefined): BracketPrizeKey | null => {
  const ms = Date.parse(String(cycleStart ?? ""));
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const second = Math.floor((ms % 60_000) / 1000);
  return BRACKET_PRIZE_KEYS[second - 1] ?? null;
};

/** Every (gender, kind) pair, in BRACKET_PRIZE_KEYS order. */
export const BRACKET_PRIZE_PAIRS: ReadonlyArray<{ key: BracketPrizeKey; gender: BracketGender; kind: BracketKind }> =
  BRACKET_KINDS.flatMap((kind) => BRACKET_GENDERS.map((gender) => ({ key: bracketPrizeKey(gender, kind), gender, kind })));
