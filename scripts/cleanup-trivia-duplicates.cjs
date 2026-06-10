#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const SPEED_DIR = path.resolve(process.cwd(), "data/trivia/categories");
const PAGE_SIZE = 1000;

function parseArgs(argv) {
  return {
    applyDb: argv.includes("--apply-db"),
    applyLocal: argv.includes("--apply-local"),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeQuestionKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function rankStatus(status) {
  if (status === "active") return 0;
  if (status === "pending_review") return 1;
  return 2;
}

function formatQuestionKey(questionPool, question) {
  return `${questionPool}::${normalizeQuestionKey(question)}`;
}

function sortDuplicateRows(rows) {
  return [...rows].sort((a, b) => {
    const statusRank = rankStatus(a.status) - rankStatus(b.status);
    if (statusRank !== 0) return statusRank;
    const createdAtCompare = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    if (createdAtCompare !== 0) return createdAtCompare;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

function readSpeedFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert(Array.isArray(parsed), `Speed trivia file must contain an array: ${filePath}`);
  return parsed;
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(dirPath, name));
}

function collectLocalQuestions() {
  const records = [];

  for (const filePath of listJsonFiles(SPEED_DIR)) {
    const questions = readSpeedFile(filePath);
    questions.forEach((question, index) => {
      records.push({
        sourceType: "speed",
        questionPool: "anytime_blitz",
        filePath,
        fileName: path.basename(filePath),
        index,
        slug: String(question?.slug ?? "").trim(),
        question: String(question?.question ?? "").trim(),
      });
    });
  }

  return records;
}

function buildDuplicateGroups(records, getIdentity, sortItems = (items) => items) {
  const byIdentity = new Map();
  for (const record of records) {
    const identity = getIdentity(record);
    if (!identity) continue;
    const group = byIdentity.get(identity) ?? [];
    group.push(record);
    byIdentity.set(identity, group);
  }

  return [...byIdentity.values()]
    .map((group) => sortItems(group))
    .filter((group) => group.length > 1);
}

function summarizeGroup(group) {
  return {
    questionPool: group[0].questionPool,
    question: group[0].question,
    keep: {
      slug: group[0].slug,
      fileName: group[0].fileName,
      index: group[0].index,
      id: group[0].id,
      status: group[0].status,
      created_at: group[0].created_at,
    },
    remove: group.slice(1).map((item) => ({
      slug: item.slug,
      fileName: item.fileName,
      index: item.index,
      id: item.id,
      status: item.status,
      created_at: item.created_at,
    })),
  };
}

function auditLocalDuplicates() {
  const records = collectLocalQuestions();
  const groups = buildDuplicateGroups(
    records,
    (record) => formatQuestionKey(record.questionPool, record.question),
    (group) =>
      [...group].sort((a, b) => {
        const fileCompare = a.fileName.localeCompare(b.fileName);
        if (fileCompare !== 0) return fileCompare;
        return a.index - b.index;
      })
  );

  return {
    records,
    groups,
    duplicatesToRemove: groups.reduce((sum, group) => sum + group.length - 1, 0),
  };
}

async function fetchDatabaseRows() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL.");
  assert(serviceRoleKey, "Missing SUPABASE_SERVICE_ROLE_KEY.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("trivia_questions")
      .select("id, slug, question, question_pool, status, created_at")
      .eq("question_pool", "anytime_blitz")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load trivia_questions: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return { supabase, rows };
}

async function auditDatabaseDuplicates() {
  const { supabase, rows } = await fetchDatabaseRows();
  const activeRows = rows.filter((row) => row.status !== "deleted");
  const groups = buildDuplicateGroups(
    activeRows.map((row) => ({
      ...row,
      questionPool: row.question_pool,
      fileName: null,
      index: null,
    })),
    (record) => formatQuestionKey(record.questionPool, record.question),
    sortDuplicateRows
  );

  return {
    supabase,
    rows,
    groups,
    duplicatesToDelete: groups.reduce((sum, group) => sum + group.length - 1, 0),
  };
}

async function applyDatabaseCleanup(supabase, groups) {
  const idsToDelete = groups.flatMap((group) => group.slice(1).map((row) => row.id)).filter(Boolean);
  if (idsToDelete.length === 0) return 0;

  const { data, error } = await supabase
    .from("trivia_questions")
    .update({ status: "deleted" })
    .in("id", idsToDelete)
    .neq("status", "deleted")
    .select("id");

  if (error) throw new Error(`Failed to mark duplicate DB rows deleted: ${error.message}`);
  return (data ?? []).length;
}

function applyLocalCleanup(groups) {
  const removalsByFile = new Map();
  for (const group of groups) {
    for (const record of group.slice(1)) {
      const set = removalsByFile.get(record.filePath) ?? new Set();
      set.add(record.index);
      removalsByFile.set(record.filePath, set);
    }
  }

  let removed = 0;
  for (const [filePath, indexes] of removalsByFile.entries()) {
    if (filePath.startsWith(SPEED_DIR)) {
      const questions = readSpeedFile(filePath);
      const nextQuestions = questions.filter((_, index) => !indexes.has(index));
      removed += questions.length - nextQuestions.length;
      fs.writeFileSync(filePath, `${JSON.stringify(nextQuestions, null, 2)}\n`, "utf8");
      continue;
    }

  }

  return removed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localAudit = auditLocalDuplicates();
  console.log(`Local duplicate groups: ${localAudit.groups.length}`);
  console.log(`Local duplicate questions to remove: ${localAudit.duplicatesToRemove}`);
  if (localAudit.groups.length > 0) {
    console.log(JSON.stringify(localAudit.groups.slice(0, 10).map(summarizeGroup), null, 2));
  }

  let dbAudit = null;
  const shouldAuditDb = args.applyDb || !args.applyLocal;
  if (shouldAuditDb) {
    dbAudit = await auditDatabaseDuplicates();
    console.log(`Database duplicate groups: ${dbAudit.groups.length}`);
    console.log(`Database duplicate rows to mark deleted: ${dbAudit.duplicatesToDelete}`);
    if (dbAudit.groups.length > 0) {
      console.log(JSON.stringify(dbAudit.groups.slice(0, 10).map(summarizeGroup), null, 2));
    }
  }

  if (!args.applyDb && !args.applyLocal) {
    console.log("Dry run complete. Re-run with --apply-db and/or --apply-local to make changes.");
    return;
  }

  if (args.applyDb) {
    assert(dbAudit, "Database audit results are required for --apply-db.");
    const updated = await applyDatabaseCleanup(dbAudit.supabase, dbAudit.groups);
    console.log(`Marked ${updated} duplicate DB row(s) as deleted.`);
  }

  if (args.applyLocal) {
    const removed = applyLocalCleanup(localAudit.groups);
    console.log(`Removed ${removed} duplicate local question(s).`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
