# Square dev testing — Phase 1 handoff (environment guard)

Date: 2026-10-07. Plan: `docs/square-dev-test-venue-plan.md`. Phase 1 built by Claude Opus 5.5 (high effort).
Next: Phase 2 (create the hidden test venue — a live-database write).

## For Andrew (plain English)

**What changed:** the dev server and the live site can no longer touch each other's Square connection.
On your dev server, Pacific Street's Point of Sale sheet now says **"Connected on the live site."** with a
grey "Live site" badge, and there is no Reconnect or Disconnect button. The dashboard's "Square needs
reconnecting" nudge is gone for Pacific Street on dev. If anyone reaches Connect anyway, it stops before
going to Square and says: *"This venue's Square is managed from the other server, so nothing was changed.
Use your test venue to test Square."* The reverse is true on the live site (it won't touch a dev test
connection, and shows "Test connection from the dev server.").

**Is it live?** Committed **locally only** on `main` — not pushed, not deployed. The **dev-server half
protects you right now** (that is the side that could have damaged Pacific Street). The live-site half
(the live site refusing to touch a dev test connection, and showing the "Test" message) only works after
you push and deploy. Deploying is your call; nothing else needs to change on Vercel.

**Checked:** typecheck, lint, all 3,509 tests and the production build pass. I also opened your real
dashboard on the running dev server (signed in as your partner account) and tapped Connect for Pacific
Street: it bounced back with the message above and nothing was written. Pacific Street's real Square row is
untouched (still `active`, `production`, "Hightop Challenge").

**What's left:** Phase 2 creates the hidden "Hightop Test Bar" venue (it writes to the live database, so
the next agent must ask you first). Phase 3 is your first sandbox test run.

**Needs you:** nothing for Phase 1. Optional: push + deploy whenever convenient.

---

## For the next agent (Phase 2)

### 1. Goal and scope

Phase 2 = create ONE hidden test venue linked to Andrew's partner account, usable on the dev server for
Square sandbox testing. Read the plan's Phase 2 section — it is precise (`hidden = true`,
`self_serve_created_at` NULL, `checkout_started_at` NULL, `rehidden_at` NULL, not at `(0,0)`, a
`venue_owner_venues` link to Pacific Street's owner, undo statements in your handoff).
**Model/effort:** Claude Sonnet 5.5, medium.

**Out of scope for Phase 2:** any code change (Phase 1 is done), connecting Square (Phase 3, Andrew does
it in a browser), seeding prizes/wins (Phase 3, ask first), docs/CLAUDE.md lines (Phase 3), push/deploy.

**Ask Andrew before the write** (plan step 1): venue name (default "Hightop Test Bar", id
`venue-hightop-test`) and address/coords (default: Pacific Street's). If billing turns out to gate the
dashboard or Rewards for a venue (plan step 2), **stop and ask** — never insert a fake
`billing_subscriptions` row.

### 2. Starting state

- Branch `main`. Phase 1 is ONE local commit on top of `c3b70652aac88f5c26503d4910cee79819711cf6`
  ("Plan: Square dev testing via hidden test venue + environment guard"). Run `git log -3` to see it.
  **Not pushed, not deployed.** Andrew decides push/deploy.
- No database writes, migrations or env changes were made in Phase 1. No backups were needed.
- Production data observed 2026-10-07 (read-only): the only non-revoked `pos_connections` row in the
  whole database is `venue_id = 'venue-pacific-street'`, `provider = 'square'`, `status = 'active'`,
  `environment = 'production'`, `merchant_name = 'Hightop Challenge'`. **Do not touch it.**
- Andrew's partner owner id (used by `scripts/measure-owner-load.cjs` as its default, and confirmed to
  see Pacific Street on the dashboard): `64f046ff-a44f-47b4-acc1-94ff30288920`. Still **read and record
  Pacific Street's `venue_owner_venues` row** yourself before linking (plan step 2) — don't trust this line
  blindly.
- A dev server was already running on `localhost:3000` (Andrew's; PID was 67847). Don't kill it.

### 3. Decisions made in Phase 1 (and why)

- **New state, not a flag on `needs_attention`.** `PosConnectionState` gained `"other_environment"`, and
  `PosConnectionStatus` gained `otherEnvironment?: "sandbox" | "production"` (set only in that state). A
  separate state means no existing `needs_attention` branch can accidentally render Reconnect for it.
- **The row's environment picks the message, not the server's.** `production` row → the dev text
  ("Connected on the live site."), badge "Live site"; `sandbox` row → the live text ("Test connection
  from the dev server."), badge "Test". Badges are neutral (hairline border, muted text), not amber/rose.
- **Any non-revoked status counts as a conflict**, not just `active`: an `error` row from the other server
  is still not this server's to replace. A revoked row is history and never conflicts.
- **A server with no Square app configured (`squareAppConfig()` null) conflicts with every row** — it
  owns no environment, so it may touch none (fail closed). Previously such a server could Disconnect
  (wipe) a row; now it can't.
- **The dashboard nudge (`venuesNeedingPosAttention`) now flags only this server's `error` rows.** Other-
  environment rows (active or error) are never flagged — the partner can't fix them here.
- **Callback guard placement:** after the token exchange and the merchant/locations fetch, immediately
  before the first write branch (R5 `markSquareLocationIneligible`, `discardSquareGrant`'s refusal path,
  `saveSquareConnection`). On conflict OR a failed check it calls `discardSquareGrant` (gives the fresh
  grant back, same rules as the not-eligible branch — it won't revoke if this environment already holds
  that merchant for another venue) and redirects `other_environment` (or `error` on a failed check).
- **Banner copy has one home in a pure module** — `SQUARE_OTHER_ENVIRONMENT_RESULT_TEXT` in
  `lib/posStaffInstructions.ts` — because both the client sheet and the server routes' 409 body use it
  (the sheet is `"use client"`, `lib/pos/squareRoutes.ts` is `server-only`, so neither can host it for
  the other). The two status texts live in the sheet, as the plan asked.
- **Locations GET is not guarded** (plan said POST only). It writes nothing, and
  `loadSquareTokenForSetup` already refuses an other-environment row (→ 502); the sheet never shows the
  picker for an `other_environment` row anyway.
- **Backstops inside the write helpers** (beyond the plan, no extra queries — each already reads the
  row): `saveSquareConnection` refuses to overwrite a live row from another environment;
  `disconnectSquare` refuses a row from another environment (or with no config) before any RevokeToken
  or write; `setSquareLocation` now filters `.eq("environment", config.environment)`. Routes check first;
  these hold if a future route forgets.

### 4. Files changed (Phase 1 commit)

- `lib/pos/connections.ts` — `otherSquareEnvironment(row)` (private, replaces the old
  `isWrongEnvironment`), **`squareEnvironmentConflict(venueId)`** → `{ ok: true, conflict } | { ok: false }`
  (reuses `readLiveConnections`, one indexed read), `stateFor` returns `"other_environment"`,
  `listPosConnectionStatuses` adds `otherEnvironment`, `activePosProviders` and `venuesNeedingPosAttention`
  use the new helper.
- `lib/pos/types.ts` — `"other_environment"` state + `otherEnvironment?` field.
- `lib/pos/squareRoutes.ts` — `"other_environment"` in `PosConnectResult`; **`refuseOtherSquareEnvironment(venueId, action)`**
  → `null` (go ahead) | 409 `{ ok:false, code:"other_environment", error }` | 503 on a failed read. Logs
  `[PosSquare] other-environment-refused`.
- `app/api/owner/pos/square/connect/route.ts` — after the config check, before `createPosOAuthState`:
  failed read → `posResult=error`; conflict → `posResult=other_environment`, log
  `[PosSquare] connect-other-environment`. No nonce cookie is set on refusal.
- `app/api/owner/pos/square/callback/route.ts` — re-check before any write (see §3); log
  `[PosSquare] callback-other-environment`.
- `app/api/owner/pos/square/disconnect/route.ts`, `.../locations/route.ts` (POST) — call
  `refuseOtherSquareEnvironment` after the owner/venue guard.
- `lib/pos/squareConnection.ts` — the three backstops (§3); logs `save-refused-other-environment`,
  `disconnect-refused-other-environment`.
- `lib/posStaffInstructions.ts` — `SQUARE_OTHER_ENVIRONMENT_RESULT_TEXT`.
- `components/owner/pos/PosConnectionsSheet.tsx` — `SQUARE_OTHER_ENV_DEV_TEXT` / `SQUARE_OTHER_ENV_LIVE_TEXT`
  (each `{ title, body }`), `POS_RESULT_MESSAGES.other_environment`, neutral badge, the row renders the
  title/body instead of the pitch, and the "Set up Square" checklist is hidden while Square is
  `other_environment`.
- Tests: `tests/api.square-routes.test.ts` (connect/callback/disconnect/locations refuse and write
  nothing; fail closed; callback never reaches save or R5 for any location shape),
  `tests/lib.pos-square-hardening.test.ts` (real lib code on an in-memory DB — added a `failTable`
  switch to the mock for fail-closed tests; conflict helper both directions + unconfigured; statuses;
  nudge; the three backstops; guest side `loadSquareCredentials` + `readSquareWalletConnection` both
  directions), `tests/components.pos-connections-sheet.test.ts` (exact copy, badges, no
  Reconnect/Disconnect/checklist, banner).

### 5. Facts and traps

- Dev and production share Supabase project `pkmxupsayzshvpirkaav`; every dev write is a production write.
- `pos_connections_one_live_per_venue_provider`: one non-revoked row per (venue, provider), any
  environment — which is why the test venue (Phase 2) is needed at all.
- Guest side was already safe and is now pinned by tests: `loadSquareCredentials` refuses a mismatched
  row (`needs_attention`, logs `[PosSquare] environment-mismatch`) and `readSquareWalletConnection` filters
  `.eq("environment", config.environment)`, so guests get the normal coupon.
- **`.env.local` name listing was DENIED** in this session (`cut -d= -f1 .env.local` → permission denied).
  `node --env-file=.env.local …` scripts DO work. The dev server's `SQUARE_ENVIRONMENT` is `sandbox` and
  `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` is on (confirmed by a script printing only those two non-secret
  values).
- To run a TypeScript lib function against the real DB, the script must live **inside the repo** (so
  `@/` resolves): copy it to `scripts/.tmp-*.ts`, run
  `node --env-file=.env.local --conditions react-server --import tsx scripts/.tmp-x.ts`, then delete it.
  Never commit those.
- Owner session for a headless browser: cookie `tp_owner_sess` = `base64url(JSON{ownerId})` + `.` +
  HMAC-SHA256(SESSION_SECRET) base64url (see `scripts/measure-owner-load.cjs`). `playwright` resolves from
  the repo's `node_modules`. Never print the cookie.
- The repo's `/verify` skill is for venue game pages; for `/owner/*` use the owner cookie above instead.
- Don't run `npx tsc --noEmit` and `npm run build` at the same time (`.next/types` is regenerated).

### 6. Build / test / verification

Commands (all passed 2026-10-07): `npx tsc --noEmit`, `npm run lint`, `npm run test`
(306 files, 3,509 passed, 13 skipped, 0 failed), `npm run build`.

Verified on the running dev server with headless Chromium, signed in as owner
`64f046ff-a44f-47b4-acc1-94ff30288920`:
- `/owner/dashboard` (Pacific Street selected): no Square reconnect nudge.
- `GET /api/owner/pos/square/connect?venueId=venue-pacific-street` → redirected to
  `/owner/dashboard?posResult=other_environment&sheet=pos`; the sheet showed the banner, "Connected on the
  live site." + body, "Live site" badge; no "Reconnect", "Disconnect", "Set up Square" or "Reconnect needed".
- Read-only script: `squareEnvironmentConflict('venue-pacific-street')` = `{ ok: true, conflict: 'production' }`;
  `venuesNeedingPosAttention` = `[]`.

**Unverified:** the live-site half (needs a deploy; Phase 3 step 3 checks it), a real phone, and the
callback path end-to-end against Square (covered by mocked route tests only — a real attempt would need
Square's consent screen).

### 7. Open questions for Andrew

- Push/deploy Phase 1 when? (Only the live-site half waits on it.)
- Phase 2's name/address questions (plan step 1) — not yet asked.

### 8. Recommended first steps for Phase 2

1. Read `docs/square-dev-test-venue-plan.md` Phase 2 and this note; `git log -3` to confirm the commit.
2. Read-only: Pacific Street's `venues` row (`timezone`, `latitude`, `longitude`) and its
   `venue_owner_venues` row(s); check whether `requireOwnerAuth`, `app/owner/dashboard/page.tsx`,
   `GET /api/owner/dashboard` or the Rewards wizard need a `billing_subscriptions` row for a venue to be
   usable. If yes → stop and ask Andrew.
3. Ask Andrew the name/coords questions, then do the two inserts with a scratch script (not committed),
   record the exact undo `delete` statements in `docs/square-dev-test-venue-plan_PHASE_2_HANDOFF.md`.
4. Verify: the dashboard venue switcher shows both venues (headless browser with the owner cookie works);
   `listVenues()` (`lib/venues.ts`) does not return the test venue; Pacific Street unchanged.
