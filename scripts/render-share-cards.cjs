#!/usr/bin/env node
/**
 * Draws the share pictures (docs/native-app-store-plan.md Phase 9b) with the REAL renderer —
 * lib/socialShare/storyCanvas.ts, bundled by esbuild — in Playwright's Chromium, with no dev
 * server and nothing touching proxy.ts. Public files (logo, frames) are served from
 * public/; the page loads the local Nunito face and the same --ht-font-* aliases
 * used in the app. Every picture is then scanned (jsQR) and must hold NO QR code
 * (Andrew, 2026-11-11: people seeing a post aren't at the bar).
 *
 * Usage:
 *   npm run share-card:render                 → tmp/share-cards/<case>-<design>-<size>.png
 *   npm run share-card:render -- --sheet      → also tmp/share-cards/contact-sheet.png (all of them)
 *                                               and tmp/share-cards/effects-sheet.png (the celebration
 *                                               effects: each alone, then all four, every design and size)
 *   npm run share-card:render -- --video      → the animated Story (Phase 2) instead: real MP4s made by
 *                                               lib/socialShare/celebrationVideo.ts in Google Chrome
 *                                               (Playwright's Chromium has no H.264), decoded back and
 *                                               checked (5 s, 30 fps, 1080×1920, H.264, no sound, no QR
 *                                               in the held frame), plus tmp/share-cards/video-strip.png
 * The selfie has no photo here, so it is drawn on a grey stand-in.
 * Effect pictures are named <case>-<design>-<size>-fx-<effects>.png (docs/share-win-celebration-plan.md).
 */
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("fs");
const { join, extname } = require("path");
const esbuild = require("esbuild");
const { chromium } = require("playwright");
const sharp = require("sharp");
const jsQR = require("jsqr");

const ROOT = process.cwd();
const OUT = join(ROOT, "tmp", "share-cards");
const SHEET = process.argv.includes("--sheet");
const VIDEO = process.argv.includes("--video");
// WebCodecs (the video encoder) runs only on a secure page; every request is answered by page.route.
const ORIGIN = VIDEO ? "https://share-cards.local" : "http://share-cards.local";
const EFFECT_SETS_COUNT = 5;

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

// The celebration effects: each alone, then all four, on a few cases (every design and size).
const EFFECT_CASES = ["trivia-champion", "prize-gift-card", "handle-all"];
const EFFECT_SETS = [["fireworks"], ["lasers"], ["confetti"], ["clapping"], ["fireworks", "lasers", "confetti", "clapping"]];

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
        if (!EFFECT_CASES.includes(name)) continue;
        for (const effects of EFFECT_SETS) {
          const fxSpec = buildShareDesignSpec(prepared, design, size, { effects });
          const fxBlob = await renderStoryImage({ spec: fxSpec, source: design === "selfie" ? grey : null });
          out.push({ file: name + "-" + design + "-" + size + "-fx-" + effects.join("+") + ".png", effect: true, data: await toDataUrl(fxBlob) });
        }
      }
    }
  }
  return out;
};
`;

// The animated Story: a few cases, each effect set the guests pick most, every frame decoded back.
const VIDEO_ENTRY = `
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { buildShareDesignAnimation, buildShareDesignSpec } from "@/lib/socialShare/shareDesigns";
import { canMakeCelebrationVideo, encodeCelebrationVideo } from "@/lib/socialShare/celebrationVideo";
import { renderStoryImage } from "@/lib/socialShare/storyCanvas";
import { buildPrizeStorySharePayload, buildStorySharePayload, prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";

const address = { street: "1010 Pacific St", locality: "Brooklyn, NY" };
const trivia = buildStorySharePayload("live-trivia", { venueId: "v", venueName: "The Pour House", venueAddress: address, userId: "u", username: "ace", finalRank: 1, finalPoints: 120, correctRate: 80 });
const prize = { ...buildPrizeStorySharePayload({ venueId: "v", venueName: "The Pour House", venueAddress: address, userId: "u", username: "ace", prize: { headline: "$15", headlineKind: "amount", label: "GIFT CARD" } }), venueInstagram: "thepourhouse" };
const ALL = ["fireworks", "lasers", "confetti", "clapping"];
const VIDEOS = [
  { name: "trivia-spotlight-all", payload: trivia, design: "spotlight", effects: ALL },
  { name: "trivia-night-fireworks", payload: trivia, design: "night", effects: ["fireworks"] },
  { name: "prize-card-confetti-clapping", payload: prize, design: "card", effects: ["confetti", "clapping"] },
  { name: "trivia-selfie-all", payload: trivia, design: "selfie", effects: ALL },
];
const STRIP_TIMES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.95];

const toDataUrl = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
const canvasUrl = (canvas) => new Promise((resolve) => canvas.toBlob(async (blob) => resolve(await toDataUrl(blob)), "image/png"));

window.renderVideos = async () => {
  if (!(await canMakeCelebrationVideo())) throw new Error("This browser can't make the video.");
  const grey = document.createElement("canvas");
  grey.width = 720; grey.height = 1280;
  const g = grey.getContext("2d"); g.fillStyle = "#6b7280"; g.fillRect(0, 0, 720, 1280);
  const out = [];
  for (const { name, payload, design, effects } of VIDEOS) {
    const prepared = prepareStorySharePayload(payload, { size: "story" });
    const source = design === "selfie" ? grey : null;
    const started = performance.now();
    const blob = await encodeCelebrationVideo({ ...buildShareDesignAnimation(prepared, design, "story", { effects }), source });
    const encodeMs = Math.round(performance.now() - started);
    const still = await renderStoryImage({ spec: buildShareDesignSpec(prepared, design, "story", { effects }), source });

    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const stats = await track.computePacketStats();
    const sink = new CanvasSink(track, { poolSize: 0 });
    const frames = [];
    for (const t of STRIP_TIMES) {
      const wrapped = await sink.getCanvas(t);
      frames.push({ t, data: await canvasUrl(wrapped.canvas) });
    }
    out.push({
      name,
      bytes: blob.size,
      encodeMs,
      duration: await input.computeDuration(),
      codec: await track.getCodecParameterString(),
      width: track.displayWidth,
      height: track.displayHeight,
      packets: stats.packetCount,
      hasAudio: audio !== null,
      mp4: await toDataUrl(blob),
      still: await toDataUrl(still),
      frames,
    });
  }
  return out;
};
`;

const MIME = { ".png": "image/png", ".webp": "image/webp", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };

const renderVideos = async (page) => {
  const videos = await page.evaluate(() => window.renderVideos());
  let failures = 0;
  const strips = [];
  for (const video of videos) {
    writeFileSync(join(OUT, `video-${video.name}.mp4`), Buffer.from(video.mp4.split(",")[1], "base64"));
    const problems = [];
    if (Math.abs(video.duration - 5) > 0.05) problems.push(`duration ${video.duration}`);
    if (video.packets !== 150) problems.push(`${video.packets} frames`);
    if (video.width !== 1080 || video.height !== 1920) problems.push(`${video.width}x${video.height}`);
    if (!String(video.codec).startsWith("avc1")) problems.push(`codec ${video.codec}`);
    if (video.hasAudio) problems.push("has a sound track");
    // The held frame is the still picture: it has no QR, and it looks like the still.
    const last = Buffer.from(video.frames.at(-1).data.split(",")[1], "base64");
    const { data: raw, info } = await sharp(last).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const qr = jsQR(new Uint8ClampedArray(raw), info.width, info.height)?.data ?? null;
    if (qr !== null) problems.push(`held-frame QR=${qr}`);
    const still = await sharp(Buffer.from(video.still.split(",")[1], "base64")).ensureAlpha().raw().toBuffer();
    let diff = 0;
    for (let i = 0; i < raw.length; i += 4) diff += Math.abs(raw[i] - still[i]) + Math.abs(raw[i + 1] - still[i + 1]) + Math.abs(raw[i + 2] - still[i + 2]);
    const meanDiff = diff / (raw.length / 4) / 3;
    if (meanDiff > 6) problems.push(`held frame differs from the still (mean ${meanDiff.toFixed(1)}/255)`);
    if (problems.length) failures += 1;
    console.log(`${problems.length ? "BAD" : "ok "} video-${video.name}.mp4  ${(video.bytes / 1e6).toFixed(2)} MB  encoded in ${(video.encodeMs / 1000).toFixed(1)} s  ${video.codec}  held-frame diff ${meanDiff.toFixed(1)}/255${problems.length ? `  ← ${problems.join("; ")}` : ""}`);
    strips.push(video.frames);
  }
  // One row per video, one column per moment (0, 0.5 … 3.5 s, then the held frame).
  const cells = strips.flat();
  const thumbs = await Promise.all(cells.map(({ data }) => sharp(Buffer.from(data.split(",")[1], "base64")).resize({ height: 480 }).png().toBuffer()));
  const columns = strips[0].length;
  await sharp({ create: { width: columns * 280, height: strips.length * 490, channels: 3, background: "#1f2937" } })
    .composite(thumbs.map((input, i) => ({ input, left: (i % columns) * 280 + 5, top: Math.floor(i / columns) * 490 + 5 })))
    .png()
    .toFile(join(OUT, "video-strip.png"));
  console.log("strip → tmp/share-cards/video-strip.png");
  if (failures > 0) {
    console.error(`${failures} video(s) failed the checks`);
    process.exitCode = 1;
  }
};

(async () => {
  mkdirSync(OUT, { recursive: true });
  const bundle = await esbuild.build({
    stdin: { contents: VIDEO ? VIDEO_ENTRY : ENTRY, resolveDir: ROOT, loader: "ts" },
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

  // H.264 needs Google Chrome; the pictures draw in Playwright's own Chromium.
  const browser = await chromium.launch(VIDEO ? { channel: "chrome" } : {});
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
    if (VIDEO) {
      await renderVideos(page);
      return;
    }
    const pictures = await page.evaluate(() => window.renderAll());

    let failures = 0;
    for (const { file, data } of pictures) {
      const buffer = Buffer.from(data.split(",")[1], "base64");
      writeFileSync(join(OUT, file), buffer);
      const { data: raw, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(raw), info.width, info.height)?.data ?? null;
      const ok = decoded === null;
      if (!ok) failures += 1;
      console.log(`${ok ? "ok " : "BAD"} ${file}  ${info.width}x${info.height}  QR=${decoded}`);
    }

    const sheet = async (list, columns, file) => {
      const thumbs = await Promise.all(list.map(({ data }) =>
        sharp(Buffer.from(data.split(",")[1], "base64")).resize({ height: 480 }).png().toBuffer()));
      const metas = await Promise.all(thumbs.map((t) => sharp(t).metadata()));
      const cellW = 400; // a post thumbnail is 384 px wide at 480 px tall
      const cellH = 500;
      const rows = Math.ceil(thumbs.length / columns);
      await sharp({ create: { width: columns * cellW, height: rows * cellH, channels: 3, background: "#1f2937" } })
        .composite(thumbs.map((input, i) => ({
          input,
          left: (i % columns) * cellW + Math.round((cellW - metas[i].width) / 2),
          top: Math.floor(i / columns) * cellH + 10,
        })))
        .png()
        .toFile(join(OUT, file));
      console.log(`sheet → tmp/share-cards/${file}`);
    };
    if (SHEET) {
      await sheet(pictures.filter((picture) => !picture.effect), 8, "contact-sheet.png");
      // One row per case × design × size: each effect alone, then all four.
      await sheet(pictures.filter((picture) => picture.effect), EFFECT_SETS_COUNT, "effects-sheet.png");
    }
    if (failures > 0) {
      console.error(`${failures} picture(s) did not decode to the app link`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})();
