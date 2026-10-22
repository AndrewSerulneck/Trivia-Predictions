// Renders the light-theme mockup boards (docs/light-theme-mockups/*.dc.html) as 1080x1920 (9:16)
// social-video backgrounds. Two styles per screen:
//   framed/     the light screen in a phone on a dark brand backdrop (room above/below for captions)
//   fullscreen/ the screen itself, edge to edge, like a screen recording
// Usage: node scripts/render-social-mockups.cjs [outDir]   (default docs/light-theme-mockups/social-9x16)
const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const repo = join(__dirname, "..");
const outDir = process.argv[2] ?? join(repo, "docs/light-theme-mockups/social-9x16");
const { chromium } = require(join(repo, "node_modules/playwright"));
const MOCKS = join(repo, "docs/light-theme-mockups");

const BLOBS = {
  "9a861c8db69ee21f06828f31484f3a40": "live-trivia-icon.png",
  "411b132f48ab199a9de081ae1948cb41": "speed-trivia-icon.png",
  "b8ae8c44e43b2df4f965d6cf70604826": "prop-bet-bingo-icon.png",
  "a9d9b4953ab9978811c157c94995265a": "pickem-icon.png",
  "b3dd928e56adfe750d01a774fc14e829": "fantasy-icon.png",
  "1a8f773433039e08eba8279134d99fb5": "category-blitz-icon.png",
  "57cb1a58cbeaa1aa948f65b2770c3ae0": "nfl-pickem-icon.png",
};
const blobData = {};
for (const [id, file] of Object.entries(BLOBS)) {
  blobData[id] = `data:image/png;base64,${readFileSync(join(repo, "public/brand", file)).toString("base64")}`;
}

// name, mockup, glow colours for the backdrop (the screen's own accents)
const SCREENS = [
  { name: "01-venue-home-games", file: "Main", glow: ["#0e7490", "#7c3aed"] },
  { name: "02-venue-home-leaderboard", file: "VenueLeaderboard", glow: ["#0e7490", "#d97706"] },
  { name: "03-venue-home-prizes", file: "VenuePrizes", glow: ["#d97706", "#0e7490"] },
  { name: "04-pickem", file: "PickEm", glow: ["#1a2f72", "#6b1a4e"] },
  { name: "05-nfl-pickem", file: "NFLPickEm", glow: ["#1a2f72", "#059669"] },
  { name: "06-fantasy-my-sweat", file: "FantasySweat", glow: ["#0f5c4a", "#a16207"] },
  { name: "07-fantasy-draft", file: "FantasyDraft", glow: ["#0f5c4a", "#7c3aed"] },
];

const lookup = (scope, expr) => {
  if (expr === "true") return true;
  if (expr === "false") return false;
  return expr.split(".").reduce((value, key) => (value == null ? undefined : value[key]), scope);
};

// Expands <sc-for>/<sc-if> (outermost first, matching nested tags of the same name), then {{path}}.
const expand = (html, scope) => {
  let out = "";
  let rest = html;
  for (;;) {
    const open = rest.match(/<sc-(for|if)\b([^>]*)>/);
    if (!open) break;
    const tag = `sc-${open[1]}`;
    const start = open.index;
    let depth = 0;
    let i = start;
    let end = -1;
    const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
    re.lastIndex = start;
    for (let m = re.exec(rest); m; m = re.exec(rest)) {
      depth += m[0].startsWith("</") ? -1 : 1;
      if (depth === 0) { end = m.index; i = m.index + m[0].length; break; }
    }
    if (end < 0) throw new Error(`unclosed ${tag}`);
    const body = rest.slice(start + open[0].length, end);
    const attr = (name) => (open[2].match(new RegExp(`${name}="\\{\\{([^}]*)\\}\\}"`)) || [])[1];
    out += substitute(rest.slice(0, start), scope);
    if (open[1] === "for") {
      const as = (open[2].match(/as="([^"]*)"/) || [])[1];
      for (const item of lookup(scope, attr("list")) || []) out += expand(body, { ...scope, [as]: item });
    } else if (lookup(scope, attr("value"))) {
      out += expand(body, scope);
    }
    rest = rest.slice(i);
  }
  return out + substitute(rest, scope);
};
const substitute = (html, scope) =>
  html.replace(/\{\{([^}]*)\}\}/g, (_, expr) => {
    const value = lookup(scope, expr.trim());
    return value == null ? "" : String(value);
  });

const board = (file) => {
  const src = readFileSync(join(MOCKS, `${file}.dc.html`), "utf8");
  const dc = src.slice(src.indexOf("<x-dc>") + 6, src.indexOf("</x-dc>"));
  const helmet = dc.slice(dc.indexOf("<helmet>") + 8, dc.indexOf("</helmet>"));
  const markup = dc.slice(dc.indexOf("</helmet>") + 9);
  const scriptStart = src.indexOf("data-dc-script");
  const propsJson = src.slice(scriptStart).match(/data-props='([^']*)'/)[1];
  const props = {};
  for (const [key, spec] of Object.entries(JSON.parse(propsJson))) if (!key.startsWith("$")) props[key] = spec.default;
  const code = src.slice(src.indexOf(">", scriptStart) + 1, src.indexOf("</script>", scriptStart));
  const Component = new Function("DCLogic", `${code}; return Component;`)(class { constructor(p) { this.props = p; } });
  const vals = new Component(props).renderVals();
  let html = expand(markup, vals).replace(/\/_blob\/([0-9a-f]{32})/g, (_, id) => blobData[id]);
  // The board is a fixed 390px column: let it fill the phone width instead.
  html = html.replace(/<div style="width: 390px; height: \d+px;/, '<div style="width: 390px; min-height: 100%;');
  return { helmet, html };
};

const STATUS_BAR = `<div style="height:47px;display:flex;align-items:center;justify-content:space-between;padding:6px 26px 0 34px;background:#fff;font:600 16px/1 -apple-system,'SF Pro Text',Nunito,sans-serif;color:#0f172a">
  <span>9:41</span>
  <span style="display:flex;gap:6px;align-items:center">
    <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#0f172a"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#0f172a"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#0f172a"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#0f172a"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0l-1.5 1.5a4.3 4.3 0 0 0-6 0zM1 4.4a9.9 9.9 0 0 1 14 0l-1.5 1.5a7.8 7.8 0 0 0-11 0z" fill="#0f172a"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#0f172a" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="#0f172a"/><rect x="24.5" y="4.5" width="1.6" height="4" rx=".8" fill="#0f172a" opacity=".45"/></svg>
  </span>
</div>`;

const page = (helmet, body) => `<!doctype html><html><head><meta charset="utf-8">${helmet}
<style>html,body{margin:0;padding:0;width:1080px;height:1920px;overflow:hidden}*{box-sizing:border-box}</style></head><body>${body}</body></html>`;

// Phone: 390x844 screen at zoom 1.62 = 632x1367 css px, inside a 14px bezel.
const ZOOM = 1.62;
const SCREEN_W = Math.round(390 * ZOOM);
const SCREEN_H = Math.round(844 * ZOOM);
const BEZEL = 14;
const PHONE_W = SCREEN_W + BEZEL * 2;
const PHONE_H = SCREEN_H + BEZEL * 2;
const PHONE_TOP = 230; // clears the top caption zone; bottom lands near 1625

const framed = ({ helmet, html }, glow) => page(helmet, `
<div style="position:relative;width:1080px;height:1920px;overflow:hidden;background:
  radial-gradient(900px 700px at 15% 18%, ${glow[0]}55, transparent 70%),
  radial-gradient(900px 760px at 88% 82%, ${glow[1]}50, transparent 70%),
  linear-gradient(170deg,#0b1430 0%,#020617 55%,#060b1f 100%)">
  <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1.2px,transparent 1.2px);background-size:36px 36px;mask-image:linear-gradient(180deg,#000,transparent 85%)"></div>
  <div style="position:absolute;left:${(1080 - PHONE_W) / 2}px;top:${PHONE_TOP}px;width:${PHONE_W}px;height:${PHONE_H}px;border-radius:92px;background:#0b0f19;padding:${BEZEL}px;
    box-shadow:0 0 0 2px #2a3245, 0 0 0 5px #11151f, 0 50px 120px rgba(0,0,0,.6), 0 0 160px ${glow[0]}40">
    <div style="position:relative;width:${SCREEN_W}px;height:${SCREEN_H}px;border-radius:78px;overflow:hidden;background:#F3F5FA">
      <div style="zoom:${ZOOM};width:390px;height:844px;overflow:hidden;display:flex;flex-direction:column">
        ${STATUS_BAR}
        <div style="flex:1;overflow:hidden">${html}</div>
      </div>
      <div style="position:absolute;top:${Math.round(11 * ZOOM)}px;left:50%;transform:translateX(-50%);width:${Math.round(124 * ZOOM)}px;height:${Math.round(36 * ZOOM)}px;border-radius:999px;background:#000"></div>
      <div style="position:absolute;bottom:${Math.round(8 * ZOOM)}px;left:50%;transform:translateX(-50%);width:${Math.round(134 * ZOOM)}px;height:${Math.round(5 * ZOOM)}px;border-radius:999px;background:#0f172a"></div>
    </div>
  </div>
</div>`);

// Full bleed: 390 css px wide at zoom 1080/390, so 693 css px of screen fill the 1920px height.
const fullscreen = ({ helmet, html }) => page(helmet, `
<div style="width:1080px;height:1920px;overflow:hidden;background:#F3F5FA">
  <div style="zoom:${1080 / 390};width:390px;height:${1920 / (1080 / 390)}px;overflow:hidden">${html}</div>
</div>`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (const style of ["framed", "fullscreen"]) mkdirSync(join(outDir, style), { recursive: true });
  for (const s of SCREENS) {
    const b = board(s.file);
    for (const [style, html] of [["framed", framed(b, s.glow)], ["fullscreen", fullscreen(b)]]) {
      const file = join(tmpdir(), `hightop-social-${style}-${s.name}.html`);
      writeFileSync(file, html);
      await p.goto(`file://${file}`, { waitUntil: "networkidle" });
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: join(outDir, style, `${s.name}.png`), clip: { x: 0, y: 0, width: 1080, height: 1920 } });
      console.log(style, s.name);
    }
  }
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
