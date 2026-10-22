#!/usr/bin/env node
/**
 * Screenshot-diff harness for the light theme (docs/light-theme-plan.md, Phase 2).
 *
 * Rule it enforces: converting a screen to colour tokens must not change ONE dark pixel. Capture a
 * dark baseline before converting, capture again after, compare.
 *
 * NEVER point this at Andrew's `next dev` on :3000 — it shares the production database. Run it
 * against a production build in a scratchpad clone with no .env.local (recipe in
 * docs/light-theme-plan_PHASE_2_HANDOFF.md §6); every /api/* call is faked from
 * scripts/theme-screenshots-fixtures.cjs and every other origin is blocked.
 *
 * Usage:
 *   node scripts/theme-screenshots.cjs capture --url http://localhost:3101 --out <dir> [--theme dark|light]
 *        [--only venue-games,pickem] [--group in-scope|chrome|all] [--verbose]
 *   node scripts/theme-screenshots.cjs compare <baselineDir> <candidateDir> [--diff-out <dir>] [--noise 1]
 *
 * `capture` writes `<shot>@<width>.png` (390 and 350 px wide, full page, device scale 1) into --out.
 * `--theme light` stores the light preference before the page loads; it only has an effect on a
 * build made with NEXT_PUBLIC_LIGHT_THEME_ENABLED=true. `compare` exits 1 when any pair differs by
 * a single pixel (or is missing / a different size) and, with --diff-out, writes a red-on-grey map
 * of the changed pixels. Each DIFF line prints the largest per-channel change: Chromium's gradient
 * dithering occasionally moves one pixel by 1 between two captures of the SAME build (measured
 * 2026-10-22: 1 px of 30 shots, inside a Pick 'Em ticket gradient). `--noise 1` ignores pixels whose
 * every channel moved by at most 1; a real colour change moves far more. Default is 0 (strict).
 */
const { mkdirSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const fixtures = require("./theme-screenshots-fixtures.cjs");

const WIDTHS = [390, 350];
const HEIGHT = 844;
const SETTLE_MS = 2500;

const clickButton = (name) => async (page) => {
  await page.getByRole("button", { name }).first().click();
  await page.waitForTimeout(1200);
};

// Scroll every scroller (the page keeps its own inner scroll container) to the bottom.
const scrollTo = (fraction) => async (page) => {
  await page.evaluate((f) => {
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
    }
    window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * f);
  }, fraction);
  await page.waitForTimeout(500);
};
const scrollToBottom = scrollTo(1);

// Fantasy: open the draft, then draft the two highest-projected players (filled slots, "✓ Drafted",
// the floating submit bar).
const draftTwo = async (page) => {
  await clickButton(/draft your roster/i)(page);
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole("button", { name: /^Draft$/ }).first().click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(800);
};

/**
 * `inScope` shots are the four light-capable screens (captured dark and light). `chrome` shots are
 * the other screens that share the app bar, Back button, points pill, drawer and form CSS that
 * Phase 3 converts — they must stay dark, so they are compared in dark only.
 */
const SHOTS = [
  { name: "venue-games", path: `/venue/${fixtures.VENUE_ID}`, group: "in-scope" },
  // The hub's tabs are a horizontal swipe track: a full-page capture resizes the viewport, which
  // re-centres the track mid-swipe, so tab shots are viewport-sized.
  { name: "venue-leaderboard", path: `/venue/${fixtures.VENUE_ID}`, group: "in-scope", action: clickButton(/^Leaderboard$/), viewportOnly: true },
  { name: "venue-prizes", path: `/venue/${fixtures.VENUE_ID}`, group: "in-scope", action: clickButton(/^Prizes/), viewportOnly: true },
  { name: "venue-menu", path: `/venue/${fixtures.VENUE_ID}`, group: "in-scope", action: clickButton("Open navigation menu"), viewportOnly: true },
  // Open states (Phase 4). Not in the pre-Phase-4 dark baseline: dark/light are judged by eye, and
  // dark equivalence of the converted classes by the old-vs-new computed-style pair check.
  {
    name: "venue-leaderboard-menu",
    path: `/venue/${fixtures.VENUE_ID}`,
    group: "in-scope",
    action: async (page) => {
      await clickButton(/^Leaderboard$/)(page);
      await page.getByRole("button", { name: "Leaderboard timeframe" }).click();
      await page.waitForTimeout(600);
    },
    viewportOnly: true,
  },
  {
    name: "venue-prize-detail",
    path: `/venue/${fixtures.VENUE_ID}`,
    group: "in-scope",
    action: async (page) => {
      await clickButton(/^Prizes/)(page);
      await page.getByRole("button", { name: /Appetizer/ }).first().click();
      await page.waitForTimeout(800);
    },
    viewportOnly: true,
  },
  {
    name: "venue-alerts",
    path: `/venue/${fixtures.VENUE_ID}`,
    group: "in-scope",
    action: clickButton(/unread alerts|Open alerts/),
    viewportOnly: true,
  },
  { name: "pickem", path: "/pickem", group: "in-scope" },
  { name: "nfl-pickem", path: "/nfl-pickem", group: "in-scope" },
  // Phase 5 states (scenario = which fixture variant answers; see the fixtures file). Captured dark
  // from the pre-conversion build as their own baseline.
  { name: "pickem-settled", path: "/pickem?sport=nhl", group: "in-scope", scenario: "pickem-settled" },
  { name: "pickem-settled-bottom", path: "/pickem?sport=nhl", group: "in-scope", scenario: "pickem-settled", action: scrollToBottom, viewportOnly: true },
  { name: "pickem-limit", path: "/pickem", group: "in-scope", scenario: "pickem-limit" },
  { name: "pickem-history", path: `/pickem?date=${fixtures.HISTORY_DATE}`, group: "in-scope", scenario: "pickem-history" },
  { name: "nfl-pickem-full", path: "/nfl-pickem", group: "in-scope", scenario: "nfl-full" },
  { name: "nfl-pickem-full-mid", path: "/nfl-pickem", group: "in-scope", scenario: "nfl-full", action: scrollTo(0.4), viewportOnly: true },
  { name: "nfl-pickem-full-bottom", path: "/nfl-pickem", group: "in-scope", scenario: "nfl-full", action: scrollToBottom, viewportOnly: true },
  {
    name: "nfl-pickem-expanded",
    path: "/nfl-pickem",
    group: "in-scope",
    scenario: "nfl-full",
    action: async (page) => {
      await scrollToBottom(page);
      await page.getByRole("button", { name: /shotplayer/ }).first().click();
      await page.waitForTimeout(600);
      await scrollToBottom(page);
    },
    viewportOnly: true,
  },
  { name: "fantasy", path: "/fantasy", group: "in-scope" },
  { name: "fantasy-draft", path: "/fantasy", group: "in-scope", action: clickButton(/draft your roster/i) },
  // Phase 6 states (scenarios in the fixtures file).
  { name: "fantasy-draft-picked", path: "/fantasy", group: "in-scope", action: draftTwo },
  { name: "fantasy-mlb", path: "/fantasy?sport=baseball", group: "in-scope", scenario: "fantasy-mlb", action: draftTwo },
  { name: "fantasy-live", path: "/fantasy", group: "in-scope", scenario: "fantasy-live" },
  { name: "fantasy-live-leaderboard", path: "/fantasy", group: "in-scope", scenario: "fantasy-live", action: clickButton(/^Leaderboard/) },
  { name: "fantasy-final", path: "/fantasy", group: "in-scope", scenario: "fantasy-final" },
  { name: "fantasy-banners", path: "/fantasy", group: "in-scope", scenario: "fantasy-banners" },
  // Fantasy scrolls inside its own container: these show the rest of the same states.
  { name: "fantasy-draft-picked-top", path: "/fantasy", group: "in-scope", action: async (page) => { await draftTwo(page); await scrollTo(0)(page); }, viewportOnly: true },
  { name: "fantasy-mlb-top", path: "/fantasy?sport=baseball", group: "in-scope", scenario: "fantasy-mlb", action: async (page) => { await draftTwo(page); await scrollTo(0)(page); }, viewportOnly: true },
  { name: "fantasy-live-mid", path: "/fantasy", group: "in-scope", scenario: "fantasy-live", action: scrollTo(0.5), viewportOnly: true },
  { name: "fantasy-live-bottom", path: "/fantasy", group: "in-scope", scenario: "fantasy-live", action: scrollToBottom, viewportOnly: true },
  { name: "fantasy-final-bottom", path: "/fantasy", group: "in-scope", scenario: "fantasy-final", action: scrollToBottom, viewportOnly: true },
  { name: "trivia", path: "/trivia", group: "chrome" },
  { name: "trivia-live", path: "/trivia/live", group: "chrome" },
  { name: "bingo", path: "/bingo", group: "chrome" },
  { name: "category-blitz", path: "/category-blitz/play", group: "chrome" },
  { name: "predictions", path: "/predictions", group: "chrome" },
  { name: "redeem-prizes", path: "/redeem-prizes", group: "chrome" },
  { name: "activity", path: "/activity", group: "chrome" },
];

const parseArgs = (argv) => {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
};

const capture = async (flags) => {
  const { chromium } = require("playwright");
  const base = String(flags.url || "");
  const out = String(flags.out || "");
  const theme = flags.theme === "light" ? "light" : "dark";
  if (!base || !out) throw new Error("capture needs --url and --out");
  if (/:3000\b/.test(base)) throw new Error("Refusing :3000 — that is Andrew's dev server on the production database.");
  const group = String(flags.group || (theme === "light" ? "in-scope" : "all"));
  const only = flags.only ? String(flags.only).split(",") : null;
  const shots = SHOTS.filter((shot) => (only ? only.includes(shot.name) : group === "all" || shot.group === group));
  mkdirSync(out, { recursive: true });

  const origin = new URL(base).origin;
  const browser = await chromium.launch();
  const unmocked = new Set();
  try {
    for (const width of WIDTHS) {
      for (const shot of shots) {
        const context = await browser.newContext({
          viewport: { width, height: HEIGHT },
          deviceScaleFactor: 1,
          timezoneId: "America/New_York",
          locale: "en-US",
          geolocation: { latitude: fixtures.VENUE.latitude, longitude: fixtures.VENUE.longitude, accuracy: 10 },
          permissions: ["geolocation"],
        });
        await context.clock.setFixedTime(fixtures.FIXED_NOW_MS);
        await context.addCookies([
          { name: "tp_user_id", value: fixtures.USER_ID, url: origin },
          { name: "tp_venue_id", value: fixtures.VENUE_ID, url: origin },
        ]);
        await context.addInitScript(
          ({ userId, venueId, username, nowMs, lightTheme }) => {
            try {
              localStorage.setItem("tp_user_id", userId);
              localStorage.setItem("tp_venue_id", venueId);
              localStorage.setItem("tp_username", username);
              // Skip every game's tutorial cards (lib/gameOnboarding.ts) so the game itself is drawn.
              for (const key of ["speed-trivia", "live_trivia", "pickem", "bingo", "fantasy", "category-blitz", "nfl-pickem", "squares", "bracket"]) {
                localStorage.setItem(`tp_tutorial_seen_${key}`, String(nowMs));
              }
              if (lightTheme) localStorage.setItem("htc_theme", "light");
            } catch {
              // storage blocked: the page still renders, just with tutorial cards
            }
          },
          { userId: fixtures.USER_ID, venueId: fixtures.VENUE_ID, username: fixtures.USERNAME, nowMs: fixtures.FIXED_NOW_MS, lightTheme: theme === "light" }
        );
        await context.route("**/*", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          if (!url.pathname.startsWith("/api/")) return route.continue();
          const body = fixtures.fixtureFor(request.method(), url.pathname, url.searchParams, shot.scenario);
          if (body === null) {
            unmocked.add(`${request.method()} ${url.pathname}`);
            return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false }) });
          }
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => console.warn(`  [${shot.name}] page error: ${error.message.slice(0, 160)}`));
        await page.goto(`${base}${shot.path}`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(SETTLE_MS);
        if (shot.action) await shot.action(page);
        const file = join(out, `${shot.name}@${width}.png`);
        await page.screenshot({ path: file, fullPage: !shot.viewportOnly, animations: "disabled", caret: "hide" });
        console.log(`  ${theme} ${shot.name}@${width} → ${file}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (flags.verbose && unmocked.size > 0) {
    console.log(`Unmocked API calls (answered 404):\n  ${[...unmocked].sort().join("\n  ")}`);
  }
};

const compare = async (baselineDir, candidateDir, flags) => {
  const sharp = require("sharp");
  if (!baselineDir || !candidateDir) throw new Error("compare needs <baselineDir> <candidateDir>");
  const diffOut = flags["diff-out"] ? String(flags["diff-out"]) : null;
  const noise = Math.max(0, Number(flags.noise) || 0);
  if (diffOut) mkdirSync(diffOut, { recursive: true });
  const names = readdirSync(baselineDir).filter((name) => name.endsWith(".png")).sort();
  let failures = 0;
  for (const name of names) {
    const candidatePath = join(candidateDir, name);
    if (!existsSync(candidatePath)) {
      console.log(`MISSING  ${name}`);
      failures += 1;
      continue;
    }
    const [a, b] = await Promise.all(
      [join(baselineDir, name), candidatePath].map((file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }))
    );
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
      console.log(`SIZE     ${name}  ${a.info.width}x${a.info.height} → ${b.info.width}x${b.info.height}`);
      failures += 1;
      continue;
    }
    const { width, height } = a.info;
    const map = diffOut ? Buffer.alloc(width * height * 4) : null;
    let changed = 0;
    let maxDelta = 0;
    for (let px = 0; px < width * height; px += 1) {
      const o = px * 4;
      let delta = 0;
      for (let channel = 0; channel < 4; channel += 1) delta = Math.max(delta, Math.abs(a.data[o + channel] - b.data[o + channel]));
      const same = delta <= noise;
      if (!same) {
        changed += 1;
        maxDelta = Math.max(maxDelta, delta);
      }
      if (map) {
        const grey = Math.round((a.data[o] + a.data[o + 1] + a.data[o + 2]) / 9);
        map[o] = same ? grey : 255;
        map[o + 1] = same ? grey : 0;
        map[o + 2] = same ? grey : 0;
        map[o + 3] = 255;
      }
    }
    if (changed === 0) {
      console.log(`SAME     ${name}`);
      continue;
    }
    failures += 1;
    console.log(`DIFF     ${name}  ${changed} px (${((changed / (width * height)) * 100).toFixed(3)}%), largest channel change ${maxDelta}`);
    if (map) await sharp(map, { raw: { width, height, channels: 4 } }).png().toFile(join(diffOut, name));
  }
  console.log(failures === 0 ? `All ${names.length} screenshots identical.` : `${failures} of ${names.length} differ.`);
  if (failures > 0) process.exitCode = 1;
};

const main = async () => {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  if (command === "capture") return capture(flags);
  if (command === "compare") return compare(positional[0], positional[1], flags);
  console.log("Usage: node scripts/theme-screenshots.cjs capture --url <base> --out <dir> [--theme dark|light] | compare <baseline> <candidate> [--diff-out <dir>]");
  process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
