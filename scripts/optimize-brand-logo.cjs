#!/usr/bin/env node
/**
 * Writes the small web-served Hightop logo files from the 1254px source:
 *   public/brand/htc-logo.png -> public/brand/web/htc-logo-{96,192,512}.webp
 *   public/brand/htc-logo.png -> public/store/logo/hightop-challenge-logo.png (the store's free transparent download,
 *   trimmed to the artwork; path mirrors BRAND_LOGO_DOWNLOAD in lib/brandLogoDownload.ts)
 * Pages must reference these, never the 1.7 MB originals (which stay in public/brand/ for outside links).
 *
 * IMMUTABLE-NAME RULE: next.config.ts serves /brand/web/* with `Cache-Control: public, max-age=31536000, immutable`.
 * A browser that has a file will never re-check it, so if the logo artwork ever changes, write the new files
 * under NEW names (e.g. htc-logo-v2-192.webp) and repoint the references. Never overwrite in place.
 *
 * Plan: docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 2.
 * Usage: npm run brand:images
 */
const { mkdirSync, statSync } = require("fs");
const { join } = require("path");
const sharp = require("sharp");

const SRC = join(process.cwd(), "public", "brand", "htc-logo.png");
const OUT = join(process.cwd(), "public", "brand", "web");
const SIZES = [96, 192, 512];
const DOWNLOAD_OUT = join(process.cwd(), "public", "store", "logo", "hightop-challenge-logo.png");
const DOWNLOAD_MARGIN = 24;
const QUALITY = 82;

(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const size of SIZES) {
    const out = join(OUT, `htc-logo-${size}.webp`);
    const info = await sharp(SRC)
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY, alphaQuality: 100 })
      .toFile(out);
    console.log(`${out.replace(process.cwd() + "/", "")} ${info.width}x${info.height} ${(statSync(out).size / 1024).toFixed(1)} KB`);
  }

  mkdirSync(join(DOWNLOAD_OUT, ".."), { recursive: true });
  const trimmed = await sharp(SRC).trim({ threshold: 1 }).toBuffer();
  const info = await sharp(trimmed)
    .extend({
      top: DOWNLOAD_MARGIN,
      bottom: DOWNLOAD_MARGIN,
      left: DOWNLOAD_MARGIN,
      right: DOWNLOAD_MARGIN,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(DOWNLOAD_OUT);
  console.log(
    `${DOWNLOAD_OUT.replace(process.cwd() + "/", "")} ${info.width}x${info.height} ${(statSync(DOWNLOAD_OUT).size / 1024).toFixed(1)} KB`,
  );
})();
