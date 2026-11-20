import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4b of docs/speed-trivia-backlog-and-quality-plan.md:
// the writer's inbox (one batch per game per UTC day, idempotent retry, ≤ 2 posts) and Quick Review's Source filter.
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
  // Phase 7g (R2 #20.5): an identical retry is answered before the post limit.
  "supabase/migrations/20261120151403_question_writer_retry_before_post_limit.sql",
];
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const item = (n: number) => ({ slot: { n, category: "Music", area: "Pop", era: "1980s" }, payload: { question: `Question ${n}?` } });
const id = (n: number) => `83000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const receive = (hash: string, items: unknown[], source = "chatgpt", game = "speed", model: string | null = "gpt-6-astra") =>
  harness.call(db, "question_writer_receive", { p_game: game, p_source: source, p_model: model, p_batch_hash: hash, p_items: items }) as
    Promise<{ runDate: string; received: number; idempotent: boolean }>;

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  await db.exec("set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("question_writer_receive", () => {
  it("stores one day's batch under the server's UTC date", async () => {
    const result = await receive(HASH_A, [item(1), item(2)]);
    expect(result).toMatchObject({ received: 2, idempotent: false });
    expect(result.runDate).toBe(await scalar<string>("select ((now() at time zone 'utc')::date)::text"));
    expect(await scalar<number>("select count(*)::int from question_candidates where status='received' and source='chatgpt'")).toBe(2);
    expect(await scalar<string>("select model from question_writer_runs")).toBe("gpt-6-astra");
  });

  it("answers a retry of the same batch idempotently and refuses a different one", async () => {
    await receive(HASH_A, [item(1)]);
    expect(await receive(HASH_A, [item(1)])).toMatchObject({ received: 1, idempotent: true });
    await expect(receive(HASH_B, [item(2)])).rejects.toThrow(/writer-post-limit|writer-already-received/);
    expect(await scalar<number>("select count(*)::int from question_candidates")).toBe(1);
  });

  it("refuses a second different batch, every time", async () => {
    await receive(HASH_A, [item(1)]);
    await expect(receive(HASH_B, [item(2)])).rejects.toThrow(/writer-already-received/);
    await receive(HASH_A, [item(1)]);
    await expect(receive(HASH_B, [item(2)])).rejects.toThrow(/writer-already-received|writer-post-limit/);
    expect(await scalar<number>("select count(*)::int from question_candidates")).toBe(1);
  });

  // Phase 7g (second review R2 #20.5): before, the third identical retry got 'writer-post-limit' (429) for a batch
  // that was already stored. A retry now writes nothing and always succeeds.
  it("answers any number of identical retries idempotently, without counting them as posts", async () => {
    await receive(HASH_A, [item(1), item(2)]);
    for (let n = 0; n < 4; n++) expect(await receive(HASH_A, [item(1), item(2)])).toMatchObject({ received: 2, idempotent: true });
    expect(await scalar<number>("select posts from question_writer_runs")).toBe(1);
    expect(await scalar<number>("select count(*)::int from question_candidates")).toBe(2);
  });

  it("still refuses with writer-post-limit once the day's posts are used up", async () => {
    await receive(HASH_A, [item(1)]);
    await db.exec("reset role; update question_writer_runs set posts = 2, batch_hash = null; set role service_role;");
    await expect(receive(HASH_B, [item(2)])).rejects.toThrow(/writer-post-limit/);
  });

  it("restates the grants: service_role only", async () => {
    const grantees = (await db.query<{ grantee: string }>(
      "select grantee from information_schema.routine_privileges where routine_name = 'question_writer_receive' and privilege_type = 'EXECUTE'",
    )).rows.map((r) => r.grantee);
    expect(grantees).toContain("service_role");
    expect(grantees).not.toContain("anon");
    expect(grantees).not.toContain("authenticated");
    expect(grantees).not.toContain("PUBLIC");
  });

  it("keeps the fallback out once ChatGPT has posted (one batch a day)", async () => {
    await receive(HASH_A, [item(1)]);
    await expect(receive(HASH_B, [item(1)], "gemini-fallback", "speed", "gemini-2.5-flash")).rejects.toThrow(/writer-already-received/);
    expect(await scalar<string>("select source from question_writer_runs")).toBe("chatgpt");
  });

  it("rejects malformed posts and writes nothing", async () => {
    const tooMany = Array.from({ length: 41 }, (_, i) => item(i + 1));
    for (const bad of [
      () => receive(HASH_A, []),
      () => receive(HASH_A, tooMany),
      () => receive(HASH_A, [{ slot: "x", payload: {} }]),
      () => receive("nothex", [item(1)]),
      () => receive(HASH_A, [item(1)], "someone"),
      () => receive(HASH_A, [item(1)], "chatgpt", "bingo"),
      () => receive(HASH_A, [item(1)], "chatgpt", "speed", "bad model; drop"),
      () => receive(HASH_A, [{ slot: {}, payload: { question: "x".repeat(70_000) } }]),
    ]) await expect(bad()).rejects.toThrow(/invalid-writer-post/);
    expect(await scalar<number>("select count(*)::int from question_writer_runs")).toBe(0);
    expect(await scalar<number>("select count(*)::int from question_candidates")).toBe(0);
  });

  it("is service-role only; the tables can't be written directly except candidate outcomes", async () => {
    await db.exec("reset role; set role anon;");
    await expect(db.query("select public.question_writer_receive('speed','chatgpt',null,$1,'[]'::jsonb)", [HASH_A])).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from question_candidates")).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role;");
    await expect(db.query("insert into question_writer_runs(game,run_date,source) values('speed',current_date,'chatgpt')")).rejects.toThrow(/permission denied/);
    await receive(HASH_A, [item(1)]);
    await expect(db.query("update question_writer_runs set posts = 0")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into question_candidates(game,run_date,source,slot,payload) select game,run_date,source,'{}','{}' from question_writer_runs")).rejects.toThrow(/permission denied/);
    await db.query("update question_candidates set status='rejected', reason='schema', processed_at=now()");
    await expect(db.query("update question_candidates set status='pending_review'")).rejects.toThrow(/check constraint/);
  });
});

describe("Quick Review Source filter", () => {
  const insert = async (n: number, metadata: unknown) => {
    await db.exec("reset role; alter table trivia_questions disable trigger all;");
    await db.query(
      "insert into trivia_questions(id,slug,question,options,correct_answer,category,status,speed_generation_metadata,normalized_question_key) values($1,$2,$3,'[\"A\",\"B\",\"C\",\"D\"]'::jsonb,0,'Current Events','pending_review',$4::jsonb,$5)",
      [id(n), `q-${n}`, `Question number ${n}?`, metadata === null ? null : JSON.stringify(metadata), `questionnumber${n}`],
    );
    await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
  };
  const queue = (source: string) => harness.call(db, "speed_trivia_review_queue", {
    p_category: null, p_source: source, p_sort: "oldest", p_after_created: null, p_after_id: null, p_limit: 50,
  }) as Promise<{ total: number; rows: { id: string; source: string | null; area: string | null; era: string | null; sourceUrl: string | null }[] }>;

  beforeEach(async () => {
    await insert(1, null);
    await insert(2, { version: "speed-subject-plan-v1", subtopic: "x", primarySubject: "y" });
    await insert(3, { version: "speed-subject-plan-v1", subtopic: "Sports", primarySubject: "y", source: "chatgpt", area: "Sports", era: "2026-03", sourceUrl: "https://example.com/a" });
    await insert(4, { version: "speed-subject-plan-v1", subtopic: "x", primarySubject: "y", source: "gemini-fallback", sourceUrl: "javascript:alert(1)" });
  });

  it("filters by the writer's source and keeps older/recent as before", async () => {
    expect((await queue("all")).total).toBe(4);
    expect((await queue("older")).rows.map(r => r.id)).toEqual([id(1)]);
    expect((await queue("recent")).rows.map(r => r.id)).toEqual([id(2), id(3), id(4)]);
    expect((await queue("chatgpt")).rows.map(r => r.id)).toEqual([id(3)]);
    expect((await queue("gemini")).rows.map(r => r.id)).toEqual([id(4)]);
    await expect(queue("nope")).rejects.toThrow(/invalid-quick-review-query/);
  });

  it("returns area, era and only an https source link", async () => {
    const [chatgpt] = (await queue("chatgpt")).rows;
    expect(chatgpt).toMatchObject({ source: "chatgpt", area: "Sports", era: "2026-03", sourceUrl: "https://example.com/a" });
    const [gemini] = (await queue("gemini")).rows;
    expect(gemini.sourceUrl).toBeNull();
  });
});
