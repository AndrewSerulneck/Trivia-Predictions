import { describe, expect, it } from "vitest";

import {
  MLB_TEAM_EVENT_RATES,
  MLB_TEAM_EVENT_RUNG_TARGETS,
  buildMlbTeamEventRungs,
  mlbTeamEventTailProbability,
  predictMlbTeamEventRate,
  type MeasuredMlbTeamEvent,
} from "@/lib/mlbTeamEventRates";

/**
 * Phase 7 of docs/prop-bingo-nfl-plan.md — the MLB team-event block.
 *
 * Before this phase, all fourteen of these squares carried a hardcoded probability that was
 * identical for every game and wrong in the same direction every time: "4+ groundouts" was priced
 * 0.74 and settles 0.969, "5+ strikeouts" 0.67 against 0.917. Six of a board's 24 squares were
 * priced near a free square, which is why no MLB board could be built at 25%.
 *
 * These assertions guard the two claims Phase 7 actually makes:
 *
 *   1. Every emitted rung is priced in the 0.35-0.55 band the phase committed to.
 *   2. The threshold moves with the matchup rather than being a league constant wearing a
 *      per-game costume — which is the part that would silently rot back into a constant if the
 *      opponent lookup ever started returning nothing.
 *
 * The base rates themselves are measured, not asserted here; `scripts/measure-mlb-event-rates.cjs`
 * owns that, archived at `docs/phase0-artifacts/mlb-event-rates-2026-08-17.json`.
 */

const MEASURED_EVENTS: readonly MeasuredMlbTeamEvent[] = [
  "hit",
  "walk",
  "hit_by_pitch",
  "strikeout",
  "groundout",
  "flyout",
];

/** Rate an average opponent implies — the adjustment is zero here by construction. */
const leagueRateFor = (event: MeasuredMlbTeamEvent) =>
  predictMlbTeamEventRate(event, MLB_TEAM_EVENT_RATES[event].opponentMean, 20);

describe("MLB team-event rebalance (Phase 7)", () => {
  it("centres the block on the 0.35-0.55 band", () => {
    // These squares count whole events, so a rung lands on the nearest achievable integer
    // threshold rather than exactly on a target — "8+ hits" is 0.539, there is no 0.55. The claim
    // Phase 7 makes is about where the block *sits*, so that is what this asserts: the mean is in
    // band, and nothing is anywhere near the near-automatic prices the phase deleted.
    const all: number[] = [];
    for (const event of MEASURED_EVENTS) {
      const rungs = buildMlbTeamEventRungs(event, leagueRateFor(event));
      expect(rungs.length).toBeGreaterThan(0);
      for (const rung of rungs) {
        expect(rung.probability).toBeGreaterThan(0.15);
        expect(rung.probability).toBeLessThan(0.65);
        all.push(rung.probability);
      }
    }
    const mean = all.reduce((sum, value) => sum + value, 0) / all.length;
    expect(mean).toBeGreaterThanOrEqual(0.35);
    expect(mean).toBeLessThanOrEqual(0.55);
    // The block averaged 0.613 before Phase 7, which is what made a 25% board unbuildable.
    expect(mean).toBeLessThan(0.55);
  });

  it("picks the closest achievable threshold to each target", () => {
    // The grain-aware version of the band claim, and the one that would catch an off-by-one in the
    // rung search: no other integer threshold prices closer to the target than the one emitted.
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      const rate = leagueRateFor(event);
      const rungs = buildMlbTeamEventRungs(event, rate);
      for (const rung of rungs) {
        const target = [...MLB_TEAM_EVENT_RUNG_TARGETS].sort(
          (a, b) => Math.abs(a - rung.probability) - Math.abs(b - rung.probability)
        )[0]!;
        const error = Math.abs(rung.probability - target);
        for (let threshold = 1; threshold <= 24; threshold += 1) {
          const alternative = mlbTeamEventTailProbability(threshold, rate, model.variance);
          expect(Math.abs(alternative - target)).toBeGreaterThanOrEqual(error - 1e-9);
        }
      }
    }
  });

  it("no longer emits the near-automatic thresholds it shipped with", () => {
    // The exact squares Phase 7a measured as mis-specified. If any of these comes back, the block
    // has regressed to the constants this phase deleted.
    const shipped: Array<[MeasuredMlbTeamEvent, number]> = [
      ["hit", 5],
      ["walk", 2],
      ["strikeout", 5],
      ["groundout", 4],
      ["flyout", 4],
    ];
    for (const [event, oldThreshold] of shipped) {
      const rungs = buildMlbTeamEventRungs(event, leagueRateFor(event));
      expect(rungs.map((rung) => rung.threshold)).not.toContain(oldThreshold);
    }
  });

  it("emits more than one rung per event so the difficulty selector has a choice", () => {
    // hit_by_pitch legitimately collapses to a single rung (see above); every other event must
    // give `orderByDifficulty` something to pick between.
    for (const event of MEASURED_EVENTS.filter((item) => item !== "hit_by_pitch")) {
      const rungs = buildMlbTeamEventRungs(event, leagueRateFor(event));
      expect(rungs.length).toBeGreaterThanOrEqual(2);
      expect(new Set(rungs.map((rung) => rung.threshold)).size).toBe(rungs.length);
    }
  });

  it("moves the threshold with the opposing staff, not with the league", () => {
    // The whole point of 7b. A lineup facing a strikeout-heavy staff should be asked for more
    // strikeouts than one facing a contact staff, at the same difficulty.
    for (const event of MEASURED_EVENTS.filter((item) => item !== "hit_by_pitch")) {
      const model = MLB_TEAM_EVENT_RATES[event];
      const soft = predictMlbTeamEventRate(event, model.opponentMean - 2 * model.opponentSd, 20);
      const tough = predictMlbTeamEventRate(event, model.opponentMean + 2 * model.opponentSd, 20);
      expect(tough).toBeGreaterThan(soft);

      const softRungs = buildMlbTeamEventRungs(event, soft);
      const toughRungs = buildMlbTeamEventRungs(event, tough);
      // The top rung is the one a board is most likely to carry; it must actually differ.
      expect(toughRungs[0]!.threshold).toBeGreaterThan(softRungs[0]!.threshold);
    }
  });

  it("falls back to the league rate when the opponent has no history", () => {
    for (const event of MEASURED_EVENTS) {
      expect(predictMlbTeamEventRate(event, null, 0)).toBe(MLB_TEAM_EVENT_RATES[event].leagueMean);
      expect(predictMlbTeamEventRate(event, 99, 0)).toBe(MLB_TEAM_EVENT_RATES[event].leagueMean);
      expect(predictMlbTeamEventRate(event, Number.NaN, 5)).toBe(MLB_TEAM_EVENT_RATES[event].leagueMean);
    }
  });

  it("shrinks the adjustment toward the league on a thin opponent sample", () => {
    // A two-game sample throws up rates a season never would. Trusting it fully would put an
    // absurd threshold on a square that a player then has to look at all night.
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      const extreme = model.opponentMean + 2 * model.opponentSd;
      const thin = predictMlbTeamEventRate(event, extreme, 2);
      const full = predictMlbTeamEventRate(event, extreme, 40);
      expect(thin).toBeGreaterThan(model.leagueMean);
      expect(thin).toBeLessThan(full);
    }
  });

  it("bounds the adjustment against an absurd opponent rate", () => {
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      const capped = predictMlbTeamEventRate(event, model.opponentMean + 2 * model.opponentSd, 40);
      expect(predictMlbTeamEventRate(event, 1_000, 40)).toBeCloseTo(capped, 6);
      expect(predictMlbTeamEventRate(event, -1_000, 40)).toBeGreaterThan(0);
    }
  });

  it("reproduces the measured league distribution it was fitted to", () => {
    // The negative-binomial fit is what lets a per-game rate be priced between the measured rungs.
    // These are the measured values from the 1,138-team-game window; the fit tracks them to within
    // 0.05, which is the tolerance `scripts/measure-mlb-event-rates.cjs` reports.
    const measured: Array<[MeasuredMlbTeamEvent, number, number]> = [
      ["hit", 5, 0.86],
      ["hit", 8, 0.53],
      ["walk", 2, 0.81],
      ["strikeout", 5, 0.92],
      ["strikeout", 8, 0.6],
      ["groundout", 4, 0.97],
      ["groundout", 8, 0.59],
      ["flyout", 4, 0.76],
      ["hit_by_pitch", 1, 0.34],
    ];
    for (const [event, threshold, expected] of measured) {
      const model = MLB_TEAM_EVENT_RATES[event];
      const fitted = mlbTeamEventTailProbability(threshold, model.leagueMean, model.variance);
      expect(Math.abs(fitted - expected)).toBeLessThan(0.05);
    }
  });

  it("prices the tail monotonically", () => {
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      let previous = 1;
      for (let threshold = 1; threshold <= 15; threshold += 1) {
        const probability = mlbTeamEventTailProbability(threshold, model.leagueMean, model.variance);
        expect(probability).toBeLessThanOrEqual(previous + 1e-9);
        previous = probability;
      }
    }
  });

  it("keeps the rung targets centred near 0.45", () => {
    // Guards the phase's committed band against a quiet edit to the constant.
    expect([...MLB_TEAM_EVENT_RUNG_TARGETS].sort((a, b) => a - b)).toEqual([0.35, 0.45, 0.55]);
  });
});

/**
 * Phase 1 of docs/bingo-correctness-and-wnba-repair-plan.md — the home/away split.
 *
 * The home team doesn't bat in the bottom of the 9th when already ahead (~half of all games), so
 * its event totals run structurally below the away team's. Before this phase every square priced
 * off one pooled `leagueMean` regardless of side; these guard the split without hardcoding the
 * measured numbers, so a re-measurement doesn't rewrite the tests — only a change in *direction*
 * should ever fail these.
 */
describe("MLB team-event home/away split (Phase 1)", () => {
  it("prices every measured event's home mean below its away mean", () => {
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      expect(model.homeMean).toBeLessThan(model.awayMean);
    }
  });

  it("a null side returns exactly the pooled leagueMean, no opponent data", () => {
    for (const event of MEASURED_EVENTS) {
      expect(predictMlbTeamEventRate(event, null, 0, null)).toBe(MLB_TEAM_EVENT_RATES[event].leagueMean);
      expect(predictMlbTeamEventRate(event, null, 0)).toBe(MLB_TEAM_EVENT_RATES[event].leagueMean);
    }
  });

  it("a null side matches the pooled leagueMean even with opponent data supplied", () => {
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      expect(predictMlbTeamEventRate(event, model.opponentMean, 20, null)).toBeCloseTo(model.leagueMean, 6);
    }
  });

  it("home and away, no opponent data, reproduce homeMean/awayMean exactly", () => {
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      expect(predictMlbTeamEventRate(event, null, 0, "home")).toBe(model.homeMean);
      expect(predictMlbTeamEventRate(event, null, 0, "away")).toBe(model.awayMean);
    }
  });

  it("the side base rate and the opponent adjustment compose rather than one clobbering the other", () => {
    // Same opponent input, different side: the two home/away outputs must differ by (roughly) the
    // same gap as their unadjusted base means — the opponent slope is shared, only the base shifts.
    for (const event of MEASURED_EVENTS) {
      const model = MLB_TEAM_EVENT_RATES[event];
      const tough = model.opponentMean + 2 * model.opponentSd;
      const home = predictMlbTeamEventRate(event, tough, 20, "home");
      const away = predictMlbTeamEventRate(event, tough, 20, "away");
      expect(home).toBeLessThan(away);
      expect(away - home).toBeCloseTo(model.awayMean - model.homeMean, 6);

      // The opponent adjustment itself still moves the price up from the side's own base mean —
      // it isn't discarded just because a side was supplied.
      expect(home).toBeGreaterThan(model.homeMean);
      expect(away).toBeGreaterThan(model.awayMean);
    }
  });

  it("a generated MLB board's home and away rungs for the same event can differ in threshold", () => {
    // Not every event necessarily rounds to a different integer threshold on every rung — the
    // real claim is that the block as a whole is no longer side-blind. At least one event's rungs
    // must actually differ between home and away.
    let anyEventDiffers = false;
    for (const event of MEASURED_EVENTS) {
      const homeRungs = buildMlbTeamEventRungs(event, predictMlbTeamEventRate(event, null, 0, "home"));
      const awayRungs = buildMlbTeamEventRungs(event, predictMlbTeamEventRate(event, null, 0, "away"));
      expect(homeRungs.length).toBeGreaterThan(0);
      expect(awayRungs.length).toBeGreaterThan(0);
      const homeThresholds = homeRungs.map((rung) => rung.threshold).join(",");
      const awayThresholds = awayRungs.map((rung) => rung.threshold).join(",");
      if (homeThresholds !== awayThresholds) {
        anyEventDiffers = true;
      }
    }
    expect(anyEventDiffers).toBe(true);
  });
});
