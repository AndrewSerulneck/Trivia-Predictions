#!/usr/bin/env node
/**
 * Sends a mock BallDontLie webhook payload to your local or production endpoint.
 *
 * Usage:
 *   node scripts/test-webhook.cjs [game-final|player-stat] [target-url]
 *
 * Examples:
 *   # Test game-final (triggers Pick 'Em settlement + fantasy scoring):
 *   node scripts/test-webhook.cjs game-final http://localhost:3000
 *
 *   # Test player stat event (triggers Fantasy live stats + Bingo squares):
 *   node scripts/test-webhook.cjs player-stat http://localhost:3000
 *
 *   # Test against production:
 *   node scripts/test-webhook.cjs game-final https://your-domain.com
 *
 * Requires BALLDONTLIE_WEBHOOK_SECRET in your environment (or .env.local).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load .env.local if present
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const secret = process.env.BALLDONTLIE_WEBHOOK_SECRET ?? "";
if (!secret) {
  console.warn("⚠️  BALLDONTLIE_WEBHOOK_SECRET not set — request will be sent without a valid signature.");
}

const mode = process.argv[2] ?? "game-final";
const baseUrl = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${baseUrl}/api/webhooks/balldontlie`;

const GAME_FINAL_PAYLOAD = {
  type: "nba.game.end",
  data: {
    game: {
      id: 99999,
      status: "Final",
      home_team_score: 112,
      visitor_team_score: 98,
    },
  },
};

const PLAYER_STAT_PAYLOAD = {
  type: "nba.player_stat.created",
  data: {
    game: {
      id: 99999,
      status: "In Progress",
    },
    player: {
      id: 999,
      first_name: "Test",
      last_name: "Player",
    },
    team: {
      id: 1,
      full_name: "Test Team",
    },
    pts: 24,
    reb: 8,
    ast: 6,
    stl: 2,
    blk: 1,
    fg3m: 3,
    oreb: 1,
    dreb: 7,
    ftm: 4,
    turnover: 2,
    fgm: 9,
    min: "32:15",
  },
};

const payload = mode === "player-stat" ? PLAYER_STAT_PAYLOAD : GAME_FINAL_PAYLOAD;
const body = JSON.stringify(payload);
const timestamp = String(Math.floor(Date.now() / 1000));
const webhookId = `test-${Date.now()}`;

const signature = secret
  ? `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
  : "v1=invalidsignature";

console.log(`\n📡  Sending [${mode}] test webhook to ${url}`);
console.log(`    Timestamp : ${timestamp}`);
console.log(`    Webhook-ID: ${webhookId}`);
console.log(`    Payload   : ${body.slice(0, 120)}...\n`);

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-bdl-webhook-timestamp": timestamp,
    "x-bdl-webhook-signature": signature,
    "x-bdl-webhook-id": webhookId,
  },
  body,
})
  .then(async (res) => {
    const text = await res.text();
    if (res.ok) {
      console.log(`✅  ${res.status} ${res.statusText}`);
      console.log(`    Response: ${text}`);
    } else {
      console.error(`❌  ${res.status} ${res.statusText}`);
      console.error(`    Response: ${text}`);
    }
  })
  .catch((err) => {
    console.error("❌  Request failed:", err.message);
  });
