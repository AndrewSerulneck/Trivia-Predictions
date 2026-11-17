#!/usr/bin/env node
// Daily question writer (private repo; docs/speed-trivia-backlog-and-quality-plan.md Phase 4b in the main repo).
// GET the brief -> one `codex exec` per prompt (ChatGPT plan login; web search only for Current Events) -> POST.
// No dependencies. Never prints the login, the token or the questions. Exit codes: 1 failure, 2 token rejected,
// 3 ChatGPT login needs renewing (run renew-login.sh).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = (process.env.WRITER_BASE_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.QUESTION_WRITER_TOKEN ?? "";
const MODEL = process.env.CODEX_MODEL || "gpt-6-astra";
const EFFORT = process.env.CODEX_EFFORT || "high";
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

const runCodex = ({ prompt, schema, webSearch }) => new Promise((resolve, reject) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "writer-"));
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(dir, "schema.json"), JSON.stringify(schema));
  const args = [...(webSearch ? ["--search"] : []), "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "-C", work, "-m", MODEL, "-c", `model_reasoning_effort="${EFFORT}"`,
    "--output-schema", path.join(dir, "schema.json"), "-o", path.join(dir, "out.json"), "-"];
  const child = spawn("codex", args, { stdio: ["pipe", "pipe", "pipe"] });
  let log = "";
  const keep = (chunk) => { log = (log + chunk).slice(-4000); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  const timer = setTimeout(() => child.kill("SIGTERM"), CODEX_TIMEOUT_MS);
  child.on("error", (error) => { clearTimeout(timer); reject(error); });
  child.on("close", (code) => {
    clearTimeout(timer);
    try {
      if (/log ?in|401|unauthori[sz]ed|refresh token/i.test(log) && code !== 0) { const e = new Error("login"); e.login = true; throw e; }
      if (code !== 0) throw new Error(/usage limit/i.test(log) ? "ChatGPT usage limit reached." : `codex exited ${code}.`);
      const out = path.join(dir, "out.json");
      if (!fs.existsSync(out)) throw new Error("codex returned no answer.");
      const tokens = Number((/tokens used\s+([\d,]+)/i.exec(log)?.[1] ?? "").replace(/,/g, "")) || null;
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
  for (const prompt of brief.prompts) {
    try {
      const result = await runCodex(prompt);
      tokens += result.tokens ?? 0;
      const slots = new Map(prompt.slots.map((slot) => [slot.n, slot]));
      for (const payload of Array.isArray(result.output?.items) ? result.output.items : []) {
        const slot = slots.get(payload?.slot);
        if (slot) items.push({ slot, payload });
      }
    } catch (error) {
      if (error.login) fail(3, "ChatGPT login needs renewing: run renew-login.sh (see README).");
      console.error(`${game} ${prompt.kind}: ${error.message}`);
      failed = true;
    }
  }
  if (!items.length) { console.error(`${game}: nothing written.`); failed = true; continue; }
  const sent = await api("/api/question-writer/candidates", { method: "POST", body: JSON.stringify({ game, model: MODEL, items }) });
  if (sent.status !== 200 || !sent.body.ok) { console.error(`${game}: not saved (${sent.status} ${sent.body.code ?? ""}).`); failed = true; continue; }
  console.log(JSON.stringify({ game, written: items.length, received: sent.body.received, invalid: sent.body.invalid, idempotent: sent.body.idempotent, tokens }));
}
if (failed) process.exit(1);
