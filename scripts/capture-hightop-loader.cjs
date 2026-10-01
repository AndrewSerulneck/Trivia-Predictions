#!/usr/bin/env node
/**
 * Records the HightopLoader motion preview for Andrew's approval
 * (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 3 — "review with
 * Andrew before Phase 4").
 *
 * It renders the REAL component (react-dom/server) and compiles the REAL
 * tailwind.config.ts, so nothing here can drift from what ships. Output:
 *   docs/assets/hightop-loader.html           — the preview page (self-contained CSS)
 *   docs/assets/hightop-loader-normal.webm    — 375x812, default motion
 *   docs/assets/hightop-loader-reduced.webm   — 375x812, prefers-reduced-motion: reduce
 *   docs/assets/hightop-loader-still.png      — one frame, for a quick glance
 *
 * Usage:
 *   npm run loader:preview                  # record everything
 *   npm run loader:preview -- --serve       # just serve it at http://localhost:3117
 */
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createServer } = require("node:http");
const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } = require("node:fs");
const { join, extname } = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs/assets");
const TMP_DIR = join(ROOT, ".next/cache/loader-preview");
const PORT = 3117;
const SERVE_ONLY = process.argv.includes("--serve");
const MIME = { ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const main = async () => {
  const { HightopLoader } = await import("../components/ui/HightopLoader.tsx");

  const cell = (title, element) =>
    `<figure class="flex flex-col items-center gap-3 rounded-2xl bg-slate-900/60 px-4 py-5">
       ${renderToStaticMarkup(element)}
       <figcaption class="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">${title}</figcaption>
     </figure>`;

  const body = `
    <main class="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#030712] px-5 py-8">
      ${cell("lg · label", createElement(HightopLoader, { delayMs: 0, size: "lg", showLabel: true, label: "Hightop Challenge: Game On." }))}
      <div class="grid w-full grid-cols-2 gap-4">
        ${cell("sm", createElement(HightopLoader, { delayMs: 0, size: "sm", showLabel: true, label: "Loading games..." }))}
        ${cell("md", createElement(HightopLoader, { delayMs: 0, size: "md" }))}
      </div>
      ${cell("md · card", createElement(HightopLoader, { delayMs: 0, size: "md", variant: "card", showLabel: true, label: "Loading prizes..." }))}
      <p class="text-center text-[11px] leading-relaxed text-slate-500">
        The fullScreen variant is the same block centred on a #030712 page.
      </p>
    </main>`;

  // Compile the repo's own Tailwind against this markup, with globals.css's :root tokens.
  mkdirSync(TMP_DIR, { recursive: true });
  const htmlForScan = join(TMP_DIR, "scan.html");
  writeFileSync(htmlForScan, body);
  const rootVars = readFileSync(join(ROOT, "app/globals.css"), "utf8").match(/:root\s*\{[\s\S]*?\n\}/);
  const inputCss = join(TMP_DIR, "input.css");
  writeFileSync(inputCss, `@tailwind base;\n@tailwind utilities;\n${rootVars ? rootVars[0] : ""}\n`);
  const outCss = join(TMP_DIR, "out.css");
  execFileSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-i", inputCss, "-o", outCss, "--content", htmlForScan, "--minify"], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HightopLoader preview</title>
<style>${readFileSync(outCss, "utf8")}</style>
</head><body class="bg-[#030712]">${body}</body></html>`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "hightop-loader.html"), html);

  // `/brand/*` must come over HTTP: the component's src is an absolute path.
  const server = createServer((req, res) => {
    if (req.url && req.url.startsWith("/brand/")) {
      const file = join(ROOT, "public", req.url.split("?")[0]);
      if (existsSync(file)) {
        res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
        res.end(readFileSync(file));
        return;
      }
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Preview: http://localhost:${PORT}`);

  if (SERVE_ONLY) return; // leave the server up for a human

  const browser = await chromium.launch();
  for (const reduced of [false, true]) {
    const name = reduced ? "reduced" : "normal";
    const videoDir = join(TMP_DIR, name);
    rmSync(videoDir, { recursive: true, force: true });
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      reducedMotion: reduced ? "reduce" : "no-preference",
      recordVideo: { dir: videoDir, size: { width: 375, height: 812 } },
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}`, { waitUntil: "load" });
    await page.waitForTimeout(1_600); // past the entrance, mid-hop
    if (!reduced) await page.screenshot({ path: join(OUT_DIR, "hightop-loader-still.png") });
    await page.waitForTimeout(5_400); // entrance (0.95s) + two full 2.6s loops
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(join(OUT_DIR, `hightop-loader-${name}.webm`));
    console.log(`Recorded docs/assets/hightop-loader-${name}.webm`);
  }
  await browser.close();
  server.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
