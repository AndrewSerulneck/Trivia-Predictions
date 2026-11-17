import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Phase 4c nightly Live processing (docs/speed-trivia-backlog-and-quality-plan.md) with an in-memory client, a fake
// bar test and a fake repeat judge. No network, no database. Pool separation: nothing here may touch trivia_questions.
const require = createRequire(import.meta.url);
type Row = Record<string, unknown>;
type Report = { source: string | null; examined: number; rejected: Record<string, number>; waiting: number; skipped: number;
  waitingByKind: Record<string, number>; possibleRepeats: number; stopped: string | null; fallback: Row | null };
const live = require("../lib/question-writer/liveProcess.cjs") as {
  processLiveDay: (input: Row) => Promise<Report>;
  readLiveCorpus: (dir?: string) => Row[];
};
const map = require("../lib/question-variety/map.cjs") as { isoDay: (d: Date) => string };

const TODAY = new Date("2026-11-16T02:20:00Z");
const DAY = map.isoDay(TODAY);
const AREAS = [
  { id: "l-rock", category: "Music", name: "Classic rock", eras: ["1970s", "1980s"], active: true },
  { id: "l-actors", category: "Movies", name: "Actors and performers", eras: ["1990s"], active: true },
  { id: "l-ce", category: "Current Events", name: "Sports", eras: ["Past 12 months"], active: true },
];

const memoryClient = ({ run = { source: "chatgpt", model: "gpt-6-astra", received: 1 } as Row | null, list = [] as Row[], inReview = [] as Row[], stats = [] as Row[] } = {}) => {
  const tables: Record<string, Row[]> = {
    question_writer_runs: run ? [{ game: "live", run_date: DAY, ...run }] : [],
    question_candidates: [
      ...list.map((c) => ({ game: "live", run_date: DAY, status: "received", source: run?.source ?? "chatgpt", created_at: "2026-11-16T00:40:00Z", ...c })),
      ...inReview.map((c) => ({ game: "live", run_date: "2026-11-15", source: "chatgpt", ...c })),
    ],
    question_coverage_areas: AREAS.map((a) => ({ game: "live", ...a })),
    // Read-only here (the fallback brief's examples). Any write to it fails the test: pool separation.
    trivia_questions: [],
  };
  const touched = new Set<string>();
  const rpcs: string[] = [];
  const query = (table: string) => {
    touched.add(table);
    if (!tables[table]) throw new Error(`unexpected table ${table}`);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const builder = {
      select: () => builder,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return builder; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return builder; },
      order: () => builder,
      limit: async () => ({ data: rows(), error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (p: Row) => {
        if (table === "trivia_questions") throw new Error("Live processing wrote trivia_questions");
        patch = p;
        return builder;
      },
      then: (resolve: (v: unknown) => void) => {
        if (!patch) { resolve({ data: rows(), error: null }); return; }
        for (const r of rows()) Object.assign(r, patch);
        resolve({ data: null, error: null });
      },
    };
    return builder;
  };
  return {
    tables, touched, rpcs,
    from: query,
    rpc: async (name: string, args: Row) => {
      rpcs.push(name);
      if (name === "question_subject_stats") return { data: stats, error: null };
      if (name === "question_variety_stats") return { data: { areas: AREAS, cells: [], subjects: [] }, error: null };
      if (name === "question_writer_receive") {
        tables.question_writer_runs.push({ game: "live", run_date: DAY, source: args.p_source, model: args.p_model, received: (args.p_items as Row[]).length });
        (args.p_items as Row[]).forEach((item, i) => tables.question_candidates.push({ id: `fb-${i}`, game: "live", run_date: DAY, status: "received", source: args.p_source, ...item }));
        return { data: { runDate: DAY, received: (args.p_items as Row[]).length, idempotent: false }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
};

const payload = (over: Row = {}): Row => ({
  question: "Which band recorded the 1971 song 'Stairway to Heaven'?", answer: "Led Zeppelin", acceptableAnswers: ["Zeppelin"],
  answerIsPerson: false, category: "Music", area: "Classic rock", era: "1970s", subject: "Led Zeppelin", difficulty: "easy", sourceUrl: null, whyTrue: "Led Zeppelin recorded it in 1971.", ...over,
});
const candidate = (id: string, n: number, p: Row, category = "Music") => ({ id, slot: { n, category, area: null, era: null }, payload: p });
const scorer = (scores: Record<string, number> = {}) => () => ({
  scoreBatch: async (rows: Row[]) => rows.map((r) => ({ id: r.id, audience: { version: "bar-test-live-v1", score: scores[r.question as string] ?? 4, familiar: 4, fun: 4, estCorrect: 40, flags: [] } })),
});
const judge = (verdicts: Record<string, Row> = {}) => () => ({
  check: async (c: Row) => verdicts[c.question as string] ?? { verdict: "distinct", how: "free" },
});
const env = { GEMINI_API_KEY: "test" };
const run = (client: ReturnType<typeof memoryClient>, over: Row = {}) => live.processLiveDay({
  client, today: TODAY, env, corpus: [], createScorer: scorer(), createChecker: judge(), ...over,
});
const statusOf = (client: ReturnType<typeof memoryClient>, id: string) => client.tables.question_candidates.find((c) => c.id === id)!;

describe("processLiveDay", () => {
  it("leaves a passing candidate waiting in Quick Review with its slug, score and tag, and never touches trivia_questions", async () => {
    const client = memoryClient({ list: [candidate("c1", 1, payload())] });
    const report = await run(client);
    expect(report).toMatchObject({ waiting: 1, examined: 1, stopped: null });
    expect(statusOf(client, "c1")).toMatchObject({
      status: "pending_review", question_ref: "which-band-recorded-the-1971-song-stairway-to-heaven", possible_repeat: null,
      tag: { areaId: "l-rock", area: "Classic rock", era: "1970s", subjectKey: "led zeppelin" },
    });
    expect((statusOf(client, "c1").audience as Row).version).toBe("bar-test-live-v1");
    expect([...client.touched].sort()).toEqual(["question_candidates", "question_coverage_areas", "question_writer_runs"]);
  });

  it("rejects on the free gates with reasons", async () => {
    const client = memoryClient({ list: [
      candidate("schema", 1, payload({ answerIsPerson: "no" })),
      candidate("slot", 2, payload(), "Movies"),
      candidate("limit", 3, payload({ question: "Which of these bands recorded 'Stairway to Heaven'?" })),
      candidate("tag", 4, payload({ area: "Disco" })),
    ] });
    const report = await run(client);
    expect(report.rejected).toEqual({ schema: 1, "slot-mismatch": 1, "hard-limit": 1, tag: 1 });
    expect(statusOf(client, "limit").reason).toBe("hard-limit:which-of-these");
    expect(report.stopped).toBe("none-passed-gates");
  });

  it("counts candidates already in review against the star cap", async () => {
    const inReview = Array.from({ length: 2 }, (_, i) => ({ id: `r${i}`, status: i ? "keep" : "pending_review", question_ref: `old-${i}`,
      created_at: "2026-09-01T00:00:00Z", payload: payload({ question: `Older Zeppelin question ${i}?` }), tag: { subjectKey: "led zeppelin" } }));
    const client = memoryClient({ list: [candidate("c1", 1, payload())], inReview, stats: [{ subjectKey: "led zeppelin", count: 3, lastWritten: "2026-01-01T00:00:00Z" }] });
    const report = await run(client);
    expect(report.rejected).toEqual({ "star-cap": 1 });
    expect(statusOf(client, "c1").reason).toBe("star-cap:cap");
  });

  it("sees a question in a Publish PR that isn't merged (pr_open) in the star cap and the repeat corpus (Phase 4c.2)", async () => {
    const waiting = { id: "pr", status: "pr_open", question_ref: "zeppelin-in-pr", pr_url: "https://github.com/o/r/pull/3", created_at: "2026-09-01T00:00:00Z",
      payload: payload({ question: "Which band's fourth album opens with 'Black Dog'?" }), tag: { subjectKey: "led zeppelin" } };
    const published = { ...waiting, id: "done", status: "published", question_ref: "zeppelin-on-main", payload: payload({ question: "Already on main?" }) };
    const capped = memoryClient({ list: [candidate("c1", 1, payload())], inReview: [waiting, published], stats: [{ subjectKey: "led zeppelin", count: 4, lastWritten: "2026-01-01T00:00:00Z" }] });
    expect((await run(capped)).rejected).toEqual({ "star-cap": 1 });

    const slugs: string[] = [];
    const client = memoryClient({ list: [candidate("c1", 1, payload())], inReview: [waiting, published] });
    await run(client, { createChecker: ({ corpus }: { corpus: { list: { slug: string }[] } }) => {
      slugs.push(...corpus.list.map((e) => e.slug));
      return { check: async () => ({ verdict: "distinct", how: "free" }) };
    } });
    expect(slugs).toContain("zeppelin-in-pr");
    expect(slugs).not.toContain("zeppelin-on-main");
  });

  it("rejects below the bar-test threshold and confirmed repeats; flags an uncertain one", async () => {
    const q2 = "Which band recorded the 1975 album 'Physical Graffiti'?";
    const q3 = "Which band recorded the 1973 album 'Houses of the Holy'?";
    const client = memoryClient({ list: [
      candidate("low", 1, payload({ question: "Which band recorded 'Kashmir' in 1975?", subject: "Kashmir" })),
      candidate("dup", 2, payload({ question: q2, subject: "Physical Graffiti" })),
      candidate("maybe", 3, payload({ question: q3, subject: "Houses of the Holy" })),
    ] });
    const report = await run(client, {
      createScorer: scorer({ "Which band recorded 'Kashmir' in 1975?": 2 }),
      createChecker: judge({ [q2]: { verdict: "duplicate", match: { slug: "pg", question: "q", answer: "a" }, how: "gemini" },
        [q3]: { verdict: "uncertain", match: { slug: "hoth", question: "Old HOTH?", answer: "Led Zeppelin" }, how: "gemini" } }),
    });
    expect(report.rejected).toEqual({ "bar-test": 1, repeat: 1 });
    expect(statusOf(client, "dup").reason).toBe("repeat: pg (gemini)");
    expect(statusOf(client, "maybe")).toMatchObject({ status: "pending_review", possible_repeat: { slug: "hoth" } });
    expect(report.possibleRepeats).toBe(1);
  });

  it("stops at one full round (15) a night", async () => {
    const list = Array.from({ length: 17 }, (_, i) => candidate(`c${i}`, i + 1, payload({ question: `Which band recorded song number ${i + 10} on the classic album?`, subject: `Band ${i}` })));
    const client = memoryClient({ list });
    const report = await run(client);
    expect(report.waitingByKind.regular).toBe(15);
    expect(report.skipped).toBe(2);
    expect(client.tables.question_candidates.filter((c) => c.reason === "daily-target")).toHaveLength(2);
  });

  it("writes Current Events with the expiry on the tag", async () => {
    const ce = payload({ question: "In March 2026, which team won the NCAA men's basketball title?", answer: "Florida", acceptableAnswers: ["Gators"],
      category: "Current Events", area: "Sports", era: "2026-03", subject: "NCAA tournament", sourceUrl: "https://example.com/ncaa" });
    const client = memoryClient({ list: [candidate("ce", 1, ce, "Current Events")] });
    const report = await run(client);
    expect(report.waitingByKind.currentEvents).toBe(1);
    expect((statusOf(client, "ce").tag as Row).expiresOn).toBe("2027-03-01");
  });

  it("falls back to Gemini only when the day has no batch", async () => {
    const client = memoryClient({ run: null });
    let briefGame = "";
    const report = await run(client, {
      writeFallback: async ({ brief }: { brief: { game: string; prompts: { slots: Row[] }[] } }) => {
        briefGame = brief.game;
        return { items: [{ slot: { n: 1, category: "Music", area: "Classic rock", era: "1970s" }, payload: payload() }], dollars: 0.01, skipped: ["currentEvents"] };
      },
    });
    expect(briefGame).toBe("live");
    expect(report.source).toBe("gemini-fallback");
    expect(report.waiting).toBe(1);
  });

  it("reads the real Live JSON as its repeat corpus", () => {
    const corpus = live.readLiveCorpus();
    expect(corpus.length).toBeGreaterThan(3000);
    expect(corpus[0]).toEqual(expect.objectContaining({ slug: expect.any(String), question: expect.any(String), answer: expect.any(String), category: expect.any(String) }));
  });
});
