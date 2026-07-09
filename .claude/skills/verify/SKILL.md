---
name: verify
description: Manually verify a venue-scoped game page (Category Blitz, Trivia, Pick'em, Bingo, Fantasy, Predictions) end-to-end in a real browser — seed throwaway data, get past the auth gate, drive the UI with Playwright. Use before this skill's generic cold-start research when the change touches app/ or components/ for one of these games.
---

# Manual browser verification for venue-scoped games

This repo's game pages (`/category-blitz/*`, `/trivia/*`, `/pickem/*`, `/bingo`,
`/fantasy`, `/predictions`) are gated by two things a manual/Playwright harness
must satisfy that aren't obvious from reading the client code alone. Skip
straight to "Get past the auth gate" if you already have a running dev server.

## 1. Dev server

Check for an already-running server first — `lsof -i :3000` or
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`. If none,
`npm run dev` (Turbopack, port 3000 by default, falls back to 3001 if taken).

**Gotcha:** if every game route 307-redirects to `/` even with correct
cookies, don't assume the dev server's `.next` cache is corrupted — check
`proxy.ts` first (see below). A stale/corrupted `.next` is a real but rarer
cause; `rm -rf .next` and restart if the cookie fix below doesn't resolve it.

## 2. Get past the auth gate — cookies, not localStorage

**`proxy.ts`** (Next 16's renamed middleware, repo root) redirects any
non-public path to `/` unless it sees cookies `tp_venue_id` + `tp_user_id`.
Setting `localStorage` alone (what the app's own UI code does for display)
is **not enough** for direct navigation — `proxy.ts` runs server-side and
never sees localStorage. Full contract is documented in `CLAUDE.md` under
"Manual Testing & Auth Storage".

If `SESSION_SECRET` is set in `.env.local` (session enforcement on), routes
that call `readSession()` (e.g. Category Blitz's `/submit`) also require a
correctly HMAC-signed `tp_sess` cookie — a bare `userId` value will 401.

**Use the helper script** instead of hand-rolling this:

```bash
node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> [venueId]
```

Prints raw values, a `curl -b` string, and a Playwright `addCookies([...])`
snippet — pick the format with `--format curl|playwright|raw`. It mirrors
`lib/serverSession.ts`'s signing exactly, so the printed `tp_sess` passes
real signature verification.

In Playwright, set cookies via `page.context().addCookies([...])` **before**
`page.goto()` — not `page.evaluate(() => localStorage.setItem(...))`.

## 3. Seed throwaway data (server-only engine, no HTTP/auth needed)

Each game's server-only lib module (`lib/categoryBlitz.ts`,
`lib/pickem.ts`, etc.) exports admin-only functions you can call directly
from a Node script — no browser, no cookies, bypasses `requireAdminAuth`.
Reference implementation: `scripts/simulate-category-blitz.cjs` (uses a
reusable `sim-category-blitz` venue via `SUPABASE_SERVICE_ROLE_KEY`, creates
real `auth.users` + `public.users` rows since submission tables FK to them).

Run any such script with:

```bash
node --env-file=.env.local --conditions react-server --import tsx scripts/<script>.cjs
```

For Category Blitz specifically:
- `createSession(venueId, { source: "manual" })` — throws "already active" if
  one exists; look up the existing active session instead of erroring out.
- `registerSessionPresence({ sessionId, userId, authId, venueId })` — a
  player must be registered present or they're treated as a spectator.
- **3-player minimum for scoring:** `scoreRound()` forces 0 points for
  everyone if fewer than 3 session participants are registered, regardless
  of answer correctness. Register 2 extra silent participants if you need to
  see real point awards, not just 0s.
- `startRound(sessionId, testMode)` — `testMode=true` gives a 10s round
  (good for fast expiry tests, tight for interactive typing); `false` gives
  the real 180s round (better for careful manual interaction, then let it
  expire for real or see below).
- **No cron needed in dev:** any `GET /api/category-blitz/sessions?venueId=...`
  poll (a real client tab, or a bare `curl`) calls `driveVenueCategoryBlitz`,
  which self-heals/scores expired rounds on every request. If your Playwright
  browser already closed, just `curl` the sessions endpoint once to trigger
  scoring instead of waiting for a live tab.

**Clean up after**: delete the seeded `category_blitz_sessions` row for the
venue (cascades to rounds/submissions/participants) and the `auth.users` +
`public.users` rows you created. Leave the reusable `sim-category-blitz`
venue row in place.

## 4. Drive it with Playwright

`playwright` isn't a repo dependency. Install it into a scratch dir once per
session rather than adding it to `package.json`:

```bash
cd <scratchpad-dir> && npm init -y && npm install playwright@<version matching `npx playwright --version`>
```

The Chromium binary is usually already cached at
`~/Library/Caches/ms-playwright` — check before running `npx playwright
install`.

Minimal shape for a driver script:

```js
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.context().addCookies([...]); // from print-test-auth-cookies.cjs
await page.goto("http://localhost:3000/category-blitz/play");
```

Useful listeners while debugging: `page.on("console", ...)`,
`page.on("framenavigated", ...)` (catches unexpected redirects fast — this
is how the `proxy.ts` cookie gap above was actually found), `page.on("request", ...)`
filtered to the API route you care about, to capture the exact request body
sent (e.g. confirming full text reaches the server on an autosave debounce).

## 5. Verifying DB state directly

Fastest way to confirm server-side truth (not just what the UI displays):

```js
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
```

Run via `node --env-file=.env.local -e "..."` for one-off queries. For
Category Blitz, `category_blitz_submissions` has the raw `answer` text and
(after scoring) `is_valid`/`points_awarded`; the `/api/category-blitz/rounds/[id]/results`
route gives the human-facing `reason` field (`correct` / `wrong_letter` /
`duplicate` / `invalid`) if you need that instead of raw columns.
