#!/usr/bin/env node
/**
 * Build the Category Blitz letter → categories index from the category pool.
 *
 * The game is organized LETTER-FIRST: for each of the 18 game letters we keep
 * the list of categories that have an ABUNDANCE of common answers starting with
 * it (default: ≥3, see --threshold). At round time the runtime picks a usable
 * letter and draws 12 categories at random from that letter's pool, so every
 * board is freshly assembled AND every category is guaranteed to have several
 * answers for the called letter.
 *
 * Reads  data/category-blitz/category-pool.json  (canonical library, unchanged)
 * Writes data/category-blitz/category-letter-index.json
 * Caches data/category-blitz/letter-cache-abundant.json  (per-category abundant
 *        letters — keyed by category text so unchanged categories are never
 *        re-billed; separate from the old letter-cache.json because the
 *        abundance bar changed the meaning of a "live" letter).
 *
 * Usage:
 *   npm run category-blitz:build            # compute + write
 *   npm run category-blitz:build:dry-run    # compute, print only
 *
 * Flags: --dry-run  --model=<id>  --threshold=<n>  --set-size=<n>  --concurrency=<n>
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  LETTERS,
  DEFAULT_MODEL,
  DEFAULT_ABUNDANCE,
  makeClient,
  resolveLiveLetters,
  invertToLetterIndex,
} = require("./lib/category-blitz-letters.cjs");

const DIR = path.join(__dirname, "..", "data", "category-blitz");
const POOL_PATH = path.join(DIR, "category-pool.json");
const INDEX_PATH = path.join(DIR, "category-letter-index.json");
const CACHE_PATH = path.join(DIR, "letter-cache-abundant.json");

function parseArgs(argv) {
  const a = {
    dryRun: false,
    model: DEFAULT_MODEL,
    threshold: DEFAULT_ABUNDANCE,
    setSize: 12,
    bSetSize: 12,
    concurrency: 4,
  };
  for (const raw of argv) {
    if (raw === "--dry-run") a.dryRun = true;
    else if (raw.startsWith("--model=")) a.model = raw.slice(8);
    else if (raw.startsWith("--threshold=")) a.threshold = Number(raw.slice(12));
    else if (raw.startsWith("--set-size=")) a.setSize = Number(raw.slice(11));
    else if (raw.startsWith("--b-set-size=")) a.bSetSize = Number(raw.slice(13));
    else if (raw.startsWith("--concurrency=")) a.concurrency = Number(raw.slice(14));
  }
  return a;
}

// A category is eligible for the "standard" (A / "Be Unique!") index unless it
// is tagged reverse-only (modes === ["B"]). Categories with no `modes` field,
// or with modes including "A", are standard-eligible. This is what keeps the
// fame/subjective "Blend In!" categories (tagged modes: ["B"]) out of normal
// rounds, since obscure-but-valid answers are exactly what breaks them there.
function isStandardEligible(category) {
  return !Array.isArray(category.modes) || category.modes.includes("A");
}

// A category is eligible for the "reverse" (B / "Blend In!") index only when
// explicitly tagged.
function isReverseEligible(category) {
  return Array.isArray(category.modes) && category.modes.includes("B");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const pool = JSON.parse(fs.readFileSync(POOL_PATH, "utf8"));
  const texts = pool.categories.map((c) => c.text);

  const dupes = texts.filter((t, i) => texts.indexOf(t) !== i);
  if (dupes.length) {
    console.error(`Duplicate categories in pool: ${[...new Set(dupes)].join(", ")}`);
    process.exit(1);
  }

  const standardTexts = pool.categories.filter(isStandardEligible).map((c) => c.text);
  const reverseTexts = pool.categories.filter(isReverseEligible).map((c) => c.text);

  console.error(
    `Pool: ${texts.length} categories. Resolving abundant letters (≥${args.threshold} common answers, model ${args.model})…`,
  );
  const client = makeClient();
  const { liveMap, analyzed, cached } = await resolveLiveLetters(texts, {
    client,
    model: args.model,
    cachePath: CACHE_PATH,
    concurrency: args.concurrency,
    threshold: args.threshold,
    onProgress: (cat, letters, done, totalMissing) =>
      console.error(`  [${done}/${totalMissing}] ${cat} → ${letters.join("")} (${letters.length})`),
  });
  console.error(`Abundant letters resolved (${analyzed} newly analyzed, ${cached} from cache).`);

  const { index, counts } = invertToLetterIndex(standardTexts, liveMap);
  const { index: bIndex, counts: bCounts } = invertToLetterIndex(reverseTexts, liveMap);

  // Only letters with enough categories to fill a board are usable at round time.
  const usable = LETTERS.filter((l) => counts[l] >= args.setSize);
  const thin = LETTERS.filter((l) => counts[l] < args.setSize);
  const bUsable = LETTERS.filter((l) => bCounts[l] >= args.bSetSize);
  const bThin = LETTERS.filter((l) => bCounts[l] < args.bSetSize);

  console.error(`\nStandard ("Be Unique!") categories per letter (need ≥${args.setSize} to be usable):`);
  for (const l of LETTERS) {
    const flag = counts[l] < args.setSize ? "  ⚠ too thin — excluded" : "";
    console.error(`  ${l}: ${counts[l]}${flag}`);
  }
  console.error(`\nUsable standard letters (${usable.length}/${LETTERS.length}): ${usable.join("")}`);
  if (thin.length) {
    console.error(`Excluded (too few categories): ${thin.join("")}`);
  }

  console.error(`\nReverse ("Blend In!") categories per letter (need ≥${args.bSetSize} to be usable, ${reverseTexts.length} B-tagged categories total):`);
  for (const l of LETTERS) {
    const flag = bCounts[l] < args.bSetSize ? "  ⚠ too thin — excluded" : "";
    console.error(`  ${l}: ${bCounts[l]}${flag}`);
  }
  console.error(`\nUsable reverse letters (${bUsable.length}/${LETTERS.length}): ${bUsable.join("") || "(none yet)"}`);
  if (bThin.length) {
    console.error(`Excluded (too few B-tagged categories): ${bThin.join("")}`);
  }

  if (args.dryRun) {
    console.error("\n--dry-run: not writing.");
    return;
  }

  const out = {
    _comment:
      "GENERATED by scripts/build-category-blitz-letter-index.cjs — do not hand-edit. " +
      "Add categories to category-pool.json, then run `npm run category-blitz:build`. " +
      "letters[L] lists every standard-eligible (modes includes 'A', or no modes tag) pool " +
      "category with ≥threshold common answers starting with L. usableLetters are the only " +
      "letters a standard ('Be Unique!') round may draw (≥setSize categories). " +
      "bLetters/bUsableLetters are the same, but restricted to modes:['B']-tagged categories, " +
      "for reverse ('Blend In!') rounds.",
    threshold: args.threshold,
    setSize: args.setSize,
    usableLetters: usable,
    letters: index,
    bSetSize: args.bSetSize,
    bUsableLetters: bUsable,
    bLetters: bIndex,
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.error(`\nWrote letter index to ${path.relative(process.cwd(), INDEX_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
