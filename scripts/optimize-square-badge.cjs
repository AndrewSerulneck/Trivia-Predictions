#!/usr/bin/env node
/**
 * Writes the web-served copy of Square's official "Built with Square" badge:
 *   assets/partner-src/built-with-square-badge.png (1125x320, 1.46 MB, not served)
 *   -> public/brand/partners/built-with-square-badge.webp (352 px wide = 2x the 176 px display width)
 * Square's rules: never crop, recolour, redraw or re-word the badge; keep >= 40 px clear space.
 * Resizing is not altering. NEVER trace it to an SVG. Outside /brand/web/ on purpose (that folder is
 * immutable-cached for a year); if the artwork ever changes, write a NEW file name.
 * Plan: docs/native-app-store-plan.md, Phase 3B.2.  Usage: npm run square-badge:image
 */
const { mkdirSync, statSync } = require("fs");
const { join } = require("path");
const sharp = require("sharp");

const SRC = join(process.cwd(), "assets", "partner-src", "built-with-square-badge.png");
const OUT_DIR = join(process.cwd(), "public", "brand", "partners");
const OUT = join(OUT_DIR, "built-with-square-badge.webp");

(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const info = await sharp(SRC).resize({ width: 352 }).webp({ quality: 90, alphaQuality: 100 }).toFile(OUT);
  console.log(`${OUT.replace(process.cwd() + "/", "")} ${info.width}x${info.height} ${(statSync(OUT).size / 1024).toFixed(1)} KB`);
})();
