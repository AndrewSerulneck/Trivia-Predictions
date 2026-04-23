#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DIR = "data/trivia/categories";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEFAULT_COUNT = 25;
const DEFAULT_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 10;
const MAX_API_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 4000;
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    category: "",
    count: DEFAULT_COUNT,
    batchSize: DEFAULT_BATCH_SIZE,
    model: DEFAULT_MODEL,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dir") {
      args.dir = argv[i + 1] || DEFAULT_DIR;
      i += 1;
      continue;
    }
    if (token === "--category") {
      args.category = (argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--count") {
      args.count = Number.parseInt(argv[i + 1] || `${DEFAULT_COUNT}`, 10);
      i += 1;
      continue;
    }
    if (token === "--batch-size") {
      args.batchSize = Number.parseInt(argv[i + 1] || `${DEFAULT_BATCH_SIZE}`, 10);
      i += 1;
      continue;
    }
    if (token === "--model") {
      args.model = (argv[i + 1] || DEFAULT_MODEL).trim();
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

function normalizeQuestionKey(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toDisplayCategory(fileBaseName) {
  const name = fileBaseName.replace(/\.v\d+$/i, "");
  return name
    .split("-")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : ""))
    .join(" ");
}

function resolveCategoryFile(dir, requestedCategory) {
  const absoluteDir = path.resolve(process.cwd(), dir);
  assert(fs.existsSync(absoluteDir), `Category directory not found: ${absoluteDir}`);
  assert(fs.statSync(absoluteDir).isDirectory(), `Not a directory: ${absoluteDir}`);

  const files = fs
    .readdirSync(absoluteDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert(files.length > 0, `No JSON category files found in ${absoluteDir}`);

  const records = files.map((file) => {
    const filePath = path.join(absoluteDir, file);
    const baseName = file.replace(/\.json$/i, "");
    const categoryKey = baseName.replace(/\.v\d+$/i, "");
    return {
      file,
      filePath,
      categoryKey,
      displayCategory: toDisplayCategory(baseName),
    };
  });

  const requested = requestedCategory.trim().toLowerCase();
  assert(requested.length > 0, `Missing required --category argument.`);

  const byKey = records.find((record) => record.categoryKey.toLowerCase() === requested);
  if (byKey) {
    return { absoluteDir, files, record: byKey };
  }

  const normalized = requested.replace(/\s+/g, "-");
  const byNormalizedKey = records.find((record) => record.categoryKey.toLowerCase() === normalized);
  if (byNormalizedKey) {
    return { absoluteDir, files, record: byNormalizedKey };
  }

  const byDisplay = records.find((record) => record.displayCategory.toLowerCase() === requested);
  if (byDisplay) {
    return { absoluteDir, files, record: byDisplay };
  }

  throw new Error(
    `Unknown category "${requestedCategory}". Available categories: ${records
      .map((record) => record.categoryKey)
      .join(", ")}`
  );
}

function loadAllQuestions(absoluteDir, files) {
  const all = [];
  for (const file of files) {
    const filePath = path.join(absoluteDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    assert(Array.isArray(parsed), `File must contain a JSON array: ${filePath}`);
    all.push(...parsed);
  }
  return all;
}

function extractJsonArray(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Gemini returned an empty response.");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed)) {
    throw new Error("Gemini response JSON is not an array.");
  }
  return parsed;
}

function validateQuestion(item, displayCategory) {
  assert(item && typeof item === "object", "Each generated row must be an object.");

  const question = String(item.question || "").trim();
  assert(question.length > 0, "Generated question is missing question text.");

  assert(Array.isArray(item.options), `Question "${question}" is missing options array.`);
  const options = item.options.map((option) => String(option || "").trim()).filter(Boolean);
  assert(options.length === 4, `Question "${question}" must have exactly 4 options.`);

  const optionSet = new Set(options.map((option) => option.toLowerCase()));
  assert(optionSet.size === 4, `Question "${question}" has duplicate options.`);

  const correctAnswer = Number(item.correctAnswer);
  assert(Number.isInteger(correctAnswer), `Question "${question}" has non-integer correctAnswer.`);
  assert(
    correctAnswer >= 0 && correctAnswer <= 3,
    `Question "${question}" has correctAnswer out of range (0-3).`
  );

  const difficultyRaw = String(item.difficulty || "medium")
    .trim()
    .toLowerCase();
  const difficulty = VALID_DIFFICULTIES.has(difficultyRaw) ? difficultyRaw : "medium";
  const slug = slugify(item.slug || question);

  assert(slug.length > 0, `Question "${question}" produced an empty slug.`);

  return {
    slug,
    question,
    options,
    correctAnswer,
    category: displayCategory,
    difficulty,
  };
}

function buildPrompt({ category, count, existingSample }) {
  return [
    `Generate ${count} multiple-choice trivia questions for the category "${category}".`,
    "Return ONLY a valid JSON array.",
    "Do not include markdown, backticks, commentary, or trailing commas.",
    "Schema for each item:",
    '{ "question": "string", "options": ["A","B","C","D"], "correctAnswer": 0, "difficulty": "easy|medium|hard" }',
    "Rules:",
    "- Exactly 4 options per question",
    "- Exactly one correct answer with 0-based correctAnswer index",
    "- Facts must be accurate and unambiguous",
    "- Avoid repeated questions or near-duplicates",
    "- Mix difficulties naturally across easy/medium/hard",
    "- Keep wording concise and production-ready",
    "- Do not reuse these existing questions (sample):",
    existingSample.length > 0 ? existingSample.map((q) => `  - ${q}`).join("\n") : "  - (none)",
  ].join("\n");
}

async function callGemini({ apiKey, model, prompt }) {
  const fallbackModels = String(process.env.GEMINI_MODEL_FALLBACKS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const modelsToTry = [model, ...fallbackModels.filter((candidate) => candidate !== model)];

  let lastError = null;
  for (const candidateModel of modelsToTry) {
    try {
      return await callGeminiWithRetries({ apiKey, model: candidateModel, prompt });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Model "${candidateModel}" failed: ${message}`);
    }
  }

  throw lastError || new Error("Gemini request failed for all attempted models.");
}

async function callGeminiWithRetries({ apiKey, model, prompt }) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_API_RETRIES; attempt += 1) {
    try {
      return await callGeminiOnce({ apiKey, model, prompt });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt === MAX_API_RETRIES;
      const retryAfterMs = parseRetryAfterMs(message);

      if (isLastAttempt) {
        break;
      }

      if (!isRetriableGeminiError(message)) {
        break;
      }

      const waitMs = retryAfterMs || BASE_RETRY_DELAY_MS * attempt;
      console.warn(
        `Gemini request retry ${attempt}/${MAX_API_RETRIES - 1} for "${model}" in ${Math.round(
          waitMs / 1000
        )}s...`
      );
      await sleep(waitMs);
    }
  }

  throw lastError || new Error("Gemini request failed.");
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
        temperature: 0.8,
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

function parseRetryAfterMs(message) {
  const match = String(message).match(/retry in ([\d.]+)s/i);
  if (!match) {
    return 0;
  }
  const seconds = Number.parseFloat(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.ceil(seconds * 1000);
}

function isRetriableGeminiError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("rate limit") ||
    normalized.includes("retry in")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeQuestions(filePath, rows) {
  const json = JSON.stringify(rows, null, 2);
  fs.writeFileSync(filePath, `${json}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(Number.isInteger(args.count) && args.count > 0, "--count must be a positive integer.");
  assert(
    Number.isInteger(args.batchSize) && args.batchSize > 0,
    "--batch-size must be a positive integer."
  );

  const apiKey = process.env.GEMINI_API_KEY;
  assert(apiKey, "Missing GEMINI_API_KEY in environment.");

  const { absoluteDir, files, record } = resolveCategoryFile(args.dir, args.category);
  const allExisting = loadAllQuestions(absoluteDir, files);
  const targetRaw = fs.readFileSync(record.filePath, "utf8");
  const targetQuestions = JSON.parse(targetRaw);
  assert(Array.isArray(targetQuestions), `Target category file must be a JSON array: ${record.filePath}`);

  const seenSlugs = new Set(allExisting.map((item) => slugify(item?.slug || item?.question || "")).filter(Boolean));
  const seenQuestionKeys = new Set(allExisting.map((item) => normalizeQuestionKey(item?.question || "")).filter(Boolean));

  const existingInCategory = targetQuestions
    .map((item) => String(item?.question || "").trim())
    .filter(Boolean)
    .slice(-40);

  const created = [];
  let attempts = 0;

  while (created.length < args.count && attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const remaining = args.count - created.length;
    const requestCount = Math.min(args.batchSize, remaining);
    const prompt = buildPrompt({
      category: record.displayCategory,
      count: requestCount,
      existingSample: existingInCategory.slice(-15),
    });

    const generated = await callGemini({
      apiKey,
      model: args.model,
      prompt,
    });

    for (const item of generated) {
      if (created.length >= args.count) {
        break;
      }

      const row = validateQuestion(item, record.displayCategory);
      const questionKey = normalizeQuestionKey(row.question);

      if (seenSlugs.has(row.slug) || seenQuestionKeys.has(questionKey)) {
        continue;
      }

      seenSlugs.add(row.slug);
      seenQuestionKeys.add(questionKey);
      existingInCategory.push(row.question);
      created.push(row);
    }

    console.log(
      `Attempt ${attempts}/${MAX_ATTEMPTS}: accepted ${created.length}/${args.count} questions for ${record.categoryKey}`
    );
  }

  assert(
    created.length === args.count,
    `Unable to generate enough unique questions. Created ${created.length}/${args.count}.`
  );

  const merged = [...targetQuestions, ...created];
  if (!args.dryRun) {
    writeQuestions(record.filePath, merged);
  }

  console.log(`${args.dryRun ? "Dry run complete." : "Wrote questions."}`);
  console.log(`Category: ${record.displayCategory}`);
  console.log(`File: ${record.filePath}`);
  console.log(`Added: ${created.length}`);
  console.log(`New total in category file: ${merged.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
