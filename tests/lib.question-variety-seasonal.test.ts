import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as calendar from "@/lib/question-variety/calendar.cjs";
import * as map from "@/lib/question-variety/map.cjs";
import * as slots from "@/lib/question-variety/slots.cjs";
import * as rules from "@/lib/question-writer/rules.cjs";
import * as brief from "@/lib/question-writer/brief.cjs";
import type { Calendar } from "@/lib/question-variety/calendar.cjs";
import type { DraftMap } from "@/lib/question-variety/map.cjs";
import type { VarietyArea } from "@/lib/question-variety/slots.cjs";

// Phase 7 of docs/speed-trivia-backlog-and-quality-plan.md (D34): seasonal writer slots from a dated calendar.
const draft = JSON.parse(readFileSync("data/question-variety/draft-map.json", "utf8")) as DraftMap;
const CATEGORIES = { speed: brief.GAME_CATEGORIES.speed, live: brief.GAME_CATEGORIES.live };
const day = (iso: string) => new Date(`${iso}T03:00:00Z`);
const event = (id: string, on: string, speedArea = "NFL", speedCategory = "Sports") => ({
  id, name: id, date: { on }, speed: { category: speedCategory, area: speedArea }, live: { category: "Sports", area: "Historical moments" },
});
const cal = (...events: ReturnType<typeof event>[]): Calendar => ({ events });

describe("the calendar file", () => {
  it("is valid: ids, names, dates parse for the next three years, categories and areas exist on the map", () => {
    expect(calendar.validateCalendar(calendar.CALENDAR, CATEGORIES, map.draftAreas(draft))).toEqual([]);
    expect(calendar.CALENDAR.events.length).toBeGreaterThanOrEqual(16);
  });

  it("refuses a bad entry", () => {
    const bad = { events: [
      { id: "x", name: "X", date: { on: "02-30" }, speed: { category: "Sports", area: "NFL" }, live: { category: "Sports", area: "Historical moments" } },
      { id: "x", name: "Y", date: { on: "01-01" }, speed: { category: "Current Events", area: "NFL" }, live: { category: "Cooking", area: "Pies" } },
      { id: "z", name: "Z", date: { on: "01-01" }, speed: { category: "Sports", area: "Curling" }, live: { category: "Sports", area: "Historical moments" } },
    ] };
    const problems = calendar.validateCalendar(bad, CATEGORIES, map.draftAreas(draft));
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^x: date/), "x: duplicate id", "x: speed category Current Events", "x: live category Cooking",
      "z: speed area Curling not on the map",
    ]));
    expect(calendar.validateCalendar({ events: [] }, CATEGORIES)).toEqual(["no-events"]);
  });

  it("works out moving dates", () => {
    expect(calendar.dateFor({ month: 11, weekday: "Thu", nth: 4 }, 2026)).toBe("2026-11-26"); // Thanksgiving
    expect(calendar.dateFor({ month: 5, weekday: "Sat", nth: 1 }, 2027)).toBe("2027-05-01"); // Kentucky Derby
    expect(calendar.dateFor({ month: 5, weekday: "Mon", nth: -1, offset: -1 }, 2027)).toBe("2027-05-30"); // Indy 500
    expect(calendar.dateFor({ month: 2, weekday: "Sun", nth: 2, exact: { "2027": "2027-02-14" } }, 2027)).toBe("2027-02-14");
    expect(calendar.dateFor({ month: 2, weekday: "Sun", nth: 5 }, 2027)).toBeNull();
    expect(calendar.dateFor({ on: "13-01" }, 2027)).toBeNull();
  });
});

describe("which event is seasonal tonight", () => {
  it("an event 10 days out gets a slot; 11 days out doesn't; a past one doesn't", () => {
    const c = cal(event("big-game", "02-14"));
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2027-02-04"), calendar: c }))
      .toMatchObject({ id: "big-game", date: "2027-02-14", days: 10 });
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2027-02-03"), calendar: c })).toBeNull();
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2027-02-14"), calendar: c })).toMatchObject({ days: 0 });
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2027-02-15"), calendar: c })).toBeNull();
  });

  it("crosses the new year", () => {
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2026-12-26"), calendar: cal(event("ny", "01-01")) }))
      .toMatchObject({ date: "2027-01-01", days: 6 });
  });

  it("two events in the window still give one: the soonest", () => {
    const c = cal(event("later", "02-12"), event("sooner", "02-08"));
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2027-02-05"), calendar: c })).toMatchObject({ id: "sooner" });
  });

  it("Live: only on a night that writes the event's category", () => {
    const c = cal(event("big-game", "02-14"));
    expect(calendar.seasonalFor({ game: "live", categories: ["Sports"], today: day("2027-02-10"), calendar: c })).toMatchObject({ area: "Historical moments" });
    expect(calendar.seasonalFor({ game: "live", categories: ["Movies"], today: day("2027-02-10"), calendar: c })).toBeNull();
  });
});

describe("the seasonal slot", () => {
  const area = (id: string, category: string, eras: string[], active = true): VarietyArea => ({ id, category, name: id, eras, active });
  const AREAS = [area("NFL", "Sports", ["1990s", "2020s"]), area("NBA", "Sports", ["1990s", "2020s"]), area("Pop", "Music", ["1980s", "2000s"])];
  const SEASON = { id: "big-game", name: "the Super Bowl", date: "2027-02-14", category: "Sports", area: "NFL" };
  const choose = (seasonal: typeof SEASON | null, areas = AREAS) => slots.chooseSlots({ areas, categories: ["Sports", "Music", map.CURRENT_EVENTS],
    today: day("2027-02-08"), ask: { regular: 6, currentEvents: 2 }, seasonal });

  it("replaces one regular slot in the event's category; the day's total is unchanged", () => {
    const plain = choose(null);
    const seasonal = choose(SEASON);
    expect(seasonal.regular).toHaveLength(plain.regular.length);
    expect(seasonal.currentEvents).toHaveLength(plain.currentEvents.length);
    const marked = seasonal.regular.filter(s => s.event);
    expect(marked).toHaveLength(1);
    expect(marked[0]).toMatchObject({ category: "Sports", area: "NFL", event: { name: "the Super Bowl", date: "2027-02-14" } });
    expect(seasonal.regular.filter(s => s.category === "Sports")).toHaveLength(plain.regular.filter(s => s.category === "Sports").length);
    expect(seasonal.seasonal).toEqual({ id: "big-game", name: "the Super Bowl", date: "2027-02-14" });
    expect(plain.seasonal).toBeNull();
  });

  it("is skipped when the area is switched off or the category has no slot", () => {
    expect(choose(SEASON, AREAS.map(a => (a.id === "NFL" ? { ...a, active: false } : a))).regular.some(s => s.event)).toBe(false);
    expect(choose({ ...SEASON, category: "Movies" }).seasonal).toBeNull();
  });

  it("the writer prompt names the event and the evergreen rule only when there is one", () => {
    const slot = { n: 1, category: "Sports", area: "NFL", era: "1990s", event: "the Super Bowl" };
    const speed = rules.buildSpeedPrompt({ kind: "regular", slots: [slot], today: day("2027-02-08") });
    expect(speed).toContain("1. Sports | NFL · 1990s · seasonal: the Super Bowl");
    expect(speed).toContain("evergreen fact tied to that event");
    expect(rules.buildLivePrompt({ kind: "regular", slots: [slot], today: day("2027-02-08") })).toContain("seasonal: the Super Bowl");
    expect(rules.buildSpeedPrompt({ kind: "regular", slots: [{ ...slot, event: undefined }], today: day("2027-02-08") })).not.toContain("seasonal");
  });
});

describe("the brief", () => {
  const AREAS = [
    { id: "nfl", category: "Sports", name: "NFL", eras: ["1990s", "2020s"], active: true },
    { id: "pop", category: "Music", name: "Pop", eras: ["1980s"], active: true },
  ];
  const client = () => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: async () => ({ data: [], error: null }) };
    return { rpc: async () => ({ data: { areas: AREAS, cells: [], subjects: [] }, error: null }), from: () => chain };
  };

  it("Speed carries one seasonal slot and the same slot count", async () => {
    const c = cal(event("big-game", "02-14"));
    const on = await brief.buildBrief({ client: client(), game: "speed", today: day("2027-02-08"), seasonalCalendar: c });
    const off = await brief.buildBrief({ client: client(), game: "speed", today: day("2027-02-08"), seasonalCalendar: { events: [] } });
    const count = (b: typeof on) => b.prompts.reduce((n, p) => n + p.slots.length, 0);
    expect(count(on)).toBe(count(off));
    expect(on.seasonal).toMatchObject({ id: "big-game" });
    expect(on.prompts.flatMap(p => p.slots).filter(s => s.event)).toEqual([expect.objectContaining({ category: "Sports", area: "NFL", event: "big-game" })]);
    expect(off.seasonal).toBeNull();
    expect(on.writerVersion).toBe("writer-v5");
  });
});
