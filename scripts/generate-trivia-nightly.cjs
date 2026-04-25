#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_DIR = "data/trivia/categories";
const DEFAULT_TOTAL = 100;
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

  return files.map((file) => {
    const filePath = path.join(absoluteDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    assert(Array.isArray(parsed), `Category file must contain a JSON array: ${filePath}`);

    return {
      file,
      category: file.replace(/\.json$/i, "").replace(/\.v\d+$/i, ""),
      currentCount: parsed.length,
    };
  });
}

function buildCountsByCategory(records, total) {
  assert(total >= 0, "--total must be zero or greater.");

  const counts = new Map();
  for (const record of records) {
    counts.set(record.category, 0);
  }

  const allocationState = records.map((record) => ({
    category: record.category,
    totalAfterAllocation: record.currentCount,
    assignedTonight: 0,
  }));

  // Balance strategy:
  // - Always assign the next question to the category with the lowest total count.
  // - Once categories are close/equal, tie-break by tonight's assigned count, then slug.
  // This naturally evens out underfilled categories first, then shifts to even distribution.
  for (let i = 0; i < total; i += 1) {
    allocationState.sort((a, b) => {
      if (a.totalAfterAllocation !== b.totalAfterAllocation) {
        return a.totalAfterAllocation - b.totalAfterAllocation;
      }
      if (a.assignedTonight !== b.assignedTonight) {
        return a.assignedTonight - b.assignedTonight;
      }
      return a.category.localeCompare(b.category);
    });

    const target = allocationState[0];
    target.assignedTonight += 1;
    target.totalAfterAllocation += 1;
    counts.set(target.category, target.assignedTonight);
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
    "--allow-partial",
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
  const nonZeroCategories = categories.filter(
    (record) => (countsByCategory.get(record.category) || 0) > 0
  );

  console.log(
    `Nightly trivia generation starting for ${args.total} total across ${categories.length} categories.`
  );
  console.log("Current category counts:");
  for (const record of categories) {
    console.log(`- ${record.category}: ${record.currentCount}`);
  }
  console.log("Planned nightly additions:");
  for (const record of categories) {
    console.log(`- ${record.category}: +${countsByCategory.get(record.category) || 0}`);
  }

  for (const record of nonZeroCategories) {
    const count = countsByCategory.get(record.category) || 0;
    console.log(`\n=== Category: ${record.category} (${count}) ===`);
    runGeneratorForCategory({ category: record.category, count, args });
  }

  console.log("\nNightly trivia generation complete.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
