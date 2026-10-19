#!/usr/bin/env node
// Phase 0 of docs/squares-and-brackets-plan.md: polls ONE NFL game once a minute from shortly before
// kickoff until it has been final for 10 polls, and records every distinct record the feed returned
// (with first/last seen times). This is what decides the Squares quarter-confirmation rule.
//   node --env-file=.env.local scripts/capture-nfl-live-game.cjs <gameId>
// Read-only. ~200-300 requests per game. Writes tests/fixtures/squares/nfl-live-capture-<gameId>.json
// after every poll, so a killed run still leaves what it saw. The API key is never written or printed.
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BALLDONTLIE_API_BASE_URL || "https://api.balldontlie.io";
const KEY = (process.env.BALLDONTLIE_API_KEY || "").trim();
const gameId = process.argv[2];
if (!KEY || !/^\d+$/.test(gameId || "")) {
  console.error("usage: node --env-file=.env.local scripts/capture-nfl-live-game.cjs <gameId>");
  process.exit(1);
}
const OUT = path.join(__dirname, "..", "tests", "fixtures", "squares", `nfl-live-capture-${gameId}.json`);
const POLL_MS = 60_000;
const START_BEFORE_KICKOFF_MS = 10 * 60_000;
const MAX_RUN_MS = 7 * 60 * 60_000;
const FINAL_POLLS_TO_STOP = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const capture = { gameId: Number(gameId), polls: 0, errors: [], snapshots: [] };
let lastKey = null;
const write = () => fs.writeFileSync(OUT, `${JSON.stringify(capture, null, 2)}\n`);

async function fetchGame() {
  const res = await fetch(`${BASE}/nfl/v1/games/${gameId}`, { headers: { Authorization: KEY } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data;
}

async function main() {
  const first = await fetchGame();
  const startAt = Date.parse(first.date) - START_BEFORE_KICKOFF_MS;
  console.log(`${first.visitor_team.abbreviation} @ ${first.home_team.abbreviation}, kickoff ${first.date}`);
  if (Date.now() < startAt) {
    console.log(`waiting until ${new Date(startAt).toISOString()}`);
    while (Date.now() < startAt) await sleep(Math.min(startAt - Date.now(), 10 * 60_000));
  }
  const stopBy = Date.now() + MAX_RUN_MS;
  let finalPolls = 0;
  while (Date.now() < stopBy && finalPolls < FINAL_POLLS_TO_STOP) {
    const at = new Date().toISOString();
    capture.polls += 1;
    try {
      const game = await fetchGame();
      const key = JSON.stringify(game);
      const last = capture.snapshots[capture.snapshots.length - 1];
      if (last && lastKey === key) {
        last.lastSeen = at;
        last.polls += 1;
      } else {
        capture.snapshots.push({ firstSeen: at, lastSeen: at, polls: 1, game });
        lastKey = key;
      }
      finalPolls = game.status_state === "final" ? finalPolls + 1 : 0;
    } catch (error) {
      capture.errors.push({ at, message: error.message });
    }
    write();
    await sleep(POLL_MS);
  }
  console.log(`done: ${capture.polls} polls, ${capture.snapshots.length} distinct records -> ${OUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
