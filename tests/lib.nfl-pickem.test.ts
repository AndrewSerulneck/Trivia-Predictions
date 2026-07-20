import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NFLWeek } from "@/lib/nflPickEm";
import {
  buildNFLLeaderboardWeekOptions,
  getNFLWeekDisplayLabel,
  isNFLWeekLocked,
  isNFLWeekStarted,
  getLockStatus,
  determineWeekLockTime,
} from "@/lib/nflPickEm";

// Mock the BDL fetch
vi.mock("@/lib/balldontlie", () => ({
  fetchBallDontLieList: vi.fn(),
}));

function createMockWeek(overrides: Partial<NFLWeek> = {}): NFLWeek {
  return {
    id: "test-week-id",
    season: 2024,
    weekNumber: 1,
    weekType: "regular",
    displayLabel: null,
    weekStartDate: "2024-09-05",
    weekEndDate: "2024-09-09",
    thursdayKickoff: null,
    status: "open",
    gamesCount: 16,
    syncedAt: null,
    ...overrides,
  };
}

describe("NFL leaderboard week options", () => {
  it("uses display labels when available and falls back to Week N", () => {
    expect(getNFLWeekDisplayLabel(createMockWeek({ weekNumber: 2, displayLabel: "Week 2" }))).toBe("Week 2");
    expect(getNFLWeekDisplayLabel(createMockWeek({ weekNumber: 3, displayLabel: "" }))).toBe("Week 3");
  });

  it("only treats weeks as started once their local start date has arrived", () => {
    const week = createMockWeek({ weekStartDate: "2024-09-05" });
    expect(isNFLWeekStarted(week, { now: new Date("2024-09-04T23:59:00Z"), timeZone: "UTC" })).toBe(false);
    expect(isNFLWeekStarted(week, { now: new Date("2024-09-05T00:00:00Z"), timeZone: "UTC" })).toBe(true);
  });

  it("filters out future weeks and defaults to the current started week", () => {
    const weeks = [
      createMockWeek({
        id: "week-1",
        weekNumber: 1,
        displayLabel: "Week 1",
        weekStartDate: "2024-09-05",
        weekEndDate: "2024-09-09",
      }),
      createMockWeek({
        id: "week-2",
        weekNumber: 2,
        displayLabel: "Week 2",
        weekStartDate: "2024-09-12",
        weekEndDate: "2024-09-16",
      }),
      createMockWeek({
        id: "week-3",
        weekNumber: 3,
        displayLabel: "Week 3",
        weekStartDate: "2024-09-19",
        weekEndDate: "2024-09-23",
      }),
    ];

    const options = buildNFLLeaderboardWeekOptions(weeks, {
      now: new Date("2024-09-13T12:00:00Z"),
      timeZone: "UTC",
    });

    expect(options.weeks.map((week) => week.id)).toEqual(["week-1", "week-2"]);
    expect(options.currentWeekId).toBe("week-2");
    expect(options.defaultWeekId).toBe("week-2");
  });

  it("defaults to the most recent started week when no week is current", () => {
    const weeks = [
      createMockWeek({ id: "week-1", weekNumber: 1, weekStartDate: "2024-09-05", weekEndDate: "2024-09-09" }),
      createMockWeek({ id: "week-2", weekNumber: 2, weekStartDate: "2024-09-12", weekEndDate: "2024-09-16" }),
    ];

    const options = buildNFLLeaderboardWeekOptions(weeks, {
      now: new Date("2024-09-18T12:00:00Z"),
      timeZone: "UTC",
    });

    expect(options.currentWeekId).toBeNull();
    expect(options.defaultWeekId).toBe("week-2");
  });

  it("returns an empty option set before the season starts", () => {
    const weeks = [
      createMockWeek({ id: "week-1", weekNumber: 1, weekStartDate: "2024-09-05", weekEndDate: "2024-09-09" }),
    ];

    const options = buildNFLLeaderboardWeekOptions(weeks, {
      now: new Date("2024-09-04T12:00:00Z"),
      timeZone: "UTC",
    });

    expect(options.weeks).toEqual([]);
    expect(options.currentWeekId).toBeNull();
    expect(options.defaultWeekId).toBeNull();
  });
});

describe("isNFLWeekLocked", () => {
  it("returns true when lock time has passed", () => {
    const pastWeek = createMockWeek({
      thursdayKickoff: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(isNFLWeekLocked(pastWeek)).toBe(true);
  });

  it("returns false when lock time is in future", () => {
    const futureWeek = createMockWeek({
      thursdayKickoff: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(isNFLWeekLocked(futureWeek)).toBe(false);
  });

  it("returns false when no lock time set", () => {
    const week = createMockWeek({ thursdayKickoff: null });
    expect(isNFLWeekLocked(week)).toBe(false);
  });
});

describe("getLockStatus", () => {
  it("returns locked status when time has passed", () => {
    const pastWeek = {
      thursdayKickoff: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    const status = getLockStatus(pastWeek);
    expect(status.isLocked).toBe(true);
    expect(status.timeUntilLock).toBe(0);
  });

  it("returns unlocked status with time remaining", () => {
    const futureWeek = {
      thursdayKickoff: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    const status = getLockStatus(futureWeek);
    expect(status.isLocked).toBe(false);
    expect(status.timeUntilLock).toBeGreaterThan(0);
    expect(status.lockTimeFormatted).not.toBeNull();
  });

  it("returns null values when no lock time set", () => {
    const week = { thursdayKickoff: null as string | null };
    const status = getLockStatus(week);
    expect(status.isLocked).toBe(false);
    expect(status.timeUntilLock).toBeNull();
    expect(status.lockTimeFormatted).toBeNull();
  });
});

describe("Lock Time Determination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns earliest Thursday game kickoff", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    (fetchBallDontLieList as any).mockResolvedValue([
      { id: "1", date: "2024-09-05T20:20:00-04:00", home_team: {}, visitor_team: {} },
      { id: "2", date: "2024-09-05T20:15:00-04:00", home_team: {}, visitor_team: {} }, // Earlier
    ]);

    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBe("2024-09-05T20:15:00-04:00");
  });

  it("returns first game of week when no Thursday game", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    // First call (Thursday) returns empty
    // Second call (full week) returns Sunday games
    (fetchBallDontLieList as any)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { id: "1", date: "2024-09-08T13:00:00-04:00", home_team: {}, visitor_team: {} },
        { id: "2", date: "2024-09-08T16:25:00-04:00", home_team: {}, visitor_team: {} },
      ]);

    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBe("2024-09-08T13:00:00-04:00");
  });

  it("returns null when no games found", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    (fetchBallDontLieList as any).mockResolvedValue([]);

    const lockTime = await determineWeekLockTime("2024-09-05", "2024-09-09");
    expect(lockTime).toBeNull();
  });
});
