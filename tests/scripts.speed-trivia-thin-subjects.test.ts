import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";

// Phase 4a.2 (D26) fact cleanup script with fake clients and a fake ChatGPT. No network, no Supabase.
const require = createRequire(import.meta.url);
type Row = { id: string; live: boolean; score: number | null; answer: string; question: string; createdAt: string; contentHash: string };
type Kept = Row & { fact: string; kind: string; known: number; onlyKept?: boolean };
type Dropped = Kept & { reason: string; keptId: string | null; status: string };
type Group = { ids: string[]; best: string; known: number; kind: string; fact: string };
type Subject = { key: string; total: number; live: number; sorted: boolean; keep: Kept[]; drop: Dropped[] };
type Bank = { questions: Record<string, unknown>[]; tags: Record<string, unknown>[]; marks: Record<string, unknown>[] };
type Grouped = { groups: Map<string, Row[]>; names: Map<string, string> };
type FactIn = { rows: number[]; fact: string; known: number; kind: string; best: number };
const thin = require("../scripts/speed-trivia-thin-subjects.cjs") as {
  CAP: number;
  VERSION: string;
  KNOWN_MIN: number;
  audienceKey: (row: Record<string, unknown>) => string;
  aliasMap: (aliases: Record<string, string[]>) => Map<string, string>;
  groupBank: (bank: Bank, aliases?: Map<string, string>, scores?: Record<string, unknown>) => Grouped;
  subjectSig: (rows: Row[]) => string;
  promptRows: (rows: Row[]) => Row[];
  checkFacts: (rows: Row[], facts: unknown) => Group[] | null;
  applyFactRules: (rows: Row[], groups: Group[]) => { keep: Kept[]; drop: Dropped[] };
  buildPlan: (grouped: Grouped, facts?: Record<string, { sig: string; groups: Group[] }>) => Subject[];
  spotSubjects: (subjects: Subject[]) => Subject[];
  factPrompt: (units: { subject: string; rows: Row[] }[]) => string;
  factBatches: (units: { rows: unknown[] }[]) => unknown[][];
  aliasCandidates: (groups: Map<string, Row[]>) => [string, string][];
  aliasesFrom: (pairs: [string, string][], verdicts: boolean[], groups: Map<string, Row[]>) => Record<string, string[]>;
  sortFacts: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  makePlan: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  applyPlan: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  undoRun: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  reconcilePlan: (plan: { subjects: { key: string; keep: { id: string }[]; drop: { id: string; keptId: string | null }[] }[] }, retired: Set<string>) =>
    { restore: string[]; retireFirst: { id: string }[]; retireAfter: { id: string }[]; unexpected: string[] };
};

const uuid = (n: number) => `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const question = (n: number, status: string, category = "Animals") => ({
  id: uuid(n), status, question: `Fact ${n}?`, options: [`Answer ${n}`, "B", "C", "D"], correct_answer: 0, category,
  image_url: null, image_context: null, question_pool: "anytime_blitz", answer_format: "multiple_choice", created_at: `2026-0${1 + (n % 9)}-01T00:00:00Z`,
});
const tag = (n: number, subject: string) => ({ question_ref: uuid(n), category: "Animals", subject, subject_key: subject.toLowerCase().replace(/^the /, "") });
const mark = (q: Record<string, unknown>, score: number) => ({ row_id: q.id, decision: null, audience: { key: thin.audienceKey(q), score } });

/** 3 live + 6 waiting chameleons (scores 5,5,5,4,4,2), 2 koalas; "Sahara Desert" splits from "Sahara". */
const fixture = (): Bank => {
  const questions = [
    ...[1, 2, 3].map(n => question(n, "active")),
    ...[4, 5, 6, 7, 8, 9].map(n => question(n, "pending_review")),
    question(10, "pending_review"), question(11, "active"),
    ...[12, 13, 14, 15].map(n => question(n, "pending_review", "Geography")), question(16, "active", "Geography"), question(17, "pending_review", "Geography"),
  ];
  const tags = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => tag(n, "Chameleon")), tag(10, "Koala"), tag(11, "Koala"),
    ...[12, 13, 14, 15].map(n => tag(n, "Sahara")), tag(16, "Sahara Desert"), tag(17, "Sahara Desert"),
  ];
  const scores: Record<number, number> = { 4: 5, 5: 5, 6: 5, 7: 4, 8: 4, 9: 2, 12: 3, 13: 3, 14: 3, 15: 3, 17: 3 };
  const marks = Object.entries(scores).map(([n, s]) => mark(questions.find(q => q.id === uuid(Number(n)))!, s));
  return { questions, tags, marks };
};

/** A fake Supabase: reads from the bank; records tag updates and RPC calls in order. */
const fakeClient = (bank: Bank, calls: string[] = []) => {
  const read = (table: string) => {
    const rows = table === "trivia_questions" ? bank.questions : table === "question_tags" ? bank.tags : bank.marks;
    const chain = { select: () => chain, eq: () => chain, in: () => chain, not: () => chain, order: () => chain,
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }) };
    return chain;
  };
  return {
    calls,
    from: (table: string) => ({
      ...read(table),
      update: (patch: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain = { eq: (k: string, v: unknown) => { filters[k] = v; if (Object.keys(filters).length === 3) {
          calls.push(`tag:${filters.question_ref}:${patch.subject_key}`);
          const t = bank.tags.find(x => x.question_ref === filters.question_ref && x.subject_key === filters.subject_key);
          if (t) Object.assign(t, patch);
          return Promise.resolve({ error: null });
        } return chain; } };
        return chain;
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`);
      if (name === "speed_trivia_fact_retire") {
        const rows = args.p_rows as { id: string }[];
        for (const r of rows) { const q = bank.questions.find(x => x.id === r.id); if (q) q.status = "deleted"; }
        return { data: { retired: rows.map(r => r.id), skipped: [] }, error: null };
      }
      if (name === "speed_trivia_subject_cap_undo") return { data: { restored: (args.p_row_ids as string[]).map(id => ({ id, status: "pending_review" })), skipped: [] }, error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    },
  };
};

const row = (n: number, live: boolean, score: number | null = null): Row =>
  ({ id: uuid(n), live, score, answer: `A${n}`, question: `Q${n}?`, createdAt: `2026-01-${String(n).padStart(2, "0")}`, contentHash: `h${n}` });
const group = (ns: number[], known: number, kind: string, fact: string, best = ns[0]): Group =>
  ({ ids: ns.map(uuid), best: uuid(best), known, kind, fact });

/** A fake ChatGPT: in every subject, questions 1-2 are one well-known fact, and each other question its own fact. */
const fakeFacts = (prompt: string) => prompt.split("\n").filter(l => l.startsWith('{"s":'))
  .map(l => JSON.parse(l) as { s: number; questions: { n: number }[] })
  .map(u => ({ s: u.s, facts: [
    { rows: u.questions.slice(0, 2).map(q => q.n), fact: "The famous one", known: 5, kind: "science_nature", best: 2 },
    ...u.questions.slice(2).map(q => ({ rows: [q.n], fact: `Fact ${q.n}`, known: q.n % 2 ? 2 : 4, kind: ["history", "geography", "culture", "people"][q.n % 4], best: q.n })),
  ] }));

describe("Phase 4a.2 fact cleanup (D26)", () => {
  it("checks the model's sort: every question in exactly one fact, valid fields, best inside its fact", () => {
    const rows = [row(3, false), row(1, true), row(2, false)];
    // Prompt order is by createdAt: n=1 is row 1.
    expect(thin.promptRows(rows).map(r => r.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    const ok = (facts: FactIn[]) => thin.checkFacts(rows, facts);
    const good: FactIn[] = [{ rows: [1, 3], fact: "Deaf", known: 5, kind: "people", best: 3 }, { rows: [2], fact: "Fifth", known: 4, kind: "culture", best: 2 }];
    expect(ok(good)).toEqual([group([1, 3], 5, "people", "Deaf", 3), group([2], 4, "culture", "Fifth")]);
    expect(ok([good[0]])).toBeNull(); // question 2 missing
    expect(ok([good[0], { ...good[1], rows: [2, 3] }])).toBeNull(); // question 3 twice
    expect(ok([good[0], { ...good[1], kind: "music" }])).toBeNull();
    expect(ok([good[0], { ...good[1], known: 6 }])).toBeNull();
    expect(ok([{ ...good[0], best: 2 }, good[1]])).toBeNull();
    expect(ok([good[0], { ...good[1], rows: [4] }])).toBeNull();
    expect(thin.checkFacts(rows, null)).toBeNull();
  });

  it("Beethoven: one question per fact (live first, then the clearest); a less-known fact is kept on multiple choice", () => {
    const rows = [row(1, true, 3), row(2, true, 5), row(3, false, 5), row(4, false, 4), row(5, true, 5)];
    const { keep, drop } = thin.applyFactRules(rows, [
      group([1, 2, 3], 5, "people", "He went deaf", 1), // 1 is live and the clearest: it beats 2's higher score
      group([4], 4, "culture", "Fifth Symphony opening"),
      group([5], 2, "people", "Born in Bonn"), // less-known: kept (Andrew, 2026-11-16: Speed is multiple choice)
    ]);
    expect(keep.map(r => r.id)).toEqual([uuid(1), uuid(4), uuid(5)]);
    const why = Object.fromEntries(drop.map(r => [r.id, [r.reason, r.keptId]]));
    expect(why).toEqual({ [uuid(2)]: ["same-fact", uuid(1)], [uuid(3)]: ["same-fact", uuid(1)] });
  });

  it("Koala: different kinds of knowledge first, then other well-known facts of a kind already kept", () => {
    const rows = [row(1, false), row(2, false), row(3, false), row(4, false), row(5, false), row(6, false), row(7, true)];
    const { keep, drop } = thin.applyFactRules(rows, [
      group([1], 5, "science_nature", "Eats eucalyptus"),
      group([2], 4, "science_nature", "Has a pouch"),
      group([3], 3, "science_nature", "Fingerprints like ours"),
      group([4], 4, "geography", "Lives in Australia"),
      group([5], 4, "science_nature", "Sleeps 20 hours"),
      group([6], 4, "words_names", "Not a bear"),
      group([7], 3, "culture", "Mascot of an airline"), // live: a live fact ranks first
    ]);
    // Spread: culture (live), science (best known), geography, words; then the best other science fact fills the 5th place.
    expect(keep.map(r => r.id)).toEqual([uuid(1), uuid(2), uuid(4), uuid(6), uuid(7)]);
    expect(drop.map(r => [r.id, r.reason])).toEqual([[uuid(3), "ceiling"], [uuid(5), "ceiling"]]);
  });

  it("a waiting question keeps a fact only when no live question asks it; knowable facts fill the places under 5; specialist-only facts go", () => {
    const rows = [row(1, false, 5), row(2, false, 3), row(3, true, 2)];
    expect(thin.applyFactRules(rows, [group([1, 2, 3], 5, "science_nature", "Changes color", 1)]).keep.map(r => r.id)).toEqual([uuid(3)]);
    // Known 2 is knowable on multiple choice (kept); known 1 is specialist-only (dropped).
    const { keep, drop } = thin.applyFactRules(rows, [group([1, 2], 2, "science_nature", "Tongue", 2), group([3], 1, "science_nature", "Hyoid bone")]);
    expect(keep.map(r => r.id)).toEqual([uuid(2)]);
    expect(Object.fromEntries(drop.map(r => [r.id, [r.reason, r.keptId]]))).toEqual({ [uuid(1)]: ["same-fact", uuid(2)], [uuid(3)]: ["little-known", null] });
    // Only specialist-only facts: the best-known one is kept so the subject isn't empty (Andrew, 2026-11-16).
    const only = thin.applyFactRules(rows, [group([1, 2], 1, "science_nature", "A", 2), group([3], 1, "science_nature", "B")]);
    expect(only.keep.map(r => [r.id, r.onlyKept])).toEqual([[uuid(3), true]]);
    // Well-known facts take the places first.
    const many = Array.from({ length: 7 }, (_, i) => row(i + 1, false));
    const ruled = thin.applyFactRules(many, many.map((r, i) => group([i + 1], i === 0 ? 2 : 4, "other", `F${i}`)));
    expect(ruled.keep).toHaveLength(thin.CAP);
    expect(ruled.drop.map(r => [r.id, r.reason])).toContainEqual([uuid(1), "ceiling"]);
  });

  it("5 is a ceiling: facts past 5 are dropped, live facts and better-known facts first", () => {
    const kinds = ["geography", "history", "science_nature", "culture", "sports", "people", "words_names"];
    const rows = kinds.map((_, i) => row(i + 1, i === 6));
    const { keep, drop } = thin.applyFactRules(rows, kinds.map((k, i) => group([i + 1], i < 2 ? 3 : 4, k, k)));
    expect(keep).toHaveLength(thin.CAP);
    expect(keep.map(r => r.kind).sort()).toEqual(["culture", "people", "science_nature", "sports", "words_names"]);
    expect(drop.map(r => r.reason)).toEqual(["ceiling", "ceiling"]);
  });

  it("reconcile: restores what the new plan keeps, retires what the run missed, and waits for a kept question to come back", () => {
    const plan = { subjects: [{ key: "k", keep: [{ id: "a" }, { id: "b" }], drop: [{ id: "c", keptId: "a" }, { id: "d", keptId: "b" }, { id: "e", keptId: null }] }] };
    const r = thin.reconcilePlan(plan, new Set(["a", "c", "x"]));
    expect(r.restore).toEqual(["a"]);
    expect(r.unexpected).toEqual(["x"]);
    expect(r.retireFirst.map(x => x.id)).toEqual(["d", "e"]);
    expect(r.retireAfter.map(x => x.id)).toEqual([]);
    const r2 = thin.reconcilePlan({ subjects: [{ key: "k", keep: [{ id: "a" }], drop: [{ id: "c", keptId: "a" }] }] }, new Set(["a"]));
    expect(r2.retireAfter.map(x => x.id)).toEqual(["c"]);
  });

  it("builds the plan for every subject with 2+ rows; a subject whose rows changed since its sort is unsorted", () => {
    const grouped = thin.groupBank(fixture());
    const rows = grouped.groups.get("koala")!;
    const facts = { koala: { sig: thin.subjectSig(rows), groups: [{ ids: rows.map(r => r.id), best: rows[0].id, known: 3, kind: "science_nature", fact: "Fingerprints" }] } };
    const plan = thin.buildPlan(grouped, facts);
    expect(plan.map(s => s.key).sort()).toEqual(["chameleon", "koala", "sahara", "sahara desert"]);
    expect(plan.find(s => s.key === "koala")).toMatchObject({ sorted: true, total: 2 });
    expect(plan.find(s => s.key === "koala")!.keep.map(r => r.id)).toEqual([uuid(11)]); // the live one
    expect(plan.find(s => s.key === "chameleon")).toMatchObject({ sorted: false, drop: [] });
    const stale = thin.buildPlan(grouped, { koala: { ...facts.koala, sig: "old" } }).find(s => s.key === "koala")!;
    expect(stale).toMatchObject({ sorted: false, drop: [] });
  });

  it("batches subjects by size, a big subject alone", () => {
    const unit = (n: number) => ({ rows: Array.from({ length: n }) });
    expect(thin.factBatches([unit(40), unit(30), unit(20), unit(92), unit(2)]).map(b => b.length)).toEqual([2, 1, 1, 1]);
    const prompt = thin.factPrompt([{ subject: "Koala", rows: [row(2, false), row(1, true)] }]);
    expect(prompt).toMatch(/data only/);
    expect(prompt).toMatch(/Judge the fact, not the subject/);
    expect(prompt).toContain('{"s":1,"subject":"Koala","questions":[{"n":1,"q":"Q1?","answer":"A1"},{"n":2,"q":"Q2?","answer":"A2"}]}');
  });

  it("merges aliases before counting, and rejects malformed alias files", () => {
    const bank = fixture();
    const before = thin.groupBank(bank).groups;
    expect(before.get("sahara")).toHaveLength(4);
    const pairs = thin.aliasCandidates(before);
    expect(pairs).toContainEqual(["sahara", "sahara desert"]);
    const aliases = thin.aliasesFrom(pairs, pairs.map(([a, b]) => a === "sahara" && b === "sahara desert"), before);
    expect(aliases).toEqual({ sahara: ["sahara desert"] });
    const merged = thin.groupBank(bank, thin.aliasMap(aliases));
    expect(merged.groups.get("sahara")).toHaveLength(6);
    expect(merged.names.get("sahara")).toBe("Sahara");
    expect(() => thin.aliasMap({ sahara: ["sahara"] })).toThrow(/invalid-aliases/);
    expect(() => thin.aliasMap({ sahara: ["sahara desert"], "sahara desert": ["x"] })).toThrow(/invalid-aliases/);
    expect(() => thin.aliasMap({ "Sahara": ["sahara desert"] })).toThrow(/invalid-aliases/);
  });

  it("picks the spot check: every subject with 41+ rows, 6 with 6-40 and 6 with 2-5, the same each time", () => {
    const subjects = Array.from({ length: 40 }, (_, i) => ({ key: `s${i}`, total: i < 3 ? 50 + i : i < 20 ? 6 : 2, live: 0, sorted: true, keep: [], drop: [] }));
    const spot = thin.spotSubjects(subjects);
    expect(spot).toHaveLength(15);
    expect(spot.slice(0, 3).map(s => s.key)).toEqual(["s0", "s1", "s2"]);
    expect(spot.slice(9).every(s => s.total === 2)).toBe(true);
    expect(thin.spotSubjects(subjects).map(s => s.key)).toEqual(spot.map(s => s.key));
  });

  it("sorts facts with ChatGPT (checked, cached, a bad answer asked again alone), then plans, applies and undoes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "thin-"));
    const bank = fixture();
    const aliasesFile = join(dir, "aliases.json");
    writeFileSync(aliasesFile, JSON.stringify({ aliases: { sahara: ["sahara desert"] } }));
    const factsFile = join(dir, "facts.json");
    const planFile = join(dir, "plan.json");
    const client = fakeClient(bank);
    const prompts: string[] = [];
    let breakKoala = true;
    const call = async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt);
      const items = fakeFacts(prompt);
      // The first answer for Koala leaves a question out; asked alone, it's answered properly.
      if (breakKoala && prompt.includes('"subject":"Koala"') && items.length > 1) {
        breakKoala = false;
        const k = items.find(i => prompt.split("\n").find(l => l.startsWith(`{"s":${i.s},`))!.includes("Koala"))!;
        k.facts = [{ ...k.facts[0], rows: [1] }];
      }
      return { output: { items }, tokens: 10 };
    };
    const sorted = await thin.sortFacts({ client, out: factsFile, aliasesFile, call });
    expect(sorted).toMatchObject({ toSort: 3, sorted: 3, failed: 0, stopped: null });
    expect(prompts).toHaveLength(2);
    // Cached: nothing left to ask.
    expect(await thin.sortFacts({ client, out: factsFile, aliasesFile, call })).toMatchObject({ toSort: 0 });
    expect(prompts).toHaveLength(2);

    const result = await thin.makePlan({ client, out: planFile, aliasesFile, factsFile, spotFile: join(dir, "spot.md") });
    expect(result).toMatchObject({ complete: true, unsorted: 0 });
    const plan = JSON.parse(readFileSync(planFile, "utf8")) as { subjects: Subject[]; totals: Record<string, unknown>; aliases: unknown[] };
    const chameleon = plan.subjects.find(s => s.key === "chameleon")!;
    // Chameleon: the two earliest questions are one fact (one kept, the other same-fact); the rest each its own fact.
    const repeat = chameleon.drop.find(r => r.reason === "same-fact")!;
    expect(chameleon.keep.map(r => r.id)).toContain(repeat.keptId);
    expect(chameleon.drop.some(r => r.reason === "ceiling")).toBe(true); // 8 facts, 5 kept
    expect(chameleon.keep.length).toBeLessThanOrEqual(thin.CAP);
    expect(plan.aliases).toEqual([{ from: "sahara desert", to: "sahara", rows: 2 }]);
    expect(readFileSync(join(dir, "spot.md"), "utf8")).toMatch(/## Chameleon — 9 \(3 live, 6 waiting\)/);
    const drops = plan.subjects.flatMap(s => s.drop).length;

    expect(await thin.applyPlan({ client, planFile, logDir: dir })).toMatchObject({ mode: "check", drops, changedSinceDryRun: 0, aliasTagUpdates: 2 });
    expect(client.calls).toEqual([]);
    const applied = await thin.applyPlan({ client, planFile, logDir: dir, yes: true, runId: "82000000-0000-4000-8000-999999999999" });
    expect(applied).toMatchObject({ mode: "apply", retired: drops, skipped: 0 });
    expect(client.calls.indexOf("rpc:speed_trivia_fact_retire")).toBeGreaterThan(client.calls.lastIndexOf(client.calls.filter(c => c.startsWith("tag:")).at(-1)!));
    const log = JSON.parse(readFileSync(String(applied.logFile), "utf8")) as { rows: { id: string; reason: string; keptId: string | null; contentHash: string }[] };
    expect(String(applied.logFile)).toMatch(/_PHASE_4A2_THIN_LOG_/);
    expect(log.rows.find(r => r.id === repeat.id)).toMatchObject({ reason: "same-fact", keptId: repeat.keptId });
    expect(log.rows.every(r => r.contentHash === core.contentHash(bank.questions.find(q => q.id === r.id) as never))).toBe(true);
    await expect(thin.applyPlan({ client, planFile, logDir: dir, yes: true })).rejects.toThrow(/undo log already exists/);

    expect(await thin.undoRun({ client, logFile: applied.logFile, yes: true })).toMatchObject({ mode: "undo", restored: drops, skipped: 0 });
    expect(bank.tags.filter(t => t.subject_key === "sahara desert")).toHaveLength(2);
  });

  it("refuses to apply an incomplete plan, and to mix fact files from another rules version", async () => {
    const dir = mkdtempSync(join(tmpdir(), "thin-"));
    const planFile = join(dir, "plan.json");
    writeFileSync(planFile, JSON.stringify({ version: thin.VERSION, complete: false, subjects: [], aliases: [] }));
    await expect(thin.applyPlan({ client: fakeClient(fixture()), planFile })).rejects.toThrow(/plan-incomplete/);
    const factsFile = join(dir, "facts.json");
    writeFileSync(factsFile, JSON.stringify({ version: "facts-v0", facts: {} }));
    await expect(thin.sortFacts({ client: fakeClient(fixture()), out: factsFile, call: async () => ({ output: { items: [] } }) })).rejects.toThrow(/facts-version-mismatch/);
  });
});
