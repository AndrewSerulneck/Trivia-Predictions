#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_DIR = "data/trivia/categories";
const DEFAULT_TOTAL = 200;
const DEFAULT_BATCH_SIZE = 25;

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
    if (token === "--dir") {
      args.dir = argv[i + 1] || DEFAULT_DIR;
      i += 1;
      continue;
    }
    if (token === "--total") {
      args.total = Number.parseInt(argv[i + 1] || `${DEFAULT_TOTAL}`, 10);
      i += 1;
      continue;
    }
    if (token === "--batch-size") {
      args.batchSize = Number.parseInt(argv[i + 1] || `${DEFAULT_BATCH_SIZE}`, 10);
      i += 1;
      continue;
    }
    if (token === "--model") {
      args.model = (argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function listCategories(dir) {
  const absoluteDir = path.resolve(process.cwd(), dir);
  assert(fs.existsSync(absoluteDir), `Category directory not found: ${absoluteDir}`);
  assert(fs.statSync(absoluteDir).isDirectory(), `Not a directory: ${absoluteDir}`);

  const files = fs
    .readdirSync(absoluteDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert(files.length > 0, `No category JSON files found in ${absoluteDir}`);

  return files.map((file) => file.replace(/\.json$/i, "").replace(/\.v\d+$/i, ""));
}

function buildCountsByCategory(categories, total) {
  const counts = new Map();
  const base = Math.floor(total / categories.length);
  const remainder = total % categories.length;

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    counts.set(category, base + (index < remainder ? 1 : 0));
  }

  return counts;
}

function runGeneratorForCategory({ category, count, args }) {
  const scriptPath = path.resolve(process.cwd(), "scripts/generate-trivia-questions.cjs");
  const cmdArgs = [
    scriptPath,
    "--dir",
    args.dir,
    "--category",
    category,
    "--count",
    String(count),
    "--batch-size",
    String(args.batchSize),
  ];

  if (args.model) {
    cmdArgs.push("--model", args.model);
  }
  if (args.dryRun) {
    cmdArgs.push("--dry-run");
  }

  const result = spawnSync(process.execPath, cmdArgs, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Generation failed for category "${category}" with exit code ${result.status ?? 1}.`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(Number.isInteger(args.total) && args.total > 0, "--total must be a positive integer.");
  assert(
    Number.isInteger(args.batchSize) && args.batchSize > 0,
    "--batch-size must be a positive integer."
  );

  const categories = listCategories(args.dir);
  const countsByCategory = buildCountsByCategory(categories, args.total);
  const nonZeroCategories = categories.filter((category) => (countsByCategory.get(category) || 0) > 0);

  console.log(
    `Nightly trivia generation starting for ${args.total} total across ${categories.length} categories.`
  );

  for (const category of nonZeroCategories) {
    const count = countsByCategory.get(category) || 0;
    console.log(`\n=== Category: ${category} (${count}) ===`);
    runGeneratorForCategory({ category, count, args });
  }

  console.log("\nNightly trivia generation complete.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
