import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 9a: the March Madness bracket Prize. The pure rules (brackets, the
// per-bracket cycle key, wording, Results placement) and the server's create path (createReward +
// resolveRewardCreationContext) with the engine and the tournaments read stubbed.

const mocks = vi.hoisted(() => ({
  createChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => ({ id: "prize-1", ...input })),
  listCurrentBracketTournaments: vi.fn(async (): Promise<{ ok: true; value: unknown[] } | { ok: false; error: string }> => ({
    ok: true,
    value: [],
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  createChallengeCampaign: mocks.createChallengeCampaign,
  computeUpcomingCycleStart: () => null,
  loadSquaresPrizeMoments: async () => new Map(),
  loadBracketPrizeKeys: async () => new Map(),
}));
vi.mock("@/lib/squaresStore", () => ({ getCurrentSquaresEvent: async () => ({ ok: true, value: null }) }));
vi.mock("@/lib/bracketsStore", () => ({ listCurrentBracketTournaments: mocks.listCurrentBracketTournaments }));

import {
  BRACKET_PRIZE_DEFINITION_ID,
  BRACKET_PRIZE_KEYS_MESSAGE,
  BRACKET_PRIZE_NO_SCORERS_NOTE,
  bracketPrizeCycleStart,
  bracketPrizeKeyOfCycle,
  describeBracketPrizeKeys,
  isBracketPrizeOffered,
  normalizeBracketPrizeKeys,
} from "@/lib/bracketPrizes";
import { describeBracketPrizeTerms } from "@/lib/bracketPrizeTerms";
import { rewardHowWonLabel } from "@/lib/ownerHistoryDisplay";
import { rewardTermsText, type OwnerCompetition } from "@/lib/ownerRewardDisplay";
import { describeReward, describeRewardWin } from "@/lib/rewardDescription";
import { getRewardDefinition, offeredRewardDefinitions } from "@/lib/rewardDefinitions";
import {
  REWARD_BRACKET_LOCKED_MESSAGE,
  REWARD_BRACKET_UNAVAILABLE_MESSAGE,
  REWARD_BRACKET_WIN_CONDITION_MESSAGE,
  RewardTermsError,
  createReward,
  resolveRewardCreationContext,
  type RewardPrizeInput,
} from "@/lib/rewards";
import { placeRewards, type PlacementCampaign } from "@/lib/results/rewardPlacement";
import { BRACKET_GAME_NAME } from "@/lib/venueGameCards";
import type { RewardPlacePrize } from "@/types";

const CREATED = "2027-03-14T22:10:37.123+00:00";
const GIFT30: RewardPrizeInput = { prizeKind: "gift_card", amount: 30 };
const GIFT20: RewardPrizeInput = { prizeKind: "gift_card", amount: 20 };
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
const LADDER: RewardPlacePrize[] = [gift(1, 30), gift(2, 20)];

const tournament = (overrides: Record<string, unknown> = {}) => ({
  id: "t-men",
  gender: "men",
  purpose: "live",
  mainLockAt: "2027-03-18T16:15:00Z",
  secondLockAt: null,
  completedAt: null,
  ...overrides,
});

beforeEach(() => {
  mocks.createChallengeCampaign.mockClear();
  mocks.listCurrentBracketTournaments.mockReset();
  mocks.listCurrentBracketTournaments.mockResolvedValue({ ok: true, value: [] });
  vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("brackets", () => {
  it("normalizes to known brackets in order, each once", () => {
    expect(normalizeBracketPrizeKeys(["women_second", "men_main", "men_main"])).toEqual(["men_main", "women_second"]);
    expect(normalizeBracketPrizeKeys([])).toBeNull();
    expect(normalizeBracketPrizeKeys(["men_final"])).toBeNull();
    expect(normalizeBracketPrizeKeys("men_main")).toBeNull();
  });

  it("reads them as a sentence", () => {
    expect(describeBracketPrizeKeys(["men_main"])).toBe("the men's bracket");
    expect(describeBracketPrizeKeys(["women_main", "men_main"])).toBe("the men's bracket or the women's bracket");
    expect(describeBracketPrizeKeys(["men_main", "women_main", "men_second"], "and")).toBe(
      "the men's bracket, the women's bracket and the men's second chance",
    );
  });
});

describe("the per-bracket prize cycle key", () => {
  it("is the tournament row's creation minute + the bracket in seconds, and reads back", () => {
    const men = bracketPrizeCycleStart(CREATED, "men_main");
    const womenSecond = bracketPrizeCycleStart(CREATED, "women_second");
    expect(men?.toISOString()).toBe("2027-03-14T22:10:01.000Z");
    expect(womenSecond?.toISOString()).toBe("2027-03-14T22:10:04.000Z");
    expect(bracketPrizeKeyOfCycle("2027-03-14 22:10:01+00")).toBe("men_main");
    expect(bracketPrizeKeyOfCycle(womenSecond?.toISOString())).toBe("women_second");
    expect(bracketPrizeKeyOfCycle("2027-03-14T22:10:00Z")).toBeNull();
    expect(bracketPrizeCycleStart("not a date", "men_main")).toBeNull();
  });
});

describe("when the prize is offered", () => {
  it("only with the flag on and until the bracket card window closes (Eastern)", () => {
    expect(isBracketPrizeOffered(new Date("2027-04-07T03:59:00Z"))).toBe(true); // Apr 6, 11:59 PM ET
    expect(isBracketPrizeOffered(new Date("2027-04-07T04:00:00Z"))).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    expect(isBracketPrizeOffered(new Date("2027-03-01T12:00:00Z"))).toBe(false);
  });

  it("hides the tile out of season, but every prize can still describe itself", () => {
    expect(offeredRewardDefinitions(new Date("2027-03-01T12:00:00Z")).map((d) => d.id)).toContain(BRACKET_PRIZE_DEFINITION_ID);
    expect(offeredRewardDefinitions(new Date("2027-05-01T12:00:00Z")).map((d) => d.id)).not.toContain(BRACKET_PRIZE_DEFINITION_ID);
    expect(getRewardDefinition(BRACKET_PRIZE_DEFINITION_ID)?.name).toBe(`${BRACKET_GAME_NAME} Challenge`);
  });
});

describe("guest and partner wording", () => {
  const base = {
    rules: "stored words",
    recurringType: "none" as const,
    activeDays: [],
    winnerQuota: 4,
    pointsRequiredToWin: 1,
    winCondition: "ranked_places" as const,
    rewardDefinitionId: BRACKET_PRIZE_DEFINITION_ID,
    placePrizes: LADDER,
  };

  it("names the brackets, the places and the ladder", () => {
    const description = describeReward({ ...base, bracketKeys: ["men_main", "women_main"], minPlayers: 4 }, new Date());
    expect(description.summary).toBe(
      "Finish top 2 in the men's bracket or the women's bracket. 1st place wins a $30 gift card and 2nd place wins a $20 gift card.",
    );
    expect(description.when).toContain("Winners are named after the championship game.");
    expect(description.fineprint).toContain("Each bracket pays its own places.");
    expect(description.fineprint).toContain("At least 4 players need to fill out that bracket");
    expect(description.isCustom).toBe(false);
  });

  it("falls back to the stored wording when the brackets couldn't be read", () => {
    expect(describeReward({ ...base, bracketKeys: null }, new Date())).toMatchObject({ summary: "stored words", isCustom: true });
  });

  it("says which bracket and place a coupon was won for, from its cycle key and place", () => {
    const cycleStart = bracketPrizeCycleStart(CREATED, "women_main")?.toISOString() ?? null;
    expect(describeRewardWin(base, { cycleStart, timezone: null, place: 2 })).toBe("You finished 2nd in your women's bracket");
    expect(describeRewardWin(base, { cycleStart, timezone: null, place: null })).toBeNull();
  });

  it("restates the partner's terms by bracket — never a week", () => {
    const competition = { ...base, id: "p", name: "x", bracketKeys: ["men_main"], minPlayers: 3 } as unknown as OwnerCompetition;
    expect(rewardTermsText(competition)).toBe(
      "Top 2 in the men's bracket. 1st place wins a $30 gift card and 2nd place wins a $20 gift card. At least 3 players need to fill out that bracket.",
    );
    expect(describeBracketPrizeTerms(["men_main", "women_main"], LADDER.slice(0, 1), null)).toBe(
      "Winner in the men's bracket and the women's bracket, each paid separately. The winner gets a $30 gift card.",
    );
    expect(rewardHowWonLabel({ winCondition: "ranked_places", rewardDefinitionId: BRACKET_PRIZE_DEFINITION_ID, pointsRequiredToWin: 1, placeCount: 3 })).toBe(
      "Top 3 brackets",
    );
  });
});

describe("Results placement", () => {
  const campaign: PlacementCampaign = {
    id: "prize-1",
    name: `${BRACKET_GAME_NAME} Challenge`,
    winCondition: "ranked_places",
    rewardDefinitionId: BRACKET_PRIZE_DEFINITION_ID,
    recurringType: "none",
    scheduleType: "single_day",
    activeDays: [],
    pointsRequiredToWin: 1,
    placePrizes: LADDER,
    winnerQuota: 4,
    gameWinnerSlots: null,
  };
  const men = bracketPrizeCycleStart(CREATED, "men_main")?.toISOString() ?? "";
  const women = bracketPrizeCycleStart(CREATED, "women_main")?.toISOString() ?? "";

  it("is a week row in the week it was settled, labelled with the bracket; a bracket nobody scored says so", () => {
    const items = placeRewards({
      ledger: [
        { challengeId: "prize-1", cycleStart: men, finalizedAt: "2027-04-06T03:30:00Z", place: 1, username: "ann", points: 1920 },
        { challengeId: "prize-1", cycleStart: men, finalizedAt: "2027-04-06T03:30:00Z", place: 2, username: "bob", points: 900 },
      ],
      settlements: [
        { challengeId: "prize-1", cycleStart: men, outcome: "awarded", participantCount: 2, minPlayers: null, settledAt: "2027-04-06T03:30:00Z" },
        { challengeId: "prize-1", cycleStart: women, outcome: "no_scorers", participantCount: 0, minPlayers: null, settledAt: "2027-04-05T03:00:00Z" },
      ],
      campaigns: [campaign],
      venueTimeZone: "America/New_York",
      games: [],
      currentYear: 2027,
    });
    const menItem = items.find((item) => item.cycleStart === men);
    const womenItem = items.find((item) => item.cycleStart === women);
    expect(menItem).toMatchObject({ date: "2027-04-05", attach: { kind: "week", weekStart: "2027-04-05" }, cycleLabel: "Men's bracket" });
    expect(menItem?.winners.map((winner) => winner.username)).toEqual(["ann", "bob"]);
    expect(menItem?.howWon).toBe("Top 2 brackets");
    expect(womenItem).toMatchObject({ date: "2027-04-04", attach: { kind: "week", weekStart: "2027-03-29" }, note: BRACKET_PRIZE_NO_SCORERS_NOTE });
  });
});

describe("createReward — March Madness", () => {
  const params = (overrides: Record<string, unknown> = {}) => ({
    venueId: "v1",
    definitionId: BRACKET_PRIZE_DEFINITION_ID,
    cadence: "none" as const,
    winCondition: "ranked_places" as const,
    threshold: 1,
    winnerQuota: 4,
    prize: GIFT30,
    placePrizes: [GIFT30, GIFT20],
    bracketKeys: ["men_main", "women_main"] as Array<"men_main" | "women_main">,
    ...overrides,
  });

  it("expands to a one-off places prize: brackets × places coupons, closing with the bracket window", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2027-03-15T12:00:00Z") });
    mocks.listCurrentBracketTournaments.mockResolvedValue({ ok: true, value: [tournament()] });
    await createReward({ ...params(), minPlayers: 4 });
    const input = mocks.createChallengeCampaign.mock.calls[0][0];
    expect(input).toMatchObject({
      winCondition: "ranked_places",
      gameTypes: ["bracket"],
      recurringType: "none",
      activeDays: [],
      winnerQuota: 4,
      endDate: "2027-04-06",
      pointsRequiredToWin: 1,
      minPlayers: 4,
      bracketKeys: ["men_main", "women_main"],
      prizeKind: null,
      rewardDefinitionId: BRACKET_PRIZE_DEFINITION_ID,
    });
    expect((input.placePrizes as RewardPlacePrize[]).map((prize) => prize.prizeGiftCertificateAmount)).toEqual([30, 20]);
  });

  it("refuses what a bracket prize can't have — never silently changes it", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2027-03-15T12:00:00Z") });
    await expect(createReward(params({ winCondition: "game_winner" }))).rejects.toThrow(REWARD_BRACKET_WIN_CONDITION_MESSAGE);
    await expect(createReward(params({ bracketKeys: [] }))).rejects.toThrow(BRACKET_PRIZE_KEYS_MESSAGE);
    await expect(createReward(params({ bracketKeys: [] }))).rejects.toBeInstanceOf(RewardTermsError);
    await expect(createReward(params({ placePrizes: [] }))).rejects.toBeInstanceOf(RewardTermsError);
    await expect(createReward(params({ minPlayers: 1 }))).rejects.toBeInstanceOf(RewardTermsError);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("refuses a bracket that has locked (a 409 state), and greys it out in the wizard's context", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2027-03-19T12:00:00Z") }); // men's main locked Mar 18
    mocks.listCurrentBracketTournaments.mockResolvedValue({
      ok: true,
      value: [tournament(), tournament({ id: "t-women", gender: "women", mainLockAt: "2027-03-19T16:00:00Z" })],
    });
    const context = await resolveRewardCreationContext("v1", BRACKET_PRIZE_DEFINITION_ID);
    expect(context.scheduled).toBe(true);
    expect(context.bracket?.brackets.map((b) => [b.key, b.locked])).toEqual([
      ["men_main", true],
      ["women_main", false],
      ["men_second", false],
      ["women_second", false],
    ]);
    await expect(createReward(params())).rejects.toThrow(REWARD_BRACKET_LOCKED_MESSAGE);
    await createReward(params({ bracketKeys: ["women_main", "men_second"] }));
    expect(mocks.createChallengeCampaign).toHaveBeenCalledTimes(1);
  });

  it("is unavailable out of season, with the flag off, or when the tournaments can't be read (fail closed)", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2027-04-08T12:00:00Z") });
    await expect(createReward(params())).rejects.toThrow(REWARD_BRACKET_UNAVAILABLE_MESSAGE);
    vi.setSystemTime(new Date("2027-03-15T12:00:00Z"));
    mocks.listCurrentBracketTournaments.mockResolvedValue({ ok: false, error: "timeout" });
    await expect(createReward(params())).rejects.toThrow(REWARD_BRACKET_UNAVAILABLE_MESSAGE);
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    expect((await resolveRewardCreationContext("v1", BRACKET_PRIZE_DEFINITION_ID)).scheduled).toBe(false);
  });
});
