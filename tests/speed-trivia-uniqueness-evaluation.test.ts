import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Side = { question: string; answer: string | null; category: string; imageContext: unknown; source: { kind: string; sourceHash?: string } };
type Pair = { id: string; label: "duplicate" | "unique" | "uncertain"; factId: string; a: Side; b: Side; tags: string[]; split: "calibration" | "held-out"; splitGroup: string; rationale: string };
const evaluation = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/speed-trivia-uniqueness/evaluation-v1.json"), "utf8")) as { version: string; pairs: Pair[] };
const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
describe("frozen Speed Trivia uniqueness evaluation", () => {
  it("contains at least 100 duplicate and 100 distinct labels, and all nine live categories in both splits", () => {
    expect(evaluation.pairs.filter(pair => pair.label === "duplicate").length).toBeGreaterThanOrEqual(100);
    expect(evaluation.pairs.filter(pair => pair.label === "unique").length).toBeGreaterThanOrEqual(100);
    for (const split of ["calibration", "held-out"]) {
      const categories = new Set(evaluation.pairs.filter(pair => pair.split === split).flatMap(pair => [pair.a.category, pair.b.category]));
      expect(categories.size).toBe(9);
    }
    expect(evaluation.pairs.filter(pair => pair.label === "duplicate" && pair.tags.includes("real-real")).length).toBeGreaterThanOrEqual(100);
  });
  it("has no fixture, source row, answer/entity, duplicate fact, or split component leakage", () => {
    const splits = new Map<string, string>();
    const pin = (key: string, split: string) => {
      if (splits.has(key)) expect(splits.get(key), key).toBe(split);
      else splits.set(key, split);
    };
    for (const pair of evaluation.pairs) {
      pin(`component:${pair.splitGroup}`, pair.split);
      if (pair.label === "duplicate") pin(`fact:${pair.factId}`, pair.split);
      for (const side of [pair.a, pair.b]) {
        pin(`fixture:${createHash("sha256").update(JSON.stringify([side.question, side.answer, side.imageContext])).digest("hex")}`, pair.split);
        if (side.source.sourceHash) pin(`source:${side.source.sourceHash}`, pair.split);
        if (side.answer) pin(`entity:${normalized(side.answer)}`, pair.split);
      }
    }
  });
  it("covers every mandatory family and the difficult boundary cases", () => {
    for (const family of ["gobi_continent", "eras_artist", "africa_hemispheres", "vertebrate_longevity", "sputnik_country", "olympia_origin"]) {
      expect(evaluation.pairs.some(pair => pair.factId === family && pair.label === "duplicate")).toBe(true);
    }
    const tags = new Set(evaluation.pairs.flatMap(pair => pair.tags));
    for (const tag of ["cross-category", "answer-alias", "reverse", "minimal-overlap", "partial-overlap", "similar-template", "same-artist-different-fact", "same-answer-different-fact", "missing-answer", "image"]) expect(tags.has(tag), tag).toBe(true);
    expect(new Set(evaluation.pairs.map(pair => pair.id)).size).toBe(evaluation.pairs.length);
    for (const pair of evaluation.pairs) expect(pair.rationale.trim().length).toBeGreaterThan(0);
  });
});
