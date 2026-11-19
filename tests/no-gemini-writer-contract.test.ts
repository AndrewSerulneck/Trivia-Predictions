import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Phase 4f.1 (D40, docs/speed-trivia-backlog-and-quality-plan.md): Gemini never writes a question. 4f.2 widens this
// to every Gemini use.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });

describe("no Gemini question writer", () => {
  it("has none of the deleted writer files", () => {
    for (const gone of [
      "lib/question-writer/geminiWriter.cjs",
      "lib/speed-trivia-uniqueness/generation.cjs",
      "scripts/generate-trivia-nightly.cjs",
      "scripts/generate-trivia-questions.cjs",
      "scripts/generate-live-trivia-questions.cjs",
      "scripts/generate-live-trivia-nightly.cjs",
    ]) expect(existsSync(gone), gone).toBe(false);
  });

  it("leaves no reference to a Gemini writer, and no Gemini key in the writer code", () => {
    const scanned = [...files("lib/question-writer"), ...files("scripts"), ...files(".github/workflows"), "package.json"];
    for (const file of scanned) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/geminiWriter|writeWithGemini|generation\.cjs|generate-trivia-nightly|generate-live-trivia|live-trivia:generate|--no-fallback|QUESTION_WRITER_FALLBACK/);
    }
  });

  it("never offers gemini-fallback as a source to write", () => {
    const candidates = require(path.resolve("lib/question-writer/candidates.cjs")) as { SOURCES: readonly string[] };
    expect(candidates.SOURCES).toEqual(["chatgpt"]);
  });
});
