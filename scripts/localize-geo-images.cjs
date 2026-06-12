#!/usr/bin/env node
/**
 * Two jobs in one pass:
 *
 * JOB 1 — Localize 67 Wikimedia thumb PNG URLs
 *   Downloads each thumb PNG to public/maps/{slug}.png and rewrites
 *   the imageUrl in geography.v1.json to /maps/{slug}.png.
 *
 * JOB 2 — Replace 5 oversized Wikimedia SVGs
 *   For Arizona, Mexico, Egypt, Nigeria, Kenya: searches Wikimedia
 *   Commons for a PNG thumb, downloads it, replaces the local SVG
 *   reference in the JSON, and deletes the oversized SVG file.
 *
 * Usage:
 *   node scripts/localize-geo-images.cjs
 *   node scripts/localize-geo-images.cjs --dry-run
 */

const { readFileSync, writeFileSync, existsSync, unlinkSync } = require("fs");
const { join } = require("path");

const GEO_FILE = join(process.cwd(), "data", "live-trivia", "categories", "geography.v1.json");
const MAPS_DIR = join(process.cwd(), "public", "maps");
const DRY_RUN = process.argv.includes("--dry-run");

const HEADERS = {
  "User-Agent": "Hightop-Trivia-App/1.0 (localizing images for offline use)",
  Accept: "image/png,image/*,*/*",
};

const WIKI_API = "https://commons.wikimedia.org/w/api.php";

// These SVGs are too large (300KB–2.3MB Inkscape exports) — replace with thumb PNGs
const OVERSIZED_SVGS = new Set([
  "geography-map-arizona.svg",
  "geography-map-mexico.svg",
  "geography-map-egypt.svg",
  "geography-map-nigeria.svg",
  "geography-map-kenya.svg",
]);

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadBinary(url, destPath) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  writeFileSync(destPath, Buffer.from(buf));
}

async function findWikimediaThumb(query) {
  const url =
    `${WIKI_API}?action=query` +
    `&generator=search&gsrsearch=${encodeURIComponent(query + " location map")}` +
    `&gsrnamespace=6&gsrlimit=20` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=960` +
    `&format=json&origin=*`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Wikimedia search HTTP ${res.status}`);
  const data = await res.json();
  const pages = Object.values(data?.query?.pages ?? {});
  if (!pages.length) return null;

  // Prefer PNG/JPG files; among those prefer files whose title contains the query word
  const queryWord = query.split(" ")[0].toLowerCase();
  const ranked = pages
    .filter((p) => {
      const ext = (p.title ?? "").toLowerCase().split(".").pop();
      return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "svg";
    })
    .sort((a, b) => {
      const aMatch = (a.title ?? "").toLowerCase().includes(queryWord) ? 0 : 1;
      const bMatch = (b.title ?? "").toLowerCase().includes(queryWord) ? 0 : 1;
      return aMatch - bMatch;
    });

  const best = ranked[0];
  return best?.imageinfo?.[0]?.thumburl ?? null;
}

async function main() {
  const raw = JSON.parse(readFileSync(GEO_FILE, "utf-8"));
  const questions = raw.questions;

  // ── JOB 1: Localize thumb PNG URLs ──────────────────────────────────────────
  const thumbTargets = questions.filter(
    (q) => q.imageUrl && q.imageUrl.includes("wikimedia.org/wikipedia/commons/thumb/")
  );
  console.log(`\nJOB 1: ${thumbTargets.length} Wikimedia thumb PNGs to download locally.`);
  if (DRY_RUN) console.log("(dry-run)\n");

  let j1ok = 0, j1skip = 0, j1fail = 0;

  for (const q of thumbTargets) {
    const destName = `${q.slug}.png`;
    const destPath = join(MAPS_DIR, destName);
    const localUrl = `/maps/${destName}`;

    if (existsSync(destPath)) {
      process.stdout.write(`  [skip] ${q.slug} already exists\n`);
      if (!DRY_RUN) q.imageUrl = localUrl;
      j1skip++;
      continue;
    }

    process.stdout.write(`  [${q.answer}] downloading … `);
    if (DRY_RUN) { console.log("(dry-run)"); j1ok++; continue; }

    try {
      await downloadBinary(q.imageUrl, destPath);
      q.imageUrl = localUrl;
      console.log("✓");
      j1ok++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      j1fail++;
    }
    await delay(3000);
  }

  // ── JOB 2: Replace oversized SVGs ───────────────────────────────────────────
  const svgTargets = questions.filter(
    (q) =>
      q.imageUrl &&
      q.imageUrl.startsWith("/maps/") &&
      OVERSIZED_SVGS.has(q.imageUrl.replace("/maps/", ""))
  );
  console.log(`\nJOB 2: ${svgTargets.length} oversized SVGs to replace.`);

  let j2ok = 0, j2fail = 0;

  for (const q of svgTargets) {
    const destName = `${q.slug}.png`;
    const destPath = join(MAPS_DIR, destName);
    const localUrl = `/maps/${destName}`;

    if (existsSync(destPath)) {
      process.stdout.write(`  [skip] ${q.slug} PNG already exists\n`);
      if (!DRY_RUN) q.imageUrl = localUrl;
      j2ok++;
      continue;
    }

    process.stdout.write(`  [${q.answer}] searching Wikimedia … `);
    if (DRY_RUN) { console.log("(dry-run)"); j2ok++; continue; }

    try {
      const thumbUrl = await findWikimediaThumb(q.answer);
      if (!thumbUrl) throw new Error("no thumb URL found");
      process.stdout.write(`found. downloading … `);
      await downloadBinary(thumbUrl, destPath);

      // Delete the oversized SVG
      const svgPath = join(MAPS_DIR, q.imageUrl.replace("/maps/", ""));
      if (existsSync(svgPath)) unlinkSync(svgPath);

      q.imageUrl = localUrl;
      console.log("✓");
      j2ok++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      j2fail++;
    }
    await delay(3000);
  }

  // ── Write JSON ───────────────────────────────────────────────────────────────
  if (!DRY_RUN && (j1ok + j1skip + j2ok) > 0) {
    writeFileSync(GEO_FILE, JSON.stringify(raw, null, 2) + "\n", "utf-8");
    console.log(`\n✅ geography.v1.json updated.`);
  }

  console.log(`\nJob 1 (thumb PNGs): ${j1ok} downloaded, ${j1skip} skipped, ${j1fail} failed`);
  console.log(`Job 2 (oversized SVGs): ${j2ok} replaced, ${j2fail} failed`);
  if (j1fail + j2fail > 0) console.log("Re-run to retry failures.");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
