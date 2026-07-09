/**
 * Shared helpers for computing which letters are "abundant" for a category.
 *
 * The game is organized letter-first: for each of the 18 game letters we keep
 * the list of categories that have an ABUNDANCE of common answers starting with
 * it (default: ≥3). At round time the runtime picks a letter and draws 12
 * categories at random from that letter's vetted pool, so every category on the
 * board is guaranteed to have several answers for the called letter.
 *
 * These helpers ask a model, per category, which of the 18 game letters clear
 * the abundance bar, then invert that into a letter → categories index.
 *
 * Consumed by:
 *   scripts/build-category-blitz-letter-index.cjs  (build the letter → categories index)
 * Runtime consumer: lib/categoryBlitz.ts (letter-first round assembly)
 */

const fs = require("node:fs");
const Anthropic = require("@anthropic-ai/sdk");

// Must match LETTERS in lib/categoryBlitz.ts (omit Q U V X Y Z J K).
const LETTERS = "ABCDEFGHILMNOPRSTW".split("");

const DEFAULT_MODEL = process.env.CATEGORY_BLITZ_LETTER_MODEL || "claude-opus-4-8";

// A letter counts as "abundant" for a category only if a typical adult can name
// at least this many common answers starting with it. This is the bar that
// keeps single-answer traps (e.g. "P" for "A US state" → only Pennsylvania) out
// of a letter's category pool.
const DEFAULT_ABUNDANCE = 3;

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

function buildPrompt(category, threshold = DEFAULT_ABUNDANCE) {
  return `You are analyzing a category for a fast word game.

Allowed letters (the only ones that can be called): ${LETTERS.join(" ")}

Category: "${category}"

For each allowed letter, decide: could a typical adult quickly name at least ${threshold} DIFFERENT common answers that genuinely IS-A member of this category AND start with that letter (ignoring a leading "a", "an", or "the")? Only count answers a normal person would actually think of — exclude obscure, technical, or stretch answers. A letter passes ONLY if there are ${threshold} or more such common answers (e.g. if a category has just one well-known answer for a letter, that letter FAILS).

Do this evaluation silently in your head. Output ONLY the final JSON array of the uppercase letters that pass, e.g. ["A","C","M"]. No reasoning, no preamble, no per-letter notes — just the array.`;
}

/** Ask the model which of the 18 letters are abundant (≥threshold answers) for one category. Returns a Set. */
async function liveLettersFor(client, model, category, threshold = DEFAULT_ABUNDANCE) {
  const message = await client.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: "user", content: buildPrompt(category, threshold) }],
  });
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  // Take the LAST flat [...] group so any leading reasoning prose is ignored.
  const matches = text.match(/\[[^[\]]*\]/g);
  if (!matches) throw new Error(`No JSON array for "${category}": ${text.slice(0, 120)}`);
  const parsed = JSON.parse(matches[matches.length - 1]);
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
async function resolveLiveLetters(categories, { client, model, cachePath, concurrency, threshold = DEFAULT_ABUNDANCE, onProgress }) {
  const cache = fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
    : {};
  const distinct = [...new Set(categories)];
  const missing = distinct.filter((c) => !Array.isArray(cache[c]));

  let done = 0;
  await mapPool(missing, concurrency, async (cat) => {
    const live = await liveLettersFor(client, model, cat, threshold);
    cache[cat] = sortByPool(live);
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf8");
    done += 1;
    if (onProgress) onProgress(cat, cache[cat], done, missing.length);
  });

  const liveMap = new Map(distinct.map((c) => [c, new Set(cache[c] || [])]));
  return { liveMap, analyzed: missing.length, cached: distinct.length - missing.length };
}

/**
 * Invert per-category abundant letters into a letter → categories index.
 * `categories` preserves pool order so each letter's list stays stable/readable.
 * Returns { index: { [letter]: string[] }, counts: { [letter]: number } }.
 */
function invertToLetterIndex(categories, liveMap) {
  const index = Object.fromEntries(LETTERS.map((l) => [l, []]));
  for (const cat of categories) {
    const live = liveMap.get(cat);
    if (!live) continue;
    for (const letter of LETTERS) {
      if (live.has(letter)) index[letter].push(cat);
    }
  }
  const counts = Object.fromEntries(LETTERS.map((l) => [l, index[l].length]));
  return { index, counts };
}

module.exports = {
  LETTERS,
  DEFAULT_MODEL,
  DEFAULT_ABUNDANCE,
  makeClient,
  liveLettersFor,
  allowedForSet,
  invertToLetterIndex,
  mapPool,
  resolveLiveLetters,
  sortByPool,
};
