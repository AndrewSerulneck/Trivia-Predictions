#!/usr/bin/env node
/**
 * Generates the free-download join QR code from lib/joinQr.ts:
 *   public/store/qr/hightop-challenge-qr.svg  (vector, for printers)
 *   public/store/qr/hightop-challenge-qr.png  (>= 2048px, crisp square modules)
 * Uses qrcode.react's own encoder (the same one app/tv/page.tsx renders) and
 * sharp. The PNG is rasterised at 1px per module, then upscaled with
 * nearest-neighbour so every module edge stays sharp.
 * tests/lib.join-qr.test.ts decodes both files and fails if they drift.
 * Plan: docs/join-merch-store-plan.md.
 *
 * Usage: npm run store:qr
 */
const { mkdirSync, writeFileSync, statSync } = require("fs");
const { join } = require("path");
const sharp = require("sharp");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { QRCodeSVG } = require("qrcode.react");
const {
  JOIN_QR_FILES,
  JOIN_QR_LEVEL,
  JOIN_QR_MARGIN,
  JOIN_QR_PNG_MIN_PX,
  JOIN_QR_URL,
} = require("../lib/joinQr.ts");

const publicPath = (src) => join(process.cwd(), "public", src);

(async () => {
  const markup = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value: JOIN_QR_URL,
      level: JOIN_QR_LEVEL,
      marginSize: JOIN_QR_MARGIN,
      size: 1024,
      bgColor: "#FFFFFF",
      fgColor: "#000000",
      xmlns: "http://www.w3.org/2000/svg",
    }),
  );
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(markup);
  if (!viewBox) throw new Error("QRCodeSVG output has no viewBox");
  const modules = Number(viewBox[1]);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`;

  const svgOut = publicPath(JOIN_QR_FILES.svg.src);
  mkdirSync(join(svgOut, ".."), { recursive: true });
  writeFileSync(svgOut, svg);

  // 1px per module, then a whole-number nearest-neighbour upscale.
  const scale = Math.ceil(JOIN_QR_PNG_MIN_PX / modules);
  const pngOut = publicPath(JOIN_QR_FILES.png.src);
  const base = await sharp(Buffer.from(markup.replace(/(width|height)="\d+"/g, `$1="${modules}"`)))
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  await sharp(base)
    .resize(modules * scale, modules * scale, { kernel: "nearest" })
    .png({ palette: true, colours: 2, compressionLevel: 9 })
    .toFile(pngOut);

  console.log(`${JOIN_QR_URL} -> ${modules} modules (incl. ${JOIN_QR_MARGIN}-module quiet zone), level ${JOIN_QR_LEVEL}`);
  console.log(`  ${JOIN_QR_FILES.svg.src}  ${(statSync(svgOut).size / 1024).toFixed(1)} KB`);
  console.log(`  ${JOIN_QR_FILES.png.src}  ${modules * scale}px, ${(statSync(pngOut).size / 1024).toFixed(1)} KB`);
})();
