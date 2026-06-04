#!/usr/bin/env node
/**
 * Removes questions from local JSON category files that no longer exist in the
 * database. Run this before committing or pushing after deleting questions via
 * the admin dashboard, so ghost questions don't get re-imported on the next sync.
 *
 * Usage:
 *   npm run trivia:sync
 *   node --env-file=.env.local scripts/sync-local-trivia.cjs [--dry-run]
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = path.join(__dirname, "..");
const LIVE_DIR = path.join(ROOT, "data", "live-trivia", "categories");
const SPEED_DIR = path.join(ROOT, "data", "trivia", "categories");
const LEGACY_FILE = path.join(ROOT, "data", "trivia", "_legacy", "questions.v1.json");
const PAGE_SIZE = 1000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  console.error("Run with: node --env-file=.env.local scripts/sync-local-trivia.cjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fetches every active slug for the given pool, paginating through all rows.
async function fetchActiveSlugs(pool) {
  const slugs = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("trivia_questions")
      .select("slug")
      .eq("question_pool", pool)
      .eq("status", "active")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch ${pool} slugs: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.slug) slugs.add(row.slug);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return slugs;
}

// Reads all .json files from a directory, sorted alphabetically.
function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
}

// Writes JSON back to disk with consistent 2-space indent + trailing newline.
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function main() {
  if (DRY_RUN) console.log("Dry run — no files will be modified.\n");

  console.log("Fetching active slugs from Supabase...");
  const [liveSlugs, speedSlugs] = await Promise.all([
    fetchActiveSlugs("live_showdown"),
    fetchActiveSlugs("anytime_blitz"),
  ]);
  console.log(`  live_showdown : ${liveSlugs.size} active question(s)`);
  console.log(`  anytime_blitz : ${speedSlugs.size} active question(s)\n`);

  let totalFiles = 0;
  let totalRemoved = 0;

  // ── Live trivia ──────────────────────────────────────────────────────────
  for (const file of readJsonDir(LIVE_DIR)) {
    const filePath = path.join(LIVE_DIR, file);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const before = Array.isArray(raw.questions) ? raw.questions.length : 0;
    const after = (raw.questions ?? []).filter((q) => liveSlugs.has(q.slug));
    const removed = before - after.length;

    totalFiles++;
    if (removed > 0) {
      totalRemoved += removed;
      console.log(`[live]  ${file}: removing ${removed} stale question(s)`);
      if (!DRY_RUN) writeJson(filePath, { ...raw, questions: after });
    } else {
      console.log(`[live]  ${file}: ok`);
    }
  }

  // ── Speed trivia ─────────────────────────────────────────────────────────
  for (const file of readJsonDir(SPEED_DIR)) {
    const filePath = path.join(SPEED_DIR, file);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const before = Array.isArray(raw.normal_multiple_choice) ? raw.normal_multiple_choice.length : 0;
    const after = (raw.normal_multiple_choice ?? []).filter((q) => speedSlugs.has(q.slug));
    const removed = before - after.length;

    totalFiles++;
    if (removed > 0) {
      totalRemoved += removed;
      console.log(`[speed] ${file}: removing ${removed} stale question(s)`);
      if (!DRY_RUN) writeJson(filePath, { ...raw, normal_multiple_choice: after });
    } else {
      console.log(`[speed] ${file}: ok`);
    }
  }

  // ── Legacy flat-array file ───────────────────────────────────────────────
  if (fs.existsSync(LEGACY_FILE)) {
    const raw = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf-8"));
    if (Array.isArray(raw)) {
      const before = raw.length;
      const after = raw.filter((q) => speedSlugs.has(q.slug) || liveSlugs.has(q.slug));
      const removed = before - after.length;

      totalFiles++;
      if (removed > 0) {
        totalRemoved += removed;
        console.log(`[legacy] questions.v1.json: removing ${removed} stale question(s)`);
        if (!DRY_RUN) writeJson(LEGACY_FILE, after);
      } else {
        console.log(`[legacy] questions.v1.json: ok`);
      }
    }
  }

  const action = DRY_RUN ? "would remove" : "removed";
  console.log(`\nScanned ${totalFiles} file(s) — ${action} ${totalRemoved} stale question(s).`);
  if (DRY_RUN && totalRemoved > 0) {
    console.log("Re-run without --dry-run to apply changes.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
