import { describe, expect, it } from "vitest";
import {
  dateChip,
  displayWindow,
  formatScheduleTime,
  recurrenceLabel,
  splitSchedules,
} from "@/lib/ownerScheduleDisplay";
import type { OwnerSchedule } from "@/types";

const schedule = (overrides: Partial<OwnerSchedule> = {}): OwnerSchedule => ({
  id: "s1",
  venueId: "v1",
  title: "Live Trivia",
  startTime: "2026-10-03T20:00:00.000Z",
  endTime: "2026-10-03T21:30:00.000Z",
  timezone: "America/New_York",
  recurringType: "none",
  recurringDays: [],
  windowMinutes: 90,
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  gameType: "live_trivia",
  ...overrides,
});

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

describe("recurrenceLabel", () => {
  it("is null for one-off schedules", () => {
    expect(recurrenceLabel(schedule())).toBeNull();
  });
  it("labels daily", () => {
    expect(recurrenceLabel(schedule({ recurringType: "daily" }))).toBe("Daily");
  });
  it("lists weekly days in week order, not selection order", () => {
    expect(recurrenceLabel(schedule({ recurringType: "weekly", recurringDays: ["sat", "fri"] }))).toBe(
      "Weekly · Fri, Sat",
    );
  });
  it("falls back to plain Weekly with no days", () => {
    expect(recurrenceLabel(schedule({ recurringType: "weekly", recurringDays: [] }))).toBe("Weekly");
  });
});

describe("dateChip / formatScheduleTime", () => {
  it("renders in the schedule's timezone, not the runner's", () => {
    // 2026-10-04T02:00Z is still Oct 3 in New York but already Oct 4 in UTC.
    expect(dateChip("2026-10-04T02:00:00.000Z", "America/New_York")).toEqual({ month: "OCT", day: "3" });
    expect(dateChip("2026-10-04T02:00:00.000Z", "UTC")).toEqual({ month: "OCT", day: "4" });
  });
  it("formats a 12-hour time", () => {
    expect(formatScheduleTime("2026-10-03T20:00:00.000Z", "America/New_York")).toBe("Oct 3, 4:00 PM");
  });
  it("degrades to a dash / the raw string on a bad timezone", () => {
    expect(dateChip("2026-10-03T20:00:00.000Z", "Not/AZone")).toEqual({ month: "—", day: "—" });
    expect(formatScheduleTime("2026-10-03T20:00:00.000Z", "Not/AZone")).toBe("2026-10-03T20:00:00.000Z");
  });
});

describe("displayWindow", () => {
  it("returns the stored window for a one-off", () => {
    const s = schedule();
    expect(displayWindow(s)).toEqual({ startTime: s.startTime, endTime: s.endTime });
  });
});

describe("splitSchedules", () => {
  it("puts future one-offs in upcoming (soonest first) and ended ones in past (newest first)", () => {
    const later = schedule({ id: "later", startTime: "2026-10-10T20:00:00.000Z", endTime: "2026-10-10T21:00:00.000Z" });
    const soon = schedule({ id: "soon" });
    const old1 = schedule({ id: "old1", startTime: "2026-09-01T20:00:00.000Z", endTime: "2026-09-01T21:00:00.000Z" });
    const old2 = schedule({ id: "old2", startTime: "2026-09-15T20:00:00.000Z", endTime: "2026-09-15T21:00:00.000Z" });
    const { upcoming, past } = splitSchedules([later, old1, soon, old2], NOW);
    expect(upcoming.map((s) => s.id)).toEqual(["soon", "later"]);
    expect(past.map((s) => s.id)).toEqual(["old2", "old1"]);
  });

  it("keeps a weekly series whose first occurrence has passed in upcoming", () => {
    const weekly = schedule({
      id: "weekly",
      startTime: "2026-06-05T20:00:00.000Z",
      endTime: "2026-06-05T21:30:00.000Z",
      recurringType: "weekly",
      recurringDays: ["fri"],
    });
    const { upcoming, past } = splitSchedules([weekly], NOW);
    expect(upcoming.map((s) => s.id)).toEqual(["weekly"]);
    expect(past).toEqual([]);
  });

  it("returns empty buckets for no schedules", () => {
    expect(splitSchedules([], NOW)).toEqual({ upcoming: [], past: [] });
  });
});
