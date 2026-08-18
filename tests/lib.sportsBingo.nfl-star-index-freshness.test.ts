import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NFL_SPORT_KEY, resolveLeagueSeasonStatus } from "@/lib/leagueSeasonStatus";
import { isNFLStarIndexSnapshotStale } from "@/lib/sportsBingoNflStars";

// Phase 9c of docs/prop-bingo-nfl-plan.md — item 4, "a staleness tripwire, so nobody has to
// remember." A test that fails when the committed snapshot's `generatedAt` is older than 14 days
// AND `resolveLeagueSeasonStatus("americanfootball_nfl")` reports in-season; off-season it is
// inert, exactly as the plan asks.
//
// Deliberately its own file, separate from tests/lib.sportsBingo.nfl-star-index.test.ts: this is
// the only test in the NFL star-index surface that calls the real (unmocked)
// `resolveLeagueSeasonStatus`, so a network hiccup or a slow BDL response can only ever widen this
// one test's timeout, never the fast pure-math suite it sits next to.
const SNAPSHOT_PATH = path.join(process.cwd(), "data/sports-bingo/nfl-star-index.json");

describe("NFL star index snapshot freshness tripwire (Phase 9c #4)", () => {
  it(
    "fails if the committed snapshot goes stale while NFL is actually in season",
    async () => {
      const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
      const seasonInfo = await resolveLeagueSeasonStatus(NFL_SPORT_KEY);

      if (seasonInfo.status !== "in_season") {
        // Off-season: inert, per the plan. Nothing to assert — running `npm run bingo:stars:nfl`
        // is only required once the season status flips back to in-season.
        return;
      }
      expect(isNFLStarIndexSnapshotStale(snapshot.generatedAt)).toBe(false);
    },
    15_000
  );
});
