import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { PlayerTriviaQuestion } from "@/types";

// Standing rule (docs/speed-trivia-backlog-and-quality-plan.md §7, D31, Phase 4c.6): a Speed question's correct
// answer never reaches the browser before the player answers. Options are shown in `questionOptionOrder` order, and
// `trivia_answers.answer` always holds the stored index.

const read = (path: string) => readFileSync(path, "utf8");

const interfaceBody = (source: string, name: string): string => {
  const start = source.indexOf(`export interface ${name} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("\n}", start));
};

describe("Speed Trivia answer stays hidden until answered", () => {
  it("the player question type has no correctAnswer field", () => {
    expectTypeOf<PlayerTriviaQuestion>().not.toHaveProperty("correctAnswer");
    expect(interfaceBody(read("types/index.ts"), "PlayerTriviaQuestion")).not.toMatch(/correct/i);
  });

  it("the player GET serves only player questions", () => {
    const route = read("app/api/trivia/route.ts");
    expect(route).toMatch(/getPlayerTriviaQuestions\(/);
    expect(route).not.toMatch(/\bgetTriviaQuestions\b/);
  });

  it("the player view is built field by field, never by spreading the stored question", () => {
    const trivia = read("lib/trivia.ts");
    const start = trivia.indexOf("export const toPlayerTriviaQuestion");
    const body = trivia.slice(start, trivia.indexOf("\n};", start));
    expect(body).not.toMatch(/\.\.\.question|correctAnswer/);
    expect(body).toMatch(/questionOptionOrder\(/);
  });

  it("the POST stores the stored index", () => {
    const trivia = read("lib/trivia.ts");
    const submit = trivia.slice(trivia.indexOf("export async function submitTriviaAnswer"));
    expect(submit).toMatch(/answer: storedAnswer,/);
    expect(submit).not.toMatch(/answer: params\.answer/);
  });

  it("the game screen reads the answer only from the POST reply", () => {
    const game = read("components/trivia/TriviaGame.tsx");
    const reads = game.match(/[\w.]+\.correctAnswer\b/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((expression) => expression === "payload.result.correctAnswer")).toBe(true);
    expect(game).not.toMatch(/\bTriviaQuestion\b/);
    expect(read("lib/warmupCache.ts")).not.toMatch(/\bTriviaQuestion\b/);
  });
});
