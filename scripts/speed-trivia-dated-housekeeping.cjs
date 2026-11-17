#!/usr/bin/env node
/* Nightly Speed Trivia housekeeping for dated questions (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a; D11, D16).
 *
 *   node --env-file=.env.local scripts/speed-trivia-dated-housekeeping.cjs                    # expiry dry run; refresh visibility
 *   ... --expire-apply                         # also retire active and waiting rows whose expiresOn has passed
 *   ... --monthly                              # with --expire-apply: only on the 1st of the month (UTC); the nightly uses this
 *
 * Visibility: one count per gated category, written to speed_trivia_category_flags (players read only that flag).
 * Expiry: one indexed query in speed_trivia_expire_dated, which logs the before-state (speed_trivia_expiry_runs) in the
 * same transaction as the status-only retirement. Free: no paid calls. Retired rows can be restored only through
 * signed admission (a paid full-bank check), like any retirement.
 */
const { clientFromEnv } = require('./lib/speedTriviaServiceClient.cjs');

// Must match minActiveToShow in lib/triviaCategories.ts (tests/speed-trivia-current-events-contract.test.ts).
const GATED_CATEGORIES = Object.freeze([{ category: 'Current Events', threshold: 60 }]);

const parseArgs = argv => {
  const args = { expireApply: false, monthly: false };
  for (const arg of argv) {
    if (arg === '--expire-apply') args.expireApply = true;
    else if (arg === '--monthly') args.monthly = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
};

const rpc = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
};

// Expiry runs first, then visibility, so a category the 1st's expiry takes below its threshold is hidden the same
// night, not the next one (review #7).
const run = async ({ client, args, now = new Date() }) => {
  const today = now.toISOString().slice(0, 10);
  const due = !args.monthly || now.getUTCDate() === 1;
  const apply = args.expireApply && due;
  const expiry = await rpc(client, 'speed_trivia_expire_dated', { p_today: today, p_apply: apply, p_limit: 500 });
  const visibility = [];
  for (const gate of GATED_CATEGORIES) {
    visibility.push(await rpc(client, 'speed_trivia_refresh_category_visibility', { p_category: gate.category, p_threshold: gate.threshold }));
  }
  return { today, visibility, expiry: { ...expiry, ids: undefined, idCount: Array.isArray(expiry?.ids) ? expiry.ids.length : 0, skippedNotFirstOfMonth: args.expireApply && !due } };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(await run({ client: clientFromEnv(), args }), null, 2));
};

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

module.exports = { GATED_CATEGORIES, parseArgs, run };
