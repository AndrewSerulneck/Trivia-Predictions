#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_FILE = "data/trivia/questions.v1.json";
const DEFAULT_DIR = "data/trivia/categories";
const DEFAULT_LIVE_DIR = "data/live-trivia/categories";
const CHUNK_SIZE = 200;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 3000;
const NORMAL_BUCKET = "normal_multiple_choice";
const ANYTIME_POOL = "anytime_blitz";
const LIVE_POOL = "live_showdown";
const QUESTIONS_PER_ROUND = 15;

// GitHub-hosted runners can prefer IPv6 first; forcing IPv4 first avoids intermittent
// fetch failures when a provider endpoint has partial IPv6 reachability.
dns.setDefaultResultOrder("ipv4first");
const IPV4_DISPATCHER = getIpv4Dispatcher();

function parseArgs(argv) {
  const args = {
    file: "",
    dir: DEFAULT_DIR,
    liveDir: "",
    checkOnly: false,
    prune: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--check") {
      args.checkOnly = true;
      continue;
    }
    if (token === "--prune") {
      args.prune = true;
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
      continue;
    }
    if (token === "--live-dir") {
      args.liveDir = argv[i + 1] || DEFAULT_LIVE_DIR;
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readCategoryPayload(parsed, sourceLabel) {
  if (Array.isArray(parsed)) {
    return parsed.map((item) => ({
      ...item,
      __questionPool: ANYTIME_POOL,
      __answerFormat: "multiple_choice",
    }));
  }

  assert(isPlainObject(parsed), `${sourceLabel} must contain either an array or object.`);

  const normal = parsed[NORMAL_BUCKET] || [];
  assert(Array.isArray(normal), `${sourceLabel}: "${NORMAL_BUCKET}" must be an array.`);

  return normal.map((item) => ({ ...item, __questionPool: ANYTIME_POOL, __answerFormat: "multiple_choice" }));
}

function readLiveCategoryPayload(parsed, sourceLabel) {
  assert(isPlainObject(parsed), `${sourceLabel} must contain an object.`);
  const questions = parsed.questions || [];
  assert(Array.isArray(questions), `${sourceLabel}: "questions" must be an array.`);
  return questions.map((item) => ({ ...item, __questionPool: LIVE_POOL, __answerFormat: "write_in" }));
}

function readQuestionFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  assert(fs.existsSync(absolutePath), `Question file not found: ${absolutePath}`);

  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  const questions = readCategoryPayload(parsed, absolutePath);

  return { absolutePath, questions };
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
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
      console.warn(`Warning: skipping empty file ${file}`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`Warning: skipping malformed JSON in ${file}`);
      continue;
    }
    const rows = readCategoryPayload(parsed, filePath);
    merged.push(...rows.map((item) => ({ ...item, __sourceFile: file })));
  }

  return { absoluteDirPath, files, questions: merged };
}

function readLiveQuestionDir(dirPath) {
  const absoluteDirPath = path.resolve(process.cwd(), dirPath);
  assert(fs.existsSync(absoluteDirPath), `Live trivia directory not found: ${absoluteDirPath}`);
  assert(fs.statSync(absoluteDirPath).isDirectory(), `Not a directory: ${absoluteDirPath}`);

  const files = fs
    .readdirSync(absoluteDirPath)
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert(files.length > 0, `No .json files found in ${absoluteDirPath}`);

  const merged = [];
  for (const file of files) {
    const filePath = path.join(absoluteDirPath, file);
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
      console.warn(`Warning: skipping empty file ${file}`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`Warning: skipping malformed JSON in ${file}`);
      continue;
    }
    const rows = readLiveCategoryPayload(parsed, filePath);
    merged.push(...rows.map((item) => ({ ...item, __sourceFile: file })));
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

    const category = String(item.category ?? "").trim();
    const difficulty = String(item.difficulty ?? "").trim();

    const providedSlug = String(item.slug ?? "").trim();
    const slug = slugify(providedSlug || question);
    assert(slug.length > 0, `Row ${rowNumber}${source}: slug is empty after normalization.`);
    assert(!seenSlugs.has(slug), `Row ${rowNumber}${source}: duplicate slug "${slug}".`);
    seenSlugs.add(slug);

    const questionPoolRaw = String(item.__questionPool ?? ANYTIME_POOL).trim();
    const question_pool = questionPoolRaw === LIVE_POOL ? LIVE_POOL : ANYTIME_POOL;
    const answerFormatRaw = String(item.__answerFormat ?? "multiple_choice").trim();
    const answer_format =
      answerFormatRaw === "write_in" || answerFormatRaw === "numeric" || answerFormatRaw === "true_false"
        ? answerFormatRaw
        : "multiple_choice";

    // Live trivia questions use a plain `answer` string; store as options[0] with correct_answer=0.
    if (answer_format !== "multiple_choice") {
      const answer = String(item.answer ?? (Array.isArray(item.options) ? item.options[0] : "") ?? "").trim();
      assert(answer.length > 0, `Row ${rowNumber}${source}: answer is required for non-MC questions.`);
      return {
        slug,
        question,
        options: [answer],
        correct_answer: 0,
        category: category || null,
        difficulty: difficulty || null,
        question_pool,
        answer_format,
      };
    }

    assert(Array.isArray(item.options), `Row ${rowNumber}${source}: options must be an array.`);
    const options = item.options.map((option) => String(option ?? "").trim()).filter(Boolean);
    assert(options.length === 4, `Row ${rowNumber}${source}: options must contain exactly 4 items.`);

    const correctAnswer = Number(item.correctAnswer);
    assert(Number.isInteger(correctAnswer), `Row ${rowNumber}${source}: correctAnswer must be an integer.`);
    assert(
      correctAnswer >= 0 && correctAnswer < options.length,
      `Row ${rowNumber}${source}: correctAnswer is out of range.`
    );

    return {
      slug,
      question,
      options,
      correct_answer: correctAnswer,
      category: category || null,
      difficulty: difficulty || null,
      question_pool,
      answer_format,
    };
  });

  return rows;
}

async function pruneStaleRows(supabase, localSlugs, pool) {
  const PAGE_SIZE = 1000;
  const dbSlugs = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("trivia_questions")
      .select("slug")
      .eq("question_pool", pool)
      .not("slug", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch ${pool} slugs: ${describeError(error)}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.slug) dbSlugs.add(row.slug);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const stale = [...dbSlugs].filter((slug) => !localSlugs.has(slug));
  if (stale.length === 0) {
    console.log(`Prune [${pool}]: no stale questions found.`);
    return;
  }

  // Delete in batches to stay within Supabase query-size limits.
  const BATCH = 200;
  let pruned = 0;
  for (let start = 0; start < stale.length; start += BATCH) {
    const batch = stale.slice(start, start + BATCH);

    // Remove all referencing rows first (FK ON DELETE RESTRICT).
    const { error: sqError } = await supabase
      .from("trivia_session_questions")
      .delete()
      .in("question_id", batch);
    if (sqError) throw new Error(`Failed to remove schedule mappings: ${describeError(sqError)}`);

    const { error: answerError } = await supabase
      .from("live_showdown_answers")
      .delete()
      .in("question_id", batch);
    if (answerError) throw new Error(`Failed to remove live showdown answers: ${describeError(answerError)}`);

    const { error: delError } = await supabase
      .from("trivia_questions")
      .delete()
      .in("slug", batch);
    if (delError) throw new Error(`Failed to delete stale questions: ${describeError(delError)}`);

    pruned += batch.length;
  }

  console.log(`Prune [${pool}]: deleted ${pruned} stale question(s).`);
}

async function upsertRows(rows, { prune = false } = {}) {
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

  if (prune) {
    const liveSlugs = new Set(rows.filter((r) => r.question_pool === LIVE_POOL).map((r) => r.slug).filter(Boolean));
    const speedSlugs = new Set(rows.filter((r) => r.question_pool === ANYTIME_POOL).map((r) => r.slug).filter(Boolean));
    if (liveSlugs.size > 0) await pruneStaleRows(supabase, liveSlugs, LIVE_POOL);
    if (speedSlugs.size > 0) await pruneStaleRows(supabase, speedSlugs, ANYTIME_POOL);
  }

  await autoFillUpcomingLiveShowdownSchedules(supabase);

  console.log(`Done. trivia_questions total rows: ${count ?? "unknown"}`);
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

async function autoFillUpcomingLiveShowdownSchedules(supabase) {
  const nowIso = new Date().toISOString();
  const { data: schedules, error: schedulesError } = await supabase
    .from("trivia_schedules")
    .select("id, num_rounds, start_time")
    .gt("start_time", nowIso)
    .order("start_time", { ascending: true })
    .limit(200);

  if (schedulesError) {
    throw new Error(`Failed to load upcoming trivia schedules: ${describeError(schedulesError)}`);
  }
  if (!Array.isArray(schedules) || schedules.length === 0) {
    console.log("No upcoming schedules found to auto-fill.");
    return;
  }

  const scheduleIds = schedules.map((row) => String(row.id ?? "").trim()).filter(Boolean);
  const { data: existingRows, error: existingError } = await supabase
    .from("trivia_session_questions")
    .select("schedule_id, round_number, question_index, question_id")
    .in("schedule_id", scheduleIds);

  if (existingError) {
    throw new Error(`Failed to load existing schedule mappings: ${describeError(existingError)}`);
  }

  const { data: livePoolRows, error: livePoolError } = await supabase
    .from("trivia_questions")
    .select("slug")
    .eq("question_pool", LIVE_POOL)
    .not("slug", "is", null)
    .limit(20000);

  if (livePoolError) {
    throw new Error(`Failed to load live_showdown question pool: ${describeError(livePoolError)}`);
  }

  const liveSlugs = Array.from(
    new Set(
      (livePoolRows ?? [])
        .map((row) => String(row.slug ?? "").trim())
        .filter(Boolean)
    )
  );
  if (liveSlugs.length === 0) {
    console.log("No live_showdown questions available for schedule auto-fill.");
    return;
  }

  const existingBySchedule = new Map();
  for (const row of existingRows ?? []) {
    const scheduleId = String(row.schedule_id ?? "").trim();
    if (!scheduleId) continue;
    const list = existingBySchedule.get(scheduleId) ?? [];
    list.push({
      roundNumber: Number(row.round_number),
      questionIndex: Number(row.question_index),
      questionId: String(row.question_id ?? "").trim(),
    });
    existingBySchedule.set(scheduleId, list);
  }

  const insertRows = [];

  for (const schedule of schedules) {
    const scheduleId = String(schedule.id ?? "").trim();
    if (!scheduleId) continue;
    const numRounds = Math.max(1, Math.min(24, Math.floor(Number(schedule.num_rounds) || 1)));
    const existingForSchedule = existingBySchedule.get(scheduleId) ?? [];
    const occupiedSlots = new Set(
      existingForSchedule
        .map((row) => `${row.roundNumber}:${row.questionIndex}`)
    );
    const usedQuestionIds = new Set(
      existingForSchedule
        .map((row) => String(row.questionId ?? "").trim())
        .filter(Boolean)
    );

    const shuffledCandidates = shuffleInPlace([...liveSlugs]);
    let candidateCursor = 0;

    for (let roundNumber = 1; roundNumber <= numRounds; roundNumber += 1) {
      for (let questionIndex = 1; questionIndex <= QUESTIONS_PER_ROUND; questionIndex += 1) {
        const slotKey = `${roundNumber}:${questionIndex}`;
        if (occupiedSlots.has(slotKey)) {
          continue;
        }

        let nextQuestionId = "";
        while (candidateCursor < shuffledCandidates.length) {
          const candidate = shuffledCandidates[candidateCursor] ?? "";
          candidateCursor += 1;
          if (candidate && !usedQuestionIds.has(candidate)) {
            nextQuestionId = candidate;
            break;
          }
        }

        if (!nextQuestionId) {
          nextQuestionId = shuffledCandidates[Math.floor(Math.random() * shuffledCandidates.length)] ?? "";
        }
        if (!nextQuestionId) {
          continue;
        }

        usedQuestionIds.add(nextQuestionId);
        occupiedSlots.add(slotKey);
        insertRows.push({
          schedule_id: scheduleId,
          question_id: nextQuestionId,
          round_number: roundNumber,
          question_index: questionIndex,
        });
      }
    }
  }

  if (insertRows.length === 0) {
    console.log("Upcoming schedules already have full question mappings.");
    return;
  }

  const { error: insertError } = await supabase
    .from("trivia_session_questions")
    .insert(insertRows);

  if (insertError) {
    throw new Error(`Failed to auto-fill schedule question mappings: ${describeError(insertError)}`);
  }

  console.log(`Auto-filled ${insertRows.length} missing upcoming trivia_session_questions slots.`);
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
  const hostname = new URL(origin).hostname;

  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    const formatted = records.map((entry) => `${entry.address} (IPv${entry.family})`).join(", ");
    if (formatted) {
      console.log(`Supabase DNS lookup for ${hostname}: ${formatted}`);
    }
  } catch (error) {
    throw new Error(`Supabase DNS lookup failed for ${hostname}: ${describeError(error)}`);
  }

  try {
    const fetchInit = IPV4_DISPATCHER ? { method: "HEAD", dispatcher: IPV4_DISPATCHER } : { method: "HEAD" };
    await fetch(origin, fetchInit);
    console.log(`Supabase connectivity preflight succeeded for ${origin}.`);
  } catch (error) {
    const diagnosticError = await withNetworkDiagnostics(error, origin);
    throw new Error(`Supabase connectivity preflight failed for ${origin}: ${describeError(diagnosticError)}`);
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

  // --- Speed trivia (normal_multiple_choice) ---
  const speedSource = args.file ? readQuestionFile(args.file) : readQuestionDir(args.dir || DEFAULT_DIR);
  const speedRows = normalizeAndValidate(speedSource.questions);

  if ("files" in speedSource) {
    console.log(`Speed trivia: loaded ${speedRows.length} questions from ${speedSource.files.length} files in ${speedSource.absoluteDirPath}`);
  } else {
    console.log(`Speed trivia: loaded ${speedRows.length} questions from ${speedSource.absolutePath}`);
  }

  // --- Live trivia (write-in) ---
  let liveRows = [];
  if (args.liveDir) {
    const liveSource = readLiveQuestionDir(args.liveDir);
    liveRows = normalizeAndValidate(liveSource.questions);
    console.log(`Live trivia: loaded ${liveRows.length} questions from ${liveSource.files.length} files in ${liveSource.absoluteDirPath}`);
  }

  const allRows = [...speedRows, ...liveRows];
  console.log(`Total: ${allRows.length} questions. Validation passed.`);

  if (args.checkOnly) {
    console.log("Check mode: no database writes performed.");
    return;
  }

  await upsertRows(allRows, { prune: args.prune });
}

main().catch((error) => {
  console.error(describeError(error));
  process.exit(1);
});
