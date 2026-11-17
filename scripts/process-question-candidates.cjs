#!/usr/bin/env node
/* Nightly: gate today's question-writer candidates (docs/speed-trivia-backlog-and-quality-plan.md Phases 4b, 4c).
 *
 *   node --env-file=.env.local scripts/process-question-candidates.cjs --game speed|live [--threshold 3] [--no-fallback]
 *        [--report <dir>]
 *
 * Speed: admits through signed admission as pending_review. Live: leaves passing candidates waiting in Quick Review's
 * Live mode (the JSON is changed only by Publish). Live's repeat check reads data/live-trivia/categories from this
 * checkout (read-only).
 * Paid: Speed's bar test and repeat check spend inside SPEED_TRIVIA_MAX_DOLLARS (the nightly's approved $0.50); Live's
 * inside QUESTION_WRITER_LIVE_MAX_DOLLARS (default $0.25); the Gemini fallback (only on a day with no ChatGPT batch)
 * inside QUESTION_WRITER_FALLBACK_MAX_DOLLARS (≤ $0.10 per game).
 * Exit code 1 on a fatal error; candidates not yet settled stay `received`, so re-running the same UTC day continues.
 */
const fs = require('node:fs');
const path = require('node:path');
const { clientFromEnv } = require('./lib/speedTriviaServiceClient.cjs');
const { processSpeedDay, DEFAULT_THRESHOLD } = require('../lib/question-writer/process.cjs');
const { processLiveDay } = require('../lib/question-writer/liveProcess.cjs');

const parseArgs = argv => {
  const args = { game: null, threshold: DEFAULT_THRESHOLD, fallback: true, report: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--game') args.game = argv[++i];
    else if (arg === '--threshold') args.threshold = Number(argv[++i]);
    else if (arg === '--no-fallback') args.fallback = false;
    else if (arg === '--report') args.report = argv[++i];
    else throw new Error(`unknown option ${arg}`);
  }
  if (args.game !== 'speed' && args.game !== 'live') throw new Error('--game must be speed or live.');
  if (!Number.isInteger(args.threshold) || args.threshold < 1 || args.threshold > 5) throw new Error('--threshold must be 1-5.');
  return args;
};

const writeReport = (dir, report) => {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'question-writer-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
};

const main = async argv => {
  const args = parseArgs(argv);
  const client = clientFromEnv();
  try {
    const run = args.game === 'live' ? processLiveDay : processSpeedDay;
    const report = await run({ client, threshold: args.threshold, fallback: args.fallback });
    writeReport(args.report, report);
    console.log(JSON.stringify(report));
    return report;
  } catch (error) {
    writeReport(args.report, { ...(error.report ?? {}), fatal: error.code ?? 'failure', message: error.message });
    throw error;
  }
};

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { parseArgs, main };
