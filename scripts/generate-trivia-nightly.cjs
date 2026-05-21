#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_DIR = "data/trivia/categories";
const DEFAULT_TOTAL = 100;
const DEFAULT_BATCH_SIZE = 25;
const BUCKET_TARGET_SIZE = 50;
const CATEGORY_TARGET_SIZE = BUCKET_TARGET_SIZE * 2;
const DEFAULT_NEW_CATEGORY_COUNT = 1;
const LIVE_BUCKET = "live_open_ended";
const NORMAL_BUCKET = "normal_multiple_choice";
const LIVE_NUMERICAL_SHOWDOWN_MIN_RATIO = 0.1;
const LIVE_NUMERICAL_SHOWDOWN_MAX_RATIO = 0.2;

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    total: DEFAULT_TOTAL,
    batchSize: DEFAULT_BATCH_SIZE,
    model: process.env.GEMINI_MODEL || "",
    dryRun: false,
    newCategoryCount: DEFAULT_NEW_CATEGORY_COUNT,
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
    if (token === "--new-categories") {
      args.newCategoryCount = Number.parseInt(argv[i + 1] || `${DEFAULT_NEW_CATEGORY_COUNT}`, 10);
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toDisplayCategory(fileBaseName) {
  const name = fileBaseName.replace(/\.v\d+$/i, "");
  return name
    .split("-")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : ""))
    .join(" ")
    .trim();
}

function categoryKeyFromFile(file) {
  return file.replace(/\.json$/i, "").replace(/\.v\d+$/i, "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCategoryDocument(parsed, filePath, fallbackCategoryName) {
  if (Array.isArray(parsed)) {
    return {
      categoryName: fallbackCategoryName,
      live_open_ended: [],
      normal_multiple_choice: parsed,
    };
  }

  assert(isPlainObject(parsed), `Category file must be an object or JSON array: ${filePath}`);

  const categoryName = String(parsed.categoryName || fallbackCategoryName).trim() || fallbackCategoryName;
  const live = parsed[LIVE_BUCKET] || [];
  const normal = parsed[NORMAL_BUCKET] || [];

  assert(Array.isArray(live), `${filePath}: "${LIVE_BUCKET}" must be an array.`);
  assert(Array.isArray(normal), `${filePath}: "${NORMAL_BUCKET}" must be an array.`);

  return {
    categoryName,
    live_open_ended: live,
    normal_multiple_choice: normal,
  };
}

function makeCategoryDocument(categoryName) {
  return {
    categoryName,
    [LIVE_BUCKET]: [],
    [NORMAL_BUCKET]: [],
  };
}

function listCategoryRecords(dir) {
  const absoluteDir = path.resolve(process.cwd(), dir);
  assert(fs.existsSync(absoluteDir), `Category directory not found: ${absoluteDir}`);
  assert(fs.statSync(absoluteDir).isDirectory(), `Not a directory: ${absoluteDir}`);

  const files = fs
    .readdirSync(absoluteDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const records = files.map((file) => {
    const filePath = path.join(absoluteDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const categoryKey = categoryKeyFromFile(file);
    const displayCategory = toDisplayCategory(file.replace(/\.json$/i, ""));
    const doc = parseCategoryDocument(parsed, filePath, displayCategory);

    const liveCount = doc.live_open_ended.length;
    const normalCount = doc.normal_multiple_choice.length;

    return {
      file,
      filePath,
      categoryKey,
      displayCategory: doc.categoryName || displayCategory,
      liveCount,
      normalCount,
      currentCount: liveCount + normalCount,
    };
  });

  return { absoluteDir, records };
}

function normalizeCategoryName(value) {
  return String(value || "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateInventedCategoryName(name) {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;

  const tooBroad = new Set([
    "movies",
    "sports",
    "music",
    "history",
    "science",
    "geography",
    "television",
    "tv",
    "pop culture",
    "entertainment",
    "general knowledge",
  ]);
  if (tooBroad.has(normalized.toLowerCase())) return false;

  const tooNicheSignals = ["draft busts", "1980s", "1990s nba", "single season", "backup", "bench"];
  const lower = normalized.toLowerCase();
  if (tooNicheSignals.some((signal) => lower.includes(signal))) return false;

  return true;
}

function extractJsonArray(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Gemini returned an empty response while inventing categories.");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed)) {
    throw new Error("Gemini category response JSON is not an array.");
  }
  return parsed;
}

async function callGeminiOnce({ apiKey, model, prompt }) {
  const endpoint =
    process.env.GEMINI_API_URL ||
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || response.statusText || "Unknown Gemini API error";
    throw new Error(`Gemini API request failed (${response.status}): ${message}`);
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  return extractJsonArray(text);
}

async function inventCategoryCandidates({ apiKey, model, existingDisplayCategories, countHint }) {
  const prompt = [
    `Invent ${Math.max(8, countHint * 6)} brand-new trivia category names for tonight.`,
    "Return ONLY a JSON array of strings.",
    "No markdown, no commentary.",
    "Constraints:",
    "- Categories must be recognizable sub-genres/themes.",
    "- Avoid huge broad categories like Movies, Sports, Music, History.",
    "- Avoid hyper-specific rabbit holes.",
    "- Aim for broad-but-specific themes similar to: Action Movies, Romantic Comedies, Olympians, Soccer Stars, 90s Alternative Rock, Classic Sitcoms, World Capitals.",
    "- Do not repeat or closely mirror these existing categories:",
    existingDisplayCategories.length > 0
      ? existingDisplayCategories.map((item) => `  - ${item}`).join("\n")
      : "  - (none)",
  ].join("\n");

  const rows = await callGeminiOnce({ apiKey, model, prompt });
  const candidates = rows
    .map((entry) => (typeof entry === "string" ? entry : String(entry?.name ?? "")))
    .map(normalizeCategoryName)
    .filter(validateInventedCategoryName);

  return candidates;
}

function ensureCategoryFile({ absoluteDir, categoryName, existingByKey, dryRun }) {
  const key = slugify(categoryName);
  assert(key, `Unable to create category key from invented category: ${categoryName}`);

  if (existingByKey.has(key)) {
    return null;
  }

  const fileName = `${key}.v1.json`;
  const filePath = path.join(absoluteDir, fileName);

  if (!dryRun) {
    fs.writeFileSync(filePath, `${JSON.stringify(makeCategoryDocument(normalizeCategoryName(categoryName)), null, 2)}\n`, "utf8");
  }

  return {
    file: fileName,
    filePath,
    categoryKey: key,
    displayCategory: normalizeCategoryName(categoryName),
    liveCount: 0,
    normalCount: 0,
    currentCount: 0,
  };
}

function computeNightlyPlan({ records, inventedKeys, nightlyBudget }) {
  const byKey = new Map(records.map((record) => [record.categoryKey, record]));
  const underfilled = records
    .map((record) => {
      const liveNeeded = Math.max(0, BUCKET_TARGET_SIZE - record.liveCount);
      const normalNeeded = Math.max(0, BUCKET_TARGET_SIZE - record.normalCount);
      const needed = liveNeeded + normalNeeded;
      return {
        ...record,
        liveNeeded,
        normalNeeded,
        needed,
      };
    })
    .filter((record) => record.needed > 0);

  const plan = new Map();
  let remaining = nightlyBudget;

  const inventedFirst = inventedKeys
    .map((key) => underfilled.find((record) => record.categoryKey === key))
    .filter(Boolean);

  for (const record of inventedFirst) {
    if (remaining <= 0) break;
    const take = Math.min(record.needed, remaining);
    if (take > 0) {
      plan.set(record.categoryKey, take);
      remaining -= take;
    }
  }

  const olderUnderfilled = underfilled
    .filter((record) => !inventedKeys.includes(record.categoryKey))
    .sort((a, b) => {
      if (a.currentCount !== b.currentCount) return a.currentCount - b.currentCount;
      return a.categoryKey.localeCompare(b.categoryKey);
    });

  for (const record of olderUnderfilled) {
    if (remaining <= 0) break;
    const already = plan.get(record.categoryKey) || 0;
    const stillNeeded = Math.max(0, record.needed - already);
    if (stillNeeded <= 0) continue;

    const take = Math.min(stillNeeded, remaining);
    if (take > 0) {
      plan.set(record.categoryKey, already + take);
      remaining -= take;
    }
  }

  return {
    plan,
    remaining,
    byKey,
  };
}

function splitCategoryCountByBucket(record, totalToAdd) {
  let liveNeeded = Math.max(0, BUCKET_TARGET_SIZE - record.liveCount);
  let normalNeeded = Math.max(0, BUCKET_TARGET_SIZE - record.normalCount);
  let remaining = Math.min(totalToAdd, liveNeeded + normalNeeded);

  if (remaining <= 0) {
    return { live: 0, normal: 0 };
  }

  let live = Math.floor(remaining / 2);
  let normal = remaining - live;

  if (live > liveNeeded) {
    const overflow = live - liveNeeded;
    live = liveNeeded;
    normal += overflow;
  }
  if (normal > normalNeeded) {
    const overflow = normal - normalNeeded;
    normal = normalNeeded;
    live += overflow;
  }

  live = Math.min(live, liveNeeded);
  normal = Math.min(normal, normalNeeded);

  let assigned = live + normal;
  while (assigned < remaining && (live < liveNeeded || normal < normalNeeded)) {
    if (live < liveNeeded) {
      live += 1;
      assigned += 1;
      if (assigned >= remaining) break;
    }
    if (normal < normalNeeded) {
      normal += 1;
      assigned += 1;
    }
  }

  return { live, normal };
}

function runGeneratorForCategory({ category, bucket, count, args }) {
  if (count <= 0) return;

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
    "--bucket",
    bucket,
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
    throw new Error(`Generation failed for category "${category}" bucket "${bucket}" with exit code ${result.status ?? 1}.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(Number.isInteger(args.total) && args.total > 0, "--total must be a positive integer.");
  assert(Number.isInteger(args.batchSize) && args.batchSize > 0, "--batch-size must be a positive integer.");
  assert(
    Number.isInteger(args.newCategoryCount) && args.newCategoryCount > 0,
    "--new-categories must be a positive integer."
  );

  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  assert(apiKey, "Missing GEMINI_API_KEY in environment.");

  const model = args.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";

  // Step 1: Read existing files.
  let { absoluteDir, records } = listCategoryRecords(args.dir);
  const existingKeys = new Set(records.map((record) => record.categoryKey.toLowerCase()));
  const existingDisplay = records.map((record) => record.displayCategory);

  // Step 2: Invent sub-genre categories and create new files if missing.
  const candidates = await inventCategoryCandidates({
    apiKey,
    model,
    existingDisplayCategories: existingDisplay,
    countHint: args.newCategoryCount,
  });

  const inventedRecords = [];
  const seenNewKeys = new Set();

  for (const candidate of candidates) {
    if (inventedRecords.length >= args.newCategoryCount) break;
    const key = slugify(candidate);
    if (!key) continue;
    if (existingKeys.has(key.toLowerCase())) continue;
    if (seenNewKeys.has(key.toLowerCase())) continue;

    const created = ensureCategoryFile({
      absoluteDir,
      categoryName: candidate,
      existingByKey: new Map(records.map((record) => [record.categoryKey, true])),
      dryRun: args.dryRun,
    });

    if (created) {
      inventedRecords.push(created);
      seenNewKeys.add(key.toLowerCase());
      existingKeys.add(key.toLowerCase());
    }
  }

  assert(
    inventedRecords.length >= args.newCategoryCount,
    `Unable to invent ${args.newCategoryCount} unique new category(ies) from Gemini output.`
  );

  // Re-read after possible file creation.
  ({ absoluteDir, records } = listCategoryRecords(args.dir));

  // Step 3 + 4: Count each category and backfill with nightly budget up to target size.
  const inventedKeys = inventedRecords.map((record) => record.categoryKey);
  const { plan, remaining, byKey } = computeNightlyPlan({
    records,
    inventedKeys,
    nightlyBudget: args.total,
  });

  console.log(
    `Nightly trivia generation starting. Budget=${args.total}, TargetPerCategory=${CATEGORY_TARGET_SIZE} (${BUCKET_TARGET_SIZE}/${BUCKET_TARGET_SIZE}), Live Numerical Showdowns=${Math.round(LIVE_NUMERICAL_SHOWDOWN_MIN_RATIO * 100)}-${Math.round(LIVE_NUMERICAL_SHOWDOWN_MAX_RATIO * 100)}%`
  );
  console.log("Current category counts:");
  for (const record of records) {
    const overfull = record.currentCount > CATEGORY_TARGET_SIZE ? " (legacy over target; no additions)" : "";
    console.log(
      `- ${record.categoryKey}: total=${record.currentCount} (live=${record.liveCount}, normal=${record.normalCount})${overfull}`
    );
  }

  if (inventedRecords.length > 0) {
    console.log("Newly invented categories:");
    for (const record of inventedRecords) {
      console.log(`- ${record.displayCategory} (${record.categoryKey})`);
    }
  }

  console.log("Planned nightly additions:");
  for (const [categoryKey, addCount] of plan.entries()) {
    const record = byKey.get(categoryKey);
    const split = record ? splitCategoryCountByBucket(record, addCount) : { live: 0, normal: 0 };
    console.log(`- ${categoryKey}: +${addCount} (live=${split.live}, normal=${split.normal})`);
  }
  if (remaining > 0) {
    console.log(`Unspent budget: ${remaining} (all eligible categories may already be at target).`);
  }

  for (const [categoryKey, addCount] of plan.entries()) {
    if (addCount <= 0) continue;
    const record = byKey.get(categoryKey);
    if (!record) continue;

    const split = splitCategoryCountByBucket(record, addCount);
    if (split.live <= 0 && split.normal <= 0) continue;

    console.log(`\n=== Category: ${record.categoryKey} (${addCount}) ===`);
    if (split.live > 0) {
      runGeneratorForCategory({ category: record.categoryKey, bucket: LIVE_BUCKET, count: split.live, args });
    }
    if (split.normal > 0) {
      runGeneratorForCategory({ category: record.categoryKey, bucket: NORMAL_BUCKET, count: split.normal, args });
    }
  }

  console.log("\nNightly trivia generation complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
