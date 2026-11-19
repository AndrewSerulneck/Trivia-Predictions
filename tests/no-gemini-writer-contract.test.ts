import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Phase 4f.1 (D40, docs/speed-trivia-backlog-and-quality-plan.md): Gemini never writes a question. Phase 4f.2: Gemini
// is out of every step (the checks run on the OpenAI API), so no code may call it or read its key.
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
      // 4f.2
      "lib/speed-trivia-uniqueness/gemini.cjs",
      "lib/speed-trivia-uniqueness/gemini.d.cts",
      "scripts/audit-live-trivia.cjs",
    ]) expect(existsSync(gone), gone).toBe(false);
  });

  it("leaves no reference to a Gemini writer, and no Gemini key in the writer code", () => {
    const scanned = [...files("lib/question-writer"), ...files("scripts"), ...files(".github/workflows"), "package.json"];
    for (const file of scanned) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/geminiWriter|writeWithGemini|generation\.cjs|generate-trivia-nightly|generate-live-trivia|live-trivia:generate|--no-fallback|QUESTION_WRITER_FALLBACK/);
    }
  });

  it("has no Gemini endpoint, key or client anywhere in lib/, app/, components/, scripts/ or .github/ (4f.2)", () => {
    const code = /\.(c|m)?[jt]sx?$|\.d\.cts$|\.ya?ml$|\.json$/;
    const scanned = ["lib", "app", "components", "scripts", ".github"].flatMap((dir) => files(dir)).filter((file) => code.test(file));
    expect(scanned.length).toBeGreaterThan(100);
    for (const file of [...scanned, "package.json"]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/GEMINI_API_KEY|GEMINI_MODEL|GEMINI_API_URL|generativelanguage\.googleapis\.com|x-goog-api-key|uniqueness\/gemini|@google\/(generative-ai|genai)/);
    }
  });

  it("never offers gemini-fallback as a source to write", () => {
    const candidates = require(path.resolve("lib/question-writer/candidates.cjs")) as { SOURCES: readonly string[] };
    expect(candidates.SOURCES).toEqual(["chatgpt"]);
  });
});
