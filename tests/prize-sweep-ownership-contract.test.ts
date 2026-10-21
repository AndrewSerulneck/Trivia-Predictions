import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/squares-and-brackets-plan.md §13 F1 / Phase 6.1: each prize sweep pays ONLY its own kind of
// prize. A Squares prize and the NFL "most picks" prize are `game_winner` with null slots, exactly
// like a Live Trivia "winner of the game" prize; the Live Trivia sweep once kept every active
// game_winner prize at the venue, so the next trivia game would have won them.
//
// Every file that pays a prize (calls awardCycleWinner / awardRankedCyclePlaces) must be listed
// below with the definition check it uses. A new paying file fails this test until it is added —
// with its own `rewardDefinitionId === <its constant>` check.

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

const filesUnder = (dir: string): string[] => {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(ROOT, rel)).isDirectory() ? filesUnder(rel) : [rel];
  });
};

/** Paying file → the definition check it must contain. */
const OWN_DEFINITION_CHECK: Record<string, RegExp> = {
  "lib/liveTriviaWinnerRewards.ts": /campaign\.rewardDefinitionId === LIVE_TRIVIA_REWARD_DEFINITION_ID/,
  "lib/liveTriviaRankedRewards.ts": /campaign\.rewardDefinitionId === LIVE_TRIVIA_REWARD_DEFINITION_ID/,
  "lib/rankedRewardBackfill.ts": /isLiveTriviaRankedCampaign\(row\)/,
  "lib/nflPickEmWinnerRewards.ts": /campaign\.rewardDefinitionId === NFL_PICKEM_REWARD_DEFINITION_ID/,
  "lib/squaresPrizeAwards.ts": /campaign\.rewardDefinitionId === SQUARES_PRIZE_DEFINITION_ID/,
  "lib/bracketPrizeAwards.ts": /campaign\.rewardDefinitionId === BRACKET_PRIZE_DEFINITION_ID/,
};

/**
 * challengeCampaigns.ts defines both award functions and calls awardCycleWinner from
 * applyChallengeCampaignPoints: the points-target path, routed by game type rather than by
 * definition (legacy points targets have no definition id). It must never pay anything but a
 * points target — every game_winner / ranked_places prize belongs to its own sweep.
 */
const POINTS_TARGET_FILE = "lib/challengeCampaigns.ts";

const PAYS = /\bawait\s+(awardCycleWinner|awardRankedCyclePlaces)\s*\(/;

const payingFiles = [...filesUnder("lib"), ...filesUnder("app")]
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => PAYS.test(read(file)));

describe("prize sweep ownership (plan 6.1)", () => {
  it("every file that pays a prize is listed here", () => {
    expect(payingFiles.sort()).toEqual([...Object.keys(OWN_DEFINITION_CHECK), POINTS_TARGET_FILE].sort());
  });

  it.each(Object.entries(OWN_DEFINITION_CHECK))("%s filters on its own definition id", (file, check) => {
    expect(read(file)).toMatch(check);
  });

  it("the Live Trivia game-winner sweep keeps only Live Trivia prizes", () => {
    const source = read("lib/liveTriviaWinnerRewards.ts");
    expect(source).toMatch(/if \(isLiveTriviaGameWinnerCampaign\(campaign\)\)/);
    expect(source).not.toMatch(/campaign\.isActive && campaign\.winCondition === "game_winner"\)/);
  });

  it("the Live Trivia weekly places sweep filters its list read", () => {
    expect(read("lib/liveTriviaRankedRewards.ts")).toMatch(
      /\(await listActiveRankedPlaceCampaigns\(\)\)\.filter\(isLiveTriviaRankedCampaign\)/,
    );
  });

  it("the points-target path never pays a game_winner or ranked_places prize", () => {
    expect(read(POINTS_TARGET_FILE)).toMatch(/const resolvedByCron = campaign\.winCondition !== "points_threshold";/);
  });
});
