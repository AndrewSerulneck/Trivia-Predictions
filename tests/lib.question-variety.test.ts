import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as map from "@/lib/question-variety/map.cjs";
import * as slots from "@/lib/question-variety/slots.cjs";
import type { DraftMap } from "@/lib/question-variety/map.cjs";
import type { VarietyArea, VarietyCell } from "@/lib/question-variety/slots.cjs";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";

// Phase 4a of docs/speed-trivia-backlog-and-quality-plan.md: the variety map, tag validation, slot choice, star cap.
const draft = JSON.parse(readFileSync("data/question-variety/draft-map.json", "utf8")) as DraftMap;
const TODAY = new Date("2026-11-15T12:00:00Z");

describe("subject keys and eras", () => {
  it("makes one canonical key per subject", () => {
    expect(map.subjectKey("The Beatles")).toBe("beatles");
    expect(map.subjectKey("  beatles ")).toBe("beatles");
    expect(map.subjectKey("Guns N' Roses")).toBe("guns n roses");
    expect(map.subjectKey("Beyoncé")).toBe("beyonce");
    expect(map.subjectKey("U.S. Open")).toBe("us open");
    expect(map.subjectKey("Simon & Garfunkel")).toBe(map.subjectKey("Simon and Garfunkel"));
    expect(map.subjectKey("Theodore Roosevelt")).toBe("theodore roosevelt");
  });

  it("normalizes dashes in eras", () => {
    expect(map.canonicalEra("1900–1945")).toBe("1900-1945");
    expect(map.canonicalEra(" 2000 - present ")).toBe("2000-present");
    expect(map.isModernEra("2010s")).toBe(true);
    expect(map.isModernEra("2000-present")).toBe(true);
    expect(map.isModernEra("2026-03")).toBe(true);
    expect(map.isModernEra("1990s")).toBe(false);
    expect(map.isModernEra("Timeless")).toBe(false);
  });

  it("expires a Current Events question 12 months after its event month (D16)", () => {
    expect(map.expiresOnFor("2026-03")).toBe("2027-03-01");
    expect(map.expiresOnFor("2025-12")).toBe("2026-12-01");
    expect(map.isExpired("2025-11", TODAY)).toBe(true);
    expect(map.isExpired("2025-12", TODAY)).toBe(false);
    expect(() => map.expiresOnFor("2026-13")).toThrow();
  });

  it("offers months at least 7 days old with 30+ days of life left", () => {
    expect(map.writingMonths(TODAY)).toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"]);
    // Nov 3: the newest event must be 7 days old, so November isn't offered yet.
    expect(map.writingMonths(new Date("2026-11-03T00:00:00Z"))[0]).toBe("2026-10");
  });

  it("finds the month and year in the wording", () => {
    expect(map.mentionsMonthYear("In March 2026, which team won the title?", "2026-03")).toBe(true);
    expect(map.mentionsMonthYear("On Mar. 4, 2026, who was sworn in?", "2026-03")).toBe(true);
    expect(map.mentionsMonthYear("In 2026, which team won?", "2026-03")).toBe(false);
    expect(map.mentionsMonthYear("In April 2026, which team won?", "2026-03")).toBe(false);
  });
});

describe("tag validation against the map", () => {
  const areas = [
    { id: "a1", name: "Hip-hop and rap", eras: ["1980s", "1990s", "2000s"], active: true },
    { id: "a2", name: "Disco and funk", eras: ["1970s"], active: false },
  ];
  const ce = [{ id: "c1", name: "World news", eras: ["Past 12 months"], active: true }];

  it("accepts a matching area and era, case- and dash-insensitively", () => {
    expect(map.validateTag({ area: "hip-hop AND rap", era: "1990s", subject: "The Notorious B.I.G." }, { category: "Music", areas }))
      .toEqual({ ok: true, areaId: "a1", area: "Hip-hop and rap", era: "1990s", subject: "The Notorious B.I.G.", subjectKey: "notorious big" });
  });

  it("refuses unknown areas, eras outside the area and empty subjects", () => {
    expect(map.validateTag({ area: "Polka", era: "1990s", subject: "X" }, { category: "Music", areas })).toEqual({ ok: false, reason: "unknown-area" });
    expect(map.validateTag({ area: "Hip-hop and rap", era: "1970s", subject: "X" }, { category: "Music", areas })).toEqual({ ok: false, reason: "invalid-era" });
    expect(map.validateTag({ area: "Hip-hop and rap", era: "1990s", subject: "  " }, { category: "Music", areas })).toEqual({ ok: false, reason: "invalid-subject" });
    expect(map.validateTag({ area: "Hip-hop and rap", era: "1990s", subject: "x".repeat(121) }, { category: "Music", areas }).ok).toBe(false);
  });

  it("lets only the tagging run say no area fits, and only the writer needs an active area", () => {
    expect(map.validateTag({ area: null, era: "1990s", subject: "Water" }, { category: "Music", areas })).toEqual({ ok: false, reason: "missing-area" });
    expect(map.validateTag({ area: null, era: "1990s", subject: "Water" }, { category: "Music", areas, allowUnmapped: true }))
      .toMatchObject({ ok: true, areaId: null, era: null, subjectKey: "water" });
    expect(map.validateTag({ area: "Disco and funk", era: "1970s", subject: "Bee Gees" }, { category: "Music", areas }).ok).toBe(true);
    expect(map.validateTag({ area: "Disco and funk", era: "1970s", subject: "Bee Gees" }, { category: "Music", areas, requireActive: true }))
      .toEqual({ ok: false, reason: "inactive-area" });
  });

  it("checks Current Events months", () => {
    const opts = { category: map.CURRENT_EVENTS, areas: ce, today: TODAY };
    expect(map.validateTag({ area: "World news", era: "2026-03", subject: "Summit" }, opts)).toMatchObject({ ok: true, era: "2026-03" });
    expect(map.validateTag({ area: "World news", era: "2026-12", subject: "Summit" }, opts)).toEqual({ ok: false, reason: "invalid-era" });
    expect(map.validateTag({ area: "World news", era: "Past 12 months", subject: "Summit" }, opts)).toEqual({ ok: false, reason: "invalid-era" });
    expect(map.validateTag({ area: "World news", era: "2025-12", subject: "Summit" }, opts).ok).toBe(true);
    expect(map.validateTag({ area: "World news", era: "2025-12", subject: "Summit" }, { ...opts, forWriting: true })).toEqual({ ok: false, reason: "invalid-era" });
  });

  it("validates a new area against the category's era set", () => {
    const set = draft.eraSets.decades;
    expect(map.validateNewArea({ name: " Yacht rock ", eras: ["1980s", "1970s"], note: "" }, set)).toEqual({ ok: true, name: "Yacht rock", eras: ["1970s", "1980s"], note: null });
    expect(map.validateNewArea({ name: "Yacht rock", eras: ["1880s"] }, set)).toEqual({ ok: false, reason: "invalid-eras" });
    expect(map.validateNewArea({ name: "Yacht rock", eras: [] }, set)).toEqual({ ok: false, reason: "invalid-eras" });
    expect(map.validateNewArea({ name: "", eras: ["1980s"] }, set)).toEqual({ ok: false, reason: "invalid-name" });
    expect(map.validateNewArea({ name: "Yacht rock", eras: ["1980s"], note: "x".repeat(201) }, set)).toEqual({ ok: false, reason: "invalid-note" });
  });
});

describe("the draft map", () => {
  const rows = map.draftAreas(draft);

  it("covers every Speed category, including Current Events, and nothing else", () => {
    expect(Object.keys(draft.games.speed).sort()).toEqual(TRIVIA_CATEGORIES.map((c) => c.dbValue).sort());
    for (const category of Object.keys(draft.games.speed)) expect(rows.filter((r) => r.game === "speed" && r.category === category).length).toBeGreaterThanOrEqual(5);
  });

  it("covers every Live Trivia category file plus Current Events", () => {
    const dir = "data/live-trivia/categories";
    const live = new Set(readdirSync(dir).map((f) => (JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { categoryName: string }).categoryName));
    expect(Object.keys(draft.games.live).sort()).toEqual([...new Set([...live, map.CURRENT_EVENTS])].sort());
  });

  it("keeps the plan's era ranges and reaches every American war, not just two", () => {
    expect(draft.eraSets.decades).toEqual(["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);
    const wars = rows.find((r) => r.game === "speed" && r.name === "American wars");
    expect(wars?.eras.length).toBeGreaterThanOrEqual(5);
    expect(rows.filter((r) => r.category === map.CURRENT_EVENTS).every((r) => r.eras.join() === map.CURRENT_EVENTS_ERA)).toBe(true);
  });

  it("refuses a malformed draft", () => {
    const bad = structuredClone(draft);
    bad.games.speed.Music.areas.push({ name: "Rock and Classic Rock" });
    expect(() => map.draftAreas(bad)).toThrow(/duplicate area/);
    const badEra = structuredClone(draft);
    badEra.games.speed.Music.areas[0].eras = ["1880s"];
    expect(() => map.draftAreas(badEra)).toThrow(/invalid-eras/);
  });
});

describe("slot choice", () => {
  const area = (id: string, category: string, eras: string[], active = true): VarietyArea => ({ id, category, name: id, eras, active });
  const cell = (areaId: string, era: string, count: number, lastWritten: string | null = null): VarietyCell => ({ areaId, era, count, lastWritten });
  const CATS = ["Music", "Science", map.CURRENT_EVENTS];

  it("sends the writer to the least-covered cells, ties broken by least recently written", () => {
    const areas = [area("rock", "Music", ["1970s", "1980s"]), area("pop", "Music", ["1970s", "1980s"])];
    const cells = [cell("rock", "1970s", 9), cell("rock", "1980s", 2, "2026-11-01T00:00:00Z"), cell("pop", "1970s", 2, "2026-10-01T00:00:00Z"), cell("pop", "1980s", 7)];
    const picked = slots.chooseSlots({ areas, cells, categories: ["Music"], today: TODAY, ask: { regular: 2, currentEvents: 0 } }).regular;
    expect(picked.map((s) => `${s.areaId}|${s.era}`)).toEqual(["pop|1970s", "rock|1980s"]);
    expect(picked[0].deficit).toBe(-3);
  });

  it("spreads across areas before using a second cell in one area", () => {
    const areas = [area("a", "Music", ["1970s", "1980s", "1990s"]), area("b", "Music", ["1970s"])];
    const cells = [cell("a", "1970s", 0), cell("a", "1980s", 0), cell("a", "1990s", 0), cell("b", "1970s", 5)];
    const picked = slots.chooseSlots({ areas, cells, categories: ["Music"], today: TODAY, ask: { regular: 2, currentEvents: 0 } }).regular;
    expect(new Set(picked.map((s) => s.areaId))).toEqual(new Set(["a", "b"]));
  });

  it("puts at least a third of regular slots in 2000-present", () => {
    const areas = [area("rock", "Music", ["1960s", "1970s", "1980s", "2010s"])];
    const cells = [cell("rock", "2010s", 40)];
    const result = slots.chooseSlots({ areas, cells, categories: ["Music"], today: TODAY, ask: { regular: 3, currentEvents: 0 } });
    expect(result.modern).toEqual({ required: 1, actual: 1 });
    expect(result.regular.filter((s) => s.era === "2010s")).toHaveLength(1);
  });

  it("rotates regular slots evenly across categories and skips switched-off areas", () => {
    const areas = [area("m", "Music", ["1990s"]), area("s", "Science", ["Timeless"]), area("off", "Science", ["Timeless"], false)];
    const result = slots.chooseSlots({ areas, categories: CATS, today: TODAY, ask: { regular: 5, currentEvents: 0 } });
    const per = result.regular.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.category]: (acc[s.category] ?? 0) + 1 }), {});
    expect(Math.abs((per.Music ?? 0) - (per.Science ?? 0))).toBeLessThanOrEqual(1);
    expect(result.regular.some((s) => s.areaId === "off")).toBe(false);
    // Over two days the extra slot moves to the other category.
    const next = slots.chooseSlots({ areas, categories: CATS, today: new Date("2026-11-16T12:00:00Z"), ask: { regular: 5, currentEvents: 0 } });
    const perNext = next.regular.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.category]: (acc[s.category] ?? 0) + 1 }), {});
    expect((per.Music ?? 0) + (perNext.Music ?? 0)).toBe(5);
  });

  it("asks for ~5 Current Events and ~11 regular by default, spread across areas and months", () => {
    const areas = ["politics", "tech", "sports", "world", "viral"].map((id) => area(id, map.CURRENT_EVENTS, ["Past 12 months"]))
      .concat([area("m", "Music", ["1990s", "2000s"]), area("s", "Science", ["Timeless"])]);
    const result = slots.chooseSlots({ areas, categories: CATS, today: TODAY });
    expect(result.regular).toHaveLength(slots.ASK.regular);
    expect(result.currentEvents).toHaveLength(slots.ASK.currentEvents);
    expect(new Set(result.currentEvents.map((s) => s.areaId)).size).toBe(5);
    expect(new Set(result.currentEvents.map((s) => s.era)).size).toBe(5);
    for (const s of result.currentEvents) expect(map.writingMonths(TODAY)).toContain(s.era);
    expect(slots.DELIVER).toEqual({ regular: 7, currentEvents: 3 });
  });

  it("Live writes one full round a night: one category, rotating through all of them, Current Events included", () => {
    const LIVE = ["Movies", "Music", map.CURRENT_EVENTS];
    const nights = [0, 1, 2].map((d) => slots.nightPlan("live", LIVE, new Date(Date.UTC(2026, 10, 16 + d, 12))));
    expect(new Set(nights.map((n) => n.categories[0]))).toEqual(new Set(LIVE));
    for (const n of nights) {
      expect(n.categories).toHaveLength(1);
      expect(n.deliverTotal).toBe(15);
      const ce = n.categories[0] === map.CURRENT_EVENTS;
      expect(n.ask).toEqual({ regular: ce ? 0 : slots.LIVE_ASK, currentEvents: ce ? slots.LIVE_ASK : 0 });
    }
    expect(slots.LIVE_ROUND).toBe(15);
    // Speed is unchanged: every category, 10 a day.
    expect(slots.nightPlan("speed", LIVE, TODAY)).toMatchObject({ categories: LIVE, ask: slots.ASK, deliver: slots.DELIVER, deliverTotal: 10 });
  });

  it("reuses cells instead of sending a slot out with no area when a category has fewer cells than slots", () => {
    // 2026-11-20: Live Science & Tech had 5 Timeless cells for a 24-slot night; 19 slots went out with no area.
    const ids = ["physics", "biology", "astronomy", "medicine", "chemistry"];
    const areas = ids.map((id) => area(id, "Science", ["Timeless"]));
    const cells = [cell("physics", "Timeless", 3), cell("biology", "Timeless", 1)];
    const night = slots.nightPlan("live", ["Science"], TODAY);
    const result = slots.chooseSlots({ areas, cells, categories: night.categories, ask: night.ask, today: TODAY });
    expect(result.regular).toHaveLength(slots.LIVE_ASK);
    expect(result.regular.every((s) => s.areaId !== null && s.era === "Timeless")).toBe(true);
    const per = result.regular.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.areaId as string]: (acc[s.areaId as string] ?? 0) + 1 }), {});
    expect(Object.keys(per).sort()).toEqual([...ids].sort());
    expect(Math.max(...Object.values(per)) - Math.min(...Object.values(per))).toBeLessThanOrEqual(1);
    // Least covered first: the first five slots use every cell once, emptiest first.
    expect(result.regular.slice(0, 5).map((s) => s.areaId).slice(-2)).toEqual(["biology", "physics"]);
  });

  it("reuses Current Events cells before falling back to area-less months", () => {
    const areas = [area("politics", map.CURRENT_EVENTS, ["Past 12 months"])];
    const result = slots.chooseSlots({ areas, categories: [map.CURRENT_EVENTS], today: TODAY, ask: { regular: 0, currentEvents: 30 } });
    expect(result.currentEvents).toHaveLength(30);
    expect(result.currentEvents.every((s) => s.areaId === "politics" && map.isMonthEra(s.era))).toBe(true);
  });

  it("still gives a category with no areas its slots (category only)", () => {
    const result = slots.chooseSlots({ areas: [], categories: CATS, today: TODAY, ask: { regular: 4, currentEvents: 2 } });
    expect(result.regular).toHaveLength(4);
    expect(result.regular.every((s) => s.areaId === null && s.era === null)).toBe(true);
    expect(result.currentEvents).toHaveLength(2);
    expect(result.currentEvents.every((s) => s.areaId === null && map.isMonthEra(s.era))).toBe(true);
  });
});

describe("star cap (D15)", () => {
  const now = TODAY;
  const stats = new Map([
    ["beyonce", { count: 5, lastWritten: "2026-01-01T00:00:00Z" }],
    ["prince", { count: 2, lastWritten: "2026-11-01T00:00:00Z" }],
    ["abba", { count: 4, lastWritten: "2026-01-01T00:00:00Z" }],
  ]);

  it("rejects a subject at 5, inside the 30-day gap, or twice in one batch", () => {
    const result = slots.checkStarCap([{ subjectKey: "beyonce" }, { subjectKey: "prince" }, { subjectKey: "abba" }, { subjectKey: "abba" }, { subjectKey: "queen" }, { subjectKey: "" }], stats, now);
    expect(result).toEqual([
      { ok: false, reason: "star-cap", detail: "cap" },
      { ok: false, reason: "star-cap", detail: "gap" },
      { ok: true },
      { ok: false, reason: "star-cap", detail: "cap" },
      { ok: true },
      { ok: false, reason: "star-cap", detail: "missing-subject" },
    ]);
    expect(slots.STAR_CAP).toBe(5);
    expect(slots.GAP_DAYS).toBe(30);
  });

  it("lets a subject back in after 30 days", () => {
    expect(slots.checkStarCap([{ subjectKey: "prince" }], stats, new Date("2026-12-02T00:00:00Z"))).toEqual([{ ok: true }]);
  });

  it("lists the category's capped and recent subjects to avoid", () => {
    const subjects = [
      { subjectKey: "beyonce", subject: "Beyoncé", categories: ["Music"], count: 5, lastWritten: "2026-01-01T00:00:00Z" },
      { subjectKey: "prince", subject: "Prince", categories: ["Music"], count: 1, lastWritten: "2026-11-10T00:00:00Z" },
      { subjectKey: "abba", subject: "ABBA", categories: ["Music"], count: 2, lastWritten: "2026-01-01T00:00:00Z" },
      { subjectKey: "mars", subject: "Mars", categories: ["Science"], count: 9, lastWritten: null },
    ];
    expect(slots.avoidList(subjects, "Music", now)).toEqual(["Beyoncé", "Prince"]);
  });
});
