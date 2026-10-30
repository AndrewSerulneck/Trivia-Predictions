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
  listScheduleWindowOccurrences,
  utcIsoToDatetimeLocalValue,
} from "@/lib/categoryBlitzScheduleTime";
import {
  getNextScheduleOccurrence,
  isWindowOpen,
  nextOccurrence,
  openScheduleWindow,
  openScheduleWindowEnd,
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

  it("opens daily recurring windows at the same venue-local wall-clock time", () => {
    const schedule = makeSchedule({
      recurringType: "daily",
      windowMinutes: 240,
    });
    const now = new Date("2026-07-03T04:00:00.000Z");

    const occurrence = getCurrentOrNextScheduleWindow(schedule, now);
    expect(occurrence?.windowStart.toISOString()).toBe("2026-07-03T03:20:00.000Z");
    expect(occurrence?.windowEnd.toISOString()).toBe("2026-07-03T07:20:00.000Z");
    expect(occurrence?.occurrenceDate).toBe("2026-07-02");
    expect(isScheduleWindowOpen(schedule, now)).toBe(true);
  });

  it("opens weekly recurring windows on one selected weekday", () => {
    const schedule = makeSchedule({
      recurringType: "weekly",
      recurringDays: ["thu"],
      windowMinutes: 240,
    });
    const now = new Date("2026-07-02T12:00:00.000Z");

    const occurrence = getCurrentOrNextScheduleWindow(schedule, now);
    expect(occurrence?.windowStart.toISOString()).toBe("2026-07-03T03:20:00.000Z");
    expect(occurrence?.windowEnd.toISOString()).toBe("2026-07-03T07:20:00.000Z");
    expect(occurrence?.occurrenceDate).toBe("2026-07-02");
    expect(isScheduleWindowOpen(schedule, now)).toBe(false);
  });

  it("opens weekly recurring windows on multiple selected weekdays", () => {
    const schedule = makeSchedule({
      recurringType: "weekly",
      recurringDays: ["thu", "sat"],
      windowMinutes: 240,
    });
    const now = new Date("2026-07-03T04:00:00.000Z");

    const active = getCurrentOrNextScheduleWindow(schedule, now);
    expect(active?.windowStart.toISOString()).toBe("2026-07-03T03:20:00.000Z");
    expect(active?.windowEnd.toISOString()).toBe("2026-07-03T07:20:00.000Z");
    expect(isScheduleWindowOpen(schedule, now)).toBe(true);

    const afterThursdayWindow = new Date("2026-07-03T08:00:00.000Z");
    const next = getCurrentOrNextScheduleWindow(schedule, afterThursdayWindow);
    expect(next?.windowStart.toISOString()).toBe("2026-07-05T03:20:00.000Z");
    expect(next?.windowEnd.toISOString()).toBe("2026-07-05T07:20:00.000Z");
    expect(next?.occurrenceDate).toBe("2026-07-04");
  });

  it("falls back to the original start weekday when a weekly schedule has no selected days", () => {
    const schedule = makeSchedule({
      recurringType: "weekly",
      recurringDays: [],
      windowMinutes: 240,
    });
    const now = new Date("2026-07-02T12:00:00.000Z");

    const occurrence = getCurrentOrNextScheduleWindow(schedule, now);
    expect(occurrence?.windowStart.toISOString()).toBe("2026-07-08T03:20:00.000Z");
    expect(occurrence?.windowEnd.toISOString()).toBe("2026-07-08T07:20:00.000Z");
    expect(occurrence?.occurrenceDate).toBe("2026-07-07");
  });

  it("normalizes weekly recurring days and ignores invalid entries", () => {
    const schedule = makeSchedule({
      recurringType: "weekly",
      recurringDays: ["THU", "nonsense", "thu", "sat"],
      windowMinutes: 240,
    });
    const now = new Date("2026-07-02T12:00:00.000Z");

    const occurrences = listScheduleWindowOccurrences(schedule, now);
    const starts = occurrences.map((occurrence) => occurrence.windowStart.toISOString());
    expect(starts).toContain("2026-07-03T03:20:00.000Z");
    expect(starts).toContain("2026-07-05T03:20:00.000Z");
    expect(starts.filter((start) => start === "2026-07-03T03:20:00.000Z")).toHaveLength(1);
  });

  it("keeps helper APIs in agreement for an active recurring window", () => {
    const schedule = makeSchedule({
      recurringType: "weekly",
      recurringDays: ["thu"],
      windowMinutes: 240,
    });
    const now = new Date("2026-07-03T04:00:00.000Z");

    const occurrence = getCurrentOrNextScheduleWindow(schedule, now);
    const next = getNextScheduleOccurrence([schedule], now);

    expect(nextOccurrence(schedule, now)?.toISOString()).toBe(occurrence?.windowStart.toISOString());
    expect(isWindowOpen(schedule, now)).toBe(isScheduleWindowOpen(schedule, now));
    expect(next?.windowStart.toISOString()).toBe(occurrence?.windowStart.toISOString());
    expect(next?.windowEnd.toISOString()).toBe(occurrence?.windowEnd.toISOString());
  });
});

// docs/category-blitz-letter-die-plan.md Phase 12.1b/c: both scheduled engines and
// the sessions API read tonight's window through openScheduleWindow. Before 12.1
// the cron derived its end as `nextOccurrence + windowMinutes`; these schedules
// prove that equals the shared lookup for any stored row (window_minutes is an
// int >= 1, migration 20260701041000; a one-off's endTime is derived from it by
// toSchedule, so fixtures keep the two consistent), so the switch changes no
// real session.
describe("openScheduleWindow (one open-window lookup)", () => {
  const MIN = 60_000;
  const cases: Array<{ name: string; schedule: CategoryBlitzSchedule; start: string }> = [
    {
      name: "one-off evening window",
      schedule: makeSchedule({ startTime: "2026-07-01T23:00:00.000Z", endTime: "2026-07-02T00:00:00.000Z", windowMinutes: 60 }),
      start: "2026-07-01T23:00:00.000Z",
    },
    {
      name: "daily window crossing local midnight (10 pm–1 am New York)",
      schedule: makeSchedule({
        startTime: "2026-07-01T02:00:00.000Z",
        endTime: "2026-07-01T05:00:00.000Z",
        recurringType: "daily",
        windowMinutes: 180,
      }),
      start: "2026-07-03T02:00:00.000Z",
    },
    {
      name: "weekly window crossing midnight in Los Angeles",
      schedule: makeSchedule({
        startTime: "2026-07-03T06:30:00.000Z",
        endTime: "2026-07-03T08:30:00.000Z",
        timezone: "America/Los_Angeles",
        recurringType: "weekly",
        recurringDays: ["thu"],
        windowMinutes: 120,
      }),
      start: "2026-07-10T06:30:00.000Z",
    },
    {
      name: "daily window across the autumn clock change (Nov 1 2026, New York)",
      schedule: makeSchedule({
        startTime: "2026-10-01T04:30:00.000Z",
        endTime: "2026-10-01T08:30:00.000Z",
        recurringType: "daily",
        windowMinutes: 240,
      }),
      start: "2026-11-01T04:30:00.000Z",
    },
  ];

  for (const { name, schedule, start } of cases) {
    it(`${name}: same window as the cron's old nextOccurrence + windowMinutes`, () => {
      const startMs = Date.parse(start);
      const probes = [0, 1, schedule.windowMinutes * MIN / 2, schedule.windowMinutes * MIN - 1];
      for (const offset of probes) {
        const now = new Date(startMs + offset);
        expect(isWindowOpen(schedule, now)).toBe(true);
        const open = openScheduleWindow([schedule], now);
        const oldStart = nextOccurrence(schedule, now);
        expect(open?.schedule).toBe(schedule);
        expect(open?.occurrence.windowStart.toISOString()).toBe(start);
        expect(oldStart?.toISOString()).toBe(start);
        expect(open?.occurrence.windowEnd.getTime()).toBe(oldStart!.getTime() + schedule.windowMinutes * MIN);
        expect(openScheduleWindowEnd([schedule], now)?.getTime()).toBe(open?.occurrence.windowEnd.getTime());
      }
    });
  }

  it("null when no window is open, including at the exact end", () => {
    const schedule = cases[0].schedule;
    expect(openScheduleWindow([schedule], new Date("2026-07-01T22:59:59.999Z"))).toBeNull();
    expect(openScheduleWindow([schedule], new Date("2026-07-02T00:00:00.000Z"))).toBeNull();
    expect(openScheduleWindowEnd([schedule], new Date("2026-07-02T00:00:00.000Z"))).toBeNull();
    expect(openScheduleWindow([], new Date("2026-07-01T23:30:00.000Z"))).toBeNull();
  });

  it("the first open schedule wins, as the engine's old schedules.find(isWindowOpen) did", () => {
    const closed = makeSchedule({ id: "closed", startTime: "2026-07-05T23:00:00.000Z", endTime: "2026-07-06T00:00:00.000Z", windowMinutes: 60 });
    const first = makeSchedule({ id: "first", startTime: "2026-07-01T23:00:00.000Z", endTime: "2026-07-02T00:00:00.000Z", windowMinutes: 60 });
    const second = makeSchedule({ id: "second", startTime: "2026-07-01T22:30:00.000Z", endTime: "2026-07-02T00:30:00.000Z", windowMinutes: 120 });
    const now = new Date("2026-07-01T23:30:00.000Z");
    expect(openScheduleWindow([closed, first, second], now)?.schedule.id).toBe("first");
    expect(openScheduleWindow([closed, second, first], now)?.schedule.id).toBe("second");
  });
});
