#!/usr/bin/env node
/**
 * Renders every game-themed Share to social picture with the REAL code (docs/game-themes-plan.md Phase 2):
 * Post + Story for each game with 1, 4 and no prizes, plus one Reel contact sheet per game (frames across
 * the timeline: the game's motion, the beats, the settle and the held end card, game-themes-plan Phase 3).
 * Read-only: no database, no network, no .env.local.
 *
 * It bundles lib/promo/promoRender.ts + promoReelRender.ts with esbuild, opens them in Playwright with
 * Nunito loaded, and writes the JPEGs to tmp/promo-previews/<engine>/ (git-ignored).
 *
 * Usage:
 *   node scripts/preview-promo-themes.cjs            # Chromium
 *   node scripts/preview-promo-themes.cjs webkit     # Safari's engine
 *   NUNITO_WOFF2=/path/to/nunito-latin.woff2 node scripts/preview-promo-themes.cjs
 *
 * Nunito: by default the Latin file next/font caches under .next/ (run `npm run dev` or `npm run build` once);
 * without it the pictures fall back to Arial and the text widths will be wrong.
 */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium, webkit } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const WORK = path.join(ROOT, "tmp", "promo-previews");
const engineName = process.argv[2] === "webkit" ? "webkit" : "chromium";

const ENTRY = `
import { renderPromoPicture } from "@/lib/promo/promoRender";
import { prepareReel } from "@/lib/promo/promoReelRender";
import { PROMO_TEMPLATES } from "@/lib/promo/promoTemplates";

const WHEN = {
  live_trivia: { days: "Thursdays", time: "8 PM" },
  category_blitz: { days: "Play any time", time: null },
  pickem: { days: "Make your picks every week", time: null },
  nfl_pickem: { days: "Make your picks every week", time: null },
  squares: { days: "Claim your square", time: null },
  bracket: { days: "Fill out your bracket", time: null },
};
const HOW = {
  live_trivia: "Win the Live Trivia game",
  pickem: "Get 8 of 10 picks right",
  nfl_pickem: "Get 12 of 14 picks right",
  squares: "Hold the winning square",
  bracket: "Finish at the top of your bracket",
};
const MANY = [
  { headline: "$50 Gift Card", howToWin: "1st place this week" },
  { headline: "Free appetizer", howToWin: "2nd place this week" },
  { headline: "20% off your order", howToWin: "3rd place" },
  { headline: "$10 Gift Card", howToWin: "4th" },
];
const toUrl = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(blob); });

window.run = async () => {
  const out = [];
  for (const template of PROMO_TEMPLATES) {
    const one = HOW[template.game] ? [{ headline: "$50 Gift Card", howToWin: HOW[template.game] }] : [];
    const variants = one.length ? [["one", one], ["many", MANY], ["none", []]] : [["none", []]];
    for (const [label, prizes] of variants) {
      for (const format of ["post", "story"]) {
        const blob = await renderPromoPicture({ format, template, when: WHEN[template.game], venueName: "Your Bar Name", venueAddress: "123 Main St · Your City", instagramHandle: "yourbar", prizes });
        out.push({ name: template.game + "-" + format + "-" + label, url: await toUrl(blob) });
      }
    }
    const scene = await prepareReel({ template, when: WHEN[template.game], venueName: "Your Bar Name", venueAddress: null, instagramHandle: "yourbar", prizes: one, musicId: null });
    // One contact sheet per game: the Reel's frames across its timeline, each labelled with its time.
    const plan = scene.plan;
    const times = [0.15, 0.4, 0.75, 1.2, 1.8, 2.4, 3.2, 5, ...(plan.prize ? [plan.prize[0] + 0.3] : []), plan.end[0] + 0.15, plan.end[0] + 0.4, plan.durationS - 0.1];
    const cols = 6;
    const fw = 270;
    const fh = 480;
    const sheet = document.createElement("canvas");
    sheet.width = cols * fw;
    sheet.height = Math.ceil(times.length / cols) * fh;
    const context = sheet.getContext("2d");
    times.forEach((t, index) => {
      const x = (index % cols) * fw;
      const y = Math.floor(index / cols) * fh;
      context.save();
      context.beginPath();
      context.rect(x, y, fw, fh);
      context.clip();
      context.setTransform(fw / 1080, 0, 0, fh / 1920, x, y);
      scene.draw(context, t);
      context.restore();
      context.fillStyle = "rgba(0, 0, 0, 0.7)";
      context.fillRect(x, y + fh - 26, 70, 26);
      context.fillStyle = "#FFFFFF";
      context.font = "700 18px Nunito";
      context.fillText(t.toFixed(2) + "s", x + 6, y + fh - 7);
    });
    out.push({ name: template.game + "-reel-sheet", url: sheet.toDataURL("image/jpeg", 0.85) });

    // The seam: the last moving frame against the held end card (the still picture), as the mean
    // difference per colour channel (0–255). Near 0 means the hand-over can't be seen.
    const frame = (t) => {
      const canvas = document.createElement("canvas");
      canvas.width = 540;
      canvas.height = 960;
      const c = canvas.getContext("2d");
      c.setTransform(0.5, 0, 0, 0.5, 0, 0);
      scene.draw(c, t);
      return c.getImageData(0, 0, 540, 960).data;
    };
    const hold = plan.end[0] + 0.6;
    const [a, b] = [frame(hold - 1 / 30), frame(hold)];
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    out.push({ name: template.game + "-seam", seam: sum / ((a.length / 4) * 3) });

    // What encoding costs on this machine: every frame of the Reel drawn at full size, in ms per frame.
    const full = document.createElement("canvas");
    full.width = 1080;
    full.height = 1920;
    const fullContext = full.getContext("2d");
    const frames = Math.round(plan.durationS * 30);
    const started = performance.now();
    for (let i = 0; i < frames; i += 1) scene.draw(fullContext, i / 30);
    fullContext.getImageData(0, 0, 1, 1); // Wait for the drawing to finish.
    out.push({ name: template.game + "-frame-ms", frameMs: (performance.now() - started) / frames });
  }
  return out;
};
`;

const findNunito = () => {
  if (process.env.NUNITO_WOFF2) return process.env.NUNITO_WOFF2;
  const dirs = [path.join(ROOT, ".next", "static", "media"), path.join(ROOT, ".next", "dev", "static", "media")];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    // next/font names the Latin subset "<hash>-s.p.<hash>.woff2" (the preloaded one).
    const file = fs.readdirSync(dir).find((name) => /-s\.p\.[\da-f]+\.woff2$/.test(name));
    if (file) return path.join(dir, file);
  }
  return null;
};

const main = async () => {
  fs.mkdirSync(WORK, { recursive: true });
  const entry = path.join(WORK, "entry.ts");
  fs.writeFileSync(entry, ENTRY);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    outfile: path.join(WORK, "bundle.js"),
    tsconfig: path.join(ROOT, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  const font = findNunito();
  if (font) fs.copyFileSync(font, path.join(WORK, "nunito.woff2"));
  else console.warn("Nunito not found: pictures will use Arial. Set NUNITO_WOFF2 or run the app once.");
  fs.writeFileSync(
    path.join(WORK, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Nunito;font-style:normal;font-weight:200 1000;src:url(nunito.woff2) format("woff2")}
:root{--ht-font-body:Nunito;--ht-font-display:Nunito}</style></head>
<body><span style="font-family:Nunito;font-weight:900">.</span><script src="bundle.js"></script></body></html>`,
  );

  const types = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2" };
  const server = http.createServer((request, response) => {
    const file = path.join(WORK, request.url === "/" ? "index.html" : path.basename(request.url));
    fs.readFile(file, (error, data) => {
      if (error) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream");
      response.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const browser = await (engineName === "webkit" ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error("page error:", error.message));
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.evaluate(() => document.fonts.ready);
    const results = await page.evaluate(() => window.run());
    const outDir = path.join(WORK, engineName);
    fs.mkdirSync(outDir, { recursive: true });
    for (const result of results) {
      if (result.frameMs !== undefined) {
        console.log(`${result.name}: ${result.frameMs.toFixed(2)} ms to draw each full-size frame`);
        continue;
      }
      if (result.seam !== undefined) {
        console.log(`${result.name}: last moving frame vs held end card, mean difference ${result.seam.toFixed(3)} / 255`);
        continue;
      }
      const [, base64] = result.url.split(",");
      fs.writeFileSync(path.join(outDir, `${result.name}.jpg`), Buffer.from(base64, "base64"));
    }
    console.log(`Wrote ${results.filter((result) => result.url).length} pictures to ${path.relative(ROOT, outDir)}/`);
  } finally {
    await browser.close();
    server.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
