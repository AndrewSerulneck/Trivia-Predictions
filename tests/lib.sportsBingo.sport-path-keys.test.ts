import { describe, expect, it } from "vitest";

// Guard for Phase B of docs/prop-bingo-out-of-scope-followup-plan.md: SPORT_PATH_BY_KEY
// (lib/sportsBingo.ts) and the leagues route's LEAGUES list drifted apart once already (NHL +
// six soccer keys were unreachable dead weight in the path table). This asserts the two stay in
// lockstep — adding a league to the picker without a path (or vice versa) fails CI instead of
// silently drifting again.

import { SPORT_PATH_BY_KEY } from "@/lib/sportsBingo";
import { SPORTS_BINGO_LEAGUES } from "@/lib/sportsBingoLeagues";

describe("Sports Bingo league keys stay in sync", () => {
  it("SPORT_PATH_BY_KEY has exactly the shared supported-catalog keys", () => {
    const supportedKeys = SPORTS_BINGO_LEAGUES.map((league) => league.sportKey).sort();
    expect(Object.keys(SPORT_PATH_BY_KEY).sort()).toEqual(supportedKeys);
  });
});
