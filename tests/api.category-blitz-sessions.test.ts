import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryBlitzSchedule } from "@/types";
import { categoryBlitzChannelName } from "@/lib/categoryBlitzShared";

const mocks = vi.hoisted(() => ({
  driveVenueCategoryBlitz: vi.fn(),
  driveContinuousCategoryBlitz: vi.fn(),
  peekCategoryBlitz: vi.fn(),
  registerSessionPresence: vi.fn(),
  listSchedules: vi.fn(),
  resolveContinuousConfig: vi.fn(),
}));

vi.mock("@/lib/categoryBlitz", () => ({
  createSession: vi.fn(),
  driveVenueCategoryBlitz: mocks.driveVenueCategoryBlitz,
  driveContinuousCategoryBlitz: mocks.driveContinuousCategoryBlitz,
  peekCategoryBlitz: mocks.peekCategoryBlitz,
  registerSessionPresence: mocks.registerSessionPresence,
}));
// The sessions route checks continuous mode first; default to null (scheduled
// venue) so these tests exercise the unchanged scheduled path.
vi.mock("@/lib/categoryBlitzPool", () => ({
  resolveContinuousConfig: mocks.resolveContinuousConfig,
}));
vi.mock("@/lib/categoryBlitzSchedules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/categoryBlitzSchedules")>(
    "@/lib/categoryBlitzSchedules"
  );
  return {
    ...actual,
    listSchedules: mocks.listSchedules,
  };
});
vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(),
}));
vi.mock("@/lib/serverSession", () => ({
  isSessionEnforced: vi.fn(() => false),
  readSession: vi.fn(() => null),
}));

import { GET } from "@/app/api/category-blitz/sessions/route";

function makeSchedule(overrides: Partial<CategoryBlitzSchedule> = {}): CategoryBlitzSchedule {
  return {
    id: "schedule-1",
    venueId: "venue-1",
    title: "Weekly Category Blitz",
    startTime: "2026-07-01T23:00:00.000Z",
    endTime: "2026-07-02T00:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "weekly",
    recurringDays: ["wed"],
    windowMinutes: 60,
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("GET /api/category-blitz/sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.driveVenueCategoryBlitz.mockReset();
    mocks.driveContinuousCategoryBlitz.mockReset();
    mocks.peekCategoryBlitz.mockReset();
    mocks.registerSessionPresence.mockReset();
    mocks.listSchedules.mockReset();
    mocks.resolveContinuousConfig.mockReset();
    // Default: continuous mode off, so the route takes the scheduled path.
    mocks.resolveContinuousConfig.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the next recurring Category Blitz window for lobby countdowns", async () => {
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
    mocks.driveVenueCategoryBlitz.mockResolvedValue(null);
    mocks.listSchedules.mockResolvedValue([makeSchedule()]);

    const response = await GET(
      new Request("http://localhost/api/category-blitz/sessions?venueId=venue-1")
    );
    const body = (await response.json()) as {
      ok: boolean;
      session: null;
      nextWindowAt: string | null;
      realtimeChannel: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      session: null,
      nextWindowAt: "2026-07-08T23:00:00.000Z",
      // Global-room flag off ⇒ room resolves to the venue itself, so the
      // client subscribes to that venue's channel.
      realtimeChannel: categoryBlitzChannelName("venue-1"),
    });
    // Concealment: the channel is a hash, so the raw venue id (and, under
    // pooling, the room id) never appears verbatim in the payload.
    expect(body.realtimeChannel).not.toContain("venue-1");
    expect(mocks.driveVenueCategoryBlitz).toHaveBeenCalledWith(
      "venue-1",
      new Date("2026-07-02T12:00:00.000Z"),
      false
    );
  });

  // Sleep when idle (docs/category-blitz-how-to-play-plan.md Phase 5): venue
  // home and the admin panel only look, so they must never reach the drive.
  describe("peek=1", () => {
    const continuousConfig = {
      isActive: true,
      roundDurationSeconds: 180,
      intermissionSeconds: 180,
      modeSelection: "random" as const,
      categoryPool: [],
      minCategoriesPerLetter: 12,
    };
    const openSession = {
      id: "session-1",
      venueId: "venue-1",
      status: "active" as const,
      source: "auto" as const,
      sessionType: "continuous" as const,
      scheduledEndAt: null,
      startsAt: "2026-07-02T00:00:00.000Z",
      testMode: false,
      createdAt: "2026-07-02T00:00:00.000Z",
      completedAt: null,
    };

    it("reads without driving, registering presence, or creating anything", async () => {
      vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
      mocks.peekCategoryBlitz.mockResolvedValue({
        continuousConfig,
        session: openSession,
        latestRound: null,
        awake: false,
      });

      const response = await GET(
        new Request("http://localhost/api/category-blitz/sessions?venueId=venue-1&userId=user-1&peek=1")
      );
      const body = (await response.json()) as { ok: boolean; live: boolean; session: { id: string } | null };

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.live).toBe(false);
      expect(body.session?.id).toBe("session-1");
      expect(mocks.peekCategoryBlitz).toHaveBeenCalledWith("venue-1", new Date("2026-07-02T12:00:00.000Z"));
      expect(mocks.driveContinuousCategoryBlitz).not.toHaveBeenCalled();
      expect(mocks.driveVenueCategoryBlitz).not.toHaveBeenCalled();
      expect(mocks.registerSessionPresence).not.toHaveBeenCalled();
    });

    it("reports live while a round is awake", async () => {
      mocks.peekCategoryBlitz.mockResolvedValue({
        continuousConfig,
        session: openSession,
        latestRound: null,
        awake: true,
      });

      const response = await GET(new Request("http://localhost/api/category-blitz/sessions?venueId=venue-1&peek=1"));
      const body = (await response.json()) as { live: boolean };

      expect(body.live).toBe(true);
    });

    it("without peek, the game page's call still drives the continuous engine", async () => {
      mocks.resolveContinuousConfig.mockResolvedValue(continuousConfig);
      mocks.driveContinuousCategoryBlitz.mockResolvedValue({ session: openSession, action: "started_round", config: continuousConfig });

      await GET(new Request("http://localhost/api/category-blitz/sessions?venueId=venue-1"));

      expect(mocks.driveContinuousCategoryBlitz).toHaveBeenCalledTimes(1);
      expect(mocks.peekCategoryBlitz).not.toHaveBeenCalled();
    });
  });
});
