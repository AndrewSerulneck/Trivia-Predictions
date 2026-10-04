// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { RewardRow } from "@/components/owner/rewards/RewardRow";
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

  it("falls back to the terms sentence when the server sent no description", () => {
    const { container } = render(createElement(RewardRow, { competition: competition({}) }));
    expect(container.textContent).toContain("Live Trivia Challenge");
    expect((container.textContent ?? "").length).toBeGreaterThan("Live Trivia Challenge".length);
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
    const wallet = read("components/prizes/PrizeWalletPanel.tsx");
    expect(wallet.match(/Won from:/g)).toHaveLength(1);
    expect(wallet).toContain("win.winDescription ??");
    expect(wallet.match(/wonForLine\(win\)/g)).toHaveLength(5);
  });
});
