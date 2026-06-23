#!/usr/bin/env node
/**
 * Patches the `question` text in the `trivia_questions` table for live_showdown
 * questions whose text has been updated in the local Live Trivia JSON files.
 *
 * Only the `question` column is touched — no answers, slugs, pool, or status
 * are changed, so active or scheduled games are never disrupted.
 *
 * Usage:
 *   node --env-file=.env.local scripts/patch-live-trivia-question-text.cjs [--apply] [--category television]
 *
 *   --apply         Actually write to the database (default is dry-run).
 *   --category <x>  Only process the file whose name starts with <x>. Omit to
 *                   process all live-trivia category files.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");
const categoryArg = (() => {
  const idx = process.argv.indexOf("--category");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const ROOT = path.join(__dirname, "..");
const LIVE_DIR = path.join(ROOT, "data", "live-trivia", "categories");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with: node --env-file=.env.local scripts/patch-live-trivia-question-text.cjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchLiveShowdownQuestions(slugs) {
  const { data, error } = await supabase
    .from("trivia_questions")
    .select("id, slug, question")
    .eq("question_pool", "live_showdown")
    .in("slug", slugs);
  if (error) throw new Error(`Failed to fetch from DB: ${error.message}`);
  return data ?? [];
}

async function main() {
  if (!APPLY) {
    console.log("DRY-RUN mode — no database writes. Pass --apply to commit changes.\n");
  }

  const files = fs
    .readdirSync(LIVE_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !categoryArg || f.toLowerCase().startsWith(categoryArg.toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.error(`No matching JSON files found in ${LIVE_DIR}`);
    process.exit(1);
  }

  let totalPatched = 0;
  let totalUnchanged = 0;
  let totalMissing = 0;

  for (const file of files) {
    const filePath = path.join(LIVE_DIR, file);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const localQuestions = Array.isArray(raw.questions) ? raw.questions : [];

    if (localQuestions.length === 0) {
      console.log(`[${file}] No questions found, skipping.`);
      continue;
    }

    console.log(`\n[${file}] Processing ${localQuestions.length} questions...`);

    const slugs = localQuestions.map((q) => q.slug).filter(Boolean);
    const dbRows = await fetchLiveShowdownQuestions(slugs);
    const dbBySlug = new Map(dbRows.map((r) => [r.slug, r]));

    const toUpdate = [];

    for (const localQ of localQuestions) {
      const dbRow = dbBySlug.get(localQ.slug);
      if (!dbRow) {
        console.log(`  [MISSING] slug="${localQ.slug}" not found in DB — skipping`);
        totalMissing++;
        continue;
      }
      if (dbRow.question === localQ.question) {
        totalUnchanged++;
        continue;
      }
      console.log(`  [PATCH] slug="${localQ.slug}"`);
      console.log(`    DB  : ${dbRow.question}`);
      console.log(`    JSON: ${localQ.question}`);
      toUpdate.push({ id: dbRow.id, slug: dbRow.slug, question: localQ.question });
    }

    if (toUpdate.length === 0) {
      console.log(`  No changes needed.`);
      continue;
    }

    if (APPLY) {
      for (const row of toUpdate) {
        const { error } = await supabase
          .from("trivia_questions")
          .update({ question: row.question })
          .eq("id", row.id)
          .eq("question_pool", "live_showdown");
        if (error) {
          console.error(`  [ERROR] Failed to update slug="${row.slug}": ${error.message}`);
        } else {
          console.log(`  [OK]    Updated slug="${row.slug}"`);
          totalPatched++;
        }
      }
    } else {
      totalPatched += toUpdate.length;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Would patch (or patched): ${totalPatched}`);
  console.log(`  Already up to date:       ${totalUnchanged}`);
  console.log(`  Missing from DB:          ${totalMissing}`);
  if (!APPLY && totalPatched > 0) {
    console.log(`\nRe-run with --apply to write these changes to the database.`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
