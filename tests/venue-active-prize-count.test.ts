import { describe, expect, it } from "vitest";
import { countActivePrizeCards, type ChallengeCampaignCard } from "@/components/venue/venueHubShared";

const card = (overrides: Partial<ChallengeCampaignCard>): ChallengeCampaignCard =>
  ({ id: "c", winnerQuota: 1, quotaRemaining: 1, ...overrides }) as ChallengeCampaignCard;

describe("countActivePrizeCards (Pick 'Em plan 7.6.2)", () => {
  it("excludes ended cards from the Active count", () => {
    expect(countActivePrizeCards([card({}), card({ prizeEnded: true }), card({ prizeEnded: true })])).toBe(1);
  });

  it("a won or all-claimed card is not shown as ended, so it counts", () => {
    expect(countActivePrizeCards([card({ prizeEnded: true, viewerWon: true }), card({ prizeEnded: true, quotaRemaining: 0 })])).toBe(2);
  });
});
