#!/usr/bin/env node
// Phase 0 of docs/squares-and-brackets-plan.md: saves the BallDontLie responses the Squares and
// Brackets engines are built and tested against. Read-only (GETs only, no database).
//   node --env-file=.env.local scripts/capture-squares-brackets-fixtures.cjs
// Writes tests/fixtures/squares/*.json and tests/fixtures/brackets/*.json. The API key is never
// written or printed.
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BALLDONTLIE_API_BASE_URL || "https://api.balldontlie.io";
const KEY = (process.env.BALLDONTLIE_API_KEY || "").trim();
if (!KEY) {
  console.error("BALLDONTLIE_API_KEY is not set.");
  process.exit(1);
}
const ROOT = path.join(__dirname, "..", "tests", "fixtures");
let requests = 0;

async function get(p, params) {
  const qs = new URLSearchParams(params).toString();
  requests += 1;
  const res = await fetch(`${BASE}${p}?${qs}`, { headers: { Authorization: KEY } });
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return res.json();
}

async function getAll(p, params) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 30; page += 1) {
    const q = [...params, ["per_page", "100"]];
    if (cursor != null) q.push(["cursor", String(cursor)]);
    const body = await get(p, q);
    rows.push(...(body.data || []));
    cursor = body.meta && body.meta.next_cursor;
    if (cursor == null) return rows;
  }
  throw new Error(`${p}: too many pages`);
}

function save(dir, name, data) {
  const file = path.join(ROOT, dir, name);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

async function main() {
  // Squares: every 2025 postseason game (Wild Card .. Super Bowl LX, Feb 2026).
  const post = await getAll("/nfl/v1/games", [["seasons[]", "2025"], ["postseason", "true"]]);
  save("squares", "nfl-postseason-2025.json", post);
  // Upcoming 2026 postseason (empty until January 2027) — proves the "matchup not known yet" shape.
  const post26 = await getAll("/nfl/v1/games", [["seasons[]", "2026"], ["postseason", "true"]]);
  save("squares", "nfl-postseason-2026-preseason-snapshot.json", post26);

  // Brackets: the 2026 tournament is season=2025 (the season's START year).
  for (const league of ["ncaab", "ncaaw"]) {
    // TRAP: /bracket pages at 25 by default — per_page=100 returns all 67 in one request.
    const bracket = await getAll(`/${league}/v1/bracket`, [["season", "2025"]]);
    save("brackets", `${league}-bracket-season-2025.json`, bracket);
    // TRAP: /games ignores game_ids[] and ids[] (returns every game), so fetch each by id.
    // A bracket game_id IS the /games id.
    const ids = bracket.map((g) => g.game_id).filter((id) => id != null);
    const games = [];
    for (const id of ids) games.push((await get(`/${league}/v1/games/${id}`, [])).data);
    save("brackets", `${league}-games-season-2025.json`, games);
    // Next tournament (season=2026) — empty or partial until Selection Sunday 2027.
    try {
      const next = await getAll(`/${league}/v1/bracket`, [["season", "2026"]]);
      save("brackets", `${league}-bracket-season-2026-preseason-snapshot.json`, next);
    } catch (error) {
      console.log(`${league} season=2026 bracket: ${error.message}`);
    }
  }
  console.log(`done, ${requests} requests`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
