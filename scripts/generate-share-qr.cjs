#!/usr/bin/env node
/**
 * Generates the QR code printed on every share picture from lib/socialShare/shareQr.ts:
 *   public/share/app-download-qr-v1.png  (black on white, quiet zone included)
 * Same encoder as the join QR (qrcode.react, scripts/generate-join-qr.cjs) and sharp:
 * 1px per module, then a whole-number nearest-neighbour upscale so module edges stay sharp.
 * tests/share-card-qr.test.ts decodes the file and fails if it drifts from APP_DOWNLOAD_URL.
 * Plan: docs/native-app-store-plan.md Phase 9b.
 *
 * Usage: npm run share:qr
 */
const { mkdirSync, statSync } = require("fs");
const { join } = require("path");
const sharp = require("sharp");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { QRCodeSVG } = require("qrcode.react");
const {
  SHARE_QR_LEVEL,
  SHARE_QR_MARGIN,
  SHARE_QR_PX_PER_MODULE,
  SHARE_QR_SRC,
  SHARE_QR_VALUE,
} = require("../lib/socialShare/shareQr.ts");

(async () => {
  const markup = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value: SHARE_QR_VALUE,
      level: SHARE_QR_LEVEL,
      marginSize: SHARE_QR_MARGIN,
      size: 1024,
      bgColor: "#FFFFFF",
      fgColor: "#000000",
      xmlns: "http://www.w3.org/2000/svg",
    }),
  );
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(markup);
  if (!viewBox) throw new Error("QRCodeSVG output has no viewBox");
  const modules = Number(viewBox[1]);

  const out = join(process.cwd(), "public", SHARE_QR_SRC);
  mkdirSync(join(out, ".."), { recursive: true });
  const base = await sharp(Buffer.from(markup.replace(/(width|height)="\d+"/g, `$1="${modules}"`)))
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  const px = modules * SHARE_QR_PX_PER_MODULE;
  await sharp(base)
    .resize(px, px, { kernel: "nearest" })
    .png({ palette: true, colours: 2, compressionLevel: 9 })
    .toFile(out);

  console.log(`${SHARE_QR_VALUE} -> ${modules} modules (incl. ${SHARE_QR_MARGIN}-module quiet zone), level ${SHARE_QR_LEVEL}`);
  console.log(`  ${SHARE_QR_SRC}  ${px}px, ${(statSync(out).size / 1024).toFixed(1)} KB`);
})();
