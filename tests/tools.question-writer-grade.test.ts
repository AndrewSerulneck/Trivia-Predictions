import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attachGrades, conversionItems, conversionPost, gradeItems, isLoginFailure, runCodex, tokensUsed, writtenItems, type Written } from "@/tools/question-writer/grade.mjs";
import { LOGIN_MESSAGE, writeDay, type ApiReply } from "@/tools/question-writer/day.mjs";

// Phase 4d.1 (D35): the private writer's grading helpers. Pure functions; no codex, no network.
describe("writer grading helpers", () => {
  const written: Written[] = [
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
    const grade = readFileSync("tools/question-writer/grade.mjs", "utf8");
    expect(grade).toContain('child.stderr.on("data", (chunk) => { keep(chunk); errTail');
    const day = readFileSync("tools/question-writer/day.mjs", "utf8");
    expect(day).toContain("prompt.grade");
    expect(day).toContain("graderModel: model");
  });

  // Phase 7h (R2 #25.2): grades are matched by slot, so a game keeps one item per slot number.
  it("keeps the first item per slot across a game's prompts and counts the dropped ones", () => {
    const slots = [{ n: 1 }, { n: 2 }];
    const seen = new Set<number>();
    const first = writtenItems({ items: [{ slot: 1, question: "a" }, { slot: 1, question: "b" }, { slot: 7, question: "stray" }, { slot: 2, question: "c" }] }, slots, seen);
    expect(first.written.map(w => w.payload.question)).toEqual(["a", "c"]);
    expect(first.dropped).toBe(1);
    expect(writtenItems({ items: [{ slot: 2, question: "again" }] }, slots, seen)).toEqual({ written: [], dropped: 1 });
    expect(writtenItems(null, slots)).toEqual({ written: [], dropped: 0 });
  });
});

// Phase 7h (R2 #25.1): only codex's own error lines can mean "log in again", never the prompt it echoes.
describe("login failures", () => {
  it("reads only codex's error lines", () => {
    const echoed = 'user\nGrade these. Players log in to play.\n[{"n":1,"question":"Which site asks you to log in? 401 unauthorized"}]\n';
    expect(isLoginFailure(`${echoed}ERROR: stream disconnected before completion`)).toBe(false);
    expect(isLoginFailure(`${echoed}ERROR: unexpected status 401 Unauthorized`)).toBe(true);
    expect(isLoginFailure("[2026-11-20T00:31:02] ERROR: Your refresh token has expired. Please log in again.")).toBe(true);
    expect(isLoginFailure("2026-11-20T15:33:16.758461Z ERROR codex_api::endpoint: HTTP error: 401 Unauthorized")).toBe(true);
    expect(isLoginFailure("")).toBe(false);
  });

  type Child = EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: { end: (input: string) => void }; kill: () => void };
  const fakeSpawn = ({ stderr, code, answer }: { stderr: (prompt: string) => string; code: number; answer?: unknown }) => (_command: string, args: string[]) => {
    const child: Child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { end: () => undefined }, kill: () => undefined });
    child.kill = () => child.emit("close", null);
    child.stdin = { end: (prompt: string) => setImmediate(() => {
      child.stderr.emit("data", stderr(prompt));
      if (answer !== undefined) writeFileSync(args[args.indexOf("-o") + 1], JSON.stringify(answer));
      child.emit("close", code);
    }) };
    return child;
  };
  const call = { schema: {}, model: "gpt-6-astra", effort: "medium" };

  it("a failed call whose echoed prompt says 'log in' is an ordinary error", async () => {
    const spawnImpl = fakeSpawn({ stderr: prompt => `user\n${prompt}\nERROR: stream disconnected`, code: 1 });
    const error = await runCodex({ ...call, prompt: 'Grade:\n[{"n":1,"question":"Where do you log in?"}]', spawnImpl }).catch((e: Error & { login?: boolean }) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { login?: boolean }).login).toBeUndefined();
    expect((error as Error).message).toBe("codex exited 1.");
  });

  it("codex's own 401 is a login failure; a clean run returns the answer and tokens", async () => {
    const login = await runCodex({ ...call, prompt: "Write.", spawnImpl: fakeSpawn({ stderr: () => "ERROR: unexpected status 401 Unauthorized", code: 1 }) })
      .catch((e: Error & { login?: boolean }) => e);
    expect((login as Error & { login?: boolean }).login).toBe(true);
    const ok = await runCodex({ ...call, prompt: "Write.", spawnImpl: fakeSpawn({ stderr: () => "tokens used\n1,234\n", code: 0, answer: { items: [] } }) });
    expect(ok).toEqual({ output: { items: [] }, tokens: 1234 });
  });

  it("a timeout is an ordinary error", async () => {
    const spawnImpl = () => {
      const child: Child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { end: () => undefined }, kill: () => undefined });
      child.kill = () => setImmediate(() => { child.stderr.emit("data", "ERROR: please log in"); child.emit("close", null); });
      return child;
    };
    const error = await runCodex({ ...call, prompt: "Write.", timeoutMs: 5, spawnImpl }).catch((e: Error & { login?: boolean }) => e);
    expect((error as Error).message).toMatch(/timed out/);
    expect((error as Error & { login?: boolean }).login).toBeUndefined();
  });
});

// Phase 7h: one day's run against a fake site and a fake codex.
describe("writeDay", () => {
  const block = { prompt: "RUBRIC", schema: {}, webSearch: false, fields: ["question"], version: "bar-test-v6" };
  const brief = (game: string, extra: unknown[] = []) => ({ ok: true, prompts: [
    { kind: "regular", prompt: `write ${game}`, schema: {}, webSearch: false, slots: [{ n: 1 }, { n: 2 }], grade: block },
    ...extra,
  ] });
  const loginError = () => Object.assign(new Error("ChatGPT login failed."), { login: true });

  const site = (briefs: Record<string, unknown>) => {
    const posts: { route: string; body: { game?: string; items: Written[] } }[] = [];
    const api = async (route: string, init?: { method?: string; body?: string }): Promise<ApiReply> => {
      if (init?.method === "POST") {
        posts.push({ route, body: JSON.parse(init.body ?? "{}") });
        return { status: 200, body: { ok: true, received: 1 } };
      }
      const game = new URL(route, "https://x").searchParams.get("game") ?? "";
      return { status: 200, body: briefs[game] as ApiReply["body"] };
    };
    return { api, posts };
  };
  const quiet = { log: () => undefined, warn: () => undefined, model: "gpt-6-astra", gradeEffort: "medium" };

  it("a grading failure with 'log in' in the prompt still posts the batch, ungraded, and the day goes on", async () => {
    const { api, posts } = site({ speed: brief("speed"), live: brief("live") });
    const codex = async ({ prompt }: { prompt: string }) => {
      if (prompt.startsWith("RUBRIC")) throw new Error("codex exited 1."); // e.g. a question about where to log in
      return { output: { items: [{ slot: 1, question: "Where do you log in?" }, { slot: 2, question: "Q2?" }] }, tokens: 10 };
    };
    const warnings: string[] = [];
    const result = await writeDay({ ...quiet, games: ["speed", "live"], api, codex, warn: line => warnings.push(line) });
    expect(result).toEqual({ failed: false, login: false });
    expect(posts.map(p => p.body.game)).toEqual(["speed", "live"]);
    expect(posts[0].body.items).toHaveLength(2);
    expect(posts[0].body.items.every(i => i.grade === undefined)).toBe(true);
    expect(warnings[0]).toMatch(/grading: .*the site grades these instead/);
  });

  it("a login failure while grading doesn't stop the day either", async () => {
    const { api, posts } = site({ speed: brief("speed") });
    const codex = async ({ prompt }: { prompt: string }) => {
      if (prompt.startsWith("RUBRIC")) throw loginError();
      return { output: { items: [{ slot: 1, question: "Q1?" }] }, tokens: 1 };
    };
    expect(await writeDay({ ...quiet, games: ["speed"], api, codex })).toEqual({ failed: false, login: false });
    expect(posts).toHaveLength(1);
  });

  it("a login failure on a writing call posts what the game already has, skips the rest and reports login", async () => {
    const second = { kind: "currentEvents", prompt: "write news", schema: {}, webSearch: true, slots: [{ n: 3 }], grade: block };
    const { api, posts } = site({ speed: brief("speed", [second]), live: brief("live") });
    const calls: string[] = [];
    const codex = async ({ prompt }: { prompt: string }) => {
      calls.push(prompt.split("\n")[0]);
      if (prompt === "write news") throw loginError();
      if (prompt.startsWith("RUBRIC")) return { output: { grades: [{ n: 1, familiar: 4, fun: 4, estCorrect: 50, flags: [] }] }, tokens: 1 };
      return { output: { items: [{ slot: 1, question: "Q1?" }] }, tokens: 1 };
    };
    const result = await writeDay({ ...quiet, games: ["speed", "live"], api, codex });
    expect(result.login).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0].body.items[0].grade).toMatchObject({ version: "bar-test-v6", familiar: 4 });
    expect(calls).toEqual(["write speed", "RUBRIC", "write news"]); // Live never started
    expect(readFileSync("tools/question-writer/write.mjs", "utf8")).toContain("if (login) fail(3, LOGIN_MESSAGE);");
    expect(LOGIN_MESSAGE).toMatch(/renew-login\.sh/);
  });

  it("drops a repeated slot before grading and posting", async () => {
    const { api, posts } = site({ speed: brief("speed") });
    const graded: unknown[] = [];
    const codex = async ({ prompt }: { prompt: string }) => {
      if (prompt.startsWith("RUBRIC")) { graded.push(JSON.parse(prompt.split("\n")[1])); return { output: { grades: [] }, tokens: 1 }; }
      return { output: { items: [{ slot: 1, question: "first" }, { slot: 1, question: "second" }] }, tokens: 1 };
    };
    const warnings: string[] = [];
    await writeDay({ ...quiet, games: ["speed"], api, codex, warn: line => warnings.push(line) });
    expect(posts[0].body.items.map(i => i.payload.question)).toEqual(["first"]);
    expect(graded).toEqual([[{ n: 1, question: "first" }]]);
    expect(warnings).toContain("speed regular: 1 repeated slot(s) dropped.");
  });
});

// Phase 4e (D37): the conversion prompt's answers, matched to their requests, then posted.
describe("conversions", () => {
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
    const day = readFileSync("tools/question-writer/day.mjs", "utf8");
    expect(day).toContain('brief.prompts.filter((p) => p.kind !== "conversion")');
    expect(day).toContain("/api/question-writer/conversions");
    expect(day.indexOf("/api/question-writer/candidates")).toBeLessThan(day.indexOf("if (conversion) await convert"));
  });
});
