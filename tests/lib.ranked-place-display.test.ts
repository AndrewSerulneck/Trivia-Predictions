import { describe, expect, it } from "vitest";

import { rewardTermsText, type OwnerCompetition } from "@/lib/ownerRewardDisplay";
import { describeRankedTerms } from "@/lib/rankedPlaceRewards";
import { buildRankedWeekHistory } from "@/lib/rankedWeekHistory";
import type { RewardPlacePrize } from "@/types";

// Partner and admin lists for a weekly places reward (Phase 4): the terms line and the per-week history.

const gift = (place: number, amount: number): RewardPlacePrize => ({
  place,
  prizeKind: "gift_card",
  prizeGiftCertificateAmount: amount,
  prizeMenuItem: null,
  prizeMenuItemName: null,
  prizeDiscountKind: null,
  prizeDiscountValue: null,
  prizePosValueCents: null,
  prizePosDelivery: null,
});
const LADDER = [gift(1, 30), gift(2, 20), gift(3, 10)];

const competition = (overrides: Partial<OwnerCompetition>): OwnerCompetition =>
  ({
    id: "c1",
    name: "Weekly Trivia Champions",
    rewardDefinitionId: "live_trivia_challenge",
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    isActive: true,
    winnerUserId: null,
    winnerQuota: 3,
    winCondition: "ranked_places",
    recurringType: "weekly",
    progressPoints: 0,
    ...overrides,
  }) as unknown as OwnerCompetition;

describe("terms text", () => {
  it("a weekly places reward states its ladder, never an 'N rewards a week' quota", () => {
    const terms = rewardTermsText(competition({ placePrizes: LADDER }));
    expect(terms).toBe(
      "Weekly top 3. 1st place wins a $30 gift card, 2nd place wins a $20 gift card and 3rd place wins a $10 gift card.",
    );
    expect(terms).not.toMatch(/make \d+ of these/);
  });

  it("states the minimum when the partner set one", () => {
    expect(rewardTermsText(competition({ placePrizes: LADDER, minPlayers: 4 }))).toBe(
      "Weekly top 3. 1st place wins a $30 gift card, 2nd place wins a $20 gift card and 3rd place wins a $10 gift card. At least 4 players need to play each week.",
    );
  });

  it("one place reads as a weekly winner", () => {
    expect(describeRankedTerms([gift(1, 30)], null)).toBe("Weekly winner. The winner gets a $30 gift card.");
  });

  it("a game-winner reward's minimum is part of its terms; without one nothing changes", () => {
    const base = competition({ winCondition: "game_winner", winnerQuota: 1, recurringType: "weekly" });
    const without = rewardTermsText(base);
    expect(without).not.toMatch(/players need to play/);
    expect(rewardTermsText({ ...base, minPlayers: 3 })).toBe(
      `${without} At least 3 players need to play for a winner to be named.`,
    );
  });
});

describe("buildRankedWeekHistory", () => {
  const WEEK1 = "2026-10-07T04:00:00+00:00"; // PostgREST renders +00:00, not Z
  const WEEK2 = "2026-10-14T04:00:00+00:00";
  const WEEK3 = "2026-10-21T04:00:00+00:00";

  it("groups a week's winners by place with their prizes, newest week first, and says why a week had none", () => {
    const rows = buildRankedWeekHistory({
      placePrizes: LADDER,
      winners: [
        { cycleStart: WEEK1, place: 2, winnerUsername: "Kuch", pointsEarned: 140, prizeRedeemedAt: null },
        { cycleStart: WEEK1, place: 1, winnerUsername: "Snooker", pointsEarned: 410, prizeRedeemedAt: "2026-10-09T01:00:00Z" },
      ],
      settlements: [
        { cycleStart: WEEK1, outcome: "awarded", participantCount: 4, minPlayers: null },
        { cycleStart: WEEK2, outcome: "below_minimum", participantCount: 2, minPlayers: 4 },
        { cycleStart: WEEK3, outcome: "no_scorers", participantCount: 1, minPlayers: null },
      ],
    });
    expect(rows.map((row) => row.cycleStart)).toEqual([WEEK3, WEEK2, WEEK1]);
    expect(rows[0]).toMatchObject({ outcome: "no_scorers", winners: [], note: "Nobody scored this week." });
    expect(rows[1]).toMatchObject({ outcome: "below_minimum", winners: [], note: "Only 2 players — the minimum was 4." });
    expect(rows[2].winners).toEqual([
      { place: 1, username: "Snooker", points: 410, prize: "$30.00 gift card", redeemedAt: "2026-10-09T01:00:00Z" },
      { place: 2, username: "Kuch", points: 140, prize: "$20.00 gift card", redeemedAt: null },
    ]);
  });

  it("a deleted player keeps their slot and a legacy row without a place is ignored", () => {
    const rows = buildRankedWeekHistory({
      placePrizes: LADDER,
      winners: [
        { cycleStart: WEEK1, place: 1, winnerUsername: null, pointsEarned: 50, prizeRedeemedAt: null },
        { cycleStart: WEEK1, place: null, winnerUsername: "Old", pointsEarned: 5, prizeRedeemedAt: null },
      ],
      settlements: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].winners).toEqual([{ place: 1, username: null, points: 50, prize: "$30.00 gift card", redeemedAt: null }]);
  });
});
