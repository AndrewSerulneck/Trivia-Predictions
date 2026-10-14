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
    const checking = await runtime.createSession({ client, secret: harness.SECRET, budget: runtime.createBudget({ dollars: 1 }), judge: { modelVersion: "early-reject-fixture", adjudicate } });
    await expect(checking.write(candidate(9, "Which new fact is being tested?", "New fixture"))).rejects.toMatchObject({ code: "duplicate" });
    expect(adjudicate).toHaveBeenCalledTimes(1);
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
  it("plans from database counts and supplies less-used subtopics", () => {
    const rows = [candidate(1, "Which music fact?", "Artist", "Music"), candidate(2, "Which other music fact?", "Artist Two", "Music"), candidate(3, "Which literary fact?", "Poet", "Literary Landscapes")];
    const corpus = core.createCorpus(rows, { complete: true, expectedCount: rows.length, revision: "1" });
    const plan = generation.planTopics(corpus);
    expect(plan[0].category).toBe("Literary Landscapes"); expect(plan.find(p => p.category === "Music")?.topics.length).toBeGreaterThan(5);
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
