#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_FILE = "data/trivia/questions.v1.json";
const DEFAULT_DIR = "data/trivia/categories";
const CHUNK_SIZE = 200;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 3000;

// GitHub-hosted runners can prefer IPv6 first; forcing IPv4 first avoids intermittent
// fetch failures when a provider endpoint has partial IPv6 reachability.
dns.setDefaultResultOrder("ipv4first");
const IPV4_DISPATCHER = getIpv4Dispatcher();

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
  const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL in environment.");
  assert(serviceRoleKey, "Missing SUPABASE_SERVICE_ROLE_KEY in environment.");
  assert(
    /^https?:\/\//i.test(supabaseUrl),
    "NEXT_PUBLIC_SUPABASE_URL must start with http:// or https:// (no quotes)."
  );
  assert(
    !/^".*"$/.test(supabaseUrl),
    'NEXT_PUBLIC_SUPABASE_URL appears wrapped in quotes. Store raw value without quotes.'
  );
  assert(
    !/^".*"$/.test(serviceRoleKey),
    'SUPABASE_SERVICE_ROLE_KEY appears wrapped in quotes. Store raw value without quotes.'
  );
  const hostname = new URL(supabaseUrl).hostname.toLowerCase();
  assert(
    !["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname),
    `NEXT_PUBLIC_SUPABASE_URL points to a local host (${hostname}). Use your production Supabase project URL for CI.`
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { fetch: createDiagnosticFetch() },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await verifyConnectivity(supabaseUrl);

  let processed = 0;
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    await retryAsync(
      async () => {
        const { error } = await supabase
          .from("trivia_questions")
          .upsert(chunk, { onConflict: "slug" });

        if (error) {
          throw new Error(`Supabase upsert failed: ${describeError(error)}`);
        }
      },
      {
        operation: `upsert chunk ${Math.floor(start / CHUNK_SIZE) + 1}`,
      }
    );

    processed += chunk.length;
    console.log(`Upserted ${processed}/${rows.length} questions...`);
  }

  const { count, error } = await retryAsync(
    async () => {
      return supabase
        .from("trivia_questions")
        .select("*", { count: "exact", head: true });
    },
    {
      operation: "count query",
    }
  );

  if (error) {
    throw new Error(`Count query failed: ${describeError(error)}`);
  }

  console.log(`Done. trivia_questions total rows: ${count ?? "unknown"}`);
}

async function retryAsync(fn, options) {
  const operation = options?.operation || "operation";
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const detail = describeError(error);
      const isLast = attempt === MAX_RETRIES;
      const retriable = isRetriableNetworkError(`${message} ${detail}`);

      if (!retriable || isLast) {
        throw new Error(`${operation} failed after ${attempt} attempt(s): ${detail}`);
      }

      const waitMs = BASE_RETRY_DELAY_MS * attempt;
      console.warn(
        `${operation} attempt ${attempt}/${MAX_RETRIES} failed (${message}). Retrying in ${Math.round(
          waitMs / 1000
        )}s...`
      );
      await sleep(waitMs);
    }
  }

  throw lastError || new Error(`${operation} failed.`);
}

function isRetriableNetworkError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("econnreset") ||
    normalized.includes("econnrefused") ||
    normalized.includes("etimedout") ||
    normalized.includes("eai_again") ||
    normalized.includes("enotfound") ||
    normalized.includes("socket hang up") ||
    normalized.includes("503") ||
    normalized.includes("504")
  );
}

function normalizeEnvValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createDiagnosticFetch() {
  return async (resource, init = {}) => {
    const requestUrl = getRequestUrl(resource);
    try {
      const fetchInit = IPV4_DISPATCHER
        ? { ...init, dispatcher: init.dispatcher || IPV4_DISPATCHER }
        : init;
      return await fetch(resource, fetchInit);
    } catch (error) {
      throw await withNetworkDiagnostics(error, requestUrl);
    }
  };
}

async function verifyConnectivity(supabaseUrl) {
  const origin = getOrigin(supabaseUrl);
  if (!origin) return;

  try {
    const fetchInit = IPV4_DISPATCHER ? { method: "HEAD", dispatcher: IPV4_DISPATCHER } : { method: "HEAD" };
    await fetch(origin, fetchInit);
    console.log(`Supabase connectivity preflight succeeded for ${origin}.`);
  } catch (error) {
    throw await withNetworkDiagnostics(error, origin);
  }
}

function getOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getRequestUrl(resource) {
  if (typeof resource === "string") return resource;
  if (resource && typeof resource.url === "string") return resource.url;
  return "";
}

async function withNetworkDiagnostics(error, requestUrl) {
  try {
    const hostname = requestUrl ? new URL(requestUrl).hostname : "";
    if (!hostname) return error;

    const records = await dns.promises.lookup(hostname, { all: true, family: 4 });
    const ips = records.map((entry) => entry.address).filter(Boolean);
    if (ips.length === 0) return error;

    const details = `IPv4 DNS for ${hostname}: ${ips.join(", ")}`;
    if (error instanceof Error) {
      return new Error(`${error.message} | ${details}`, { cause: error });
    }
    return new Error(`${String(error)} | ${details}`);
  } catch {
    return error;
  }
}

function getIpv4Dispatcher() {
  try {
    // Optional dependency: available in some Node runtimes. If absent,
    // we still keep DNS + error diagnostics.
    const { Agent } = require("undici");
    return new Agent({ connect: { family: 4 } });
  } catch {
    return null;
  }
}

function describeError(error) {
  if (!error) return "Unknown error";

  const parts = [];
  let current = error;
  let depth = 0;

  while (current && depth < 5) {
    if (current instanceof Error) {
      if (current.message) {
        parts.push(current.message);
      } else {
        parts.push(current.name || "Error");
      }

      if (typeof current.code === "string") parts.push(`code=${current.code}`);
      if (typeof current.errno === "number") parts.push(`errno=${current.errno}`);
      if (typeof current.type === "string") parts.push(`type=${current.type}`);
      if (typeof current.address === "string") parts.push(`address=${current.address}`);
      if (typeof current.port === "number") parts.push(`port=${current.port}`);

      current = current.cause;
      depth += 1;
      continue;
    }

    if (typeof current === "object") {
      if (typeof current.message === "string") parts.push(current.message);
      if (typeof current.code === "string") parts.push(`code=${current.code}`);
      if (typeof current.details === "string") parts.push(current.details);
      if (typeof current.hint === "string") parts.push(current.hint);
      break;
    }

    parts.push(String(current));
    break;
  }

  return Array.from(new Set(parts.filter(Boolean))).join(" | ") || "Unknown error";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
