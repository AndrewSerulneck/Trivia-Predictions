#!/usr/bin/env node
// Daily question writer (private repo; docs/speed-trivia-backlog-and-quality-plan.md Phase 4b in the main repo).
// GET the brief -> one `codex exec` per prompt (ChatGPT plan login; web search only for Current Events) -> one more,
// separate `codex exec` per prompt grades what was written (the bar test, D35; same search rule) -> POST.
// Live briefs may add a `conversion` prompt (Phase 4e, D37): queued Speed questions rewritten as Live ones (or
// declined), graded the same way, then posted to /api/question-writer/conversions after the day's batch.
// No dependencies besides grade.mjs. Never prints the login, the token or the questions. Exit codes: 1 failure,
// 2 token rejected, 3 ChatGPT login needs renewing (run renew-login.sh).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { attachGrades, conversionItems, conversionPost, gradeItems, tokensUsed } from "./grade.mjs";

const BASE = (process.env.WRITER_BASE_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.QUESTION_WRITER_TOKEN ?? "";
const MODEL = process.env.CODEX_MODEL || "gpt-6-astra";
const EFFORT = process.env.CODEX_EFFORT || "high";
const GRADE_EFFORT = process.env.CODEX_GRADE_EFFORT || "medium";
const GAMES = (process.env.WRITER_GAMES || "speed").split(",").map((g) => g.trim()).filter(Boolean);
const CODEX_TIMEOUT_MS = 15 * 60_000;

const fail = (code, message) => { console.error(message); process.exit(code); };
if (!/^https:\/\//.test(BASE)) fail(1, "Set the WRITER_BASE_URL variable (https://...).");
if (TOKEN.length < 43) fail(1, "Set the QUESTION_WRITER_TOKEN secret.");

const api = async (route, init = {}) => {
  const response = await fetch(`${BASE}${route}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) fail(2, "The site rejected the writer token.");
  return { status: response.status, body };
};

const runCodex = ({ prompt, schema, webSearch, effort = EFFORT }) => new Promise((resolve, reject) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "writer-"));
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(dir, "schema.json"), JSON.stringify(schema));
  const args = [...(webSearch ? ["--search"] : []), "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "-C", work, "-m", MODEL, "-c", `model_reasoning_effort="${effort}"`,
    "--output-schema", path.join(dir, "schema.json"), "-o", path.join(dir, "out.json"), "-"];
  const child = spawn("codex", args, { stdio: ["pipe", "pipe", "pipe"] });
  let log = "";
  let errTail = "";
  let tokens = null;
  const keep = (chunk) => { log = (log + chunk).slice(-4000); };
  child.stdout.on("data", keep);
  // "tokens used" is on stderr; a long answer on stdout used to push it out of the shared tail (Live logged 0).
  child.stderr.on("data", (chunk) => { keep(chunk); errTail = (errTail + chunk).slice(-4000); tokens = tokensUsed(errTail) ?? tokens; });
  const timer = setTimeout(() => child.kill("SIGTERM"), CODEX_TIMEOUT_MS);
  child.on("error", (error) => { clearTimeout(timer); reject(error); });
  child.on("close", (code) => {
    clearTimeout(timer);
    try {
      if (/log ?in|401|unauthori[sz]ed|refresh token/i.test(log) && code !== 0) { const e = new Error("login"); e.login = true; throw e; }
      if (code !== 0) throw new Error(/usage limit/i.test(log) ? "ChatGPT usage limit reached." : `codex exited ${code}.`);
      const out = path.join(dir, "out.json");
      if (!fs.existsSync(out)) throw new Error("codex returned no answer.");
      resolve({ output: JSON.parse(fs.readFileSync(out, "utf8")), tokens });
    } catch (error) { reject(error); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  child.stdin.end(prompt);
});

let failed = false;
for (const game of GAMES) {
  const { status, body: brief } = await api(`/api/question-writer/brief?game=${encodeURIComponent(game)}`);
  if (status !== 200 || !brief.ok || !Array.isArray(brief.prompts)) { console.error(`${game}: brief unavailable (${status}).`); failed = true; continue; }
  const items = [];
  let tokens = 0;
  let graded = 0;
  const conversion = brief.prompts.find((prompt) => prompt.kind === "conversion");
  for (const prompt of brief.prompts.filter((p) => p.kind !== "conversion")) {
    const written = [];
    try {
      const result = await runCodex(prompt);
      tokens += result.tokens ?? 0;
      const slots = new Map(prompt.slots.map((slot) => [slot.n, slot]));
      for (const payload of Array.isArray(result.output?.items) ? result.output.items : []) {
        const slot = slots.get(payload?.slot);
        if (slot) written.push({ slot, payload });
      }
    } catch (error) {
      if (error.login) fail(3, "ChatGPT login needs renewing: run renew-login.sh (see README).");
      console.error(`${game} ${prompt.kind}: ${error.message}`);
      failed = true;
    }
    items.push(...written);
    // The bar test, in a fresh session that sees only the rubric and the finished questions. If it fails, the batch
    // goes without grades and the site's nightly grades it with Gemini instead.
    if (!written.length || !prompt.grade?.prompt) continue;
    try {
      const { prompt: rubric, schema, webSearch, fields, version } = prompt.grade;
      const result = await runCodex({ prompt: `${rubric}\n${JSON.stringify(gradeItems(written, fields))}`, schema, webSearch, effort: GRADE_EFFORT });
      tokens += result.tokens ?? 0;
      graded += attachGrades(written, result.output, version);
    } catch (error) {
      if (error.login) fail(3, "ChatGPT login needs renewing: run renew-login.sh (see README).");
      console.error(`${game} ${prompt.kind} grading: ${error.message} (Gemini grades these instead).`);
    }
  }
  if (!items.length) { console.error(`${game}: nothing written.`); failed = true; }
  else {
    const sent = await api("/api/question-writer/candidates", { method: "POST", body: JSON.stringify({ game, model: MODEL, graderModel: MODEL, items }) });
    if (sent.status !== 200 || !sent.body.ok) { console.error(`${game}: not saved (${sent.status} ${sent.body.code ?? ""}).`); failed = true; }
    else console.log(JSON.stringify({ game, written: items.length, graded, received: sent.body.received, invalid: sent.body.invalid,
      gradedReceived: sent.body.graded, idempotent: sent.body.idempotent, tokens }));
  }
  if (conversion) await convert(game, conversion);
}

// Phase 4e: rewrite queued Speed questions as Live ones, grade the rewrites, post them. A failure leaves the requests
// queued, so the next night's brief sends them again.
async function convert(game, prompt) {
  let tokens = 0;
  let found;
  try {
    const result = await runCodex(prompt);
    tokens += result.tokens ?? 0;
    found = conversionItems(result.output, prompt.conversions);
  } catch (error) {
    if (error.login) fail(3, "ChatGPT login needs renewing: run renew-login.sh (see README).");
    console.error(`${game} conversions: ${error.message}`);
    failed = true;
    return;
  }
  let graded = 0;
  if (found.rewrites.length && prompt.grade?.prompt) {
    try {
      const { prompt: rubric, schema, webSearch, fields, version } = prompt.grade;
      const result = await runCodex({ prompt: `${rubric}\n${JSON.stringify(gradeItems(found.rewrites, fields))}`, schema, webSearch, effort: GRADE_EFFORT });
      tokens += result.tokens ?? 0;
      graded = attachGrades(found.rewrites, result.output, version);
    } catch (error) {
      if (error.login) fail(3, "ChatGPT login needs renewing: run renew-login.sh (see README).");
      console.error(`${game} conversions grading: ${error.message} (shown ungraded).`);
    }
  }
  const items = conversionPost(found);
  if (!items.length) { console.error(`${game} conversions: nothing returned.`); failed = true; return; }
  const sent = await api("/api/question-writer/conversions", { method: "POST", body: JSON.stringify({ graderModel: MODEL, items }) });
  if (sent.status !== 200 || !sent.body.ok) { console.error(`${game} conversions: not saved (${sent.status} ${sent.body.code ?? ""}).`); failed = true; return; }
  console.log(JSON.stringify({ game, conversions: prompt.conversions.length, rewritten: found.rewrites.length, declined: found.declines.length,
    graded, received: sent.body.received, declinedReceived: sent.body.declined, already: sent.body.already, invalid: sent.body.invalid, tokens }));
}
if (failed) process.exit(1);
