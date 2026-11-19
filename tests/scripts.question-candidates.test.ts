import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Phase 4b nightly processing (docs/speed-trivia-backlog-and-quality-plan.md step 5) with an in-memory client, a fake
// session and a fake bar test. No network, no database.
const require = createRequire(import.meta.url);
type Row = Record<string, unknown>;
type Report = { source: string | null; examined: number; rejected: Record<string, number>; admitted: number; skipped: number;
  admittedByKind: Record<string, number>; stopped: string | null; admittedIds: string[] };
const processing = require("../lib/question-writer/process.cjs") as {
  processSpeedDay: (input: Record<string, unknown>) => Promise<Report>;
};
const map = require("../lib/question-variety/map.cjs") as { isoDay: (d: Date) => string };
const runtimeMeta = require("../lib/speed-trivia-uniqueness/runtime.cjs") as { writerMeta: (meta: unknown) => Record<string, string> };

const TODAY = new Date("2026-11-16T02:20:00Z");
const DAY = map.isoDay(TODAY);
const AREAS = [
  { id: "a-pop", category: "Music", name: "Pop", eras: ["1980s", "1990s"], active: true },
  { id: "a-nfl", category: "Sports", name: "NFL", eras: ["2010s"], active: true },
  { id: "a-ce", category: "Current Events", name: "Sports", eras: ["Past 12 months"], active: true },
];

const memoryClient = ({ run = { source: "chatgpt", model: "gpt-6-astra", received: 1 } as Row | null, list = [] as Row[], stats = [] as Row[] } = {}) => {
  const tables: Record<string, Row[]> = {
    question_writer_runs: run ? [{ game: "speed", run_date: DAY, ...run }] : [],
    question_candidates: list.map(c => ({ game: "speed", run_date: DAY, status: "received", source: run?.source ?? "chatgpt", ...c })),
    question_coverage_areas: AREAS.map(a => ({ game: "speed", ...a })),
    question_tags: [],
    trivia_questions: [],
  };
  const rpcs: { name: string; args: Row }[] = [];
  const query = (table: string) => {
    const filters: [string, unknown][] = [];
    let patch: Row | null = null;
    const rows = () => tables[table].filter(r => filters.every(([k, v]) => r[k] === v));
    const builder = {
      select: () => builder,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return builder; },
      order: () => builder,
      limit: async () => ({ data: rows(), error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (p: Row) => { patch = p; return builder; },
      upsert: async (values: Row[]) => { tables[table].push(...values); return { error: null }; },
      then: (resolve: (v: unknown) => void) => {
        if (!patch) { resolve({ data: rows(), error: null }); return; }
        for (const r of rows()) Object.assign(r, patch);
        resolve({ data: null, error: null });
      },
    };
    return builder;
  };
  return {
    tables, rpcs,
    from: query,
    rpc: async (name: string, args: Row) => {
      rpcs.push({ name, args });
      if (name === "question_subject_stats") return { data: stats, error: null };
      if (name === "speed_trivia_review_set_audience") return { data: { written: 1, skipped: 0 }, error: null };
      if (name === "question_variety_stats") return { data: { areas: AREAS, cells: [], subjects: [] }, error: null };
      if (name === "question_writer_receive") {
        tables.question_writer_runs.push({ game: "speed", run_date: DAY, source: args.p_source, model: args.p_model, received: (args.p_items as Row[]).length });
        (args.p_items as Row[]).forEach((item, i) => tables.question_candidates.push({ id: `fb-${i}`, game: "speed", run_date: DAY, status: "received", source: args.p_source, ...item }));
        return { data: { runDate: DAY, received: (args.p_items as Row[]).length, idempotent: false }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
};

const payload = (over: Row = {}) => ({
  question: "Which singer released 'Like a Virgin' in 1984?", options: ["Madonna", "Cyndi Lauper", "Whitney Houston", "Janet Jackson"],
  correctIndex: 0, category: "Music", area: "Pop", era: "1980s", subject: "Madonna", difficulty: "easy", sourceUrl: null, whyTrue: "Madonna released it in 1984.", ...over,
});
const candidate = (id: string, n: number, p: Row, category = "Music") => ({ id, slot: { n, category, area: null, era: null }, payload: p });

const fakeScorer = (scores: Record<string, number>) => () => ({
  scoreBatch: async (rows: Row[]) => rows.map(r => ({ id: r.id, audience: { version: "bar-test-v2.1", score: scores[r.question as string] ?? 4, familiar: 4, fun: 4, estCorrect: 50, flags: [] } })),
});
const fakeSession = (outcomes: Record<string, string> = {}) => {
  const writes: Row[] = [];
  return {
    writes,
    create: async () => ({
      write: async (input: Row) => {
        writes.push(input);
        const outcome = outcomes[input.question as string];
        if (outcome) throw Object.assign(new Error(`${outcome} message`), { code: outcome });
        return { row: { ...input, created_at: "2026-11-16T02:21:00Z" }, evidence: { contentHash: "c".repeat(64) } };
      },
    }),
  };
};
const env = { SPEED_TRIVIA_MAX_DOLLARS: "0.5", OPENAI_API_KEY: "k" };

describe("nightly processing", () => {
  it("sends the writer's note to the bar test and keeps it in the Speed metadata (D30)", async () => {
    const client = memoryClient({ list: [candidate("c1", 1, payload())] });
    const seen: Row[] = [];
    const scorer = () => ({ scoreBatch: async (rows: Row[]) => { seen.push(...rows); return fakeScorer({})().scoreBatch(rows); } });
    const session = fakeSession();
    await processing.processSpeedDay({ client, today: TODAY, env, createSession: session.create, createScorer: scorer });
    expect(seen).toEqual([expect.objectContaining({ note: "Madonna released it in 1984." })]);
    expect(session.writes[0].writerMeta).toMatchObject({ whyTrue: "Madonna released it in 1984." });
    // The signed envelope's metadata keeps the note (it isn't part of the content key or the payload hash).
    expect(runtimeMeta.writerMeta({ source: "chatgpt", whyTrue: "Madonna released it in 1984.", other: "dropped" }))
      .toEqual({ source: "chatgpt", whyTrue: "Madonna released it in 1984." });
  });

  it("gates, admits through the signed session only, tags and scores", async () => {
    const client = memoryClient({ list: [
      candidate("c1", 1, payload()),
      candidate("c2", 2, payload({ question: "Pop star Madonna sang which 1984 hit?", options: ["Like a Virgin", "Vogue", "Holiday", "Borderline"], subject: "Madonna" })),
      candidate("c3", 3, payload({ question: "Which 1985 song did Whitney Houston take to number one?", options: ["Saving All My Love for You", "I Wanna Dance", "Greatest Love", "So Emotional"], subject: "Whitney Houston", era: "1970s" })),
      candidate("c4", 4, payload({ category: "Sports" })),
      candidate("c5", 5, payload({ question: "Which act topped the charts with 'Walk Like an Egyptian'?", options: ["The Bangles", "The Go-Go's", "Heart", "Blondie"], subject: "The Bangles" })),
    ] });
    const session = fakeSession();
    const report = await processing.processSpeedDay({ client, today: TODAY, env, createSession: session.create,
      createScorer: fakeScorer({ "Which act topped the charts with 'Walk Like an Egyptian'?": 2 }) });
    expect(report.admitted).toBe(1);
    expect(report.rejected).toMatchObject({ "star-cap": 1, tag: 1, "slot-mismatch": 1, "bar-test": 1 });
    expect(session.writes).toHaveLength(1);
    const written = session.writes[0];
    expect(written).toMatchObject({ status: "pending_review", question_pool: "anytime_blitz", primarySubject: "Madonna", subtopic: "Pop" });
    expect(written.writerMeta).toMatchObject({ source: "chatgpt", model: "gpt-6-astra", candidateId: "c1", area: "Pop", era: "1980s",
      whyTrue: "Madonna released it in 1984." });
    expect(written).not.toHaveProperty("note"); // the note rides in the metadata, never in the row
    expect(client.tables.question_tags).toEqual([expect.objectContaining({ game: "speed", subject_key: "madonna", area_id: "a-pop", era: "1980s",
      written_at: "2026-11-16T02:21:00Z", tagged_by: "chatgpt:gpt-6-astra:writer-v5" })]);
    expect(client.rpcs.map(r => r.name)).toEqual(["question_subject_stats", "speed_trivia_review_set_audience"]);
    const byId = new Map(client.tables.question_candidates.map(c => [c.id, c]));
    expect(byId.get("c1")).toMatchObject({ status: "pending_review", question_ref: written.id });
    expect(byId.get("c2")).toMatchObject({ status: "rejected", reason: "star-cap:gap" });
    expect(byId.get("c3")).toMatchObject({ status: "rejected", reason: "tag:invalid-era" });
    expect(byId.get("c4")).toMatchObject({ status: "rejected", reason: "slot-mismatch" });
    expect(byId.get("c5")).toMatchObject({ status: "rejected", reason: "bar-test:2" });
  });

  it("rejects hard-limit breaches and subjects at the cap before any paid call", async () => {
    const client = memoryClient({
      list: [
        candidate("c1", 1, payload({ question: "Madonna is a pop star. Which 1984 hit is hers?" })),
        candidate("c2", 2, payload()),
      ],
      stats: [{ subjectKey: "madonna", count: 5, lastWritten: null }],
    });
    let scored = false;
    const report = await processing.processSpeedDay({ client, today: TODAY, env, createSession: fakeSession().create,
      createScorer: () => ({ scoreBatch: async () => { scored = true; return []; } }) });
    expect(scored).toBe(false);
    expect(report.rejected).toEqual({ "hard-limit": 1, "star-cap": 1 });
    expect(client.tables.question_candidates.map(c => c.reason)).toEqual(["hard-limit:preamble,answer-in-question", "star-cap:cap"]);
  });

  it("records repeats, stops at the delivery target, and writes Current Events expiry + source", async () => {
    const regular = Array.from({ length: 9 }, (_, i) => candidate(`r${i}`, i + 1, payload({
      question: `Which pop act had hit number ${i + 1} of 1985?`, options: [`Act ${i}A`, `Act ${i}B`, `Act ${i}C`, `Act ${i}D`], subject: `Act ${i}`,
    })));
    const ce = candidate("ce", 12, payload({ category: "Current Events", area: "Sports", era: "2026-03", subject: "Title game",
      question: "In March 2026, which team won the title game?", options: ["Team A", "Team B", "Team C", "Team D"],
      sourceUrl: "https://example.com/story" }), "Current Events");
    const client = memoryClient({ list: [...regular, ce] });
    const session = fakeSession({ "Which pop act had hit number 1 of 1985?": "duplicate" });
    const report = await processing.processSpeedDay({ client, today: TODAY, env, createSession: session.create, createScorer: fakeScorer({}) });
    expect(report.admittedByKind).toEqual({ regular: 7, currentEvents: 1 });
    expect(report.rejected).toEqual({ repeat: 1 });
    expect(report.skipped).toBe(1);
    expect(session.writes[0].writerMeta).toMatchObject({ sourceUrl: "https://example.com/story", expiresOn: "2027-03-01", era: "2026-03" });
    expect(session.writes.slice(1).every(w => !(w.writerMeta as Row).sourceUrl && !(w.writerMeta as Row).expiresOn)).toBe(true);
    expect(client.tables.question_candidates.find(c => c.status === "skipped")?.reason).toBe("daily-target");
  });

  it("does nothing without a ChatGPT batch (no fallback writer, D40)", async () => {
    const report = await processing.processSpeedDay({ client: memoryClient({ run: null }), today: TODAY, env });
    expect(report.stopped).toBe("no-candidates");
  });

  it("stops at the budget and leaves the rest skipped, not lost", async () => {
    const list = [1, 2].map(n => candidate(`c${n}`, n, payload({ question: `Which pop act had hit number ${n} of 1986?`, options: ["W", "X", "Y", "Z"], subject: `Act ${n}` })));
    const client = memoryClient({ list });
    const session = fakeSession({ "Which pop act had hit number 1 of 1986?": "budget_exhausted" });
    const report = await processing.processSpeedDay({ client, today: TODAY, env, createSession: session.create, createScorer: fakeScorer({}) });
    expect(report.stopped).toBe("budget");
    expect(client.tables.question_candidates.map(c => [c.status, c.reason])).toEqual([["skipped", "budget"], ["skipped", "budget"]]);
  });

  it("uses the writer's ChatGPT grade and asks the OpenAI API only for ungraded items (D35, 4f.2)", async () => {
    const grade = (over: Row = {}) => ({ version: "bar-test-v6", model: "gpt-6-astra", familiar: 5, fun: 4, estCorrect: 70, flags: [], ...over });
    const client = memoryClient({ list: [
      candidate("g1", 1, { ...payload(), grade: grade() }),
      candidate("g2", 2, { ...payload({ question: "Which act topped the charts with 'Walk Like an Egyptian'?", options: ["The Bangles", "The Go-Go's", "Heart", "Blondie"], subject: "The Bangles" }),
        grade: grade({ familiar: 1, fun: 1, estCorrect: 20, flags: ["possibly-wrong"] }) }),
      candidate("old", 3, { ...payload({ question: "Which 1985 song did Whitney Houston take to number one?", options: ["Saving All My Love for You", "I Wanna Dance", "Greatest Love", "So Emotional"], subject: "Whitney Houston" }),
        grade: grade({ version: "bar-test-v5" }) }),
    ] });
    const seen: Row[] = [];
    const scorer = () => ({ scoreBatch: async (rows: Row[]) => { seen.push(...rows); return fakeScorer({})().scoreBatch(rows); } });
    const session = fakeSession();
    const report = await processing.processSpeedDay({ client, today: TODAY, env, createSession: session.create, createScorer: scorer });
    expect(seen.map(r => r.question)).toEqual(["Which 1985 song did Whitney Houston take to number one?"]);
    expect((report as Report & { graded: Row }).graded).toEqual({ chatgpt: 2, openai: 1 });
    const byId = new Map(client.tables.question_candidates.map(c => [c.id, c]));
    expect(byId.get("g2")).toMatchObject({ status: "rejected", reason: "bar-test:1", audience: expect.objectContaining({ model: "chatgpt:gpt-6-astra:bar-test-v6" }) });
    const set = client.rpcs.filter(r => r.name === "speed_trivia_review_set_audience").map(r => ((r.args.p_rows as Row[])[0].audience as Row));
    expect(set).toContainEqual(expect.objectContaining({ version: "bar-test-v6", model: "chatgpt:gpt-6-astra:bar-test-v6", score: 5 }));
  });

  it("makes no API grading call when every item is graded", async () => {
    const client = memoryClient({ list: [candidate("g1", 1, { ...payload(), grade: { version: "bar-test-v6", model: "gpt-6-astra", familiar: 4, fun: 4, estCorrect: 50, flags: [] } })] });
    const report = await processing.processSpeedDay({ client, today: TODAY, env: { SPEED_TRIVIA_MAX_DOLLARS: "0.5" }, createSession: fakeSession().create,
      createScorer: () => { throw new Error("no API grading expected"); } });
    expect(report.admitted).toBe(1);
  });

  it("never writes trivia_questions except through the signed session", () => {
    const source = readFileSync("lib/question-writer/process.cjs", "utf8");
    expect(source).not.toMatch(/from\(['"]trivia_questions['"]\)/);
    expect(source).not.toMatch(/status:\s*['"]active['"]/);
    expect(source).toContain("session.write(input)");
    const script = readFileSync("scripts/process-question-candidates.cjs", "utf8");
    expect(script).not.toMatch(/trivia_questions/);
  });
});
