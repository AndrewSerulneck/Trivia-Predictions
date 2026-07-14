import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryBlitzSchedule } from "@/types";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  getSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  endVenueAutoSession: vi.fn(),
  abandonVenueAutoSession: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/categoryBlitzSchedules", () => ({
  listSchedules: mocks.listSchedules,
  createSchedule: mocks.createSchedule,
  getSchedule: mocks.getSchedule,
  updateSchedule: mocks.updateSchedule,
  deleteSchedule: mocks.deleteSchedule,
}));

vi.mock("@/lib/categoryBlitz", () => ({
  endVenueAutoSession: mocks.endVenueAutoSession,
  abandonVenueAutoSession: mocks.abandonVenueAutoSession,
}));

import { POST } from "@/app/api/category-blitz/schedules/route";
import { PATCH } from "@/app/api/category-blitz/schedules/[id]/route";

function makeSchedule(overrides: Partial<CategoryBlitzSchedule> = {}): CategoryBlitzSchedule {
  return {
    id: "schedule-1",
    venueId: "venue-1",
    title: "Category Blitz",
    startTime: "2026-07-01T23:00:00.000Z",
    endTime: "2026-07-02T00:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "none",
    recurringDays: [],
    windowMinutes: 60,
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireAdminAuth.mockReset();
  mocks.listSchedules.mockReset();
  mocks.createSchedule.mockReset();
  mocks.getSchedule.mockReset();
  mocks.updateSchedule.mockReset();
  mocks.deleteSchedule.mockReset();
  mocks.endVenueAutoSession.mockReset();
  mocks.abandonVenueAutoSession.mockReset();

  mocks.requireAdminAuth.mockResolvedValue({ ok: true, status: 200 });
});

describe("POST /api/category-blitz/schedules", () => {
  it("passes recurrence fields through after converting local times to UTC", async () => {
    mocks.createSchedule.mockResolvedValue(makeSchedule({
      recurringType: "weekly",
      recurringDays: ["thu", "sat"],
    }));

    const response = await POST(
      jsonRequest("http://localhost/api/category-blitz/schedules", "POST", {
        venueId: "venue-1",
        title: "Weekly Category Blitz",
        startTime: "2026-07-01T19:00",
        endTime: "2026-07-01T20:00",
        timezone: "America/New_York",
        recurringType: "weekly",
        recurringDays: ["thu", "sat"],
      })
    );
    const body = (await response.json()) as { ok: boolean; schedule: CategoryBlitzSchedule };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.createSchedule).toHaveBeenCalledWith({
      venueId: "venue-1",
      title: "Weekly Category Blitz",
      startTime: "2026-07-01T23:00:00.000Z",
      endTime: "2026-07-02T00:00:00.000Z",
      timezone: "America/New_York",
      recurringType: "weekly",
      recurringDays: ["thu", "sat"],
    });
  });

  it("maps recurrence validation failures to 400", async () => {
    mocks.createSchedule.mockRejectedValue(
      new Error("Select at least one day for weekly recurring schedules.")
    );

    const response = await POST(
      jsonRequest("http://localhost/api/category-blitz/schedules", "POST", {
        venueId: "venue-1",
        title: "Weekly Category Blitz",
        startTime: "2026-07-01T19:00",
        endTime: "2026-07-01T20:00",
        timezone: "America/New_York",
        recurringType: "weekly",
        recurringDays: [],
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: "Select at least one day for weekly recurring schedules.",
    });
  });
});

describe("PATCH /api/category-blitz/schedules/[id]", () => {
  it("preserves existing recurrence when omitted and does not restart on title-only edits", async () => {
    const current = makeSchedule({
      title: "Old Title",
      recurringType: "weekly",
      recurringDays: ["thu"],
    });
    const updated = makeSchedule({
      title: "New Title",
      recurringType: "weekly",
      recurringDays: ["thu"],
    });
    mocks.getSchedule.mockResolvedValue(current);
    mocks.updateSchedule.mockResolvedValue(updated);

    const response = await PATCH(
      jsonRequest("http://localhost/api/category-blitz/schedules/schedule-1", "PATCH", {
        title: "New Title",
        startTime: "2026-07-01T19:00",
        endTime: "2026-07-01T20:00",
        timezone: "America/New_York",
      }),
      { params: Promise.resolve({ id: "schedule-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSchedule).toHaveBeenCalledWith("schedule-1", {
      title: "New Title",
      startTime: "2026-07-01T23:00:00.000Z",
      endTime: "2026-07-02T00:00:00.000Z",
      timezone: "America/New_York",
      recurringType: "weekly",
      recurringDays: ["thu"],
    });
    expect(mocks.endVenueAutoSession).not.toHaveBeenCalled();
  });

  it("restarts active auto sessions when recurrence semantics change", async () => {
    const current = makeSchedule();
    const updated = makeSchedule({
      recurringType: "weekly",
      recurringDays: ["thu", "sat"],
    });
    mocks.getSchedule.mockResolvedValue(current);
    mocks.updateSchedule.mockResolvedValue(updated);

    const response = await PATCH(
      jsonRequest("http://localhost/api/category-blitz/schedules/schedule-1", "PATCH", {
        title: "Category Blitz",
        startTime: "2026-07-01T19:00",
        endTime: "2026-07-01T20:00",
        timezone: "America/New_York",
        recurringType: "weekly",
        recurringDays: ["thu", "sat"],
      }),
      { params: Promise.resolve({ id: "schedule-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSchedule).toHaveBeenCalledWith("schedule-1", {
      title: "Category Blitz",
      startTime: "2026-07-01T23:00:00.000Z",
      endTime: "2026-07-02T00:00:00.000Z",
      timezone: "America/New_York",
      recurringType: "weekly",
      recurringDays: ["thu", "sat"],
    });
    expect(mocks.endVenueAutoSession).toHaveBeenCalledWith("venue-1");
  });

  it("restarts active auto sessions when duration changes", async () => {
    const current = makeSchedule();
    const updated = makeSchedule({
      endTime: "2026-07-02T00:30:00.000Z",
      windowMinutes: 90,
    });
    mocks.getSchedule.mockResolvedValue(current);
    mocks.updateSchedule.mockResolvedValue(updated);

    const response = await PATCH(
      jsonRequest("http://localhost/api/category-blitz/schedules/schedule-1", "PATCH", {
        title: "Category Blitz",
        startTime: "2026-07-01T19:00",
        endTime: "2026-07-01T20:30",
        timezone: "America/New_York",
      }),
      { params: Promise.resolve({ id: "schedule-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.endVenueAutoSession).toHaveBeenCalledWith("venue-1");
  });
});
