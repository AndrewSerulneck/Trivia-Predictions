import { describe, expect, it } from "vitest";
import {
  challengeGameTypeToVenueGameKey,
  inferChallengeGameType,
  resolveChallengeGameType,
  rewardGameLabel,
  rewardHeadline,
  rewardPlayVenueGameKey,
  rewardQuotaLine,
  type ChallengeCampaignCard,
} from "@/components/venue/venueHubShared";

const BASE_CARD: ChallengeCampaignCard = {
  id: "campaign-1",
  name: "General Saloon - 3-Day Challenge",
  rules: "Earn 100 points",
  pointsRequiredToWin: 100,
  progressPoints: 0,
  isActive: true,
};

describe("rewardHeadline", () => {
  it("describes a gift card prize", () => {
    expect(rewardHeadline({ ...BASE_CARD, prizeKind: "gift_card", prizeGiftCertificateAmount: 20 })).toBe(
      "$20.00 gift card",
    );
  });

  it("describes a percent-off menu item prize", () => {
    expect(
      rewardHeadline({
        ...BASE_CARD,
        prizeKind: "menu_item",
        prizeMenuItem: "appetizer",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 50,
      }),
    ).toBe("50% off Appetizer");
  });

  it("describes a 100%-off menu item prize as free", () => {
    expect(
      rewardHeadline({
        ...BASE_CARD,
        prizeKind: "menu_item",
        prizeMenuItem: "entree",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 100,
      }),
    ).toBe("Free Entrée");
  });

  it("describes a dollar-off menu item prize", () => {
    expect(
      rewardHeadline({
        ...BASE_CARD,
        prizeKind: "menu_item",
        prizeMenuItem: "whole_order",
        prizeDiscountKind: "dollar",
        prizeDiscountValue: 25,
      }),
    ).toBe("$25.00 off Whole Order");
  });

  it("falls back to the card name when there is no prize signal", () => {
    expect(rewardHeadline(BASE_CARD)).toBe("General Saloon - 3-Day Challenge");
  });

  it("falls back to the card name for a gift card with a NULL amount", () => {
    expect(
      rewardHeadline({ ...BASE_CARD, name: "$25 Gift Card Giveaway", prizeKind: "gift_card", prizeGiftCertificateAmount: null }),
    ).toBe("$25 Gift Card Giveaway");
  });

  it("falls back to the card name for a menu item with a NULL item", () => {
    expect(
      rewardHeadline({ ...BASE_CARD, name: "Free Appetizer Night", prizeKind: "menu_item", prizeMenuItem: null }),
    ).toBe("Free Appetizer Night");
  });

  it("falls back to the card name for menu item 'other' with a blank name", () => {
    expect(
      rewardHeadline({
        ...BASE_CARD,
        name: "Mystery Prize",
        prizeKind: "menu_item",
        prizeMenuItem: "other",
        prizeMenuItemName: "  ",
      }),
    ).toBe("Mystery Prize");
  });
});

describe("rewardGameLabel", () => {
  it("returns the joined title line for a known game type", () => {
    expect(rewardGameLabel("nfl-pickem")).toBe("NFL Pick 'Em");
    expect(rewardGameLabel("live_trivia")).toBe("Live Trivia");
  });

  it("returns an empty string for unknown", () => {
    expect(rewardGameLabel("unknown")).toBe("");
  });
});

describe("challengeGameTypeToVenueGameKey", () => {
  it("maps each known game type to its venue game key", () => {
    expect(challengeGameTypeToVenueGameKey("live_trivia")).toBe("live_trivia");
    expect(challengeGameTypeToVenueGameKey("speed-trivia")).toBe("speed-trivia");
    expect(challengeGameTypeToVenueGameKey("bingo")).toBe("bingo");
    expect(challengeGameTypeToVenueGameKey("pickem")).toBe("pickem");
    expect(challengeGameTypeToVenueGameKey("fantasy")).toBe("fantasy");
    expect(challengeGameTypeToVenueGameKey("nfl-pickem")).toBe("nfl-pickem");
  });

  it("returns null for unknown, so no Play Now button renders", () => {
    expect(challengeGameTypeToVenueGameKey("unknown")).toBeNull();
  });
});

describe("resolveChallengeGameType", () => {
  it("lets the reward definition id win over a misleading name", () => {
    expect(resolveChallengeGameType("Trivia Champion", "live_trivia_challenge")).toEqual({
      gameType: "live_trivia",
      fromDefinition: true,
    });
    expect(resolveChallengeGameType("Weekly Pick 'Em Bonus", "nfl_pickem_challenge")).toEqual({
      gameType: "nfl-pickem",
      fromDefinition: true,
    });
  });

  it("falls back to the name guess for legacy rows with no definition id", () => {
    expect(resolveChallengeGameType("Trivia Champion")).toEqual({ gameType: "speed-trivia", fromDefinition: false });
    expect(resolveChallengeGameType("Bingo Blowout", null)).toEqual({ gameType: "bingo", fromDefinition: false });
    expect(resolveChallengeGameType("Mystery Prize")).toEqual({ gameType: "unknown", fromDefinition: false });
  });

  it("treats an unrecognized definition id as no signal at all", () => {
    expect(resolveChallengeGameType("Bingo Blowout", "retired_definition")).toEqual({
      gameType: "bingo",
      fromDefinition: false,
    });
  });
});

describe("inferChallengeGameType", () => {
  it("still returns the display game type, definition-derived or guessed", () => {
    expect(inferChallengeGameType("Trivia Champion", "live_trivia_challenge")).toBe("live_trivia");
    expect(inferChallengeGameType("Trivia Champion")).toBe("speed-trivia");
  });
});

describe("rewardPlayVenueGameKey", () => {
  it("routes a definition-backed reward to its game", () => {
    expect(rewardPlayVenueGameKey("Trivia Champion", "live_trivia_challenge")).toBe("live_trivia");
    expect(rewardPlayVenueGameKey("NFL Pick 'Em Challenge", "nfl_pickem_challenge")).toBe("nfl-pickem");
  });

  it("returns null for a name-derived guess, so Play Now does not render", () => {
    // "Trivia Champion" guesses Speed Trivia but may really track Live Trivia —
    // sending the player there would accrue points toward nothing.
    expect(rewardPlayVenueGameKey("Trivia Champion")).toBeNull();
    expect(rewardPlayVenueGameKey("Bingo Blowout", null)).toBeNull();
    expect(rewardPlayVenueGameKey("Mystery Prize")).toBeNull();
  });
});

describe("rewardQuotaLine", () => {
  it("renders nothing for single-winner rewards", () => {
    expect(rewardQuotaLine(1, 1)).toBe("");
    expect(rewardQuotaLine(undefined, undefined)).toBe("");
  });

  it("always includes the total quota, even when remaining is 1", () => {
    expect(rewardQuotaLine(2, 1)).toBe("1 of 2 reward left");
  });

  it("pluralizes when remaining is not 1", () => {
    expect(rewardQuotaLine(5, 2)).toBe("2 of 5 rewards left");
    expect(rewardQuotaLine(5, 0)).toBe("All 5 claimed");
  });

  it("reports exhausted when quota is fully claimed", () => {
    expect(rewardQuotaLine(3, 0)).toBe("All 3 claimed");
  });
});
