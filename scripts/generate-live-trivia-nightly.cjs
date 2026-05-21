#!/usr/bin/env node
/**
 * Nightly orchestrator for live-trivia write-in question generation.
 * Reads data/live-trivia/categories/, finds underfilled categories, and
 * calls generate-live-trivia-questions.cjs for each one to reach the target.
 *
 * Usage:
 *   node scripts/generate-live-trivia-nightly.cjs --total 50 --batch-size 25
 *   node scripts/generate-live-trivia-nightly.cjs --total 50 --dry-run
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_DIR = "data/live-trivia/categories";
const DEFAULT_TOTAL = 50;
const DEFAULT_BATCH_SIZE = 25;
const CATEGORY_TARGET_SIZE = 100;

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    total: DEFAULT_TOTAL,
    batchSize: DEFAULT_BATCH_SIZE,
    model: process.env.GEMINI_MODEL || "",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dir") { args.dir = argv[i + 1] || DEFAULT_DIR; i += 1; continue; }
    if (token === "--total") { args.total = Number.parseInt(argv[i + 1] || `${DEFAULT_TOTAL}`, 10); i += 1; continue; }
    if (token === "--batch-size") { args.batchSize = Number.parseInt(argv[i + 1] || `${DEFAULT_BATCH_SIZE}`, 10); i += 1; continue; }
    if (token === "--model") { args.model = (argv[i + 1] || "").trim(); i += 1; continue; }
    if (token === "--dry-run") { args.dryRun = true; }
  }

  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toDisplayCategory(fileBaseName) {
  const name = fileBaseName.replace(/\.v\d+$/i, "");
  return name.split("-").map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")).join(" ").trim();
}

function categoryKeyFromFile(file) {
  return file.replace(/\.json$/i, "").replace(/\.v\d+$/i, "").trim();
}

function listCategoryRecords(dir) {
  const absoluteDir = path.resolve(process.cwd(), dir);
  assert(fs.existsSync(absoluteDir), `Live trivia directory not found: ${absoluteDir}`);
  assert(fs.statSync(absoluteDir).isDirectory(), `Not a directory: ${absoluteDir}`);

  const files = fs.readdirSync(absoluteDir).filter((name) => name.endsWith(".json")).sort();

  return {
    absoluteDir,
    records: files.map((file) => {
      const filePath = path.join(absoluteDir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const categoryKey = categoryKeyFromFile(file);
      const displayCategory = toDisplayCategory(file.replace(/\.json$/i, ""));
      const count = Array.isArray(parsed.questions) ? parsed.questions.length : 0;
      const categoryName = String(parsed.categoryName || displayCategory).trim();
      return { file, filePath, categoryKey, categoryName, count };
    }),
  };
}

function computePlan({ records, nightlyBudget }) {
  const underfilled = records
    .map((r) => ({ ...r, needed: Math.max(0, CATEGORY_TARGET_SIZE - r.count) }))
    .filter((r) => r.needed > 0)
    .sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      return a.categoryKey.localeCompare(b.categoryKey);
    });

  const plan = new Map();
  let remaining = nightlyBudget;

  for (const record of underfilled) {
    if (remaining <= 0) break;
    const take = Math.min(record.needed, remaining);
    if (take > 0) {
      plan.set(record.categoryKey, take);
      remaining -= take;
    }
  }

  return { plan, remaining };
}

function runGenerator({ categoryKey, count, args }) {
  const scriptPath = path.resolve(process.cwd(), "scripts/generate-live-trivia-questions.cjs");
  const cmdArgs = [
    scriptPath,
    "--dir", args.dir,
    "--category", categoryKey,
    "--count", String(count),
    "--batch-size", String(args.batchSize),
    "--allow-partial",
  ];
  if (args.model) cmdArgs.push("--model", args.model);
  if (args.dryRun) cmdArgs.push("--dry-run");

  const result = spawnSync(process.execPath, cmdArgs, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Generation failed for category "${categoryKey}" with exit code ${result.status ?? 1}.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(Number.isInteger(args.total) && args.total > 0, "--total must be a positive integer.");
  assert(Number.isInteger(args.batchSize) && args.batchSize > 0, "--batch-size must be a positive integer.");

  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  assert(apiKey, "Missing GEMINI_API_KEY in environment.");

  const { records } = listCategoryRecords(args.dir);

  console.log(
    `Live trivia generation starting. Budget=${args.total}, TargetPerCategory=${CATEGORY_TARGET_SIZE}`
  );
  console.log("Current category counts:");
  for (const r of records) {
    const overfull = r.count >= CATEGORY_TARGET_SIZE ? " (at target; no additions)" : "";
    console.log(`- ${r.categoryKey}: ${r.count}${overfull}`);
  }

  const { plan, remaining } = computePlan({ records, nightlyBudget: args.total });

  console.log("Planned additions:");
  for (const [key, count] of plan.entries()) {
    console.log(`- ${key}: +${count}`);
  }
  if (remaining > 0) {
    console.log(`Unspent budget: ${remaining} (all eligible categories may already be at target).`);
  }

  for (const [categoryKey, count] of plan.entries()) {
    if (count <= 0) continue;
    console.log(`\n=== Category: ${categoryKey} (+${count}) ===`);
    runGenerator({ categoryKey, count, args });
  }

  console.log("\nLive trivia generation complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
