import { beforeEach, describe, expect, it, vi } from "vitest";

// GET/POST /api/owner/schedule/[id]/cancel-impact (Phase A3): owner auth first, then the
// schedule's venue, and only then the prize dry run.

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  getOwnerSchedule: vi.fn(),
  ownsVenue: vi.fn(),
  previewOwnerScheduleChangeNotice: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/ownerSchedule", () => ({
  OWNER_SCHEDULE_INVALID_RECURRENCE_MESSAGE: "Recurrence must be none, daily, or weekly.",
  OWNER_SCHEDULE_WEEKLY_DAYS_REQUIRED_MESSAGE: "Select at least one day for weekly recurring schedules.",
  getOwnerSchedule: mocks.getOwnerSchedule,
  ownsVenue: mocks.ownsVenue,
  previewOwnerScheduleChangeNotice: mocks.previewOwnerScheduleChangeNotice,
}));

import { GET, POST } from "@/app/api/owner/schedule/[id]/cancel-impact/route";

const schedule = { id: "sched-1", venueId: "venue-1", gameType: "live_trivia", timezone: "America/New_York" };
const params = Promise.resolve({ id: "sched-1" });
const get = () => GET(new Request("https://x/api/owner/schedule/sched-1/cancel-impact"), { params });
const post = (body: unknown) =>
  POST(
    new Request("https://x/api/owner/schedule/sched-1/cancel-impact", { method: "POST", body: JSON.stringify(body) }),
    { params },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwnerAuth.mockResolvedValue({ venueIds: ["venue-1"] });
  mocks.getOwnerSchedule.mockResolvedValue(schedule);
  mocks.ownsVenue.mockReturnValue(true);
  mocks.previewOwnerScheduleChangeNotice.mockResolvedValue("Also ends: $50 gift card.");
});

describe("cancel-impact", () => {
  it("rejects a signed-out caller before reading anything", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(new Response(null, { status: 401 }));
    expect((await get()).status).toBe(401);
    expect(mocks.getOwnerSchedule).not.toHaveBeenCalled();
    expect(mocks.previewOwnerScheduleChangeNotice).not.toHaveBeenCalled();
  });

  it("403s another venue's game without reading its prizes", async () => {
    mocks.ownsVenue.mockReturnValue(false);
    expect((await get()).status).toBe(403);
    expect(mocks.previewOwnerScheduleChangeNotice).not.toHaveBeenCalled();
  });

  it("404s an unknown game", async () => {
    mocks.getOwnerSchedule.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it("GET previews a cancel", async () => {
    const res = await get();
    expect(await res.json()).toEqual({ ok: true, notice: "Also ends: $50 gift card." });
    expect(mocks.previewOwnerScheduleChangeNotice).toHaveBeenCalledWith(schedule);
  });

  it("POST previews an edit in the venue's time zone", async () => {
    const res = await post({ startTime: "2026-11-13T20:00", rounds: 3, recurringType: "weekly", recurringDays: ["FRI"] });
    expect(res.status).toBe(200);
    expect(mocks.previewOwnerScheduleChangeNotice).toHaveBeenCalledWith(schedule, {
      startTimeIso: "2026-11-14T01:00:00.000Z",
      timezone: "America/New_York",
      rounds: 3,
      recurringType: "weekly",
      recurringDays: ["fri"],
    });
  });

  it("POST 400s a missing start", async () => {
    expect((await post({})).status).toBe(400);
    expect(mocks.previewOwnerScheduleChangeNotice).not.toHaveBeenCalled();
  });
});
