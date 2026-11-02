#!/usr/bin/env node
// Link-preview picture (texts, Instagram, Facebook): npm run brand:link-preview
// The sign-in logo centred on the app's navy, 1200×630 (Open Graph size). Chat
// apps cache previews by URL, so new artwork ships under a NEW file name.
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const LOGO = path.join(ROOT, 'public/brand/htc-logo.png');
const OUTPUT = path.join(ROOT, 'public/brand/share/hightop-link-preview-v1.png');
const WIDTH = 1200;
const HEIGHT = 630;
const LOGO_SIZE = 560;

const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs><radialGradient id="g" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="#172b57"/><stop offset="45%" stop-color="#0b1635"/><stop offset="100%" stop-color="#020617"/>
  </radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`);

async function main() {
  const logo = await sharp(LOGO).resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await require('node:fs').promises.mkdir(path.dirname(OUTPUT), { recursive: true });
  const info = await sharp(background)
    .composite([{ input: logo, left: (WIDTH - LOGO_SIZE) / 2, top: (HEIGHT - LOGO_SIZE) / 2 }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(OUTPUT);
  console.log(`${path.relative(ROOT, OUTPUT)} ${info.width}×${info.height} ${(info.size / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
