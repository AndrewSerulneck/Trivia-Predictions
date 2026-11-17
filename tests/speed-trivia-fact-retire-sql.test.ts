import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4a.2 (D26) of docs/speed-trivia-backlog-and-quality-plan.md:
// the fact cleanup retires below 5 per subject, but never a repeat whose kept question has gone.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as {
  setup: (db: PGlite) => Promise<void>;
  call: (db: PGlite, name: string, args?: Record<string, unknown>) => Promise<unknown>;
  checked: (candidate: SpeedQuestion, revision: string, old?: unknown) => Record<string, unknown>;
  row: (id: string, q: string, answer: string, category?: string) => SpeedQuestion;
  SECRET: string;
};
const MIGRATIONS = [
  "supabase/migrations/20261115151703_speed_trivia_quick_review.sql",
  "supabase/migrations/20261115153905_speed_trivia_bar_test_scores.sql",
  "supabase/migrations/20261115170333_speed_trivia_keep_queue.sql",
  "supabase/migrations/20261115212126_speed_trivia_queue_repairs.sql",
  "supabase/migrations/20261115213124_speed_trivia_released_rows_revision.sql",
  "supabase/migrations/20261115214254_speed_trivia_undo_needs_look.sql",
  "supabase/migrations/20261115220356_question_variety_map.sql",
  "supabase/migrations/20261116014954_speed_trivia_star_cap.sql",
  "supabase/migrations/20261116214747_speed_trivia_fact_retire.sql",
];
const id = (n: number) => `83000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RUN = "83000000-0000-4000-8000-999999999999";

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const asAdmin = async (sql: string, args: unknown[] = []) => {
  await db.exec("reset role;");
  try { await db.query(sql, args); } finally { await db.exec("set role service_role;"); }
};
const revision = async () => ((await harness.call(db, "speed_trivia_inventory")) as { revision: string }).revision;
const find = async (rowId: string) => ((await harness.call(db, "speed_trivia_find", { p_identifier: rowId })) as Record<string, unknown>[])[0];
const status = (rowId: string) => scalar<string>("select status from trivia_questions where id=$1", [rowId]);
const mark = (rowId: string) => db.query<Record<string, unknown>>("select * from speed_trivia_review_marks where row_id=$1", [rowId]).then(r => r.rows[0] ?? null);

// A question about `subject` (distinct wording and answer per n, so the exact-duplicate checks never fire).
const q = (n: number, subject = "chameleon") => harness.row(id(n), `Fact number ${n} about the ${subject}?`, `Answer ${n}`, "Animals");
const seed = async (rows: SpeedQuestion[], state: string, subject: string | null = "chameleon") => {
  await db.exec("reset role; alter table trivia_questions disable trigger all;");
  for (const r of rows) {
    await db.query(
      "insert into trivia_questions(id,slug,question,options,correct_answer,category,status,normalized_question_key) values($1,$2,$3,$4::jsonb,0,$5,$6,$7)",
      [r.id, r.slug, r.question, JSON.stringify(r.options), r.category, state, core.exactKey(r.question)],
    );
    if (subject) {
      await db.query("insert into question_tags(game,question_ref,category,subject,subject_key) values('speed',$1,$2,$3,$3)", [r.id, r.category, subject]);
    }
  }
  await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
};
type Retire = { r: SpeedQuestion; status: string; keptId?: string | null; subjectKey?: string };
const retire = (rows: Retire[]) =>
  scalar<{ retired: string[]; skipped: { id: string; reason: string }[] }>("select public.speed_trivia_fact_retire($1::uuid, $2::jsonb) r",
    [RUN, JSON.stringify(rows.map(({ r, status: s, keptId = null, subjectKey = "chameleon" }) => ({ id: r.id, contentHash: core.contentHash(r), status: s, subjectKey, keptId })))]);
const undo = (ids: string[]) => scalar<{ restored: { id: string; status: string }[]; skipped: string[] }>(
  "select public.speed_trivia_subject_cap_undo($1::uuid, $2::uuid[]) r", [RUN, `{${ids.join(",")}}`]);
const releasedV2 = () => harness.call(db, "speed_trivia_released_rows_v2") as Promise<{ id: string; revision: number }[]>;

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  await db.exec("set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("Speed Trivia fact retire SQL (Phase 4a.2, D26)", () => {
  it("retires below 5 per subject, logs each row, and releases it like a quality reject (D5)", async () => {
    await seed([q(1), q(2)], "active");
    await seed([q(3)], "pending_review");
    // q2 repeats q1's fact; q3 asks a little-known fact. The subject keeps only q1.
    const result = await retire([{ r: q(2), status: "active", keptId: id(1) }, { r: q(3), status: "pending_review" }]);
    expect(result).toEqual({ retired: [id(2), id(3)], skipped: [] });
    expect(await status(id(1))).toBe("active");
    expect(await status(id(2))).toBe("deleted");
    const log = (await db.query<{ row_id: string; old_status: string }>("select row_id, old_status from speed_trivia_subject_cap_log order by row_id")).rows;
    expect(log).toEqual([{ row_id: id(2), old_status: "active" }, { row_id: id(3), old_status: "pending_review" }]);
    expect((await releasedV2()).map(r => r.id)).toEqual([id(2), id(3)]);
    // The 4a.1 undo puts them back.
    expect((await undo([id(2), id(3)])).restored).toEqual([{ id: id(2), status: "active" }, { id: id(3), status: "pending_review" }]);
  });

  it("never retires a repeat whose kept question has gone, moved subject or is a different row", async () => {
    await seed([q(1), q(2), q(3), q(4)], "active");
    await seed([q(5)], "deleted");
    await seed([q(6, "koala")], "active", "koala");
    const result = await retire([
      { r: q(2), status: "active", keptId: id(5) },
      { r: q(3), status: "active", keptId: id(6) },
      { r: q(4), status: "active", keptId: id(40) },
    ]);
    expect(result.retired).toEqual([]);
    expect(result.skipped.map(s => s.reason)).toEqual(["kept_row_gone", "kept_row_gone", "kept_row_gone"]);
  });

  it("skips changed rows and refuses malformed requests and browser roles", async () => {
    await seed([q(1), q(2), q(3)], "active");
    const result = await retire([
      { r: q(1), status: "pending_review" },
      { r: q(2), status: "active", subjectKey: "koala" },
      { r: { ...q(3), question: "Edited?" }, status: "active" },
    ]);
    expect(result.skipped.map(s => s.reason)).toEqual(["status_changed", "tag_changed", "content_changed"]);
    await expect(retire([])).rejects.toThrow(/invalid-fact-retire-request/);
    await expect(retire([{ r: q(1), status: "active", keptId: id(1) }])).rejects.toThrow(/invalid-fact-retire-request/);
    await db.exec("reset role; set role anon;");
    await expect(db.query(`select public.speed_trivia_fact_retire('${RUN}'::uuid, '[]'::jsonb)`)).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role;");
  });
});
