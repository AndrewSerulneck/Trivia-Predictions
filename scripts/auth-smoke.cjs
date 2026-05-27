#!/usr/bin/env node

/**
 * Prompt 7 auth smoke test:
 * - Checks Join page availability
 * - Checks passkey auth options route behavior
 * - Checks passkey register options route behavior
 * - Checks username update route auth guard behavior
 */

const baseUrl = (process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const venueId = process.env.AUTH_SMOKE_VENUE_ID || "00000000-0000-0000-0000-000000000000";
const username = process.env.AUTH_SMOKE_USERNAME || "smoke-user";

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function check(name, fn) {
  try {
    await fn();
    log(`PASS  ${name}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`FAIL  ${name} -> ${message}`);
    return false;
  }
}

async function postJson(path, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // no-op
  }
  return { response, text, json };
}

async function main() {
  log(`Auth smoke against ${baseUrl}`);

  const results = [];

  results.push(
    await check("Join page responds", async () => {
      const response = await fetch(`${baseUrl}/join`);
      if (!response.ok) {
        throw new Error(`Expected 2xx, got ${response.status}`);
      }
    })
  );

  results.push(
    await check("Passkey auth options guard rails", async () => {
      const { response, json } = await postJson("/api/auth/passkey/authenticate/options", { username, venueId });
      if (
        ![200, 401, 404].includes(response.status) &&
        !(response.status === 400 && json?.error === "Origin is not allowed for WebAuthn.")
      ) {
        throw new Error(`Unexpected status ${response.status}`);
      }
    })
  );

  results.push(
    await check("Passkey register options guard rails", async () => {
      const { response, json } = await postJson("/api/auth/passkey/register/options", { username, venueId });
      if (![200, 404].includes(response.status) && !(response.status === 400 && json?.error === "Origin is not allowed for WebAuthn.")) {
        throw new Error(`Unexpected status ${response.status}`);
      }
    })
  );

  results.push(
    await check("Username update requires auth", async () => {
      const { response } = await postJson("/api/auth/username/update", {
        currentUsername: username,
        newUsername: `${username}-new`,
      });
      if (response.status !== 401) {
        throw new Error(`Expected 401 without auth, got ${response.status}`);
      }
    })
  );

  const passed = results.filter(Boolean).length;
  const total = results.length;
  log(`\nResult: ${passed}/${total} checks passed.`);

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log(`FAIL  smoke runner -> ${message}`);
  process.exit(1);
});
