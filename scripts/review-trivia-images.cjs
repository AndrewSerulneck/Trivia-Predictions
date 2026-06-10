#!/usr/bin/env node
/**
 * Generates a browser-based review page for all Live Trivia questions that
 * have an imageUrl, so you can quickly verify image quality and accuracy.
 *
 * Usage: node scripts/review-trivia-images.cjs
 *
 * Opens review-trivia-images.html in your default browser when done.
 */

const { readFileSync, writeFileSync, readdirSync } = require("fs");
const { join } = require("path");
const { execSync } = require("child_process");

const LIVE_DIR = join(process.cwd(), "data", "live-trivia", "categories");
const OUT_FILE = join(process.cwd(), "review-trivia-images.html");

// ---------------------------------------------------------------------------
// Collect all image questions grouped by category
// ---------------------------------------------------------------------------

const categories = readdirSync(LIVE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((file) => {
    const raw = JSON.parse(readFileSync(join(LIVE_DIR, file), "utf-8"));
    const categoryName = String(raw.categoryName || file.replace(/\.v\d+\.json$/i, "").replace(/-/g, " ")).trim();
    const imageQuestions = (raw.questions ?? []).filter((q) => q.imageUrl);
    return { categoryName, file, imageQuestions };
  })
  .filter((c) => c.imageQuestions.length > 0);

const totalImages = categories.reduce((n, c) => n + c.imageQuestions.length, 0);
console.log(`Found ${totalImages} image questions across ${categories.length} categories.`);

// ---------------------------------------------------------------------------
// Build HTML
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardHtml(q, index) {
  const slug = escHtml(q.slug);
  const question = escHtml(q.question);
  const answer = escHtml(q.answer);
  const imgSrc = escHtml(q.imageUrl);
  const credit = escHtml(q.imageCredit ?? "");
  const difficulty = escHtml(q.difficulty ?? "");
  const acceptable = q.acceptableAnswers?.length
    ? `<div class="also-accepts">Also accepts: ${q.acceptableAnswers.map(escHtml).join(", ")}</div>`
    : "";

  const isMap = (q.imageCredit ?? "").toLowerCase().includes("wikimedia");
  return `
    <div class="card" id="${slug}">
      <div class="card-index">#${index + 1}</div>
      <div class="img-wrap${isMap ? "" : " photo"}">
        <img
          src="${imgSrc}"
          alt="${answer}"
          loading="lazy"
          onerror="this.closest('.img-wrap').classList.add('broken'); this.style.display='none'"
        />
        <div class="broken-msg">⚠ Image failed to load</div>
      </div>
      <div class="card-body">
        <div class="question-text">${question}</div>
        <div class="answer-row">
          <span class="answer-label">Answer:</span>
          <span class="answer-value">${answer}</span>
          <span class="difficulty diff-${difficulty}">${difficulty}</span>
        </div>
        ${acceptable}
        <div class="url-row">
          <span class="url-label">URL:</span>
          <a class="url-link" href="${imgSrc}" target="_blank" rel="noopener">${imgSrc}</a>
        </div>
        <div class="credit-row">${credit}</div>
        <div class="slug-row">slug: <code>${slug}</code></div>
      </div>
    </div>`;
}

function sectionHtml(cat) {
  const cards = cat.imageQuestions.map((q, i) => cardHtml(q, i)).join("\n");
  return `
  <section>
    <h2>${escHtml(cat.categoryName)} <span class="count">${cat.imageQuestions.length}</span></h2>
    <p class="file-note">📄 ${escHtml(cat.file)}</p>
    <div class="grid">${cards}</div>
  </section>`;
}

const tocItems = categories
  .map((c) => `<li><a href="#section-${escHtml(c.file)}">${escHtml(c.categoryName)} (${c.imageQuestions.length})</a></li>`)
  .join("\n");

const sectionsHtml = categories
  .map((c) => `<div id="section-${escHtml(c.file)}">${sectionHtml(c)}</div>`)
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live Trivia Image Review — ${totalImages} images</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f0f17; color: #e2e8f0; min-height: 100vh; }
  header { background: #1a1a2e; border-bottom: 2px solid rgba(250,204,21,0.4); padding: 20px 32px; position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  header h1 { font-size: 1.25rem; font-weight: 900; color: #facc15; }
  header .stats { font-size: 0.8rem; color: #94a3b8; }
  nav { background: #111827; border-bottom: 1px solid rgba(255,255,255,0.08); padding: 16px 32px; }
  nav h3 { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 8px; }
  nav ul { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
  nav a { color: #84cc16; text-decoration: none; font-size: 0.8rem; background: rgba(132,204,22,0.1); border: 1px solid rgba(132,204,22,0.25); border-radius: 6px; padding: 3px 10px; transition: background 0.15s; }
  nav a:hover { background: rgba(132,204,22,0.25); }
  main { padding: 32px; max-width: 1600px; margin: 0 auto; }
  section { margin-bottom: 48px; }
  h2 { font-size: 1.3rem; font-weight: 900; color: #facc15; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
  .count { font-size: 0.75rem; background: rgba(250,204,21,0.2); border: 1px solid rgba(250,204,21,0.4); border-radius: 9999px; padding: 2px 8px; color: #facc15; }
  .file-note { font-size: 0.7rem; color: #475569; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .card { background: #1e1e2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; overflow: hidden; position: relative; transition: border-color 0.2s; }
  .card:hover { border-color: rgba(250,204,21,0.5); }
  .card-index { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); color: #64748b; font-size: 0.65rem; font-weight: 700; border-radius: 6px; padding: 2px 6px; z-index: 2; }
  .img-wrap { width: 100%; height: 180px; background: #0f0f17; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
  .img-wrap img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .img-wrap.photo img { object-fit: cover; }
  .broken-msg { display: none; color: #f87171; font-size: 0.8rem; text-align: center; padding: 8px; }
  .img-wrap.broken .broken-msg { display: block; }
  .card-body { padding: 12px; }
  .question-text { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; line-height: 1.4; margin-bottom: 10px; }
  .answer-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
  .answer-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; }
  .answer-value { font-size: 0.9rem; font-weight: 900; color: #4ade80; }
  .difficulty { font-size: 0.65rem; font-weight: 700; border-radius: 9999px; padding: 1px 7px; text-transform: uppercase; letter-spacing: 0.08em; margin-left: auto; }
  .diff-easy   { background: rgba(74,222,128,0.15);  border: 1px solid rgba(74,222,128,0.4);  color: #4ade80; }
  .diff-medium { background: rgba(250,204,21,0.15);  border: 1px solid rgba(250,204,21,0.4);  color: #facc15; }
  .diff-hard   { background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.4); color: #f87171; }
  .also-accepts { font-size: 0.7rem; color: #94a3b8; margin-bottom: 6px; }
  .url-row { display: flex; gap: 4px; align-items: flex-start; margin-top: 8px; }
  .url-label { font-size: 0.65rem; color: #475569; text-transform: uppercase; font-weight: 700; white-space: nowrap; padding-top: 1px; }
  .url-link { font-size: 0.65rem; color: #60a5fa; word-break: break-all; text-decoration: none; line-height: 1.3; }
  .url-link:hover { text-decoration: underline; }
  .credit-row { font-size: 0.65rem; color: #475569; margin-top: 4px; }
  .slug-row { font-size: 0.6rem; color: #334155; margin-top: 4px; }
  code { background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 3px; }
  .filter-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .filter-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #94a3b8; font-size: 0.75rem; font-weight: 600; padding: 4px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
  .filter-btn:hover, .filter-btn.active { background: rgba(250,204,21,0.15); border-color: rgba(250,204,21,0.5); color: #facc15; }
  @media (max-width: 640px) { main { padding: 16px; } .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>Live Trivia — Image Review</h1>
  <div class="stats">${totalImages} images &bull; ${categories.length} categories &bull; generated ${new Date().toLocaleString()}</div>
  <div class="filter-bar">
    <span style="font-size:0.7rem;color:#64748b;font-weight:700;text-transform:uppercase;">Jump to broken:</span>
    <button class="filter-btn" onclick="document.querySelectorAll('.img-wrap.broken').forEach(el => el.closest('.card').scrollIntoView({behavior:'smooth', block:'center'}))">
      Show broken images
    </button>
  </div>
</header>

<nav>
  <h3>Categories</h3>
  <ul>${tocItems}</ul>
</nav>

<main>
  ${sectionsHtml}
</main>

<script>
  // Highlight cards whose images fail to load in red
  document.querySelectorAll('.img-wrap img').forEach(img => {
    img.addEventListener('error', () => {
      img.closest('.card').style.borderColor = 'rgba(248,113,113,0.6)';
    });
  });
</script>
</body>
</html>`;

writeFileSync(OUT_FILE, html, "utf-8");
console.log(`\nWrote ${OUT_FILE}`);

// Open in default browser
try {
  execSync(`open "${OUT_FILE}"`);
  console.log("Opened in browser.");
} catch {
  console.log(`Open manually: file://${OUT_FILE}`);
}
