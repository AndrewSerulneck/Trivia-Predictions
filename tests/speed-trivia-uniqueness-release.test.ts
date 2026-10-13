import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import type { ComparisonTask, ComparisonResult, FactDecision, SpeedQuestion } from "@/types/speedTriviaUniqueness";
const require = createRequire(import.meta.url);
// Pure fixture conversion only; support module makes no network/provider call.
const support = require(path.resolve("scripts/speed-trivia-phase2-support.cjs")) as { fixtureRow: (side: unknown, id: string) => SpeedQuestion };
type Pair = { id: string; label: "duplicate" | "unique" | "uncertain"; split: string; tags: string[]; a: unknown; b: unknown };
type Recorded = { key: string; firstHash: string; result: FactDecision; modelVersion: string };
const fixture = JSON.parse(fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json", "utf8")) as { pairs: Pair[] };
const bytes = fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/release-evaluation-v1.json", "utf8");
const release = JSON.parse(bytes) as { policyVersion: string; extractorVersion: string; retrievalVersion: string; modelVersion: string; gates: boolean; fixtureHash: string; recordedComparisons: Recorded[]; retrieval: { id: string; found: boolean; complete: boolean }[] };
const cached = new Map(release.recordedComparisons.map(r => [r.key, r]));
const adjudicate = async (tasks: ComparisonTask[]): Promise<ComparisonResult[]> => tasks.map(t => {
  const record = cached.get(core.pairKey(t.a, t.b, release.modelVersion));
  if (!record) throw new Error("Missing frozen provider evidence");
  const reversed = record.firstHash !== core.contentHash(t.a);
  return { id: t.id, ...record.result, qualityA: reversed ? record.result.qualityB : record.result.qualityA, qualityB: reversed ? record.result.qualityA : record.result.qualityB };
});
describe("frozen release evaluation replay", () => {
  it("pins fixture, recorded evidence, policy, extractor and retrieval versions", () => {
    expect(core.hash(bytes)).toBe(fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/release-evaluation-v1.sha256", "utf8").trim());
    expect(core.hash(fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json", "utf8"))).toBe(release.fixtureHash);
    expect(release.policyVersion).toBe(core.POLICY_VERSION); expect(release.extractorVersion).toBe(core.EXTRACTOR_VERSION); expect(release.retrievalVersion).toBe(core.RETRIEVAL_VERSION); expect(release.gates).toBe(true);
  });
  it("has zero duplicate/uncertain admissions and accepts >=95% of distinct facts in both splits", async () => {
    const results: { pair: Pair; decision: string }[] = [];
    for (const pair of fixture.pairs) {
      const a = support.fixtureRow(pair.a, pair.id + ":a"), b = support.fixtureRow(pair.b, pair.id + ":b");
      let decision = "uncertain";
      try {
        const corpus = core.createCorpus([b], { complete: true, expectedCount: 1, revision: "frozen-isolated-pair" });
        decision = (await core.checkCandidate(core.buildIndex(corpus), a, { modelVersion: release.modelVersion, adjudicate })).decision;
      } catch { /* malformed/missing input must stay uncertain */ }
      results.push({ pair, decision });
      if (pair.label !== "unique") expect(decision, pair.id).not.toBe("unique");
      if (pair.label === "duplicate" && (pair.tags.includes("mandatory-family") || pair.tags.some(t => t.includes("exact")))) expect(decision, pair.id).toBe("duplicate");
    }
    for (const split of ["calibration", "held-out"]) {
      const distinct = results.filter(r => r.pair.split === split && r.pair.label === "unique");
      expect(distinct.filter(r => r.decision === "unique").length / distinct.length).toBeGreaterThanOrEqual(.95);
    }
  });
  it("records complete-corpus retrieval of every labeled duplicate competitor", () => {
    for (const pair of fixture.pairs.filter(p => p.label === "duplicate")) {
      const hit = release.retrieval.find(r => r.id === pair.id);
      expect(hit?.found, pair.id).toBe(true); expect(hit?.complete, pair.id).toBe(true);
    }
  });
  it("passes the fresh set frozen before scoring, without subsequent policy changes", async () => {
    const freshBytes = fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/evaluation-fresh-v1.json", "utf8");
    const fresh = JSON.parse(freshBytes) as { pairs: Pair[]; policyFrozenBeforeScoring: { coreSha256: string; providerSha256: string } };
    const evidenceBytes = fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/release-fresh-evaluation-v1.json", "utf8");
    const evidence = JSON.parse(evidenceBytes) as { modelVersion: string; gates: boolean; recordedComparisons: Recorded[]; retrieval: { id: string; found: boolean; complete: boolean }[] };
    expect(core.hash(freshBytes)).toBe(fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/evaluation-fresh-v1.sha256", "utf8").trim());
    expect(core.hash(evidenceBytes)).toBe(fs.readFileSync("tests/fixtures/speed-trivia-uniqueness/release-fresh-evaluation-v1.sha256", "utf8").trim());
    expect(core.hash(fs.readFileSync("lib/speed-trivia-uniqueness/core.cjs", "utf8"))).toBe(fresh.policyFrozenBeforeScoring.coreSha256);
    expect(core.hash(fs.readFileSync("lib/speed-trivia-uniqueness/gemini.cjs", "utf8"))).toBe(fresh.policyFrozenBeforeScoring.providerSha256);
    const recorded = new Map(evidence.recordedComparisons.map(r => [r.key, r]));
    const replay = async (tasks: ComparisonTask[]): Promise<ComparisonResult[]> => tasks.map(t => {
      const r = recorded.get(core.pairKey(t.a, t.b, evidence.modelVersion));
      if (!r) throw new Error("Missing fresh evidence");
      const reversed = r.firstHash !== core.contentHash(t.a);
      return { id: t.id, ...r.result, qualityA: reversed ? r.result.qualityB : r.result.qualityA, qualityB: reversed ? r.result.qualityA : r.result.qualityB };
    });
    for (const pair of fresh.pairs) {
      const a = support.fixtureRow(pair.a, pair.id + ":a"), b = support.fixtureRow(pair.b, pair.id + ":b");
      const corpus = core.createCorpus([b], { complete: true, expectedCount: 1, revision: "fresh-frozen-pair" });
      const result = await core.checkCandidate(core.buildIndex(corpus), a, { modelVersion: evidence.modelVersion, adjudicate: replay });
      expect(result.decision, pair.id).toBe(pair.label === "unique" ? "unique" : "duplicate");
      if (pair.label === "duplicate") expect(evidence.retrieval.find(r => r.id === pair.id)?.found, pair.id).toBe(true);
    }
    expect(evidence.gates).toBe(true);
  });
});
