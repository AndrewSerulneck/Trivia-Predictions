import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryBlitzSchedule } from "@/types";
import { categoryBlitzChannelName } from "@/lib/categoryBlitzShared";

const mocks = vi.hoisted(() => ({
  driveVenueCategoryBlitz: vi.fn(),
  driveContinuousCategoryBlitz: vi.fn(),
  registerSessionPresence: vi.fn(),
  listSchedules: vi.fn(),
  resolveContinuousConfig: vi.fn(),
}));

vi.mock("@/lib/categoryBlitz", () => ({
  createSession: vi.fn(),
  driveVenueCategoryBlitz: mocks.driveVenueCategoryBlitz,
  driveContinuousCategoryBlitz: mocks.driveContinuousCategoryBlitz,
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
});
