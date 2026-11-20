#!/usr/bin/env node
// Daily question writer (private repo; docs/speed-trivia-backlog-and-quality-plan.md Phase 4b in the main repo).
// GET the brief -> one `codex exec` per prompt (ChatGPT plan login; web search only for Current Events) -> one more,
// separate `codex exec` per prompt grades what was written (the bar test, D35; same search rule) -> POST.
// Live briefs may add a `conversion` prompt (Phase 4e, D37): queued Speed questions rewritten as Live ones (or
// declined), graded the same way, then posted to /api/question-writer/conversions after the day's batch.
// The day's loop is in day.mjs, the codex runner in grade.mjs. No other dependencies. Never prints the login, the
// token or the questions. Exit codes: 1 failure, 2 token rejected, 3 ChatGPT login needs renewing on a writing call
// (run renew-login.sh); a failed grading call never exits (Phase 7h).
import { runCodex } from "./grade.mjs";
import { LOGIN_MESSAGE, writeDay } from "./day.mjs";

const BASE = (process.env.WRITER_BASE_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.QUESTION_WRITER_TOKEN ?? "";
const MODEL = process.env.CODEX_MODEL || "gpt-6-astra";
const EFFORT = process.env.CODEX_EFFORT || "high";
const GRADE_EFFORT = process.env.CODEX_GRADE_EFFORT || "medium";
const GAMES = (process.env.WRITER_GAMES || "speed").split(",").map((g) => g.trim()).filter(Boolean);

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

const codex = ({ prompt, schema, webSearch, effort = EFFORT }) => runCodex({ prompt, schema, webSearch, model: MODEL, effort });

const { failed, login } = await writeDay({ games: GAMES, api, codex, model: MODEL, gradeEffort: GRADE_EFFORT });
if (login) fail(3, LOGIN_MESSAGE);
if (failed) process.exit(1);
