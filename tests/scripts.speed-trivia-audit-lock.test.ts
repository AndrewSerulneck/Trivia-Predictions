import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
type Row = Record<string, unknown>;
type Claim = { dollars: number; inputTokens: number; outputTokens: number };
type Budget = { reserve: (claim: Claim) => string; settle: (id: string, claim: Claim) => void; summary: () => { dollars: number; requests: number; unsettled: number }; close: () => void };
type Task = { id: string; a: Row; b: Row };
type Verdict = { id: string; decision: string; fact: string; explanation: string; qualityA: string; qualityB: string; confidence: string };
type Judge = { modelVersion: string; adjudicate: (tasks: Task[]) => Promise<Verdict[]> };
const core = require("../lib/speed-trivia-uniqueness/core.cjs") as { hash: (input: string) => string; contentHash: (row: Row) => string; createCorpus: (rows: Row[], options: object) => { digest: string } };
const support = require("../scripts/speed-trivia-phase2-support.cjs") as { readSnapshot: (directory: string) => { rows: Row[] }; privateDirectory: (directory: string) => string; openBudget: (directory: string, options: { dollars: number }) => Budget };
const gemini = require("../lib/speed-trivia-uniqueness/gemini.cjs") as { createJudge: (options: { budget: Budget }) => Judge };
type Input = { snapshot: string; planFile: string; planHash: string; oldJournal: string; output: string; cap: number; paid: boolean };
const audit = require("../scripts/audit-speed-trivia-refresh.cjs") as { run: (input: Input) => Promise<{ coverage: { processed: number; failure: string | null } }> };
const directories: string[] = [];
const version = "gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1";
const verdict = (id: string): Verdict => ({ id, decision: "unique", fact: "Distinct synthetic facts", explanation: "Synthetic comparison", qualityA: "sound", qualityB: "sound", confidence: "high" });

const fixture = (count = 0) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "speed-audit-lock-test-"));
  directories.push(directory);
  const snapshot = path.join(directory, "snapshot"), output = path.join(directory, "output");
  fs.mkdirSync(snapshot); fs.mkdirSync(output);
  fs.writeFileSync(path.join(snapshot, "dependencies.json"), JSON.stringify([{ evidence: { captured_at: "2026-10-13T00:00:00Z", per_question_counts: [] } }]));
  const rows: Row[] = ["A", "B"].map((letter, index) => ({ id: `fixture-${letter}`, slug: `fixture-${letter}`, question: `Synthetic association ${letter}?`, options: [`Answer ${index}`, "Distractor 1", "Distractor 2", "Distractor 3"], correct_answer: 0, category: "Science", status: "active", question_pool: "anytime_blitz", answer_format: "multiple_choice" }));
  const corpus = core.createCorpus(rows, { complete: true, expectedCount: rows.length, revision: "1" });
  const tasks = Array.from({ length: count }, (_, index) => ({ id: `pair-${index}`, aId: rows[0].id, bId: rows[1].id, aHash: core.contentHash(rows[0]), bHash: core.contentHash(rows[1]) }));
  const bytes = JSON.stringify({ corpusRevision: "1", corpusDigest: corpus.digest, tasks });
  const planFile = path.join(directory, "plan.json"); fs.writeFileSync(planFile, bytes);
  vi.spyOn(support, "readSnapshot").mockReturnValue({ rows });
  vi.spyOn(support, "privateDirectory").mockReturnValue(output);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in audit lock tests"); }));
  const judge = { modelVersion: version, adjudicate: vi.fn(async (input: Task[]) => input.map(task => verdict(task.id))) };
  vi.spyOn(gemini, "createJudge").mockReturnValue(judge);
  const input: Input = { snapshot, planFile, planHash: core.hash(bytes), oldJournal: path.join(directory, "old-journal.jsonl"), output, cap: 1, paid: true };
  return { input, judge, lock: path.join(output, "budget.jsonl.lock") };
};

describe("one-time audit budget lock ownership", () => {
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each(["cache", "old journal", "refresh journal", "model drift", "provider initialization"])("releases its lock after %s startup failure", async kind => {
    const { input, lock } = fixture();
    if (kind === "cache") fs.writeFileSync(path.join(input.output, "pair-cache.jsonl"), "invalid JSON\n");
    if (kind === "old journal") fs.writeFileSync(input.oldJournal, "invalid JSON\n");
    if (kind === "refresh journal") fs.writeFileSync(path.join(input.output, "adjudicated-pairs.jsonl"), "invalid JSON\n");
    if (kind === "model drift") fs.writeFileSync(input.oldJournal, JSON.stringify({ modelVersion: "wrong-version" }) + "\n");
    if (kind === "provider initialization") vi.mocked(gemini.createJudge).mockImplementationOnce(() => { throw new Error("Synthetic initialization failure"); });
    await expect(audit.run(input)).rejects.toThrow();
    expect(fs.existsSync(lock)).toBe(false);
    const retry = support.openBudget(input.output, { dollars: 1 }); retry.close();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not remove a lock held by another run", async () => {
    const { input, lock } = fixture();
    fs.writeFileSync(lock, "synthetic-owner");
    await expect(audit.run(input)).rejects.toMatchObject({ code: "EEXIST" });
    expect(fs.readFileSync(lock, "utf8")).toBe("synthetic-owner");
    expect(gemini.createJudge).not.toHaveBeenCalled();
  });

  it("keeps unsettled reservations charged across a startup failure and retry", async () => {
    const { input, lock } = fixture();
    const previous = support.openBudget(input.output, { dollars: 1 });
    previous.reserve({ dollars: 0.75, inputTokens: 10, outputTokens: 10 }); previous.close();
    fs.writeFileSync(path.join(input.output, "pair-cache.jsonl"), "invalid JSON\n");
    await expect(audit.run(input)).rejects.toThrow();
    expect(fs.existsSync(lock)).toBe(false);
    const resumed = support.openBudget(input.output, { dollars: 1 });
    try {
      expect(resumed.summary()).toMatchObject({ dollars: 0.75, requests: 1, unsettled: 1 });
      expect(() => resumed.reserve({ dollars: 0.3, inputTokens: 1, outputTokens: 1 })).toThrow("semantic-budget-exhausted");
    } finally { resumed.close(); }
  });

  it("retains the lock until in-flight workers settle after a journal write failure", async () => {
    const { input, lock } = fixture(8);
    const writeError = new Error("Synthetic journal write failure");
    const append = fs.appendFileSync;
    let failWrite = true;
    vi.spyOn(fs, "appendFileSync").mockImplementation((file, data, options) => {
      if (file === path.join(input.output, "adjudicated-pairs.jsonl") && failWrite) { failWrite = false; throw writeError; }
      return append(file, data, options);
    });
    const release: Array<() => void> = [];
    let budget: Budget | undefined;
    vi.mocked(gemini.createJudge).mockImplementation(options => {
      budget = options.budget;
      return { modelVersion: version, adjudicate: vi.fn(async tasks => {
        const claim = { dollars: 0.01, inputTokens: 1, outputTokens: 1 };
        const reservation = options.budget.reserve(claim);
        if (tasks[0].id !== "pair-0") await new Promise<void>(resolve => release.push(resolve));
        options.budget.settle(reservation, claim);
        return [verdict(tasks[0].id)];
      }) };
    });
    let finished = false;
    const outcome = audit.run(input).then(() => { finished = true; return null; }, error => { finished = true; return error; });
    await new Promise<void>(resolve => setImmediate(resolve));
    try {
      expect(finished).toBe(false);
      expect(fs.existsSync(lock)).toBe(true);
      expect(() => support.openBudget(input.output, { dollars: 1 })).toThrow();
      expect(release).toHaveLength(5);
    } finally { release.forEach(resolve => resolve()); }
    expect(await outcome).toBe(writeError);
    expect(fs.existsSync(lock)).toBe(false);
    expect(budget?.summary()).toMatchObject({ requests: 6, unsettled: 0 });
    const resumed = support.openBudget(input.output, { dollars: 1 });
    try { expect(resumed.summary().requests).toBe(6); } finally { resumed.close(); }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("writes successful audit artifacts and releases the lock", async () => {
    const { input, lock } = fixture(1);
    expect((await audit.run(input)).coverage).toMatchObject({ processed: 1, failure: null });
    expect(fs.existsSync(lock)).toBe(false);
    expect(fs.readdirSync(input.output).some(file => /^refreshed-manifest-.*\.json$/.test(file))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
