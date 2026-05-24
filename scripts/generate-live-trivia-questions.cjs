#!/usr/bin/env node
/**
 * Generates write-in trivia questions for data/live-trivia/categories/.
 *
 * Unlike the speed-trivia generator, questions here have no options array.
 * The answer must be a definitive short string a player can type unaided.
 *
 * Usage:
 *   node scripts/generate-live-trivia-questions.cjs \
 *     --dir data/live-trivia/categories \
 *     --category general-knowledge \
 *     --count 25 \
 *     [--batch-size 25] [--model gemini-2.5-flash] [--allow-partial] [--dry-run]
 */

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DIR = "data/live-trivia/categories";
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
    familiarity: "", // "mainstream" | "moderate" | "niche" — overrides value in JSON if provided
    allowPartial: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dir") { args.dir = argv[i + 1] || DEFAULT_DIR; i += 1; continue; }
    if (token === "--category") { args.category = (argv[i + 1] || "").trim(); i += 1; continue; }
    if (token === "--count") { args.count = Number.parseInt(argv[i + 1] || `${DEFAULT_COUNT}`, 10); i += 1; continue; }
    if (token === "--batch-size") { args.batchSize = Number.parseInt(argv[i + 1] || `${DEFAULT_BATCH_SIZE}`, 10); i += 1; continue; }
    if (token === "--model") { args.model = (argv[i + 1] || DEFAULT_MODEL).trim(); i += 1; continue; }
    if (token === "--familiarity") { args.familiarity = (argv[i + 1] || "").trim().toLowerCase(); i += 1; continue; }
    if (token === "--dry-run") { args.dryRun = true; continue; }
    if (token === "--allow-partial") { args.allowPartial = true; }
  }

  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  return String(question || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toDisplayCategory(fileBaseName) {
  const name = fileBaseName.replace(/\.v\d+$/i, "");
  return name.split("-").map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")).join(" ");
}

function resolveCategoryFile(dir, requestedCategory) {
  const absoluteDir = path.resolve(process.cwd(), dir);
  assert(fs.existsSync(absoluteDir), `Category directory not found: ${absoluteDir}`);
  assert(fs.statSync(absoluteDir).isDirectory(), `Not a directory: ${absoluteDir}`);

  const files = fs.readdirSync(absoluteDir).filter((name) => name.endsWith(".json")).sort();
  assert(files.length > 0, `No JSON category files found in ${absoluteDir}`);

  const records = files.map((file) => {
    const filePath = path.join(absoluteDir, file);
    const baseName = file.replace(/\.json$/i, "");
    const categoryKey = baseName.replace(/\.v\d+$/i, "");
    return { file, filePath, categoryKey, displayCategory: toDisplayCategory(baseName) };
  });

  const requested = requestedCategory.trim().toLowerCase();
  assert(requested.length > 0, "Missing required --category argument.");

  const byKey = records.find((r) => r.categoryKey.toLowerCase() === requested);
  if (byKey) return { absoluteDir, files, record: byKey };

  const normalized = requested.replace(/\s+/g, "-");
  const byNorm = records.find((r) => r.categoryKey.toLowerCase() === normalized);
  if (byNorm) return { absoluteDir, files, record: byNorm };

  const byDisplay = records.find((r) => r.displayCategory.toLowerCase() === requested);
  if (byDisplay) return { absoluteDir, files, record: byDisplay };

  throw new Error(
    `Unknown category "${requestedCategory}". Available: ${records.map((r) => r.categoryKey).join(", ")}`
  );
}

const VALID_FAMILIARITY = new Set(["mainstream", "moderate", "niche"]);

function parseLiveCategoryDocument(parsed, fallbackCategoryName) {
  if (Array.isArray(parsed)) {
    return { categoryName: fallbackCategoryName, questions: parsed, familiarity: "" };
  }
  const categoryName = String(parsed.categoryName || fallbackCategoryName).trim() || fallbackCategoryName;
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const familiarity = VALID_FAMILIARITY.has(String(parsed.familiarity || "")) ? String(parsed.familiarity) : "";
  return { categoryName, questions, familiarity };
}

function loadAllQuestions(absoluteDir, files) {
  const all = [];
  for (const file of files) {
    const filePath = path.join(absoluteDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const displayCategory = toDisplayCategory(file.replace(/\.json$/i, ""));
    const doc = parseLiveCategoryDocument(parsed, displayCategory);
    all.push(...doc.questions);
  }
  return all;
}

function validateQuestion(item, displayCategory) {
  assert(item && typeof item === "object", "Each generated row must be an object.");

  const question = String(item.question || "").trim();
  assert(question.length > 0, "Generated question is missing question text.");

  const answer = String(item.answer || "").trim();
  assert(answer.length > 0, `Question "${question}" is missing answer text.`);

  const difficultyRaw = String(item.difficulty || "medium").trim().toLowerCase();
  const difficulty = VALID_DIFFICULTIES.has(difficultyRaw) ? difficultyRaw : "medium";
  const slug = slugify(item.slug || question);
  assert(slug.length > 0, `Question "${question}" produced an empty slug.`);

  return { slug, question, answer, answer_format: "write_in", category: displayCategory, difficulty };
}

function buildFamiliarityClause(familiarity) {
  if (familiarity === "niche") {
    return [
      "- ACCESSIBILITY REQUIREMENT — this is a niche/specialized category. Every answer must be",
      "  something a casual fan or general member of the public would recognize, even if they have",
      "  never explored this topic in depth.",
      "  Ask only about the most globally iconic examples: the most famous titles, main characters,",
      "  award-winning works, best-known scenes, or widely covered milestones in this topic.",
      "  Do NOT ask about obscure side characters, minor works, rare editions, or details that only",
      "  dedicated enthusiasts or deep experts would know.",
      "  Concrete standard: if you picked a random adult from a crowded sports bar, would they",
      "  recognize the answer? If not, choose a different question.",
      "  Example for 'Fantasy Epics': ask about Jon Snow, Frodo Baggins, or Hogwarts — not about",
      "  a side character from a lesser-known novel or a niche plot detail within a larger series.",
    ].join("\n");
  }
  if (familiarity === "moderate") {
    return [
      "- Focus questions on well-known aspects, major events, landmark achievements, and widely",
      "  recognized figures within this topic. Lean toward questions that an engaged general-",
      "  knowledge player would have a fair chance of knowing.",
      "  Avoid deep-cut facts that only specialists or enthusiasts would know.",
    ].join("\n");
  }
  return ""; // mainstream — no extra constraint needed
}

function buildPrompt({ category, count, existingSample, familiarity }) {
  const familiarityClause = buildFamiliarityClause(familiarity || "");

  const lines = [
    `Generate ${count} write-in trivia questions for the category "${category}".`,
    "Return ONLY a valid JSON array. No markdown, backticks, or commentary.",
    "Schema for each item:",
    '{ "question": "string", "answer": "string", "difficulty": "easy|medium|hard" }',
    "Rules:",
    "- No options array — the player must type the answer without hints.",
    "- Every answer must be a definitive, uniquely correct short phrase (1-3 words preferred).",
    "- Correct answers must be a proper noun, person/place name, team, specific year, exact date, or clear standalone number.",
    "- Avoid conceptual, abstract, or subjective answers that have multiple valid forms.",
    "- Roughly 10-20% should have purely numeric answers (3+ digits) as 'Numerical Showdowns'.",
    "- For Numerical Showdowns the answer must be a single specific number with no range/approximation.",
    "- Facts must be accurate and unambiguous.",
    "- Mix difficulties across easy/medium/hard.",
    "- Keep question wording concise and production-ready.",
  ];

  if (familiarityClause) lines.push(familiarityClause);

  lines.push(
    "- Do not reuse these existing questions (sample):",
    existingSample.length > 0 ? existingSample.map((q) => `  - ${q}`).join("\n") : "  - (none)",
  );

  return lines.join("\n");
}

async function callGemini({ apiKey, model, prompt }) {
  const fallbackModels = String(process.env.GEMINI_MODEL_FALLBACKS || "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const modelsToTry = [model, ...fallbackModels.filter((m) => m !== model)];

  let lastError = null;
  for (const candidateModel of modelsToTry) {
    try {
      return await callGeminiWithRetries({ apiKey, model: candidateModel, prompt });
    } catch (error) {
      lastError = error;
      console.warn(`Model "${candidateModel}" failed: ${error instanceof Error ? error.message : String(error)}`);
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
      if (attempt === MAX_API_RETRIES || !isRetriableGeminiError(message)) break;
      const retryAfterMs = parseRetryAfterMs(message);
      const waitMs = retryAfterMs || BASE_RETRY_DELAY_MS * attempt;
      console.warn(`Gemini retry ${attempt}/${MAX_API_RETRIES - 1} for "${model}" in ${Math.round(waitMs / 1000)}s...`);
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
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
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

function extractJsonArray(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Gemini returned an empty response.");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed)) throw new Error("Gemini response JSON is not an array.");
  return parsed;
}

function parseRetryAfterMs(message) {
  const match = String(message).match(/retry in ([\d.]+)s/i);
  if (!match) return 0;
  const seconds = Number.parseFloat(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 0;
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

function writeLiveCategoryDocument(filePath, doc) {
  fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(Number.isInteger(args.count) && args.count > 0, "--count must be a positive integer.");
  assert(Number.isInteger(args.batchSize) && args.batchSize > 0, "--batch-size must be a positive integer.");

  const apiKey = process.env.GEMINI_API_KEY;
  assert(apiKey, "Missing GEMINI_API_KEY in environment.");

  const { absoluteDir, files, record } = resolveCategoryFile(args.dir, args.category);
  const allExisting = loadAllQuestions(absoluteDir, files);
  const targetRaw = fs.readFileSync(record.filePath, "utf8");
  const targetParsed = JSON.parse(targetRaw);
  const targetDoc = parseLiveCategoryDocument(targetParsed, record.displayCategory);

  const seenSlugs = new Set(allExisting.map((item) => slugify(item?.slug || item?.question || "")).filter(Boolean));
  const seenQuestionKeys = new Set(allExisting.map((item) => normalizeQuestionKey(item?.question || "")).filter(Boolean));

  const existingInBucket = targetDoc.questions
    .map((item) => String(item?.question || "").trim())
    .filter(Boolean)
    .slice(-40);

  // CLI arg overrides the value in the JSON (useful for manual re-runs).
  const familiarity = args.familiarity || targetDoc.familiarity || "";
  if (familiarity) {
    console.log(`Category familiarity: ${familiarity}`);
  }

  const created = [];
  let attempts = 0;

  while (created.length < args.count && attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const remaining = args.count - created.length;
    const requestCount = Math.min(args.batchSize, remaining);
    const prompt = buildPrompt({
      category: targetDoc.categoryName || record.displayCategory,
      count: requestCount,
      existingSample: existingInBucket.slice(-15),
      familiarity,
    });

    const generated = await callGemini({ apiKey, model: args.model, prompt });

    for (const item of generated) {
      if (created.length >= args.count) break;
      const row = validateQuestion(item, targetDoc.categoryName || record.displayCategory);
      const questionKey = normalizeQuestionKey(row.question);
      if (seenSlugs.has(row.slug) || seenQuestionKeys.has(questionKey)) continue;
      seenSlugs.add(row.slug);
      seenQuestionKeys.add(questionKey);
      existingInBucket.push(row.question);
      created.push(row);
    }

    console.log(
      `Attempt ${attempts}/${MAX_ATTEMPTS}: accepted ${created.length}/${args.count} live questions for ${record.categoryKey}`
    );
  }

  if (created.length !== args.count) {
    const message = `Unable to generate enough unique questions. Created ${created.length}/${args.count}.`;
    if (!args.allowPartial) throw new Error(message);
    console.warn(`${message} Continuing because --allow-partial is enabled.`);
  }

  const mergedDoc = {
    categoryName: targetDoc.categoryName || record.displayCategory,
    questions: [...targetDoc.questions, ...created],
  };

  if (!args.dryRun && created.length > 0) {
    writeLiveCategoryDocument(record.filePath, mergedDoc);
    console.log("Wrote questions.");
  } else if (args.dryRun) {
    console.log("Dry run complete.");
  } else {
    console.log("No new questions written.");
  }

  console.log(`Category: ${mergedDoc.categoryName}`);
  console.log(`File: ${record.filePath}`);
  console.log(`Added: ${created.length}`);
  console.log(`Total after write: ${mergedDoc.questions.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
