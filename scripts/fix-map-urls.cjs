#!/usr/bin/env node
/**
 * Two-pass fix for geography.v1.json:
 *
 * Pass 1 — Strip: removes imageUrl/imageCredit from any question whose slug
 *   does NOT start with "geography-map-" (old text questions that got images
 *   by accident from a previous buggy run of this script).
 *
 * Pass 2 — Update: for every geography-map-* question, resolves the correct
 *   Wikimedia Commons file via the imageinfo API (direct CDN thumburl, no
 *   double-redirect) and updates imageUrl in the JSON.
 *
 * Usage: node scripts/fix-map-urls.cjs
 */

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const https = require("https");
const { US_STATE_FILES, COUNTRY_FILES, wikimediaUrl } = require("./find-map-image.cjs");

const GEO_FILE = join(process.cwd(), "data", "live-trivia", "categories", "geography.v1.json");

// ---------------------------------------------------------------------------
// Wikimedia imageinfo API — resolves filename → direct CDN thumburl
// ---------------------------------------------------------------------------

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "hightop-trivia-map-fix/1.0" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

async function batchResolveFilenames(filenames) {
  /** @type {Map<string, string>} filename → direct CDN thumburl */
  const resolved = new Map();
  const BATCH = 40;

  for (let i = 0; i < filenames.length; i += BATCH) {
    const batch = filenames.slice(i, i + BATCH);
    const titles = batch
      .map((f) => encodeURIComponent("File:" + f.replace(/ /g, "_")))
      .join("|");
    const apiUrl =
      "https://commons.wikimedia.org/w/api.php" +
      "?action=query" +
      "&titles=" + titles +
      "&prop=imageinfo&iiprop=url&iiurlwidth=800" +
      "&format=json&origin=*";

    let data;
    try {
      const body = await httpsGet(apiUrl);
      data = JSON.parse(body);
    } catch (err) {
      console.warn(`  API batch failed (i=${i}):`, err.message);
      // Fall back to Special:FilePath for this batch
      for (const f of batch) resolved.set(f, wikimediaUrl(f));
      continue;
    }

    const pages = data?.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      const title = page.title ?? "";
      const normalizedTitle = title.replace(/^File:/i, "").replace(/_/g, " ");
      // Match normalized API title back to the original batch filename (preserving underscore/space style)
      const originalFilename = batch.find(
        (f) => f.replace(/_/g, " ").toLowerCase() === normalizedTitle.toLowerCase()
      ) ?? normalizedTitle;
      const thumburl = page?.imageinfo?.[0]?.thumburl;
      if (thumburl) {
        resolved.set(originalFilename, thumburl);
      } else {
        console.warn(`  No thumburl for: ${normalizedTitle} — using Special:FilePath fallback`);
        resolved.set(originalFilename, wikimediaUrl(originalFilename));
      }
    }

    // Small delay to be polite to the API
    await new Promise((r) => setTimeout(r, 200));
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Build filename → answer map for every map question
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} answer name → wikimedia filename */
const answerToFilename = new Map();
for (const [name, filename] of Object.entries(US_STATE_FILES)) {
  answerToFilename.set(name, filename);
}
for (const [name, filename] of Object.entries(COUNTRY_FILES)) {
  answerToFilename.set(name, filename);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const raw = JSON.parse(readFileSync(GEO_FILE, "utf-8"));

  // ── Pass 1: strip imageUrl/imageCredit from non-map questions ────────────
  let stripped = 0;
  for (const q of raw.questions) {
    if (!q.slug.startsWith("geography-map-") && (q.imageUrl || q.imageCredit)) {
      delete q.imageUrl;
      delete q.imageCredit;
      stripped++;
    }
  }
  console.log(`Stripped imageUrl from ${stripped} old text questions.`);

  // ── Collect all Wikimedia filenames needed ────────────────────────────────
  const mapQuestions = raw.questions.filter((q) => q.slug.startsWith("geography-map-"));
  const filenameSet = new Set();
  for (const q of mapQuestions) {
    const filename = answerToFilename.get(q.answer);
    if (filename) filenameSet.add(filename);
  }

  const filenames = Array.from(filenameSet);
  console.log(`Resolving CDN URLs for ${filenames.length} Wikimedia files…`);

  // ── Pass 2: batch-resolve direct CDN thumburls ────────────────────────────
  const resolved = await batchResolveFilenames(filenames);

  let updated = 0;
  let missing = 0;
  for (const q of mapQuestions) {
    const filename = answerToFilename.get(q.answer);
    if (!filename) {
      console.warn(`  No filename mapping for answer: "${q.answer}" (slug: ${q.slug})`);
      missing++;
      continue;
    }
    const cdnUrl = resolved.get(filename) ?? wikimediaUrl(filename);
    if (q.imageUrl !== cdnUrl) {
      q.imageUrl = cdnUrl;
      updated++;
    }
    // Ensure credit is set
    if (!q.imageCredit) {
      q.imageCredit = "Map via Wikimedia Commons";
      updated++;
    }
  }

  writeFileSync(GEO_FILE, JSON.stringify(raw, null, 2) + "\n", "utf-8");
  console.log(`Updated ${updated} map question URLs.`);
  if (missing) console.warn(`${missing} map questions had no filename mapping — check COUNTRY_FILES/US_STATE_FILES.`);
  console.log("Done.");
})();
