import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveLeagueSeasonStatus } from "@/lib/leagueSeasonStatus";
import { isMLBStarIndexSnapshotStale } from "@/lib/sportsBingoMlbStars";

// Phase 9d of docs/prop-bingo-nfl-plan.md — the MLB half of the check-in tripwire, mirroring
// tests/lib.sportsBingo.nfl-star-index-freshness.test.ts. Fails when the committed snapshot's
// `generatedAt` is older than 14 days AND MLB is actually in season; off-season it is inert.
//
// Deliberately its own file, for the same reason the NFL one is: it is the only test in the MLB
// star-index surface that calls the real (unmocked) `resolveLeagueSeasonStatus`, so a network
// hiccup can only ever widen this one test's timeout rather than the fast pure-math suite it sits
// next to.
//
// One asymmetry worth knowing: MLB's season runs March-November, so unlike NFL's (which is inert
// most of the year this plan has been worked on) this tripwire is *live* for two thirds of the
// calendar. `npm run bingo:stars:mlb` is a real fortnightly obligation during the season.
const SNAPSHOT_PATH = path.join(process.cwd(), "data/sports-bingo/mlb-star-index.json");

describe("MLB star index snapshot freshness tripwire", () => {
  it(
    "fails if the committed snapshot goes stale while MLB is actually in season",
    async () => {
      const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
      const seasonInfo = await resolveLeagueSeasonStatus("baseball_mlb");

      if (seasonInfo.status !== "in_season") {
        // Off-season: inert, per the plan. Re-running the refresh script is only required once the
        // season status flips back to in-season.
        return;
      }
      expect(isMLBStarIndexSnapshotStale(snapshot.generatedAt)).toBe(false);
    },
    15_000
  );
});
