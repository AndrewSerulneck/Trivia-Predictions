import { describe, it, expect, vi } from "vitest";
import type { NFLWeek } from "@/lib/nflPickEm";
import {
  NFL_WEEK_ROLLOVER_UTC_HOUR,
  buildNFLGameWeekOptions,
  isNFLWeekOpenForPicks,
  nflWeekSpanMs,
} from "@/lib/nflPickEm";

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
vi.mock("@/lib/balldontlie", () => ({ fetchBallDontLieList: vi.fn() }));

const week = (overrides: Partial<NFLWeek> & Pick<NFLWeek, "id" | "weekNumber" | "weekStartDate" | "weekEndDate">): NFLWeek => ({
  season: 2026,
  weekType: "regular",
  displayLabel: null,
  thursdayKickoff: null,
  status: "open",
  gamesCount: 16,
  syncedAt: null,
  ...overrides,
});

// Real 2026 regular-season dates.
const WEEK_1 = week({ id: "w1", weekNumber: 1, weekStartDate: "2026-09-10", weekEndDate: "2026-09-14" });
const WEEK_2 = week({ id: "w2", weekNumber: 2, weekStartDate: "2026-09-17", weekEndDate: "2026-09-21" });
const WEEK_12 = week({ id: "w12", weekNumber: 12, weekStartDate: "2026-11-26", weekEndDate: "2026-11-30" });
const WEEK_13 = week({ id: "w13", weekNumber: 13, weekStartDate: "2026-12-03", weekEndDate: "2026-12-07" });

const iso = (ms: number): string => new Date(ms).toISOString();

describe("nflWeekSpanMs", () => {
  it("runs from the week's own Tuesday 05:00 UTC to the next Tuesday 05:00 UTC", () => {
    // Week 1 is Thu 2026-09-10 .. Mon 2026-09-14.
    const span = nflWeekSpanMs(WEEK_1);
    expect(iso(span.startMs)).toBe("2026-09-08T05:00:00.000Z");
    expect(iso(span.endMsExclusive)).toBe("2026-09-15T05:00:00.000Z");
  });

  it("is 5, not 4 — 4:00 UTC is midnight Eastern only on Daylight Time", () => {
    expect(NFL_WEEK_ROLLOVER_UTC_HOUR).toBe(5);
  });

  it("contains Monday Night Football, whose kickoff is Tuesday in UTC", () => {
    // Week 1 MNF: Mon 2026-09-14, 8:15pm EDT.
    const mnf = Date.parse("2026-09-15T00:15:00.000Z");
    const span = nflWeekSpanMs(WEEK_1);
    expect(mnf).toBeGreaterThanOrEqual(span.startMs);
    expect(mnf).toBeLessThan(span.endMsExclusive);
  });

  it("contains a Wednesday game that precedes its own week_start_date", () => {
    const wednesday = Date.parse("2026-09-16T20:00:00.000Z");
    const span = nflWeekSpanMs(WEEK_2);
    expect(wednesday).toBeGreaterThanOrEqual(span.startMs);
    expect(wednesday).toBeLessThan(span.endMsExclusive);
  });

  it("is gapless and non-overlapping across consecutive weeks", () => {
    expect(nflWeekSpanMs(WEEK_1).endMsExclusive).toBe(nflWeekSpanMs(WEEK_2).startMs);
    expect(nflWeekSpanMs(WEEK_12).endMsExclusive).toBe(nflWeekSpanMs(WEEK_13).startMs);
  });

  it("returns non-finite bounds for an unparseable date rather than a silent window", () => {
    const span = nflWeekSpanMs({ weekStartDate: "not-a-date" });
    expect(Number.isFinite(span.startMs)).toBe(false);
    expect(Number.isFinite(span.endMsExclusive)).toBe(false);
    expect(isNFLWeekOpenForPicks({ weekStartDate: "not-a-date" })).toBe(false);
  });
});

describe("isNFLWeekOpenForPicks", () => {
  it("opens exactly at the span's start instant", () => {
    expect(isNFLWeekOpenForPicks(WEEK_1, { now: new Date("2026-09-08T04:59:59.999Z") })).toBe(false);
    expect(isNFLWeekOpenForPicks(WEEK_1, { now: new Date("2026-09-08T05:00:00.000Z") })).toBe(true);
  });

  it("stays open after its span has ended — past weeks remain viewable", () => {
    expect(isNFLWeekOpenForPicks(WEEK_1, { now: new Date("2026-12-25T00:00:00.000Z") })).toBe(true);
  });
});

describe("Tuesday 05:00 UTC week rollover", () => {
  const weeks = [WEEK_1, WEEK_2];

  it("does not surface next week one second before the rollover", () => {
    const options = buildNFLGameWeekOptions(weeks, { now: new Date("2026-09-15T04:59:59.000Z") });
    expect(options.weeks.map((w) => w.id)).toEqual(["w1"]);
    expect(options.currentWeekId).toBe("w1");
  });

  it("surfaces next week at exactly the rollover instant", () => {
    const options = buildNFLGameWeekOptions(weeks, { now: new Date("2026-09-15T05:00:00.000Z") });
    expect(options.weeks.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(options.currentWeekId).toBe("w2");
  });

  // Daylight Time ends Sunday 2026-11-01, so from November on 05:00 UTC is
  // midnight EST — still AFTER Monday Night Football, which is the whole point
  // of the 5 (not 4) constant. See docs/nfl-pickem-code-review-fixes-plan.md.
  it("still rolls over after Monday Night Football once Eastern leaves DST", () => {
    const lateSeason = [WEEK_12, WEEK_13];
    // Week 12 MNF: Mon 2026-11-30, 8:15pm EST = 2026-12-01T01:15Z.
    const duringMNF = new Date("2026-12-01T01:15:00.000Z");
    expect(buildNFLGameWeekOptions(lateSeason, { now: duringMNF }).currentWeekId).toBe("w12");

    const afterRollover = new Date("2026-12-01T05:00:00.000Z");
    expect(buildNFLGameWeekOptions(lateSeason, { now: afterRollover }).currentWeekId).toBe("w13");
  });
});
