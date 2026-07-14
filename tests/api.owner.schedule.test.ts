import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryBlitzSchedule } from "@/types";
import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  getSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  abandonVenueAutoSession: vi.fn(),
  // Live Trivia ("Live Showdown") engine — the second store the owner surface merges (Phase 4b).
  listAdminLiveShowdownSchedules: vi.fn(),
  createAdminLiveShowdownSchedule: vi.fn(),
  deleteAdminLiveShowdownSchedule: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/categoryBlitzSchedules", () => ({
  listSchedules: mocks.listSchedules,
  createSchedule: mocks.createSchedule,
  getSchedule: mocks.getSchedule,
  deleteSchedule: mocks.deleteSchedule,
}));
vi.mock("@/lib/categoryBlitz", () => ({
  abandonVenueAutoSession: mocks.abandonVenueAutoSession,
}));
vi.mock("@/lib/liveShowdownAdmin", () => ({
  listAdminLiveShowdownSchedules: mocks.listAdminLiveShowdownSchedules,
  createAdminLiveShowdownSchedule: mocks.createAdminLiveShowdownSchedule,
  deleteAdminLiveShowdownSchedule: mocks.deleteAdminLiveShowdownSchedule,
}));

import { GET, POST } from "@/app/api/owner/schedule/route";
import { DELETE } from "@/app/api/owner/schedule/[id]/route";
import { rangesOverlap } from "@/lib/ownerSchedule";

const OWNER = { ownerId: "owner-1", venueIds: ["venue-1", "venue-2"] };

function makeSchedule(overrides: Partial<CategoryBlitzSchedule> = {}): CategoryBlitzSchedule {
  return {
    id: "schedule-1",
    venueId: "venue-1",
    title: "Friday Night Category Blitz",
    // 8:00pm–9:00pm ET on 2026-08-01
    startTime: "2026-08-02T00:00:00.000Z",
    endTime: "2026-08-02T01:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "none",
    recurringDays: [],
    windowMinutes: 60,
    isActive: true,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

// A Live Trivia ("Live Showdown") admin schedule row at the SAME 8pm ET window as
// makeSchedule() above (start 00:00Z; the engine derives the end from numRounds).
function makeAdminLive(overrides: Partial<AdminLiveShowdownSchedule> = {}): AdminLiveShowdownSchedule {
  return {
    id: "lt-1",
    title: "Live Trivia Night",
    startTime: "2026-08-02T00:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "none",
    recurringDays: [],
    numRounds: 3,
    venueId: "venue-1",
    intermissionAdDelaySeconds: 10,
    lobbyAdEnabled: true,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function postRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/owner/schedule", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validCreateBody = {
  venueId: "venue-1",
  title: "Friday Night Category Blitz",
  startTime: "2026-08-01T20:00", // datetime-local, ET
  endTime: "2026-08-01T21:00",
  timezone: "America/New_York",
  gameType: "category_blitz",
};

const validLiveBody = {
  venueId: "venue-1",
  title: "Friday Night Live Trivia",
  startTime: "2026-08-01T20:00", // datetime-local, ET → 00:00Z
  endTime: "2026-08-01T21:22", // ~3 rounds; server re-derives the real end from rounds
  timezone: "America/New_York",
  gameType: "live_trivia",
  rounds: 3,
};

beforeEach(() => {
  mocks.requireOwnerAuth.mockReset();
  mocks.listSchedules.mockReset();
  mocks.createSchedule.mockReset();
  mocks.getSchedule.mockReset();
  mocks.deleteSchedule.mockReset();
  mocks.abandonVenueAutoSession.mockReset();
  mocks.listAdminLiveShowdownSchedules.mockReset();
  mocks.createAdminLiveShowdownSchedule.mockReset();
  mocks.deleteAdminLiveShowdownSchedule.mockReset();

  mocks.requireOwnerAuth.mockResolvedValue(OWNER);
  mocks.listSchedules.mockResolvedValue([]);
  mocks.createSchedule.mockResolvedValue(makeSchedule());
  // Default: no Live Trivia schedules in the store (tests opt in per-case).
  mocks.listAdminLiveShowdownSchedules.mockResolvedValue([]);
  mocks.createAdminLiveShowdownSchedule.mockResolvedValue(makeAdminLive());
});

describe("rangesOverlap", () => {
  it("detects intersecting windows and treats back-to-back as non-overlapping", () => {
    const a0 = "2026-08-02T00:00:00.000Z";
    const a1 = "2026-08-02T01:00:00.000Z";
    expect(rangesOverlap(a0, a1, "2026-08-02T00:30:00.000Z", "2026-08-02T01:30:00.000Z")).toBe(true);
    // back-to-back: previous ends exactly when next starts
    expect(rangesOverlap(a0, a1, "2026-08-02T01:00:00.000Z", "2026-08-02T02:00:00.000Z")).toBe(false);
    // fully disjoint
    expect(rangesOverlap(a0, a1, "2026-08-02T03:00:00.000Z", "2026-08-02T04:00:00.000Z")).toBe(false);
    // non-finite never overlaps
    expect(rangesOverlap(a0, a1, "not-a-date", a1)).toBe(false);
  });
});

describe("POST /api/owner/schedule", () => {
  it("creates a schedule for a venue the owner controls", async () => {
    const res = await POST(postRequest(validCreateBody));
    const body = (await res.json()) as { ok: boolean; schedule: { gameType: string } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schedule.gameType).toBe("category_blitz");
    expect(mocks.createSchedule).toHaveBeenCalledOnce();
  });

  it("rejects a venue the owner does not control with 403 and never touches the engine", async () => {
    const res = await POST(postRequest({ ...validCreateBody, venueId: "venue-999" }));
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  // (Phase 4b: both known game types are now SUPPORTED — the known-but-unsupported
  // path still exists in code for future games but no current type triggers it.
  // live_trivia acceptance is covered in the "Phase 4b" describe block below.)

  it("rejects an unknown game type with 400", async () => {
    const res = await POST(postRequest({ ...validCreateBody, gameType: "roulette" }));
    expect(res.status).toBe(400);
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  it("rejects an overlapping schedule with 409", async () => {
    // An existing schedule covering the same 8–9pm window.
    mocks.listSchedules.mockResolvedValue([makeSchedule()]);

    const res = await POST(postRequest(validCreateBody));
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  it("returns 400 when the end time is not after the start time", async () => {
    const res = await POST(
      postRequest({ ...validCreateBody, endTime: "2026-08-01T20:00" }),
    );
    expect(res.status).toBe(400);
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  it("propagates the auth failure Response when unauthenticated", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const res = await POST(postRequest(validCreateBody));
    expect(res.status).toBe(401);
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });
});

describe("GET /api/owner/schedule", () => {
  it("lists schedules for an owned venue, tagged with game type", async () => {
    mocks.listSchedules.mockResolvedValue([makeSchedule()]);
    const res = await GET(new Request("http://localhost/api/owner/schedule?venueId=venue-1"));
    const body = (await res.json()) as { ok: boolean; schedules: Array<{ gameType: string }> };

    expect(res.status).toBe(200);
    expect(body.schedules[0]?.gameType).toBe("category_blitz");
  });

  it("returns 403 for a venue the owner does not control", async () => {
    const res = await GET(new Request("http://localhost/api/owner/schedule?venueId=venue-999"));
    expect(res.status).toBe(403);
    expect(mocks.listSchedules).not.toHaveBeenCalled();
  });

  it("returns 400 when venueId is missing", async () => {
    const res = await GET(new Request("http://localhost/api/owner/schedule"));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/owner/schedule/[id]", () => {
  const paramsFor = (id: string) => ({ params: Promise.resolve({ id }) });

  it("deletes a schedule the owner controls and abandons the running session", async () => {
    mocks.getSchedule.mockResolvedValue(makeSchedule({ venueId: "venue-1" }));
    mocks.deleteSchedule.mockResolvedValue("venue-1");

    const res = await DELETE(
      new Request("http://localhost/api/owner/schedule/schedule-1", { method: "DELETE" }),
      paramsFor("schedule-1"),
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteSchedule).toHaveBeenCalledWith("schedule-1");
    expect(mocks.abandonVenueAutoSession).toHaveBeenCalledWith("venue-1");
  });

  it("returns 403 for a schedule belonging to a venue the owner does not control", async () => {
    mocks.getSchedule.mockResolvedValue(makeSchedule({ venueId: "venue-999" }));

    const res = await DELETE(
      new Request("http://localhost/api/owner/schedule/schedule-1", { method: "DELETE" }),
      paramsFor("schedule-1"),
    );
    expect(res.status).toBe(403);
    expect(mocks.deleteSchedule).not.toHaveBeenCalled();
  });

  it("returns 404 when the schedule does not exist", async () => {
    mocks.getSchedule.mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/owner/schedule/missing", { method: "DELETE" }),
      paramsFor("missing"),
    );
    expect(res.status).toBe(404);
    expect(mocks.deleteSchedule).not.toHaveBeenCalled();
  });
});

// ── Phase 4b — Live Trivia owner scheduling ────────────────────────────────────
describe("Phase 4b — Live Trivia scheduling", () => {
  const paramsFor = (id: string) => ({ params: Promise.resolve({ id }) });

  it("routes a live_trivia create to the Live Showdown engine, not Category Blitz", async () => {
    const res = await POST(postRequest(validLiveBody));
    const body = (await res.json()) as { ok: boolean; schedule: { gameType: string } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schedule.gameType).toBe("live_trivia");
    expect(mocks.createAdminLiveShowdownSchedule).toHaveBeenCalledOnce();
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  it("passes venue-local targetDate + startTime + rounds to the engine", async () => {
    await POST(postRequest(validLiveBody));
    const arg = mocks.createAdminLiveShowdownSchedule.mock.calls[0][0];
    expect(arg).toMatchObject({
      venueId: "venue-1",
      targetDate: "2026-08-01",
      startTime: "20:00",
      timezone: "America/New_York",
      numRounds: 3,
    });
  });

  it("409s a Live Trivia game that overlaps an existing Category Blitz window", async () => {
    mocks.listSchedules.mockResolvedValue([makeSchedule()]); // CB 8–9pm ET

    const res = await POST(postRequest(validLiveBody)); // LT also starts 8pm ET
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(mocks.createAdminLiveShowdownSchedule).not.toHaveBeenCalled();
  });

  it("409s a Category Blitz game that overlaps an existing Live Trivia window", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeAdminLive()]); // LT 8pm ET, ~82min

    const res = await POST(postRequest(validCreateBody)); // CB also starts 8pm ET
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  it("allows back-to-back games across game types (CB ends exactly as LT starts)", async () => {
    // Existing CB 8–9pm ET; new LT starts 9pm ET (half-open → no overlap).
    mocks.listSchedules.mockResolvedValue([makeSchedule()]);
    const res = await POST(
      postRequest({ ...validLiveBody, startTime: "2026-08-01T21:00", endTime: "2026-08-01T22:22" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.createAdminLiveShowdownSchedule).toHaveBeenCalledOnce();
  });

  it("GET merges both engines into one venue calendar, tagged by game type", async () => {
    mocks.listSchedules.mockResolvedValue([
      makeSchedule({
        recurringType: "weekly",
        recurringDays: ["thu", "sat"],
      }),
    ]);
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeAdminLive({ id: "lt-9" })]);

    const res = await GET(new Request("http://localhost/api/owner/schedule?venueId=venue-1"));
    const body = (await res.json()) as {
      ok: boolean;
      schedules: Array<{ id: string; gameType: string; recurringType: string; recurringDays: string[] }>;
    };

    expect(res.status).toBe(200);
    const byType = Object.fromEntries(body.schedules.map((s) => [s.gameType, s.id]));
    expect(byType).toEqual({ category_blitz: "schedule-1", live_trivia: "lt-9" });
    const categoryBlitz = body.schedules.find((s) => s.gameType === "category_blitz");
    expect(categoryBlitz?.recurringType).toBe("weekly");
    expect(categoryBlitz?.recurringDays).toEqual(["thu", "sat"]);
  });

  it("GET filters Live Trivia rows to the requested venue only", async () => {
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([
      makeAdminLive({ id: "lt-mine", venueId: "venue-1" }),
      makeAdminLive({ id: "lt-other", venueId: "venue-2" }),
    ]);
    const res = await GET(new Request("http://localhost/api/owner/schedule?venueId=venue-1"));
    const body = (await res.json()) as { ok: boolean; schedules: Array<{ id: string }> };
    expect(body.schedules.map((s) => s.id)).toEqual(["lt-mine"]);
  });

  it("routes a live_trivia delete to the Live Showdown engine and never abandons a CB session", async () => {
    mocks.getSchedule.mockResolvedValue(null); // not a Category Blitz id
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeAdminLive({ id: "lt-1", venueId: "venue-1" })]);
    mocks.deleteAdminLiveShowdownSchedule.mockResolvedValue({ deleted: true });

    const res = await DELETE(
      new Request("http://localhost/api/owner/schedule/lt-1", { method: "DELETE" }),
      paramsFor("lt-1"),
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteAdminLiveShowdownSchedule).toHaveBeenCalledWith("lt-1");
    expect(mocks.deleteSchedule).not.toHaveBeenCalled();
    expect(mocks.abandonVenueAutoSession).not.toHaveBeenCalled();
  });

  it("403s deleting a Live Trivia schedule for a venue the owner does not control", async () => {
    mocks.getSchedule.mockResolvedValue(null);
    mocks.listAdminLiveShowdownSchedules.mockResolvedValue([makeAdminLive({ id: "lt-x", venueId: "venue-999" })]);

    const res = await DELETE(
      new Request("http://localhost/api/owner/schedule/lt-x", { method: "DELETE" }),
      paramsFor("lt-x"),
    );
    expect(res.status).toBe(403);
    expect(mocks.deleteAdminLiveShowdownSchedule).not.toHaveBeenCalled();
  });
});
