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

  // 7b (review #8): a bad `exact` falls back to the rule; validateCalendar still reports it.
  it("a bad exact date falls back to the rule and is reported", () => {
    const rule = { month: 2, weekday: "Sun", nth: 2 };
    expect(calendar.dateFor(rule, 2028)).toBe("2028-02-13");
    for (const bad of ["2028-2-13", null, "2027-02-14", "2028-02-30"]) {
      const date = { ...rule, exact: { "2028": bad } } as unknown as Parameters<typeof calendar.dateFor>[0];
      expect(calendar.dateFor(date, 2028), String(bad)).toBe("2028-02-13");
      const entry = { ...event("bowl", "02-14"), date };
      expect(calendar.validateCalendar({ events: [entry] }, CATEGORIES), String(bad)).toContain(`bowl: exact 2028 ${bad}`);
    }
  });

  // 7b (review #7): the calendar reads the writer games from map.cjs, so a new game needs no calendar edit.
  it("uses map.GAMES, not its own list", () => {
    expect((calendar as Record<string, unknown>).GAMES).toBeUndefined();
    const missing = { events: [{ id: "x", name: "X", date: { on: "01-01" }, speed: { category: "Sports", area: "NFL" } }] };
    expect(calendar.validateCalendar(missing, CATEGORIES)).toEqual(map.GAMES.filter(g => g !== "speed").map(g => `x: ${g} missing`));
    expect(calendar.seasonalFor({ game: "darts", categories: ["Sports"], today: day("2027-02-05"), calendar: cal(event("a", "02-14")) })).toBeNull();
  });

  // 7b (D43): a contract over the real calendar. A calendar edit that starves an event fails CI.
  it("every event gets at least 2 Speed nights in each of this year and the next two", () => {
    const thisYear = new Date().getUTCFullYear();
    for (const year of [thisYear, thisYear + 1, thisYear + 2]) {
      const nights = new Map<string, number>(calendar.CALENDAR.events.map(e => [e.id, 0]));
      for (let t = Date.UTC(year - 1, 11, 1, 3); t <= Date.UTC(year, 11, 31, 3); t += 86_400_000) {
        const today = new Date(t);
        const plan = slots.nightPlan("speed", CATEGORIES.speed, today);
        const pick = calendar.seasonalFor({ game: "speed", categories: plan.categories, today });
        if (pick?.date.startsWith(`${year}-`)) nights.set(pick.id, (nights.get(pick.id) ?? 0) + 1);
      }
      for (const [id, n] of nights) expect(n, `${year} ${id}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("which event is seasonal tonight", () => {
  // 7b (D44): from 14 days to 3 days before, so the last night's questions have time for Quick Review.
  it("an event 14 days out gets a slot; 15 doesn't; 3 does; 2, the day itself and the day after don't", () => {
    const c = cal({ ...event("big-game", "02-14"), name: "the Big Game" });
    const on = (iso: string) => calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day(iso), calendar: c });
    expect(calendar.WINDOW_DAYS).toBe(14);
    expect(calendar.LEAD_DAYS).toBe(3);
    expect(on("2027-01-31")).toMatchObject({ id: "big-game", date: "2027-02-14", days: 14 });
    expect(on("2027-01-30")).toBeNull();
    expect(on("2027-02-11")).toMatchObject({ days: 3 });
    for (const iso of ["2027-02-12", "2027-02-14", "2027-02-15"]) expect(on(iso), iso).toBeNull();
  });

  it("crosses the new year", () => {
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2026-12-26"), calendar: cal(event("ny", "01-01")) }))
      .toMatchObject({ date: "2027-01-01", days: 6 });
  });

  // 7b (D43): one seasonal slot a night, but events in the window take turns.
  it("two events on the same date alternate night by night, and both get nights", () => {
    const c = cal(event("first", "02-14"), event("second", "02-14"));
    const ids: string[] = [];
    // The whole window: 2027-01-31 (14 days out) -> 2027-02-11 (3 days out), 12 nights.
    for (let d = 0; d < 12; d++) {
      const today = new Date(Date.parse("2027-01-31T03:00:00Z") + d * 86_400_000);
      ids.push(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today, calendar: c })?.id ?? "none");
    }
    expect(ids).not.toContain("none");
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    // Pinned: the pick is candidates[dayNumber % length], sorted by date then list order.
    const dayNumber = Math.floor(Date.parse("2027-02-05T00:00:00Z") / 86_400_000);
    expect(calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today: day("2027-02-05"), calendar: c })?.id)
      .toBe(["first", "second"][dayNumber % 2]);
  });

  it("sorts candidates by date, then list order", () => {
    const c = cal(event("later", "02-20"), event("sooner", "02-18"));
    const picks = new Set<string>();
    for (const iso of ["2027-02-05", "2027-02-06"]) {
      const today = day(iso);
      const dayNumber = Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
      const id = calendar.seasonalFor({ game: "speed", categories: CATEGORIES.speed, today, calendar: c })?.id;
      expect(id, iso).toBe(["sooner", "later"][dayNumber % 2]);
      picks.add(id ?? "");
    }
    expect(picks).toEqual(new Set(["sooner", "later"]));
  });

  it("Live: only on a night that writes the event's category", () => {
    const c = cal({ ...event("big-game", "02-14"), name: "the Big Game" });
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

describe("the seasonal slot over a year of nights (7a: chosen first, so the night's rules still hold)", () => {
  // Every night 2026-12-01 -> 2027-12-31, both games, the real draft map and calendar.
  const nights: Date[] = [];
  for (let t = Date.parse("2026-12-01T03:00:00Z"); t <= Date.parse("2027-12-31T03:00:00Z"); t += 86_400_000) nights.push(new Date(t));
  const cellDuplicates = (regular: { areaId: string | null; era: string | null }[]) => {
    const seen = new Set<string>();
    let dupes = 0;
    for (const s of regular) {
      if (!s.areaId) continue;
      const key = `${s.areaId}|${s.era}`;
      if (seen.has(key)) dupes++;
      seen.add(key);
    }
    return dupes;
  };

  for (const game of ["speed", "live"] as const) {
    it(`${game}: same slot count, one event slot in its area, the modern rule holds, no reused cell`, () => {
      const areas: VarietyArea[] = map.draftAreas(draft).filter(a => a.game === game)
        .map(a => ({ id: `${a.category}|${a.name}`, category: a.category, name: a.name, eras: a.eras, active: true }));
      let seasonalNights = 0;
      for (const today of nights) {
        const night = slots.nightPlan(game, CATEGORIES[game], today);
        const seasonal = calendar.seasonalFor({ game, categories: night.categories, today, calendar: calendar.CALENDAR });
        if (!seasonal) continue;
        const args = { areas, cells: [], categories: night.categories, ask: night.ask, today };
        const plain = slots.chooseSlots(args);
        const withEvent = slots.chooseSlots({ ...args, seasonal });
        const label = `${game} ${map.isoDay(today)} ${seasonal.id}`;
        expect(withEvent.regular.length, label).toBe(plain.regular.length);
        expect(withEvent.currentEvents.length, label).toBe(plain.currentEvents.length);
        const marked = withEvent.regular.filter(s => s.event);
        const expected = plain.regular.some(s => s.category === seasonal.category) ? 1 : 0;
        expect(marked.length, label).toBe(expected);
        expect(withEvent.seasonal === null, label).toBe(expected === 0);
        if (marked[0]) {
          seasonalNights++;
          expect(map.areaKey(marked[0].area ?? ""), label).toBe(map.areaKey(seasonal.area));
          expect(marked[0].category, label).toBe(seasonal.category);
        }
        expect(withEvent.modern.actual, label).toBeGreaterThanOrEqual(Math.min(withEvent.modern.required, plain.modern.actual));
        expect(cellDuplicates(withEvent.regular), label).toBeLessThanOrEqual(cellDuplicates(plain.regular));
      }
      expect(seasonalNights).toBeGreaterThan(game === "speed" ? 100 : 10);
    });
  }
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
    const c = cal({ ...event("big-game", "02-14"), name: "the Big Game" });
    const on = await brief.buildBrief({ client: client(), game: "speed", today: day("2027-02-08"), seasonalCalendar: c });
    const off = await brief.buildBrief({ client: client(), game: "speed", today: day("2027-02-08"), seasonalCalendar: { events: [] } });
    const count = (b: typeof on) => b.prompts.reduce((n, p) => n + p.slots.length, 0);
    expect(count(on)).toBe(count(off));
    expect(on.seasonal).toMatchObject({ id: "big-game" });
    expect(on.prompts.flatMap(p => p.slots).filter(s => s.event)).toEqual([expect.objectContaining({ category: "Sports", area: "NFL", event: "the Big Game" })]);
    const seasonalPrompt = on.prompts.find(p => p.slots.some(s => s.event));
    expect(seasonalPrompt?.prompt).toContain("seasonal: the Big Game");
    expect(seasonalPrompt?.prompt).not.toContain("seasonal: big-game");
    expect(seasonalPrompt?.prompt).toContain("never the event's own name");
    expect(off.seasonal).toBeNull();
    expect(on.writerVersion).toBe("writer-v6");
  });
});
