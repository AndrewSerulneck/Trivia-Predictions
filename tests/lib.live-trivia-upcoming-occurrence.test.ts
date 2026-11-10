// findUpcomingScheduleOccurrence (away-mode plan, Phase C3): the game a player tapped Remind me / Add to
// calendar on, only if it is really on at that venue — the same enumeration the reminder sweep uses.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, venueFilter: vi.fn() }));

vi.mock("@/lib/supabaseAdmin", () => {
  const query = {
    eq: (column: string, value: string) => {
      mocks.venueFilter(column, value);
      return query;
    },
    in: () => query,
    order: () => query,
    limit: async () => ({ data: mocks.rows, error: null }),
  };
  return { supabaseAdmin: { from: () => ({ select: () => query }) } };
});

import { findUpcomingScheduleOccurrence } from "@/lib/liveShowdownEngine";

const SCHEDULE = "8b1f6a52-1c1e-4d4e-9a63-0d3f7c2b1a90";
// Weekly on Thursdays at 8:00 PM New York, first game 2026-10-01.
const weekly = {
  id: SCHEDULE,
  title: "Live Trivia",
  start_time: "2026-10-02T00:00:00.000Z",
  timezone: "America/New_York",
  recurring_type: "weekly",
  recurring_days: ["thu"],
  num_rounds: 3,
  venue_id: "bar-1",
  intermission_ad_delay_seconds: null,
  lobby_ad_enabled: null,
};
const NOW = Date.parse("2026-11-09T17:00:00Z"); // Monday
const THURSDAY = Date.parse("2026-11-13T01:00:00Z"); // Thu Nov 12, 8:00 PM EST

beforeEach(() => {
  mocks.rows = [weekly];
  mocks.venueFilter.mockClear();
});

describe("findUpcomingScheduleOccurrence", () => {
  it("finds the game Venue Home showed, keyed by its local date, reading only that venue", async () => {
    const found = await findUpcomingScheduleOccurrence("bar-1", SCHEDULE, THURSDAY, NOW);
    expect(found).toMatchObject({ scheduleId: SCHEDULE, venueId: "bar-1", occurrenceDate: "2026-11-12", startMs: THURSDAY });
    expect(mocks.venueFilter).toHaveBeenCalledWith("venue_id", "bar-1");
    // Within a minute of the shown start is the same game.
    expect(await findUpcomingScheduleOccurrence("bar-1", SCHEDULE, THURSDAY + 30_000, NOW)).toMatchObject({ startMs: THURSDAY });
  });

  it("nothing for a start that isn't a game, a game already started, another venue's schedule or a deleted one", async () => {
    expect(await findUpcomingScheduleOccurrence("bar-1", SCHEDULE, THURSDAY + 60 * 60_000, NOW)).toBeNull();
    expect(await findUpcomingScheduleOccurrence("bar-1", SCHEDULE, THURSDAY, THURSDAY + 1)).toBeNull();
    mocks.rows = [{ ...weekly, venue_id: "bar-2" }];
    expect(await findUpcomingScheduleOccurrence("bar-1", SCHEDULE, THURSDAY, NOW)).toBeNull();
    mocks.rows = [];
    expect(await findUpcomingScheduleOccurrence("bar-1", SCHEDULE, THURSDAY, NOW)).toBeNull();
  });
});
