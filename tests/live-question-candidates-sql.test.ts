import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4c of docs/speed-trivia-backlog-and-quality-plan.md:
// Live candidate statuses on the writer's inbox and the one-at-a-time Publish claim; Phase 4c.2: pr_open, recording the
// PR before merging, the one-transaction settle and the PR check.
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
  "supabase/migrations/20261117033637_speed_trivia_expire_undated_current_events.sql",
];
const HASH = "c".repeat(64);
const item = (n: number) => ({ slot: { n, category: "Music", area: "Classic rock", era: "1970s" }, payload: { question: `Live question ${n}?` } });
const CLAIM_A = "84000000-0000-4000-8000-000000000001";
const CLAIM_B = "84000000-0000-4000-8000-000000000002";

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const receive = (game: string, items: unknown[]) =>
  harness.call(db, "question_writer_receive", { p_game: game, p_source: "chatgpt", p_model: "gpt-6-astra", p_batch_hash: HASH, p_items: items });
const claim = (id: string, limit = 50) =>
  harness.call(db, "live_candidates_publish_claim", { p_claim: id, p_limit: limit }) as Promise<{ id: string; questionRef: string }[]>;
const toWaiting = (slugPrefix = "slug") =>
  db.query("update question_candidates set status='pending_review', question_ref=$1 || '-' || (slot->>'n'), processed_at=now() where game='live'", [slugPrefix]);

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  await db.exec("set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("Live candidate statuses", () => {
  it("lets a Live candidate wait, be kept or rejected, and be undone", async () => {
    await receive("live", [item(1), item(2)]);
    await toWaiting();
    await db.query("update question_candidates set status='keep', decided_at=now() where slot->>'n'='1'");
    await db.query("update question_candidates set status='reject', decided_at=now() where slot->>'n'='2'");
    await db.query("update question_candidates set status='pending_review', decided_at=null where slot->>'n'='2'");
    expect((await db.query("select status from question_candidates order by slot->>'n'")).rows).toEqual([{ status: "keep" }, { status: "pending_review" }]);
  });

  it("keeps Speed candidates to the 4b statuses and the pending_review rule", async () => {
    await receive("speed", [item(1)]);
    await expect(db.query("update question_candidates set status='keep', question_ref='x'")).rejects.toThrow(/check constraint/);
    await expect(db.query("update question_candidates set status='pending_review'")).rejects.toThrow(/check constraint/);
    await db.query("update question_candidates set status='pending_review', question_ref='83000000-0000-4000-8000-000000000001'");
  });

  it("requires a slug while a Live candidate is in review and a PR link only once published", async () => {
    await receive("live", [item(1)]);
    await expect(db.query("update question_candidates set status='pending_review'")).rejects.toThrow(/check constraint/);
    await toWaiting();
    await expect(db.query("update question_candidates set pr_url='https://github.com/o/r/pull/1'")).rejects.toThrow(/check constraint/);
    await expect(db.query("update question_candidates set status='publishing'")).rejects.toThrow(/check constraint/);
    await expect(db.query("update question_candidates set status='published', pr_url='http://evil.example/x'")).rejects.toThrow(/check constraint/);
  });
});

describe("live_candidates_publish_claim", () => {
  beforeEach(async () => {
    await receive("live", [item(1), item(2), item(3)]);
    await toWaiting();
    await db.query("update question_candidates set status='keep', decided_at=now() - make_interval(mins => (slot->>'n')::int) where slot->>'n' in ('1','2')");
  });

  it("claims only kept candidates, oldest decision first", async () => {
    const claimed = await claim(CLAIM_A);
    expect(claimed.map((c) => c.questionRef)).toEqual(["slug-2", "slug-1"]);
    expect(await scalar<number>("select count(*)::int from question_candidates where status='publishing' and publish_claim=$1", [CLAIM_A])).toBe(2);
    expect(await scalar<string>("select status from question_candidates where slot->>'n'='3'")).toBe("pending_review");
  });

  it("refuses a second Publish while one is running, and re-claims a stale one", async () => {
    await claim(CLAIM_A, 1);
    await expect(claim(CLAIM_B)).rejects.toThrow(/publish-in-progress/);
    await db.exec("reset role;");
    await db.query("update question_candidates set claimed_at = now() - interval '11 minutes' where status='publishing'");
    await db.exec("set role service_role;");
    const again = await claim(CLAIM_B);
    expect(again).toHaveLength(2);
    expect(await scalar<number>("select count(*)::int from question_candidates where publish_claim=$1", [CLAIM_B])).toBe(2);
  });

  it("settles to published with the PR link, or back to keep", async () => {
    await claim(CLAIM_A);
    await db.query("update question_candidates set status='published', pr_url='https://github.com/o/r/pull/7', publish_claim=null, claimed_at=null where slot->>'n'='1'");
    await db.query("update question_candidates set status='keep', publish_claim=null, claimed_at=null where slot->>'n'='2'");
    expect(await claim(CLAIM_B)).toHaveLength(1);
  });

  it("is service-role only and validates its input", async () => {
    await expect(claim(CLAIM_A, 0)).rejects.toThrow(/invalid-publish-claim/);
    await db.exec("reset role; set role authenticated;");
    await expect(db.query("select public.live_candidates_publish_claim($1, 5)", [CLAIM_A])).rejects.toThrow(/permission denied/);
  });
});

describe("Publish records what really happened (Phase 4c.2)", () => {
  const PR = "https://github.com/o/r/pull/9";
  const ids = async () => (await db.query<{ id: string }>("select id from question_candidates where game='live' order by slot->>'n'")).rows.map((r) => r.id);
  const record = (claimId: string, rows: unknown[], url = PR) => harness.call(db, "live_candidates_publish_record_pr", { p_claim: claimId, p_pr_url: url, p_rows: rows });
  const settle = (claimId: string, rows: unknown[]) => harness.call(db, "live_candidates_publish_settle", { p_claim: claimId, p_rows: rows });
  const prSettle = (state: string, url = PR) => harness.call(db, "live_candidates_pr_settle", { p_pr_url: url, p_state: state }) as Promise<{ id: string; questionRef: string }[]>;
  type Live = { status: string; question_ref: string | null; pr_url: string | null; publish_claim: string | null; reason: string | null };
  const rowsOf = async () => (await db.query<Live>("select status, question_ref, pr_url, publish_claim, reason from question_candidates where game='live' order by slot->>'n'")).rows;
  const age = async (minutes: number) => {
    await db.exec("reset role;");
    await db.query("update question_candidates set claimed_at = now() - make_interval(mins => $1::int) where status='publishing'", [minutes]);
    await db.exec("set role service_role;");
  };

  beforeEach(async () => {
    await receive("live", [item(1), item(2), item(3)]);
    await toWaiting();
    await db.query("update question_candidates set status='keep', decided_at=now() - make_interval(mins => (slot->>'n')::int)");
    await claim(CLAIM_A);
  });

  it("allows pr_open only with a slug and PR link and no claim", async () => {
    await expect(db.query("update question_candidates set status='pr_open', publish_claim=null, claimed_at=null")).rejects.toThrow(/check constraint/);
    await db.query("update question_candidates set status='pr_open', pr_url=$1, publish_claim=null, claimed_at=null", [PR]);
    await expect(db.query("update question_candidates set question_ref=null")).rejects.toThrow(/check constraint/);
    await expect(db.query("update question_candidates set publish_claim=$1", [CLAIM_B])).rejects.toThrow(/check constraint/);
    await expect(db.query("update question_candidates set status='keep'")).rejects.toThrow(/check constraint/);
  });

  it("records the PR and final slugs on the claimed rows, all or nothing", async () => {
    const [a, b, c] = await ids();
    expect(await record(CLAIM_A, [{ id: a, questionRef: "final-1" }, { id: b, questionRef: "final-2" }])).toBe(2);
    expect((await rowsOf()).map((r) => [r.status, r.question_ref, r.pr_url])).toEqual([
      ["publishing", "final-1", PR], ["publishing", "final-2", PR], ["publishing", "slug-3", null]]);
    await expect(record(CLAIM_B, [{ id: c, questionRef: "x" }])).rejects.toThrow(/publish-record-mismatch/);
    await expect(record(CLAIM_A, [{ id: c, questionRef: "x" }, { id: "84000000-0000-4000-8000-00000000dead", questionRef: "y" }])).rejects.toThrow(/publish-record-mismatch/);
    expect((await rowsOf())[2]).toMatchObject({ question_ref: "slug-3", pr_url: null });
    await expect(record(CLAIM_A, [{ id: c, questionRef: "x" }], "http://evil.example/x")).rejects.toThrow(/invalid-publish-record/);
  });

  it("settles merged -> published, not merged -> pr_open, refused -> reject in one transaction", async () => {
    const [a, b, c] = await ids();
    await record(CLAIM_A, [{ id: a, questionRef: "final-1" }, { id: b, questionRef: "final-2" }]);
    expect(await settle(CLAIM_A, [
      { id: a, status: "published", questionRef: "final-1", prUrl: PR },
      { id: b, status: "pr_open", questionRef: "final-2", prUrl: PR },
      { id: c, status: "reject", reason: "publish:invalid-candidate" },
    ])).toBe(3);
    expect(await rowsOf()).toEqual([
      { status: "published", question_ref: "final-1", pr_url: PR, publish_claim: null, reason: null },
      { status: "pr_open", question_ref: "final-2", pr_url: PR, publish_claim: null, reason: null },
      { status: "reject", question_ref: "slug-3", pr_url: null, publish_claim: null, reason: "publish:invalid-candidate" },
    ]);
  });

  it("rolls a settle back when its count doesn't match, and nothing with a PR is re-claimed", async () => {
    const [a, b, c] = await ids();
    await record(CLAIM_A, [{ id: a, questionRef: "final-1" }, { id: b, questionRef: "final-2" }]);
    await expect(settle(CLAIM_A, [
      { id: a, status: "published", questionRef: "final-1", prUrl: PR },
      { id: "84000000-0000-4000-8000-00000000dead", status: "reject", reason: "x" },
    ])).rejects.toThrow(/publish-settle-mismatch/);
    expect((await rowsOf()).map((r) => r.status)).toEqual(["publishing", "publishing", "publishing"]);
    await expect(settle(CLAIM_A, [{ id: c, status: "pr_open", questionRef: "slug-3" }])).rejects.toThrow(/invalid-publish-settle/);
    await age(11);
    const again = await claim(CLAIM_B);
    expect(again.map((r) => r.id)).toEqual([c]);
  });

  it("the PR check: open -> pr_open, closed -> keep (Undo works), merged -> published", async () => {
    const [a, b] = await ids();
    await record(CLAIM_A, [{ id: a, questionRef: "final-1" }, { id: b, questionRef: "final-2" }]);
    expect(await prSettle("open")).toEqual([]); // the claim is still fresh: a running Publish owns it
    await age(11);
    expect((await prSettle("open")).map((r) => r.questionRef).sort()).toEqual(["final-1", "final-2"]);
    expect((await rowsOf()).slice(0, 2).map((r) => r.status)).toEqual(["pr_open", "pr_open"]);
    expect(await prSettle("open")).toEqual([]);
    expect((await prSettle("closed")).map((r) => r.id).sort()).toEqual([a, b].sort());
    expect((await rowsOf()).slice(0, 2)).toEqual([
      { status: "keep", question_ref: "final-1", pr_url: null, publish_claim: null, reason: null },
      { status: "keep", question_ref: "final-2", pr_url: null, publish_claim: null, reason: null }]);
    await db.query("update question_candidates set status='pending_review', decided_at=null where id=$1 and status in ('keep','reject')", [a]);
    expect((await rowsOf())[0].status).toBe("pending_review");
  });

  it("the PR check settles a merged PR's rows as published", async () => {
    const [a] = await ids();
    await record(CLAIM_A, [{ id: a, questionRef: "final-1" }]);
    await age(11);
    const moved = await prSettle("merged");
    expect(moved).toEqual([expect.objectContaining({ id: a, questionRef: "final-1" })]);
    expect((await rowsOf())[0]).toMatchObject({ status: "published", pr_url: PR, publish_claim: null });
    await expect(prSettle("gone")).rejects.toThrow(/invalid-pr-settle/);
  });

  it("the new functions are service-role only", async () => {
    await db.exec("reset role; set role authenticated;");
    await expect(db.query("select public.live_candidates_publish_settle($1, '[]'::jsonb)", [CLAIM_A])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.live_candidates_publish_record_pr($1, $2, '[]'::jsonb)", [CLAIM_A, PR])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.live_candidates_pr_settle($1, 'open')", [PR])).rejects.toThrow(/permission denied/);
  });
});
