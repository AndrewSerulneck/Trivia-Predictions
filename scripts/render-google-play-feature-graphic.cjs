#!/usr/bin/env node
// Local artwork only: node scripts/render-google-play-feature-graphic.cjs
// Uses the existing logo unchanged and bundled Nunito; no network or app server.
const { readFileSync, mkdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'assets/app-store/google-play-feature-graphic-v3.png');
const dataUrl = (file, mime) => `data:${mime};base64,${readFileSync(path.join(ROOT, file)).toString('base64')}`;

async function main() {
  const logo = dataUrl('public/brand/htc-logo.png', 'image/png');
  const font = dataUrl('public/fonts/nunito-latin-v1.woff2', 'font/woff2');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8">
<style>
@font-face { font-family: Nunito; src: url('${font}') format('woff2'); font-weight: 400 900; font-display: block; }
* { box-sizing: border-box; }
html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
body { position: relative; font-family: Nunito, sans-serif; color: #f8fafc;
  background: radial-gradient(ellipse at 77% 49%, #172b57 0%, #0b1635 35%, #020617 80%); }
body::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 0% 100%, #0891b225 0%, transparent 62%); }
main { position: absolute; left: 72px; top: 220px; width: 510px; }
h1 { margin: 0; font-size: 58px; font-weight: 900; line-height: 1.08; letter-spacing: -2px; white-space: nowrap; }
h1 span { color: #67e8f9; }
img { position: absolute; left: 592px; top: 78px; width: 344px; height: 344px; object-fit: contain; }
</style>
<body><main><h1>It's game <span>time.</span></h1></main>
<img alt="Hightop Challenge" src="${logo}"></body></html>`;
  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    await page.route('http**://**', (route) => route.abort());
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
      if (!document.fonts.check('900 58px Nunito')) throw new Error('Nunito did not load');
      const heading = document.querySelector('h1');
      if (heading.scrollWidth > heading.clientWidth) throw new Error('Headline exceeds available width');
      for (const element of document.querySelectorAll('main, img')) {
        const r = element.getBoundingClientRect();
        if (r.left < 64 || r.right > 960 || r.top < 48 || r.bottom > 452) throw new Error('Content outside safe margins');
      }
    });
    const png = await page.screenshot({ type: 'png' });
    // Explicit RGB/24-bit PNG, without an alpha channel, as required by Play.
    await sharp(png).flatten({ background: '#020617' }).removeAlpha().png({ compressionLevel: 9 }).toFile(OUTPUT);
    const metadata = await sharp(OUTPUT).metadata();
    const bytes = statSync(OUTPUT).size;
    if (metadata.width !== 1024 || metadata.height !== 500 || metadata.channels !== 3 || bytes > 15_000_000) {
      throw new Error('Feature graphic failed size/format validation');
    }
    console.log(JSON.stringify({ file: path.relative(ROOT, OUTPUT), width: metadata.width, height: metadata.height, channels: metadata.channels, bytes }));
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
