#!/usr/bin/env node
/**
 * Enriches Famous Landmarks questions with images from Unsplash (primary)
 * or Wikimedia Commons (fallback).
 *
 * Usage:
 *   # Fill in all questions missing an imageUrl
 *   node --env-file=.env.local scripts/enrich-landmark-images.cjs
 *
 *   # Preview without writing
 *   node --env-file=.env.local scripts/enrich-landmark-images.cjs --dry-run
 *
 *   # Swap the image for a specific slug (fetch next Unsplash result)
 *   node --env-file=.env.local scripts/enrich-landmark-images.cjs --swap landmark-eiffel-tower
 *
 *   # Swap to a specific result index (1-based)
 *   node --env-file=.env.local scripts/enrich-landmark-images.cjs --swap landmark-eiffel-tower --index 3
 *
 *   # Force Wikimedia Commons for a specific slug
 *   node --env-file=.env.local scripts/enrich-landmark-images.cjs --swap landmark-eiffel-tower --wiki
 *
 *   # Process only one slug (useful for testing)
 *   node --env-file=.env.local scripts/enrich-landmark-images.cjs --slug landmark-eiffel-tower
 */

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const DATA_FILE = join(process.cwd(), "data", "live-trivia", "categories", "famous-landmarks.v1.json");
const UNSPLASH_BASE = "https://api.unsplash.com";
const WIKI_API = "https://commons.wikimedia.org/w/api.php";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const swapSlug = args.includes("--swap") ? args[args.indexOf("--swap") + 1] : null;
const targetSlug = args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null;
const forceWiki = args.includes("--wiki");
const indexArg = args.includes("--index") ? parseInt(args[args.indexOf("--index") + 1], 10) : 1;
const resultIndex = Math.max(1, isNaN(indexArg) ? 1 : indexArg) - 1; // convert to 0-based

// ---------------------------------------------------------------------------
// Unsplash
// ---------------------------------------------------------------------------

async function searchUnsplash(query, index = 0) {
  const apiKey = process.env.UNSPLASH_API_KEY;
  if (!apiKey) throw new Error("UNSPLASH_API_KEY not set — run with --env-file=.env.local");

  // Request enough results to support --index up to 10
  const perPage = Math.max(10, index + 1);
  const url = `${UNSPLASH_BASE}/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&content_filter=high`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${apiKey}` },
  });

  if (res.status === 401) throw new Error("Unsplash API key invalid — check UNSPLASH_API_KEY in .env.local.");
  if (res.status === 403) {
    // Unsplash uses 403 for both rate-limit and authorization errors
    const body = await res.json().catch(() => ({}));
    const msg = (body.errors ?? []).join(", ");
    if (msg.toLowerCase().includes("rate limit")) {
      throw new Error("Unsplash rate limit hit (50/hr on demo). Wait an hour and re-run.");
    }
    throw new Error(`Unsplash 403: ${msg || "forbidden"}`);
  }
  if (res.status === 429) throw new Error("Unsplash rate limit hit. Wait an hour and re-run.");
  if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const results = data.results ?? [];
  if (results.length === 0) return null;

  // Use the requested index, falling back to the best available
  const photo = results[Math.min(index, results.length - 1)];
  const baseUrl = photo.urls.raw.split("?")[0];

  return {
    imageUrl: `${baseUrl}?w=800&fit=crop`,
    imageCredit: `Photo by ${photo.user.name} on Unsplash`,
  };
}

// ---------------------------------------------------------------------------
// Wikimedia Commons
// ---------------------------------------------------------------------------

// File extensions considered "real photos" (not SVG diagrams or maps)
const PHOTO_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

async function searchWikimedia(query) {
  // Search for images on Commons matching the query
  const searchUrl =
    `${WIKI_API}?action=query` +
    `&generator=search` +
    `&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrnamespace=6` +
    `&gsrlimit=20` +
    `&prop=imageinfo` +
    `&iiprop=url|extmetadata|mediatype` +
    `&iiurlwidth=800` +
    `&format=json` +
    `&origin=*`;

  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  const data = await res.json();

  const pages = Object.values(data?.query?.pages ?? {});
  if (pages.length === 0) return null;

  // Filter to actual photos (not SVG/diagrams)
  const photoPages = pages.filter((p) => {
    const title = (p.title ?? "").toLowerCase();
    const ext = title.split(".").pop();
    return PHOTO_EXTS.has(ext);
  });

  const candidates = photoPages.length > 0 ? photoPages : pages;
  const best = candidates[0];
  const info = best?.imageinfo?.[0];
  const thumbUrl = info?.thumburl;
  if (!thumbUrl) return null;

  // Try to get author from extmetadata
  const meta = info?.extmetadata ?? {};
  const artistRaw = meta?.Artist?.value ?? "";
  // Strip HTML tags
  const artist = artistRaw.replace(/<[^>]+>/g, "").trim();
  const credit = artist
    ? `Photo: ${artist} via Wikimedia Commons`
    : "Photo via Wikimedia Commons";

  return { imageUrl: thumbUrl, imageCredit: credit };
}

// ---------------------------------------------------------------------------
// Fetch image for one question
// ---------------------------------------------------------------------------

async function fetchImage(answer, index = 0, wikiOnly = false) {
  if (!wikiOnly) {
    try {
      const result = await searchUnsplash(answer, index);
      if (result) return result;
      console.log(`  Unsplash: no results for "${answer}" — trying Wikimedia…`);
    } catch (err) {
      console.warn(`  Unsplash error for "${answer}": ${err.message} — trying Wikimedia…`);
    }
  }

  // Wikimedia fallback
  try {
    const result = await searchWikimedia(answer);
    if (result) return result;
    console.warn(`  Wikimedia: no results for "${answer}"`);
  } catch (err) {
    console.warn(`  Wikimedia error for "${answer}": ${err.message}`);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  const questions = raw.questions;

  let targets;

  if (swapSlug) {
    // --swap mode: replace image for one specific slug
    targets = questions.filter((q) => q.slug === swapSlug);
    if (targets.length === 0) {
      console.error(`No question found with slug: ${swapSlug}`);
      console.error(`Tip: run without flags to see all slugs.`);
      process.exit(1);
    }
    console.log(`\nSwap mode — re-fetching image for slug: ${swapSlug} (result index: ${resultIndex + 1})`);
  } else if (targetSlug) {
    // --slug mode: process only one slug (skip if already has image, unless combined with --swap)
    targets = questions.filter((q) => q.slug === targetSlug && !q.imageUrl);
    if (targets.length === 0) {
      const exists = questions.find((q) => q.slug === targetSlug);
      if (exists?.imageUrl) {
        console.log(`"${targetSlug}" already has an image. Use --swap to replace it.`);
      } else {
        console.error(`No question found with slug: ${targetSlug}`);
      }
      process.exit(0);
    }
  } else {
    // Default: fill in all missing images
    targets = questions.filter((q) => !q.imageUrl);
    console.log(`\nFound ${targets.length} questions without images. Starting enrichment…\n`);
  }

  let enriched = 0;
  let failed = 0;

  for (const question of targets) {
    const label = `[${question.slug}] "${question.answer}"`;
    process.stdout.write(`${label} … `);

    const result = await fetchImage(question.answer, resultIndex, forceWiki);

    if (!result) {
      console.log("❌ no image found");
      failed++;
      // Add a small delay even on failure
      await delay(500);
      continue;
    }

    console.log(`✓  ${result.imageCredit}`);

    if (!isDryRun) {
      question.imageUrl = result.imageUrl;
      question.imageCredit = result.imageCredit;
      enriched++;
    } else {
      console.log(`   (dry-run) would set:\n     imageUrl: ${result.imageUrl}\n     imageCredit: ${result.imageCredit}`);
      enriched++;
    }

    // Respect Unsplash free tier rate limit (50 req/hr = ~1 req/72s to be safe)
    // We use 1.5s between calls — fine for a one-time batch run
    if (!forceWiki) await delay(1500);
    else await delay(300);
  }

  if (!isDryRun && enriched > 0) {
    writeFileSync(DATA_FILE, JSON.stringify(raw, null, 2) + "\n", "utf-8");
    console.log(`\n✅ Wrote ${enriched} image${enriched !== 1 ? "s" : ""} to ${DATA_FILE}`);
  } else if (isDryRun) {
    console.log(`\n(dry-run) Would have written ${enriched} image${enriched !== 1 ? "s" : ""}.`);
  }

  if (failed > 0) {
    console.log(`⚠️  ${failed} question${failed !== 1 ? "s" : ""} could not be resolved — check output above.`);
  }

  console.log("\nDone. Run `npm run landmark:review` to open the image review page.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
