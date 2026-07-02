#!/usr/bin/env node
/**
 * Build Category Blitz sets from the category pool.
 *
 * Reads data/category-blitz/category-pool.json (the growing library, tagged by
 * theme), computes each category's live letters (cached), drops any below the
 * coverage floor, composes VARIED mixed sets of 12 by interleaving themes, then
 * computes each set's `allowedLetters` and writes data/category-blitz/category-sets.json.
 *
 * This is how you scale to thousands: append categories to the pool by theme,
 * then re-run this. The letter cache means only new categories are billed.
 *
 * Usage:
 *   npm run category-blitz:build            # compose + compute + write
 *   npm run category-blitz:build:dry-run    # compose + compute, print only
 *
 * Flags: --dry-run  --model=<id>  --seed=<n>  --set-size=<n>
 *        --min-coverage=<n>  --max-dead=<n>  --min-letters=<n>  --concurrency=<n>
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  LETTERS,
  DEFAULT_MODEL,
  makeClient,
  allowedForSet,
  resolveLiveLetters,
  sortByPool,
} = require("./lib/category-blitz-letters.cjs");

const DIR = path.join(__dirname, "..", "data", "category-blitz");
const POOL_PATH = path.join(DIR, "category-pool.json");
const SETS_PATH = path.join(DIR, "category-sets.json");
const CACHE_PATH = path.join(DIR, "letter-cache.json");

function parseArgs(argv) {
  const a = {
    dryRun: false,
    model: DEFAULT_MODEL,
    seed: null, // null = auto-search for a floor-free composition; a number pins it
    maxSeed: 200,
    setSize: 12,
    // Keep every category by default (0 = drop nothing); allowedLetters protects
    // narrow ones. Coverage is still reported so you can prune by hand if you want.
    minCoverage: 0,
    maxDead: 4,
    minLetters: 8,
    concurrency: 4,
  };
  for (const raw of argv) {
    if (raw === "--dry-run") a.dryRun = true;
    else if (raw.startsWith("--model=")) a.model = raw.slice(8);
    else if (raw.startsWith("--seed=")) a.seed = Number(raw.slice(7));
    else if (raw.startsWith("--max-seed=")) a.maxSeed = Number(raw.slice(11));
    else if (raw.startsWith("--set-size=")) a.setSize = Number(raw.slice(11));
    else if (raw.startsWith("--min-coverage=")) a.minCoverage = Number(raw.slice(15));
    else if (raw.startsWith("--max-dead=")) a.maxDead = Number(raw.slice(11));
    else if (raw.startsWith("--min-letters=")) a.minLetters = Number(raw.slice(14));
    else if (raw.startsWith("--concurrency=")) a.concurrency = Number(raw.slice(14));
  }
  return a;
}

// Small seeded PRNG (mulberry32) for reproducible composition.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Compose varied sets: shuffle within each theme, then round-robin across themes
 * so no set is dominated by one type (which would collapse its letter pool). Themes
 * are an internal mixing aid only — rounds are deliberately mixed, never themed.
 *
 * Every category is used at least once: if the count isn't a multiple of setSize,
 * the final set is topped up by reusing earlier categories (cross-set repeats are
 * harmless since a player only ever sees one set per round), so nothing is wasted.
 */
function composeSets(categories, setSize, rng) {
  const byTheme = new Map();
  for (const c of categories) {
    const list = byTheme.get(c.theme) || [];
    list.push(c);
    byTheme.set(c.theme, list);
  }
  const queues = [...byTheme.values()].map((list) => shuffle(list, rng));
  // Draw round-robin from the type with the most remaining, so types deplete evenly.
  const ordered = [];
  let remaining = categories.length;
  while (remaining > 0) {
    queues.sort((a, b) => b.length - a.length);
    for (const q of queues) {
      if (q.length > 0) {
        ordered.push(q.shift());
        remaining--;
      }
    }
  }
  const remainder = ordered.length % setSize;
  let paddedCount = 0;
  if (remainder !== 0) {
    // Top up the final partial set from the front, skipping any category already
    // in that set so the last set has no internal duplicates.
    const finalSet = ordered.slice(ordered.length - remainder);
    const inFinal = new Set(finalSet.map((c) => c.text));
    for (let i = 0; inFinal.size < setSize && i < ordered.length - remainder; i++) {
      const cand = ordered[i];
      if (!inFinal.has(cand.text)) {
        ordered.push(cand);
        inFinal.add(cand.text);
        paddedCount++;
      }
    }
  }
  const sets = [];
  for (let i = 0; i + setSize <= ordered.length; i += setSize) {
    sets.push(ordered.slice(i, i + setSize));
  }
  return { sets, paddedCount };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const pool = JSON.parse(fs.readFileSync(POOL_PATH, "utf8"));
  const allCats = pool.categories.map((c) => ({ text: c.text, theme: c.theme || "misc" }));
  const texts = allCats.map((c) => c.text);

  const dupes = texts.filter((t, i) => texts.indexOf(t) !== i);
  if (dupes.length) {
    console.error(`Duplicate categories in pool: ${[...new Set(dupes)].join(", ")}`);
    process.exit(1);
  }

  console.error(`Pool: ${allCats.length} categories. Resolving live letters (model ${args.model})…`);
  const client = makeClient();
  const { liveMap, analyzed, cached } = await resolveLiveLetters(texts, {
    client,
    model: args.model,
    cachePath: CACHE_PATH,
    concurrency: args.concurrency,
    onProgress: (cat, letters, done, totalMissing) =>
      console.error(`  [${done}/${totalMissing}] ${cat} → ${letters.join("")} (${letters.length})`),
  });
  console.error(`Letters resolved (${analyzed} newly analyzed, ${cached} from cache).`);

  // Coverage audit: drop categories with too few live letters to be fun.
  const kept = [];
  const dropped = [];
  for (const c of allCats) {
    const n = liveMap.get(c.text).size;
    if (n < args.minCoverage) dropped.push({ ...c, coverage: n });
    else kept.push(c);
  }
  if (dropped.length) {
    console.error(`\nDropped ${dropped.length} below --min-coverage=${args.minCoverage}:`);
    for (const d of dropped) console.error(`  ✗ ${d.text} (${d.coverage} letters)`);
  }

  // Compose + score for one seed (composition is free — no API calls). Score by
  // fewest floor hits, then highest minimum letters, then highest average.
  const evaluate = (seed) => {
    const { sets, paddedCount } = composeSets(kept, args.setSize, makeRng(seed));
    const built = sets.map((catObjs, idx) => {
      const cats = catObjs.map((c) => c.text);
      const { letters, hitFloor } = allowedForSet(cats, liveMap, args.maxDead, args.minLetters);
      return { id: idx, categories: cats, allowedLetters: letters, hitFloor };
    });
    const floors = built.filter((s) => s.hitFloor).length;
    const sizes = built.map((s) => s.allowedLetters.length);
    const min = Math.min(...sizes);
    const avg = sizes.reduce((x, y) => x + y, 0) / sizes.length;
    return { seed, built, paddedCount, floors, min, avg };
  };

  let chosen;
  if (args.seed !== null) {
    chosen = evaluate(args.seed);
    console.error(`\nUsing pinned seed ${args.seed}.`);
  } else {
    // Auto-search: pick the composition that best avoids floored (narrow) sets.
    for (let seed = 1; seed <= args.maxSeed; seed++) {
      const cand = evaluate(seed);
      if (
        !chosen ||
        cand.floors < chosen.floors ||
        (cand.floors === chosen.floors && cand.min > chosen.min) ||
        (cand.floors === chosen.floors && cand.min === chosen.min && cand.avg > chosen.avg)
      ) {
        chosen = cand;
      }
      if (chosen.floors === 0 && chosen.min > args.minLetters) break; // good enough
    }
    console.error(`\nAuto-selected seed ${chosen.seed} (searched up to ${args.maxSeed}): ${chosen.floors} floored sets, min ${chosen.min}, avg ${chosen.avg.toFixed(1)} letters.`);
  }

  const { built, paddedCount } = chosen;
  if (paddedCount) {
    console.error(`Final set topped up with ${paddedCount} reused categor${paddedCount === 1 ? "y" : "ies"} so every category is used.`);
  }

  console.error(`\nComposed ${built.length} sets of ${args.setSize}:`);
  for (const s of built) {
    const flag = s.hitFloor ? "  ⚠ hit floor (consider rebalancing)" : "";
    console.error(`  set ${s.id}: ${s.allowedLetters.join("")} (${s.allowedLetters.length}/${LETTERS.length})${flag}`);
  }

  if (args.dryRun) {
    console.error("\n--dry-run: not writing.");
    return;
  }

  const out = {
    categorySets: built.map(({ id, categories, allowedLetters }) => ({ id, categories, allowedLetters })),
  };
  fs.writeFileSync(SETS_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.error(`\nWrote ${built.length} sets to ${path.relative(process.cwd(), SETS_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
