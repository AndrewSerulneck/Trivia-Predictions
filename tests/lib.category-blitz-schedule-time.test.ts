import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: null,
}));

import {
  computeWindowMinutesFromRange,
  datetimeLocalValueToUtcIso,
  getCurrentOrNextScheduleWindow,
  isScheduleWindowOpen,
  utcIsoToDatetimeLocalValue,
} from "@/lib/categoryBlitzScheduleTime";
import {
  getNextScheduleOccurrence,
  isWindowOpen,
  nextOccurrence,
} from "@/lib/categoryBlitzSchedules";
import type { CategoryBlitzSchedule } from "@/types";

function makeSchedule(overrides: Partial<CategoryBlitzSchedule> = {}): CategoryBlitzSchedule {
  return {
    id: "schedule-1",
    venueId: "venue-1",
    title: "Late Night Category Blitz",
    startTime: "2026-07-01T03:20:00.000Z",
    endTime: "2026-07-01T07:20:00.000Z",
    timezone: "America/New_York",
    recurringType: "none",
    recurringDays: [],
    windowMinutes: 240,
    isActive: true,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("Category Blitz schedule time conversion", () => {
  it("stores a venue-local late-night start as the correct UTC timestamp", () => {
    expect(datetimeLocalValueToUtcIso("2026-06-30T23:20", "America/New_York")).toBe(
      "2026-07-01T03:20:00.000Z"
    );
  });

  it("round-trips a stored UTC timestamp back into the venue-local datetime-local value", () => {
    expect(utcIsoToDatetimeLocalValue("2026-07-01T03:20:00.000Z", "America/New_York")).toBe(
      "2026-06-30T23:20"
    );
  });

  it("derives the stored duration from explicit start and end timestamps", () => {
    expect(
      computeWindowMinutesFromRange("2026-07-01T03:20:00.000Z", "2026-07-01T07:20:00.000Z")
    ).toBe(240);
  });
});

describe("Category Blitz schedule windows", () => {
  it("keeps a late-night scheduled range open after midnight in the venue timezone", () => {
    const schedule = makeSchedule();
    const now = new Date("2026-07-01T05:00:00.000Z");

    const occurrence = getCurrentOrNextScheduleWindow(schedule, now);
    expect(occurrence?.windowStart.toISOString()).toBe("2026-07-01T03:20:00.000Z");
    expect(occurrence?.windowEnd.toISOString()).toBe("2026-07-01T07:20:00.000Z");
    expect(isScheduleWindowOpen(schedule, now)).toBe(true);
  });

  it("returns no next occurrence once a one-time scheduled range has ended", () => {
    const schedule = makeSchedule();
    const now = new Date("2026-07-01T08:00:00.000Z");

    const occurrence = getCurrentOrNextScheduleWindow(schedule, now);
    expect(occurrence).toBeNull();
    expect(isScheduleWindowOpen(schedule, now)).toBe(false);
  });

  it("surfaces the same late-night occurrence through the schedule library helpers", () => {
    const schedule = makeSchedule();
    const now = new Date("2026-07-01T05:00:00.000Z");

    expect(nextOccurrence(schedule, now)?.toISOString()).toBe("2026-07-01T03:20:00.000Z");
    expect(isWindowOpen(schedule, now)).toBe(true);

    const next = getNextScheduleOccurrence([schedule], now);
    expect(next?.windowStart.toISOString()).toBe("2026-07-01T03:20:00.000Z");
    expect(next?.windowEnd.toISOString()).toBe("2026-07-01T07:20:00.000Z");
  });
});
