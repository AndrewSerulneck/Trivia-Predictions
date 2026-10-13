import { describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import { createSpeedTriviaChecker, loadSpeedTriviaCorpus } from "@/lib/speedTriviaUniqueness";
import type { ComparisonTask, ComparisonResult, SpeedQuestion } from "@/types/speedTriviaUniqueness";
const row = (id: string, question = "Which country launched Sputnik 1?", answer = "Soviet Union", status: SpeedQuestion["status"] = "active"): SpeedQuestion => ({ id, slug: id, question, options: [answer, "Other"], correct_answer: 0, category: "History", question_pool: "anytime_blitz", answer_format: "multiple_choice", status });
const corpus = (rows: SpeedQuestion[]) => core.createCorpus(rows, { complete: true, expectedCount: rows.length, revision: "revision-1" });
const judge = async (tasks: ComparisonTask[]): Promise<ComparisonResult[]> => tasks.map(t => ({ id: t.id, decision: "unique", fact: "Two separate facts", explanation: "Materially different required knowledge.", qualityA: "sound", qualityB: "sound", confidence: "high" }));
describe("shared Speed Trivia fact checker", () => {
  it("loads >1,000 ordered rows exactly once, including deleted history", async () => {
    const rows = Array.from({ length: 1203 }, (_, n) => row(String(n).padStart(4, "0"), `Question ${n}?`, `Answer ${n}`, n % 3 === 0 ? "deleted" : "pending_review"));
    let calls = 0;
    const loaded = await loadSpeedTriviaCorpus({ readEvidence: async () => ({ count: rows.length, revision: "v1" }), readPage: async ({ offset, limit }) => { calls++; return { rows: rows.slice(offset, offset + limit), revision: "v1" }; } });
    expect(loaded.rows).toHaveLength(1203); expect(calls).toBe(3); expect(loaded.rows.some(r => r.status === "deleted")).toBe(true);
  });
  it("rejects truncation, stale revisions, unordered pages and absent dependencies", async () => {
    const rows = [row("a"), row("b")];
    const reader = { readEvidence: async () => ({ count: 2, revision: "v1" }), readPage: async () => ({ rows: rows.slice(0, 1), revision: "v1" }) };
    await expect(core.loadCorpus(reader)).rejects.toThrow("incomplete");
    await expect(core.loadCorpus({ ...reader, readPage: async () => ({ rows, revision: "v2" }) })).rejects.toThrow("stale");
    await expect(core.loadCorpus({ ...reader, readPage: async () => ({ rows: [...rows].reverse(), revision: "v1" }) })).rejects.toThrow("unordered");
    let reads = 0;
    await expect(core.loadCorpus({ ...reader, readEvidence: async () => ({ count: 2, revision: `v${++reads}` }), readPage: async () => ({ rows, revision: "v1" }) })).rejects.toThrow("stale-corpus");
    expect(() => core.createCorpus([], { complete: false, expectedCount: 0, revision: "" })).toThrow("incomplete");
  });
  it("remembers exact retired facts across category and option order", async () => {
    const retired = row("retired", "Which country launched Sputnik 1?", "Soviet Union", "deleted");
    const candidate = { ...row("candidate"), category: "Science", options: ["Other", "Soviet Union"], correct_answer: 1 };
    const result = await createSpeedTriviaChecker(corpus([retired]), {}).check(candidate);
    expect(result.decision).toBe("duplicate"); expect(result.matchedRowIds).toEqual(["retired"]); expect(result.contentHash).toHaveLength(64);
  });
  it("retrieves answer aliases and reversal, never distractor-only entities", () => {
    const index = core.buildIndex(corpus([row("a"), row("b", "Which band recorded Yesterday?", "The Beatles")]));
    expect(core.retrieve(index, row("c", "Which state sent Sputnik I into orbit?", "USSR")).matches.some(h => h.id === "a" && h.routes.includes("answer"))).toBe(true);
    expect(core.retrieve(index, row("d", "Soviet Union sent what first satellite?", "Sputnik 1")).matches.some(h => h.id === "a")).toBe(true);
    expect(index.answers.has(core.answerKey("Other"))).toBe(false);
    expect(core.answerKey("Ancient Egyptians")).toBe(core.answerKey("Egyptian"));
    const countries = core.buildIndex(corpus([row("countries", "Which countries contain a desert?", "China and Mongolia")]));
    expect(core.retrieve(countries, row("reordered", "Identify its two nations.", "Mongolia and China")).matches.some(h => h.id === "countries" && h.routes.includes("answer-set"))).toBe(true);
  });
  it("invalidates evidence for answer, question, image, pool, format and distractor edits", () => {
    const a = row("a"), original = core.contentHash(a);
    for (const changed of [{ ...a, question: "Different?" }, { ...a, options: ["USSR", "Other"] }, { ...a, options: ["Soviet Union", "France"] }, { ...a, image_context: { subject: "Mars" } }]) expect(core.contentHash(changed)).not.toBe(original);
    expect(() => core.contentHash({ ...a, question_pool: "live_showdown" } as unknown as SpeedQuestion)).toThrow("pool");
    expect(() => core.contentHash({ ...a, answer_format: "write_in" } as unknown as SpeedQuestion)).toThrow("format");
    expect(core.pairKey(a, row("b"), "m1")).not.toBe(core.pairKey(a, row("b"), "m2"));
  });
  it("fails closed for unavailable judge, malformed content, stale evidence, and timeout", async () => {
    const index = core.buildIndex(corpus([row("a")]));
    const candidate = row("b", "Which state sent Sputnik I into orbit?", "USSR");
    expect((await core.checkCandidate(index, candidate)).decision).toBe("uncertain");
    expect((await core.checkCandidate(index, candidate, { modelVersion: "m", adjudicate: judge, expectedRevision: "old" })).decision).toBe("uncertain");
    expect((await core.checkCandidate(index, { ...candidate, correct_answer: 9 }, { modelVersion: "m", adjudicate: judge })).decision).toBe("uncertain");
    expect((await core.checkCandidate(index, candidate, { modelVersion: "m", adjudicate: async () => { throw new Error("timeout"); } })).decision).toBe("uncertain");
    expect((await core.checkCandidate(index, candidate, { modelVersion: "m", adjudicate: async () => [] })).decision).toBe("uncertain");
  });
  it("refuses overflow rather than silently dropping a same-answer competitor", async () => {
    const index = core.buildIndex(corpus(Array.from({ length: 140 }, (_, n) => row(String(n), `Different fact ${n}?`, "Taylor Swift"))));
    const result = await core.checkCandidate(index, row("c", "New tour?", "Taylor Swift"), { modelVersion: "m", adjudicate: judge });
    expect(result.decision).toBe("uncertain"); expect(result.explanation).toContain("budget");
  });
  it("permits distinct same-artist facts after semantic checking, and handles candidate batch duplicates", async () => {
    const initial = corpus([row("a", "Who led Eras Tour?", "Taylor Swift")]);
    expect((await createSpeedTriviaChecker(initial, { modelVersion: "m", adjudicate: judge }).check(row("b", "Who recorded Folklore?", "Taylor Swift"))).decision).toBe("unique");
    const results = await core.checkBatch(initial, [row("c", "Who recorded Folklore?", "Taylor Swift"), { ...row("d", "Who recorded Folklore?", "Taylor Swift"), category: "Pop Culture" }], { modelVersion: "m", adjudicate: judge });
    expect(results.map(r => r.decision)).toEqual(["unique", "duplicate"]);
  });
  it("supports own-row exclusion without losing other copies or deleted memory", async () => {
    const a = row("a"), index = core.buildIndex(corpus([a, row("b", a.question, "Soviet Union", "deleted")]));
    const result = await core.checkCandidate(index, a, { excludeId: "a", modelVersion: "m", adjudicate: judge });
    expect(result.matchedRowIds).toEqual(["b"]);
  });
  it("holds identical questions with conflicting answers and missing image evidence", async () => {
    expect(core.deterministicPair(row("a"), row("b", row("a").question, "Russia"))?.decision).toBe("uncertain");
    const index = core.buildIndex(corpus([row("a")]));
    expect((await core.checkCandidate(index, { ...row("b"), image_url: "https://example.com/x.png" }, { modelVersion: "m", adjudicate: judge })).decision).toBe("uncertain");
  });
  it("holds conflicting same-scope answers without conflating named subjects or material years", () => {
    const a = row("a", "What is the maximum score a player can achieve with a single dart throw in standard darts?", "180");
    const b = row("b", "What is the maximum score from a single standard dart?", "60");
    expect(core.deterministicPair(a, b)?.decision).toBe("uncertain");
    expect(core.deterministicPair(row("c", "Who won the award in 2020?", "Person A"), row("d", "Who won the award in 2021?", "Person B"))).toBeNull();
    expect(core.deterministicPair(row("c", "Who wrote Hamlet?", "William Shakespeare"), row("d", "Who wrote Ulysses?", "James Joyce"))).toBeNull();
  });
  it("freezes nested content so caller mutations cannot leave a stale index", () => {
    const original = row("a"), loaded = corpus([original]);
    original.options[0] = "Changed";
    expect(loaded.rows[0].options[0]).toBe("Soviet Union");
    expect(Object.isFrozen(loaded.rows[0].options)).toBe(true);
  });
});
