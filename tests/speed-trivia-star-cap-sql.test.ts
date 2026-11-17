import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4a.1 of docs/speed-trivia-backlog-and-quality-plan.md:
// the star cap on every path to active, and the subject-cap thinning with its undo.
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
];
const id = (n: number) => `81000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RUN = "81000000-0000-4000-8000-999999999999";

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
// The signed approved-only admission the overnight job and Admin approve use.
const approveSigned = async (r: SpeedQuestion) => {
  const args = harness.checked({ ...r, status: "active" }, await revision(), await find(r.id)) as { p_evidence: Record<string, unknown> };
  args.p_evidence.comparisonScope = "approved";
  return harness.call(db, "admit_speed_trivia", args);
};
// A full-bank admission of a waiting row (what makes the Quick Review fast lane free).
const admitPending = async (r: SpeedQuestion) => harness.call(db, "admit_speed_trivia", harness.checked(r, await revision(), (await find(r.id)) ?? null));
const keep = async (rows: SpeedQuestion[]) => {
  const envelope = { operation: "quick_keep", policyVersion: core.POLICY_VERSION, expiresAt: Date.now() + 300_000, rows: rows.map(r => ({ id: r.id, contentHash: core.contentHash(r) })) };
  return ((await harness.call(db, "speed_trivia_quick_keep", { p_check: envelope, p_signature: runtime.sign(harness.SECRET, envelope) })) as { rows: { id: string; outcome: string }[] }).rows;
};
const capCheck = (ids: string[]) => scalar<Record<string, string>>("select public.speed_trivia_star_cap_check($1::uuid[]) r", [`{${ids.join(",")}}`]);
const retire = (rows: { r: SpeedQuestion; status: string; subjectKey?: string }[]) =>
  scalar<{ retired: string[]; skipped: { id: string; reason: string }[] }>("select public.speed_trivia_subject_cap_retire($1::uuid, $2::jsonb) r",
    [RUN, JSON.stringify(rows.map(({ r, status: s, subjectKey = "chameleon" }) => ({ id: r.id, contentHash: core.contentHash(r), status: s, subjectKey })))]);
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

describe("Speed Trivia star cap SQL (Phase 4a.1)", () => {
  it("refuses a 6th active question on a subject; 4 active leaves room for one; retired and waiting rows don't count", async () => {
    const live = [1, 2, 3, 4].map(n => q(n));
    await seed(live, "active");
    await seed([q(5), q(6)], "deleted");
    await seed([q(7), q(8), q(9)], "pending_review");
    expect(await capCheck([id(7), id(8)])).toEqual({ [id(7)]: "ok", [id(8)]: "ok" });
    await approveSigned(q(7));
    expect(await status(id(7))).toBe("active");
    expect(await capCheck([id(8)])).toEqual({ [id(8)]: "full" });
    await expect(approveSigned(q(8))).rejects.toThrow(/star-cap/);
    expect(await status(id(8))).toBe("pending_review");
    // Another subject is unaffected.
    await seed([q(20, "koala")], "pending_review", "koala");
    await approveSigned(q(20, "koala"));
    expect(await status(id(20))).toBe("active");
  });

  it("refuses an untagged question until it is tagged", async () => {
    await seed([q(1)], "pending_review", null);
    expect(await capCheck([id(1)])).toEqual({ [id(1)]: "untagged" });
    await expect(approveSigned(q(1))).rejects.toThrow(/star-cap-untagged/);
    await asAdmin("insert into question_tags(game,question_ref,category,subject,subject_key) values('speed',$1,'Animals','Chameleon','chameleon')", [id(1)]);
    await approveSigned(q(1));
    expect(await status(id(1))).toBe("active");
  });

  it("blocks even a direct status update to active", async () => {
    await seed([1, 2, 3, 4, 5].map(n => q(n)), "active");
    await seed([q(6)], "pending_review");
    await expect(db.query("update trivia_questions set status='active' where id=$1", [id(6)])).rejects.toThrow(/star-cap/);
    expect(await status(id(6))).toBe("pending_review");
    // Editing or retiring an already-active row isn't a new admission.
    await db.query("update trivia_questions set status='deleted' where id=$1", [id(1)]);
    expect(await status(id(1))).toBe("deleted");
  });

  it("bulk Keep approves up to the cap and reports the rest as subject_full, writing nothing for them", async () => {
    await seed([1, 2, 3].map(n => q(n)), "active");
    const waiting = [4, 5, 6, 7].map(n => q(n));
    await seed(waiting, "pending_review");
    for (const r of waiting) await admitPending(r);
    const result = await keep(waiting);
    expect(result.map(r => r.outcome)).toEqual(["approved", "approved", "subject_full", "subject_full"]);
    expect(await status(id(6))).toBe("pending_review");
    expect(await mark(id(6))).toBeNull();
    expect(await scalar<number>("select count(*)::int from trivia_questions t join question_tags g on g.question_ref=t.id::text where g.subject_key='chameleon' and t.status='active'")).toBe(5);
  });

  it("bulk Keep reports an untagged row and never queues it", async () => {
    await seed([q(1)], "pending_review", null);
    expect((await keep([q(1)]))[0].outcome).toBe("untagged");
    expect(await mark(id(1))).toBeNull();
  });

  it("thins a subject: retires only unchanged rows, never below 5, logs each, and releases the fact (D5)", async () => {
    await seed([1, 2, 3, 4, 5, 6].map(n => q(n)), "active");
    await seed([7, 8].map(n => q(n)), "pending_review");
    const result = await retire([{ r: q(6), status: "active" }, { r: q(7), status: "pending_review" }, { r: q(8), status: "pending_review" }]);
    expect(result.retired).toEqual([id(6), id(7), id(8)]);
    expect(await status(id(6))).toBe("deleted");
    expect(await status(id(7))).toBe("deleted");
    const log = (await db.query<{ row_id: string; old_status: string }>("select row_id, old_status from speed_trivia_subject_cap_log order by row_id")).rows;
    expect(log).toEqual([{ row_id: id(6), old_status: "active" }, { row_id: id(7), old_status: "pending_review" }, { row_id: id(8), old_status: "pending_review" }]);
    expect((await releasedV2()).map(r => r.id)).toEqual([id(6), id(7), id(8)]);
    // Only 5 left: retiring another is refused. Wrong status, wrong tag and changed content are skipped.
    const more = await retire([
      { r: q(1), status: "active" },
      { r: q(2), status: "pending_review" },
      { r: q(3), status: "active", subjectKey: "koala" },
      { r: { ...q(4), question: "Edited?" }, status: "active" },
    ]);
    expect(more.retired).toEqual([]);
    expect(more.skipped.map(s => s.reason)).toEqual(["would_go_below_cap", "status_changed", "tag_changed", "content_changed"]);
    await expect(retire([])).rejects.toThrow(/invalid-subject-cap-request/);
  });

  it("undo restores rows; a live row with no room goes back to waiting; the fast lane is then denied", async () => {
    await seed([1, 2, 3, 4, 5, 6].map(n => q(n)), "active");
    const w = q(7);
    await seed([w], "pending_review");
    await admitPending(w);
    await retire([{ r: q(6), status: "active" }, { r: w, status: "pending_review" }]);
    // 5 live rows are left, so the retired live row has no room and goes back to waiting.
    const result = await undo([id(6), id(7), id(30)]);
    expect(result.restored).toEqual([{ id: id(6), status: "pending_review" }, { id: id(7), status: "pending_review" }]);
    expect(result.skipped).toEqual([id(30)]);
    expect(await releasedV2()).toEqual([]);
    expect(await scalar<number>("select count(*)::int from speed_trivia_released_restores")).toBe(2);
    // With room again, a restored row's earlier full-bank admission no longer earns the free fast lane: Keep queues it.
    await db.query("update trivia_questions set status='deleted' where id=$1", [id(1)]);
    expect((await keep([w]))[0].outcome).toBe("queued");
    // A live row restored while its subject has room goes straight back to active.
    await seed([q(10)], "active");
    await retire([{ r: q(10), status: "active" }]);
    await db.query("update trivia_questions set status='deleted' where id=$1", [id(2)]);
    expect((await undo([id(10)])).restored).toEqual([{ id: id(10), status: "active" }]);
    // A second undo of the same rows does nothing.
    expect((await undo([id(6)])).restored).toEqual([]);
  });

  it("undo skips a row written after the thinning, and keeps browser roles out", async () => {
    await seed([1, 2, 3, 4, 5, 6].map(n => q(n)), "active");
    await retire([{ r: q(6), status: "active" }]);
    await db.query("update trivia_questions set difficulty='hard' where id=$1", [id(6)]).catch(() => undefined);
    await asAdmin("update speed_trivia_subject_cap_log set retired_revision = retired_revision - 1");
    expect((await undo([id(6)])).restored).toEqual([]);
    await db.exec("reset role; set role anon;");
    await expect(db.query("select * from speed_trivia_subject_cap_log")).rejects.toThrow(/permission denied/);
    await expect(db.query(`select public.speed_trivia_subject_cap_undo('${RUN}'::uuid, '{${id(6)}}'::uuid[])`)).rejects.toThrow(/permission denied/);
    await expect(db.query(`select public.speed_trivia_star_cap_check('{${id(6)}}'::uuid[])`)).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role;");
    await expect(db.query(`select public.speed_trivia_star_cap_state('${id(6)}'::uuid)`)).rejects.toThrow(/permission denied/);
  });
});
