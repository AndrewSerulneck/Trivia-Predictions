#!/usr/bin/env node
/**
 * Points every `geography-map-*` question at its locally generated region map
 * (public/maps/{slug}.svg) and sets the public-domain credit.
 *
 * Reads the current geography.v1.json from disk and only mutates imageUrl /
 * imageCredit on map questions whose SVG exists — all other content is left
 * untouched. Run `node scripts/generate-region-maps.cjs` first.
 */

const fs = require("fs");
const path = require("path");

const GEO_JSON = path.join(
  __dirname,
  "..",
  "data",
  "live-trivia",
  "categories",
  "geography.v1.json"
);
const MAPS_DIR = path.join(__dirname, "..", "public", "maps");
const CREDIT = "Map: Natural Earth / U.S. Census";

const geo = JSON.parse(fs.readFileSync(GEO_JSON, "utf8"));

let updated = 0;
const missing = [];
for (const q of geo.questions) {
  if (!q.slug.startsWith("geography-map-")) continue;
  const svgPath = path.join(MAPS_DIR, `${q.slug}.svg`);
  if (!fs.existsSync(svgPath)) {
    missing.push(q.slug);
    continue;
  }
  const url = `/maps/${q.slug}.svg`;
  if (q.imageUrl !== url || q.imageCredit !== CREDIT) {
    q.imageUrl = url;
    q.imageCredit = CREDIT;
    updated++;
  }
}

fs.writeFileSync(GEO_JSON, JSON.stringify(geo, null, 2) + "\n");
console.log(`Updated ${updated} map questions in geography.v1.json`);
if (missing.length) {
  console.log(`\nNo SVG found for ${missing.length} slugs (left unchanged):`);
  for (const s of missing) console.log("  " + s);
  process.exitCode = 1;
}
