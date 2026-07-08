#!/usr/bin/env node

/**
 * Print ready-to-use auth cookies for manually testing a venue-scoped page
 * (e.g. via Playwright, curl, or a browser devtools paste) without going
 * through the real /join login flow.
 *
 * Why this exists: proxy.ts (the server-side route gate) only reads cookies
 * (tp_venue_id, tp_user_id, and tp_sess when SESSION_SECRET is set) — setting
 * localStorage alone is NOT enough for direct navigation to a protected page,
 * even though the app's own client code always writes both together. See the
 * "Manual Testing & Auth Storage" section in CLAUDE.md for the full contract.
 *
 * This script mirrors lib/serverSession.ts's createSessionCookie() exactly
 * (HMAC-SHA256 over a base64url JSON payload) so the generated tp_sess value
 * passes real signature verification when SESSION_SECRET is configured.
 *
 * Usage:
 *   node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> [venueId]
 *
 * Options:
 *   --format <curl|playwright|raw|all>   Output format. Default: all.
 */

const { createHmac } = require("node:crypto");

function parseArgs(argv) {
  const positional = [];
  let format = "all";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--format") {
      format = String(argv[++i] ?? "all").trim();
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      printHelp();
      process.exit(0);
    } else {
      positional.push(argv[i]);
    }
  }
  return { userId: positional[0], venueId: positional[1] ?? "", format };
}

function printHelp() {
  console.log(`Print test auth cookies for direct-navigation manual testing.

  node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> [venueId] [--format curl|playwright|raw|all]

Mirrors lib/serverSession.ts's HMAC signing, so the tp_sess value it prints
passes real signature verification when SESSION_SECRET is set.`);
}

/** Exact mirror of lib/serverSession.ts createSessionCookie()'s value (not the full Set-Cookie header). */
function makeSessionCookieValue(userId) {
  const secret = String(process.env.SESSION_SECRET ?? "").trim();
  const payload = Buffer.from(JSON.stringify({ uid: userId })).toString("base64url");
  if (!secret) return null; // session enforcement is off; no tp_sess cookie needed
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function main() {
  const { userId, venueId, format } = parseArgs(process.argv.slice(2));
  if (!userId) {
    printHelp();
    process.exit(1);
  }

  const sessionEnforced = String(process.env.SESSION_SECRET ?? "").trim().length > 0;
  const sessValue = makeSessionCookieValue(userId);

  const cookies = [
    { name: "tp_user_id", value: userId },
    ...(venueId ? [{ name: "tp_venue_id", value: venueId }] : []),
    ...(sessValue ? [{ name: "tp_sess", value: sessValue }] : []),
  ];

  console.log(`# SESSION_SECRET is ${sessionEnforced ? "SET" : "not set"} — tp_sess ${sessValue ? "included (signed)" : "omitted (session not enforced)"}.`);
  if (!venueId) {
    console.log("# No venueId given — omitting tp_venue_id. Pass it as the 2nd argument if the page needs it.");
  }
  console.log("");

  const showAll = format === "all";

  if (showAll || format === "raw") {
    console.log("## Raw cookie values");
    for (const c of cookies) console.log(`${c.name}=${c.value}`);
    console.log("");
  }

  if (showAll || format === "curl") {
    console.log("## curl");
    const cookieArg = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    console.log(`curl -b "${cookieArg}" http://localhost:3000/<path>`);
    console.log("");
  }

  if (showAll || format === "playwright") {
    console.log("## Playwright");
    console.log("await page.context().addCookies([");
    for (const c of cookies) {
      console.log(`  { name: "${c.name}", value: "${c.value}", url: "http://localhost:3000" },`);
    }
    console.log("]);");
    console.log("");
  }
}

main();
