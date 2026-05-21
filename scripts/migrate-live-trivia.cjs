#!/usr/bin/env node
/**
 * One-time migration: creates data/live-trivia/categories/ from the first 100
 * questions in each speed-trivia category, then removes the now-unused
 * live_open_ended key from the speed-trivia JSON files.
 *
 * Usage:
 *   node scripts/migrate-live-trivia.cjs
 *   node scripts/migrate-live-trivia.cjs --dry-run
 */

const fs = require("node:fs");
const path = require("node:path");

const SPEED_DIR = "data/trivia/categories";
const LIVE_DIR = "data/live-trivia/categories";
const MIGRATE_COUNT = 100;

function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  if (dryRun) console.log("Dry-run mode — no files will be written.\n");

  const absSpeed = path.resolve(process.cwd(), SPEED_DIR);
  const absLive = path.resolve(process.cwd(), LIVE_DIR);

  assert(fs.existsSync(absSpeed), `Speed trivia dir not found: ${absSpeed}`);

  if (!dryRun && !fs.existsSync(absLive)) {
    fs.mkdirSync(absLive, { recursive: true });
    console.log(`Created directory: ${absLive}`);
  }

  const files = fs.readdirSync(absSpeed).filter((f) => f.endsWith(".json")).sort();
  assert(files.length > 0, `No JSON files in ${absSpeed}`);

  for (const file of files) {
    const speedPath = path.join(absSpeed, file);
    const livePath = path.join(absLive, file);
    const raw = fs.readFileSync(speedPath, "utf8");
    const doc = JSON.parse(raw);

    const categoryName = String(doc.categoryName || file.replace(/\.json$/i, "")).trim();
    const normalQuestions = Array.isArray(doc.normal_multiple_choice) ? doc.normal_multiple_choice : [];

    // Take first MIGRATE_COUNT MC questions and convert to live write-in format.
    const source = normalQuestions.slice(0, MIGRATE_COUNT);
    const liveQuestions = source.map((item) => {
      const answer = Array.isArray(item.options) ? String(item.options[item.correctAnswer] ?? "").trim() : "";
      return {
        slug: String(item.slug || slugify(item.question) || "").trim(),
        question: String(item.question || "").trim(),
        answer,
        category: String(item.category || categoryName).trim(),
        difficulty: String(item.difficulty || "medium").trim(),
      };
    });

    const liveDoc = {
      categoryName,
      questions: liveQuestions,
    };

    // Rewrite speed trivia file without the live_open_ended key.
    const { live_open_ended: _removed, ...restDoc } = doc;
    const cleanedSpeedDoc = restDoc;

    console.log(`${file}: migrated ${liveQuestions.length} questions → live trivia`);
    if ("live_open_ended" in doc) {
      console.log(`  Removed live_open_ended (was ${Array.isArray(doc.live_open_ended) ? doc.live_open_ended.length : 0} items) from speed trivia file`);
    }

    if (!dryRun) {
      fs.writeFileSync(livePath, `${JSON.stringify(liveDoc, null, 2)}\n`, "utf8");
      fs.writeFileSync(speedPath, `${JSON.stringify(cleanedSpeedDoc, null, 2)}\n`, "utf8");
    }
  }

  console.log(`\nMigration ${dryRun ? "(dry-run) " : ""}complete. ${files.length} category file(s) processed.`);
}

main();
