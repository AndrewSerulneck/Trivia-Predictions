// Phase 0 verification harness for the Category Blitz "Blend In!" mode-flip
// takeover — see docs/category-blitz-mode-flip-animation-fix-plan.md.
//
// Drives the live DevAnimationPanel (Test mode: on) on /category-blitz/play,
// plays each of the three flip variants (card / split-flap / overspin), and
// screenshots a timed burst of frames per variant so a reviewer can see a
// mid-flip frame AND a landing frame, in both a mobile and a desktop viewport.
// This is the browser-verification gate that later phases must keep passing:
// a correct flip shows the card turning through 3D space and LANDING on the
// reverse "Blend In!" pink face — not the standard face mirror-reversed.
//
// Prereqs:
//   1. Dev server running on :3000  (npm run dev)
//   2. playwright installed somewhere resolvable. It is intentionally NOT a
//      repo dependency; install it into a scratch dir and point node at it:
//        cd <scratch> && npm i playwright@<matching-version>
//        NODE_PATH=<scratch>/node_modules node --env-file=.env.local scripts/verify-mode-flip.mjs
//   3. A seeded sim user + the reusable `sim-category-blitz` venue (see the
//      `verify` skill / scripts/simulate-category-blitz.cjs).
//
// Cookies are (re)generated at runtime via scripts/print-test-auth-cookies.cjs
// so this keeps working across SESSION_SECRET / user changes. Override the
// identity with env vars TP_USER_ID / TP_VENUE_ID.
// playwright isn't a repo dep (ESM ignores NODE_PATH), so resolve it from an
// explicit path: set PLAYWRIGHT_DIR to the scratch install's package dir, e.g.
//   PLAYWRIGHT_DIR=<scratch>/node_modules/playwright
const pwEntry = process.env.PLAYWRIGHT_DIR
  ? `${process.env.PLAYWRIGHT_DIR.replace(/\/$/, "")}/index.js`
  : "playwright";
const pwMod = await import(pwEntry);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.OUT_DIR || path.join(REPO, "tmp", "mode-flip-shots");
const USER_ID = process.env.TP_USER_ID || "3255f743-dccc-46cb-a7c7-9039c53cdae9";
const VENUE_ID = process.env.TP_VENUE_ID || "sim-category-blitz";
const BASE = process.env.BASE_URL || "http://localhost:3000";

fs.mkdirSync(OUT, { recursive: true });

function loadCookies() {
  const raw = execFileSync(
    "node",
    ["--env-file=.env.local", "scripts/print-test-auth-cookies.cjs", USER_ID, VENUE_ID, "--format", "raw"],
    { cwd: REPO, encoding: "utf8" }
  );
  const cookies = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^(tp_user_id|tp_venue_id|tp_sess)=(.+)$/);
    if (m) cookies.push({ name: m[1], value: m[2], url: BASE });
  }
  if (!cookies.some((c) => c.name === "tp_user_id") || !cookies.some((c) => c.name === "tp_venue_id")) {
    throw new Error("Failed to generate auth cookies from print-test-auth-cookies.cjs");
  }
  return cookies;
}

const VARIANTS = [
  { label: "Mode flip — card turn", name: "card" },
  { label: "Mode flip — split-flap", name: "splitFlap" },
  { label: "Mode flip — overspin", name: "overspin" },
];
// Brackets the spring settle (~0.9-1.3s) then 550ms hold + 650ms dissolve.
const OFFSETS = [180, 360, 600, 1000, 1500];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const cookies = loadCookies();
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    let redirected = false;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame() && new URL(f.url()).pathname === "/") redirected = true;
    });

    await page.goto(`${BASE}/category-blitz/play`, { waitUntil: "networkidle" });
    await sleep(1500);
    if (redirected) throw new Error("Redirected to / — auth cookies rejected by proxy.ts");

    const testBtn = page.getByRole("button", { name: /Test mode:/ });
    if ((await testBtn.textContent())?.includes("off")) {
      await testBtn.click();
      await sleep(400);
    }
    const animToggle = page.getByRole("button", { name: /^Animations/ });
    if ((await animToggle.textContent())?.includes("▸")) {
      await animToggle.click();
      await sleep(300);
    }

    for (const variant of VARIANTS) {
      await page.getByRole("button", { name: variant.label, exact: true }).click();
      const t0 = Date.now();
      for (const off of OFFSETS) {
        const wait = off - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${variant.name}-${String(off).padStart(4, "0")}ms.png`) });
      }
      await sleep(1200);
      const reopen = page.getByRole("button", { name: /^Animations/ });
      if ((await reopen.textContent().catch(() => ""))?.includes("▸")) {
        await reopen.click();
        await sleep(250);
      }
    }
    await ctx.close();
    console.log(`[${vp.name}] captured ${VARIANTS.length * OFFSETS.length} frames`);
  }
  await browser.close();
  console.log("Done. Shots in", OUT);
}

run().catch((e) => { console.error(e); process.exit(1); });
