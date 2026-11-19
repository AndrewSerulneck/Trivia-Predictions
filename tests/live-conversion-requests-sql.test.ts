import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4e of docs/speed-trivia-backlog-and-quality-plan.md
// (D37): the Speed -> Live conversion queue, its brief read, the writer's receive call and the list's labels.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as {
  setup: (db: PGlite) => Promise<void>;
  call: (db: PGlite, name: string, args?: Record<string, unknown>) => Promise<unknown>;
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
  "supabase/migrations/20261116030506_question_writer_candidates.sql",
  "supabase/migrations/20261116201904_live_question_candidates.sql",
  "supabase/migrations/20261117025917_live_publish_pr_open.sql",
  "supabase/migrations/20261119134654_live_conversion_requests.sql",
];
const SPEED = "86000000-0000-4000-8000-000000000001";
const WAITING = "86000000-0000-4000-8000-000000000002";
const RETIRED = "86000000-0000-4000-8000-000000000003";
const LIVE_ROW = "86000000-0000-4000-8000-000000000004";
const CE = "86000000-0000-4000-8000-000000000005";

let db: PGlite;
const call = (name: string, args: Record<string, unknown>) => harness.call(db, name, args) as Promise<Record<string, unknown>>;
const queue = (id: string) => call("live_conversion_queue", { p_question_id: id });
const cancel = (id: string) => call("live_conversion_cancel", { p_question_id: id });
const brief = (limit = 20) => harness.call(db, "live_conversion_brief", { p_limit: limit }) as Promise<Record<string, unknown>[]>;
const receive = (items: unknown[]) => call("live_conversion_receive", { p_items: items });
const status = async (ids: string[]) =>
  (await db.query<{ r: Record<string, unknown>[] }>("select public.live_conversion_status($1::uuid[]) r", [ids])).rows[0].r;
const requestOf = async (id: string) =>
  (await db.query<Record<string, unknown>>("select * from live_conversion_requests where speed_question_id=$1 order by requested_at desc limit 1", [id])).rows[0];
const payload = { question: "Rust-colored dust gives which planet its nickname?", answer: "Mars", category: "Science & Tech" };
const slot = { n: 1, kind: "conversion", category: "Science & Tech", area: null, era: null };

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  // Fixtures only: the star-cap guard wants a subject tag on an active Speed row; it isn't what's tested here.
  await db.exec("alter table trivia_questions disable trigger all;");
  await db.query(`insert into trivia_questions (id, question, options, correct_answer, category, question_pool, answer_format, status, speed_generation_metadata, normalized_question_key) values
    ($1, 'Which planet is called the Red Planet?', '["Venus","Mars","Jupiter","Saturn"]', 1, 'Science', 'anytime_blitz', 'multiple_choice', 'active', '{"whyTrue":"Iron oxide dust."}', 'k1'),
    ($2, 'Which planet has the Great Red Spot?', '["Jupiter","Mars","Venus","Saturn"]', 0, 'Science', 'anytime_blitz', 'multiple_choice', 'pending_review', null, 'k2'),
    ($3, 'Which planet is smallest?', '["Mercury","Mars","Venus","Saturn"]', 0, 'Science', 'anytime_blitz', 'multiple_choice', 'deleted', null, 'k3'),
    ($4, 'Name the Red Planet.', '["Mars"]', 0, 'Science', 'live_showdown', 'write_in', 'active', null, 'k4'),
    ($5, 'In October 2026, who won?', '["A","B","C","D"]', 2, 'Current Events', 'anytime_blitz', 'multiple_choice', 'active',
      '{"era":"2026-10","sourceUrl":"https://example.com/x","expiresOn":"2027-10-01"}', 'k5')`, [SPEED, WAITING, RETIRED, LIVE_ROW, CE]);
  await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("live_conversion_queue / cancel", () => {
  it("queues an active or waiting Speed question once; a second request returns the open one", async () => {
    expect(await queue(SPEED)).toMatchObject({ status: "queued", already: false });
    expect(await queue(SPEED)).toMatchObject({ status: "queued", already: true });
    expect(await queue(WAITING)).toMatchObject({ status: "queued", already: false });
    expect(Number((await db.query<{ n: number }>("select count(*)::int n from live_conversion_requests")).rows[0].n)).toBe(2);
  });

  it("refuses a Live row, a retired row and an unknown id", async () => {
    await expect(queue(LIVE_ROW)).rejects.toThrow(/conversion-not-speed/);
    await expect(queue(RETIRED)).rejects.toThrow(/conversion-not-active/);
    await expect(queue("86000000-0000-4000-8000-0000000000ff")).rejects.toThrow(/conversion-not-speed/);
  });

  it("cancels only a queued request, and a cancelled question can be queued again", async () => {
    await queue(SPEED);
    expect(await cancel(SPEED)).toEqual({ cancelled: true });
    expect(await cancel(SPEED)).toEqual({ cancelled: false });
    expect(await queue(SPEED)).toMatchObject({ status: "queued", already: false });
    const [row] = await brief();
    await receive([{ requestId: row.requestId, slot, payload }]);
    expect(await cancel(SPEED)).toEqual({ cancelled: false });
  });

  it("refuses while the Live version waits in review or once it is kept, and allows a retry after a reject or failure", async () => {
    await queue(SPEED);
    const [row] = await brief();
    await receive([{ requestId: row.requestId, slot, payload }]);
    const req = await requestOf(SPEED);
    await db.query("update question_candidates set status='pending_review', question_ref='slug-1' where id=$1", [req.candidate_id]);
    await db.query("update live_conversion_requests set status='done' where id=$1", [req.id]);
    await expect(queue(SPEED)).rejects.toThrow(/conversion-in-review/);
    await db.query("update question_candidates set status='keep' where id=$1", [req.candidate_id]);
    await expect(queue(SPEED)).rejects.toThrow(/conversion-already-live/);
    await db.query("update question_candidates set status='reject' where id=$1", [req.candidate_id]);
    expect(await queue(SPEED)).toMatchObject({ status: "queued", already: false });
    await cancel(SPEED);
    await db.query("update live_conversion_requests set status='failed', reason='x' where id=$1", [req.id]);
    expect(await queue(SPEED)).toMatchObject({ already: false });
  });

  it("allows only one open request per question, even written directly", async () => {
    await queue(SPEED);
    await expect(db.query("insert into live_conversion_requests (speed_question_id) values ($1)", [SPEED])).rejects.toThrow(/duplicate key/);
  });
});

describe("live_conversion_brief", () => {
  it("reads the oldest queued requests whose Speed question is live, with the answer and metadata, up to the limit", async () => {
    await queue(WAITING);
    await queue(CE);
    await queue(SPEED);
    const rows = await brief();
    expect(rows.map((r) => r.question)).toEqual(["In October 2026, who won?", "Which planet is called the Red Planet?"]);
    expect(rows[0]).toMatchObject({ answer: "C", category: "Current Events", era: "2026-10", sourceUrl: "https://example.com/x", expiresOn: "2027-10-01" });
    expect(rows[1]).toMatchObject({ answer: "Mars", whyTrue: "Iron oxide dust.", sourceUrl: null });
    expect(await brief(1)).toHaveLength(1);
    await expect(brief(21)).rejects.toThrow(/invalid-conversion/);
    expect((await requestOf(SPEED)).status).toBe("queued");
  });
});

describe("live_conversion_receive", () => {
  it("stores a rewrite as today's Live candidate with the Speed question added by the database, then is idempotent", async () => {
    await queue(SPEED);
    const [row] = await brief();
    const forged = { ...payload, conversionOf: "someone-else", fromSpeed: { question: "Forged?" } };
    expect(await receive([{ requestId: row.requestId, slot, payload: forged }])).toMatchObject({ received: 1, declined: 0, already: 0 });
    const req = await requestOf(SPEED);
    expect(req).toMatchObject({ status: "sent", reason: null });
    const cand = (await db.query<Record<string, unknown>>("select * from question_candidates where id=$1", [req.candidate_id])).rows[0];
    expect(cand).toMatchObject({ game: "live", status: "received", source: "chatgpt", slot });
    expect(cand.payload).toMatchObject({ answer: "Mars", conversionOf: row.requestId,
      fromSpeed: { id: SPEED, question: "Which planet is called the Red Planet?", answer: "Mars" } });
    expect((await db.query("select * from question_writer_runs where game='live'")).rows).toHaveLength(1);
    expect(await receive([{ requestId: row.requestId, slot, payload }])).toMatchObject({ received: 0, already: 1 });
    expect(Number((await db.query<{ n: number }>("select count(*)::int n from question_candidates")).rows[0].n)).toBe(1);
  });

  it("records a decline with its reason and leaves the day's Live batch free to arrive", async () => {
    await queue(SPEED);
    const [row] = await brief();
    expect(await receive([{ requestId: row.requestId, declined: true, reason: "Too hard without choices." }])).toMatchObject({ declined: 1 });
    expect(await requestOf(SPEED)).toMatchObject({ status: "declined", reason: "Too hard without choices.", candidate_id: null });
    const batch = await harness.call(db, "question_writer_receive", { p_game: "live", p_source: "chatgpt", p_model: "gpt-6-astra",
      p_batch_hash: "d".repeat(64), p_items: [{ slot: { n: 1, category: "Music" }, payload: { question: "Q?" } }] });
    expect(batch).toMatchObject({ received: 1, idempotent: false });
  });

  it("refuses a malformed post: bad ids, repeated ids, a rewrite without a payload, too many items", async () => {
    await expect(receive([{ requestId: "x", slot, payload }])).rejects.toThrow(/invalid-conversion-post/);
    const id = "87000000-0000-4000-8000-000000000001";
    await expect(receive([{ requestId: id, declined: true, reason: "a" }, { requestId: id, declined: true, reason: "b" }])).rejects.toThrow(/invalid-conversion-post/);
    await expect(receive([{ requestId: id, slot }])).rejects.toThrow(/invalid-conversion-post/);
    await expect(receive([{ requestId: id, declined: true }])).rejects.toThrow(/invalid-conversion-post/);
    await expect(receive(Array.from({ length: 21 }, (_, i) => ({ requestId: `87000000-0000-4000-8000-${String(i).padStart(12, "0")}`, declined: true, reason: "r" }))))
      .rejects.toThrow(/invalid-conversion-post/);
    expect(await receive([{ requestId: id, declined: true, reason: "unknown request" }])).toMatchObject({ already: 1 });
  });

  it("never writes trivia_questions", async () => {
    await queue(SPEED);
    const before = (await db.query("select * from trivia_questions order by id")).rows;
    const [row] = await brief();
    await receive([{ requestId: row.requestId, slot, payload }]);
    expect((await db.query("select * from trivia_questions order by id")).rows).toEqual(before);
  });
});

describe("live_conversion_status", () => {
  it("returns the newest non-cancelled request per question with its Live candidate's status", async () => {
    await queue(SPEED);
    await queue(WAITING);
    await cancel(WAITING);
    await queue(CE);
    const [row] = await brief();
    await receive([{ requestId: row.requestId, slot, payload }]);
    const rows = await status([SPEED, WAITING, CE]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.questionId === SPEED)).toMatchObject({ status: "sent", liveStatus: "received" });
    expect(rows.find((r) => r.questionId === CE)).toMatchObject({ status: "queued", liveStatus: null });
    await expect(status(Array.from({ length: 101 }, () => SPEED))).rejects.toThrow(/invalid-conversion/);
  });
});

describe("grants", () => {
  it("keeps the table and functions away from the browser roles", async () => {
    await db.exec("reset role; set role anon;");
    await expect(db.query("select * from live_conversion_requests")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.live_conversion_brief(5)")).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role authenticated;");
    await expect(db.query(`select public.live_conversion_queue('${SPEED}')`)).rejects.toThrow(/permission denied/);
  });
});
