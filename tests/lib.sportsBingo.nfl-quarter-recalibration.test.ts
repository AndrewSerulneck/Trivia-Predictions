import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Phase 8c of docs/prop-bingo-nfl-plan.md — the recalibrated Phase 2 quarter/halftime constants.
 *
 * Phase 8b measured every flavor square before shipping it. The four quarter squares Phase 2 built
 * were never measured at all, and the Phase 8c full-season calibration replay found them to be the
 * worst-priced families on an NFL board — "14+ points in a quarter" priced at 0.189 against a
 * realized 0.371 over 447 board instances.
 *
 * This file is the tripwire that keeps them measured. Every expected value below is a rate measured
 * over the 2025 regular season by `npm run bingo:measure:nfl-quarters` and archived at
 * `docs/phase0-artifacts/phase8c-nfl-quarter-rates-2026-08-17.json`. **A failure here does not mean
 * "loosen the tolerance"** — it means either a constant moved without a measurement behind it, or a
 * re-measurement moved the truth, in which case update the archived artifact and these numbers
 * together.
 */

async function importOdds() {
  return import("@/lib/sportsBingoOdds");
}

/**
 * A league-average 2025 game: a pick'em at the measured mean implied team total of 23.03, which is
 * the point every measured rate below is anchored at.
 */
const LEAGUE_AVERAGE = { homeSpread: 0, total: 46.06, homeWinProb: null, vendorCount: 8 } as const;

/** Measured over the 2025 regular season; see the artifact named in the file comment. */
const MEASURED = {
  scoresEveryQuarter: 0.3029,
  shutoutInAQuarter: 0.6971,
  quarterPoints14: 0.3617,
  anyQuarterScoreless: 0.2316,
  secondHalfHigher: 0.4853,
  fourthDownConversion: 0.8272,
} as const;

describe("NFL quarter squares — Phase 8c recalibration", () => {
  it("prices a league-average game at the measured season rates", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const model = buildNFLMarketModel(LEAGUE_AVERAGE);

    // The dependence boost is fitted, so allow it a little room; the point is that the model is
    // within a couple of points of the season, not that it reproduces it to four decimals.
    expect(model.scoresEveryQuarter("home")).toBeCloseTo(MEASURED.scoresEveryQuarter, 1);
    expect(model.scoresEveryQuarter("away")).toBeCloseTo(MEASURED.scoresEveryQuarter, 1);
    // The board's shutout square is the exact complement of this one, by construction.
    expect(1 - model.scoresEveryQuarter("home")).toBeCloseTo(MEASURED.shutoutInAQuarter, 1);
    expect(model.anyQuarterScoreless()).toBeCloseTo(MEASURED.anyQuarterScoreless, 1);
  });

  it("reads the 14+ quarter square off the measured table, not the normal tail it used to", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const model = buildNFLMarketModel(LEAGUE_AVERAGE);

    const priced = model.quarterPointsAtLeast("home", 14);
    expect(priced).toBeCloseTo(MEASURED.quarterPoints14, 2);

    // Phase 2's normal tail put this at ~0.183. Reproducing 0.362 from that normal needs 7.5
    // effective trials in a four-quarter game, so no tuning of the trials constant could have
    // fixed it — guard the gap explicitly so a revert to the tail fails loudly rather than
    // quietly re-underpricing the square by half.
    expect(priced).toBeGreaterThan(0.3);
  });

  it("moves the quarter squares with the implied team total, in the right direction", async () => {
    const { buildNFLMarketModel } = await importOdds();
    // Home is implied for ~30 points, away for ~17 — a lopsided, high-total game.
    const lopsided = buildNFLMarketModel({ homeSpread: -13, total: 47, homeWinProb: null, vendorCount: 8 });

    expect(lopsided.quarterPointsAtLeast("home", 14)).toBeGreaterThan(
      lopsided.quarterPointsAtLeast("away", 14)
    );
    expect(lopsided.scoresEveryQuarter("home")).toBeGreaterThan(lopsided.scoresEveryQuarter("away"));
  });

  it("keeps the quarter-points curve monotone in the threshold", async () => {
    const { buildNFLMarketModel } = await importOdds();
    const model = buildNFLMarketModel(LEAGUE_AVERAGE);

    const rates = [7, 10, 14, 17, 21].map((threshold) => model.quarterPointsAtLeast("home", threshold));
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeLessThan(rates[i - 1]);
    }
  });

  it("holds the two flat base rates Phase 8c re-measured", async () => {
    const { NFL_SECOND_HALF_HIGHER_BASE, NFL_FOURTH_DOWN_CONVERSION_BASE } = await importOdds();

    expect(NFL_SECOND_HALF_HIGHER_BASE).toBeCloseTo(MEASURED.secondHalfHigher, 3);
    // The constant is rounded up from the team_stats measurement toward what the plays walk this
    // square actually grades from realized (0.861); both are archived in the findings doc.
    expect(NFL_FOURTH_DOWN_CONVERSION_BASE).toBeGreaterThanOrEqual(MEASURED.fourthDownConversion);
    expect(NFL_FOURTH_DOWN_CONVERSION_BASE).toBeLessThanOrEqual(0.87);
  });
});
