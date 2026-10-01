#!/usr/bin/env node
/**
 * Optimizes the Join Merch store photos: assets/store-src/*.png (source originals, not served)
 * -> public/store/web/*.webp (max 1200px long edge, quality 76).
 * Fails if an output's corners are darker than #FAFAFA, because the store panel
 * is `ht-store-paper` (#FEFEFE) and the photos must blend into it.
 * Plan: docs/join-merch-store-plan.md §3a / Phase 1.
 *
 * Usage: npm run store:images
 */
const { readdirSync, mkdirSync, statSync } = require("fs");
const { join } = require("path");
const sharp = require("sharp");

const SRC = join(process.cwd(), "assets", "store-src");
const OUT = join(process.cwd(), "public", "store", "web");
const MAX_EDGE = 1200;
const QUALITY = 76;
const MIN_CORNER = 0xfa;
const PATCH = 8;

const cornerMin = async (file) => {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let min = 255;
  for (const [x0, y0] of [[0, 0], [width - PATCH, 0], [0, height - PATCH], [width - PATCH, height - PATCH]]) {
    for (let y = y0; y < y0 + PATCH; y++) {
      for (let x = x0; x < x0 + PATCH; x++) {
        for (let c = 0; c < channels; c++) min = Math.min(min, data[(y * width + x) * channels + c]);
      }
    }
  }
  return min;
};

(async () => {
  mkdirSync(OUT, { recursive: true });
  let failed = false;
  for (const name of readdirSync(SRC).filter((f) => f.endsWith(".png"))) {
    const out = join(OUT, name.replace(/\.png$/, ".webp"));
    const info = await sharp(join(SRC, name))
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(out);
    const min = await cornerMin(out);
    const ok = min >= MIN_CORNER;
    if (!ok) failed = true;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${name} -> ${info.width}x${info.height}, ${(statSync(out).size / 1024).toFixed(0)} KB, darkest corner channel ${min}`,
    );
  }
  if (failed) {
    console.error("A corner is darker than #FAFAFA; the photo will not blend into ht-store-paper.");
    process.exit(1);
  }
})();
