import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase R1 of docs/cancelled-prizes-pick-windows-away-mode-plan.md: a Live Trivia schedule change
// pays what its venue owes BEFORE trivia_session_questions, live_showdown_answers or
// trivia_schedules is touched (a cancel deletes the game's answers; an edit rewrites when it ran),
// and a refused payout leaves everything as it was. The database is a fake that records each write
// in one shared log with the settle step, so the order is asserted directly.

const log = vi.hoisted(() => [] as string[]);

// The stored row matches what `edit()` sends, so an edit only moves games when a test changes something.
const storedRow = () => ({
  start_time: "2026-11-10T23:00:00.000Z", // Tue 2026-11-10, 6:00 PM Eastern
  timezone: "America/New_York",
  recurring_type: "weekly",
  recurring_days: ["tue"],
  num_rounds: 3,
  venue_id: "venue-1",
});

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  failDeleteOf: null as string | null,
}));

const updatedRow = {
  id: "sched-1",
  title: "Weekday Trivia",
  start_time: "2026-11-10T23:00:00.000Z",
  timezone: "America/New_York",
  recurring_type: "weekly",
  recurring_days: ["tue"],
  num_rounds: 3,
  venue_id: "venue-1",
  intermission_ad_delay_seconds: 10,
  lobby_ad_enabled: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-11-11T00:00:00.000Z",
};

type Result = { data: unknown; error: { message: string } | null };

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "delete" | "update" | "insert" = "select";

  constructor(private readonly table: string) {}

  select = (): FakeQuery => this;
  eq = (): FakeQuery => this;
  delete = (): FakeQuery => {
    this.op = "delete";
    log.push(`delete ${this.table}`);
    return this;
  };
  update = (): FakeQuery => {
    this.op = "update";
    log.push(`update ${this.table}`);
    return this;
  };
  insert = (): FakeQuery => {
    this.op = "insert";
    log.push(`insert ${this.table}`);
    return this;
  };
  maybeSingle = async (): Promise<Result> => {
    log.push(`read ${this.table}`);
    return { data: state.existing, error: null };
  };
  single = async (): Promise<Result> => ({ data: updatedRow, error: null });
  then = <T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> =>
    Promise.resolve(
      this.op === "delete" && state.failDeleteOf === this.table
        ? { data: null, error: { message: `delete ${this.table} failed` } }
        : { data: this.op === "delete" ? [{ id: "sched-1" }] : [], error: null },
    ).then(
      onfulfilled,
      onrejected,
    );
}

const emptyReport = () => ({ pruned: [], deactivated: [], retiredForRecurrenceChange: [], retiredNoGamesLeft: [], errors: [] });

const mocks = vi.hoisted(() => ({
  settleVenueBeforeScheduleChange: vi.fn(),
  cascadeScheduleChangeToRewards: vi.fn(),
  buildLiveTriviaOccurrenceSeedSlots: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (table: string) => new FakeQuery(table) },
}));
vi.mock("@/lib/liveTriviaBroadcast", () => ({ broadcastLiveTrivia: vi.fn(async () => undefined) }));
vi.mock("@/lib/liveShowdownEngine", () => ({
  buildLiveTriviaOccurrenceSeedSlots: mocks.buildLiveTriviaOccurrenceSeedSlots,
  djb2: vi.fn(() => 0),
  getLiveShowdownState: vi.fn(),
  loadActiveLiveTriviaSeedQuestionPool: vi.fn(async () => []),
}));
vi.mock("@/lib/rewardGameSlotCascade", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rewardGameSlotCascade")>();
  return {
    ...actual,
    settleVenueBeforeScheduleChange: mocks.settleVenueBeforeScheduleChange,
    cascadeScheduleChangeToRewards: mocks.cascadeScheduleChangeToRewards,
  };
});

import { readFileSync } from "fs";
import { join } from "path";

import {
  deleteAdminLiveShowdownSchedule,
  previewLiveShowdownScheduleChange,
  scheduleEditMovesGames,
  updateAdminLiveShowdownSchedule,
  venueSchedulesFromRows,
} from "@/lib/liveShowdownAdmin";
import type { TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import { ScheduleChangeSettlementError } from "@/lib/rewardGameSlotCascade";

const edit = (venueId: string, overrides: Partial<Parameters<typeof updateAdminLiveShowdownSchedule>[0]> = {}) =>
  updateAdminLiveShowdownSchedule({
    id: "sched-1",
    title: "Weekday Trivia",
    targetDate: "2026-11-10",
    startTime: "18:00",
    timezone: "America/New_York",
    recurringType: "weekly",
    recurringDays: ["tue", "thu"], // the stored row runs Tue only: this edit adds Thursday
    numRounds: 3,
    venueId,
    ...overrides,
  });

const weekClose = { campaignId: "ranked-1" };

beforeEach(() => {
  log.length = 0;
  state.existing = storedRow();
  state.failDeleteOf = null;
  mocks.buildLiveTriviaOccurrenceSeedSlots.mockReset();
  mocks.settleVenueBeforeScheduleChange.mockReset();
  mocks.settleVenueBeforeScheduleChange.mockImplementation(async (params: { venueId: string }) => {
    log.push(`settle ${params.venueId}`);
    return {
      settledCampaignIds: new Set([`prize-${params.venueId}`]),
      weekCloses: new Map([[`ranked-${params.venueId}`, weekClose]]),
    };
  });
  mocks.cascadeScheduleChangeToRewards.mockReset();
  mocks.cascadeScheduleChangeToRewards.mockImplementation(async (params: { venueId: string }) => {
    log.push(`cascade ${params.venueId}`);
    return emptyReport();
  });
});

describe("cancel: settle, then delete, then cascade", () => {
  it("pays before the questions, answers or schedule are deleted", async () => {
    await deleteAdminLiveShowdownSchedule("sched-1");

    expect(log).toEqual([
      "read trivia_schedules",
      "settle venue-1",
      "delete trivia_session_questions",
      "delete live_showdown_answers",
      "delete trivia_schedules",
      "cascade venue-1",
    ]);
    expect(mocks.settleVenueBeforeScheduleChange).toHaveBeenCalledWith({
      venueId: "venue-1",
      scheduleId: "sched-1",
      change: { survivingWeekdays: [], survivingRecurrence: null, schedule: null },
      nowMs: expect.any(Number),
    });
    // The cascade retires only what the settle confirmed, and pays the ranked early close
    // (R7) only now, after the delete.
    expect(mocks.cascadeScheduleChangeToRewards.mock.calls[0][0].settledCampaignIds).toEqual(new Set(["prize-venue-1"]));
    expect(mocks.cascadeScheduleChangeToRewards.mock.calls[0][0].weekCloses).toEqual(
      new Map([["ranked-venue-1", weekClose]]),
    );
  });

  it("R7: a delete that fails after the settle pays nothing (the cascade, which pays, never runs)", async () => {
    state.failDeleteOf = "trivia_schedules";

    await expect(deleteAdminLiveShowdownSchedule("sched-1")).rejects.toThrow("delete trivia_schedules failed");
    expect(log).toContain("settle venue-1");
    expect(mocks.cascadeScheduleChangeToRewards).not.toHaveBeenCalled();
  });

  it("a refused payout deletes nothing", async () => {
    mocks.settleVenueBeforeScheduleChange.mockRejectedValue(
      new ScheduleChangeSettlementError([{ campaignId: "ranked-1", message: "sweep down" }]),
    );

    await expect(deleteAdminLiveShowdownSchedule("sched-1")).rejects.toBeInstanceOf(ScheduleChangeSettlementError);
    expect(log).toEqual(["read trivia_schedules"]);
    expect(mocks.cascadeScheduleChangeToRewards).not.toHaveBeenCalled();
  });
});

describe("edit and move: the same order", () => {
  it("an edit settles before the schedule row is rewritten", async () => {
    await edit("venue-1");

    expect(log).toEqual(["read trivia_schedules", "settle venue-1", "update trivia_schedules", "cascade venue-1"]);
    const settled = mocks.settleVenueBeforeScheduleChange.mock.calls[0][0].change;
    expect(settled).toMatchObject({
      survivingWeekdays: ["tue", "thu"],
      survivingRecurrence: "weekly",
      schedule: expect.objectContaining({ venueId: "venue-1", recurringDays: ["tue", "thu"] }),
    });
    // R7 finding 4: the cascade after the write is told exactly what the settle was told.
    const cascaded = mocks.cascadeScheduleChangeToRewards.mock.calls[0][0];
    expect(cascaded.survivingWeekdays).toEqual(settled.survivingWeekdays);
    expect(cascaded.survivingRecurrence).toEqual(settled.survivingRecurrence);
    expect(cascaded.weekCloses).toEqual(new Map([["ranked-venue-1", weekClose]]));
  });

  it("a move settles both venues first, the venue it left as a cancel", async () => {
    await edit("venue-2");

    expect(log).toEqual([
      "read trivia_schedules",
      "settle venue-2",
      "settle venue-1",
      "update trivia_schedules",
      "cascade venue-2",
      "cascade venue-1",
    ]);
    expect(mocks.settleVenueBeforeScheduleChange.mock.calls[1][0].change).toMatchObject({
      survivingWeekdays: [],
      survivingRecurrence: null,
    });
    const settled = new Set(["prize-venue-2", "prize-venue-1"]);
    const plans = new Map([
      ["ranked-venue-2", weekClose],
      ["ranked-venue-1", weekClose],
    ]);
    for (const [params] of mocks.cascadeScheduleChangeToRewards.mock.calls) {
      expect(params.settledCampaignIds).toEqual(settled);
      expect(params.weekCloses).toEqual(plans);
    }
  });

  it("a refused payout leaves the schedule as it was", async () => {
    mocks.settleVenueBeforeScheduleChange.mockRejectedValue(new ScheduleChangeSettlementError([]));

    await expect(edit("venue-1")).rejects.toBeInstanceOf(ScheduleChangeSettlementError);
    expect(log).toEqual(["read trivia_schedules"]);
  });
});

describe("R7: edits that move no game, and a rounds change that can't build its questions", () => {
  it("a rename makes one trivia_schedules read and the update: no settle, no cascade", async () => {
    const result = await edit("venue-1", { title: "Renamed Trivia", recurringDays: ["tue"] });

    expect(log).toEqual(["read trivia_schedules", "update trivia_schedules"]);
    expect(mocks.settleVenueBeforeScheduleChange).not.toHaveBeenCalled();
    expect(mocks.cascadeScheduleChangeToRewards).not.toHaveBeenCalled();
    expect(result.rewardCascade).toEqual(emptyReport());
  });

  it.each([
    ["start time", { startTime: "19:00", recurringDays: ["tue"] }],
    ["timezone", { timezone: "America/Chicago", recurringDays: ["tue"] }],
    ["recurrence", { recurringType: "daily" as const, recurringDays: ["tue"] }],
    ["days", { recurringDays: ["tue", "thu"] }],
    ["venue", { recurringDays: ["tue"] }, "venue-2"],
  ])("a change of %s still settles", async (_label, overrides, venueId = "venue-1") => {
    await edit(venueId, overrides);

    expect(mocks.settleVenueBeforeScheduleChange).toHaveBeenCalled();
  });

  it("the rounds changing builds the question matrix BEFORE the settle; a matrix failure pays and writes nothing", async () => {
    mocks.buildLiveTriviaOccurrenceSeedSlots.mockImplementation(() => {
      log.push("build matrix");
      throw new Error("No eligible Live Showdown categories");
    });

    await expect(edit("venue-1", { numRounds: 4, recurringDays: ["tue"] })).rejects.toThrow(
      "No eligible Live Showdown categories",
    );
    expect(log).toEqual(["read trivia_schedules", "build matrix"]);
    expect(mocks.settleVenueBeforeScheduleChange).not.toHaveBeenCalled();
    expect(mocks.cascadeScheduleChangeToRewards).not.toHaveBeenCalled();
  });

  it("a rounds change that builds its matrix settles, then replaces the questions, then updates", async () => {
    mocks.buildLiveTriviaOccurrenceSeedSlots.mockImplementation(() => {
      log.push("build matrix");
      return { slots: Array.from({ length: 60 }, (_, i) => ({ slug: `q-${i}` })) };
    });

    await edit("venue-1", { numRounds: 4, recurringDays: ["tue"] });

    expect(log).toEqual([
      "read trivia_schedules",
      "build matrix",
      "settle venue-1",
      "delete trivia_session_questions",
      "insert trivia_session_questions",
      "update trivia_schedules",
      "cascade venue-1",
    ]);
  });

  it("the cancel-warning preview of a rename runs no dry run", async () => {
    const preview = await previewLiveShowdownScheduleChange({
      scheduleId: "sched-1",
      edit: {
        targetDate: "2026-11-10",
        startTime: "18:00",
        timezone: "America/New_York",
        recurringType: "weekly",
        recurringDays: ["tue"],
        numRounds: 3,
        venueId: "venue-1",
      },
    });

    expect(preview).toEqual({ ending: [], shrinking: [] });
    expect(log).toEqual(["read trivia_schedules"]);
  });

  it("the update has no fallback for a database without the recurrence columns (finding 4)", () => {
    const source = readFileSync(join(process.cwd(), "lib/liveShowdownAdmin.ts"), "utf8");
    const updateFn = source.slice(
      source.indexOf("export async function updateAdminLiveShowdownSchedule"),
      source.indexOf("export async function deleteAdminLiveShowdownSchedule"),
    );
    expect(updateFn).not.toContain("isMissingRecurringColumnError");
    expect(updateFn).not.toContain("legacy");
    // One set of cascade inputs, computed once, for the settle and the cascade.
    expect(updateFn.match(/editCascadeInputs\(/g)).toHaveLength(1);
  });
});

describe("R7 helpers", () => {
  const NOW = new Date("2026-11-11T17:00:00.000Z");
  const row = (id: string, overrides: Partial<TriviaScheduleRow> = {}): TriviaScheduleRow => ({
    id,
    title: "Trivia",
    start_time: "2026-10-01T23:00:00.000Z",
    timezone: "America/New_York",
    recurring_type: "weekly",
    recurring_days: ["tue"],
    num_rounds: 3,
    venue_id: "venue-1",
    intermission_ad_delay_seconds: 10,
    lobby_ad_enabled: true,
    ...overrides,
  });

  it("venueSchedulesFromRows mirrors listVenueLiveShowdownSchedules' SQL filter", () => {
    const kept = venueSchedulesFromRows(
      [
        row("weekly-old"),
        row("one-off-yesterday", { recurring_type: "none", start_time: "2026-11-10T23:00:00.000Z" }),
        row("one-off-ahead", { recurring_type: "none", start_time: "2026-11-13T01:00:00.000Z" }),
        row("one-off-last-week", { recurring_type: "none", start_time: "2026-11-04T23:00:00.000Z" }),
        row("null-type-old", { recurring_type: null }), // `recurring_type <> 'none'` is not true for null
        row("other-venue", { venue_id: "venue-2" }),
      ],
      ["venue-1"],
      NOW,
    );

    // Newest start first, as the SQL orders.
    expect(kept.map((schedule) => schedule.id)).toEqual(["one-off-ahead", "one-off-yesterday", "weekly-old"]);
  });

  it("scheduleEditMovesGames: unchanged timing is no move, a missing row is a move", () => {
    const next = {
      startTimeIso: "2026-11-10T23:00:00.000Z",
      timezone: "America/New_York",
      recurringType: "weekly" as const,
      recurringDays: ["tue"],
      numRounds: 3,
      venueId: "venue-1",
    };
    const stored = { ...storedRow(), start_time: "2026-11-10T23:00:00+00:00", recurring_type: "weekly" as const };

    expect(scheduleEditMovesGames(stored, next)).toBe(false);
    expect(scheduleEditMovesGames({ ...stored, recurring_days: ["TUE"] }, next)).toBe(false);
    expect(scheduleEditMovesGames(stored, { ...next, numRounds: 4 })).toBe(true);
    expect(scheduleEditMovesGames(null, next)).toBe(true);
  });
});
