import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as {
  setup: (db: PGlite) => Promise<void>;
  call: (db: PGlite, name: string, args?: Record<string, unknown>) => Promise<unknown>;
  checked: (candidate: SpeedQuestion, revision: string) => Record<string, unknown>;
  row: (id: string, q: string, answer: string, category?: string) => SpeedQuestion;
  SECRET: string;
};
const MIGRATION = "supabase/migrations/20261115151703_speed_trivia_quick_review.sql";
const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type QueueRow = { id: string; contentHash: string; recent: boolean; createdAt: string; category: string };
type Queue = { total: number; rows: QueueRow[] };

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const asAdmin = async (sql: string, args: unknown[] = []) => {
  await db.exec("reset role;");
  try { await db.query(sql, args); } finally { await db.exec("set role service_role;"); }
};
const queue = (args: Partial<Record<string, unknown>> = {}) => harness.call(db, "speed_trivia_review_queue", {
  p_category: null, p_source: null, p_sort: null, p_after_created: null, p_after_id: null, p_limit: 50, ...args,
}) as Promise<Queue>;
const keepCheck = (rows: { id: string; contentHash: string }[], overrides: Record<string, unknown> = {}) => {
  const envelope = { operation: "quick_keep", policyVersion: core.POLICY_VERSION, expiresAt: Date.now() + 300_000, rows, ...overrides };
  return { p_check: envelope, p_signature: runtime.sign(harness.SECRET, envelope) };
};
const keep = async (rows: { id: string; contentHash: string }[]) =>
  ((await harness.call(db, "speed_trivia_quick_keep", keepCheck(rows))) as { rows: { id: string; outcome: string }[] }).rows;
const reject = async (ids: string[], reason = "quality") =>
  (await scalar<{ rejected: string[] }>("select public.speed_trivia_quick_reject($1::uuid[], $2) r", [`{${ids.join(",")}}`, reason])).rejected;
const undo = (rowId: string) => scalar<{ status: string }>("select public.speed_trivia_quick_undo($1::uuid) r", [rowId]);
const status = (rowId: string) => scalar<string>("select status from trivia_questions where id=$1", [rowId]);
const mark = (rowId: string) => db.query<Record<string, unknown>>("select * from speed_trivia_review_marks where row_id=$1", [rowId]).then(r => r.rows[0] ?? null);

// Older backlog rows existed before the checker: no admission record.
const seedOlder = async (rows: SpeedQuestion[], createdAt = "2026-07-01T00:00:00Z") => {
  await db.exec("reset role; alter table trivia_questions disable trigger all;");
  for (const [n, r] of rows.entries()) {
    await db.query(
      "insert into trivia_questions(id,slug,question,options,correct_answer,category,status,normalized_question_key,created_at) values($1,$2,$3,$4::jsonb,0,$5,'pending_review',$6,$7::timestamptz + make_interval(secs => $8))",
      [r.id, r.slug, r.question, JSON.stringify(r.options), r.category, core.exactKey(r.question), createdAt, n],
    );
  }
  await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
};
// Newer rows arrive through a full-bank signed admission (as the nightly writer does).
const admitRecent = async (r: SpeedQuestion) => {
  const revision = ((await harness.call(db, "speed_trivia_inventory")) as { revision: string }).revision;
  await harness.call(db, "admit_speed_trivia", harness.checked(r, revision));
  await asAdmin("update trivia_questions set speed_generation_metadata='{\"version\":\"speed-subject-plan-v1\"}'::jsonb where id=$1", [r.id]);
};

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  await db.exec(readFileSync(MIGRATION, "utf8"));
  await db.exec("set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("Speed Trivia Quick Review SQL", () => {
  it("pages undecided waiting Speed questions with server-side filters and keyset order", async () => {
    await seedOlder([
      harness.row(id(1), "Which planet is the Red Planet?", "Mars", "Science"),
      harness.row(id(2), "Which ocean is the largest?", "Pacific", "Geography"),
      harness.row(id(3), "Which metal is liquid at room temperature?", "Mercury", "Science"),
    ]);
    await admitRecent(harness.row(id(4), "Which band recorded Abbey Road?", "The Beatles", "Music"));
    await asAdmin("insert into trivia_questions(slug,question,options,correct_answer,category,question_pool,answer_format,status) values('live-q','Live question?','[\"One\"]',0,'Science','live_showdown','write_in','pending_review')");

    const all = await queue();
    expect(all.total).toBe(4);
    expect(all.rows.map(r => r.id)).toEqual([id(1), id(2), id(3), id(4)]);
    expect(all.rows[3].recent).toBe(true);
    expect(all.rows[0].contentHash).toBe(core.contentHash({ ...harness.row(id(1), "Which planet is the Red Planet?", "Mars", "Science"), status: "pending_review" }));

    expect((await queue({ p_source: "older" })).rows.map(r => r.id)).toEqual([id(1), id(2), id(3)]);
    expect((await queue({ p_source: "recent" })).rows.map(r => r.id)).toEqual([id(4)]);
    expect((await queue({ p_category: "Science" })).total).toBe(2);
    expect((await queue({ p_sort: "newest", p_limit: 2 })).rows.map(r => r.id)).toEqual([id(4), id(3)]);

    const first = await queue({ p_limit: 2 });
    expect(first.total).toBe(4);
    const next = await queue({ p_limit: 2, p_after_created: first.rows[1].createdAt, p_after_id: first.rows[1].id });
    expect(next.rows.map(r => r.id)).toEqual([id(3), id(4)]);

    await expect(queue({ p_limit: 101 })).rejects.toThrow(/invalid-quick-review-query/);
    await expect(queue({ p_source: "live" })).rejects.toThrow(/invalid-quick-review-query/);
  });

  it("approves a full-bank admitted row for free and queues everything else", async () => {
    await seedOlder([harness.row(id(1), "Which planet is the Red Planet?", "Mars")]);
    await admitRecent(harness.row(id(2), "Which band recorded Abbey Road?", "The Beatles", "Music"));
    await admitRecent(harness.row(id(3), "Who painted the Mona Lisa?", "Leonardo da Vinci", "History"));
    // A recent row whose admission was approved-only scope is not full-bank evidence.
    await asAdmin("update speed_trivia_admissions set evidence = evidence || '{\"comparisonScope\":\"approved\"}' where row_id=$1", [id(3)]);
    const rows = (await queue()).rows;
    const hash = (rowId: string) => rows.find(r => r.id === rowId)!.contentHash;

    const outcomes = await keep([id(1), id(2), id(3)].map(rowId => ({ id: rowId, contentHash: hash(rowId) })));
    expect(Object.fromEntries(outcomes.map(o => [o.id, o.outcome]))).toEqual({ [id(1)]: "queued", [id(2)]: "approved", [id(3)]: "queued" });
    expect(await status(id(1))).toBe("pending_review");
    expect(await status(id(2))).toBe("active");
    expect(await status(id(3))).toBe("pending_review");
    expect(await mark(id(2))).toMatchObject({ decision: "keep", outcome: "approved", content_hash: hash(id(2)) });
    expect(await mark(id(1))).toMatchObject({ decision: "keep", outcome: "queued" });
    // Decided rows leave the queue; nothing remains pending-and-undecided.
    expect((await queue()).total).toBe(0);
  });

  it("refuses the fast lane when content differs from the admission or from what was reviewed", async () => {
    await admitRecent(harness.row(id(1), "Which band recorded Abbey Road?", "The Beatles", "Music"));
    await admitRecent(harness.row(id(2), "Who painted the Mona Lisa?", "Leonardo da Vinci", "History"));
    const rows = (await queue()).rows;
    // Admission record no longer matches the row (e.g. content written another way).
    await asAdmin("update speed_trivia_admissions set content_hash=repeat('0',64) where row_id=$1", [id(1)]);
    const outcomes = await keep([
      { id: id(1), contentHash: rows[0].contentHash },
      { id: id(2), contentHash: "f".repeat(64) },
    ]);
    expect(outcomes.map(o => o.outcome)).toEqual(["queued", "changed"]);
    expect(await status(id(1))).toBe("pending_review");
    expect(await status(id(2))).toBe("pending_review");
    expect(await mark(id(2))).toBeNull();
    // No admission record at all.
    await asAdmin("delete from speed_trivia_admissions where row_id=$1", [id(2)]);
    expect((await keep([{ id: id(2), contentHash: rows[1].contentHash }]))[0].outcome).toBe("queued");
  });

  it("requires a valid, current signature to keep", async () => {
    await admitRecent(harness.row(id(1), "Which band recorded Abbey Road?", "The Beatles", "Music"));
    const [row] = (await queue()).rows;
    const good = keepCheck([{ id: row.id, contentHash: row.contentHash }]);
    await expect(harness.call(db, "speed_trivia_quick_keep", { ...good, p_signature: "0".repeat(64) })).rejects.toThrow(/invalid-quick-review-check/);
    await expect(harness.call(db, "speed_trivia_quick_keep", keepCheck([{ id: row.id, contentHash: row.contentHash }], { expiresAt: Date.now() - 1 }))).rejects.toThrow(/invalid-quick-review-check/);
    await expect(harness.call(db, "speed_trivia_quick_keep", keepCheck([{ id: row.id, contentHash: row.contentHash }], { operation: "admit" }))).rejects.toThrow(/invalid-quick-review-check/);
    await expect(harness.call(db, "speed_trivia_quick_keep", keepCheck([]))).rejects.toThrow(/invalid-quick-review-check/);
    expect(await status(row.id)).toBe("pending_review");
  });

  it("rejects only waiting Speed questions and records the reason", async () => {
    await seedOlder([harness.row(id(1), "Which planet is the Red Planet?", "Mars"), harness.row(id(2), "Which ocean is the largest?", "Pacific")]);
    const approvedId = await scalar<string>("select id from trivia_questions where slug='gobi'");
    await asAdmin("insert into trivia_questions(id,slug,question,options,correct_answer,category,question_pool,answer_format,status) values($1,'live-q','Live question?','[\"One\"]',0,'Science','live_showdown','write_in','pending_review')", [id(9)]);
    expect(await reject([id(1), approvedId, id(9)], "wrong")).toEqual([id(1)]);
    expect(await status(id(1))).toBe("deleted");
    expect(await status(approvedId)).toBe("active");
    expect(await status(id(9))).toBe("pending_review");
    const keepLive = await keep([{ id: id(9), contentHash: "a".repeat(64) }]);
    expect(keepLive[0].outcome).toBe("not_pending");
    expect(await status(id(9))).toBe("pending_review");
    expect(await mark(id(9))).toBeNull();
    expect(await mark(id(1))).toMatchObject({ decision: "reject", outcome: "rejected", reason: "wrong" });
    await expect(reject([id(2)], "boring")).rejects.toThrow(/invalid-quick-review-request/);
    expect(await status(id(2))).toBe("pending_review");
  });

  it("undoes reject, fast-lane approval and queued keep, but not after another write", async () => {
    await seedOlder([harness.row(id(1), "Which planet is the Red Planet?", "Mars"), harness.row(id(2), "Which ocean is the largest?", "Pacific")]);
    await admitRecent(harness.row(id(3), "Which band recorded Abbey Road?", "The Beatles", "Music"));
    const rows = (await queue()).rows;
    const hash = (rowId: string) => rows.find(r => r.id === rowId)!.contentHash;

    await reject([id(1)]);
    expect(await undo(id(1))).toMatchObject({ status: "pending_review" });
    expect(await status(id(1))).toBe("pending_review");
    expect(await mark(id(1))).toBeNull();

    await keep([{ id: id(3), contentHash: hash(id(3)) }]);
    expect(await status(id(3))).toBe("active");
    await undo(id(3));
    expect(await status(id(3))).toBe("pending_review");
    // Still admitted, so Keep again is still free.
    expect((await keep([{ id: id(3), contentHash: hash(id(3)) }]))[0].outcome).toBe("approved");

    await keep([{ id: id(2), contentHash: hash(id(2)) }]);
    await undo(id(2));
    expect(await mark(id(2))).toBeNull();
    expect((await queue()).rows.map(r => r.id)).toEqual([id(1), id(2)]);

    // Another writer retires the approved row: Undo must not resurrect it.
    await db.query("update trivia_questions set status='deleted' where id=$1", [id(3)]);
    await expect(undo(id(3))).rejects.toThrow(/quick-review-undo-drift/);
    expect(await status(id(3))).toBe("deleted");
    await expect(undo(id(2))).rejects.toThrow(/quick-review-nothing-to-undo/);
  });

  it("keeps the Phase 2 score through Undo", async () => {
    await seedOlder([harness.row(id(1), "Which planet is the Red Planet?", "Mars")]);
    await reject([id(1)]);
    await asAdmin("update speed_trivia_review_marks set audience='{\"familiar\":5}' where row_id=$1", [id(1)]);
    await undo(id(1));
    expect(await mark(id(1))).toMatchObject({ decision: null, outcome: null, audience: { familiar: 5 } });
    expect((await queue()).total).toBe(1);
  });

  it("keeps marks RPC-only and the RPCs server-only; raw approval stays blocked", async () => {
    await seedOlder([harness.row(id(1), "Which planet is the Red Planet?", "Mars")]);
    await expect(db.query("insert into speed_trivia_review_marks(row_id) values($1)", [id(1)])).rejects.toThrow(/permission denied/);
    await expect(db.query("update trivia_questions set status='active' where id=$1", [id(1)])).rejects.toThrow(/speed-admission-required/);
    expect(await scalar<number>("select count(*)::int from speed_trivia_review_marks")).toBe(0);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role};`);
      await expect(db.query("select public.speed_trivia_quick_undo($1::uuid)", [id(1)])).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.speed_trivia_review_queue(null,null,null,null,null,10)")).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role; set role service_role;");
  });
});
