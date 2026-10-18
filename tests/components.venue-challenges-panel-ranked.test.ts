// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { VenueChallengesPanel } from "@/components/venue/VenueChallengesPanel";
import type { ChallengeCampaignCard } from "@/components/venue/venueHubShared";
import type { RankedPlaceCardState } from "@/lib/rankedPlaceCard";
import type { RewardPlacePrize } from "@/types";

// Phase 4 of docs/live-trivia-weekly-places-reward-plan.md: the venue Rewards card for a weekly
// places reward — headline, standing, and every state the week can be in.

afterEach(cleanup);

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

const live: RankedPlaceCardState = {
  weekStart: "2026-10-07T04:00:00.000Z",
  phase: "live",
  placeCount: 3,
  minPlayers: null,
  participantCount: 4,
  gamesLeft: 1,
  lastGameDay: "Friday",
  viewer: { rank: 2, points: 140 },
  outcome: null,
  settledMinPlayers: null,
  winners: [],
  viewerPlace: null,
};

const card = (overrides: Partial<ChallengeCampaignCard> = {}): ChallengeCampaignCard => ({
  id: "camp-1",
  name: "Weekly Trivia Champions",
  rules: "",
  winCondition: "ranked_places",
  pointsRequiredToWin: 1,
  progressPoints: 0,
  isActive: true,
  winnerQuota: 3,
  quotaRemaining: 3,
  viewerWon: false,
  winnerUsernames: [],
  rewardDefinitionId: "live_trivia_challenge",
  placePrizes: [gift(1, 30), gift(2, 20), gift(3, 10)],
  description: {
    summary: "Finish top 3 in Live Trivia across Wednesday, Thursday and Friday nights each week.",
    when: null,
    fineprint: null,
    isCustom: false,
  },
  rankedPlaces: live,
  ...overrides,
});

const renderPanel = (cards: ChallengeCampaignCard[], onSelect = vi.fn(), onRedeem = vi.fn()) =>
  render(
    createElement(VenueChallengesPanel, {
      contentReady: true,
      isChallengesLoading: false,
      challengeCards: cards,
      currentUserId: "user-1",
      pendingChallengeRedeemId: null,
      challengesError: "",
      hasLoadedChallenges: true,
      onSelectChallenge: onSelect,
      onGoToChallengeRedeem: onRedeem,
      onRetryChallenges: vi.fn(),
    }),
  );

describe("weekly places card", () => {
  it("(guard) a points-target card does print the gauge text the other tests look for", () => {
    const { container } = renderPanel([
      card({ winCondition: "points_threshold", rankedPlaces: null, placePrizes: null, pointsRequiredToWin: 100, progressPoints: 40 }),
    ]);
    expect(container.textContent).toMatch(/40\s*\/\s*100\s*pts/);
  });

  it("live: ladder headline, the viewer's standing, the deciding game, In Progress — and no gauge", () => {
    const { container } = renderPanel([card()]);
    expect(screen.getByText("Weekly prizes for the top 3")).not.toBeNull();
    expect(screen.getByText("You're 2nd with 140 pts this week.")).not.toBeNull();
    expect(screen.getByText("Friday's game decides it.")).not.toBeNull();
    expect(screen.getByText("In Progress")).not.toBeNull();
    // The points gauge prints "<progress> / <target> pts".
    expect(container.textContent).not.toMatch(/\/\s*\d+\s*pts/);
  });

  it("a single-place reward's headline is that prize", () => {
    renderPanel([card({ placePrizes: [gift(1, 30)] })]);
    expect(screen.getByText("$30.00 gift card")).not.toBeNull();
  });

  it("shows the minimum players line when the partner set one", () => {
    renderPanel([card({ minPlayers: 4, rankedPlaces: { ...live, minPlayers: 4, participantCount: 3 } })]);
    expect(screen.getByText("Needs at least 4 players this week — 3 so far.")).not.toBeNull();
  });

  it("settled and not won: Week Complete, the winners, and still openable for the rules (next week)", () => {
    const onSelect = vi.fn();
    renderPanel(
      [
        card({
          // All three places paid: for any other reward this is "All Claimed" and the card goes dead.
          quotaRemaining: 0,
          rankedPlaces: {
            ...live,
            phase: "settled",
            outcome: "awarded",
            gamesLeft: 0,
            viewer: null,
            winners: [{ place: 1, username: "Snooker" }, { place: 2, username: "Kuch" }, { place: 3, username: "fast76" }],
          },
        }),
      ],
      onSelect,
    );
    expect(screen.getByText("Week Complete")).not.toBeNull();
    expect(screen.queryByText("All Claimed")).toBeNull();
    expect(screen.getByText("This week's winners: 1st Snooker, 2nd Kuch, 3rd fast76.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("camp-1");
  });

  it("settled and won: You Won, the claim prompt, the place, and a tap goes to Redeem Prizes", () => {
    const onRedeem = vi.fn();
    renderPanel(
      [
        card({
          viewerWon: true,
          quotaRemaining: 1,
          rankedPlaces: { ...live, phase: "settled", outcome: "awarded", gamesLeft: 0, viewer: null, viewerPlace: 2, winners: [{ place: 2, username: "Kuch" }] },
        }),
      ],
      vi.fn(),
      onRedeem,
    );
    expect(screen.getByText("You Won")).not.toBeNull();
    expect(screen.getByText("Prize won! Tap to claim it.")).not.toBeNull();
    expect(screen.getByText("You finished 2nd. Your prize is in Redeem Prizes.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(onRedeem).toHaveBeenCalledWith("camp-1", expect.anything());
  });

  it("settled below the minimum, and a week nobody scored", () => {
    renderPanel([
      card({
        id: "a",
        rankedPlaces: { ...live, phase: "settled", outcome: "below_minimum", participantCount: 2, settledMinPlayers: 4, minPlayers: 4, viewer: null },
      }),
      card({ id: "b", rankedPlaces: { ...live, phase: "settled", outcome: "no_scorers", viewer: null } }),
    ]);
    expect(screen.getByText("Not enough players this week — 2 played, 4 needed. No prizes were awarded.")).not.toBeNull();
    expect(screen.getByText("Nobody scored this week, so no prizes were awarded.")).not.toBeNull();
  });

  it("a reward that starts next week reads Upcoming", () => {
    renderPanel([card({ rankedPlaces: { ...live, phase: "not_live", viewer: null } })]);
    expect(screen.getByText("Upcoming")).not.toBeNull();
    expect(screen.getByText("Starts with next week's games.")).not.toBeNull();
  });

  it("when the standing couldn't be built the card shows the description alone, never a gauge", () => {
    const { container } = renderPanel([card({ rankedPlaces: null })]);
    expect(screen.getByText("Finish top 3 in Live Trivia across Wednesday, Thursday and Friday nights each week.")).not.toBeNull();
    expect(screen.queryByText(/You're/)).toBeNull();
    expect(container.textContent).not.toMatch(/\/\s*\d+\s*pts/);
  });
});
