import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/balldontlie", () => ({ fetchBallDontLieList: vi.fn() }));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));
vi.mock("@/lib/nflPickEm", () => ({ getLockedNFLPickEmGameLineForSettlement: vi.fn() }));
vi.mock("@/lib/venueGameSettings", () => ({ getVenueNFLPickEmScoringMode: vi.fn() }));

import { getLeagueLabelForSportKey, listPickEmSports, listRegularPickEmSports } from "@/lib/pickem";
import { PICKEM_SPORT_CATALOG } from "@/lib/pickemSports";

describe("regular Pick 'Em sports", () => {
  it("hides NFL from regular discovery without removing the shared NFL definition", () => {
    expect(listRegularPickEmSports().map((sport) => sport.slug)).not.toContain("nfl");
    expect(listPickEmSports().map((sport) => sport.slug)).toContain("nfl");
  });
});

describe("the shared sports catalog (lib/pickemSports.ts)", () => {
  it("is the game's sports list, in the same order", () => {
    expect(listPickEmSports().map((sport) => sport.slug)).toEqual(["nba", "mlb", "nhl", "soccer", "ncaaf", "nfl", "mma", "tennis"]);
    expect(listPickEmSports().map((sport) => sport.label)).toEqual(PICKEM_SPORT_CATALOG.map((sport) => sport.label));
  });

  it("labels every league exactly as the game does (the label a pick stores)", () => {
    for (const sport of PICKEM_SPORT_CATALOG) {
      for (const league of sport.leagues) expect(getLeagueLabelForSportKey(league.sportKey)).toBe(league.label);
    }
  });
});
