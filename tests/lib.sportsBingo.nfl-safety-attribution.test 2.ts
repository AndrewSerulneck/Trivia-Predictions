import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildNFLPlayDerivedFacts,
  isNFLSafetyPlay,
  isNFLTwoPointConversionPlay,
} from "@/lib/sportsBingo";
import { buildNFLFlavorSquares } from "@/lib/sportsBingoNflFlavor";
import phaseEProbe from "@/docs/phase0-artifacts/phaseE-nfl-safety-recalibration-2026-08-18.json";

/**
 * Phase E of docs/prop-bingo-out-of-scope-followup-plan.md — the committed `nfl_safety` base rate
 * was measured by a probe that still used the pre-Phase-3 rule "any +2 is a safety", so it counted
 * separately-booked two-point conversions as safeties and over-stated the square. The probe now
 * imports the shipped predicates instead of mirroring them.
 *
 * This file guards both halves of that fix:
 *   1. the shipped attribution really does separate the two (and the *old* rule really did not) —
 *      the regression the phase closes, reproduced without needing to check out old code;
 *   2. the numbers committed in `lib/sportsBingoNflFlavor.ts` still equal the measurement they came
 *      from, so a base rate can never silently drift away from its own artifact again.
 */

type Play = Parameters<typeof buildNFLPlayDerivedFacts>[0][number];

/** The old probe rule, verbatim: `if (delta === 2) sawSafety = true`. Kept only to fail against. */
const oldProbeSawSafety = (plays: Play[]): boolean => {
  const MAX_POINTS_PER_PLAY = 8;
  let runningHome = 0;
  let runningAway = 0;
  let sawSafety = false;
  for (const play of plays) {
    const home = Number(play.home_score);
    const away = Number(play.away_score);
    if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
    const homeDelta = home - runningHome;
    const awayDelta = away - runningAway;
    if (homeDelta < 0 || awayDelta < 0 || homeDelta + awayDelta > MAX_POINTS_PER_PLAY) continue;
    runningHome = home;
    runningAway = away;
    if (Math.max(homeDelta, awayDelta) === 2) sawSafety = true;
  }
  return sawSafety;
};

const play = (over: Partial<Play>): Play => ({
  period: 1,
  clock_display: "10:00",
  home_score: 0,
  away_score: 0,
  ...over,
});

/** A touchdown booked at +6, then its two-point try booked as its own +2 row. No safety anywhere. */
const twoPointBookedSeparately: Play[] = [
  play({ type_slug: "rush", short_text: "Bijan Robinson 3 Yd Run", home_score: 6, away_score: 0, period: 2 }),
  play({
    type_slug: "two-point-conversion",
    type_text: "Two-Point Conversion",
    short_text: "Kyle Pitts Pass From Michael Penix Jr. for Two-Point Conversion",
    home_score: 8,
    away_score: 0,
    period: 2,
  }),
];

/** A real safety: the defence tackles the ball carrier in his own end zone for +2. */
const realSafety: Play[] = [
  play({ type_slug: "safety", type_text: "Safety", short_text: "Derrick Barnes Safety", home_score: 2, away_score: 0, period: 3 }),
];

/** A bare +2 that nothing types — the case shipped grading refuses to guess at. */
const unattributableTwoPoints: Play[] = [
  play({ type_slug: "rush", short_text: "Tackled in the end zone", home_score: 2, away_score: 0, period: 3 }),
];

describe("Phase E — the +2 attribution the base-rate probe now shares with shipped grading", () => {
  it("does NOT call a separately-booked two-point conversion a safety (the old probe rule did)", () => {
    const facts = buildNFLPlayDerivedFacts(twoPointBookedSeparately);
    expect(facts.sawSafety).toBe(false);
    expect(facts.sawTwoPointConversion).toBe(true);

    // The exact drift Phase E closes: the same plays, under the rule the committed 0.048 was
    // measured with, count as a safety. If this ever stops being true the regression is gone and
    // so is the reason this file exists.
    expect(oldProbeSawSafety(twoPointBookedSeparately)).toBe(true);
  });

  it("still calls a type-attributed +2 a safety", () => {
    const facts = buildNFLPlayDerivedFacts(realSafety);
    expect(facts.sawSafety).toBe(true);
    expect(facts.sawTwoPointConversion).toBe(false);
  });

  it("voids both facts on a +2 neither predicate can attribute", () => {
    const facts = buildNFLPlayDerivedFacts(unattributableTwoPoints);
    expect(facts.sawSafety).toBeNull();
    expect(facts.sawTwoPointConversion).toBeNull();
  });

  it("recognises every safety shape the live feed produces, and no defensive prose", () => {
    expect(isNFLSafetyPlay({ type_slug: "safety" })).toBe(true);
    expect(isNFLSafetyPlay({ type_text: "Safety" })).toBe(true);
    expect(
      isNFLSafetyPlay({ type_slug: "penalty", short_text: "Offensive Holding enforced in end zone for a Safety" })
    ).toBe(true);
    // "safety" as a *position* in the long prose field must never read as a scoring play.
    expect(isNFLSafetyPlay({ type_slug: "rush", text: "Tackled by safety Kyle Hamilton after a 4 yard gain" })).toBe(false);
  });

  it("counts a successful two-point try and refuses a failed one", () => {
    expect(isNFLTwoPointConversionPlay({ short_text: "Pass to Julian Hill for Two-Point Conversion" })).toBe(true);
    expect(isNFLTwoPointConversionPlay({ short_text: "Two-Point Pass Conversion Failed" })).toBe(false);
    expect(isNFLTwoPointConversionPlay({ short_text: "Bijan Robinson 3 Yd Run" })).toBe(false);
  });
});

describe("Phase E — the committed base rates still match the artifact they were measured from", () => {
  const baseRateFor = (kind: string): number => {
    const found = buildNFLFlavorSquares().find((square) => square.resolver.kind === kind);
    if (!found) throw new Error(`no flavor square for ${kind}`);
    return found.baseRate;
  };

  const measured = phaseEProbe.tier3BaseRates;

  it("was measured over the same 272-game 2025 regular season the 8b sweep used", () => {
    expect(phaseEProbe.season).toBe("2025");
    expect(phaseEProbe.gamesConsidered).toBe(272);
    expect(measured.safety.n).toBe(272);
  });

  it("nfl_safety's committed rate is the measured rate", () => {
    expect(baseRateFor("nfl_safety")).toBeCloseTo(measured.safety.rate, 3);
  });

  it("nfl_two_point_conversion's committed rate is the measured rate", () => {
    expect(baseRateFor("nfl_two_point_conversion")).toBeCloseTo(measured.two_point_conversion.rate, 3);
  });
});
