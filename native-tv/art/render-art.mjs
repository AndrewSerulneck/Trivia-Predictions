// Renders the Fire TV launcher art from the approved Option 2 designs (docs/fire-tv-app-plan.md D22; mockups v2
// section H: icon2, fire2, ban2). Run from the repo root:  node native-tv/art/render-art.mjs
// Writes the app's banner and launcher icons into native-tv/app/src/main/res, and the store-size masters into
// native-tv/art/out (Phase 6 copies those into docs/fire-tv-store/ after checking Amazon's current sizes).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const res = path.join(root, "native-tv/app/src/main/res");
const out = path.join(root, "native-tv/art/out");
mkdirSync(out, { recursive: true });

const dataUri = (file, type) => `data:${type};base64,${readFileSync(path.join(root, file)).toString("base64")}`;
const logo = dataUri("public/brand/web/htc-logo-1254.webp", "image/webp");
const font = dataUri("public/fonts/nunito-latin-v1.woff2", "font/woff2");

const ground = "linear-gradient(160deg,#0ea5e9,#2563eb 60%,#1e3a8a)";
const pill = "font-weight:900;color:#04202a;background:#22d3ee;border-radius:999px;letter-spacing:0.1em;line-height:1.25";

// Each design matches its mockup function in docs/fire-tv-app-plan_PHASE_1_MOCKUPS.src.html.
const designs = {
  // 512×512 icon · Option 2: brand blue, logo only.
  icon: { w: 512, h: 512, body: `<img src="${logo}" width="470" height="470">` },
  // 1280×720 Fire TV icon · Option 2: logo centered, "TV" pill under it.
  fire: {
    w: 1280,
    h: 720,
    column: true,
    body: `<img src="${logo}" width="500" height="500"><div style="${pill};font-size:54px;padding:2px 46px;margin-top:10px">TV</div>`,
  },
  // 320×180 launcher banner · Option 2: logo only, small "TV" pill bottom right.
  banner: {
    w: 320,
    h: 180,
    body: `<img src="${logo}" width="172" height="172"><div style="${pill};position:absolute;right:12px;bottom:10px;font-size:20px;padding:0 12px">TV</div>`,
  },
};

const page = (d) => `<!doctype html><html><head><style>
@font-face{font-family:N;font-weight:200 1000;src:url(${font}) format("woff2")}
html,body{margin:0;width:${d.w}px;height:${d.h}px;overflow:hidden;font-family:N,sans-serif}
.art{position:absolute;inset:0;display:flex;${d.column ? "flex-direction:column;" : ""}align-items:center;justify-content:center;background:${ground}}
img{display:block}
</style></head><body><div class="art">${d.body}</div></body></html>`;

const browser = await chromium.launch();
try {
  for (const [name, d] of Object.entries(designs)) {
    const tab = await browser.newPage({ viewport: { width: d.w, height: d.h } });
    await tab.setContent(page(d));
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: path.join(out, `${name}-${d.w}x${d.h}.png`), omitBackground: false });
    await tab.close();
  }
} finally {
  await browser.close();
}

const resize = (src, size, dest) => {
  mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync("sips", ["-z", String(size), String(size), src, "--out", dest], { stdio: "ignore" });
};

// Android TV / Fire TV banner: 320×180 at xhdpi.
execFileSync("cp", [path.join(out, "banner-320x180.png"), path.join(res, "drawable-xhdpi/tv_banner.png")]);
// Launcher icons (shown in Settings → Applications and on non-TV launchers).
const icon = path.join(out, "icon-512x512.png");
for (const [density, size] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]]) {
  resize(icon, size, path.join(res, `mipmap-${density}/ic_launcher.png`));
}
console.log("Rendered:", Object.keys(designs).join(", "));
