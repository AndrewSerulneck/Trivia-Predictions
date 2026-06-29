import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import {
  enumerateScheduleOccurrences,
  findOccurrencesToSeed,
  type TriviaScheduleRow,
} from "@/lib/liveShowdownEngine";

function makeSchedule(overrides: Partial<TriviaScheduleRow> = {}): TriviaScheduleRow {
  return {
    id: "schedule-1",
    title: "General Saloon",
    // 7:00 PM America/New_York on Sat 2026-06-20 (EDT = UTC-4 → 23:00Z).
    start_time: "2026-06-20T23:00:00.000Z",
    timezone: "America/New_York",
    recurring_type: "weekly",
    recurring_days: ["sat", "sun", "mon"],
    num_rounds: 5,
    venue_id: "venue-riverside",
    intermission_ad_delay_seconds: 10,
    lobby_ad_enabled: true,
    ...overrides,
  };
}

// Makes loadScheduleRows() (admin.from("trivia_schedules").select().order().limit())
// resolve to the provided rows.
function installScheduleRows(rows: TriviaScheduleRow[]) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "trivia_schedules") {
      const result = Promise.resolve({ data: rows, error: null });
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => result),
        then: result.then.bind(result),
      };
      return chain;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("enumerateScheduleOccurrences", () => {
  it("returns an active occurrence and the next night's occurrence when their windows overlap the cron run", () => {
    // Cron fires at 01:00 UTC on Sun 2026-06-28 = Sat 2026-06-27 21:00 EDT, while
    // Saturday's 7pm game (ends ~21:17 EDT) is still inside its round window.
    const nowMs = Date.parse("2026-06-28T01:00:00.000Z");
    const occurrences = enumerateScheduleOccurrences(makeSchedule(), nowMs);
    const dates = occurrences.map((o) => o.occurrenceDate);

    // Both Saturday (active) and Sunday (upcoming) must be present — not just one.
    expect(dates).toContain("2026-06-27");
    expect(dates).toContain("2026-06-28");

    const saturday = occurrences.find((o) => o.occurrenceDate === "2026-06-27")!;
    expect(nowMs).toBeGreaterThanOrEqual(saturday.startMs);
    expect(nowMs).toBeLessThan(saturday.endMs); // Saturday is genuinely still active.
  });

  it("anchors recurring occurrences to local wall-clock time across DST boundaries", () => {
    const daily = makeSchedule({
      recurring_type: "daily",
      recurring_days: null,
      // 7:00 PM America/New_York anchor (Jan 1 2026 7pm EST → 00:00Z next day).
      start_time: "2026-01-02T00:00:00.000Z",
    });

    // Winter (EST, UTC-5): 7pm local = 00:00Z the following calendar day.
    const winter = enumerateScheduleOccurrences(daily, Date.parse("2026-01-15T12:00:00.000Z"));
    const jan15 = winter.find((o) => o.occurrenceDate === "2026-01-15")!;
    expect(jan15).toBeDefined();
    expect(jan15.startMs).toBe(Date.parse("2026-01-16T00:00:00.000Z"));

    // Summer (EDT, UTC-4): same 7pm local wall-clock = 23:00Z the same calendar day.
    const summer = enumerateScheduleOccurrences(daily, Date.parse("2026-07-15T12:00:00.000Z"));
    const jul15 = summer.find((o) => o.occurrenceDate === "2026-07-15")!;
    expect(jul15).toBeDefined();
    expect(jul15.startMs).toBe(Date.parse("2026-07-15T23:00:00.000Z"));
  });

  it("produces exactly one occurrence per active day with no gaps across the spring-forward day", () => {
    const daily = makeSchedule({
      recurring_type: "daily",
      recurring_days: null,
      start_time: "2026-01-02T00:00:00.000Z",
    });
    // DST spring-forward is Sun 2026-03-08 in America/New_York.
    const occurrences = enumerateScheduleOccurrences(daily, Date.parse("2026-03-09T12:00:00.000Z"));
    const dates = occurrences.map((o) => o.occurrenceDate);

    expect(new Set(dates).size).toBe(dates.length); // no duplicate dates
    expect(dates).toContain("2026-03-07");
    expect(dates).toContain("2026-03-08"); // the DST day is neither skipped nor doubled
    expect(dates).toContain("2026-03-09");
  });

  it("treats monthly/yearly schedules as a single fixed start regardless of now", () => {
    const monthly = makeSchedule({ recurring_type: "monthly", recurring_days: null });
    const occurrences = enumerateScheduleOccurrences(monthly, Date.parse("2026-09-01T12:00:00.000Z"));
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]!.occurrenceDate).toBe("2026-06-20");
  });

  it("returns no occurrences when start_time is unparseable", () => {
    expect(enumerateScheduleOccurrences(makeSchedule({ start_time: "" }), Date.now())).toEqual([]);
  });
});

describe("findOccurrencesToSeed", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("seeds every due occurrence (active + upcoming), not just the first match", async () => {
    installScheduleRows([makeSchedule()]);
    // Sat 2026-06-27 21:00 EDT: Saturday's game active, Sunday's within 24h lookahead.
    const targets = await findOccurrencesToSeed(Date.parse("2026-06-28T01:00:00.000Z"));
    const dates = targets.map((t) => t.occurrenceDate).sort();

    expect(dates).toEqual(["2026-06-27", "2026-06-28"]);
    for (const target of targets) {
      expect(target.scheduleId).toBe("schedule-1");
      expect(target.venueId).toBe("venue-riverside");
      expect(target.numRounds).toBe(5);
    }
  });

  it("agrees with enumerateScheduleOccurrences on the active occurrence date", async () => {
    const row = makeSchedule();
    const nowMs = Date.parse("2026-06-28T01:00:00.000Z");
    installScheduleRows([row]);

    const targets = await findOccurrencesToSeed(nowMs);
    const activeOccurrence = enumerateScheduleOccurrences(row, nowMs).find(
      (o) => nowMs >= o.startMs && nowMs < o.endMs
    )!;

    // The seeder (cron) and the occurrence source of truth (which also feeds the
    // live-state resolver + grader) must key the active game to the same date.
    expect(targets.map((t) => t.occurrenceDate)).toContain(activeOccurrence.occurrenceDate);
  });
});
