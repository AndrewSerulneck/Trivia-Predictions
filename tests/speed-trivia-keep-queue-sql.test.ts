import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 3: the overnight Keep queue and D5.
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
];
const id = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Queue = { total: number; rows: { id: string; note: string | null; match: { id: string; question: string; answer: string } | null }[]; counts: { queued: number; needsLook: number; repeats: number } };

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const asAdmin = async (sql: string, args: unknown[] = []) => {
  await db.exec("reset role;");
  try { await db.query(sql, args); } finally { await db.exec("set role service_role;"); }
};
const revision = async () => ((await harness.call(db, "speed_trivia_inventory")) as { revision: string }).revision;
const find = async (rowId: string) => ((await harness.call(db, "speed_trivia_find", { p_identifier: rowId })) as Record<string, unknown>[])[0];
const queue = (view: string | null = null) => harness.call(db, "speed_trivia_review_queue", {
  p_category: null, p_source: null, p_sort: null, p_after_created: null, p_after_id: null, p_limit: 50, p_view: view,
}) as Promise<Queue>;
const keep = async (rows: { id: string; contentHash: string }[]) => {
  const envelope = { operation: "quick_keep", policyVersion: core.POLICY_VERSION, expiresAt: Date.now() + 300_000, rows };
  return ((await harness.call(db, "speed_trivia_quick_keep", { p_check: envelope, p_signature: runtime.sign(harness.SECRET, envelope) })) as { rows: { id: string; outcome: string }[] }).rows;
};
const reject = async (ids: string[], reason = "quality") =>
  (await scalar<{ rejected: string[] }>("select public.speed_trivia_quick_reject($1::uuid[], $2) r", [`{${ids.join(",")}}`, reason])).rejected;
const undo = (rowId: string) => scalar<{ status: string; view: string }>("select public.speed_trivia_quick_undo($1::uuid) r", [rowId]);
const settle = (rowId: string, hash: string, outcome: string, matched: string | null = null, note: string | null = null) =>
  scalar<{ id: string; outcome: string }>("select public.speed_trivia_queue_settle($1::uuid, $2, $3, $4::uuid, $5) r", [rowId, hash, outcome, matched, note]);
const status = (rowId: string) => scalar<string>("select status from trivia_questions where id=$1", [rowId]);
const mark = (rowId: string) => db.query<Record<string, unknown>>("select * from speed_trivia_review_marks where row_id=$1", [rowId]).then(r => r.rows[0] ?? null);
const released = () => harness.call(db, "speed_trivia_released_rows") as Promise<string[]>;
const releasedV2 = () => harness.call(db, "speed_trivia_released_rows_v2") as Promise<{ id: string; revision: number }[]>;
const speedRevision = (rowId: string) => scalar<number>("select speed_revision::int from trivia_questions where id=$1", [rowId]);
// A Phase 2 score for the row's current wording (written as the table owner; the scorer RPC is tested elsewhere).
const scoreAs = (rowId: string, score: number) => asAdmin(
  "insert into speed_trivia_review_marks(row_id, audience) select q.id, jsonb_build_object('key', public.speed_trivia_audience_key(q), 'score', $2::int) from trivia_questions q where q.id=$1",
  [rowId, score]);
const candidates = (minScore: number) => scalar<string[]>("select public.speed_trivia_precheck_candidates($1, 100) r", [minScore]);
const precheck = (rowId: string, hash: string, outcome: string, matched: string | null = null, note: string | null = null) =>
  scalar<{ id: string; outcome: string }>("select public.speed_trivia_precheck_settle($1::uuid, $2, $3, $4::uuid, $5) r", [rowId, hash, outcome, matched, note]);
const reserve = async (perRun: number, total: number) => {
  const r = await scalar<{ id: string | null; dollars: number; used: number }>("select public.speed_trivia_queue_reserve($1, $2) r", [perRun, total]);
  return { ...r, dollars: Number(r.dollars), used: Number(r.used) };
};

const seedOlder = async (rows: SpeedQuestion[], state = "pending_review") => {
  await db.exec("reset role; alter table trivia_questions disable trigger all;");
  for (const r of rows) {
    await db.query(
      "insert into trivia_questions(id,slug,question,options,correct_answer,category,status,normalized_question_key) values($1,$2,$3,$4::jsonb,0,$5,$6,$7)",
      [r.id, r.slug, r.question, JSON.stringify(r.options), r.category, state, core.exactKey(r.question)],
    );
  }
  await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
};
const admitRecent = async (r: SpeedQuestion) => harness.call(db, "admit_speed_trivia", harness.checked(r, await revision()));
// What the overnight job does for a unique keep: a signed approved-only admission.
const approveSigned = async (r: SpeedQuestion) => {
  const old = await find(r.id);
  const args = harness.checked({ ...r, status: "active" }, await revision(), old) as { p_evidence: Record<string, unknown> };
  args.p_evidence.comparisonScope = "approved";
  await harness.call(db, "admit_speed_trivia", args);
};
const prepare = (apply: boolean) => scalar<{ queued: number; stale: number; settled: number }>("select public.speed_trivia_queue_prepare($1) r", [apply]);
const snapshot = async (table: string) => JSON.stringify((await db.query(`select * from ${table} order by 1`)).rows);
const keepOne = async (r: SpeedQuestion) => (await keep([{ id: r.id, contentHash: core.contentHash(r) }]))[0].outcome;

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  await db.exec("set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("Speed Trivia overnight Keep queue SQL", () => {
  it("settles a unique keep only after a real signed approval", async () => {
    const r = harness.row(id(1), "Which planet is the Red Planet?", "Mars");
    await seedOlder([r]);
    expect(await keepOne(r)).toBe("queued");
    expect((await queue()).counts).toEqual({ queued: 1, needsLook: 0, repeats: 0 });
    // Claiming an approval that didn't happen is refused.
    await expect(settle(r.id, core.contentHash(r), "approved")).rejects.toThrow(/invalid-quick-review-request/);
    await approveSigned(r);
    expect(await settle(r.id, core.contentHash(r), "approved")).toEqual({ id: r.id, outcome: "approved" });
    expect(await status(r.id)).toBe("active");
    expect((await mark(r.id))?.outcome).toBe("approved");
    // Undo works on the overnight approval like on a Quick Review one.
    expect((await undo(r.id)).status).toBe("pending_review");
  });

  it("retires a repeat with its match (D8), shows it under Repeats and undoes it", async () => {
    const approved = harness.row(id(1), "Which ocean is the largest?", "Pacific", "Geography");
    const r = harness.row(id(2), "What is the biggest ocean on Earth?", "Pacific", "Geography");
    await seedOlder([approved], "active");
    await seedOlder([r]);
    await keepOne(r);
    await expect(settle(r.id, core.contentHash(r), "repeat", id(9))).rejects.toThrow(/invalid-quick-review-request/);
    await expect(settle(r.id, core.contentHash(r), "repeat")).rejects.toThrow(/invalid-quick-review-request/);
    expect((await settle(r.id, core.contentHash(r), "repeat", approved.id, "Same fact.")).outcome).toBe("repeat");
    expect(await status(r.id)).toBe("deleted");
    const repeats = await queue("repeats");
    expect(repeats.rows.map(row => [row.id, row.note, row.match?.id, row.match?.answer])).toEqual([[r.id, "Same fact.", approved.id, "Pacific"]]);
    expect(repeats.counts).toEqual({ queued: 0, needsLook: 0, repeats: 1 });
    expect((await queue()).total).toBe(0);
    // A repeat isn't released (D5): its fact stays blocked.
    expect(await released()).toEqual([]);
    expect((await undo(r.id)).status).toBe("pending_review");
    expect(await mark(r.id)).toBeNull();
    expect((await queue()).total).toBe(1);
  });

  it("leaves an uncertain or edited keep waiting under Needs a look; a stale settle is skipped", async () => {
    const r = harness.row(id(1), "Which metal is liquid at room temperature?", "Mercury");
    const s = harness.row(id(2), "Which gas do plants take in?", "Carbon dioxide");
    await seedOlder([r, s]);
    await keepOne(r);
    await keepOne(s);
    expect(await settle(r.id, "0".repeat(64), "needs_look")).toEqual({ id: r.id, outcome: "skipped" });
    expect((await settle(r.id, core.contentHash(r), "needs_look", null, "Accuracy unclear.")).outcome).toBe("needs_look");
    expect(await settle(r.id, core.contentHash(r), "needs_look")).toEqual({ id: r.id, outcome: "skipped" });
    const look = await queue("needs_look");
    expect(look.rows.map(row => [row.id, row.note])).toEqual([[r.id, "Accuracy unclear."]]);
    expect(look.counts).toEqual({ queued: 1, needsLook: 1, repeats: 0 });
    // Reject from Needs a look clears the note.
    await reject([r.id]);
    expect((await mark(r.id))?.note).toBeNull();
    expect(await status(s.id)).toBe("pending_review");
  });

  it("D5: lists quality rejects as released, never wrong-answer rejects", async () => {
    const a = harness.row(id(1), "Which bird is the national bird of the USA?", "Bald eagle", "Animals");
    const b = harness.row(id(2), "Which planet has the Great Red Spot?", "Jupiter");
    await seedOlder([a, b]);
    await reject([a.id], "quality");
    await reject([b.id], "wrong");
    expect(await released()).toEqual([a.id]);
    await undo(a.id);
    expect(await released()).toEqual([]);
  });

  it("3b: lists each released row with the revision it was released at; a re-reject moves or drops it", async () => {
    const a = harness.row(id(1), "Which bird is the national bird of the USA?", "Bald eagle", "Animals");
    const b = harness.row(id(2), "Which planet has the Great Red Spot?", "Jupiter");
    await seedOlder([a, b]);
    await reject([a.id, b.id], "quality");
    const r1 = await speedRevision(a.id);
    const listed = await releasedV2();
    expect(listed).toEqual([{ id: a.id, revision: r1 }, { id: b.id, revision: await speedRevision(b.id) }]);
    expect(listed.every(entry => typeof entry.revision === "number")).toBe(true);
    // Same rows as the old function.
    expect(listed.map(entry => entry.id)).toEqual(await released());
    // The reviewer's #4 case: restored, then rejected as wrong. It isn't released any more.
    await undo(a.id);
    await reject([a.id], "wrong");
    expect((await releasedV2()).map(entry => entry.id)).toEqual([b.id]);
    // Restored and rejected for quality again: listed at the new revision, not the old one.
    await undo(a.id);
    await reject([a.id], "quality");
    const again = (await releasedV2()).find(entry => entry.id === a.id);
    expect(again?.revision).toBe(await speedRevision(a.id));
    expect(again?.revision).toBeGreaterThan(r1);
  });

  it("D5: restoring a released row revokes the fast lane for it and for rows admitted meanwhile", async () => {
    const x = harness.row(id(1), "Which band recorded Abbey Road?", "The Beatles", "Music");
    const before = harness.row(id(2), "Who painted the Mona Lisa?", "Leonardo da Vinci", "History");
    const during = harness.row(id(3), "Which Beatles album has the zebra-crossing cover?", "Abbey Road", "Music");
    const after = harness.row(id(4), "Which city hosts the Louvre?", "Paris", "Geography");
    await admitRecent(x);
    await admitRecent(before);
    await reject([x.id], "quality");
    await admitRecent(during);
    expect((await undo(x.id)).status).toBe("pending_review");
    await admitRecent(after);
    expect(await scalar<number>("select count(*)::int from speed_trivia_released_restores")).toBe(1);
    const outcomes = Object.fromEntries((await keep([x, before, during, after].map(r => ({ id: r.id, contentHash: core.contentHash(r) }))))
      .map(row => [row.id, row.outcome]));
    expect(outcomes).toEqual({ [x.id]: "queued", [before.id]: "approved", [during.id]: "queued", [after.id]: "approved" });
  });

  it("D17: pre-checks older waiting rows best score first, retires repeats under Repeats, and Restore sticks", async () => {
    const approved = harness.row(id(1), "Which ocean is the largest?", "Pacific", "Geography");
    const repeat = harness.row(id(2), "What is the biggest ocean on Earth?", "Pacific", "Geography");
    const unique = harness.row(id(3), "Which planet is the Red Planet?", "Mars");
    const low = harness.row(id(4), "Which gas do plants take in?", "Carbon dioxide");
    const decided = harness.row(id(5), "Which metal is liquid at room temperature?", "Mercury");
    await seedOlder([approved], "active");
    await seedOlder([repeat, unique, low, decided]);
    await scoreAs(unique.id, 5);
    await scoreAs(repeat.id, 4);
    await scoreAs(low.id, 2);
    await scoreAs(decided.id, 5);
    await keepOne(decided);
    expect(await candidates(3)).toEqual([unique.id, repeat.id]);
    expect(await candidates(1)).toEqual([unique.id, repeat.id, low.id]);

    await expect(precheck(repeat.id, core.contentHash(repeat), "repeat")).rejects.toThrow(/invalid-quick-review-request/);
    expect(await precheck(repeat.id, "0".repeat(64), "unique")).toEqual({ id: repeat.id, outcome: "skipped" });
    expect(await precheck(decided.id, core.contentHash(decided), "unique")).toEqual({ id: decided.id, outcome: "skipped" });
    expect((await precheck(unique.id, core.contentHash(unique), "unique")).outcome).toBe("unique");
    expect((await precheck(repeat.id, core.contentHash(repeat), "repeat", approved.id, "Same fact.")).outcome).toBe("repeat");
    expect(await candidates(3)).toEqual([]);
    expect(await status(repeat.id)).toBe("deleted");
    expect((await status(unique.id))).toBe("pending_review");
    expect((await mark(unique.id))?.decision).toBeNull();

    const repeats = await queue("repeats");
    expect(repeats.rows.map(row => [row.id, row.match?.id])).toEqual([[repeat.id, approved.id]]);
    expect(repeats.counts).toEqual({ queued: 1, needsLook: 0, repeats: 1 });
    expect((await mark(repeat.id))?.decision).toBe("precheck");
    // A repeat stays blocked (not released, D5).
    expect(await released()).toEqual([]);

    // Restore: back to waiting with its score, and never pre-checked again in that wording.
    expect((await undo(repeat.id)).status).toBe("pending_review");
    const restored = await mark(repeat.id);
    expect(restored?.decision).toBeNull();
    expect((restored?.audience as { score: number }).score).toBe(4);
    expect((restored?.precheck as { outcome: string }).outcome).toBe("restored");
    expect(await candidates(1)).toEqual([low.id]);
    expect((await queue()).rows.map(row => row.id).sort()).toEqual([repeat.id, unique.id, low.id].sort());
  });

  it("D4: reserves run dollars inside the per-run and total caps; an unfinished run counts its reservation", async () => {
    const first = await reserve(5, 12);
    expect(first).toMatchObject({ dollars: 5, used: 0 });
    expect(await scalar<{ spent: number }>("select public.speed_trivia_queue_finish($1::uuid, 1.25, '{}'::jsonb) r", [first.id]))
      .toMatchObject({ spent: 1.25 });
    await expect(db.query("select public.speed_trivia_queue_finish($1::uuid, 1, null)", [first.id])).rejects.toThrow(/invalid-queue-budget/);
    const crashed = await reserve(5, 12);
    expect(crashed).toMatchObject({ dollars: 5, used: 1.25 });
    // 12 - 1.25 - 5 (unfinished) = 5.75 left; capped at 5 per run.
    expect(await reserve(5, 12)).toMatchObject({ dollars: 5, used: 6.25 });
    expect(await reserve(5, 12)).toMatchObject({ dollars: 0.75, used: 11.25 });
    expect(await reserve(5, 12)).toMatchObject({ id: null, dollars: 0, used: 12 });
    await expect(reserve(500, 12)).rejects.toThrow(/invalid-queue-budget/);
  });

  it("3a: prepare(false) only counts; prepare(true) settles approvals made elsewhere and clears stale Keeps", async () => {
    const waiting = harness.row(id(1), "Which planet is the Red Planet?", "Mars");
    const approvedHere = harness.row(id(2), "Which gas do plants take in?", "Carbon dioxide");
    const deleted = harness.row(id(3), "Which metal is liquid at room temperature?", "Mercury");
    const leftSpeed = harness.row(id(4), "Which ocean is the largest?", "Pacific", "Geography");
    const unadmitted = harness.row(id(5), "Which bird can fly backwards?", "Hummingbird", "Animals");
    const scored = harness.row(id(6), "Which planet has the Great Red Spot?", "Jupiter");
    await seedOlder([waiting, approvedHere, deleted, leftSpeed, unadmitted, scored]);
    await scoreAs(scored.id, 4);
    for (const r of [waiting, approvedHere, deleted, leftSpeed, unadmitted, scored]) expect(await keepOne(r)).toBe("queued");
    // Approved elsewhere with the same content (a real signed admission), but never recorded.
    await approveSigned(approvedHere);
    // Changed outside Quick Review: retired, moved to Live Trivia, approved without an admission.
    await asAdmin("alter table trivia_questions disable trigger all");
    await asAdmin("update trivia_questions set status='deleted' where id=any($1::uuid[])", [`{${deleted.id},${scored.id}}`]);
    await asAdmin("update trivia_questions set question_pool='live_showdown', answer_format='write_in' where id=$1", [leftSpeed.id]);
    await asAdmin("update trivia_questions set status='active' where id=$1", [unadmitted.id]);
    await asAdmin("alter table trivia_questions enable trigger all");

    const marksBefore = await snapshot("speed_trivia_review_marks");
    const questionsBefore = await snapshot("trivia_questions");
    expect(await prepare(false)).toEqual({ queued: 1, stale: 4, settled: 1 });
    expect(await snapshot("speed_trivia_review_marks")).toBe(marksBefore);

    expect(await prepare(true)).toEqual({ queued: 1, stale: 4, settled: 1 });
    // Never changes a question.
    expect(await snapshot("trivia_questions")).toBe(questionsBefore);
    expect((await mark(waiting.id))?.outcome).toBe("queued");
    const settledMark = await mark(approvedHere.id);
    expect(settledMark).toMatchObject({ decision: "keep", outcome: "approved", note: null });
    expect(settledMark?.checked_at).not.toBeNull();
    for (const r of [deleted, leftSpeed, unadmitted]) expect(await mark(r.id)).toBeNull();
    // A mark holding a score keeps it; only the decision is cleared.
    const kept = await mark(scored.id);
    expect(kept).toMatchObject({ decision: null, outcome: null, content_hash: null, decided_revision: null, decided_at: null });
    expect((kept?.audience as { score: number }).score).toBe(4);
    expect(await prepare(true)).toEqual({ queued: 1, stale: 0, settled: 0 });
    // The settled approval undoes like any other (decided_revision is the approval's).
    expect((await undo(approvedHere.id)).status).toBe("pending_review");
  });

  it("3a: prepare(true) doesn't settle an approval of different content", async () => {
    const r = harness.row(id(1), "Which planet is the Red Planet?", "Mars");
    await seedOlder([r]);
    await keepOne(r);
    // Edited, then approved elsewhere: the admission is for the new content, not the Keep's.
    const edited = { ...r, question: "Which planet is called the Red Planet?" };
    await harness.call(db, "admit_speed_trivia", harness.checked(edited, await revision(), await find(r.id)));
    await approveSigned(edited);
    expect(await status(r.id)).toBe("active");
    await expect(settle(r.id, core.contentHash(r), "approved")).rejects.toThrow(/invalid-quick-review-request/);
    expect(await prepare(true)).toEqual({ queued: 0, stale: 1, settled: 0 });
    expect(await mark(r.id)).toBeNull();
    expect(await status(r.id)).toBe("active");
  });

  // 3c (review #7): Undo returns a question to the view it came from.
  const toNeedsLook = async (r: SpeedQuestion, note: string) => {
    expect(await keepOne(r)).toBe("queued");
    expect((await settle(r.id, core.contentHash(r), "needs_look", null, note)).outcome).toBe("needs_look");
    return mark(r.id);
  };
  const lookFields = (m: Record<string, unknown> | null) => m && ({
    decision: m.decision, outcome: m.outcome, reason: m.reason, content_hash: m.content_hash,
    decided_revision: Number(m.decided_revision), decided_at: String(m.decided_at), note: m.note,
    checked_at: String(m.checked_at), matched_row_id: m.matched_row_id, prior: m.prior,
  });

  it("3c: Keep from Needs a look, then Undo, puts it back in Needs a look with its note and score", async () => {
    const r = harness.row(id(1), "Which metal is liquid at room temperature?", "Mercury");
    await seedOlder([r]);
    await scoreAs(r.id, 4);
    const before = await toNeedsLook(r, "Accuracy unclear.");
    expect(before?.prior).toBeNull();
    expect(await keepOne(r)).toBe("queued");
    const kept = await mark(r.id);
    expect(kept?.note).toBeNull();
    expect((kept?.prior as Record<string, unknown>).note).toBe("Accuracy unclear.");
    expect((await queue("needs_look")).total).toBe(0);

    expect(await undo(r.id)).toEqual({ id: r.id, status: "pending_review", view: "needs_look" });
    const after = await mark(r.id);
    expect(lookFields(after)).toEqual({ ...lookFields(before), prior: null });
    expect((after?.audience as { score: number }).score).toBe(4);
    const look = await queue("needs_look");
    expect(look.rows.map(row => [row.id, row.note])).toEqual([[r.id, "Accuracy unclear."]]);
    expect(look.counts).toEqual({ queued: 0, needsLook: 1, repeats: 0 });
    expect((await queue()).total).toBe(0);
  });

  it("3c: a fast-lane approval from Needs a look (edited meanwhile) undoes back to Needs a look", async () => {
    const r = harness.row(id(1), "Which metal is liquid at room temperature?", "Mercury");
    await seedOlder([r]);
    const before = await toNeedsLook(r, "Wording unclear.");
    // Edited in Question Review: full-bank admitted, so Keep approves at once.
    const edited = { ...r, question: "Which metal is a liquid at room temperature?" };
    await harness.call(db, "admit_speed_trivia", harness.checked(edited, await revision(), await find(r.id)));
    expect(await keepOne(edited)).toBe("approved");
    expect(await status(r.id)).toBe("active");
    expect(await undo(r.id)).toEqual({ id: r.id, status: "pending_review", view: "needs_look" });
    expect(lookFields(await mark(r.id))).toEqual({ ...lookFields(before), prior: null });
  });

  it("3c: Reject from Needs a look, then Undo, restores it there; the D5 window is still recorded", async () => {
    const a = harness.row(id(1), "Which metal is liquid at room temperature?", "Mercury");
    const b = harness.row(id(2), "Which gas do plants take in?", "Carbon dioxide");
    await seedOlder([a, b]);
    const beforeA = await toNeedsLook(a, "Accuracy unclear.");
    const beforeB = await toNeedsLook(b, "Two answers fit.");
    await reject([a.id], "quality");
    await reject([b.id], "wrong");
    expect((await mark(a.id))?.note).toBeNull();
    expect((await releasedV2()).map(entry => entry.id)).toEqual([a.id]);
    const releasedAt = await speedRevision(a.id);

    expect(await undo(a.id)).toEqual({ id: a.id, status: "pending_review", view: "needs_look" });
    expect(await undo(b.id)).toEqual({ id: b.id, status: "pending_review", view: "needs_look" });
    expect(lookFields(await mark(a.id))).toEqual({ ...lookFields(beforeA), prior: null });
    expect(lookFields(await mark(b.id))).toEqual({ ...lookFields(beforeB), prior: null });
    expect((await db.query("select row_id, released_revision::int from speed_trivia_released_restores")).rows)
      .toEqual([{ row_id: a.id, released_revision: releasedAt }]);
    expect(await releasedV2()).toEqual([]);
    // The restored row still loses the fast lane (D5), and can be decided again from Needs a look.
    expect(await keepOne(a)).toBe("queued");
  });

  it("3c: Undo from Waiting is unchanged, and settle, pre-check and quick writes leave prior null", async () => {
    const approved = harness.row(id(1), "Which ocean is the largest?", "Pacific", "Geography");
    const k = harness.row(id(2), "Which planet is the Red Planet?", "Mars");
    const j = harness.row(id(3), "Which gas do plants take in?", "Carbon dioxide");
    const p = harness.row(id(4), "What is the biggest ocean on Earth?", "Pacific", "Geography");
    const u = harness.row(id(5), "Which bird is the national bird of the USA?", "Bald eagle", "Animals");
    await seedOlder([approved], "active");
    await seedOlder([k, j, p, u]);
    await scoreAs(u.id, 4);
    await scoreAs(p.id, 4);
    expect(await keepOne(k)).toBe("queued");
    await reject([j.id], "wrong");
    expect((await precheck(u.id, core.contentHash(u), "unique")).outcome).toBe("unique");
    expect((await precheck(p.id, core.contentHash(p), "repeat", approved.id, "Same fact.")).outcome).toBe("repeat");
    const priors = async () => (await db.query<{ prior: unknown }>("select prior from speed_trivia_review_marks")).rows.map(r => r.prior);
    expect(await priors()).toEqual([null, null, null, null]);
    expect(await undo(k.id)).toEqual({ id: k.id, status: "pending_review", view: "waiting" });
    expect(await undo(j.id)).toEqual({ id: j.id, status: "pending_review", view: "waiting" });
    expect(await undo(p.id)).toEqual({ id: p.id, status: "pending_review", view: "waiting" });
    expect(await mark(k.id)).toBeNull();
    expect(await mark(j.id)).toBeNull();
    expect(await priors()).toEqual([null, null]);

    // Settled overnight from a needs-look Keep: the result is the latest word, so Restore goes to Waiting.
    await toNeedsLook(k, "Accuracy unclear.");
    await keepOne(k);
    expect((await settle(k.id, core.contentHash(k), "repeat", approved.id, "Same fact.")).outcome).toBe("repeat");
    expect((await mark(k.id))?.prior).toBeNull();
    expect(await undo(k.id)).toEqual({ id: k.id, status: "pending_review", view: "waiting" });
    expect(await mark(k.id)).toBeNull();
    // Settled back to Needs a look: the new note replaces the old one, prior cleared.
    await toNeedsLook(k, "First note.");
    await keepOne(k);
    expect((await settle(k.id, core.contentHash(k), "needs_look", null, "Second note.")).outcome).toBe("needs_look");
    expect(await mark(k.id)).toMatchObject({ note: "Second note.", prior: null });
    // A stale queued Keep cleared by prepare(true) loses its prior too.
    await keepOne(k);
    await asAdmin("alter table trivia_questions disable trigger all");
    await asAdmin("update trivia_questions set status='deleted' where id=$1", [k.id]);
    await asAdmin("alter table trivia_questions enable trigger all");
    expect((await prepare(true)).stale).toBe(1);
    expect(await mark(k.id)).toBeNull();
  });

  it("3c: prior can't be set outside the trigger's rules, and the trigger function isn't callable", async () => {
    const r = harness.row(id(1), "Which planet is the Red Planet?", "Mars");
    await seedOlder([r]);
    await toNeedsLook(r, "Accuracy unclear.");
    // Even the table owner: on a needs-look mark the trigger drops it; on a decided mark it must be a full prior.
    await asAdmin("update speed_trivia_review_marks set prior='{\"note\":\"x\"}'::jsonb where row_id=$1", [r.id]);
    expect((await mark(r.id))?.prior).toBeNull();
    await reject([r.id], "wrong");
    await expect(asAdmin("update speed_trivia_review_marks set prior='{\"note\":\"x\"}'::jsonb where row_id=$1", [r.id]))
      .rejects.toThrow(/speed_trivia_review_marks_prior/);
    await db.exec("set role anon;");
    await expect(db.query("select public.speed_trivia_review_marks_prior()")).rejects.toThrow(/permission denied/);
    await db.exec("set role service_role;");
    await expect(db.query("update speed_trivia_review_marks set prior=null")).rejects.toThrow(/permission denied/);
  });

  it("keeps the new tables and RPCs server-only", async () => {
    await db.exec("set role anon;");
    await expect(db.query("select * from speed_trivia_released_restores")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_released_rows()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_released_rows_v2()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_queue_settle(gen_random_uuid(), 'x', 'needs_look', null, null)")).rejects.toThrow(/permission denied/);
    await db.exec("set role service_role;");
    await expect(asAdmin("select 1")).resolves.toBeUndefined();
    await expect(db.query("insert into speed_trivia_released_restores values (gen_random_uuid(), 1, 2)")).rejects.toThrow(/permission denied/);
    await expect(db.query("update speed_trivia_review_marks set outcome='approved'")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into speed_trivia_queue_runs(reserved_dollars) values (1)")).rejects.toThrow(/permission denied/);
    await db.exec("set role anon;");
    await expect(db.query("select * from speed_trivia_queue_runs")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_queue_reserve(1, 1)")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_precheck_candidates(3, 10)")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_precheck_settle(gen_random_uuid(), 'x', 'unique', null, null)")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_queue_prepare(false)")).rejects.toThrow(/permission denied/);
    await db.exec("set role authenticated;");
    await expect(db.query("select public.speed_trivia_queue_prepare(true)")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.speed_trivia_released_rows_v2()")).rejects.toThrow(/permission denied/);
    await db.exec("set role service_role;");
    await expect(db.query("select public.speed_trivia_queue_prepare(null)")).rejects.toThrow(/invalid-quick-review-request/);
  });
});
