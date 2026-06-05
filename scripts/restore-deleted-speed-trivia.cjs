#!/usr/bin/env node
"use strict";

/**
 * Restores all Speed Trivia (anytime_blitz) questions that were incorrectly
 * soft-deleted back to active status.
 *
 * Usage:
 *   npm run trivia:restore-speed       (dry run by default, shows what would change)
 *   npm run trivia:restore-speed --fix  (applies the restore)
 */

const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = !process.argv.includes("--fix");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  console.error("Run with: node --env-file=.env.local scripts/restore-deleted-speed-trivia.cjs [--fix]");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data, error } = await supabase
    .from("trivia_questions")
    .select("id, slug, question, category")
    .eq("question_pool", "anytime_blitz")
    .eq("status", "deleted");

  if (error) {
    throw new Error(`Failed to fetch deleted speed trivia questions: ${error.message}`);
  }

  const rows = data ?? [];
  console.log(`Found ${rows.length} deleted anytime_blitz question(s).`);

  if (rows.length === 0) {
    console.log("Nothing to restore.");
    return;
  }

  for (const row of rows) {
    console.log(`  ${DRY_RUN ? "[dry-run]" : "[restoring]"} ${row.slug} — ${row.question?.slice(0, 60)}`);
  }

  if (DRY_RUN) {
    console.log("\nDry run complete. Run with --fix to apply.");
    return;
  }

  const ids = rows.map((r) => r.id);
  const { error: updateError } = await supabase
    .from("trivia_questions")
    .update({ status: "active" })
    .in("id", ids);

  if (updateError) {
    throw new Error(`Failed to restore questions: ${updateError.message}`);
  }

  console.log(`\nRestored ${rows.length} question(s) to active status.`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
