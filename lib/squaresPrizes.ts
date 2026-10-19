// Super Bowl Squares Prizes (docs/squares-and-brackets-plan.md, Phase 4). Pure and client-safe:
// shared by the reward registry, the description composer, the Create Prize wizard, the award
// step (lib/squaresPrizeAwards.ts) and the Results page.
//
// A Squares prize pays ONE coupon per chosen scoring moment at its venue, to whoever holds that
// venue's winning square. It rides on the ordinary prize engine: each moment is its own cycle in
// challenge_cycle_winners, awarded through award_cycle_winner with a quota of 1. The cycle key is
// squaresPrizeCycleStart() below — the one place that decides it.

import { SEASONAL_GAME_WINDOWS, isSquaresEnabled, seasonalCalendarDate } from "@/lib/seasonalGames";
import { SQUARES_MOMENTS, type SquaresMoment } from "@/lib/seasonalPoints";
import { SQUARES_GAME_NAME } from "@/lib/venueGameCards";

export const SQUARES_PRIZE_DEFINITION_ID = "squares_challenge";

/** Refusal when a Squares prize can't be created (flag off, season over, or the numbers are drawn). */
export const SQUARES_PRIZE_UNAVAILABLE_MESSAGE = `${SQUARES_GAME_NAME} prizes can only be set up before the numbers are drawn.`;
export const SQUARES_PRIZE_MOMENTS_MESSAGE = "Choose at least one moment that pays a prize.";

/** Each moment inside a sentence: "…at halftime and the end of the game". */
export const SQUARES_PRIZE_MOMENT_PHRASES: Record<SquaresMoment, string> = {
  q1: "the end of the first quarter",
  half: "halftime",
  q3: "the end of the third quarter",
  final: "the end of the game",
};

/**
 * The moments a prize pays, in game order, each once — or null for anything that isn't a
 * non-empty list of known moments. Mirrors the database check (squares_moments_valid).
 */
export const normalizeSquaresMoments = (value: unknown): SquaresMoment[] | null => {
  if (!Array.isArray(value)) return null;
  const wanted = new Set(value.map((item) => String(item ?? "").trim()));
  if ([...wanted].some((item) => !(SQUARES_MOMENTS as readonly string[]).includes(item))) return null;
  const moments = SQUARES_MOMENTS.filter((moment) => wanted.has(moment));
  return moments.length > 0 ? moments : null;
};

/** "halftime", "halftime or the end of the game", "the end of the first quarter, halftime or …". */
export const describeSquaresPrizeMoments = (moments: readonly SquaresMoment[], joiner: "or" | "and" = "or"): string => {
  const phrases = SQUARES_MOMENTS.filter((moment) => moments.includes(moment)).map((moment) => SQUARES_PRIZE_MOMENT_PHRASES[moment]);
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} ${joiner} ${phrases[phrases.length - 1]}`;
};

/**
 * The terms the partner agreed to, restated (wizard Confirm, the partner's Prizes list): "One prize
 * at halftime and the end of the game, up to 2 in all." Without the moments (an unreadable row),
 * the count alone.
 */
export const describeSquaresPrizeTerms = (moments: readonly SquaresMoment[] | null | undefined, quota: number): string => {
  const known = normalizeSquaresMoments(moments ?? null);
  if (!known) {
    const count = Math.max(1, Math.round(Number(quota) || 1));
    return count === 1 ? "One prize, at one moment of the game." : `One prize at each of ${count} moments of the game.`;
  }
  return `One prize at ${describeSquaresPrizeMoments(known, "and")}${known.length > 1 ? `, up to ${known.length} in all` : ""}.`;
};

/**
 * May a partner start a Squares prize today? The flag is on and the card window hasn't closed
 * (US Eastern). The server additionally refuses once the numbers are drawn (lib/rewards.ts).
 */
export const isSquaresPrizeOffered = (now: Date): boolean =>
  isSquaresEnabled() && seasonalCalendarDate(now) <= SEASONAL_GAME_WINDOWS.squares.closesAfter;

/**
 * The prize cycle key for one moment of one grade: the kickoff minute, plus the moment's position
 * (1–4) in SECONDS, plus the grade number in MILLISECONDS. So:
 *   - every moment is its own cycle (quota 1 each; one player may win several moments);
 *   - a re-grade after an admin void (grade_no + 1) is a new cycle, so the corrected winner is paid
 *     too; the voided winner's coupon is taken back only if it is still unused
 *     (withdrawVoidedSquaresPrizes in lib/squaresPrizeAwards.ts — a redeemed coupon is kept);
 *   - the moment can be read back from the key alone (squaresPrizeMomentOf) for the coupon's wording;
 *   - the key's date is the game's date, so Results files it with the game.
 * kickoff_at never changes after the draw (lib/squaresSettlement.ts refreshes it only before), and
 * prizes are only ever awarded after it. Null when the kickoff can't be read.
 */
export const squaresPrizeCycleStart = (kickoffAt: string, moment: SquaresMoment, gradeNo: number): Date | null => {
  const kickoffMs = Date.parse(kickoffAt);
  const position = SQUARES_MOMENTS.indexOf(moment);
  if (!Number.isFinite(kickoffMs) || position < 0) return null;
  const minuteMs = Math.floor(kickoffMs / 60_000) * 60_000;
  const grade = Math.min(999, Math.max(1, Math.round(Number(gradeNo) || 1)));
  return new Date(minuteMs + (position + 1) * 1000 + grade);
};

/** The moment a Squares prize cycle key stands for, or null when it isn't one. */
export const squaresPrizeMomentOf = (cycleStart: string | null | undefined): SquaresMoment | null => {
  const ms = Date.parse(String(cycleStart ?? ""));
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const second = Math.floor((ms % 60_000) / 1000);
  return SQUARES_MOMENTS[second - 1] ?? null;
};
