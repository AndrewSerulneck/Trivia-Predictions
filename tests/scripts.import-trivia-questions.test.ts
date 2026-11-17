import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { normalizeAndValidate, splitExpiredLiveRows, upsertRows } = require("../scripts/import-trivia-questions.cjs");

describe("import-trivia-questions", () => {
  it("normalizes Speed Trivia review candidates into pending_review anytime_blitz rows", () => {
    const rows = normalizeAndValidate(
      [
        {
          question: "Which novel begins with the line 'Call me Ishmael'?",
          options: ["Moby-Dick", "The Odyssey", "The Great Gatsby", "Dracula"],
          correctAnswer: 0,
          category: "Literary Landscapes",
          difficulty: "medium",
        },
      ],
      {
        questionPool: "anytime_blitz",
        answerFormat: "multiple_choice",
        status: "pending_review",
      }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      question: "Which novel begins with the line 'Call me Ishmael'?",
      options: ["Moby-Dick", "The Odyssey", "The Great Gatsby", "Dracula"],
      correct_answer: 0,
      category: "Literary Landscapes",
      difficulty: "medium",
      question_pool: "anytime_blitz",
      answer_format: "multiple_choice",
      status: "pending_review",
      slug: "which-novel-begins-with-the-line-call-me-ishmael",
    });
  });

  it("rejects a live-trivia answer format for Speed Trivia imports", () => {
    expect(() =>
      normalizeAndValidate(
        [
          {
            question: "Who wrote Hamlet?",
            answer: "William Shakespeare",
            category: "Literature",
          },
        ],
        {
          questionPool: "anytime_blitz",
          answerFormat: "write_in",
          status: "pending_review",
        }
      )
    ).toThrow("Speed Trivia rows must use question_pool=anytime_blitz and answer_format=multiple_choice.");
  });

  it("stamps source metadata on Live Trivia import rows", () => {
    const rows = normalizeAndValidate(
      [
        {
          slug: "quote-oscar-wilde",
          question: "Which writer was known for sharp epigrams?",
          answer: "Oscar Wilde",
          category: "Art",
          difficulty: "easy",
          __sourceFile: "art-literature.json",
          __sourceOrder: 7,
        },
      ],
      {
        questionPool: "live_showdown",
        answerFormat: "write_in",
        status: "active",
        liveMode: true,
      }
    );

    expect(rows[0]).toMatchObject({
      slug: "quote-oscar-wilde",
      question_pool: "live_showdown",
      source_file: "art-literature.json",
      source_order: 7,
    });
  });
});

type DbRow = { id: string; slug: string; question: string; question_pool: string; status: string; category: string };

/** A tiny in-memory trivia_questions for the importer's Live path. Nothing leaves the process. */
const fakeSupabase = (initial: DbRow[]) => {
  const db = [...initial];
  const upserted: string[][] = [];
  const builder = () => {
    const filters: ((r: DbRow) => boolean)[] = [];
    let head = false;
    let range: [number, number] | null = null;
    let patch: Partial<DbRow> | null = null;
    let upsertRows: DbRow[] | null = null;
    const q = {
      select: (_cols: string, opts?: { head?: boolean }) => { head = Boolean(opts?.head); return q; },
      eq: (k: keyof DbRow, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: keyof DbRow, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      in: (k: keyof DbRow, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; },
      range: (a: number, b: number) => { range = [a, b]; return q; },
      update: (p: Partial<DbRow>) => { patch = p; return q; },
      upsert: (rows: DbRow[]) => { upsertRows = rows; return q; },
      then: (resolve: (v: unknown) => void) => {
        if (upsertRows) {
          upserted.push(upsertRows.map((r) => r.slug));
          // As production: an upsert onto a Speed row is refused by guard_speed_trivia_write, failing the whole chunk.
          if (upsertRows.some((r) => db.some((d) => d.slug === r.slug && d.question_pool !== "live_showdown"))) {
            resolve({ error: { message: "speed-admission-required" } });
            return;
          }
          for (const r of upsertRows) {
            const at = db.findIndex((d) => d.slug === r.slug);
            if (at >= 0) db[at] = { ...db[at], ...r }; else db.push({ ...r, id: `id-${db.length}` });
          }
          resolve({ error: null });
          return;
        }
        const hit = db.filter((r) => filters.every((f) => f(r)));
        if (patch) { hit.forEach((r) => Object.assign(r, patch)); resolve({ error: null }); return; }
        if (head) { resolve({ count: hit.length, error: null }); return; }
        resolve({ data: range ? hit.slice(range[0], range[1] + 1) : hit, error: null });
      },
    };
    return q;
  };
  return { client: { from: () => builder() }, db, upserted };
};

const liveRows = (slugs: string[]) => normalizeAndValidate(
  slugs.map((slug, n) => ({ slug, question: `Live question number ${n} about ${slug}?`, answer: `Answer ${n}`, category: "Music", difficulty: "easy" })),
  { questionPool: "live_showdown", answerFormat: "write_in", status: "active", liveMode: true }
);
const live = (slug: string): DbRow => ({ id: slug, slug, question: `Old ${slug}?`, question_pool: "live_showdown", status: "active", category: "Music" });
const speed = (slug: string): DbRow => ({ id: slug, slug, question: `Speed ${slug}?`, question_pool: "anytime_blitz", status: "active", category: "Music" });

describe("Sync Live Trivia: a slug another pool uses (4c.9 #2)", () => {
  beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });
  const slugs = Array.from({ length: 12 }, (_, n) => `live-${n}`);

  it("imports everything else, leaves the clash out of the prune and the count, then fails naming the slug", async () => {
    const fake = fakeSupabase([...slugs.map(live), speed("what-type-of-animal-is-a-kitten")]);
    const rows = liveRows([...slugs, "what-type-of-animal-is-a-kitten"]);
    await expect(upsertRows(rows, { supabase: fake.client, pruneOrphans: true, verifyLiveAvailability: true }))
      .rejects.toThrow("Live slug used by a Speed question: what-type-of-animal-is-a-kitten. Re-slug these in the Live JSON.");
    expect(fake.upserted.flat()).toEqual(slugs);
    expect(fake.db.find((r) => r.slug === "what-type-of-animal-is-a-kitten")).toMatchObject({ question_pool: "anytime_blitz", question: "Speed what-type-of-animal-is-a-kitten?" });
    expect(fake.db.filter((r) => r.question_pool === "live_showdown" && r.status === "active")).toHaveLength(12); // nothing pruned
  });

  it("fails without importing anything when every row clashes", async () => {
    const fake = fakeSupabase([speed("only-one")]);
    await expect(upsertRows(liveRows(["only-one"]), { supabase: fake.client, pruneOrphans: true, verifyLiveAvailability: true }))
      .rejects.toThrow("Live slug used by a Speed question: only-one.");
    expect(fake.upserted).toEqual([]);
  });

  it("with no clash, imports, prunes and verifies as before", async () => {
    const fake = fakeSupabase([...slugs.map(live), live("gone-from-json")]);
    await expect(upsertRows(liveRows(slugs), { supabase: fake.client, pruneOrphans: true, verifyLiveAvailability: true })).resolves.toBeUndefined();
    expect(fake.upserted.flat()).toEqual(slugs);
    expect(fake.db.find((r) => r.slug === "gone-from-json")?.status).toBe("deleted");
  });

  it("a Live slug already used by a Live row is not a clash", async () => {
    const fake = fakeSupabase(slugs.map(live));
    await expect(upsertRows(liveRows(slugs), { supabase: fake.client })).resolves.toBeUndefined();
  });
});

describe("expired Live entries (4c.9 #3: one shared rule)", () => {
  it("splits on the expiry day, UTC, and only for Live rows", () => {
    const rows = normalizeAndValidate([
      { slug: "a", question: "Expired yesterday?", answer: "A", category: "Current Events", difficulty: "easy", expires_on: "2026-11-16" },
      { slug: "b", question: "Expires today?", answer: "B", category: "Current Events", difficulty: "easy", expires_on: "2026-11-17" },
      { slug: "c", question: "Expires tomorrow?", answer: "C", category: "Current Events", difficulty: "easy", expires_on: "2026-11-18" },
      { slug: "d", question: "Never expires?", answer: "D", category: "Music", difficulty: "easy" },
    ], { questionPool: "live_showdown", answerFormat: "write_in", status: "active", liveMode: true });
    const { current, expired } = splitExpiredLiveRows(rows, new Date("2026-11-17T12:00:00Z"));
    expect(expired.map((r: { slug: string }) => r.slug)).toEqual(["a", "b"]);
    expect(current.map((r: { slug: string }) => r.slug)).toEqual(["c", "d"]);
  });
});
