/**
 * Shared helpers for computing Category Blitz `allowedLetters`.
 *
 * A round draws ONE letter and applies it to all 12 categories in a set, so a
 * letter is only safe if enough of the set's categories have a common answer
 * starting with it. These helpers ask a model, per category, which of the 18
 * game letters are "live," and reduce that to a per-set letter pool.
 *
 * Consumed by:
 *   scripts/backfill-category-blitz-letters.cjs  (recompute letters for existing sets)
 *   scripts/build-category-blitz-sets.cjs        (compose mixed sets from the pool)
 * Runtime consumer: lib/categoryBlitz.ts (pickLetterForSet)
 */

const fs = require("node:fs");
const Anthropic = require("@anthropic-ai/sdk");

// Must match LETTERS in lib/categoryBlitz.ts (omit Q U V X Y Z J K).
const LETTERS = "ABCDEFGHILMNOPRSTW".split("");

const DEFAULT_MODEL = process.env.CATEGORY_BLITZ_LETTER_MODEL || "claude-opus-4-8";

function resolveApiKey() {
  // Deployed envs set the SDK default ANTHROPIC_API_KEY; locally the repo's
  // Anthropic key lives under ANTHROPIC_USERNAME_MODERATOR_API_KEY.
  return (
    process.env.ANTHROPIC_API_KEY ||
    process.env.CATEGORY_BLITZ_ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_USERNAME_MODERATOR_API_KEY
  );
}

function makeClient() {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "No Anthropic API key found (ANTHROPIC_API_KEY / CATEGORY_BLITZ_ANTHROPIC_API_KEY / ANTHROPIC_USERNAME_MODERATOR_API_KEY). Run via: node --env-file=.env.local ...",
    );
  }
  const Ctor = Anthropic.default || Anthropic;
  return new Ctor({ apiKey });
}

function buildPrompt(category) {
  return `You are analyzing a category for a fast word game.

Allowed letters (the only ones that can be called): ${LETTERS.join(" ")}

Category: "${category}"

For each allowed letter, decide: could a typical adult quickly name at least one COMMON answer that genuinely IS-A member of this category AND starts with that letter (ignoring a leading "a", "an", or "the")? Only count answers a normal person would actually think of — exclude obscure, technical, or stretch answers.

Return ONLY a JSON array of the uppercase letters that pass. No explanation.`;
}

/** Ask the model which of the 18 letters are live for one category. Returns a Set. */
async function liveLettersFor(client, model, category) {
  const message = await client.messages.create({
    model,
    max_tokens: 128,
    messages: [{ role: "user", content: buildPrompt(category) }],
  });
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  // Take the first flat [...] group; some replies append a second array or prose.
  const match = text.match(/\[[^[\]]*\]/);
  if (!match) throw new Error(`No JSON array for "${category}": ${text.slice(0, 120)}`);
  const parsed = JSON.parse(match[0]);
  return new Set(
    parsed.map((l) => String(l).toUpperCase()).filter((l) => LETTERS.includes(l)),
  );
}

const sortByPool = (letters) =>
  [...letters].sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b));

/**
 * Reduce per-category live letters to a per-set letter pool: keep letters live
 * for all but `maxDead` of the set's categories, with a `minLetters` floor so a
 * set is never left unplayably narrow.
 */
function allowedForSet(categories, liveMap, maxDead, minLetters) {
  const total = categories.length;
  const scored = LETTERS.map((letter) => {
    const liveCount = categories.reduce(
      (n, cat) => n + (liveMap.get(cat)?.has(letter) ? 1 : 0),
      0,
    );
    return { letter, liveCount, deadCount: total - liveCount };
  });
  let allowed = scored.filter((s) => s.deadCount <= maxDead);
  let hitFloor = false;
  if (allowed.length < minLetters) {
    hitFloor = true;
    allowed = [...scored].sort((a, b) => b.liveCount - a.liveCount).slice(0, minLetters);
  }
  return { letters: sortByPool(allowed.map((s) => s.letter)), hitFloor };
}

/** Run an async mapper over items with a fixed concurrency. */
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return results;
}

/**
 * Resolve live letters for a list of categories, using a JSON cache file
 * (category text → letter array) so unchanged categories are never re-billed.
 * Mutates and rewrites the cache as new categories are analyzed.
 */
async function resolveLiveLetters(categories, { client, model, cachePath, concurrency, onProgress }) {
  const cache = fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
    : {};
  const distinct = [...new Set(categories)];
  const missing = distinct.filter((c) => !Array.isArray(cache[c]));

  let done = 0;
  await mapPool(missing, concurrency, async (cat) => {
    const live = await liveLettersFor(client, model, cat);
    cache[cat] = sortByPool(live);
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf8");
    done += 1;
    if (onProgress) onProgress(cat, cache[cat], done, missing.length);
  });

  const liveMap = new Map(distinct.map((c) => [c, new Set(cache[c] || [])]));
  return { liveMap, analyzed: missing.length, cached: distinct.length - missing.length };
}

module.exports = {
  LETTERS,
  DEFAULT_MODEL,
  makeClient,
  liveLettersFor,
  allowedForSet,
  mapPool,
  resolveLiveLetters,
  sortByPool,
};
