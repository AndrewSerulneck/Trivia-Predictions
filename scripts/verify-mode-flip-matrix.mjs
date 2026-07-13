// Phase 5 cross-browser verification matrix for the Category Blitz mode-flip
// work — see docs/category-blitz-mode-flip-animation-fix-plan.md. This is the
// standing gate: it exercises the two dimensions Phases 0-4 did NOT cover.
//
//   ENGINE=webkit   → the iOS Safari `-webkit-` path (WebKit engine, the closest
//                     proxy to real iOS Safari available headless): verifies the
//                     prefixed `-webkit-transform-style`, `-webkit-backface-
//                     visibility`, `-webkit-perspective` and `-webkit-mask-image`
//                     declarations actually take. Default: chromium.
//   REDUCE=1        → emulates `prefers-reduced-motion: reduce`: verifies the
//                     static fallback still READS correctly (takeover shows the
//                     reverse "Blend In!" face with no 3D turn; ModeSign snaps to
//                     the current face with no wobble) rather than a blank/broken
//                     frame.
//
// Covers all three takeover variants + the persistent ModeSign, in mobile and
// desktop viewports. The app is dark-only, so "dark theme" is the default render.
//
// Prereqs: dev server on :3000, PLAYWRIGHT_DIR set, seeded sim user/venue (same
// as verify-mode-flip.mjs). Output → tmp/mode-flip-matrix/<engine>-<motion>/.
const pwEntry = process.env.PLAYWRIGHT_DIR
  ? `${process.env.PLAYWRIGHT_DIR.replace(/\/$/, "")}/index.js`
  : "playwright";
const pwMod = await import(pwEntry);
const pw = pwMod.default ?? pwMod;
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USER_ID = process.env.TP_USER_ID || "3255f743-dccc-46cb-a7c7-9039c53cdae9";
const VENUE_ID = process.env.TP_VENUE_ID || "sim-category-blitz";
const BASE = process.env.BASE_URL || "http://localhost:3000";

const ENGINE = process.env.ENGINE === "webkit" ? "webkit" : "chromium";
const REDUCE = process.env.REDUCE === "1";
const launcher = ENGINE === "webkit" ? pw.webkit : pw.chromium;
const OUT = process.env.OUT_DIR
  || path.join(REPO, "tmp", "mode-flip-matrix", `${ENGINE}-${REDUCE ? "reduced" : "motion"}`);
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

const TAKEOVER_VARIANTS = [
  { label: "Mode flip — card turn", name: "card" },
  { label: "Mode flip — split-flap", name: "splitFlap" },
  { label: "Mode flip — overspin", name: "overspin" },
];
// Reduced motion collapses the takeover to a ~300ms static hold + fade, so a
// single early frame suffices; full motion needs the mid-flip + landing burst.
const TAKEOVER_OFFSETS = REDUCE ? [150] : [360, 700, 1200, 1600];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPanel(page) {
  const testBtn = page.getByRole("button", { name: /Test mode:/ });
  if ((await testBtn.textContent())?.includes("off")) { await testBtn.click(); await sleep(400); }
  const animToggle = page.getByRole("button", { name: /^Animations/ });
  if ((await animToggle.textContent())?.includes("▸")) { await animToggle.click(); await sleep(300); }
}

async function reopenPanel(page) {
  const reopen = page.getByRole("button", { name: /^Animations/ });
  if ((await reopen.textContent().catch(() => ""))?.includes("▸")) { await reopen.click(); await sleep(250); }
}

async function run() {
  const cookies = loadCookies();
  const browser = await launcher.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      reducedMotion: REDUCE ? "reduce" : "no-preference",
    });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    let redirected = false;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame() && new URL(f.url()).pathname === "/") redirected = true;
    });
    await page.goto(`${BASE}/category-blitz/play`, { waitUntil: "networkidle" });
    await sleep(1500);
    if (redirected) throw new Error("Redirected to / — auth cookies rejected by proxy.ts");

    await openPanel(page);
    // Takeover variants
    for (const v of TAKEOVER_VARIANTS) {
      await page.getByRole("button", { name: v.label, exact: true }).click();
      const t0 = Date.now();
      for (const off of TAKEOVER_OFFSETS) {
        const wait = off - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${v.name}-${String(off).padStart(4, "0")}ms.png`) });
      }
      await sleep(1400);
      await reopenPanel(page);
    }

    await ctx.close();
    console.log(`[${ENGINE}/${REDUCE ? "reduced" : "motion"}/${vp.name}] captured`);
  }
  await browser.close();
  console.log("Done. Shots in", OUT);
}

run().catch((e) => { console.error(e); process.exit(1); });
