#!/usr/bin/env node
/**
 * Cold-cache load measurement for the Partner Dashboard speed plan
 * (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 2 baseline / Phase 7 re-measure).
 *
 * Throttle: "Slow 4G" (1.6 Mbps down, 750 kbps up, 150 ms RTT) + 4x CPU, fresh browser context per run
 * (cold HTTP cache). Measures /owner/login and the signed-in /owner/dashboard.
 *
 * Usage (the target must already be running, e.g. `npx next start -p 3100`):
 *   node --env-file=.env.local scripts/measure-owner-load.cjs [--base http://localhost:3100] [--runs 3] [--owner <ownerId>]
 * The signed-in cookie is minted locally with SESSION_SECRET (lib/ownerSession.ts format); nothing is printed of it.
 */
const { createHmac } = require("node:crypto");
const { chromium } = require("playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:3100");
const RUNS = Number(arg("runs", "3"));
const OWNER = arg("owner", "64f046ff-a44f-47b4-acc1-94ff30288920");

const ownerCookie = () => {
  const secret = (process.env.SESSION_SECRET || "").trim();
  if (!secret) throw new Error("SESSION_SECRET not set (use node --env-file=.env.local)");
  const payload = Buffer.from(JSON.stringify({ ownerId: OWNER })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
};

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const measure = async (browser, path, signedIn, readySelectorText) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 });
  if (signedIn) {
    const url = new URL(BASE);
    await context.addCookies([{ name: "tp_owner_sess", value: encodeURIComponent(ownerCookie()), domain: url.hostname, path: "/" }]);
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const reqs = new Map();
  cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { url: e.request.url, bytes: 0 }));
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const en of l.getEntries()) window.__lcp = en.startTime; })
      .observe({ type: "largest-contentful-paint", buffered: true });
  });
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120000 });
  const loadMs = Date.now() - t0;
  let readyMs = null;
  if (readySelectorText) {
    await page.waitForFunction((t) => document.body.innerText.includes(t), readySelectorText, { timeout: 120000 });
    readyMs = Date.now() - t0;
  }
  await page.waitForTimeout(1500);
  const lcp = await page.evaluate(() => Math.round(window.__lcp));
  const finalUrl = page.url().replace(BASE, "");
  const list = [...reqs.values()];
  const total = list.reduce((n, r) => n + r.bytes, 0);
  const logo = list.filter((r) => /htc-logo|HTC_Logo/i.test(decodeURIComponent(r.url))).reduce((n, r) => n + r.bytes, 0);
  // Phase 5: how many authenticated owner API calls the first paint actually makes
  // (each one its own invocation + its own requireOwnerAuth). Was 3, should be 1.
  const ownerApi = list
    .map((r) => r.url.replace(BASE, ""))
    .filter((u) => u.startsWith("/api/owner/"))
    .sort();
  await context.close();
  return {
    finalUrl,
    requests: list.length,
    kb: Math.round(total / 1024),
    logoKb: Math.round(logo / 1024),
    ownerApiCalls: ownerApi.length,
    ownerApi,
    loadMs,
    readyMs,
    lcp,
  };
};

(async () => {
  const browser = await chromium.launch();
  for (const [label, path, signedIn, ready] of [
    ["/owner/login (signed out)", "/owner/login", false, null],
    ["/owner/dashboard (signed in)", "/owner/dashboard", true, "Offer Rewards"],
  ]) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, path, signedIn, ready));
    const pick = (k) => median(runs.map((r) => r[k] ?? 0));
    console.log(`\n${label}  [${BASE}, median of ${RUNS}] landed on ${runs[0].finalUrl}`);
    console.log(`  requests ${pick("requests")} | transferred ${pick("kb")} KB (logo ${pick("logoKb")} KB) | load ${pick("loadMs")} ms | LCP ${pick("lcp")} ms | games list visible ${ready ? pick("readyMs") + " ms" : "n/a"}`);
    console.log(`  owner API calls on first paint: ${pick("ownerApiCalls")} -> ${JSON.stringify(runs[0].ownerApi)}`);
    console.log("  raw:", JSON.stringify(runs));
  }
  await browser.close();
})();
