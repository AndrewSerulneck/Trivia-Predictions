import { describe, expect, it } from "vitest";
import {
  datetimeLocalValueToUtcIso,
  utcIsoToDatetimeLocalValue,
} from "@/lib/categoryBlitzScheduleTime";
import { gameDurationMinutes } from "@/lib/categoryBlitzShared";
import { liveTriviaDurationMinutes } from "@/lib/liveTriviaShared";
import {
  buildScheduleRequest,
  durationMinutesFor,
  effectiveTitle,
  endsAtLocalLabel,
  formatLocalDateTime,
  initialScheduleFormState,
  pickDefaultTimezone,
  repeatError,
  repeatSummary,
  resolveScheduleStep,
  roundsFromWindowMinutesFor,
  safeRounds,
  scheduleFormStateFromSchedule,
  scheduleGameOptions,
  scheduleSteps,
  SCHEDULE_SLIDE_ORDER,
  toggleDay,
  WEEKLY_DAYS_REQUIRED_MESSAGE,
  type ScheduleFormState,
} from "@/lib/ownerScheduleForm";
import { stepDirection } from "@/lib/ownerSheetParams";
import type { CategoryBlitzRecurringType, OwnerSchedule, OwnerScheduleGameType } from "@/types";

// docs/partner-dashboard-app-redesign-plan.md Phase 4.

const BOTH = scheduleGameOptions(false);
const LIVE_ONLY = scheduleGameOptions(true);

describe("scheduleGameOptions", () => {
  it("drops Category Blitz once the continuous default is on", () => {
    expect(BOTH.map((o) => o.value)).toEqual(["category_blitz", "live_trivia"]);
    expect(LIVE_ONLY.map((o) => o.value)).toEqual(["live_trivia"]);
  });
});

describe("scheduleSteps", () => {
  it("skips Game when only one game can be scheduled", () => {
    expect(scheduleSteps({ gameOptions: LIVE_ONLY, gameType: "live_trivia" })).toEqual(["when", "repeat", "review"]);
  });

  it("keeps Game when there is a choice", () => {
    expect(scheduleSteps({ gameOptions: BOTH, gameType: "live_trivia" })).toEqual(["game", "when", "repeat", "review"]);
  });

  it("skips Repeat for a game that cannot recur", () => {
    expect(scheduleSteps({ gameOptions: BOTH, gameType: "category_blitz" })).toEqual(["game", "when", "review"]);
  });

  it("skips Game when editing, even with a choice (the game type can't change)", () => {
    expect(scheduleSteps({ gameOptions: BOTH, gameType: "live_trivia", isEditing: true })).toEqual([
      "when",
      "repeat",
      "review",
    ]);
  });

  it("does not count an unsupported option as a choice", () => {
    const options = [
      { value: "category_blitz" as const, supported: false },
      { value: "live_trivia" as const, supported: true },
    ];
    expect(scheduleSteps({ gameOptions: options, gameType: "live_trivia" })[0]).toBe("when");
  });
});

describe("resolveScheduleStep", () => {
  const steps = scheduleSteps({ gameOptions: LIVE_ONLY, gameType: "live_trivia" });
  const resolve = (rawStep: string | null, hasSchedule = false, hasStartTime = true) =>
    resolveScheduleStep({ rawStep, steps, hasSchedule, hasStartTime });

  it("opens on the first flow step when there is no step", () => {
    expect(resolve(null)).toBe("when");
  });

  it("lands a skipped or unknown step on the first flow step", () => {
    expect(resolve("game")).toBe("when");
    expect(resolve("nonsense")).toBe("when");
  });

  it("keeps the extra screens", () => {
    expect(resolve("all")).toBe("all");
    expect(resolve("history")).toBe("history");
    expect(resolve("detail", true)).toBe("detail");
  });

  it("falls back to the list when detail has no game (e.g. after a reload)", () => {
    expect(resolve("detail", false)).toBe("all");
  });

  it("sends repeat/review back to When while no start time is picked", () => {
    expect(resolve("repeat", false, false)).toBe("when");
    expect(resolve("review", false, false)).toBe("when");
    expect(resolve("review", false, true)).toBe("review");
  });
});

describe("slide order", () => {
  const dir = (from: Parameters<typeof stepDirection>[1], to: Parameters<typeof stepDirection>[2]) =>
    stepDirection(SCHEDULE_SLIDE_ORDER, from, to);

  it("slides forward into the flow and history, backward out of them", () => {
    expect(dir("all", "detail")).toBe(1);
    expect(dir("detail", "review")).toBe(1);
    expect(dir("review", "detail")).toBe(-1);
    expect(dir("all", "when")).toBe(1);
    expect(dir("when", "history")).toBe(1);
    expect(dir("history", "all")).toBe(-1);
    expect(dir("history", "when")).toBe(-1);
    expect(dir("repeat", "when")).toBe(-1);
  });
});

describe("form state", () => {
  it("defaults to the first game, an untouched title, and three rounds", () => {
    const form = initialScheduleFormState({ gameOptions: LIVE_ONLY });
    expect(form).toMatchObject({ gameType: "live_trivia", title: null, startTime: "", rounds: 3, recurringType: "none" });
  });

  it("uses the browser timezone only when we offer it", () => {
    expect(pickDefaultTimezone("America/Chicago")).toBe("America/Chicago");
    expect(pickDefaultTimezone("Europe/Paris")).toBe("America/New_York");
    expect(pickDefaultTimezone(null)).toBe("America/New_York");
    expect(initialScheduleFormState({ gameOptions: BOTH, browserTimeZone: "America/Denver" }).timezone).toBe(
      "America/Denver",
    );
  });

  it("prefills the title with the game's name so it can't block saving", () => {
    const form = initialScheduleFormState({ gameOptions: LIVE_ONLY });
    expect(effectiveTitle(form)).toBe("Live Trivia");
    expect(effectiveTitle({ ...form, title: "  " })).toBe("Live Trivia");
    expect(effectiveTitle({ ...form, title: " Trivia Tuesday " })).toBe("Trivia Tuesday");
  });

  it("safeRounds clamps to a whole number of at least 1", () => {
    expect(safeRounds(0)).toBe(1);
    expect(safeRounds(-4)).toBe(1);
    expect(safeRounds(Number.NaN)).toBe(1);
    expect(safeRounds(2.9)).toBe(2);
    expect(safeRounds(5)).toBe(5);
  });

  it("toggleDay adds and removes without mutating", () => {
    const days = ["fri"];
    expect(toggleDay(days, "sat")).toEqual(["fri", "sat"]);
    expect(toggleDay(days, "fri")).toEqual([]);
    expect(days).toEqual(["fri"]);
  });

  it("prefills the edit form from a stored schedule (start in the schedule's timezone)", () => {
    const form = scheduleFormStateFromSchedule(makeSchedule());
    expect(form.title).toBe("Friday Trivia");
    expect(form.startTime).toBe("2026-10-02T20:00");
    expect(form.timezone).toBe("America/New_York");
    expect(form.recurringType).toBe("weekly");
    expect(form.recurringDays).toEqual(["fri"]);
    expect(form.rounds).toBe(3);
  });
});

describe("time display", () => {
  it("formats a datetime-local value as wall-clock time, with no timezone shift", () => {
    expect(formatLocalDateTime("2026-10-03T20:00")).toBe("Sat, Oct 3 · 8:00 PM");
    expect(formatLocalDateTime("2026-10-03T00:05")).toBe("Sat, Oct 3 · 12:05 AM");
    expect(formatLocalDateTime("garbage")).toBe("garbage");
  });

  it("previews the end from the start and duration, and is null until a start is picked", () => {
    expect(endsAtLocalLabel("", "America/New_York", 40)).toBeNull();
    const minutes = liveTriviaDurationMinutes(3);
    const label = endsAtLocalLabel("2026-10-03T20:00", "America/New_York", minutes);
    expect(label).toMatch(/^2026-10-03 · 2\d:\d\d$|^2026-10-04 · \d\d:\d\d$/);
  });
});

describe("repeatSummary", () => {
  const base = { gameType: "live_trivia" as const, recurringDays: ["sat", "fri"] };
  it("words each repeat option, days in week order", () => {
    expect(repeatSummary({ ...base, recurringType: "none" })).toBe("Just once");
    expect(repeatSummary({ ...base, recurringType: "daily" })).toBe("Every day");
    expect(repeatSummary({ ...base, recurringType: "weekly" })).toBe("Every week on Fri, Sat");
    expect(repeatSummary({ ...base, recurringType: "weekly", recurringDays: [] })).toBe("Every week");
  });
  it("is always 'Just once' for a game that can't recur", () => {
    expect(repeatSummary({ ...base, gameType: "category_blitz", recurringType: "weekly" })).toBe("Just once");
  });
});

describe("repeatError", () => {
  it("blocks weekly with no days, for Live Trivia only", () => {
    const weekly = { gameType: "live_trivia" as const, recurringType: "weekly" as const, recurringDays: [] };
    expect(repeatError(weekly)).toBe(WEEKLY_DAYS_REQUIRED_MESSAGE);
    expect(repeatError({ ...weekly, recurringDays: ["fri"] })).toBeNull();
    expect(repeatError({ ...weekly, recurringType: "daily" })).toBeNull();
    expect(repeatError({ ...weekly, gameType: "category_blitz" })).toBeNull();
  });
});

// ─── Equivalence with the old form ─────────────────────────────────────────

/**
 * ORACLE: the request-building half of the old ScheduleForm.handleSave in
 * app/owner/schedule/page.tsx (deleted in Phase 4), copied verbatim apart from
 * returning the request instead of calling fetch, and taking the title as already
 * chosen. If the new builder ever disagrees with this, the redesign changed what
 * partners send to the server.
 */
const oldHandleSave = (input: {
  venueId: string;
  editing: { id: string } | null;
  gameType: OwnerScheduleGameType;
  title: string;
  startTime: string;
  rounds: number;
  timezone: string;
  recurringType: CategoryBlitzRecurringType;
  recurringDays: string[];
}) => {
  const { venueId, editing, gameType, title, startTime, rounds, timezone, recurringType, recurringDays } = input;
  const safe = Math.max(1, Math.floor(rounds) || 1);
  const durationMinutes = gameType === "live_trivia" ? liveTriviaDurationMinutes(safe) : gameDurationMinutes(safe);
  const supportsRecurrence = gameType === "live_trivia";
  if (!title.trim() || !startTime) return { error: "Title and start time are required." };
  if (supportsRecurrence && recurringType === "weekly" && recurringDays.length === 0) {
    return { error: "Select at least one day for weekly recurring schedules." };
  }
  const outgoingRecurringType = supportsRecurrence ? recurringType : "none";
  const outgoingRecurringDays = supportsRecurrence && recurringType === "weekly" ? recurringDays : [];
  const startIso = datetimeLocalValueToUtcIso(startTime, timezone);
  const endIso = new Date(Date.parse(startIso) + durationMinutes * 60_000).toISOString();
  const endLocal = utcIsoToDatetimeLocalValue(endIso, timezone);
  return editing
    ? {
        method: "PATCH",
        url: `/api/owner/schedule/${editing.id}`,
        body: {
          title: title.trim(),
          startTime,
          endTime: endLocal,
          timezone,
          rounds: safe,
          recurringType: outgoingRecurringType,
          recurringDays: outgoingRecurringDays,
        },
      }
    : {
        method: "POST",
        url: "/api/owner/schedule",
        body: {
          venueId,
          title: title.trim(),
          startTime,
          endTime: endLocal,
          timezone,
          gameType,
          rounds: safe,
          recurringType: outgoingRecurringType,
          recurringDays: outgoingRecurringDays,
        },
      };
};

const makeSchedule = (overrides: Partial<OwnerSchedule> = {}): OwnerSchedule =>
  ({
    id: "sched-1",
    venueId: "venue-1",
    title: "Friday Trivia",
    startTime: "2026-10-03T00:00:00.000Z", // Fri Oct 2, 8:00 PM in New York (EDT)
    endTime: "2026-10-03T00:40:00.000Z",
    timezone: "America/New_York",
    recurringType: "weekly",
    recurringDays: ["fri"],
    windowMinutes: liveTriviaDurationMinutes(3),
    gameType: "live_trivia",
    ...overrides,
  }) as OwnerSchedule;

const formOf = (overrides: Partial<ScheduleFormState> & { title: string }): ScheduleFormState => ({
  gameType: "live_trivia",
  startTime: "2026-10-09T20:00",
  rounds: 3,
  timezone: "America/New_York",
  recurringType: "none",
  recurringDays: [],
  ...overrides,
});

describe("buildScheduleRequest matches the old form's handleSave", () => {
  const cases: { name: string; form: ScheduleFormState; editing: { id: string } | null }[] = [
    { name: "one-off Live Trivia, 3 rounds", form: formOf({ title: "Trivia Night" }), editing: null },
    {
      name: "weekly Live Trivia on Fri+Sat",
      form: formOf({ title: "Weekend Trivia", recurringType: "weekly", recurringDays: ["fri", "sat"], rounds: 5 }),
      editing: null,
    },
    { name: "daily Live Trivia", form: formOf({ title: "Daily", recurringType: "daily" }), editing: null },
    {
      name: "Category Blitz ignores recurrence (one-off, no days)",
      form: formOf({ title: "Blitz", gameType: "category_blitz", recurringType: "weekly", recurringDays: ["mon"] }),
      editing: null,
    },
    {
      name: "spans midnight (end lands on the next day)",
      form: formOf({ title: "Late", startTime: "2026-10-09T23:45", rounds: 4 }),
      editing: null,
    },
    {
      name: "Central time",
      form: formOf({ title: "Chi", timezone: "America/Chicago", startTime: "2026-10-09T19:30" }),
      editing: null,
    },
    {
      name: "spring-forward DST gap day (New York, 2027-03-14)",
      form: formOf({ title: "Dst", startTime: "2027-03-14T01:30", rounds: 6 }),
      editing: null,
    },
    {
      name: "fall-back DST day (Los Angeles, 2026-11-01)",
      form: formOf({ title: "Dst2", timezone: "America/Los_Angeles", startTime: "2026-11-01T00:30", rounds: 6 }),
      editing: null,
    },
    {
      name: "rounds that need clamping",
      form: formOf({ title: "Clamp", rounds: 0 }),
      editing: null,
    },
    {
      name: "fractional rounds",
      form: formOf({ title: "Frac", rounds: 2.7 }),
      editing: null,
    },
    { name: "title is trimmed", form: formOf({ title: "   Padded   " }), editing: null },
    { name: "edit (PATCH, no venueId/gameType)", form: formOf({ title: "Edited" }), editing: { id: "sched-9" } },
    {
      name: "edit a weekly schedule",
      form: formOf({ title: "Edited weekly", recurringType: "weekly", recurringDays: ["thu"] }),
      editing: { id: "sched-9" },
    },
  ];

  for (const { name, form, editing } of cases) {
    it(name, () => {
      const oracle = oldHandleSave({
        venueId: "venue-1",
        editing,
        gameType: form.gameType,
        title: form.title ?? "",
        startTime: form.startTime,
        rounds: form.rounds,
        timezone: form.timezone,
        recurringType: form.recurringType,
        recurringDays: form.recurringDays,
      });
      const built = buildScheduleRequest({ venueId: "venue-1", editingId: editing?.id ?? null, form });
      if ("error" in oracle) throw new Error("oracle unexpectedly failed");
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.method).toBe(oracle.method);
      expect(built.url).toBe(oracle.url);
      // Same keys, same values, same order (order is what JSON.stringify sends).
      expect(JSON.stringify(built.body)).toBe(JSON.stringify(oracle.body));
    });
  }

  it("uses the game's name when the title is blank (the old form refused to save)", () => {
    const built = buildScheduleRequest({
      venueId: "venue-1",
      editingId: null,
      form: formOf({ title: "" }),
    });
    expect(built.ok && built.body.title).toBe("Live Trivia");
  });

  it("refuses the same invalid input the old form refused", () => {
    expect(buildScheduleRequest({ venueId: "v", editingId: null, form: formOf({ title: "x", startTime: "" }) })).toEqual({
      ok: false,
      error: "Pick a start date and time.",
    });
    expect(
      buildScheduleRequest({
        venueId: "v",
        editingId: null,
        form: formOf({ title: "x", recurringType: "weekly", recurringDays: [] }),
      }),
    ).toEqual({ ok: false, error: "Select at least one day for weekly recurring schedules." });
  });

  it("does not refuse weekly-with-no-days for a game that can't recur", () => {
    const built = buildScheduleRequest({
      venueId: "v",
      editingId: null,
      form: formOf({ title: "x", gameType: "category_blitz", recurringType: "weekly", recurringDays: [] }),
    });
    expect(built.ok).toBe(true);
  });

  it("reports the UTC start so the caller can word the confirmation", () => {
    const built = buildScheduleRequest({ venueId: "v", editingId: null, form: formOf({ title: "x" }) });
    expect(built.ok && built.startIso).toBe("2026-10-10T00:00:00.000Z");
  });
});

describe("duration helpers", () => {
  it("round-trips rounds through the window for both games", () => {
    for (const gameType of ["live_trivia", "category_blitz"] as const) {
      for (const rounds of [1, 3, 8]) {
        expect(roundsFromWindowMinutesFor(gameType, durationMinutesFor(gameType, rounds))).toBe(rounds);
      }
    }
  });
});
