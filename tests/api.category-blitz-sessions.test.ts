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
  isVenuePresenceLive: vi.fn(),
  presenceEnforced: vi.fn(),
  resolveRoomId: vi.fn(),
}));
vi.mock("@/lib/venuePresence", () => ({
  isVenuePresenceLive: mocks.isVenuePresenceLive,
  isVenuePresenceMutationEnforcementEnabled: mocks.presenceEnforced,
}));
vi.mock("@/lib/categoryBlitzRoom", () => ({
  resolveCategoryBlitzRoomId: mocks.resolveRoomId,
}));

vi.mock("@/lib/categoryBlitz", () => ({
  createSession: vi.fn(),
  driveVenueCategoryBlitzWithSchedules: mocks.driveVenueCategoryBlitz,
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
    mocks.isVenuePresenceLive.mockReset();
    mocks.presenceEnforced.mockReset();
    mocks.presenceEnforced.mockReturnValue(false);
    mocks.resolveRoomId.mockReset();
    mocks.resolveRoomId.mockImplementation((venueId: string) => venueId);
    // Default: continuous mode off, so the route takes the scheduled path.
    mocks.resolveContinuousConfig.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the next recurring Category Blitz window for lobby countdowns", async () => {
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
    mocks.driveVenueCategoryBlitz.mockResolvedValue({ session: null, schedules: [makeSchedule()] });
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
      scheduleWindowEndAt: null, // no window open right now
      // Global-room flag off ⇒ room resolves to the venue itself, so the
      // client subscribes to that venue's channel.
      realtimeChannel: categoryBlitzChannelName("venue-1"),
      // The server's clock as the request came in and as the reply leaves, for
      // the letter die (Phases 12.2a, 13.1b).
      serverReceivedAtMs: Date.parse("2026-07-02T12:00:00.000Z"),
      serverNowMs: Date.parse("2026-07-02T12:00:00.000Z"),
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

  // docs/category-blitz-letter-die-plan.md Phase 11.1b: the letter die reads the
  // LIVE open window's end, derived from the schedule list the route already reads.
  describe("scheduleWindowEndAt", () => {
    const autoSession = {
      id: "session-1",
      venueId: "venue-1",
      status: "active" as const,
      source: "auto" as const,
      sessionType: "scheduled" as const,
      // Frozen at creation; the response must not echo it as the window end.
      scheduledEndAt: "2026-07-09T00:00:00.000Z",
      startsAt: "2026-07-08T23:00:00.000Z",
      testMode: false,
      createdAt: "2026-07-08T23:00:00.000Z",
      completedAt: null,
    };
    const get = async () => {
      const response = await GET(new Request("http://localhost/api/category-blitz/sessions?venueId=venue-1"));
      return (await response.json()) as { scheduleWindowEndAt: string | null };
    };

    beforeEach(() => {
      vi.setSystemTime(new Date("2026-07-08T23:30:00.000Z")); // inside Wednesday's window
    });

    it("is the open window's end, read from the one schedule list (no extra read)", async () => {
      mocks.driveVenueCategoryBlitz.mockResolvedValue({ session: autoSession, schedules: [makeSchedule()] });
      const body = await get();
      expect(body.scheduleWindowEndAt).toBe("2026-07-09T00:00:00.000Z");
      // 13.3a: the engine's own read is the only one.
      expect(mocks.listSchedules).not.toHaveBeenCalled();
    });

    it("13.3a reads the schedules itself only when the engine stood down before reading", async () => {
      mocks.driveVenueCategoryBlitz.mockResolvedValue({ session: autoSession, schedules: null });
      mocks.listSchedules.mockResolvedValue([makeSchedule()]);
      const body = await get();
      expect(body.scheduleWindowEndAt).toBe("2026-07-09T00:00:00.000Z");
      expect(mocks.listSchedules).toHaveBeenCalledTimes(1);
    });

    it("follows a partner shortening tonight's window", async () => {
      mocks.driveVenueCategoryBlitz.mockResolvedValue({
        session: autoSession,
        schedules: [makeSchedule({ windowMinutes: 45, endTime: "2026-07-01T23:45:00.000Z" })],
      });
      const body = await get();
      expect(body.scheduleWindowEndAt).toBe("2026-07-08T23:45:00.000Z");
    });

    it("is null when no window is open (tonight's schedule moved or deleted)", async () => {
      mocks.driveVenueCategoryBlitz.mockResolvedValue({
        session: autoSession,
        schedules: [makeSchedule({ recurringDays: ["fri"] })],
      });
      expect((await get()).scheduleWindowEndAt).toBeNull();
      mocks.driveVenueCategoryBlitz.mockResolvedValue({ session: autoSession, schedules: [] });
      expect((await get()).scheduleWindowEndAt).toBeNull();
    });

    it("is null for a manual session (the engine never advances one)", async () => {
      mocks.driveVenueCategoryBlitz.mockResolvedValue({
        session: { ...autoSession, source: "manual", scheduledEndAt: null },
        schedules: [makeSchedule()],
      });
      const body = await get();
      expect(body.scheduleWindowEndAt).toBeNull();
    });

    it("is null for a continuous venue", async () => {
      mocks.resolveContinuousConfig.mockResolvedValue({
        isActive: true,
        roundDurationSeconds: 180,
        intermissionSeconds: 180,
        modeSelection: "random" as const,
        categoryPool: [],
        minCategoriesPerLetter: 12,
      });
      mocks.driveContinuousCategoryBlitz.mockResolvedValue({ session: { ...autoSession, sessionType: "continuous" } });
      const body = await get();
      expect(body.scheduleWindowEndAt).toBeNull();
      expect(mocks.listSchedules).not.toHaveBeenCalled();
    });
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

    it("both look-only branches conceal a shared room id and share one payload", async () => {
      vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
      mocks.resolveRoomId.mockReturnValue("hc-cbz-live");
      mocks.presenceEnforced.mockReturnValue(true);
      mocks.isVenuePresenceLive.mockResolvedValue(false);
      mocks.peekCategoryBlitz.mockResolvedValue({
        continuousConfig,
        session: { ...openSession, venueId: "hc-cbz-live" },
        latestRound: null,
        awake: true,
      });

      const away = await (
        await GET(new Request("http://localhost/api/category-blitz/sessions?venueId=venue-1&userId=user-1"))
      ).json();
      const peek = await (
        await GET(new Request("http://localhost/api/category-blitz/sessions?venueId=venue-1&peek=1"))
      ).json();

      expect(away.session.venueId).toBe("venue-1");
      expect(peek.session.venueId).toBe("venue-1");
      expect(JSON.stringify(away)).not.toContain("hc-cbz-live");
      expect(JSON.stringify(peek)).not.toContain("hc-cbz-live");
      expect(away.realtimeChannel).toBe(peek.realtimeChannel);
      expect(away.session).toEqual(peek.session);
      expect(away.nextWindowAt).toBe(peek.nextWindowAt);
      // The away shape is unchanged: no `live`, plus the null window end and the two clocks.
      expect(away).not.toHaveProperty("live");
      expect(away.scheduleWindowEndAt).toBeNull();
      expect(typeof away.serverReceivedAtMs).toBe("number");
      expect(typeof away.serverNowMs).toBe("number");
      expect(peek.live).toBe(true);
      expect(mocks.driveContinuousCategoryBlitz).not.toHaveBeenCalled();
      expect(mocks.registerSessionPresence).not.toHaveBeenCalled();
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
