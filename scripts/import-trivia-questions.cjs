#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_FILE = "data/trivia/questions.v1.json";
const DEFAULT_DIR = "data/trivia/categories";
const CHUNK_SIZE = 200;

function parseArgs(argv) {
  const args = {
    file: "",
    dir: DEFAULT_DIR,
    checkOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--check") {
      args.checkOnly = true;
      continue;
    }
    if (token === "--file") {
      args.file = argv[i + 1] || DEFAULT_FILE;
      args.dir = "";
      i += 1;
      continue;
    }
    if (token === "--dir") {
      args.dir = argv[i + 1] || DEFAULT_DIR;
      args.file = "";
      i += 1;
    }
  }

  return args;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readQuestionFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  assert(fs.existsSync(absolutePath), `Question file not found: ${absolutePath}`);

  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  assert(Array.isArray(parsed), "Question file must contain a JSON array.");
  return { absolutePath, questions: parsed };
}

function readQuestionDir(dirPath) {
  const absoluteDirPath = path.resolve(process.cwd(), dirPath);
  assert(fs.existsSync(absoluteDirPath), `Question directory not found: ${absoluteDirPath}`);
  assert(fs.statSync(absoluteDirPath).isDirectory(), `Not a directory: ${absoluteDirPath}`);

  const files = fs
    .readdirSync(absoluteDirPath)
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert(files.length > 0, `No .json files found in ${absoluteDirPath}`);

  const merged = [];
  for (const file of files) {
    const filePath = path.join(absoluteDirPath, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    assert(Array.isArray(parsed), `File ${filePath} must contain a JSON array.`);
    merged.push(...parsed.map((item) => ({ ...item, __sourceFile: file })));
  }

  return { absoluteDirPath, files, questions: merged };
}

function normalizeAndValidate(questions) {
  const seenSlugs = new Set();
  const rows = questions.map((item, index) => {
    const rowNumber = index + 1;
    const source = item.__sourceFile ? ` (${item.__sourceFile})` : "";
    assert(item && typeof item === "object", `Row ${rowNumber}${source}: must be an object.`);

    const question = String(item.question ?? "").trim();
    assert(question.length > 0, `Row ${rowNumber}${source}: question is required.`);

    assert(Array.isArray(item.options), `Row ${rowNumber}${source}: options must be an array.`);
    const options = item.options.map((option) => String(option ?? "").trim()).filter(Boolean);
    assert(options.length === 4, `Row ${rowNumber}${source}: options must contain exactly 4 items.`);

    const correctAnswer = Number(item.correctAnswer);
    assert(Number.isInteger(correctAnswer), `Row ${rowNumber}${source}: correctAnswer must be an integer.`);
    assert(
      correctAnswer >= 0 && correctAnswer < options.length,
      `Row ${rowNumber}${source}: correctAnswer is out of range.`
    );

    const category = String(item.category ?? "").trim();
    const difficulty = String(item.difficulty ?? "").trim();

    const providedSlug = String(item.slug ?? "").trim();
    const slug = slugify(providedSlug || question);
    assert(slug.length > 0, `Row ${rowNumber}${source}: slug is empty after normalization.`);
    assert(!seenSlugs.has(slug), `Row ${rowNumber}${source}: duplicate slug "${slug}".`);
    seenSlugs.add(slug);

    return {
      slug,
      question,
      options,
      correct_answer: correctAnswer,
      category: category || null,
      difficulty: difficulty || null,
    };
  });

  return rows;
}

async function upsertRows(rows) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL in environment.");
  assert(serviceRoleKey, "Missing SUPABASE_SERVICE_ROLE_KEY in environment.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let processed = 0;
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    const { error } = await supabase
      .from("trivia_questions")
      .upsert(chunk, { onConflict: "slug" });

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    processed += chunk.length;
    console.log(`Upserted ${processed}/${rows.length} questions...`);
  }

  const { count, error } = await supabase
    .from("trivia_questions")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Count query failed: ${error.message}`);
  }

  console.log(`Done. trivia_questions total rows: ${count ?? "unknown"}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.file ? readQuestionFile(args.file) : readQuestionDir(args.dir || DEFAULT_DIR);
  const rows = normalizeAndValidate(source.questions);

  if ("files" in source) {
    console.log(`Loaded ${rows.length} questions from ${source.files.length} files in ${source.absoluteDirPath}`);
  } else {
    console.log(`Loaded ${rows.length} questions from ${source.absolutePath}`);
  }
  console.log("Validation passed.");

  if (args.checkOnly) {
    console.log("Check mode: no database writes performed.");
    return;
  }

  await upsertRows(rows);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
