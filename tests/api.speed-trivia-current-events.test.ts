import { beforeEach, describe, expect, it, vi } from "vitest";

// D11 (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a): Current Events stays hidden from players until the
// nightly marks it visible. Fake server client; no database.
vi.mock("server-only", () => ({}));
type Row = { id: string; question: string; options: string[]; correct_answer: number; category: string | null; difficulty: string };
const mocks = vi.hoisted(() => ({ flags: [] as { category: string; visible: boolean }[], flagError: null as unknown, flagReads: 0, filters: [] as string[], rows: [] as Row[] }));

// A tiny PostgREST stand-in: it applies `.eq` and the `.or("category.is.null,category.not.in.(…)")` filter to `mocks.rows`
// with SQL's NULL semantics, so a NULL-category row is only kept by the explicit `is.null` branch.
const parseOr = (value: string) => {
  const match = /^category\.is\.null,category\.not\.in\.\((.*)\)$/.exec(value);
  if (!match) throw new Error(`unexpected or filter: ${value}`);
  const names = match[1].split(",").map((name) => name.replace(/^"|"$/g, ""));
  return (row: Row) => row.category === null || !names.includes(row.category);
};
const questionQuery = () => {
  const keep: ((row: Row) => boolean)[] = [];
  let head = false;
  const query = {
    select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; },
    eq: (column: string, value: unknown) => {
      if (column === "category") keep.push((row) => row.category === value);
      return query;
    },
    or: (value: string) => { mocks.filters.push(value); keep.push(parseOr(value)); return query; },
    range: () => query,
    limit: () => query,
    then: (resolve: (v: unknown) => void) => {
      const data = mocks.rows.filter((row) => keep.every((test) => test(row)));
      resolve({ data: head ? null : data, count: data.length, error: null });
    },
  };
  return query;
};

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "speed_trivia_category_flags") {
        return { select: () => ({ in: async () => { mocks.flagReads++; return { data: mocks.flagError ? null : mocks.flags, error: mocks.flagError }; } }) };
      }
      return questionQuery();
    },
  },
}));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: vi.fn() }));

import { getHiddenSpeedCategories, resetHiddenSpeedCategoriesCache } from "@/lib/speedTriviaCategoryVisibility";
import { getTriviaQuestions } from "@/lib/trivia";
import { GET as quotaGet } from "@/app/api/trivia/quota/route";
import { GATED_TRIVIA_CATEGORIES, TRIVIA_CATEGORIES, visibleTriviaCategories } from "@/lib/triviaCategories";

beforeEach(() => {
  resetHiddenSpeedCategoriesCache();
  mocks.flags = [];
  mocks.flagError = null;
  mocks.flagReads = 0;
  mocks.filters = [];
  mocks.rows = [];
});

describe("Current Events visibility", () => {
  it("is the 9th Speed category, gated at 60", () => {
    expect(TRIVIA_CATEGORIES).toHaveLength(9);
    expect(TRIVIA_CATEGORIES.at(-1)).toMatchObject({ slug: "current-events", label: "Current Events", dbValue: "Current Events", minActiveToShow: 60 });
    expect(GATED_TRIVIA_CATEGORIES).toEqual(["Current Events"]);
    expect(visibleTriviaCategories(new Set(["Current Events"])).map((c) => c.dbValue)).not.toContain("Current Events");
  });

  it("fails closed and caches the flag", async () => {
    mocks.flagError = { message: "down" };
    expect([...(await getHiddenSpeedCategories())]).toEqual(["Current Events"]);
    mocks.flagError = null;
    mocks.flags = [{ category: "Current Events", visible: true }];
    expect([...(await getHiddenSpeedCategories())]).toEqual([]);
    expect([...(await getHiddenSpeedCategories())]).toEqual([]);
    expect(mocks.flagReads).toBe(2); // the failed read isn't cached; the good one is
    resetHiddenSpeedCategoriesCache();
    mocks.flags = [];
    expect([...(await getHiddenSpeedCategories())]).toEqual(["Current Events"]);
  });

  it("is left out of All Categories and unplayable while hidden", async () => {
    await getTriviaQuestions(15, undefined, undefined);
    expect(mocks.filters).toContain('category.is.null,category.not.in.("Current Events")');
    mocks.filters = [];
    expect(await getTriviaQuestions(15, undefined, "Current Events")).toEqual([]);
    expect(await getTriviaQuestions(15, undefined, "Music")).toEqual([]);
    expect(mocks.filters).toEqual([]);
  });

  it("keeps a row with no category in All Categories while Current Events is hidden (review #4)", async () => {
    const row = (id: string, category: string | null): Row => ({ id, question: `Q ${id}?`, options: ["A", "B", "C", "D"], correct_answer: 0, category, difficulty: "easy" });
    mocks.rows = [row("none", null), row("music", "Music"), row("ce", "Current Events")];
    const drawn = await getTriviaQuestions(15, undefined, undefined);
    expect(drawn.map((q) => q.id).sort()).toEqual(["music", "none"]);
  });

  it("joins All Categories once visible", async () => {
    mocks.flags = [{ category: "Current Events", visible: true }];
    await getTriviaQuestions(15, undefined, undefined);
    expect(mocks.filters).toEqual([]);
  });

  it("rides on the quota response the picker already loads", async () => {
    const response = await quotaGet(new Request("https://example.invalid/api/trivia/quota"));
    expect(await response.json()).toEqual({ ok: true, quota: null, hiddenCategories: ["Current Events"] });
  });
});
