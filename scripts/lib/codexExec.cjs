/** One `codex exec` call through the ChatGPT login on this Mac (D9; no money). Shared by the Speed Trivia scripts.
 * Runs in an empty temp folder with a read-only sandbox, no user config and a fixed output schema. The prompt and the
 * reply are DATA; callers validate every field. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CODEX_TIMEOUT_MS = 10 * 60_000;

/** True when a failure means the ChatGPT login or plan limit stops every further call. */
const isLimitOrLogin = error => /login needed|usage limit/i.test(String(error?.message ?? error));

const runCodex = ({ prompt, model, effort = 'medium', schema, timeoutMs = CODEX_TIMEOUT_MS }) => new Promise((resolve, reject) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-exec-'));
  const work = path.join(dir, 'work');
  fs.mkdirSync(work);
  const schemaPath = path.join(dir, 'schema.json');
  const outPath = path.join(dir, 'out.json');
  fs.writeFileSync(schemaPath, JSON.stringify(schema));
  const child = spawn('codex', ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '-C', work, '-m', model, '-c', `model_reasoning_effort="${effort}"`, '--output-schema', schemaPath, '-o', outPath, '-'],
  { stdio: ['pipe', 'pipe', 'pipe'] });
  let log = '';
  const keep = chunk => { log = (log + chunk).slice(-4000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', code => {
    clearTimeout(timer);
    try {
      if (code !== 0) {
        const limit = /usage limit/i.exec(log) ? `ChatGPT usage limit: ${(/try again at [^.]+/i.exec(log) ?? [''])[0]}` : null;
        throw new Error(`codex exited ${code}: ${limit ?? (/log ?in|401|unauthor/i.test(log) ? 'ChatGPT login needed (run `codex login`)' : log.split('\n').slice(-3).join(' '))}`);
      }
      const tokens = Number((/tokens used\s+([\d,]+)/i.exec(log)?.[1] ?? '').replace(/,/g, '')) || null;
      // codex can exit 0 with no final message (e.g. a usage limit); report its own words, not ENOENT.
      if (!fs.existsSync(outPath)) throw new Error(`codex returned no answer: ${log.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 240)}`);
      resolve({ output: JSON.parse(fs.readFileSync(outPath, 'utf8')), tokens });
    } catch (error) { reject(error); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  child.stdin.end(prompt);
});

module.exports = { runCodex, isLimitOrLogin, CODEX_TIMEOUT_MS };
