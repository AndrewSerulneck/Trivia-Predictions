import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/balldontlie", () => ({ fetchBallDontLieList: vi.fn() }));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: vi.fn() }));
vi.mock("@/lib/nflPickEm", () => ({ getLockedNFLPickEmGameLineForSettlement: vi.fn() }));
vi.mock("@/lib/venueGameSettings", () => ({ getVenueNFLPickEmScoringMode: vi.fn() }));

import { listPickEmSports, listRegularPickEmSports } from "@/lib/pickem";

describe("regular Pick 'Em sports", () => {
  it("hides NFL from regular discovery without removing the shared NFL definition", () => {
    expect(listRegularPickEmSports().map((sport) => sport.slug)).not.toContain("nfl");
    expect(listPickEmSports().map((sport) => sport.slug)).toContain("nfl");
  });
});
