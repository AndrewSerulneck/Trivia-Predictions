#!/usr/bin/env node
/**
 * Recompute `allowedLetters` for the sets ALREADY in category-sets.json,
 * without re-composing them. Use this when you hand-edit a set's categories
 * but want to keep the existing set grouping.
 *
 * To (re)compose sets from the pool instead, use build-category-blitz-sets.cjs.
 *
 * Never overwrites `categories` — it only reads the current file and updates
 * `allowedLetters` per set, preserving all other content and order.
 *
 * Usage:
 *   npm run category-blitz:letters              # analyze + write
 *   npm run category-blitz:letters:dry-run      # analyze + print, no write
 *
 * Flags: --dry-run  --model=<id>  --max-dead=<n>  --min-letters=<n>  --concurrency=<n>
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  LETTERS,
  DEFAULT_MODEL,
  makeClient,
  allowedForSet,
  resolveLiveLetters,
} = require("./lib/category-blitz-letters.cjs");

const DIR = path.join(__dirname, "..", "data", "category-blitz");
const DATA_PATH = path.join(DIR, "category-sets.json");
const CACHE_PATH = path.join(DIR, "letter-cache.json");

function parseArgs(argv) {
  const a = { dryRun: false, model: DEFAULT_MODEL, maxDead: 4, minLetters: 8, concurrency: 4 };
  for (const raw of argv) {
    if (raw === "--dry-run") a.dryRun = true;
    else if (raw.startsWith("--model=")) a.model = raw.slice(8);
    else if (raw.startsWith("--max-dead=")) a.maxDead = Number(raw.slice(11));
    else if (raw.startsWith("--min-letters=")) a.minLetters = Number(raw.slice(14));
    else if (raw.startsWith("--concurrency=")) a.concurrency = Number(raw.slice(14));
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const sets = data.categorySets;
  const texts = sets.flatMap((s) => s.categories);

  console.error(`Analyzing ${new Set(texts).size} distinct categories across ${sets.length} sets (model ${args.model})…`);
  const client = makeClient();
  const { liveMap, analyzed, cached } = await resolveLiveLetters(texts, {
    client,
    model: args.model,
    cachePath: CACHE_PATH,
    concurrency: args.concurrency,
    onProgress: (cat, letters, done, total) =>
      console.error(`  [${done}/${total}] ${cat} → ${letters.join("")} (${letters.length})`),
  });
  console.error(`Letters resolved (${analyzed} newly analyzed, ${cached} from cache).`);

  for (const set of sets) {
    const { letters } = allowedForSet(set.categories, liveMap, args.maxDead, args.minLetters);
    set.allowedLetters = letters;
  }

  console.error("\nPer-set allowedLetters:");
  for (const set of sets) {
    console.error(`  set ${set.id}: ${set.allowedLetters.join("")} (${set.allowedLetters.length}/${LETTERS.length})`);
  }

  if (args.dryRun) {
    console.error("\n--dry-run: not writing.");
    return;
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.error(`\nWrote allowedLetters to ${path.relative(process.cwd(), DATA_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
