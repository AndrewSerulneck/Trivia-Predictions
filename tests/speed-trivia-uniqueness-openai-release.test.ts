import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as provider from "@/lib/speed-trivia-uniqueness/openai.cjs";
import type { ComparisonTask, ComparisonResult, FactDecision, SpeedQuestion } from "@/types/speedTriviaUniqueness";

// Phase 4f.2 (D40): the OpenAI repeat checker re-passed the frozen gates (evaluation-v1 and evaluation-fresh-v1)
// before it replaced Gemini. This replays the recorded verdicts with no API call, and pins core.cjs and openai.cjs, so
// a change to the policy, the prompt or the model needs a new paid evaluation (scripts/evaluate-speed-trivia-uniqueness.cjs
// then scripts/freeze-speed-trivia-uniqueness-evidence.cjs).
const require = createRequire(import.meta.url);
const support = require(path.resolve("scripts/speed-trivia-phase2-support.cjs")) as { fixtureRow: (side: unknown, id: string) => SpeedQuestion };
type Pair = { id: string; label: "duplicate" | "unique" | "uncertain"; split: string; tags: string[]; a: unknown; b: unknown };
type Recorded = { key: string; firstHash: string; result: FactDecision; modelVersion: string };
type Evidence = { modelVersion: string; fixtureHash: string; coreSha256: string; providerSha256: string; gates: boolean; policyVersion: string;
  extractorVersion: string; retrievalVersion: string; recordedComparisons: Recorded[]; retrieval: { id: string; found: boolean; complete: boolean }[] };
const DIR = "tests/fixtures/speed-trivia-uniqueness";
const SETS = [
  { fixture: "evaluation-v1.json", evidence: "release-openai-evaluation-v1.json" },
  { fixture: "evaluation-fresh-v1.json", evidence: "release-openai-fresh-evaluation-v1.json" },
];

const replay = (evidence: Evidence) => {
  const recorded = new Map(evidence.recordedComparisons.map(r => [r.key, r]));
  return async (tasks: ComparisonTask[]): Promise<ComparisonResult[]> => tasks.map(t => {
    const r = recorded.get(core.pairKey(t.a, t.b, evidence.modelVersion));
    if (!r) throw new Error("Missing recorded OpenAI evidence");
    const reversed = r.firstHash !== core.contentHash(t.a);
    return { id: t.id, ...r.result, qualityA: reversed ? r.result.qualityB : r.result.qualityA, qualityB: reversed ? r.result.qualityA : r.result.qualityB };
  });
};

describe.each(SETS)("OpenAI repeat checker release evidence ($evidence)", ({ fixture, evidence: evidenceFile }) => {
  const fixtureBytes = fs.readFileSync(path.join(DIR, fixture), "utf8");
  const bytes = fs.readFileSync(path.join(DIR, evidenceFile), "utf8");
  const evidence = JSON.parse(bytes) as Evidence;
  const pairs = (JSON.parse(fixtureBytes) as { pairs: Pair[] }).pairs;

  it("pins the evidence, fixture, policy, prompt and the model in use", () => {
    expect(core.hash(bytes)).toBe(fs.readFileSync(path.join(DIR, evidenceFile.replace(/\.json$/, ".sha256")), "utf8").trim());
    expect(core.hash(fixtureBytes)).toBe(evidence.fixtureHash);
    expect(evidence.gates).toBe(true);
    expect([evidence.policyVersion, evidence.extractorVersion, evidence.retrievalVersion]).toEqual([core.POLICY_VERSION, core.EXTRACTOR_VERSION, core.RETRIEVAL_VERSION]);
    expect(core.hash(fs.readFileSync("lib/speed-trivia-uniqueness/core.cjs", "utf8"))).toBe(evidence.coreSha256);
    expect(core.hash(fs.readFileSync("lib/speed-trivia-uniqueness/openai.cjs", "utf8"))).toBe(evidence.providerSha256);
    expect(evidence.modelVersion).toBe(provider.modelVersion());
  });

  it("admits no repeat or uncertain pair and accepts at least 95% of distinct facts in each split", async () => {
    const adjudicate = replay(evidence);
    const results: { pair: Pair; decision: string }[] = [];
    for (const pair of pairs) {
      const a = support.fixtureRow(pair.a, `${pair.id}:a`), b = support.fixtureRow(pair.b, `${pair.id}:b`);
      let decision = "uncertain";
      try {
        const corpus = core.createCorpus([b], { complete: true, expectedCount: 1, revision: "openai-frozen-pair" });
        decision = (await core.checkCandidate(core.buildIndex(corpus), a, { modelVersion: evidence.modelVersion, adjudicate })).decision;
      } catch { /* malformed/missing input stays uncertain */ }
      results.push({ pair, decision });
      if (pair.label !== "unique") expect(decision, pair.id).not.toBe("unique");
      if (pair.label === "duplicate" && (pair.tags?.includes("mandatory-family") || pair.tags?.some(t => t.includes("exact")))) expect(decision, pair.id).toBe("duplicate");
    }
    for (const split of [...new Set(pairs.map(p => p.split))]) {
      const distinct = results.filter(r => r.pair.split === split && r.pair.label === "unique");
      if (distinct.length) expect(distinct.filter(r => r.decision === "unique").length / distinct.length, split).toBeGreaterThanOrEqual(.95);
    }
  });

  it("records complete-corpus retrieval of every labeled duplicate competitor", () => {
    for (const pair of pairs.filter(p => p.label === "duplicate")) {
      const hit = evidence.retrieval.find(r => r.id === pair.id);
      expect(hit?.found, pair.id).toBe(true); expect(hit?.complete, pair.id).toBe(true);
    }
  });
});
