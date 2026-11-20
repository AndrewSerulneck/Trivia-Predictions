// Helpers for write.mjs (private repo; docs/speed-trivia-backlog-and-quality-plan.md Phase 4d.1 in the main repo).
// Node built-ins only, so the main repo's tests (and scripts/calibrate-chatgpt-bar-test.mjs) can import them.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CODEX_TIMEOUT_MS = 15 * 60_000;
const LOGIN = /log ?in|logged ?in|401|unauthori[sz]ed|refresh token/i;
// codex's own error lines ("ERROR: ...", optionally after a "[timestamp]" or "2026-11-20T15:33:16.75Z"; seen on codex
// 0.163.0 signed out). The echoed prompt never starts a line like this: our rubric lines don't, and the questions follow
// as one JSON line (Phase 7h, R2 #25.1).
const ERROR_LINE = /^[ \t]*(?:\[[^\]\n]*\][ \t]*|\d{4}-\d\d-\d\dT\S*[ \t]+)?error\b.*$/gim;

/** True when codex's own error lines (not the prompt it echoes) say the ChatGPT login failed. */
export const isLoginFailure = (output) => (String(output).match(ERROR_LINE) ?? []).some((line) => LOGIN.test(line));

/**
 * One `codex exec` on the ChatGPT plan login: { prompt, schema, webSearch, model, effort } -> { output, tokens }.
 * Killed after `timeoutMs`. Rejects with error.login = true only for a login failure (see isLoginFailure); a usage
 * limit, a timeout or any other non-zero exit is an ordinary error. `spawnImpl` is for tests.
 */
export const runCodex = ({ prompt, schema, webSearch, model, effort, timeoutMs = CODEX_TIMEOUT_MS, spawnImpl = spawn }) => new Promise((resolve, reject) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "writer-"));
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(dir, "schema.json"), JSON.stringify(schema));
  const args = [...(webSearch ? ["--search"] : []), "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "-C", work, "-m", model, "-c", `model_reasoning_effort="${effort}"`,
    "--output-schema", path.join(dir, "schema.json"), "-o", path.join(dir, "out.json"), "-"];
  let child;
  try { child = spawnImpl("codex", args, { stdio: ["pipe", "pipe", "pipe"] }); } catch (error) { fs.rmSync(dir, { recursive: true, force: true }); reject(error); return; }
  let log = "";
  let errTail = "";
  let tokens = null;
  let timedOut = false;
  const keep = (chunk) => { log = (log + chunk).slice(-4000); };
  child.stdout.on("data", keep);
  // "tokens used" is on stderr; a long answer on stdout used to push it out of the shared tail (Live logged 0).
  child.stderr.on("data", (chunk) => { keep(chunk); errTail = (errTail + chunk).slice(-4000); tokens = tokensUsed(errTail) ?? tokens; });
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
  let settled = false;
  const done = (fn) => { if (settled) return; settled = true; clearTimeout(timer); try { fn(); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
  child.on("error", (error) => done(() => reject(error)));
  child.on("close", (code) => done(() => {
    try {
      if (timedOut) throw new Error(`codex timed out after ${Math.round(timeoutMs / 60_000)} minutes.`);
      if (code !== 0 && isLoginFailure(log)) { const e = new Error("ChatGPT login failed."); e.login = true; throw e; }
      if (code !== 0) throw new Error(/usage limit/i.test(log) ? "ChatGPT usage limit reached." : `codex exited ${code}.`);
      const out = path.join(dir, "out.json");
      if (!fs.existsSync(out)) throw new Error("codex returned no answer.");
      resolve({ output: JSON.parse(fs.readFileSync(out, "utf8")), tokens });
    } catch (error) { reject(error); }
  }));
  child.stdin.end(prompt);
});

/**
 * The written items a codex answer holds: [{ slot, payload }] for the prompt's slots, the first item per slot number
 * only (grades are matched by slot, R2 #25.2). `seen` is shared across a game's prompts. Returns { written, dropped }.
 */
export const writtenItems = (output, slots, seen = new Set()) => {
  const bySlot = new Map((Array.isArray(slots) ? slots : []).map((slot) => [slot.n, slot]));
  const written = [];
  let dropped = 0;
  for (const payload of Array.isArray(output?.items) ? output.items : []) {
    const slot = bySlot.get(payload?.slot);
    if (!slot) continue;
    if (seen.has(slot.n)) { dropped++; continue; }
    seen.add(slot.n);
    written.push({ slot, payload });
  }
  return { written, dropped };
};

/**
 * The questions sent to the grader: { n, ...the brief's fields } per written item. For multiple choice, `answer` is
 * the marked option. Nulls are left out (regular questions have no sourceUrl).
 */
export const gradeItems = (items, fields) => items.map(({ slot, payload }) => {
  const source = { ...payload };
  if (Array.isArray(payload.options) && Number.isInteger(payload.correctIndex)) source.answer = payload.options[payload.correctIndex];
  const item = { n: slot.n };
  for (const field of fields) if (source[field] != null) item[field] = source[field];
  return item;
});

/**
 * Puts each grade on its item ({ version, familiar, fun, estCorrect, flags }), matched by slot number. Returns how
 * many items got one. The site re-checks every grade; an item without one is graded through the OpenAI API.
 */
export const attachGrades = (items, output, version) => {
  const bySlot = new Map();
  for (const grade of Array.isArray(output?.grades) ? output.grades : []) {
    if (Number.isInteger(grade?.n) && !bySlot.has(grade.n)) bySlot.set(grade.n, grade);
  }
  let graded = 0;
  for (const item of items) {
    const grade = bySlot.get(item.slot.n);
    if (!grade) continue;
    item.grade = { version, familiar: grade.familiar, fun: grade.fun, estCorrect: grade.estCorrect, flags: grade.flags };
    graded++;
  }
  return graded;
};

/** codex prints "tokens used\n12,345" on stderr, after the answer; null when absent. */
export const tokensUsed = (stderr) => {
  const match = /tokens used\s+([\d,]+)/i.exec(stderr);
  return match ? Number(match[1].replace(/,/g, "")) || null : null;
};

const CONVERSION_FIELDS = ["question", "answer", "acceptableAnswers", "answerIsPerson", "category", "area", "era", "subject",
  "difficulty", "sourceUrl", "whyTrue"];

/**
 * Phase 4e (D37): the conversion prompt's answers, matched to their requests by n (`conversions` = the brief's
 * [{ n, requestId }]). Returns { rewrites: [{ slot:{n}, requestId, payload }], declines: [{ requestId, reason }] }.
 * Unknown or repeated n are dropped. The site re-validates everything.
 */
export const conversionItems = (output, conversions) => {
  const byN = new Map((Array.isArray(conversions) ? conversions : []).map((c) => [c.n, c.requestId]));
  const done = new Set();
  const rewrites = [];
  const declines = [];
  for (const item of Array.isArray(output?.items) ? output.items : []) {
    const requestId = byN.get(item?.n);
    if (!requestId || done.has(item.n)) continue;
    done.add(item.n);
    if (item.declined === true) { declines.push({ requestId, reason: typeof item.reason === "string" ? item.reason : "" }); continue; }
    const payload = {};
    for (const field of CONVERSION_FIELDS) payload[field] = item[field] ?? null;
    rewrites.push({ slot: { n: item.n }, requestId, payload });
  }
  return { rewrites, declines };
};

/** The conversions post body's items: rewrites (with any grade) and declines. */
export const conversionPost = ({ rewrites, declines }) => [
  ...rewrites.map(({ requestId, payload, grade }) => ({ requestId, payload, ...(grade ? { grade } : {}) })),
  ...declines.map(({ requestId, reason }) => ({ requestId, declined: true, reason })),
];
