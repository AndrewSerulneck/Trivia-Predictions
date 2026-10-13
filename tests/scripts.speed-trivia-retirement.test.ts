import { describe, expect, it } from "vitest";
import * as retirement from "@/lib/speed-trivia-uniqueness/retirement.cjs";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import type { SpeedQuestion, FactDecision } from "@/types/speedTriviaUniqueness";
const row = (id: string, status: SpeedQuestion["status"] = "active"): SpeedQuestion => ({ id, slug: id, question: `Question ${id}?`, options: ["Answer", "Other"], correct_answer: 0, category: "Music", question_pool: "anytime_blitz", answer_format: "multiple_choice", status, created_at: "2026-01-01T00:00:00Z" });
const pair = (a: SpeedQuestion, b: SpeedQuestion, decision: FactDecision["decision"] = "duplicate", quality: FactDecision["qualityA"] = "sound") => ({ aId: a.id, bId: b.id, aHash: core.contentHash(a), bHash: core.contentHash(b), result: { decision, qualityA: quality, qualityB: quality, confidence: "high", fact: "Same required fact", explanation: "Direct comparison evidence" } as FactDecision });
const manifest = (rows: SpeedQuestion[], comparisons: ReturnType<typeof pair>[]) => retirement.createRetirementManifest({ corpus: core.createCorpus(rows, { complete: true, expectedCount: rows.length, revision: "v1" }), comparisons, modelVersion: "m1" });
describe("dry-run Speed retirement manifest", () => {
  it("prefers sound approved keeper and includes guarded old hashes and changed fields", () => {
    const a = row("a", "pending_review"), b = row("b"), m = manifest([a, b], [pair(a, b)]);
    expect(m.retirements).toHaveLength(1); expect(m.retirements[0].keeperId).toBe("b"); expect(m.retirements[0].oldContentHash).toBe(core.contentHash(a)); expect(m.retirements[0].changedFields).toEqual(["status", "retirement_metadata"]);
  });
  it("holds pending-only groups, uncertain accuracy, and deleted keepers", () => {
    for (const rows of [[row("a", "pending_review"), row("b", "pending_review")], [row("a", "deleted"), row("b", "pending_review")]]) {
      const m = manifest(rows, [pair(rows[0], rows[1])]); expect(m.retirements).toHaveLength(0); expect(m.unresolved.length).toBeGreaterThan(0);
    }
    const rows = [row("a"), row("b")]; expect(manifest(rows, [pair(rows[0], rows[1], "duplicate", "uncertain")]).retirements).toHaveLength(0);
  });
  it("never retires using an unproven transitive chain", () => {
    const [a, b, c] = [row("a"), row("b"), row("c")];
    const m = manifest([a, b, c], [pair(a, b), pair(b, c)]);
    expect(m.retirements.map(r => r.id)).toEqual(["b"]); expect(m.retirements.some(r => r.id === "c")).toBe(false);
  });
  it("refuses changed content instead of recomputing an implicit manifest", () => {
    const a = row("a"), b = row("b"), evidence = pair(a, b);
    expect(() => manifest([{ ...a, question: "Changed?" }, b], [evidence])).toThrow("stale");
  });
});
