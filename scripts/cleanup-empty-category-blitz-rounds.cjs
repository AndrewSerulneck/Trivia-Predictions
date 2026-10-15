#!/usr/bin/env node
/**
 * Category Blitz — one-time cleanup of old EMPTY rounds.
 * docs/category-blitz-how-to-play-plan.md, Phase 6. Andrew authorised the delete 2026-10-14.
 *
 * Before "sleep when idle" (Phase 5, deployed 2026-10-15) the continuous engine started a
 * round every ~6 minutes at every venue, played or not (~2,470/day). This deletes the unplayed
 * ones. Run it only AFTER Phase 5 is live, or the table refills.
 *
 * DRY RUN BY DEFAULT — prints what it would delete and writes nothing. `--apply` deletes.
 *
 * A round is deleted only if ALL are true:
 *   - zero rows in category_blitz_submissions (re-checked per batch right before the delete —
 *     submissions.round_id is ON DELETE CASCADE, so this check is what protects answers);
 *   - status = 'complete';
 *   - started_at older than 24 hours;
 *   - it is not the latest round of its session (the engine and the TV read that one).
 * Only category_blitz_rounds is touched. Re-runnable: a second run finds nothing.
 *
 * Run from the repo root (it needs node_modules):
 *   node --env-file=.env.local scripts/cleanup-empty-category-blitz-rounds.cjs [--apply] [--log <file>]
 * The deleted ids are appended to --log (default: a file in the OS temp dir). Keep it out of the repo.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
).trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run via: node --env-file=.env.local scripts/cleanup-empty-category-blitz-rounds.cjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");
const logArgIndex = process.argv.indexOf("--log");
const LOG_PATH =
  logArgIndex >= 0 && process.argv[logArgIndex + 1]
    ? path.resolve(process.argv[logArgIndex + 1])
    : path.join(os.tmpdir(), `category-blitz-empty-rounds-${Date.now()}.log`);

const PAGE = 1000;
// PostgREST puts `.in()` ids in the URL; 200 uuids ≈ 7.5 KB stays well under proxy limits.
const BATCH = 200;
const PAUSE_MS = 250;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchAll = async (table, columns) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
};

const main = async () => {
  const cutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();
  console.log(`Mode: ${APPLY ? "APPLY (deletes)" : "dry run (writes nothing)"}`);
  console.log(`Cutoff: started_at < ${cutoffIso}`);

  const rounds = await fetchAll("category_blitz_rounds", "id,session_id,status,started_at,created_at");
  const submissions = await fetchAll("category_blitz_submissions", "id,round_id");
  const roundsWithAnswers = new Set(submissions.map((s) => s.round_id));

  // Latest round per session = greatest started_at (created_at, then id, break ties).
  const latestBySession = new Map();
  const isLater = (a, b) =>
    a.started_at !== b.started_at
      ? a.started_at > b.started_at
      : a.created_at !== b.created_at
        ? a.created_at > b.created_at
        : a.id > b.id;
  for (const round of rounds) {
    const current = latestBySession.get(round.session_id);
    if (!current || isLater(round, current)) latestBySession.set(round.session_id, round);
  }
  const latestIds = new Set([...latestBySession.values()].map((r) => r.id));

  const kept = { hasAnswers: 0, latestOfSession: 0, notComplete: 0, tooRecent: 0 };
  const candidates = [];
  for (const round of rounds) {
    if (roundsWithAnswers.has(round.id)) kept.hasAnswers += 1;
    else if (latestIds.has(round.id)) kept.latestOfSession += 1;
    else if (round.status !== "complete") kept.notComplete += 1;
    else if (!(round.started_at < cutoffIso)) kept.tooRecent += 1;
    else candidates.push(round.id);
  }
  const keptTotal = Object.values(kept).reduce((a, b) => a + b, 0);

  console.log("");
  console.log(`Total rounds:              ${rounds.length}`);
  console.log(`Would delete:              ${candidates.length}`);
  console.log(`Kept:                      ${keptTotal}`);
  console.log(`  has answers:             ${kept.hasAnswers}  (rounds with answers: ${roundsWithAnswers.size})`);
  console.log(`  latest of its session:   ${kept.latestOfSession}`);
  console.log(`  not complete:            ${kept.notComplete}`);
  console.log(`  started < 24 h ago:      ${kept.tooRecent}`);
  console.log(`Sessions:                  ${latestBySession.size}`);

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply to delete.");
    return;
  }

  fs.appendFileSync(LOG_PATH, `# category_blitz_rounds empty-round cleanup ${new Date().toISOString()}\n`);
  console.log(`\nLogging deleted ids to ${LOG_PATH}`);

  let deleted = 0;
  let skippedFresh = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);

    // Fresh read right before the delete: any answer now on one of these rounds keeps it.
    const { data: fresh, error: freshError } = await supabase
      .from("category_blitz_submissions")
      .select("round_id")
      .in("round_id", batch);
    if (freshError) throw new Error(`submissions re-check: ${freshError.message}`);
    const answered = new Set((fresh ?? []).map((s) => s.round_id));
    const ids = batch.filter((id) => !answered.has(id));
    skippedFresh += batch.length - ids.length;
    if (ids.length === 0) continue;

    // The status/age filters repeat the predicate in the delete itself.
    const { data: gone, error } = await supabase
      .from("category_blitz_rounds")
      .delete()
      .in("id", ids)
      .eq("status", "complete")
      .lt("started_at", cutoffIso)
      .select("id");
    if (error) throw new Error(`delete batch ${i / BATCH + 1}: ${error.message}`);
    const goneIds = (gone ?? []).map((r) => r.id);
    deleted += goneIds.length;
    fs.appendFileSync(LOG_PATH, goneIds.join("\n") + (goneIds.length ? "\n" : ""));
    console.log(`batch ${i / BATCH + 1}: deleted ${goneIds.length}/${batch.length} (total ${deleted})`);
    await sleep(PAUSE_MS);
  }

  fs.appendFileSync(LOG_PATH, `# deleted ${deleted}\n`);
  console.log(`\nDeleted ${deleted} rounds. Kept by the fresh answer re-check: ${skippedFresh}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
