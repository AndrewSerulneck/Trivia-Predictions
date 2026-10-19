import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 4: the Super Bowl Squares Prize. The pure rules (moments, the
// per-moment cycle key, wording, Results placement) and the server's create path (createReward +
// resolveRewardCreationContext) with the engine and the event read stubbed.

const mocks = vi.hoisted(() => ({
  createChallengeCampaign: vi.fn(async (input: Record<string, unknown>) => ({ id: "prize-1", ...input })),
  getCurrentSquaresEvent: vi.fn(async (): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> => ({
    ok: true,
    value: null,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/challengeCampaigns", () => ({
  createChallengeCampaign: mocks.createChallengeCampaign,
  computeUpcomingCycleStart: () => null,
  loadSquaresPrizeMoments: async () => new Map(),
}));
vi.mock("@/lib/squaresStore", () => ({ getCurrentSquaresEvent: mocks.getCurrentSquaresEvent }));

import { rewardHowWonLabel } from "@/lib/ownerHistoryDisplay";
import { rewardTermsText, type OwnerCompetition } from "@/lib/ownerRewardDisplay";
import { describeReward, describeRewardWin } from "@/lib/rewardDescription";
import { getRewardDefinition, offeredRewardDefinitions } from "@/lib/rewardDefinitions";
import {
  REWARD_MIN_PLAYERS_UNSUPPORTED_MESSAGE,
  REWARD_SQUARES_UNAVAILABLE_MESSAGE,
  REWARD_SQUARES_WIN_CONDITION_MESSAGE,
  RewardTermsError,
  createReward,
  resolveRewardCreationContext,
  type RewardPrizeInput,
} from "@/lib/rewards";
import { placeRewards, type PlacementCampaign } from "@/lib/results/rewardPlacement";
import type { ResultsGameRow } from "@/lib/results/types";
import {
  SQUARES_PRIZE_DEFINITION_ID,
  SQUARES_PRIZE_MOMENTS_MESSAGE,
  describeSquaresPrizeMoments,
  describeSquaresPrizeTerms,
  isSquaresPrizeOffered,
  normalizeSquaresMoments,
  squaresPrizeCycleStart,
  squaresPrizeMomentOf,
} from "@/lib/squaresPrizes";
import { SQUARES_GAME_NAME } from "@/lib/venueGameCards";
import type { ChallengeWinCondition } from "@/types";

const KICKOFF = "2027-02-14T23:30:00+00:00";
const GIFT: RewardPrizeInput = { prizeKind: "gift_card", amount: 25 };

const squaresEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "00000000-0000-0000-0000-0000000000e1",
  kickoffAt: KICKOFF,
  lockAt: "2027-02-14T23:00:00+00:00",
  drawnAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
  mocks.createChallengeCampaign.mockClear();
  mocks.getCurrentSquaresEvent.mockReset().mockResolvedValue({ ok: true, value: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("moments", () => {
  it("normalizes to known moments in game order, each once", () => {
    expect(normalizeSquaresMoments(["final", "q1", "final"])).toEqual(["q1", "final"]);
    expect(normalizeSquaresMoments(["half"])).toEqual(["half"]);
    expect(normalizeSquaresMoments([])).toBeNull();
    expect(normalizeSquaresMoments(["q5"])).toBeNull();
    expect(normalizeSquaresMoments(["q1", "ot"])).toBeNull();
    expect(normalizeSquaresMoments("q1")).toBeNull();
    expect(normalizeSquaresMoments(null)).toBeNull();
  });

  it("reads them as a sentence", () => {
    expect(describeSquaresPrizeMoments(["half"])).toBe("halftime");
    expect(describeSquaresPrizeMoments(["half", "final"])).toBe("halftime or the end of the game");
    expect(describeSquaresPrizeMoments(["q1", "half", "q3", "final"], "and")).toBe(
      "the end of the first quarter, halftime, the end of the third quarter and the end of the game",
    );
  });
});

describe("the per-moment prize cycle key", () => {
  it("is the kickoff minute + the moment in seconds + the grade in milliseconds", () => {
    expect(squaresPrizeCycleStart(KICKOFF, "q1", 1)?.toISOString()).toBe("2027-02-14T23:30:01.001Z");
    expect(squaresPrizeCycleStart(KICKOFF, "final", 1)?.toISOString()).toBe("2027-02-14T23:30:04.001Z");
    expect(squaresPrizeCycleStart(KICKOFF, "half", 2)?.toISOString()).toBe("2027-02-14T23:30:02.002Z");
    // A kickoff off the minute still keys on the minute.
    expect(squaresPrizeCycleStart("2027-02-14T23:30:27.500Z", "q3", 1)?.toISOString()).toBe("2027-02-14T23:30:03.001Z");
    expect(squaresPrizeCycleStart("not a date", "q1", 1)).toBeNull();
  });

  it("gives every moment and every re-grade its own cycle", () => {
    const keys = new Set(
      (["q1", "half", "q3", "final"] as const).flatMap((moment) =>
        [1, 2, 3].map((grade) => squaresPrizeCycleStart(KICKOFF, moment, grade)?.getTime()),
      ),
    );
    expect(keys.size).toBe(12);
  });

  it("reads the moment back from the key alone, however the database prints it", () => {
    for (const moment of ["q1", "half", "q3", "final"] as const) {
      const iso = squaresPrizeCycleStart(KICKOFF, moment, 2)!.toISOString();
      expect(squaresPrizeMomentOf(iso)).toBe(moment);
      expect(squaresPrizeMomentOf(iso.replace("Z", "+00:00").replace(".002", ".002000"))).toBe(moment);
    }
    expect(squaresPrizeMomentOf("1970-01-01T00:00:00Z")).toBeNull();
    expect(squaresPrizeMomentOf("2027-02-14T23:30:00Z")).toBeNull();
    expect(squaresPrizeMomentOf(null)).toBeNull();
  });
});

describe("when the prize is offered", () => {
  it("only with the flag on and until the Squares card window closes (Eastern)", () => {
    expect(isSquaresPrizeOffered(new Date("2026-10-19T12:00:00Z"))).toBe(true);
    expect(isSquaresPrizeOffered(new Date("2027-02-16T04:59:00Z"))).toBe(true); // 11:59 PM Feb 15 ET
    expect(isSquaresPrizeOffered(new Date("2027-02-16T05:00:00Z"))).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    expect(isSquaresPrizeOffered(new Date("2026-10-19T12:00:00Z"))).toBe(false);
  });

  it("hides the tile out of season, but every prize can still describe itself", () => {
    const ids = (now: string) => offeredRewardDefinitions(new Date(now)).map((d) => d.id);
    expect(ids("2026-10-19T12:00:00Z")).toContain(SQUARES_PRIZE_DEFINITION_ID);
    expect(ids("2027-03-01T12:00:00Z")).not.toContain(SQUARES_PRIZE_DEFINITION_ID);
    expect(ids("2027-03-01T12:00:00Z")).toEqual(["live_trivia_challenge", "nfl_pickem_challenge"]);
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    expect(ids("2026-10-19T12:00:00Z")).not.toContain(SQUARES_PRIZE_DEFINITION_ID);
    expect(getRewardDefinition(SQUARES_PRIZE_DEFINITION_ID)?.gameType).toBe("squares");
  });
});

describe("guest wording", () => {
  const input = (moments: Array<"q1" | "half" | "q3" | "final"> | null) => ({
    rules: "stored rules",
    recurringType: "none" as const,
    activeDays: [],
    winnerQuota: moments?.length ?? 1,
    pointsRequiredToWin: 1,
    winCondition: "game_winner" as const,
    rewardDefinitionId: SQUARES_PRIZE_DEFINITION_ID,
    squaresMoments: moments,
    prizeKind: "gift_card" as const,
    prizeGiftCertificateAmount: 25,
  });

  it("names the moments and the prize", () => {
    const one = describeReward(input(["final"]), new Date());
    expect(one.summary).toBe("Hold the winning Super Bowl square at the end of the game and win a $25 gift card.");
    expect(one.when).toBe(`Claim up to 2 squares in ${SQUARES_GAME_NAME}. The numbers are drawn 30 minutes before kickoff.`);
    expect(one.fineprint).toBe("One winner. If nobody holds the winning square, nobody wins.");
    expect(one.isCustom).toBe(false);
    const two = describeReward(input(["half", "final"]), new Date());
    expect(two.summary).toContain("at halftime or the end of the game");
    expect(two.fineprint).toBe("One winner at each of those 2 moments. If nobody holds a winning square, nobody wins that one.");
    expect(`${two.summary} ${two.when} ${two.fineprint}`).not.toMatch(/reward/i);
  });

  it("falls back to the stored wording when the moments couldn't be read", () => {
    expect(describeReward(input(null), new Date())).toEqual({ summary: "stored rules", when: null, fineprint: null, isCustom: true });
  });

  it("says which moment a coupon was won at, from its cycle key", () => {
    const won = (cycleStart: string | null) => describeRewardWin(input(["q1", "final"]), { cycleStart });
    expect(won(squaresPrizeCycleStart(KICKOFF, "half", 1)!.toISOString())).toBe("You held the winning Super Bowl square at halftime");
    expect(won(squaresPrizeCycleStart(KICKOFF, "final", 3)!.toISOString())).toBe(
      "You held the winning Super Bowl square at the end of the game",
    );
    expect(won(null)).toBeNull();
  });

  it("restates the partner's terms by moment — never a period, a minimum or Live Trivia", () => {
    expect(describeSquaresPrizeTerms(["half", "final"], 2)).toBe("One prize at halftime and the end of the game, up to 2 in all.");
    expect(describeSquaresPrizeTerms(["final"], 1)).toBe("One prize at the end of the game.");
    expect(describeSquaresPrizeTerms(null, 3)).toBe("One prize at each of 3 moments of the game.");
    const competition = {
      rewardDefinitionId: SQUARES_PRIZE_DEFINITION_ID,
      winCondition: "game_winner",
      recurringType: "none",
      winnerQuota: 2,
      gameWinnerSlots: null,
      minPlayers: null,
      squaresMoments: ["q1", "q3"],
    } as unknown as OwnerCompetition;
    expect(rewardTermsText(competition)).toBe("One prize at the end of the first quarter and the end of the third quarter, up to 2 in all.");
    expect(rewardTermsText({ ...competition, squaresMoments: undefined })).not.toMatch(/Live Trivia/);
  });

  it("labels how it's won for the partner", () => {
    expect(rewardHowWonLabel({ winCondition: "game_winner", rewardDefinitionId: SQUARES_PRIZE_DEFINITION_ID, pointsRequiredToWin: 1 })).toBe(
      "Winning square",
    );
  });
});

describe("Results placement", () => {
  const squaresPrize: PlacementCampaign = {
    id: "sq",
    name: `${SQUARES_GAME_NAME} Challenge`,
    winCondition: "game_winner",
    rewardDefinitionId: SQUARES_PRIZE_DEFINITION_ID,
    recurringType: "none",
    scheduleType: "single_day",
    activeDays: [],
    endDay: undefined,
    endTime: undefined,
    pointsRequiredToWin: 1,
    placePrizes: null,
    winnerQuota: 2,
    gameWinnerSlots: null,
  };
  const squaresGame: ResultsGameRow = {
    competitionId: "squares",
    gameKey: "event-1",
    date: "2027-02-14",
    startsAt: "2027-02-14T23:30:00.000Z",
    title: "Patriots vs Seahawks",
    playerCount: 40,
    inProgress: false,
    winners: ["ann"],
    topScore: 75,
  };
  const ledger = (moment: "q1" | "half" | "q3" | "final", username: string) => ({
    challengeId: "sq",
    cycleStart: squaresPrizeCycleStart(KICKOFF, moment, 1)!.toISOString(),
    finalizedAt: "2027-02-15T02:00:00Z",
    place: null,
    username,
    points: moment === "final" ? 50 : 25,
  });

  it("puts each moment's prize on that season's Squares game card, labelled with the moment", () => {
    const items = placeRewards({
      ledger: [ledger("half", "ann"), ledger("final", "bob")],
      settlements: [],
      campaigns: [squaresPrize],
      venueTimeZone: "America/Los_Angeles",
      games: [{ ...squaresGame, competitionId: "live_trivia", gameKey: "trivia" }, squaresGame],
      currentYear: 2027,
    });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.attach).toEqual({ kind: "game", competitionId: "squares", gameKey: "event-1" });
      expect(item.date).toBe("2027-02-14");
      expect(item.howWon).toBe("Winning square");
    }
    expect(items.map((item) => [item.cycleLabel, item.winners[0]?.username])).toEqual([
      ["Final", "bob"],
      ["Halftime", "ann"],
    ]);
  });

  it("is a day row on the game's date when the card isn't on the page", () => {
    const [item] = placeRewards({
      ledger: [ledger("q1", "ann")],
      settlements: [],
      campaigns: [squaresPrize],
      venueTimeZone: "America/New_York",
      games: [],
      currentYear: 2027,
    });
    expect(item.attach).toEqual({ kind: "day", date: "2027-02-14" });
    expect(item.cycleLabel).toBe("End of Q1");
  });
});

describe("createReward — Super Bowl Squares", () => {
  const create = (overrides: Record<string, unknown> = {}) =>
    createReward({
      venueId: "venue-1",
      definitionId: SQUARES_PRIZE_DEFINITION_ID,
      cadence: "none",
      winCondition: "game_winner",
      threshold: 0,
      winnerQuota: 99,
      prize: GIFT,
      squaresMoments: ["final", "half"],
      createdByOwnerId: "owner-1",
      ...overrides,
    });

  it("expands to a one-off game-winner prize: one coupon per moment, closing with the Squares window", async () => {
    await create();
    expect(mocks.createChallengeCampaign).toHaveBeenCalledTimes(1);
    const input = mocks.createChallengeCampaign.mock.calls[0][0];
    expect(input).toMatchObject({
      name: `${SQUARES_GAME_NAME} Challenge`,
      winCondition: "game_winner",
      venueIds: ["venue-1"],
      gameTypes: ["squares"],
      challengeMode: "progress",
      pointsRequiredToWin: 1,
      scheduleType: "single_day",
      recurringType: "none",
      activeDays: [],
      winnerQuota: 2,
      endDate: "2027-02-15",
      gameWinnerSlots: null,
      nflWeekScope: null,
      rewardDefinitionId: SQUARES_PRIZE_DEFINITION_ID,
      prizeKind: "gift_card",
      prizeGiftCertificateAmount: 25,
      placePrizes: null,
      minPlayers: null,
      squaresMoments: ["half", "final"],
      createdByOwnerId: "owner-1",
    });
    expect(input.rules).toBe("Hold the winning Super Bowl square at halftime or the end of the game and win a $25 gift card.");
  });

  it("refuses what a Squares prize can't have — never silently changes it", async () => {
    const refused = async (overrides: Record<string, unknown>, message: string) => {
      const error = await create(overrides).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RewardTermsError);
      expect((error as Error).message).toBe(message);
    };
    for (const winCondition of ["points_threshold", "ranked_places"] as ChallengeWinCondition[]) {
      await refused({ winCondition }, REWARD_SQUARES_WIN_CONDITION_MESSAGE);
    }
    await refused({ minPlayers: 3 }, REWARD_MIN_PLAYERS_UNSUPPORTED_MESSAGE);
    await refused({ squaresMoments: [] }, SQUARES_PRIZE_MOMENTS_MESSAGE);
    await refused({ squaresMoments: ["q5"] }, SQUARES_PRIZE_MOMENTS_MESSAGE);
    await refused({ squaresMoments: undefined }, SQUARES_PRIZE_MOMENTS_MESSAGE);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("is open before the matchup is known and until the lock, then closed (a 409 state, not bad input)", async () => {
    const context = () => resolveRewardCreationContext("venue-1", SQUARES_PRIZE_DEFINITION_ID);
    vi.useFakeTimers({ toFake: ["Date"] });

    vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
    expect(await context()).toMatchObject({ scheduled: true, allowedCadences: ["none"], squares: { lockAt: null }, gameSlots: [] });

    mocks.getCurrentSquaresEvent.mockResolvedValue({ ok: true, value: squaresEvent() });
    vi.setSystemTime(new Date("2027-02-14T22:59:00Z"));
    expect(await context()).toMatchObject({ scheduled: true, squares: { lockAt: "2027-02-14T23:00:00.000Z" } });

    vi.setSystemTime(new Date("2027-02-14T23:00:00Z"));
    expect(await context()).toMatchObject({ scheduled: false, allowedCadences: [], squares: null });
    const error = await create().catch((e: unknown) => e);
    expect((error as Error).message).toBe(REWARD_SQUARES_UNAVAILABLE_MESSAGE);
    expect(error).not.toBeInstanceOf(RewardTermsError);

    // Drawn early by an admin's lock move: closed too.
    mocks.getCurrentSquaresEvent.mockResolvedValue({ ok: true, value: squaresEvent({ drawnAt: "2027-02-14T22:00:00Z" }) });
    vi.setSystemTime(new Date("2027-02-14T22:30:00Z"));
    expect((await context()).scheduled).toBe(false);

    // An unreadable event fails closed.
    mocks.getCurrentSquaresEvent.mockResolvedValue({ ok: false, error: "boom" });
    expect((await context()).scheduled).toBe(false);

    // Flag off: closed, with no read.
    mocks.getCurrentSquaresEvent.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
    expect((await context()).scheduled).toBe(false);
    expect(mocks.getCurrentSquaresEvent).not.toHaveBeenCalled();
  });
});
