#!/usr/bin/env node
/**
 * Draws the share pictures (docs/native-app-store-plan.md Phase 9b) with the REAL renderer —
 * lib/socialShare/storyCanvas.ts, bundled by esbuild — in Playwright's Chromium, with no dev
 * server and nothing touching proxy.ts. Public files (logo, QR, frames) are served from
 * public/; the page loads the local Nunito face and the same --ht-font-* aliases
 * used in the app. Every picture's QR is then decoded (jsQR)
 * and must equal APP_DOWNLOAD_URL, so this is also an end-to-end check of the QR.
 *
 * Usage:
 *   npm run share-card:render                 → tmp/share-cards/<case>-<design>-<size>.png
 *   npm run share-card:render -- --sheet      → also tmp/share-cards/contact-sheet.png (all of them)
 * The selfie has no photo here, so it is drawn on a grey stand-in.
 */
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("fs");
const { join, extname } = require("path");
const esbuild = require("esbuild");
const { chromium } = require("playwright");
const sharp = require("sharp");
const jsQR = require("jsqr");

const ROOT = process.cwd();
const OUT = join(ROOT, "tmp", "share-cards");
const ORIGIN = "http://share-cards.local";
const SHEET = process.argv.includes("--sheet");

const ENTRY = `
import { renderStoryImage } from "@/lib/socialShare/storyCanvas";
import { buildShareDesignSpec, STORY_SHARE_SIZE_ORDER } from "@/lib/socialShare/shareDesigns";
import { buildPrizeStorySharePayload, buildStorySharePayload, prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";

const address = { street: "1010 Pacific St", locality: "Brooklyn, NY" };
const CASES = {
  "trivia-champion": buildStorySharePayload("live-trivia", { venueId: "v", venueName: "The Pour House", venueAddress: address, userId: "u", username: "ace", finalRank: 1, finalPoints: 120, correctRate: 80 }),
  "blitz-third": buildStorySharePayload("category-blitz", { venueId: "v", venueName: "Seven Sirens Brewing Company", venueAddress: { street: "327 Broadway", locality: "Bethlehem, PA" }, userId: "u", username: "speedy_sam", finalRank: 3, finalPoints: 45, correctRate: 62, isChampion: false }),
  "bingo-no-address": buildStorySharePayload("bingo", { venueId: "v", venueName: "Garden State Bar", userId: "u", username: "bingoqueen", isChampion: true }),
  "prize-gift-card": buildPrizeStorySharePayload({ venueId: "v", venueName: "The Pour House", venueAddress: address, userId: "u", username: "ace", prize: { headline: "$15", headlineKind: "amount", label: "GIFT CARD" } }),
  "prize-appetizer": buildPrizeStorySharePayload({ venueId: "v", venueName: "Carrabba's Italian Grill", venueAddress: { street: "335 New Jersey 18", locality: "East Brunswick, NJ" }, userId: "u", username: "ace", prize: { headline: "50% Off Appetizer", headlineKind: "phrase", label: "PRIZE" } }),
  // Phase 9e: what applyShareVenue (lib/socialShare/shareVenue.ts) hands the designs for each venue choice.
  "handle-all": { ...buildPrizeStorySharePayload({ venueId: "v", venueName: "The Pour House", venueAddress: address, userId: "u", username: "ace", prize: { headline: "$15", headlineKind: "amount", label: "GIFT CARD" } }), venueInstagram: "thepourhouse" },
  "handle-only": { ...buildStorySharePayload("live-trivia", { venueId: "v", venueName: null, userId: "u", username: "ace", finalRank: 1, finalPoints: 120, correctRate: 80 }), venueInstagram: "thepourhouse" },
  "nothing-shown": buildStorySharePayload("pickem", { venueId: "v", venueName: null, userId: "u", username: "ace", finalRank: 1, finalPoints: 30, isChampion: true }),
};

const toDataUrl = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });

window.renderAll = async () => {
  const grey = document.createElement("canvas");
  grey.width = 720; grey.height = 1280;
  const g = grey.getContext("2d"); g.fillStyle = "#6b7280"; g.fillRect(0, 0, 720, 1280);
  const out = [];
  for (const [name, payload] of Object.entries(CASES)) {
    for (const size of STORY_SHARE_SIZE_ORDER) {
      const prepared = prepareStorySharePayload(payload, { size });
      for (const design of ["spotlight", "card", "night", "selfie"]) {
        const spec = buildShareDesignSpec(prepared, design, size);
        const blob = await renderStoryImage({ spec, source: design === "selfie" ? grey : null });
        out.push({ file: name + "-" + design + "-" + size + ".png", data: await toDataUrl(blob) });
      }
    }
  }
  return out;
};
`;

const MIME = { ".png": "image/png", ".webp": "image/webp", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };

(async () => {
  mkdirSync(OUT, { recursive: true });
  const bundle = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: "ts" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    alias: { "@": ROOT },
    tsconfig: join(ROOT, "tsconfig.json"),
    logLevel: "error",
  });
  const script = bundle.outputFiles[0].text;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="/fonts/nunito-v1.css" rel="stylesheet">
</head><body><script src="/bundle.js"></script></body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route(`${ORIGIN}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
      if (path === "/bundle.js") return route.fulfill({ contentType: "text/javascript", body: script });
      const file = join(ROOT, "public", path);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
    });
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const pictures = await page.evaluate(() => window.renderAll());

    let failures = 0;
    for (const { file, data } of pictures) {
      const buffer = Buffer.from(data.split(",")[1], "base64");
      writeFileSync(join(OUT, file), buffer);
      const { data: raw, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(raw), info.width, info.height)?.data ?? null;
      const ok = decoded === "https://hightopchallenge.com/app";
      if (!ok) failures += 1;
      console.log(`${ok ? "ok " : "BAD"} ${file}  ${info.width}x${info.height}  QR=${decoded}`);
    }

    if (SHEET) {
      const thumbs = await Promise.all(pictures.map(({ data }) =>
        sharp(Buffer.from(data.split(",")[1], "base64")).resize({ height: 480 }).png().toBuffer()));
      const metas = await Promise.all(thumbs.map((t) => sharp(t).metadata()));
      const columns = 8; // a post thumbnail is 384 px wide at 480 px tall
      const cellW = 400;
      const cellH = 500;
      const rows = Math.ceil(thumbs.length / columns);
      await sharp({ create: { width: columns * cellW, height: rows * cellH, channels: 3, background: "#1f2937" } })
        .composite(thumbs.map((input, i) => ({
          input,
          left: (i % columns) * cellW + Math.round((cellW - metas[i].width) / 2),
          top: Math.floor(i / columns) * cellH + 10,
        })))
        .png()
        .toFile(join(OUT, "contact-sheet.png"));
      console.log(`contact sheet → tmp/share-cards/contact-sheet.png`);
    }
    if (failures > 0) {
      console.error(`${failures} picture(s) did not decode to the app link`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})();
