#!/usr/bin/env node
// Small email-compatible PNGs; never serve the 1.7 MB logo in an email.
// Run: node scripts/build-partner-email-assets.cjs
// New artwork must use new filenames; preserve assets already referenced by sent emails.
const { mkdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const sharp = require("sharp");

async function main() {
  const root = join(__dirname, "..");
  const out = join(root, "public/brand/email");
  mkdirSync(out, { recursive: true });
  const assets = [
    ["public/brand/htc-logo.png", "htc-logo-v1-384.png", 384],
    ["assets/email-src/instagram.svg", "instagram-v1.png", 80],
    ["assets/email-src/facebook.svg", "facebook-v1.png", 80],
  ];
  let total = 0;
  for (const [source, filename, size] of assets) {
    const path = join(out, filename);
    await sharp(join(root, source)).resize(size, size).png({ palette: true, quality: 90 }).toFile(path);
    const bytes = statSync(path).size;
    total += bytes;
    console.log(`${filename}: ${size}x${size}, ${(bytes / 1024).toFixed(1)} KB`);
  }
  console.log(`Total images per uncached open: ${(total / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
