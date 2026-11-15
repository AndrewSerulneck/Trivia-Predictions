import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
type Stored = { score: number; version: string; familiar: number; fun: number; estCorrect: number; flags: string[]; model: string };
type Row = { id: string; question: string; options: string[]; correct_answer: number; category: string; status: string; question_pool: string; answer_format: string };
const script = require("../scripts/rescore-speed-trivia-checks.cjs") as {
  parseArgs: (argv: string[]) => { apply: boolean; undo: string | null };
  rescored: (row: Row, stored: Stored) => (Stored & { score: number }) | null;
  audienceKey: (row: Row) => string | null;
};
const runtime = require("../lib/speed-trivia-uniqueness/runtime.cjs") as { sameAnswer: (task: { a: Row; b: Row }) => boolean };
const { clientFromEnv } = require("../scripts/lib/speedTriviaServiceClient.cjs") as { clientFromEnv: () => unknown };

const row = (question: string, answer: string): Row => ({ id: "r1", question, options: [answer, "B", "C", "D"], correct_answer: 0, category: "Music", status: "pending_review", question_pool: "anytime_blitz", answer_format: "multiple_choice" });
const stored = (flags: string[], score: number): Stored => ({ score, version: "bar-test-v1", familiar: 4, fun: 4, estCorrect: 60, flags, model: "m" });

afterEach(() => vi.unstubAllEnvs());

describe("rescore multi-answer", () => {
  it("clears a wrong flag, lifts the cap and bumps the version", () => {
    const next = script.rescored(row("Which band released 'Deja Vu' in 1970?", "Crosby, Stills, Nash & Young"), stored(["multi-answer", "niche-subject"], 2));
    expect(next).toMatchObject({ flags: ["niche-subject"], score: 4, version: "bar-test-v2.1", model: "m" });
  });

  it("changes nothing for a real list", () => {
    expect(script.rescored(row("What are the three main disciplines in fencing?", "Foil, Epee, Sabre"), stored(["multi-answer"], 2))).toBeNull();
  });

  it("keeps the model's other flags", () => {
    const next = script.rescored(row("What is the Olympic motto?", "Citius, Altius, Fortius"), stored(["multi-answer", "ambiguous"], 2));
    expect(next?.flags).toEqual(["ambiguous"]);
    expect(next?.score).toBe(2);
  });

  it("parses arguments", () => {
    expect(script.parseArgs(["--apply"])).toEqual({ apply: true, undo: null });
    expect(script.parseArgs(["--undo", "log.json"])).toEqual({ apply: false, undo: "log.json" });
    expect(() => script.parseArgs(["--undo"])).toThrow();
    expect(() => script.parseArgs(["--nope"])).toThrow();
  });

  it("computes the same content key as the database for plain string options", () => {
    expect(script.audienceKey(row("Q?", "A"))).toMatch(/^[0-9a-f]{32}$/);
    expect(script.audienceKey({ ...row("Q?", "A"), options: [1 as unknown as string] })).toBeNull();
  });
});

describe("shared helpers", () => {
  it("runtime exports sameAnswer", () => {
    expect(runtime.sameAnswer({ a: row("Q1?", "Nirvana"), b: row("Q2?", "nirvana") })).toBe(true);
    expect(runtime.sameAnswer({ a: row("Q1?", "Nirvana"), b: row("Q2?", "Queen") })).toBe(false);
  });

  it("one service client helper checks the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => clientFromEnv()).toThrow("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    expect(clientFromEnv()).toBeTruthy();
  });
});
