#!/usr/bin/env node
// Calibrate the ChatGPT bar test (docs/speed-trivia-backlog-and-quality-plan.md Phase 4d.1, D35) against Andrew's
// decisions, with the same prompt, item format and codex flags the private writer uses. Read-only on the database;
// runs codex locally on Andrew's ChatGPT plan (no API dollars). Writes one JSON report.
//
//   node --env-file=.env.local scripts/calibrate-chatgpt-bar-test.mjs --out docs/<file>.json [--effort medium]
//        [--model gpt-6-astra] [--only speed|live|trial] [--concurrency 3]
//
// Sets: Speed = the Phase 2 calibration rows (200 keep / 19 reject, plus 80 older-deleted and 22 recent-approved for
// the score spread); Live = 50 evenly spaced questions from the Live JSON (all "keep"); trial = the 2026-11-17 writer
// batch (16 Speed incl. 5 Current Events with web search, 24 Live), labelled by Andrew's Quick Review decisions.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { attachGrades, gradeItems, tokensUsed } from "../tools/question-writer/grade.mjs";

const require = createRequire(import.meta.url);
const { clientFromEnv } = require("./lib/speedTriviaServiceClient.cjs");
const speedAudience = require("../lib/speed-trivia-quality/audience.cjs");
const liveAudience = require("../lib/live-trivia-quality/audience.cjs");
const { readLiveCorpus } = require("../lib/question-writer/liveProcess.cjs");

const args = { out: null, effort: "medium", model: "gpt-6-astra", only: null, concurrency: 3 };
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, "");
  args[key] = key === "concurrency" ? Number(process.argv[++i]) : process.argv[++i];
}
if (!args.out) { console.error("--out is required"); process.exit(1); }

const PHASE2 = "docs/speed-trivia-backlog-and-quality-plan_PHASE_2_CALIBRATION_bar-test-v2_gemini-2.5-flash_2026-11-15.json";
const TRIAL_DAY = "2026-11-17";
const BATCH = 40;

const runCodex = ({ prompt, schema, webSearch }) => new Promise((resolve, reject) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grade-"));
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(dir, "schema.json"), JSON.stringify(schema));
  const argv = [...(webSearch ? ["--search"] : []), "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "-C", work, "-m", args.model, "-c", `model_reasoning_effort="${args.effort}"`,
    "--output-schema", path.join(dir, "schema.json"), "-o", path.join(dir, "out.json"), "-"];
  const child = spawn("codex", argv, { stdio: ["pipe", "ignore", "pipe"] });
  let errTail = "";
  child.stderr.on("data", (chunk) => { errTail = (errTail + chunk).slice(-4000); });
  child.on("close", (code) => {
    try {
      if (code !== 0) throw new Error(`codex exited ${code}: ${errTail.slice(-300)}`);
      resolve({ output: JSON.parse(fs.readFileSync(path.join(dir, "out.json"), "utf8")), tokens: tokensUsed(errTail) });
    } catch (error) { reject(error); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  child.stdin.end(prompt);
});

// One job = one grading call: { set, game, kind, entries:[{ id, label, written:{slot,payload}, row }] }.
const jobs = [];
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const speedPayload = (row) => ({ question: row.question, options: row.options, correctIndex: row.correct_answer, category: row.category });

const client = clientFromEnv();
if (!args.only || args.only === "speed") {
  const detail = JSON.parse(fs.readFileSync(PHASE2, "utf8")).detail;
  const ids = detail.map((d) => d.id);
  const rows = [];
  for (const part of chunk(ids, 150)) {
    const { data, error } = await client.from("trivia_questions").select("id, question, options, correct_answer, category, status, question_pool, answer_format").in("id", part);
    if (error) throw new Error(error.message);
    rows.push(...data);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const entries = detail.filter((d) => byId.has(d.id)).map((d, i) => ({ id: d.id, label: d.label, gemini: d.score, row: byId.get(d.id),
    written: { slot: { n: i + 1 }, payload: speedPayload(byId.get(d.id)) } }));
  console.error(`speed: ${entries.length}/${detail.length} rows found`);
  for (const part of chunk(entries, BATCH)) jobs.push({ set: "speed", game: "speed", kind: "regular", entries: part.map((e, i) => ({ ...e, written: { ...e.written, slot: { n: i + 1 } } })) });
}
if (!args.only || args.only === "live") {
  const corpus = readLiveCorpus();
  const step = corpus.length / 50;
  const picked = Array.from({ length: 50 }, (_, i) => corpus[Math.floor(i * step)]);
  const entries = picked.map((q, i) => ({ id: q.slug, label: "keep", row: q,
    written: { slot: { n: i + 1 }, payload: { question: q.question, answer: q.answer, acceptableAnswers: q.acceptableAnswers, category: q.category } } }));
  jobs.push({ set: "live", game: "live", kind: "regular", entries });
}
if (!args.only || args.only === "trial") {
  const { data, error } = await client.from("question_candidates").select("id, game, slot, payload, status, reason, question_ref").eq("run_date", TRIAL_DAY);
  if (error) throw new Error(error.message);
  const refs = data.filter((c) => c.game === "speed" && c.question_ref).map((c) => c.question_ref);
  const { data: marks } = await client.from("speed_trivia_review_marks").select("row_id, decision").in("row_id", refs.length ? refs : ["00000000-0000-0000-0000-000000000000"]);
  const decided = new Map((marks ?? []).map((m) => [m.row_id, m.decision]));
  const label = (c) => {
    if (c.game === "live") return ["keep", "publishing", "pr_open", "published"].includes(c.status) ? "keep" : c.status === "reject" ? "reject" : `unrated:${c.status}`;
    return decided.get(c.question_ref) ?? `unrated:${c.status}`;
  };
  for (const game of ["speed", "live"]) {
    for (const kind of ["regular", "currentEvents"]) {
      const list = data.filter((c) => c.game === game && (c.slot.category === "Current Events") === (kind === "currentEvents"));
      if (!list.length) continue;
      jobs.push({ set: "trial", game, kind, entries: list.map((c) => ({ id: c.id, label: label(c), reason: c.reason, row: { id: c.id, ...c.payload },
        written: { slot: c.slot, payload: c.payload } })) });
    }
  }
}

const today = new Date();
const results = [];
const failures = [];
let tokens = 0;
const queue = [...jobs];
const worker = async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const scorer = job.game === "live" ? liveAudience : speedAudience;
    const block = scorer.gradeBlock({ kind: job.kind, today });
    const written = job.entries.map((e) => ({ ...e.written }));
    try {
      const result = await runCodex({ prompt: `${block.prompt}\n${JSON.stringify(gradeItems(written, block.fields))}`, schema: block.schema, webSearch: block.webSearch });
      tokens += result.tokens ?? 0;
      attachGrades(written, result.output, block.version);
      job.entries.forEach((e, i) => {
        const grade = scorer.writerGrade({ ...written[i].grade, model: args.model });
        if (!grade) { failures.push({ set: job.set, id: e.id, error: "no-or-invalid-grade" }); return; }
        const row = job.game === "live" ? e.row : { ...e.row, status: e.row.status ?? "pending_review", question_pool: "anytime_blitz", answer_format: "multiple_choice",
          options: e.row.options ?? e.written.payload.options, correct_answer: e.row.correct_answer ?? e.written.payload.correctIndex };
        const audience = scorer.audienceFromWriter(row, grade);
        results.push({ set: job.set, game: job.game, kind: job.kind, id: e.id, label: e.label, gemini: e.gemini ?? null, reason: e.reason ?? null,
          question: e.written.payload.question, score: audience.score, familiar: audience.familiar, fun: audience.fun, estCorrect: audience.estCorrect, flags: audience.flags });
      });
      console.error(`${job.set} ${job.game} ${job.kind}: ${job.entries.length} graded (${result.tokens ?? "?"} tokens)`);
    } catch (error) {
      failures.push({ set: job.set, ids: job.entries.map((e) => e.id), error: String(error.message ?? error) });
      console.error(`${job.set} ${job.game} ${job.kind}: FAILED ${error.message}`);
    }
  }
};
await Promise.all(Array.from({ length: args.concurrency }, worker));

const confusion = (list) => [2, 3, 4].map((t) => {
  const cell = { threshold: `score <= ${t}`, keepLost: 0, keepTotal: 0, rejectCaught: 0, rejectTotal: 0 };
  for (const r of list) {
    if (r.label === "keep") { cell.keepTotal++; if (r.score <= t) cell.keepLost++; }
    if (r.label === "reject") { cell.rejectTotal++; if (r.score <= t) cell.rejectCaught++; }
  }
  return cell;
});
const spread = (list) => list.reduce((acc, r) => { acc[r.score]++; return acc; }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
const bySet = {};
for (const set of ["speed", "live", "trial"]) {
  const list = results.filter((r) => r.set === set);
  if (!list.length) continue;
  const byLabel = {};
  for (const label of [...new Set(list.map((r) => r.label))]) byLabel[label] = spread(list.filter((r) => r.label === label));
  bySet[set] = { count: list.length, confusion: confusion(list), byLabel };
}
const report = { model: `chatgpt:${args.model}`, effort: args.effort, versions: { speed: speedAudience.GRADE_VERSION, live: liveAudience.GRADE_VERSION },
  ranAt: today.toISOString(), tokens, failures, bySet, detail: results };
fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ tokens, failures: failures.length, bySet: Object.fromEntries(Object.entries(bySet).map(([k, v]) => [k, { count: v.count, confusion: v.confusion, byLabel: v.byLabel }])) }, null, 1));
