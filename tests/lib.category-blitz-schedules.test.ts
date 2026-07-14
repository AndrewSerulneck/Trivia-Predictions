import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  broadcastCategoryBlitz: vi.fn(),
  insertPayload: null as Record<string, unknown> | null,
  updatePayload: null as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/categoryBlitzBroadcast", () => ({
  broadcastCategoryBlitz: mocks.broadcastCategoryBlitz,
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import { createSchedule, updateSchedule } from "@/lib/categoryBlitzSchedules";

function rowFromPayload(payload: Record<string, unknown>, scheduleId = "schedule-1") {
  return {
    id: scheduleId,
    venue_id: payload.venue_id ?? "venue-1",
    title: payload.title,
    start_time: payload.start_time,
    timezone: payload.timezone,
    recurring_type: payload.recurring_type,
    recurring_days: payload.recurring_days,
    window_minutes: payload.window_minutes,
    is_active: true,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function installScheduleTableMock() {
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe("category_blitz_schedules");
    return {
      insert: vi.fn((payload: Record<string, unknown>) => {
        mocks.insertPayload = payload;
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: rowFromPayload(payload), error: null })),
          })),
        };
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        mocks.updatePayload = payload;
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: rowFromPayload({ ...payload, venue_id: "venue-1" }, "schedule-2"),
                error: null,
              })),
            })),
          })),
        };
      }),
    };
  });
}

const baseParams = {
  venueId: "venue-1",
  title: "Tuesday Category Blitz",
  startTime: "2026-07-01T03:20:00.000Z",
  endTime: "2026-07-01T07:20:00.000Z",
  timezone: "America/New_York",
};

describe("Category Blitz schedule persistence", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.broadcastCategoryBlitz.mockReset();
    mocks.insertPayload = null;
    mocks.updatePayload = null;
    installScheduleTableMock();
  });

  it("keeps newly created schedules one-off by default", async () => {
    const schedule = await createSchedule(baseParams);

    expect(mocks.insertPayload).toMatchObject({
      venue_id: "venue-1",
      title: "Tuesday Category Blitz",
      start_time: "2026-07-01T03:20:00.000Z",
      timezone: "America/New_York",
      recurring_type: "none",
      recurring_days: [],
      window_minutes: 240,
    });
    expect(schedule.recurringType).toBe("none");
    expect(schedule.recurringDays).toEqual([]);
    expect(mocks.broadcastCategoryBlitz).toHaveBeenCalledWith("venue-1", "schedule_updated", {
      scheduleId: "schedule-1",
    });
  });

  it("normalizes and persists weekly recurrence when creating a schedule", async () => {
    const schedule = await createSchedule({
      ...baseParams,
      recurringType: "weekly",
      recurringDays: ["THU", "sat", "thu"],
    });

    expect(mocks.insertPayload).toMatchObject({
      recurring_type: "weekly",
      recurring_days: ["thu", "sat"],
    });
    expect(schedule.recurringType).toBe("weekly");
    expect(schedule.recurringDays).toEqual(["thu", "sat"]);
  });

  it("persists daily recurrence with no weekday list when updating a schedule", async () => {
    const schedule = await updateSchedule("schedule-2", {
      title: "Daily Category Blitz",
      startTime: "2026-07-01T03:20:00.000Z",
      endTime: "2026-07-01T04:20:00.000Z",
      timezone: "America/New_York",
      recurringType: "daily",
      recurringDays: ["mon"],
    });

    expect(mocks.updatePayload).toMatchObject({
      title: "Daily Category Blitz",
      recurring_type: "daily",
      recurring_days: [],
      window_minutes: 60,
    });
    expect(schedule.recurringType).toBe("daily");
    expect(schedule.recurringDays).toEqual([]);
    expect(mocks.broadcastCategoryBlitz).toHaveBeenCalledWith("venue-1", "schedule_updated", {
      scheduleId: "schedule-2",
    });
  });

  it("rejects weekly recurrence without at least one selected weekday", async () => {
    await expect(
      createSchedule({
        ...baseParams,
        recurringType: "weekly",
        recurringDays: [],
      })
    ).rejects.toThrow("Select at least one day for weekly recurring schedules.");
    expect(mocks.insertPayload).toBeNull();
  });

  it("rejects invalid recurrence values before writing", async () => {
    await expect(
      createSchedule({
        ...baseParams,
        recurringType: "monthly" as "weekly",
        recurringDays: ["thu"],
      })
    ).rejects.toThrow("recurringType must be none, daily, or weekly.");
    expect(mocks.insertPayload).toBeNull();
  });

  it("rejects invalid weekly day keys before writing", async () => {
    await expect(
      createSchedule({
        ...baseParams,
        recurringType: "weekly",
        recurringDays: ["thu", "funday"],
      })
    ).rejects.toThrow("recurringDays must contain valid weekday keys.");
    expect(mocks.insertPayload).toBeNull();
  });
});
