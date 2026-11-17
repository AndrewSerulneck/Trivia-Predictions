import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The admin dropdown's reads (review #8): the unranged read of every active Live row, then one bounded read per gated
// category. The fake applies `.ilike("category", …)` and `.range` so the gated read sees only its own rows.
type DbRow = { id: string; slug: string; question: string; category: string; options: string[]; correct_answer: number; question_pool: "live_showdown" };
const db = vi.hoisted(() => ({ rows: [] as DbRow[], reads: [] as string[] }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => {
      let category: string | null = null;
      let ranged = false;
      const query = {
        select: () => query,
        eq: () => query,
        ilike: (_column: string, value: string) => { category = value.toLowerCase(); return query; },
        range: () => { ranged = true; return query; },
        then: (resolve: (v: unknown) => void) => {
          db.reads.push(category ? `gated:${category}:${ranged ? "ranged" : "unranged"}` : "all");
          resolve({ data: db.rows.filter((row) => !category || row.category.toLowerCase() === category), error: null });
        },
      };
      return query;
    },
  },
}));

import { buildLiveTriviaOccurrenceSeedSlots, type LiveTriviaSeedQuestion } from "@/lib/liveShowdownEngine";
import { getLiveShowdownRoundCategories } from "@/lib/liveShowdownAdmin";
import { isLiveCategoryOffered, isLiveTriviaSeedAnswerAllowed, liveCategoryMinimum } from "@/lib/liveTriviaCategoryGate";

// Phase 4c (D11) of docs/speed-trivia-backlog-and-quality-plan.md: Current Events is a schedulable Live round only once it
// has ≥ 45 (unexpired) questions; and D16: the importer treats expired entries as absent so they're pruned.
const require = createRequire(import.meta.url);
const importer = require("../scripts/import-trivia-questions.cjs") as {
  normalizeAndValidate: (rows: Record<string, unknown>[], options: Record<string, unknown>) => (Record<string, unknown> & { __expiresOn?: string })[];
  splitExpiredLiveRows: (rows: Record<string, unknown>[], today?: Date) => { current: Record<string, unknown>[]; expired: Record<string, unknown>[] };
};

const questions = (category: string, count: number): LiveTriviaSeedQuestion[] => Array.from({ length: count }, (_, i) => ({
  slug: `${category.toLowerCase().replace(/\s+/g, "-")}-${i + 1}`,
  question: `What is ${category} question ${i + 1}?`,
  category,
  options: [`Answer${i + 1}`],
  correct_answer: 0,
  question_pool: "live_showdown",
}));

const categoriesUsed = (pool: LiveTriviaSeedQuestion[]) => new Set(buildLiveTriviaOccurrenceSeedSlots({
  questions: pool, seenSlugs: new Set(), recentCategories: [], scheduleId: "s", occurrenceDate: "2026-11-20", venueId: "v",
  numRounds: 4, questionsPerRound: 15,
}).slots.map((slot) => slot.category));

describe("Current Events round gate", () => {
  it("holds Current Events back until it has 45 questions; other categories are never gated", () => {
    expect(liveCategoryMinimum("Current Events")).toBe(45);
    expect(liveCategoryMinimum("Movies")).toBe(0);
    expect(isLiveCategoryOffered("current events", 44)).toBe(false);
    expect(isLiveCategoryOffered("Current Events", 45)).toBe(true);
    expect(isLiveCategoryOffered("Movies", 1)).toBe(true);
  });

  it("never seeds a Current Events round below the threshold, and does at it", () => {
    const base = [...questions("Movies", 15), ...questions("Music", 15), ...questions("Television", 15)];
    expect(categoriesUsed([...base, ...questions("Current Events", 44)])).not.toContain("Current Events");
    expect(categoriesUsed([...base, ...questions("Current Events", 45)])).toContain("Current Events");
  });
});

describe("Admin and the builder use one answer rule for gated categories (review #8)", () => {
  const withLongAnswer = (count: number) => questions("Current Events", count).map((q, i) => (i === 0 ? { ...q, options: ["The Treaty of Three Words"] } : q));
  const base = [...questions("Movies", 15), ...questions("Music", 15), ...questions("Television", 15)];
  const asDbRows = (pool: LiveTriviaSeedQuestion[]): DbRow[] => pool.map((q, i) => ({
    id: `id-${i}`, slug: String(q.slug), question: String(q.question), category: String(q.category),
    options: q.options as string[], correct_answer: Number(q.correct_answer), question_pool: "live_showdown",
  }));

  it("keeps the rule: ≤ 2 words or a number", () => {
    expect(isLiveTriviaSeedAnswerAllowed("Paris")).toBe(true);
    expect(isLiveTriviaSeedAnswerAllowed("New  York")).toBe(true);
    expect(isLiveTriviaSeedAnswerAllowed("1,200,000")).toBe(true);
    expect(isLiveTriviaSeedAnswerAllowed("The Treaty of Three Words")).toBe(false);
    expect(isLiveTriviaSeedAnswerAllowed("  ")).toBe(false);
  });

  it("45 active Current Events rows with one long answer: not offered by Admin, not used by the builder", async () => {
    const pool = [...base, ...withLongAnswer(45)];
    expect(categoriesUsed(pool)).not.toContain("Current Events");
    db.rows = asDbRows(pool);
    db.reads = [];
    const offered = (await getLiveShowdownRoundCategories()).map((c) => c.category);
    expect(offered).not.toContain("Current Events");
    expect(offered).toContain("Movies");
    expect(db.reads).toEqual(["all", "gated:current events:ranged"]);
  });

  it("offers Current Events in both once 45 answers are usable", async () => {
    const pool = [...base, ...withLongAnswer(46)];
    expect(categoriesUsed(pool)).toContain("Current Events");
    db.rows = asDbRows(pool);
    expect(await getLiveShowdownRoundCategories()).toContainEqual({ category: "Current Events", count: 45 });
  });
});

describe("importer expiry (D16)", () => {
  const live = (over: Record<string, unknown>) => importer.normalizeAndValidate(
    [{ slug: "q-1", question: "In March 2026, who won X?", answer: "Y", category: "Current Events", ...over }],
    { liveMode: true, questionPool: "live_showdown", answerFormat: "write_in", status: "active" },
  );

  it("accepts a valid expires_on, keeps it out of the database row, and rejects a bad date", () => {
    const [row] = live({ expires_on: "2027-03-01" });
    expect(row.__expiresOn).toBe("2027-03-01");
    expect(Object.keys(row)).not.toContain("expires_on");
    expect(JSON.parse(JSON.stringify(row))).not.toHaveProperty("__expiresOn");
    expect(() => live({ expires_on: "2027-02-30" })).toThrow(/expires_on/);
    expect(() => live({ expires_on: "soon" })).toThrow(/expires_on/);
  });

  it("rejects a Current Events entry without expires_on; other categories don't need one (review #5c)", () => {
    expect(() => live({})).toThrow(/Current Events needs expires_on/);
    expect(() => live({ category: "current events" })).toThrow(/Current Events needs expires_on/);
    expect(live({ category: "Music" })).toHaveLength(1);
    // The file's categoryName is what sets the category for a Live file entry.
    expect(() => importer.normalizeAndValidate(
      [{ slug: "q-2", question: "Who won?", answer: "Y", category: "Current Events", __sourceFile: "current-events.json" }],
      { liveMode: true, questionPool: "live_showdown", answerFormat: "write_in" },
    )).toThrow(/current-events\.json.*Current Events needs expires_on/);
  });

  it("treats entries expiring today or earlier as absent; the rest import as before", () => {
    const rows = [...live({ slug: "a", expires_on: "2026-12-01" }), ...live({ slug: "b", question: "Other?", expires_on: "2027-01-01" }), ...live({ slug: "c", question: "Third?", category: "Music" })];
    const { current, expired } = importer.splitExpiredLiveRows(rows, new Date("2026-12-01T06:20:00Z"));
    expect(expired.map((r) => r.slug)).toEqual(["a"]);
    expect(current.map((r) => r.slug)).toEqual(["b", "c"]);
  });
});
