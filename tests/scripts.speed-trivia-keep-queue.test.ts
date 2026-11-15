import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { AdmissionClient, AdmissionSession } from "@/types/speedTriviaAdmission";
import type { ComparisonResult, ComparisonTask, SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Phase 3 overnight Keep queue on isolated PostgreSQL (PGlite) with a fixture judge. No network, no Supabase.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as {
  setup: (db: PGlite) => Promise<void>;
  call: (db: PGlite, name: string, args?: Record<string, unknown>) => Promise<unknown>;
  clientFor: (db: PGlite) => AdmissionClient;
  row: (id: string, q: string, answer: string, category?: string) => SpeedQuestion;
  SECRET: string;
};
type Mark = { row_id: string; content_hash: string };
type Report = { examined: number; approved: number; repeat: number; needsLook: number; skipped: number; stopped: string | null };
type Call = { cached: boolean; first: boolean; ms: number; dollars: number; decision: string; qualityA: string };
type Side = { ms: number; dollars: number; calls: number; decision: string };
type PrecheckReport = { examined: number; repeat: number; unique: number; uncertain: number; skipped: number; stopped: string | null };
type Reader = (client: AdmissionClient, ids: string[]) => Promise<Map<string, Record<string, unknown>>>;
const queue = require("../scripts/process-speed-trivia-keep-queue.cjs") as {
  processQueue: (args: { client: AdmissionClient; session: AdmissionSession; marks: Mark[]; rows: Map<string, Record<string, unknown>> }) => Promise<Report>;
  simulate: (calls: Call[], concurrency: number) => { old: Side; new: Side };
  precheckPass: (args: { client: AdmissionClient; session: AdmissionSession; ids: string[]; read: Reader }) => Promise<PrecheckReport>;
  runPaid: (args: { client: AdmissionClient; queued: number; candidates: string[]; perRun: number; total: number; minutes: number; limit: number;
    createSession: (options: { client: AdmissionClient; budget: unknown }) => Promise<AdmissionSession>; read: Reader }) => Promise<Record<string, unknown> & { precheck: PrecheckReport | null }>;
  parseArgs: (argv: string[]) => Record<string, unknown>;
};
const MIGRATIONS = [
  "supabase/migrations/20261115151703_speed_trivia_quick_review.sql",
  "supabase/migrations/20261115153905_speed_trivia_bar_test_scores.sql",
  "supabase/migrations/20261115170333_speed_trivia_keep_queue.sql",
];
const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sound = (task: ComparisonTask): ComparisonResult => ({ id: task.id, decision: "unique", explanation: "Different facts", fact: "Fixture", qualityA: "sound", qualityB: "sound", confidence: "high" });

let db: PGlite;
let client: AdmissionClient;
const seed = async (rows: SpeedQuestion[], state: string) => {
  await db.exec("reset role; alter table trivia_questions disable trigger all;");
  for (const r of rows) {
    await db.query("insert into trivia_questions(id,slug,question,options,correct_answer,category,status,normalized_question_key) values($1,$2,$3,$4::jsonb,0,$5,$6,$7)",
      [r.id, r.slug, r.question, JSON.stringify(r.options), r.category, state, core.exactKey(r.question)]);
  }
  await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
};
const keep = async (rows: SpeedQuestion[]) => {
  const envelope = { operation: "quick_keep", policyVersion: core.POLICY_VERSION, expiresAt: Date.now() + 300_000, rows: rows.map(r => ({ id: r.id, contentHash: core.contentHash(r) })) };
  await harness.call(db, "speed_trivia_quick_keep", { p_check: envelope, p_signature: runtime.sign(harness.SECRET, envelope) });
};
const marksFor = (rows: SpeedQuestion[]): Mark[] => rows.map(r => ({ row_id: r.id, content_hash: core.contentHash(r) }));
// JSON rows, as the script reads them from Supabase (the admission compares the exact old state).
const current = async (ids: string[]) => {
  const rows = new Map<string, Record<string, unknown>>();
  for (const rowId of ids) rows.set(rowId, ((await harness.call(db, "speed_trivia_find", { p_identifier: rowId })) as Record<string, unknown>[])[0]);
  return rows;
};
const outcome = async (rowId: string) => (await db.query<{ outcome: string; matched_row_id: string | null; note: string | null }>("select outcome, matched_row_id, note from speed_trivia_review_marks where row_id=$1", [rowId])).rows[0];
const status = async (rowId: string) => (await db.query<{ status: string }>("select status from trivia_questions where id=$1", [rowId])).rows[0].status;
const read: Reader = (_client, ids) => current(ids);
const scoreAs = async (rowId: string, score: number) => {
  await db.exec("reset role;");
  await db.query("insert into speed_trivia_review_marks(row_id, audience) select q.id, jsonb_build_object('key', public.speed_trivia_audience_key(q), 'score', $2::int) from trivia_questions q where q.id=$1", [rowId, score]);
  await db.exec("set role service_role;");
};
const precheckOf = async (rowId: string) => (await db.query<{ decision: string | null; precheck: { outcome: string; note?: string } | null }>("select decision, precheck from speed_trivia_review_marks where row_id=$1", [rowId])).rows[0];
const sessionWith = (adjudicate: (tasks: ComparisonTask[]) => Promise<ComparisonResult[]>) =>
  runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "queue-fixture", adjudicate } });

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  await db.exec("set role service_role;");
  client = harness.clientFor(db);
});
afterEach(async () => { await db.close(); });

describe("Speed Trivia overnight Keep queue", () => {
  it("approves unique keeps, retires repeats with their match and leaves uncertain ones for a look", async () => {
    const approved = harness.row(id(1), "Which ocean is the largest?", "Pacific", "Geography");
    const unique = harness.row(id(2), "Which planet is the Red Planet?", "Mars");
    const repeat = harness.row(id(3), "What is the biggest ocean on Earth?", "Pacific", "Geography");
    const unsure = harness.row(id(4), "Which metal is liquid at room temperature?", "Mercury");
    await seed([approved], "active");
    await seed([unique, repeat, unsure], "pending_review");
    await keep([unique, repeat, unsure]);
    const session = await sessionWith(async tasks => tasks.map(t =>
      t.a.question === repeat.question && t.b.question === approved.question ? { ...sound(t), decision: "duplicate" as const, explanation: "Same fact." }
        : t.a.question === unsure.question ? { ...sound(t), decision: "uncertain" as const, qualityA: "uncertain" as const, explanation: "Accuracy unclear." }
          : sound(t)));
    const rows = [unique, repeat, unsure];
    const report = await queue.processQueue({ client, session, marks: marksFor(rows), rows: await current(rows.map(r => r.id)) });
    expect(report).toMatchObject({ examined: 3, approved: 1, repeat: 1, needsLook: 1, skipped: 0, stopped: null });
    expect(await status(unique.id)).toBe("active");
    expect((await outcome(unique.id)).outcome).toBe("approved");
    expect(await status(repeat.id)).toBe("deleted");
    expect(await outcome(repeat.id)).toMatchObject({ outcome: "repeat", matched_row_id: approved.id });
    expect(await status(unsure.id)).toBe("pending_review");
    expect((await outcome(unsure.id)).outcome).toBe("needs_look");
    expect((await outcome(unsure.id)).note).toMatch(/could not be verified/);
  });

  it("sends a question edited after Keep to Needs a look without a paid check", async () => {
    const r = harness.row(id(1), "Which gas do plants take in?", "Carbon dioxide");
    await seed([r], "pending_review");
    await keep([r]);
    let calls = 0;
    const session = await sessionWith(async tasks => { calls++; return tasks.map(sound); });
    const fetched = await current([r.id]);
    fetched.set(r.id, { ...fetched.get(r.id)!, question: "Which gas do plants absorb?" });
    const report = await queue.processQueue({ client, session, marks: marksFor([r]), rows: fetched });
    expect(report).toMatchObject({ examined: 0, needsLook: 1 });
    expect(calls).toBe(0);
    expect((await outcome(r.id)).note).toMatch(/Edited after Keep/);
  });

  it("records an approval left unrecorded by a previous run", async () => {
    const r = harness.row(id(1), "Which planet has rings made mostly of ice?", "Saturn");
    await seed([r], "pending_review");
    await keep([r]);
    const session = await sessionWith(async tasks => tasks.map(sound));
    await session.write({ status: "active" }, { existing: (await current([r.id])).get(r.id) as never, approvedOnly: true });
    expect((await outcome(r.id)).outcome).toBe("queued");
    const report = await queue.processQueue({ client, session, marks: marksFor([r]), rows: await current([r.id]) });
    expect(report).toMatchObject({ examined: 0, approved: 1 });
    expect((await outcome(r.id)).outcome).toBe("approved");
  });

  it("stops cleanly at the budget and leaves the rest queued", async () => {
    const a = harness.row(id(1), "Which bird can fly backwards?", "Hummingbird", "Animals");
    const b = harness.row(id(2), "Which animal is the largest mammal?", "Blue whale", "Animals");
    await seed([a, b], "pending_review");
    await keep([a, b]);
    const session = await sessionWith(async () => { throw new Error("Run dollars budget exhausted."); });
    const report = await queue.processQueue({ client, session, marks: marksFor([a, b]), rows: await current([a.id, b.id]) });
    expect(report).toMatchObject({ examined: 0, approved: 0, stopped: "budget" });
    expect((await outcome(a.id)).outcome).toBe("queued");
    expect((await outcome(b.id)).outcome).toBe("queued");
  });

  it("D17: pre-checks without approving: retires repeats, notes unique and uncertain ones", async () => {
    const approved = harness.row(id(1), "Which ocean is the largest?", "Pacific", "Geography");
    const unique = harness.row(id(2), "Which planet is the Red Planet?", "Mars");
    const repeat = harness.row(id(3), "What is the biggest ocean on Earth?", "Pacific", "Geography");
    const unsure = harness.row(id(4), "Which metal is liquid at room temperature?", "Mercury");
    await seed([approved], "active");
    await seed([unique, repeat, unsure], "pending_review");
    for (const r of [unique, repeat, unsure]) await scoreAs(r.id, 5);
    const session = await sessionWith(async tasks => tasks.map(t =>
      t.a.question === repeat.question && t.b.question === approved.question ? { ...sound(t), decision: "duplicate" as const, explanation: "Same fact." }
        : t.a.question === unsure.question ? { ...sound(t), decision: "uncertain" as const, qualityA: "uncertain" as const, explanation: "Accuracy unclear." }
          : sound(t)));
    const report = await queue.precheckPass({ client, session, ids: [unique.id, repeat.id, unsure.id], read });
    expect(report).toMatchObject({ examined: 3, repeat: 1, unique: 1, uncertain: 1, skipped: 0, stopped: null });
    // Nothing approved.
    expect(await status(unique.id)).toBe("pending_review");
    expect(await precheckOf(unique.id)).toMatchObject({ decision: null, precheck: { outcome: "unique" } });
    expect(await status(repeat.id)).toBe("deleted");
    expect(await outcome(repeat.id)).toMatchObject({ outcome: "repeat", matched_row_id: approved.id });
    expect((await precheckOf(repeat.id)).decision).toBe("precheck");
    expect(await status(unsure.id)).toBe("pending_review");
    expect((await precheckOf(unsure.id)).precheck).toMatchObject({ outcome: "uncertain", note: expect.stringMatching(/could not be verified/) });
  });

  it("D4: a paid run reserves dollars, records what it spent, and stops once the total is used", async () => {
    const r = harness.row(id(1), "Which planet is the Red Planet?", "Mars");
    await seed([r], "pending_review");
    await scoreAs(r.id, 5);
    const createSession = ({ budget }: { budget: unknown }) => runtime.createSession({ client, secret: harness.SECRET, budget: budget as never,
      judge: { modelVersion: "queue-fixture", adjudicate: async tasks => tasks.map(sound) } });
    const run = (total: number) => queue.runPaid({ client, queued: 0, candidates: [r.id], perRun: 2, total, minutes: 1, limit: 10, createSession, read });
    const first = await run(3);
    expect(first.precheck).toMatchObject({ unique: 1, stopped: null });
    expect(first.dollars).toMatchObject({ reserved: 2, usedBefore: 0, total: 3 });
    const runs = (await db.query<{ reserved_dollars: string; spent_dollars: string | null }>("select reserved_dollars, spent_dollars from speed_trivia_queue_runs")).rows;
    expect(runs).toHaveLength(1);
    expect(runs[0].spent_dollars).not.toBeNull();
    // The fixture judge is free, so nothing was spent; a 0-dollar total leaves nothing.
    expect((await run(0.005)).note).toMatch(/Total budget used/);
  });

  it("simulates old and new schedules from the same verdicts", () => {
    const unique = (ms: number, first = false): Call => ({ cached: false, first, ms, dollars: 0.001, decision: "unique", qualityA: "sound" });
    const all = [unique(100), unique(100), unique(100), unique(100), unique(100), unique(100)];
    const same = queue.simulate(all, 3);
    expect(same.old).toEqual({ ms: 600, dollars: 0.006, calls: 6, decision: "unique" });
    // Two probe pairs alone (200 ms), then four on three workers (200 ms).
    expect(same.new).toMatchObject({ ms: 400, calls: 6, decision: "unique" });
    // A repeat found by a same-answer competitor last in retrieval order: the old checker pays for every pair first.
    const repeat = [unique(100), unique(100), unique(100), unique(100), { ...unique(100, true), decision: "duplicate" }];
    const r = queue.simulate(repeat, 2);
    expect(r.old).toMatchObject({ calls: 5, decision: "duplicate" });
    expect(r.new.decision).toBe("duplicate");
    expect(r.new.calls).toBe(1);
  });

  it("refuses an unbounded or unapproved paid run", () => {
    expect(() => queue.parseArgs(["--measure", "50"])).toThrow(/max-dollars/);
    expect(() => queue.parseArgs(["--apply", "--max-dollars", "500"])).toThrow(/max-dollars/);
    expect(queue.parseArgs([])).toMatchObject({ mode: "count" });
    expect(queue.parseArgs(["--precheck"])).toMatchObject({ mode: "apply", precheck: true, minScore: 3 });
    expect(() => queue.parseArgs(["--apply", "--total-dollars", "5000"])).toThrow(/total-dollars/);
    expect(() => queue.parseArgs(["--precheck", "--min-score", "9"])).toThrow(/min-score/);
  });
});
