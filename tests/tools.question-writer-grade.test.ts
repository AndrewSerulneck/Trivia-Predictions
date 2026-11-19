import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Written = { slot: { n: number }; payload: Record<string, unknown>; grade?: unknown };
// Plain ESM in the private writer repo (no types there), so it is loaded untyped and cast here.
const { attachGrades, gradeItems, tokensUsed } = (await import("../tools/question-writer/grade.mjs" as string)) as {
  gradeItems: (items: Written[], fields: string[]) => Record<string, unknown>[];
  attachGrades: (items: Written[], output: unknown, version: string) => number;
  tokensUsed: (stderr: string) => number | null;
};

// Phase 4d.1 (D35): the private writer's grading helpers. Pure functions; no codex, no network.
describe("writer grading helpers", () => {
  const written = [
    { slot: { n: 3, category: "Music" }, payload: { question: "Q3?", options: ["A", "B", "C", "D"], correctIndex: 2, category: "Music", subject: "S", whyTrue: "w", sourceUrl: null, difficulty: "easy" } },
    { slot: { n: 4, category: "Music" }, payload: { question: "Q4?", answer: "Prince", acceptableAnswers: [], category: "Music", whyTrue: "w", sourceUrl: "https://example.com/a" } },
  ];

  it("sends only the brief's fields, the marked answer and the slot number, never the difficulty", () => {
    const items = gradeItems(written, ["category", "question", "options", "answer", "acceptableAnswers", "whyTrue", "sourceUrl"]);
    expect(items[0]).toEqual({ n: 3, category: "Music", question: "Q3?", options: ["A", "B", "C", "D"], answer: "C", whyTrue: "w" });
    expect(items[1]).toEqual({ n: 4, category: "Music", question: "Q4?", answer: "Prince", acceptableAnswers: [], whyTrue: "w", sourceUrl: "https://example.com/a" });
  });

  it("attaches grades by slot number, first one wins, and counts them", () => {
    const items: Written[] = written.map(w => ({ ...w }));
    const count = attachGrades(items, { grades: [{ n: 3, familiar: 4, fun: 3, estCorrect: 50, flags: [] }, { n: 3, familiar: 1, fun: 1, estCorrect: 1, flags: [] }, { n: 9, familiar: 5, fun: 5, estCorrect: 90, flags: [] }] }, "bar-test-v6");
    expect(count).toBe(1);
    expect(items[0].grade).toEqual({ version: "bar-test-v6", familiar: 4, fun: 3, estCorrect: 50, flags: [] });
    expect(items[1].grade).toBeUndefined();
    expect(attachGrades(items, null, "v")).toBe(0);
  });

  it("reads the token count from codex's stderr", () => {
    expect(tokensUsed("...\ntokens used\n17,101\n")).toBe(17101);
    expect(tokensUsed("nothing here")).toBeNull();
  });

  it("the writer reads tokens from stderr only and grades in a separate session", () => {
    const source = readFileSync("tools/question-writer/write.mjs", "utf8");
    expect(source).toContain('child.stderr.on("data", (chunk) => { keep(chunk); errTail');
    expect(source).toContain("prompt.grade");
    expect(source).toContain("graderModel: MODEL");
  });
});

// Phase 4e (D37): the conversion prompt's answers, matched to their requests, then posted.
describe("conversions", async () => {
  const { conversionItems, conversionPost } = (await import("../tools/question-writer/grade.mjs" as string)) as {
    conversionItems: (output: unknown, conversions: { n: number; requestId: string }[]) => { rewrites: (Written & { requestId: string })[]; declines: { requestId: string; reason: string }[] };
    conversionPost: (found: { rewrites: (Written & { requestId: string })[]; declines: { requestId: string; reason: string }[] }) => Record<string, unknown>[];
  };
  const map = [{ n: 1, requestId: "r1" }, { n: 2, requestId: "r2" }];

  it("matches answers by n, splits declines, drops unknown and repeated n", () => {
    const found = conversionItems({ items: [
      { n: 1, declined: false, reason: null, question: "Q?", answer: "Mars", extra: "dropped" },
      { n: 1, declined: true, reason: "dup" },
      { n: 2, declined: true, reason: "Too hard without choices." },
      { n: 9, declined: false, question: "Stray?" },
    ] }, map);
    expect(found.rewrites).toHaveLength(1);
    expect(found.rewrites[0]).toMatchObject({ slot: { n: 1 }, requestId: "r1", payload: { question: "Q?", answer: "Mars", subject: null } });
    expect(found.rewrites[0].payload).not.toHaveProperty("extra");
    expect(found.declines).toEqual([{ requestId: "r2", reason: "Too hard without choices." }]);
    found.rewrites[0].grade = { version: "v", familiar: 4 };
    expect(conversionPost(found)).toEqual([
      { requestId: "r1", payload: found.rewrites[0].payload, grade: { version: "v", familiar: 4 } },
      { requestId: "r2", declined: true, reason: "Too hard without choices." },
    ]);
    expect(conversionItems(null, map)).toEqual({ rewrites: [], declines: [] });
  });

  it("posts conversions separately, after the day's batch, and leaves them queued on failure", () => {
    const write = readFileSync("tools/question-writer/write.mjs", "utf8");
    expect(write).toContain('brief.prompts.filter((p) => p.kind !== "conversion")');
    expect(write).toContain("/api/question-writer/conversions");
    expect(write.indexOf("/api/question-writer/candidates")).toBeLessThan(write.indexOf("if (conversion) await convert"));
  });
});
