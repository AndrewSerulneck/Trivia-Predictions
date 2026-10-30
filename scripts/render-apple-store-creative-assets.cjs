#!/usr/bin/env node
// Render from the existing editable Play artwork design; no API, network or app server.
const { readFileSync, mkdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/app-store');
const dataUrl = (file, mime) => `data:${mime};base64,${readFileSync(path.join(ROOT, file)).toString('base64')}`;
const ASSETS = [
  { name: 'apple-product-page-header-v1', width: 3840, height: 1646, layout: 'header' },
  { name: 'apple-search-results-v1', width: 3840, height: 2560, layout: 'search' },
];

async function main() {
  const logo = dataUrl('public/brand/htc-logo.png', 'image/png');
  const font = dataUrl('public/fonts/nunito-latin-v1.woff2', 'font/woff2');
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const asset of ASSETS) {
      const page = await browser.newPage({ viewport: { width: asset.width, height: asset.height }, deviceScaleFactor: 1 });
      await page.route('http**://**', (route) => route.abort());
      await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8">
<style>
@font-face { font-family: Nunito; src: url('${font}') format('woff2'); font-weight: 400 900; font-display: block; }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${asset.width}px; height: ${asset.height}px; overflow: hidden; }
body { position: relative; font-family: Nunito, sans-serif; color: #f8fafc;
  background: radial-gradient(ellipse at 77% 49%, #172b57 0%, #0b1635 35%, #020617 80%); }
body::before { content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 0% 100%, #0891b225 0%, transparent 62%); }
main { position: absolute; }
h1 { margin: 0; font-size: 192px; font-weight: 900; line-height: 1.08; letter-spacing: -6px; white-space: nowrap; }
h1 span { color: #67e8f9; }
img { position: absolute; object-fit: contain; }
.header main { left: 336px; top: 715px; width: 1860px; }
.header img { left: 2352px; top: 271px; width: 1104px; height: 1104px; }
.search { background: radial-gradient(ellipse at 50% 43%, #172b57 0%, #0b1635 35%, #020617 80%); }
.search main { left: 400px; top: 1760px; width: 3040px; text-align: center; }
.search h1 { font-size: 224px; letter-spacing: -7px; }
.search img { left: 1240px; top: 320px; width: 1360px; height: 1360px; }
</style><body class="${asset.layout}"><main><h1>It's game <span>time.</span></h1></main>
<img alt="Hightop Challenge" src="${logo}"></body></html>`);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode()));
        if (!document.fonts.check('900 192px Nunito')) throw new Error('Nunito did not load');
        const heading = document.querySelector('h1');
        if (heading.scrollWidth > heading.clientWidth) throw new Error('Headline overflow');
        for (const element of document.querySelectorAll('main, img')) {
          const r = element.getBoundingClientRect();
          if (r.left < innerWidth * 0.08 || r.right > innerWidth * 0.92 || r.top < innerHeight * 0.08 || r.bottom > innerHeight * 0.92) {
            throw new Error('Content outside conservative 8% margins');
          }
        }
      });
      const output = path.join(OUT, `${asset.name}.png`);
      await sharp(await page.screenshot({ type: 'png' }))
        .flatten({ background: '#020617' }).removeAlpha().toColourspace('srgb')
        .png({ compressionLevel: 9 }).toFile(output);
      const meta = await sharp(output).metadata();
      if (meta.width !== asset.width || meta.height !== asset.height || meta.channels !== 3 || meta.hasAlpha) {
        throw new Error(`Invalid export: ${asset.name}`);
      }
      console.log(JSON.stringify({ file: path.relative(ROOT, output), width: meta.width, height: meta.height, channels: meta.channels, hasAlpha: meta.hasAlpha, bytes: statSync(output).size }));
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
