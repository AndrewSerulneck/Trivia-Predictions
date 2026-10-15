// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { RewardRow } from "@/components/owner/rewards/RewardRow";
import { RewardDetailScreen } from "@/components/owner/rewards/RewardStepScreens";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";

// Phase 3 of docs/reward-descriptions-plan.md: the server's `description` is what
// every surface prints, and "Awarded to the winner." survives only on legacy game-winner cards.

afterEach(cleanup);

const competition = (overrides: Partial<OwnerCompetition>): OwnerCompetition =>
  ({
    id: "c1",
    name: "Live Trivia Challenge",
    gameTypes: ["trivia"],
    challengeMode: "progress",
    isActive: true,
    winnerUserId: null,
    winnerQuota: 1,
    winCondition: "game_winner",
    recurringType: "weekly",
    rewardDefinitionId: "live_trivia_challenge",
    gameWinnerSlots: [{ scheduleId: "s1", weekday: "fri" }],
    progressPoints: 0,
    ...overrides,
  }) as unknown as OwnerCompetition;

describe("RewardRow", () => {
  it("shows the guest-facing summary and keeps the terms sentence (prizes per period)", () => {
    const { container } = render(
      createElement(RewardRow, {
        competition: competition({
          description: {
            summary: "Win Live Trivia on Friday night and win a $50 gift card.",
            when: null,
            fineprint: null,
            isCustom: false,
          },
        }),
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Win Live Trivia on Friday night and win a $50 gift card.");
    expect(text).toContain("Winner of your Friday Live Trivia game gets this reward — 1 per week.");
  });

  it("a tappable row (dashboard, Rewards sheet) says only 'Tap to see reward details'", () => {
    const onClick = vi.fn();
    const { container } = render(
      createElement(RewardRow, {
        onClick,
        competition: competition({
          description: { summary: "Win Live Trivia on Friday night.", when: null, fineprint: null, isCustom: false },
        }),
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Live Trivia Challenge");
    expect(text).toContain("Tap to see reward details");
    expect(text).not.toContain("Win Live Trivia on Friday night.");
    expect(text).not.toContain("1 per week");
  });

  it("falls back to the terms sentence when the server sent no description", () => {
    const { container } = render(createElement(RewardRow, { competition: competition({}) }));
    expect(container.textContent).toContain("Live Trivia Challenge");
    expect((container.textContent ?? "").length).toBeGreaterThan("Live Trivia Challenge".length);
  });
});

describe("RewardDetailScreen", () => {
  it("carries every rule the row no longer shows: what guests see, when, terms and fine print", () => {
    const { container } = render(
      createElement(RewardDetailScreen, {
        onEnd: () => {},
        reward: competition({
          winCondition: "ranked_places",
          gameWinnerSlots: null,
          winnerQuota: 3,
          pointsRequiredToWin: 0,
          placePrizes: null,
          description: {
            summary: "Finish top 3 in Live Trivia each week.",
            when: "Wednesday, Thursday and Friday nights",
            fineprint: "Ties go to whoever reached their score first.",
            isCustom: false,
          },
        }),
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Finish top 3 in Live Trivia each week.");
    expect(text).toContain("Wednesday, Thursday and Friday nights");
    expect(text).toContain("Ties go to whoever reached their score first.");
    expect(text).toContain("Top 3 players each week");
    expect(text).not.toContain("Progress");
  });
});

describe("guest surfaces", () => {
  const read = (path: string): string => readFileSync(path, "utf8");
  const venueSurfaces = [
    "components/venue/VenueChallengesPanel.tsx",
    "components/venue/VenueHubClient.tsx",
    "components/challenges/ChallengeRedeemPanel.tsx",
  ];

  it("prints 'Awarded to the winner.' only for legacy (isCustom) game-winner cards", () => {
    for (const path of venueSurfaces) {
      const src = read(path);
      expect(src.match(/Awarded to the winner\./g)).toHaveLength(1);
      expect(src).toMatch(/description\?\.isCustom !== false/);
    }
  });

  it("the admin edit form shows composed wording read-only for definition-based rewards", () => {
    const src = read("components/admin/sections/ChallengesSection.tsx");
    expect(src).toContain("Guests see this automatic description. Change the schedule, prize or target to change it.");
    expect(src).toMatch(/editedDescription && !editedDescription\.isCustom/);
    expect(src).toContain("rules: formRules.trim()");
  });

  it("each venue surface reads description with a rules fallback", () => {
    for (const path of venueSurfaces) expect(read(path)).toMatch(/description\?\.summary \?\? (\w+)\.rules/);
  });

  it("the NFL Pick 'Em banner shows the composed Line 1, not raw rules", () => {
    const banner = read("components/nfl-pickem/NFLPickEmRewardBanner.tsx");
    expect(banner).toContain("describeReward(campaign, new Date()).summary");
    expect(banner).not.toContain("{campaign.rules}");
  });

  it("the prize wallet has one 'Won from' fallback, behind winDescription", () => {
    // wonForLine moved to lib/prizeCardFace.ts (docs/prize-gift-card-redesign-plan.md Phase 3).
    const face = read("lib/prizeCardFace.ts");
    expect(face.match(/Won from:/g)).toHaveLength(1);
    expect(face).toContain("win.winDescription ??");
    const wallet = read("components/prizes/PrizeWalletPanel.tsx");
    expect(wallet).not.toContain("Won from:");
    // Phase 4: "what it was won for" is the For row on the back of every card (list and redeem
    // sheet), built once by prizeCardBack; the wallet no longer draws the line itself.
    expect(face).toMatch(/key: "for", label: "For", value: wonForLine\(win\)/);
    expect(wallet).not.toContain("wonForLine");
    expect(wallet.match(/prizeCardBack\(win\)/g)).toHaveLength(2);
  });
});
