import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NFLWeek } from "@/lib/nflPickEm";
import {
  isNFLWeekLocked,
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
    weekStartDate: "2024-09-05",
    weekEndDate: "2024-09-09",
    thursdayKickoff: null,
    status: "open",
    gamesCount: 16,
    syncedAt: null,
    ...overrides,
  };
}

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
