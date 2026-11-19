import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { AdmissionSession, AdmissionClient, AdmissionRow } from "@/types/speedTriviaAdmission";
import type { ComparisonTask, ComparisonResult, SpeedQuestion } from "@/types/speedTriviaUniqueness";

type DB = { exec: (sql: string) => Promise<unknown>; query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> };
const { PGlite } = require("@electric-sql/pglite") as { PGlite: new () => DB };
const harness = require(path.resolve("scripts/test-speed-trivia-admission-sql.cjs")) as {
  setup: (db: DB, extraRows?: number) => Promise<void>; clientFor: (db: DB) => AdmissionClient; SECRET: string;
  row: (id: string, question: string, answer: string, category?: string) => SpeedQuestion;
};
const generation = require(path.resolve("lib/speed-trivia-uniqueness/generation.cjs")) as {
  planTopics: (corpus: unknown) => { category: string; topics: { topic: string; count: number }[] }[];
  generateOnce: (args: Record<string, unknown>) => Promise<unknown[]>;
  runGeneration: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};
const cleanup = require(path.resolve("scripts/manage-speed-trivia-retirement.cjs")) as {
  validateManifest: (manifest: unknown) => unknown;
  readManifest: (file: string, expected: string) => unknown;
};
const sound = (task: ComparisonTask): ComparisonResult => ({ id: task.id, decision: "unique", explanation: "Different fixture facts", fact: "Fixture fact", qualityA: "sound", qualityB: "sound", confidence: "high" });
const judge = { modelVersion: "isolated-fixture", adjudicate: async (tasks: ComparisonTask[]) => tasks.map(sound) };
let db: DB, client: AdmissionClient;
let session: AdmissionSession;
const calls: string[] = [];
const candidate = (n: number, question: string, answer: string, category = "Science") => harness.row(`20000000-0000-4000-8000-${String(n).padStart(12, "0")}`, question, answer, category);

describe("Speed writing boundaries on isolated PostgreSQL", () => {
  beforeAll(async () => {
    db = new PGlite(); await harness.setup(db);
    const underlying = harness.clientFor(db);
    client = { rpc: (name, args) => { calls.push(name); return underlying.rpc(name, args); } };
    session = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge });
  });
  afterAll(async () => { await db.close(); });
  it("fails closed without credentials/configuration", async () => {
    await expect(runtime.createSession({ client, secret: "" })).rejects.toThrow("not configured");
    expect(() => runtime.createBudget({ dollars: 0 })).toThrow("approved");
    const missing: AdmissionClient = { rpc: async () => ({ data: null, error: { message: "missing function" } }) };
    await expect(runtime.createSession({ client: missing, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge })).rejects.toThrow("verification failed");
  });
  it("compares deleted history across categories and never resurrects by slug", async () => {
    await expect(session.write(candidate(1, "Which country launched Sputnik 1?", "USSR", "Science"))).rejects.toMatchObject({ code: "duplicate" });
    await expect(session.write({ slug: "retired", question: "Which country launched Sputnik 1?", options: ["Soviet Union", "France", "Japan", "UK"], correct_answer: 0, category: "History", question_pool: "anytime_blitz", answer_format: "multiple_choice", status: "active" })).rejects.toMatchObject({ code: "retired" });
  });
  it("starts pending, shares facts across categories and does idempotent unchanged reimports", async () => {
    const input = candidate(2, "What flower structure makes pollen?", "Anther");
    const saved = await session.write({ ...input, status: "active" });
    expect(saved.row.status).toBe("pending_review");
    await expect(session.write(candidate(3, input.question, "Anther", "General Knowledge"))).rejects.toMatchObject({ code: "duplicate" });
    const writes = calls.filter(n => n === "admit_speed_trivia").length;
    expect((await session.write(saved.row, { importMode: true })).idempotent).toBe(true);
    expect(calls.filter(n => n === "admit_speed_trivia").length).toBe(writes);
    expect(calls.filter(n => n === "speed_trivia_corpus_page")).toHaveLength(1);
  });
  it("checks edits excluding the own current row, then preserves the old fact", async () => {
    const old = session.corpus().rows.find(r => r.id === candidate(2, "unused", "unused").id)!;
    const changed = await session.write({ question: "Which flower structure receives pollen?", options: ["Stigma", "X", "Y", "Z"] }, { existing: old as AdmissionRow });
    expect(changed.row.options[0]).toBe("Stigma");
    expect(session.corpus().rows.some(r => r.id.startsWith("history:") && r.options[0] === "Anther")).toBe(true);
    await expect(session.write(candidate(4, "What flower structure makes pollen?", "Anther"))).rejects.toMatchObject({ code: "duplicate" });
  });
  it("rechecks bounded deltas after a stale admission and limits retries globally", async () => {
    let failed = false;
    const underlying = harness.clientFor(db);
    const racing: AdmissionClient = { rpc: async (name, args) => {
      if (name === "admit_speed_trivia" && !failed) {
        failed = true; await db.exec("update trivia_questions set status='deleted' where slug='gobi'");
        return { data: null, error: { message: "stale-speed-revision" } };
      }
      return underlying.rpc(name, args);
    } };
    const budget = runtime.createBudget({ dollars: 1, retries: 1 });
    const racer = await runtime.createSession({ client: racing, secret: harness.SECRET, budget, judge });
    const saved = await racer.write(candidate(5, "Which force keeps planets in orbit?", "Gravity"));
    expect(saved.row.status).toBe("pending_review");
    expect(budget.summary().retries).toBe(1);
  });
  it("catches semantic paraphrases/reversals and allows different same-artist facts", async () => {
    const reserved = candidate(6, "Which artist released the album 1989?", "Taylor Swift", "Music");
    await session.write(reserved);
    const checking = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: {
      modelVersion: "isolated-fact-fixture", adjudicate: async tasks => tasks.map(task => task.a.question.includes("1989") && task.b.question.includes("1989")
        ? { ...sound(task), decision: "duplicate", explanation: "Same artist and album association" }
        : sound(task)),
    } });
    await expect(checking.write(candidate(7, "1989 is an album by which performer?", "Taylor Swift", "Pop Culture"))).rejects.toMatchObject({ code: "duplicate" });
    expect((await checking.write(candidate(8, "Which performer began the Eras Tour in 2023?", "Taylor Swift", "Music"))).row.status).toBe("pending_review");
  });
  it("stops at the first rejecting semantic result without fabricating uniqueness", async () => {
    const adjudicate = vi.fn(async (tasks: ComparisonTask[]) => tasks.map(t => ({ ...sound(t), decision: "duplicate" as const })));
    const checking = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "early-reject-fixture", adjudicate }, concurrency: 1 });
    await expect(checking.write(candidate(9, "Which new fact is being tested?", "New fixture"))).rejects.toMatchObject({ code: "duplicate" });
    expect(adjudicate).toHaveBeenCalledTimes(1);
  });
  it("checks every pair of a Current Events fact the judge can't confirm, and admits it; other categories stop (2026-11-19)", async () => {
    const unsure = () => vi.fn(async (tasks: ComparisonTask[]) => tasks.map(t => ({ ...sound(t), qualityA: "uncertain" as const })));
    const session = async (adjudicate: ReturnType<typeof unsure>) => runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "recent-fact-fixture", adjudicate }, concurrency: 1 });
    const regular = unsure();
    await expect((await session(regular)).write(candidate(30, "Which performer headlined a 2026 stadium show?", "Taylor Swift", "Music"))).rejects.toMatchObject({ code: "uncertain" });
    expect(regular).toHaveBeenCalledTimes(1);
    const news = unsure();
    const saved = await (await session(news)).write(candidate(31, "In November 2026, which performer announced a new album?", "Taylor Swift", "Current Events"));
    expect(saved.row.status).toBe("pending_review");
    expect(news.mock.calls.length).toBeGreaterThan(1);
  });
  it("runs pairs concurrently, same answer first, and starts none after a rejecting result", async () => {
    const started: string[] = [];
    let inFlight = 0, peak = 0;
    const adjudicate = vi.fn(async (tasks: ComparisonTask[]) => {
      started.push(tasks[0].b.question); inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return tasks.map(t => core.answerKey(t.b.options[t.b.correct_answer]) === core.answerKey("Mars") ? { ...sound(t), decision: "duplicate" as const } : sound(t));
    });
    const earlier = candidate(30, "Which planet is called the Red Planet?", "Mars");
    await session.write(earlier);
    const checking = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "concurrent-fixture", adjudicate }, concurrency: 3 });
    const competitors = checking.index().corpus.rows.length;
    const failure = await checking.write(candidate(31, "Which planet do the rovers Spirit and Opportunity explore?", "Mars")).catch(error => error);
    expect(failure).toMatchObject({ code: "duplicate" });
    // The same-answer competitor is compared first; at most the other in-flight pairs finish after it.
    expect(started[0]).toBe(earlier.question);
    // The repeat is the first (probe) pair, so nothing else starts.
    expect(adjudicate.mock.calls.length).toBe(1);
    expect(adjudicate.mock.calls.length).toBeLessThan(competitors);
    expect(peak).toBeLessThanOrEqual(3);
    const held = failure.evidence.comparisons.filter((r: ComparisonResult) => r.explanation.startsWith("Not examined"));
    expect(held.length).toBe(failure.evidence.comparisons.length - adjudicate.mock.calls.length);
  });
  it("fans out after the probe pairs for a question that has to be compared with every competitor", async () => {
    let inFlight = 0, peak = 0;
    const order: number[] = [];
    const adjudicate = vi.fn(async (tasks: ComparisonTask[]) => {
      inFlight++; peak = Math.max(peak, inFlight); order.push(inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return tasks.map(sound);
    });
    const checking = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "fan-out-fixture", adjudicate }, concurrency: 3 });
    const competitors = checking.index().corpus.rows.length;
    expect((await checking.write(candidate(34, "Which fixture fact needs every comparison?", "Fan-out fixture"))).row.status).toBe("pending_review");
    expect(adjudicate.mock.calls.length).toBe(competitors);
    expect(order.slice(0, runtime.PROBE)).toEqual(Array(runtime.PROBE).fill(1));
    expect(peak).toBe(3);
  });
  it("D5: full-bank checks skip quality rejects only when asked to, and only while they stay retired", async () => {
    const released = candidate(32, "Which gas makes up most of Earth's air?", "Nitrogen");
    const sameFact = candidate(33, "What gas makes up most of the air on Earth?", "Nitrogen");
    const adjudicate = async (tasks: ComparisonTask[]) => tasks.map(t => t.b.question === released.question ? { ...sound(t), decision: "duplicate" as const } : sound(t));
    const writer = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "released-fixture", adjudicate } });
    await writer.write(released);
    // Retire it (status-only, as Quick Review's Reject does).
    await db.exec("reset role;");
    await db.query("update trivia_questions set status='deleted' where id=$1", [released.id]);
    await db.exec("set role service_role;");
    await db.exec("reset role;");
    const releasedAt = (await db.query("select speed_revision::int r from trivia_questions where id=$1", [released.id])).rows[0].r;
    await db.exec("set role service_role;");
    const releasing = { rpc: (name: string, args?: Record<string, unknown>) => name === "speed_trivia_released_rows_v2" ? Promise.resolve({ data: [{ id: released.id, revision: releasedAt }], error: null }) : client.rpc(name, args) } as AdmissionClient;
    const conservative = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "released-fixture", adjudicate } });
    await expect(conservative.write(sameFact)).rejects.toMatchObject({ code: "duplicate" });
    // The same id at another revision isn't skipped.
    const staleRevision = { rpc: (name: string, args?: Record<string, unknown>) => name === "speed_trivia_released_rows_v2" ? Promise.resolve({ data: [{ id: released.id, revision: Number(releasedAt) - 1 }], error: null }) : client.rpc(name, args) } as AdmissionClient;
    const stale = await runtime.createSession({ client: staleRevision, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "released-fixture", adjudicate }, releasedRows: "read" });
    await expect(stale.write(sameFact)).rejects.toMatchObject({ code: "duplicate" });
    const d5 = await runtime.createSession({ client: releasing, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "released-fixture", adjudicate }, releasedRows: "read" });
    expect((await d5.write(sameFact)).row.status).toBe("pending_review");
  });
  it("allows a wording edit and later approval without treating its old wording as a second question", async () => {
    const source = candidate(10, "Which chemical element has the symbol Fe?", "Iron");
    const saved = await session.write(source);
    const editing = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: {
      modelVersion: "own-wording-fixture", adjudicate: async tasks => tasks.map(t => t.id === "previous-version" ? { ...sound(t), decision: "duplicate", explanation: "Same element symbol, cleaner wording" } : sound(t)),
    } });
    const changed = await editing.write({ question: "Fe is the symbol for which element?" }, { existing: saved.row });
    expect(editing.corpus().rows.some(r => r.id.startsWith(`history:${saved.row.id}`))).toBe(false);
    expect((await editing.write({ status: "active" }, { existing: changed.row })).row.status).toBe("active");
  });
  it("pages all 1,203 actual SQL rows and fails closed when more than 500 changes arrive", async () => {
    const large = new PGlite(); await harness.setup(large, 1201);
    try {
      const base = harness.clientFor(large), pages: number[] = [];
      const reader: AdmissionClient = { rpc: (name, args) => { if (name === "speed_trivia_corpus_page") pages.push(Number(args?.p_offset)); return base.rpc(name, args); } };
      const full = await runtime.createSession({ client: reader, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge });
      expect(full.corpus().rows).toHaveLength(1203); expect(pages).toEqual([0, 500, 1000]);
      await large.exec("update trivia_questions set status='deleted' where slug like 'fixture-extra-%'");
      await expect(full.refresh()).rejects.toThrow("Too many changed questions");
    } finally { await large.close(); }
  }, 20000);
});

// Phase 3b (review #2): a confirmed duplicate is never lost to another pair's failure; paid verdicts are saved first.
describe("capped judge: a duplicate beside a failed pair", () => {
  const ANSWER = "Fixture shared answer";
  const competitor = (n: number) => candidate(400 + n, `Which numbered fixture fact ${n} has the shared answer?`, ANSWER);
  // Calls in order: the two probe pairs are unique, then pool pairs follow `plan` (by call number, from 3).
  const scripted = (modelVersion: string, cache: Map<string, unknown>, plan: Record<number, { delay: number; outcome: "duplicate" | Error }>) => {
    let call = 0;
    const saved: string[] = [];
    const adjudicate = vi.fn(async (tasks: ComparisonTask[]) => {
      const step = plan[++call];
      await new Promise(resolve => setTimeout(resolve, step?.delay ?? 1));
      if (step?.outcome instanceof Error) throw step.outcome;
      const task = tasks[0];
      const result = step?.outcome === "duplicate" ? { ...sound(task), decision: "duplicate" as const, explanation: "Same fixture fact" } : sound(task);
      // As the Gemini judge does: a paid verdict lands in the session cache, for the capped judge to persist.
      const key = core.pairKey(task.a, task.b, modelVersion);
      const { id: _id, ...stored } = result;
      cache.set(key, { modelVersion, firstHash: core.contentHash(task.a), result: stored });
      saved.push(key);
      return [result];
    });
    return { adjudicate, saved };
  };
  let isolated: DB, base: AdmissionClient;
  beforeAll(async () => {
    isolated = new PGlite(); await harness.setup(isolated);
    base = harness.clientFor(isolated);
    const seeding = await runtime.createSession({ client: base, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge });
    for (let n = 1; n <= 6; n++) await seeding.write(competitor(n));
  });
  afterAll(async () => { await isolated.close(); });
  const stored = async (keys: string[]) => Object.keys((await base.rpc("speed_trivia_cached_pairs", { p_keys: keys })).data as Record<string, unknown>);
  const check = async (n: number, modelVersion: string, plan: Record<number, { delay: number; outcome: "duplicate" | Error }>) => {
    const cache = new Map<string, unknown>();
    const fixture = scripted(modelVersion, cache, plan);
    const gate = await runtime.createSession({ client: base, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion, adjudicate: fixture.adjudicate }, cache, concurrency: 2 });
    const outcome = await gate.write(candidate(500 + n, `Which new fixture fact ${n} has the shared answer?`, ANSWER)).then(() => null, error => error);
    return { outcome, ...fixture };
  };
  it("returns duplicate when a provider 5xx finishes first, and saves every paid verdict", async () => {
    const { outcome, saved, adjudicate } = await check(1, "dup-after-5xx", { 3: { delay: 5, outcome: new Error("semantic-http-503") }, 4: { delay: 25, outcome: "duplicate" } });
    expect(outcome).toMatchObject({ code: "duplicate" });
    expect(adjudicate).toHaveBeenCalledTimes(4);
    expect(saved).toHaveLength(3);
    expect((await stored(saved)).sort()).toEqual([...saved].sort());
    const held = outcome.evidence.comparisons.filter((r: ComparisonResult) => r.explanation.startsWith("Not examined"));
    expect(held).toHaveLength(outcome.evidence.comparisons.length - 3);
  });
  it("returns duplicate when the duplicate finishes before a concurrent 5xx", async () => {
    const { outcome, saved } = await check(2, "dup-before-5xx", { 3: { delay: 5, outcome: "duplicate" }, 4: { delay: 25, outcome: new Error("semantic-http-502") } });
    expect(outcome).toMatchObject({ code: "duplicate" });
    expect((await stored(saved)).sort()).toEqual([...saved].sort());
  });
  it("returns duplicate beside a concurrent budget_exhausted", async () => {
    const { outcome } = await check(3, "dup-beside-budget", { 3: { delay: 5, outcome: new runtime.AdmissionError("budget_exhausted", "Run dollars budget exhausted.") }, 4: { delay: 25, outcome: "duplicate" } });
    expect(outcome).toMatchObject({ code: "duplicate" });
  });
  it("without a duplicate, still fails as before, after saving the paid verdicts", async () => {
    const { outcome, saved } = await check(4, "fail-no-dup", { 3: { delay: 5, outcome: new Error("semantic-http-503") }, 4: { delay: 25, outcome: "unique" as never } });
    expect(outcome).toMatchObject({ code: "verification_unavailable" });
    expect(saved).toHaveLength(3);
    expect((await stored(saved)).sort()).toEqual([...saved].sort());
  });
  it("a failed cache write beside a failed pair throws the pair's failure", async () => {
    const cache = new Map<string, unknown>();
    const fixture = scripted("cache-down", cache, { 3: { delay: 5, outcome: new Error("semantic-http-503") }, 4: { delay: 25, outcome: "duplicate" } });
    const failingCache: AdmissionClient = { rpc: (name, args) => name === "speed_trivia_cache_pairs" ? Promise.resolve({ data: null, error: { message: "cache unavailable" } }) : base.rpc(name, args) };
    const gate = await runtime.createSession({ client: failingCache, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "cache-down", adjudicate: fixture.adjudicate }, cache, concurrency: 2 });
    const outcome = await gate.write(candidate(505, "Which new fixture fact 5 has the shared answer?", ANSWER)).then(() => null, error => error);
    expect(outcome).toMatchObject({ code: "verification_unavailable" });
    expect(outcome.evidence.explanation).toContain("semantic-http-503");
  });
});

// Phase 3b (review #4, #5): released rows by revision, read lazily, never failing a write.
describe("D5 released set by revision, read lazily", () => {
  const REMEDIAL = [
    "supabase/migrations/20261115151703_speed_trivia_quick_review.sql",
    "supabase/migrations/20261115153905_speed_trivia_bar_test_scores.sql",
    "supabase/migrations/20261115170333_speed_trivia_keep_queue.sql",
    "supabase/migrations/20261115212126_speed_trivia_queue_repairs.sql",
    "supabase/migrations/20261115213124_speed_trivia_released_rows_revision.sql",
    "supabase/migrations/20261115214254_speed_trivia_undo_needs_look.sql",
  ];
  let isolated: DB;
  const releasedCalls: string[] = [];
  const counting = (inner: AdmissionClient): AdmissionClient => ({ rpc: (name, args) => { if (name.startsWith("speed_trivia_released_rows")) releasedCalls.push(name); return inner.rpc(name, args); } });
  const open = async (client: AdmissionClient, adjudicate: (tasks: ComparisonTask[]) => Promise<ComparisonResult[]>) =>
    runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "released-revision-fixture", adjudicate }, releasedRows: "read" });
  const sql = async (text: string, args: unknown[] = []) => {
    await isolated.exec("reset role;");
    try { return (await isolated.query(text, args)).rows; } finally { await isolated.exec("set role service_role;"); }
  };
  beforeAll(async () => {
    isolated = new PGlite(); await harness.setup(isolated);
    await isolated.exec("reset role;");
    for (const file of REMEDIAL) await isolated.exec(fs.readFileSync(file, "utf8"));
    await isolated.exec("set role service_role;");
  });
  afterAll(async () => { await isolated.close(); });
  it("the reviewer's #4 case: a row restored and re-rejected as wrong mid-session is compared again", async () => {
    releasedCalls.length = 0;
    const r = candidate(600, "Which element has the chemical symbol Au?", "Gold");
    const duplicateOfR = async (tasks: ComparisonTask[]) => tasks.map(t => t.b.id === r.id && t.a.options[t.a.correct_answer] === "Gold" ? { ...sound(t), decision: "duplicate" as const } : sound(t));
    const base = harness.clientFor(isolated);
    await (await open(base, duplicateOfR)).write(r);
    await sql("select public.speed_trivia_quick_reject($1::uuid[], 'quality')", [`{${r.id}}`]);
    const gate = await open(counting(base), duplicateOfR);
    // Released at r1: a new wording of its fact is admitted.
    expect((await gate.write(candidate(601, "Au is the chemical symbol of which element?", "Gold"))).row.status).toBe("pending_review");
    // Restored by Undo, then rejected as wrong, while the session runs.
    await sql("select public.speed_trivia_quick_undo($1::uuid)", [r.id]);
    await sql("select public.speed_trivia_quick_reject($1::uuid[], 'wrong')", [`{${r.id}}`]);
    await expect(gate.write(candidate(602, "Which metal is represented by Au on the periodic table?", "Gold"))).rejects.toMatchObject({ code: "duplicate" });
    expect(releasedCalls).toEqual(["speed_trivia_released_rows_v2"]);
  });
  it("approved-only writes never read the released set; full-bank writes read it once per session", async () => {
    releasedCalls.length = 0;
    const client = counting(harness.clientFor(isolated));
    const gate = await open(client, async tasks => tasks.map(sound));
    const a = (await gate.write(candidate(610, "Which planet is closest to the Sun?", "Mercury"))).row;
    const b = (await gate.write(candidate(611, "Which planet has the most moons?", "Saturn"))).row;
    expect(releasedCalls).toEqual(["speed_trivia_released_rows_v2"]);
    releasedCalls.length = 0;
    const approving = await open(client, async tasks => tasks.map(sound));
    expect((await approving.write({ status: "active" }, { existing: a, approvedOnly: true })).row.status).toBe("active");
    expect((await approving.write({ status: "active" }, { existing: b, approvedOnly: true })).row.status).toBe("active");
    await approving.checkApproved(candidate(612, "Which planet is known for its rings?", "Saturn rings") as AdmissionRow);
    expect(releasedCalls).toEqual([]);
  });
  it("an unreadable released set compares the whole bank, and the write still succeeds", async () => {
    const released = candidate(620, "Which ocean lies between Africa and Australia?", "Indian Ocean");
    const duplicateOfReleased = async (tasks: ComparisonTask[]) => tasks.map(t => t.b.id === released.id && t.a.options[t.a.correct_answer] === "Indian Ocean" ? { ...sound(t), decision: "duplicate" as const } : sound(t));
    const base = harness.clientFor(isolated);
    await (await open(base, duplicateOfReleased)).write(released);
    await sql("select public.speed_trivia_quick_reject($1::uuid[], 'quality')", [`{${released.id}}`]);
    const missing: AdmissionClient = { rpc: (name, args) => name === "speed_trivia_released_rows_v2" ? Promise.resolve({ data: null, error: { message: "function public.speed_trivia_released_rows_v2() does not exist" } }) : base.rpc(name, args) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const gate = await open(missing, duplicateOfReleased);
      expect((await gate.write(candidate(621, "Which planet is the hottest?", "Venus"))).row.status).toBe("pending_review");
      // Nothing skipped: the released row still blocks its fact.
      await expect(gate.write(candidate(622, "Which ocean washes both Madagascar and Western Australia?", "Indian Ocean"))).rejects.toMatchObject({ code: "duplicate" });
      expect(warn).toHaveBeenCalledTimes(1);
      // With the set readable, the same wording is admitted.
      expect((await (await open(base, duplicateOfReleased)).write(candidate(622, "Which ocean washes both Madagascar and Western Australia?", "Indian Ocean"))).row.status).toBe("pending_review");
    } finally { warn.mockRestore(); }
  });
});

describe("global cost limits, generation breadth and immutable cleanup", () => {
  it("reserves lost requests and caps candidates/tokens/time across retries", () => {
    let now = 0;
    const budget = runtime.createBudget({ dollars: 1, candidates: 2, inputTokens: 20, outputTokens: 10, requests: 2, retries: 1, elapsedMs: 100, now: () => now });
    budget.reserve({ dollars: .2, candidates: 2, inputTokens: 10, outputTokens: 5, requests: 1 });
    expect(() => budget.reserve({ candidates: 1 })).toThrow("candidates");
    expect(() => budget.reserve({ inputTokens: 11 })).toThrow("inputTokens");
    budget.reserve({ retries: 1 }); expect(() => budget.reserve({ retries: 1 })).toThrow("retries");
    now = 100; expect(() => budget.reserve({ requests: 1 })).toThrow("time");
    expect(budget.summary().dollars).toBe(.2);
    const another = runtime.createBudget({ dollars: 1, inputTokens: 100 });
    const reservation = another.reserve({ dollars: .1, inputTokens: 10, outputTokens: 10 });
    expect(() => another.settle(reservation, { dollars: .1, inputTokens: 11, outputTokens: 10 })).toThrow("reserved tokens");
  });
  it("ends an in-flight dependency at the shared run deadline", async () => {
    const budget = runtime.createBudget({ dollars: 1, elapsedMs: 15 });
    await expect(budget.limit(new Promise(() => undefined))).rejects.toMatchObject({ code: "budget_exhausted" });
  });
  it("plans only the player categories, counting from the database", () => {
    const rows = [candidate(1, "Which music fact?", "Artist", "Music"), candidate(2, "Which other music fact?", "Artist Two", "Music"), candidate(3, "Which literary fact?", "Poet", "Literary Landscapes")];
    const corpus = core.createCorpus(rows, { complete: true, expectedCount: rows.length, revision: "1" });
    const plan = generation.planTopics(corpus);
    expect(plan.map(p => p.category)).not.toContain("Literary Landscapes"); expect(plan).toHaveLength(8);
    expect(plan.find(p => p.category === "Music")).toMatchObject({ count: 2 }); expect(plan.find(p => p.category === "Music")?.topics.length).toBeGreaterThan(5);
  });
  it("rejects extra generator output and missing usage without admitting it", async () => {
    const budget = runtime.createBudget({ dollars: 1 });
    const data = { usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 }, candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[{},{}]" }] } }] };
    const transport = async () => ({ ok: true, json: async () => data });
    await expect(generation.generateOnce({ prompt: "small", count: 1, model: "gemini-2.5-flash", apiKey: "fixture-only", budget, transport })).rejects.toThrow("exceeded");
    await expect(generation.generateOnce({ prompt: "small", count: 1, model: "unpriced-model", apiKey: "fixture-only", budget, transport })).rejects.toThrow("price configuration");
  });
  it("admits a staged novel candidate, limits subjects, and reports a valid shortfall", async () => {
    const isolated = new PGlite(); await harness.setup(isolated);
    try {
      const gate = await runtime.createSession({ client: harness.clientFor(isolated), secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1, candidates: 2 }), judge });
      const generated = { question: "Which weather pattern warms the equatorial Pacific?", options: ["El Niño", "La Niña", "Monsoon", "Chinook"], correctAnswer: 0, difficulty: "medium", primarySubject: "El Niño", subtopic: "climate" };
      const transport = async () => ({ ok: true, json: async () => ({ usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 }, candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify([generated, generated]) }] } }] }) });
      const report = await generation.runGeneration({ session: gate, total: 2, batchSize: 2, category: "Geography", apiKey: "fixture-only", transport });
      expect(report).toMatchObject({ generated: 2, admitted: 1, diversityBlocked: 1, shortfall: 1, fatal: null });
      expect(gate.corpus().rows.some(r => r.question === generated.question && r.status === "pending_review")).toBe(true);
      expect(gate.corpus().rows.find(r => r.question === generated.question)?.speed_generation_metadata?.subtopic).toBe("climate");
      expect(generation.planTopics(gate.corpus()).find(p => p.category === "Geography")?.topics.find(t => t.topic === "climate")?.count).toBe(1);
    } finally { await isolated.close(); }
  });
  it("reports zero novel output and never treats verification failure as an allowed category error", async () => {
    const isolated = new PGlite(); await harness.setup(isolated);
    try {
      const makeSession = () => runtime.createSession({ client: harness.clientFor(isolated), secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1, candidates: 2 }), judge });
      const zero = await makeSession();
      const response = (rows: unknown[]) => async () => ({ ok: true, json: async () => ({ usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 }, candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(rows) }] } }] }) });
      expect(await generation.runGeneration({ session: zero, total: 2, batchSize: 2, apiKey: "fixture-only", transport: response([]) })).toMatchObject({ admitted: 0, shortfall: 2, fatal: null });
      const failing = await makeSession();
      failing.write = async () => { throw new runtime.AdmissionError("verification_unavailable", "Checker unavailable"); };
      const candidate = { question: "Which climate pattern warms the equatorial Pacific?", options: ["El Niño", "La Niña", "Monsoon", "Chinook"], correctAnswer: 0, primarySubject: "El Niño", subtopic: "climate" };
      await expect(generation.runGeneration({ session: failing, total: 2, batchSize: 2, category: "Geography", apiKey: "fixture-only", allowCategoryErrors: true, transport: response([candidate]) })).rejects.toMatchObject({ code: "verification_unavailable", report: { fatal: "verification_unavailable", admitted: 0 } });
    } finally { await isolated.close(); }
  });
  it("reports a normal shortfall when the deadline falls between accepted candidates", async () => {
    const isolated = new PGlite(); await harness.setup(isolated);
    let elapsed = 0;
    try {
      const budget = runtime.createBudget({ dollars: 1, elapsedMs: 5000, now: () => elapsed });
      const gate = await runtime.createSession({ client: harness.clientFor(isolated), secret: harness.SECRET, budget, judge });
      const write = gate.write;
      gate.write = async (input, options) => { const result = await write(input, options); elapsed = 5000; return result; };
      const generated = { question: "Which climate pattern warms the equatorial Pacific?", options: ["El Niño", "La Niña", "Monsoon", "Chinook"], correctAnswer: 0, primarySubject: "El Niño", subtopic: "climate" };
      const transport = async () => ({ ok: true, json: async () => ({ usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 }, candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify([generated]) }] } }] }) });
      expect(await generation.runGeneration({ session: gate, total: 2, batchSize: 1, category: "Geography", apiKey: "fixture-only", transport })).toMatchObject({ admitted: 1, generated: 1, shortfall: 1, fatal: null });
      expect(gate.corpus().rows.filter(row => row.question === generated.question)).toHaveLength(1);
    } finally { await isolated.close(); }
  });
  it("refuses Phase 2 dry runs and altered immutable manifest bytes", () => {
    expect(() => cleanup.validateManifest({ version: "speed-retirement-manifest-v1", applyReady: false })).toThrow();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "speed-trivia-manifest-"));
    const file = path.join(directory, "bad-manifest.json"); fs.writeFileSync(file, "{}");
    try { expect(() => cleanup.readManifest(file, "incorrect-hash")).toThrow("checksum"); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
