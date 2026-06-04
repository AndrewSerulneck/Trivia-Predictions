#!/usr/bin/env node

/**
 * One-time backfill for admin trivia question banks.
 *
 * Imports:
 * - Speed Trivia from data/trivia/categories/*.json
 * - Live Trivia from data/live-trivia/categories/*.json
 *
 * and upserts into Supabase `trivia_questions` (DB-backed admin CRUD).
 *
 * Usage:
 *   node scripts/backfill-trivia-question-bank.cjs
 *   node scripts/backfill-trivia-question-bank.cjs --check
 */

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const SPEED_DIR = "data/trivia/categories";
const LIVE_DIR = "data/live-trivia/categories";
const CHUNK_SIZE = 200;
const ANYTIME_POOL = "anytime_blitz";
const LIVE_POOL = "live_showdown";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  return {
    checkOnly: argv.includes("--check"),
  };
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toCategoryFromFileName(fileName) {
  return fileName.replace(/\.v\d+\.json$/i, "").replace(/-/g, " ").trim();
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listJsonFiles(dir) {
  const absoluteDir = path.resolve(process.cwd(), dir);
  assert(fs.existsSync(absoluteDir), `Directory not found: ${absoluteDir}`);
  const files = fs.readdirSync(absoluteDir).filter((name) => name.endsWith(".json")).sort();
  assert(files.length > 0, `No .json files found in ${absoluteDir}`);
  return { absoluteDir, files };
}

function readSpeedRows() {
  const { absoluteDir, files } = listJsonFiles(SPEED_DIR);
  const rows = [];
  for (const file of files) {
    const filePath = path.join(absoluteDir, file);
    const raw = readJsonFile(filePath);
    const categoryName = String(raw.categoryName ?? "").trim() || toCategoryFromFileName(file);
    const questions = Array.isArray(raw.normal_multiple_choice) ? raw.normal_multiple_choice : [];
    for (const item of questions) {
      rows.push({
        sourceFile: file,
        sourceType: "speed",
        question: String(item?.question ?? "").trim(),
        category: String(item?.category ?? categoryName).trim() || null,
        difficulty: String(item?.difficulty ?? "").trim() || null,
        options: Array.isArray(item?.options) ? item.options.map((opt) => String(opt ?? "").trim()).filter(Boolean) : [],
        correctAnswer: Number.isInteger(Number(item?.correctAnswer)) ? Number(item.correctAnswer) : 0,
        answerFormat: "multiple_choice",
        questionPool: ANYTIME_POOL,
        slug: String(item?.slug ?? "").trim(),
      });
    }
  }
  return rows;
}

function readLiveRows() {
  const { absoluteDir, files } = listJsonFiles(LIVE_DIR);
  const rows = [];
  for (const file of files) {
    const filePath = path.join(absoluteDir, file);
    const raw = readJsonFile(filePath);
    const categoryName = String(raw.categoryName ?? "").trim() || toCategoryFromFileName(file);
    const questions = Array.isArray(raw.questions) ? raw.questions : [];
    for (const item of questions) {
      const answer = String(item?.answer ?? "").trim();
      rows.push({
        sourceFile: file,
        sourceType: "live",
        question: String(item?.question ?? "").trim(),
        category: String(item?.category ?? categoryName).trim() || null,
        difficulty: String(item?.difficulty ?? "").trim() || null,
        options: answer ? [answer] : [],
        correctAnswer: 0,
        answerFormat: "write_in",
        questionPool: LIVE_POOL,
        slug: String(item?.slug ?? "").trim(),
      });
    }
  }
  return rows;
}

function normalizeAndDeduplicate(rows) {
  const normalized = [];
  const slugCounts = new Map();
  let skipped = 0;

  for (const row of rows) {
    if (!row.question) {
      skipped += 1;
      continue;
    }

    const options = Array.isArray(row.options) ? row.options.filter(Boolean) : [];
    if (row.answerFormat === "multiple_choice") {
      if (options.length < 2) {
        skipped += 1;
        continue;
      }
      if (!Number.isInteger(row.correctAnswer) || row.correctAnswer < 0 || row.correctAnswer >= options.length) {
        skipped += 1;
        continue;
      }
    } else if (options.length < 1) {
      skipped += 1;
      continue;
    }

    const baseSlug = slugify(row.slug || row.question);
    if (!baseSlug) {
      skipped += 1;
      continue;
    }
    const seen = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, seen + 1);
    const slug = seen === 0 ? baseSlug : `${baseSlug}-dup-${seen + 1}`;

    normalized.push({
      slug,
      question: row.question,
      options,
      correct_answer: row.answerFormat === "multiple_choice" ? row.correctAnswer : 0,
      category: row.category,
      difficulty: row.difficulty,
      question_pool: row.questionPool,
      answer_format: row.answerFormat,
    });
  }

  const duplicateSlugBases = Array.from(slugCounts.entries()).filter(([, count]) => count > 1).length;
  return { normalized, skipped, duplicateSlugBases };
}

function createSupabaseClient() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL.");
  assert(serviceRoleKey, "Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function upsertRows(rows) {
  const supabase = createSupabaseClient();
  let processed = 0;
  let skippedDeleted = 0;

  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);

    const chunkSlugs = chunk.map((row) => row.slug).filter(Boolean);
    const deletedSlugs = new Set();

    if (chunkSlugs.length > 0) {
      const { data: existingRows, error: lookupError } = await supabase
        .from("trivia_questions")
        .select("slug, status")
        .in("slug", chunkSlugs);
      if (lookupError) {
        throw new Error(`Failed to look up existing trivia rows: ${lookupError.message}`);
      }
      for (const row of existingRows ?? []) {
        if (row.slug && row.status === "deleted") {
          deletedSlugs.add(row.slug);
        }
      }
    }

    const importable = chunk.filter((row) => !deletedSlugs.has(row.slug));
    skippedDeleted += chunk.length - importable.length;
    if (importable.length === 0) {
      continue;
    }

    const { error } = await supabase.from("trivia_questions").upsert(importable, { onConflict: "slug" });
    if (error) {
      throw new Error(`Upsert failed: ${error.message}`);
    }
    processed += importable.length;
    console.log(`Upserted ${processed}/${rows.length - skippedDeleted} importable rows...`);
  }

  if (skippedDeleted > 0) {
    console.log(`Skipped ${skippedDeleted} row(s) because they were previously marked deleted.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const speedRows = readSpeedRows();
  const liveRows = readLiveRows();
  const { normalized, skipped, duplicateSlugBases } = normalizeAndDeduplicate([...speedRows, ...liveRows]);

  console.log(`Speed rows loaded: ${speedRows.length}`);
  console.log(`Live rows loaded: ${liveRows.length}`);
  console.log(`Rows ready for upsert: ${normalized.length}`);
  console.log(`Rows skipped during validation: ${skipped}`);
  console.log(`Duplicate slug bases auto-resolved: ${duplicateSlugBases}`);

  if (args.checkOnly) {
    console.log("Check mode complete (no DB writes).");
    return;
  }

  await upsertRows(normalized);
  console.log("Backfill complete.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
