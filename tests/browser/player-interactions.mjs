/** Isolated real-browser rendering of production controls/CSS. No auth, API writes or Next server.
 * Run: node tests/browser/player-interactions.mjs
 * The scroll test exercises browser history + production Back/PageShell/recovery guards;
 * authenticated Next SPA transitions and installed PWAs remain device QA.
 */
import { existsSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const temp = await mkdtemp(join(tmpdir(), "player-interactions-"));
let browser;
try {
  execFileSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js", "-i", "app/globals.css", "-o", join(temp, "styles.css"), "--content", "./components/**/*.{ts,tsx},./tests/browser/*.tsx"], { stdio: "pipe" });
  const bundle = await build({ entryPoints: ["tests/browser/player-interactions.fixture.tsx"], bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "fixture-boundaries", setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    b.onResolve({ filter: /(?:^@\/lib\/storage$|^@\/components\/ui\/LeftHamburgerMenu$)/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "navigation" ? 'export const usePathname=()=>location.pathname; export const useRouter=()=>({push:(p)=>location.assign(p),prefetch:()=>{},replace:(p)=>location.replace(p)});' : path.includes("storage") ? 'export const getUserId=()=>"test-user"; export const getVenueId=()=>"test-venue";' : 'export const LeftHamburgerMenu=()=>null;', loader: "js" }));
  } }] });
  const css = await readFile(join(temp, "styles.css"), "utf8");
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYER_TEST_BROWSER_CHANNEL ? { channel: process.env.PLAYER_TEST_BROWSER_CHANNEL } : existsSync("/Applications/Google Chrome.app") ? { channel: "chrome" } : {}) });
  const page = await browser.newPage();
  await page.addInitScript(() => { window.__vibrations = []; navigator.vibrate = pattern => { window.__vibrations.push(pattern); return true; }; });
  const errors = [];
  page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  await page.route("https://player.test/**", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.route("**/api/notifications**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, items: [{ id: "n", message: "Trivia completed. +10 points.", createdAt: new Date().toISOString(), read: false, type: "success" }], unreadCount: 1 }) }));
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://player.test/controls");
    await page.getByRole("button", { name: /unread alerts/ }).waitFor({ timeout: 5000 });
    const boxes = await page.locator("button").evaluateAll(buttons => buttons.map(button => {
      const r = button.getBoundingClientRect(); return { label: button.getAttribute("aria-label") || button.textContent, x: r.x, right: r.right, width: r.width, height: r.height };
    }));
    for (const box of boxes) {
      assert(box.width >= 44 && box.height >= 44, `${width}px: small target ${JSON.stringify(box)}`);
      assert(box.x >= -1 && box.right <= width + 1, `${width}px: overflowing target ${JSON.stringify(box)}`);
    }
    const backCircle = await page.getByRole("button", { name: "Back", exact: true }).first().locator("span").boundingBox();
    assert.equal(backCircle.width, 34); assert.equal(backCircle.height, 34);
    await page.getByRole("button", { name: "Back", exact: true }).first().click();
    assert.deepEqual(await page.evaluate(() => window.__vibrations), [14]);
    await page.getByRole("button", { name: /unread alerts/ }).click();
    for (const button of await page.locator("[class*=fixed] button").all()) {
      const box = await button.boundingBox(); if (box) assert(box.width >= 44 && box.height >= 44);
    }
    console.log(`${width}px: ${boxes.length} controls fit, Back circle stays 34px, notification targets pass`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("https://player.test/controls");
  await page.locator(".tp-button-spinner").waitFor();
  assert.equal(await page.locator(".tp-button-spinner").evaluate(el => getComputedStyle(el).animationName), "none");
  const next = page.getByRole("button", { name: "Continue" });
  const rect = await next.boundingBox(); await page.mouse.move(rect.x + 10, rect.y + 10); await page.mouse.down();
  assert.equal(await next.evaluate(el => getComputedStyle(el).transform), "none"); await page.mouse.up();
  assert.notEqual(await page.getByText("Selectable body text").evaluate(el => getComputedStyle(el).userSelect), "none");
  await page.goto("https://player.test/scrolled");
  await page.getByRole("link", { name: "Open child" }).scrollIntoViewIfNeeded();
  const previousY = await page.evaluate(() => window.scrollY);
  await page.getByRole("link", { name: "Open child" }).click();
  await page.waitForURL("**/child");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.waitForURL("**/scrolled");
  await page.waitForFunction(y => Math.abs(window.scrollY - y) < 2, previousY);
  // Wait through both initial recovery passes to catch delayed scroll resets.
  await page.waitForTimeout(1000);
  assert(Math.abs(await page.evaluate(() => window.scrollY) - previousY) < 2);
  assert.deepEqual(errors, []);
  console.log("Reduced-motion press/spinner, selectable text, and PageShell Back scroll restoration pass");
} finally {
  await browser?.close();
  await rm(temp, { recursive: true, force: true });
}
