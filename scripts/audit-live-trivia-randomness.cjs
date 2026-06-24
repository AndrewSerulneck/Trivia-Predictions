#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DEFAULT_DIR = "data/live-trivia/categories";
const DEFAULT_ROUNDS = 100;
const QUESTIONS_PER_ROUND = 15;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  "why",
  "with",
]);

function parseArgs(argv) {
  const args = {
    category: "",
    rounds: DEFAULT_ROUNDS,
    dir: DEFAULT_DIR,
    venueId: "audit-venue",
    occurrenceDate: "2026-06-24",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--category") {
      args.category = String(argv[index + 1] ?? "").trim();
      index += 1;
    } else if (token === "--rounds") {
      args.rounds = Math.max(1, Math.floor(Number(argv[index + 1] ?? DEFAULT_ROUNDS)));
      index += 1;
    } else if (token === "--dir") {
      args.dir = String(argv[index + 1] ?? DEFAULT_DIR).trim() || DEFAULT_DIR;
      index += 1;
    } else if (token === "--venue-id") {
      args.venueId = String(argv[index + 1] ?? "audit-venue").trim() || "audit-venue";
      index += 1;
    } else if (token === "--date" || token === "--occurrence-date") {
      args.occurrenceDate = String(argv[index + 1] ?? "2026-06-24").trim() || "2026-06-24";
      index += 1;
    } else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node --import tsx scripts/audit-live-trivia-randomness.cjs [options]

Options:
  --category <text>       Filter to a category name or file slug.
  --rounds <number>       Number of seeded 15-question rounds to simulate. Default: ${DEFAULT_ROUNDS}
  --dir <path>            Live Trivia category JSON directory. Default: ${DEFAULT_DIR}
  --venue-id <text>       Base venue id for deterministic seeds. Default: audit-venue
  --date <YYYY-MM-DD>     Base occurrence date for deterministic seeds. Default: 2026-06-24
`);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function inferSlugFamily(slug) {
  const tokens = normalizeText(slug).split(" ").filter(Boolean);
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (/^\d+$/.test(last) || /^(1[5-9]\d{2}|20\d{2}|21\d{2})$/.test(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join("-") || "unknown";
}

function inferTemplateKey(question) {
  const text = normalizeText(question);
  if (/^(in )?what year\b/.test(text)) return "what-year";
  if (/^what (is|are|was|were)\b/.test(text) || /^what s\b/.test(text)) return "what-is";
  if (/^who (is|are|was|were)\b/.test(text)) return "who-is";
  if (/^which (team|franchise|club)\b/.test(text)) return "which-team";
  if (/^which (country|nation)\b/.test(text)) return "which-country";
  if (/^which city\b/.test(text)) return "which-city";
  if (/^which state\b/.test(text)) return "which-state";
  if (/^which (movie|film)\b/.test(text)) return "which-movie";
  if (/^which (tv|television) (show|series)\b/.test(text)) return "which-tv-show";
  if (/^(name|name this|name that|name the)\b/.test(text)) return "name-this";
  if (/^(identify|identify this|identify that|identify the)\b/.test(text)) return "identify-this";
  return "generic";
}

function inferTopicCluster(category, question) {
  const categoryKey = normalizeText(category) || "general";
  const tokens = normalizeText(`${category} ${question}`)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  const tokenPart = Array.from(new Set(tokens))
    .filter((token) => token !== categoryKey)
    .slice(0, 4)
    .join("-");
  return tokenPart ? `${categoryKey}:${tokenPart}` : categoryKey;
}

function getSourceBand(sourceOrder, total) {
  const percentile = (sourceOrder + 0.5) / Math.max(1, total);
  if (percentile < 1 / 3) return "start";
  if (percentile < 2 / 3) return "middle";
  return "end";
}

function readQuestions(dirPath, categoryFilter) {
  const absoluteDir = path.resolve(process.cwd(), dirPath);
  const files = fs.readdirSync(absoluteDir).filter((file) => file.endsWith(".json")).sort();
  const filter = normalizeText(categoryFilter);
  const rows = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(absoluteDir, file), "utf8");
    const parsed = JSON.parse(raw);
    const categoryName = String(parsed.categoryName ?? file.replace(/\.json$/i, "")).trim();
    const fileSlug = slugify(file.replace(/\.json$/i, "").replace(/\.v\d+$/i, ""));
    const categorySlug = slugify(categoryName);
    if (filter && !categorySlug.includes(filter) && !fileSlug.includes(filter)) continue;

    const questions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : [];
    questions.forEach((item, index) => {
      const answer = String(item.answer ?? item.options?.[0] ?? "").trim();
      rows.push({
        slug: String(item.slug ?? "").trim(),
        question: String(item.question ?? "").trim(),
        category: String(item.category ?? categoryName).trim() || categoryName,
        options: [answer],
        correct_answer: 0,
        question_pool: "live_showdown",
        source_file: file,
        source_order: index,
        auditSourceTotal: questions.length,
      });
    });
  }

  return rows.filter((row) => row.slug && row.question && row.options[0]);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function djb2(input) {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) | 0;
  }
  return hash >>> 0;
}

function seededShuffle(items, seed) {
  const result = items.slice();
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildBaselineSlots(questions, category, seed, count) {
  return seededShuffle(
    questions
      .filter((row) => row.category === category)
      .slice()
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    seed
  )
    .slice(0, count)
    .map((row, index) => ({
      slug: row.slug,
      category: row.category,
      roundNumber: 1,
      questionIndex: index + 1,
      wasSeen: false,
    }));
}

function analyzeSlots(slots, questionsBySlug) {
  const metrics = {
    adjacentTemplateCollisions: 0,
    slugFamilySpacingViolations: 0,
    adjacentTopicClusterRepeats: 0,
    bandCounts: { start: 0, middle: 0, end: 0 },
  };

  const recentByFamily = new Map();
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const row = questionsBySlug.get(slot.slug);
    if (!row) continue;

    const templateKey = inferTemplateKey(row.question);
    const slugFamily = inferSlugFamily(row.slug);
    const cluster = inferTopicCluster(row.category, row.question);
    const band = getSourceBand(Number(row.source_order ?? 0), Number(row.auditSourceTotal ?? slots.length));
    metrics.bandCounts[band] += 1;

    const previousSlot = slots[index - 1];
    if (previousSlot) {
      const previousRow = questionsBySlug.get(previousSlot.slug);
      if (previousRow) {
        if (inferTemplateKey(previousRow.question) === templateKey) {
          metrics.adjacentTemplateCollisions += 1;
        }
        if (inferTopicCluster(previousRow.category, previousRow.question) === cluster) {
          metrics.adjacentTopicClusterRepeats += 1;
        }
      }
    }

    const previousFamilyIndex = recentByFamily.get(slugFamily);
    if (previousFamilyIndex !== undefined && index - previousFamilyIndex < 5) {
      metrics.slugFamilySpacingViolations += 1;
    }
    recentByFamily.set(slugFamily, index);
  }

  return metrics;
}

function percent(numerator, denominator) {
  if (denominator <= 0) return "0.00%";
  return `${((100 * numerator) / denominator).toFixed(2)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { buildLiveTriviaOccurrenceSeedSlots } = await import(pathToFileURL(path.resolve("lib/liveShowdownEngine.ts")).href);
  const questions = readQuestions(args.dir, args.category);
  if (questions.length === 0) {
    throw new Error(`No Live Trivia questions found${args.category ? ` for category filter "${args.category}"` : ""}.`);
  }

  const questionsBySlug = new Map(questions.map((row) => [row.slug, row]));
  const totals = {
    rounds: 0,
    slots: 0,
    adjacentTemplateCollisions: 0,
    slugFamilySpacingViolations: 0,
    adjacentTopicClusterRepeats: 0,
    repeatedQuestions: 0,
    bandCounts: { start: 0, middle: 0, end: 0 },
  };
  const baselineTotals = {
    slots: 0,
    adjacentTemplateCollisions: 0,
    slugFamilySpacingViolations: 0,
    adjacentTopicClusterRepeats: 0,
    bandCounts: { start: 0, middle: 0, end: 0 },
  };

  for (let index = 0; index < args.rounds; index += 1) {
    const result = buildLiveTriviaOccurrenceSeedSlots({
      questions,
      seenSlugs: new Set(),
      scheduleId: `audit-schedule-${index}`,
      occurrenceDate: addDays(args.occurrenceDate, index),
      venueId: `${args.venueId}-${index}`,
      numRounds: 1,
      questionsPerRound: QUESTIONS_PER_ROUND,
    });

    const metrics = analyzeSlots(result.slots, questionsBySlug);
    const selectedCategory = result.slots[0]?.category ?? "";
    const baselineSlots = selectedCategory
      ? buildBaselineSlots(questions, selectedCategory, djb2(`${args.venueId}:baseline:${index}`), result.slots.length)
      : [];
    const baselineMetrics = analyzeSlots(baselineSlots, questionsBySlug);
    totals.rounds += 1;
    totals.slots += result.slots.length;
    totals.adjacentTemplateCollisions += metrics.adjacentTemplateCollisions;
    totals.slugFamilySpacingViolations += metrics.slugFamilySpacingViolations;
    totals.adjacentTopicClusterRepeats += metrics.adjacentTopicClusterRepeats;
    totals.repeatedQuestions += result.repeatedQuestions ? 1 : 0;
    totals.bandCounts.start += metrics.bandCounts.start;
    totals.bandCounts.middle += metrics.bandCounts.middle;
    totals.bandCounts.end += metrics.bandCounts.end;

    baselineTotals.slots += baselineSlots.length;
    baselineTotals.adjacentTemplateCollisions += baselineMetrics.adjacentTemplateCollisions;
    baselineTotals.slugFamilySpacingViolations += baselineMetrics.slugFamilySpacingViolations;
    baselineTotals.adjacentTopicClusterRepeats += baselineMetrics.adjacentTopicClusterRepeats;
    baselineTotals.bandCounts.start += baselineMetrics.bandCounts.start;
    baselineTotals.bandCounts.middle += baselineMetrics.bandCounts.middle;
    baselineTotals.bandCounts.end += baselineMetrics.bandCounts.end;
  }

  const adjacencyComparisons = Math.max(0, totals.slots - totals.rounds);
  const baselineAdjacencyComparisons = Math.max(0, baselineTotals.slots - totals.rounds);
  console.log("Live Trivia Randomness Audit");
  console.log("----------------------------");
  console.log(`Questions loaded: ${questions.length}`);
  console.log(`Category filter: ${args.category || "(all)"}`);
  console.log(`Rounds simulated: ${totals.rounds}`);
  console.log(`Slots analyzed: ${totals.slots}`);
  console.log("");
  console.log(`Adjacent template-collision rate: ${totals.adjacentTemplateCollisions}/${adjacencyComparisons} (${percent(totals.adjacentTemplateCollisions, adjacencyComparisons)})`);
  console.log(`Slug-family spacing violation rate: ${totals.slugFamilySpacingViolations}/${totals.slots} (${percent(totals.slugFamilySpacingViolations, totals.slots)})`);
  console.log(`Adjacent topic-cluster repeat rate: ${totals.adjacentTopicClusterRepeats}/${adjacencyComparisons} (${percent(totals.adjacentTopicClusterRepeats, adjacencyComparisons)})`);
  console.log(`Rounds requiring repeated questions: ${totals.repeatedQuestions}/${totals.rounds} (${percent(totals.repeatedQuestions, totals.rounds)})`);
  console.log("");
  console.log("Average source-band distribution per round:");
  console.log(`  start:  ${(totals.bandCounts.start / totals.rounds).toFixed(2)}`);
  console.log(`  middle: ${(totals.bandCounts.middle / totals.rounds).toFixed(2)}`);
  console.log(`  end:    ${(totals.bandCounts.end / totals.rounds).toFixed(2)}`);
  console.log("");
  console.log("Old-vs-new comparison summary:");
  console.log(`  adjacent template collisions: ${baselineTotals.adjacentTemplateCollisions} baseline -> ${totals.adjacentTemplateCollisions} balanced`);
  console.log(`  slug-family spacing violations: ${baselineTotals.slugFamilySpacingViolations} baseline -> ${totals.slugFamilySpacingViolations} balanced`);
  console.log(`  adjacent topic-cluster repeats: ${baselineTotals.adjacentTopicClusterRepeats} baseline -> ${totals.adjacentTopicClusterRepeats} balanced`);
  console.log(
    `  baseline rates: templates ${percent(baselineTotals.adjacentTemplateCollisions, baselineAdjacencyComparisons)}, ` +
      `slug families ${percent(baselineTotals.slugFamilySpacingViolations, baselineTotals.slots)}, ` +
      `topics ${percent(baselineTotals.adjacentTopicClusterRepeats, baselineAdjacencyComparisons)}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
