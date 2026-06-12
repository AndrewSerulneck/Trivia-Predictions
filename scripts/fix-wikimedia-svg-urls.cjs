#!/usr/bin/env node
/**
 * Converts remaining direct Wikimedia SVG URLs in geography.v1.json to
 * their pre-rendered 960px PNG thumbnail equivalents, which aren't subject
 * to the same Wikimedia rate-limit as the raw SVG paths.
 *
 * SVG direct URL format:
 *   https://upload.wikimedia.org/wikipedia/commons/{hash}/{filename}.svg
 * PNG thumb URL format:
 *   https://upload.wikimedia.org/wikipedia/commons/thumb/{hash}/{filename}.svg/960px-{filename}.svg.png
 *
 * Usage:
 *   node scripts/fix-wikimedia-svg-urls.cjs [--dry-run] [--verify]
 */

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const GEO_FILE = join(process.cwd(), "data", "live-trivia", "categories", "geography.v1.json");
const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY = process.argv.includes("--verify");

// Matches direct SVG URL and captures the hash path + filename
const SVG_RE = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([a-f0-9]\/[a-f0-9]+\/)(.+\.svg)$/;

function toThumbPng(svgUrl) {
  const m = svgUrl.match(SVG_RE);
  if (!m) return null;
  const [, hashPath, filename] = m;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hashPath}${filename}/960px-${filename}.png`;
}

async function verifyUrl(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "Hightop-Trivia-App/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const raw = JSON.parse(readFileSync(GEO_FILE, "utf-8"));
  const questions = raw.questions;

  const targets = questions.filter(
    (q) => q.imageUrl && SVG_RE.test(q.imageUrl)
  );

  console.log(`\nFound ${targets.length} questions with direct Wikimedia SVG URLs to convert.\n`);

  let converted = 0;
  let failed = 0;

  for (const q of targets) {
    const thumbUrl = toThumbPng(q.imageUrl);
    if (!thumbUrl) {
      console.log(`  [skip] Could not parse URL for ${q.slug}: ${q.imageUrl}`);
      failed++;
      continue;
    }

    if (VERIFY) {
      process.stdout.write(`  [${q.answer}] Verifying … `);
      const ok = await verifyUrl(thumbUrl);
      if (!ok) {
        console.log(`❌ thumb URL returned error`);
        failed++;
        await delay(300);
        continue;
      }
      console.log("✓");
      await delay(300);
    } else {
      console.log(`  [${q.answer}] ${q.imageUrl.split("/").pop()} → 960px PNG`);
    }

    if (!DRY_RUN) {
      q.imageUrl = thumbUrl;
    }
    converted++;
  }

  if (!DRY_RUN && converted > 0) {
    writeFileSync(GEO_FILE, JSON.stringify(raw, null, 2) + "\n", "utf-8");
    console.log(`\n✅ Updated ${converted} imageUrls in geography.v1.json`);
  } else if (DRY_RUN) {
    console.log(`\n(dry-run) Would convert ${converted} URLs.`);
  }

  if (failed > 0) {
    console.log(`⚠️  ${failed} URLs could not be converted.`);
  }

  console.log("\nDone. Run `npm run landmark:review` to regenerate the review page.");
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
