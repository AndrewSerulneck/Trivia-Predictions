import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 2 of docs/speed-trivia-backlog-and-quality-plan.md.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as {
  setup: (db: PGlite) => Promise<void>;
  call: (db: PGlite, name: string, args?: Record<string, unknown>) => Promise<unknown>;
  row: (id: string, q: string, answer: string, category?: string) => SpeedQuestion;
};
const MIGRATIONS = [
  "supabase/migrations/20261115151703_speed_trivia_quick_review.sql",
  "supabase/migrations/20261115153905_speed_trivia_bar_test_scores.sql",
];
const id = (n: number) => `71000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type QueueRow = { id: string; contentHash: string; createdAt: string; audience: { score: number; flags: string[] } | null };
type Queue = { total: number; rows: QueueRow[] };

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const queue = (args: Partial<Record<string, unknown>> = {}) => harness.call(db, "speed_trivia_review_queue", {
  p_category: null, p_source: null, p_sort: null, p_after_created: null, p_after_id: null, p_limit: 50, ...args,
}) as Promise<Queue>;
const setAudience = (rows: unknown[]) =>
  harness.call(db, "speed_trivia_review_set_audience", { p_rows: rows }) as Promise<{ written: number; skipped: number }>;
const audience = (score: number) => ({ version: "bar-test-v1", model: "test", score, familiar: score, fun: 3, estCorrect: 50, flags: [] });
const hashOf = (r: SpeedQuestion) => core.contentHash({ ...r, status: "pending_review" });

const ROWS = [
  harness.row(id(1), "Which planet is the Red Planet?", "Mars", "Science"),
  harness.row(id(2), "Which ocean is the largest?", "Pacific", "Geography"),
  harness.row(id(3), "Which metal is liquid at room temperature?", "Mercury", "Science"),
  harness.row(id(4), "Which band recorded Abbey Road?", "The Beatles", "Music"),
];

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  await db.exec("alter table trivia_questions disable trigger all;");
  for (const [n, r] of ROWS.entries()) {
    await db.query(
      "insert into trivia_questions(id,slug,question,options,correct_answer,category,status,normalized_question_key,created_at) values($1,$2,$3,$4::jsonb,0,$5,'pending_review',$6,'2026-07-01T00:00:00Z'::timestamptz + make_interval(secs => $7))",
      [r.id, r.slug, r.question, JSON.stringify(r.options), r.category, core.exactKey(r.question), n],
    );
  }
  await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("Speed Trivia bar-test scores SQL", () => {
  it("stores a score only for a waiting Speed question whose content still matches", async () => {
    const result = await setAudience([
      { id: id(1), contentHash: hashOf(ROWS[0]), audience: audience(5) },
      { id: id(2), contentHash: "0".repeat(64), audience: audience(4) },
      { id: id(9), contentHash: hashOf(ROWS[0]), audience: audience(4) },
    ]);
    expect(result).toEqual({ written: 1, skipped: 2 });
    const mark = (await db.query<{ decision: string | null; audience: Record<string, unknown> }>(
      "select decision, audience from speed_trivia_review_marks where row_id=$1", [id(1)])).rows[0];
    expect(mark.decision).toBeNull();
    expect(mark.audience).toMatchObject({ score: 5, version: "bar-test-v1" });
    expect(typeof mark.audience.key).toBe("string");
    expect(await scalar<number>("select count(*)::int from speed_trivia_review_marks")).toBe(1);
  });

  it("never changes a decision and refuses malformed scores", async () => {
    await db.query("select public.speed_trivia_quick_reject($1::uuid[], 'quality')", [`{${id(2)}}`]);
    // Rejected rows aren't waiting, so they aren't scored.
    expect(await setAudience([{ id: id(2), contentHash: hashOf(ROWS[1]), audience: audience(5) }])).toEqual({ written: 0, skipped: 1 });
    expect(await scalar<string>("select decision from speed_trivia_review_marks where row_id=$1", [id(2)])).toBe("reject");
    for (const bad of [{ ...audience(5), score: 6 }, { ...audience(5), score: "5" }, { score: 3 }, null]) {
      await expect(setAudience([{ id: id(1), contentHash: hashOf(ROWS[0]), audience: bad }])).rejects.toThrow(/invalid-quick-review-request/);
    }
    await expect(setAudience([])).rejects.toThrow(/invalid-quick-review-request/);
  });

  it("filters by score band, sorts best first and pages by (score, created, id)", async () => {
    await setAudience([
      { id: id(1), contentHash: hashOf(ROWS[0]), audience: audience(2) },
      { id: id(2), contentHash: hashOf(ROWS[1]), audience: audience(5) },
      { id: id(3), contentHash: hashOf(ROWS[2]), audience: audience(5) },
    ]);
    const best = await queue({ p_sort: "best" });
    expect(best.rows.map(r => r.id)).toEqual([id(2), id(3), id(1), id(4)]);
    expect(best.rows[0].audience).toMatchObject({ score: 5, flags: [] });
    expect(best.rows[3].audience).toBeNull();
    expect(best.rows[0].contentHash).toBe(hashOf(ROWS[1]));

    const first = await queue({ p_sort: "best", p_limit: 2 });
    const last = first.rows[1];
    const next = await queue({ p_sort: "best", p_limit: 2, p_after_created: last.createdAt, p_after_id: last.id, p_after_score: last.audience?.score ?? 0 });
    expect(next.rows.map(r => r.id)).toEqual([id(1), id(4)]);

    expect((await queue({ p_score_min: 5 })).rows.map(r => r.id)).toEqual([id(2), id(3)]);
    const low = await queue({ p_score_max: 2 });
    expect(low.total).toBe(1);
    expect(low.rows.map(r => r.id)).toEqual([id(1)]);
    // A band excludes unscored rows; no band includes them.
    expect((await queue({ p_score_min: 1, p_score_max: 5 })).total).toBe(3);
    expect((await queue()).total).toBe(4);

    await expect(queue({ p_score_min: 0 })).rejects.toThrow(/invalid-quick-review-query/);
    await expect(queue({ p_score_min: 4, p_score_max: 3 })).rejects.toThrow(/invalid-quick-review-query/);
    await expect(queue({ p_sort: "best", p_after_created: last.createdAt, p_after_id: last.id })).rejects.toThrow(/invalid-quick-review-query/);
  });

  it("treats an edited question's score as stale", async () => {
    await setAudience([{ id: id(1), contentHash: hashOf(ROWS[0]), audience: audience(5) }]);
    await db.exec("reset role; alter table trivia_questions disable trigger all;");
    await db.query("update trivia_questions set question='Which planet is called the Red Planet?' where id=$1", [id(1)]);
    await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
    const rows = (await queue()).rows;
    expect(rows.find(r => r.id === id(1))?.audience).toBeNull();
    expect((await queue({ p_score_min: 5 })).total).toBe(0);
  });

  it("keeps the Phase 1 call shape working and stays server-only", async () => {
    // Phase 1 callers pass six named arguments; the new ones default to null.
    const page = await harness.call(db, "speed_trivia_review_queue", {
      p_category: "Science", p_source: "older", p_sort: "oldest", p_after_created: null, p_after_id: null, p_limit: 10,
    }) as Queue;
    expect(page.rows.map(r => r.id)).toEqual([id(1), id(3)]);
    await expect(db.query("update speed_trivia_review_marks set audience='{}'")).rejects.toThrow(/permission denied/);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role};`);
      await expect(db.query("select public.speed_trivia_review_set_audience('[]'::jsonb)")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.speed_trivia_review_queue(null,null,null,null,null,1)")).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role; set role service_role;");
  });
});
