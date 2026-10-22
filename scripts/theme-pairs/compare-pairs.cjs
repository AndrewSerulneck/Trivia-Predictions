// node scripts/theme-pairs/compare-pairs.cjs <outDir> : loads <outDir>/pairs.html (dark) and compares each
// old/new element's computed style. Exits 1 on any difference. See make-pairs.cjs.
const path = require("path");
const here = path.resolve(process.argv[2] || require("os").tmpdir() + "/theme-pairs");
const repo = path.resolve(__dirname, "../..");
const { chromium } = require(path.join(repo, "node_modules/playwright"));
const pairs = require(path.join(here, "pairs.json"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(here, "pairs.html"));
  const props = ["color", "backgroundColor", "backgroundImage", "borderTopColor", "borderTopWidth", "borderTopStyle", "boxShadow", "textShadow", "filter", "stroke"];
  const results = await page.evaluate((props) => {
    const out = [];
    document.querySelectorAll("[data-pair]").forEach((row) => {
      const [a, b] = row.querySelectorAll("span");
      const ca = getComputedStyle(a), cb = getComputedStyle(b);
      const diffs = [];
      for (const prop of props) if (ca[prop] !== cb[prop]) diffs.push([prop, ca[prop], cb[prop]]);
      out.push({ i: Number(row.getAttribute("data-pair")), diffs });
    });
    return out;
  }, props);
  const transparentShadow = (s) => s === "none" || /^(rgba\(0, 0, 0, 0\) [^,]+(, )?)+$/.test(s);
  let bad = 0;
  let expectedOnly = 0;
  for (const r of results) {
    const real = r.diffs.filter(([prop, x, y]) => !(prop === "boxShadow" && transparentShadow(x) && transparentShadow(y)));
    if (real.length && pairs[r.i].expected) {
      expectedOnly++;
      console.log("EXPECTED pair", r.i, pairs[r.i].expected);
    } else if (real.length) {
      bad++;
      console.log("DIFF pair", r.i, JSON.stringify({ old: pairs[r.i].old, neu: pairs[r.i].neu, oldStyle: pairs[r.i].oldStyle, newStyle: pairs[r.i].newStyle }));
      for (const d of real) console.log("   ", d.join("  |  "));
    }
  }
  console.log(`${results.length - bad - expectedOnly} of ${results.length} pairs identical, ${expectedOnly} expected difference(s), ${bad} unexpected`);
  if (bad) process.exitCode = 1;
  await browser.close();
})();
