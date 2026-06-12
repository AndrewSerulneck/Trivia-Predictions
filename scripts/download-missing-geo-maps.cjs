#!/usr/bin/env node
/**
 * Downloads the 82 geography map SVGs that are still pointing at upload.wikimedia.org
 * and saves them to public/maps/, then rewrites geography.v1.json to use local /maps/ URLs.
 *
 * Usage:
 *   node scripts/download-missing-geo-maps.cjs
 *   node scripts/download-missing-geo-maps.cjs --dry-run
 */

const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");

const GEO_FILE = join(process.cwd(), "data", "live-trivia", "categories", "geography.v1.json");
const MAPS_DIR = join(process.cwd(), "public", "maps");
const DRY_RUN = process.argv.includes("--dry-run");

const HEADERS = {
  "User-Agent": "Hightop-Trivia-App/1.0 (content caching for offline use; contact via github)",
  "Accept": "image/svg+xml,*/*",
};

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadSvg(url, destPath) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith("<") && !text.includes("<svg")) {
    throw new Error(`Response doesn't look like SVG (${text.slice(0, 80)})`);
  }
  writeFileSync(destPath, text, "utf-8");
}

async function main() {
  const raw = JSON.parse(readFileSync(GEO_FILE, "utf-8"));
  const questions = raw.questions;

  const targets = questions.filter(
    (q) => q.imageUrl && (q.imageUrl.includes("wikimedia") || q.imageUrl.includes("commons"))
  );

  console.log(`\nFound ${targets.length} questions with external Wikimedia URLs.`);
  if (DRY_RUN) console.log("(dry-run mode — no files will be written)\n");

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const q of targets) {
    const localName = `${q.slug}.svg`;
    const destPath = join(MAPS_DIR, localName);
    const localUrl = `/maps/${localName}`;

    if (existsSync(destPath)) {
      process.stdout.write(`[skip] ${q.slug} (already exists)\n`);
      if (!DRY_RUN) q.imageUrl = localUrl;
      skipped++;
      continue;
    }

    process.stdout.write(`[${q.answer}] Downloading … `);

    if (DRY_RUN) {
      console.log(`(would fetch ${q.imageUrl.split("/").pop()})`);
      downloaded++;
      continue;
    }

    try {
      await downloadSvg(q.imageUrl, destPath);
      q.imageUrl = localUrl;
      // imageCredit stays as-is
      console.log("✓");
      downloaded++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }

    // Polite delay between Wikimedia requests
    await delay(600);
  }

  if (!DRY_RUN && (downloaded + skipped) > 0) {
    writeFileSync(GEO_FILE, JSON.stringify(raw, null, 2) + "\n", "utf-8");
    console.log(`\n✅ Saved ${downloaded} SVG files to public/maps/`);
    console.log(`✅ Updated ${downloaded + skipped} imageUrls in geography.v1.json`);
  } else if (DRY_RUN) {
    console.log(`\n(dry-run) Would download ${downloaded} files.`);
  }

  if (failed > 0) {
    console.log(`⚠️  ${failed} downloads failed — re-run to retry.`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
