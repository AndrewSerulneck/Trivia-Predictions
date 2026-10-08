# POS Rewards Integration: Phase 2h handoff (real-money pilot, in progress)

**Plan:** `docs/pos-rewards-integration-plan.md` §2h · **Date:** 2026-10-06 · **By:** Claude Opus 5.5
**State:** 2h **started, paused waiting on Andrew**. Everything the agent can do before Andrew's Square Console and
secret-pasting steps is done. Step 1 (Andrew's own Square, real money) has not run yet.

## UPDATE 2026-10-06 ~20:21 ET — Square is ON in production

- Agent generated `POS_TOKEN_KEY` (never printed). Copy: macOS Keychain item "Hightop POS_TOKEN_KEY (production)"
  (32 bytes, base64, verified). Andrew's three Square values went to Vercel straight from his clipboard. A sandbox
  Application ID was caught and refused first. All 7 names are present in production.
- R5 + docs committed `e2bf1e6` and pushed. Production deploy `dpl_5JAih4xzgz7Sw7PRHeJzPm215eyu` is Ready and aliased to
  `hightopchallenge.com` + `play.`.
- Smoke: unsigned `POST /api/webhooks/square` → **401**; `/api/owner/pos` signed out → **401** (it was 404 with the flag off);
  `/info` 200.
- Next: Andrew's steps 5–8 below (Square seller + app, Connect, $2 card test, menu prize test). Optional: "Send test event"
  in the Square console webhooks page, then look for a `[PosSquare] webhook-…` log line.

## For Andrew (plain English)

**Done today:**
- The review fixes (R1–R4) are committed (`12bfa6b`), pushed, and **live in production**. The Square switch is still
  off, so nobody sees anything new.
- Your refused-reconnect concern is fixed and tested (R5), **not yet committed**. It goes out with the push that
  turns Square on. Details: `docs/square-review-fixes-plan_PHASE_R5_HANDOFF.md`.
- Two harmless Square settings are already in Vercel production: "production mode" and the webhook address.
  Only the four secrets and the on-switch are left for you.
- Two small test prizes are waiting in your player wallet at Pacific Street: a **$2 Square gift card** and
  **$1 off "Pilot test item"**. They expire 2026-10-20. (Ignore the old $25 TEST coupon there; it was used up in
  the sandbox test.)
- I assumed you're the first pilot merchant: your own free Square seller account and the free Square app on your
  iPhone. That was the plan's recommendation. Tell me if you'd rather start with a partner bar.

**What you do next (about 30 minutes):**

1. **Square Developer Console** (developer.squareup.com → your app → switch to **Production** at the top):
   - **OAuth** page: copy the **Application ID** and the **Application secret**. Set the **Redirect URL** to
     `https://hightopchallenge.com/api/owner/pos/square/callback`
   - **Webhooks → Subscriptions → Add**: URL `https://hightopchallenge.com/api/webhooks/square`. Tick the events
     `gift_card.activity.created` and `oauth.authorization.revoked`. Save, then copy its **Signature key**.
2. **Make the secret key.** In Terminal, in the project folder, run:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   Save the result in your password manager as "Hightop POS_TOKEN_KEY (production)". If it is lost, every venue
   has to reconnect Square.
3. **Paste the secrets into Vercel.** Run each line, then paste its value when asked:
   ```
   vercel env add POS_TOKEN_KEY production
   vercel env add SQUARE_APPLICATION_ID production
   vercel env add SQUARE_APPLICATION_SECRET production
   vercel env add SQUARE_WEBHOOK_SIGNATURE_KEY production
   vercel env add NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED production     ← type: true   (do this one LAST)
   ```
4. **Tell me "go".** I'll commit and push R5. The push redeploys production with Square switched on. Then I run
   the smoke test (webhook answers 401, not 503; the Point of Sale sheet loads).
   ⚠ From that moment **every partner** sees "Point of Sale" and can connect Square. You chose that (no pilot list).
5. **Get your Square ready:** a free Square seller account (squareup.com, US) with one active location. Install the
   free **Square Point of Sale** app on your iPhone and sign in.
6. **Connect it:** Partner Dashboard (signed in as the Pacific Street partner) → menu → **Point of Sale** → Square
   **Connect** → Allow → pick your location if asked.
7. **Gift card test:** on your phone, as your player at Pacific Street → **Redeem Prizes** → the **$2** test prize →
   **Get my Square gift card**. In the Square app: ring a custom **$1** sale → Charge → **Gift card** → type the
   number. Also try scanning the barcode with the app's camera, if it offers that. Write down which ways worked.
8. **Menu prize test:** open the **$1 off Pilot test item** prize. It shows a discount name ("Hightop prize: $1 off
   Pilot test item"). In the Square app, ring any item → Discounts → pick that discount → charge. Then tap
   **Confirm Redemption** on the coupon.
9. **Tell me you're done.** I'll check the webhook landed, the $1 left on the card, the wallet, and the logs. I'll
   write it up.

**Still open from 2g (your call, not blocking the test):** the app has no privacy-policy page; decide whether you want
one before real partners connect. Also ask Square two questions: are API eGift cards free for the seller, and does
our OAuth app need a review if we aren't listed on their App Marketplace? (`docs/square-go-live-runbook.md` §0.)

**To turn it all off:** remove/false `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` in Vercel and redeploy (runbook §4).

---

## For the next agent

### 1. Goal and scope
- 2h Step 1: Andrew's own production Square + iPhone, real money (small). Then Step 2: the first partner bar on
  Square with two weeks of monitoring and a cost comparison with the plan's estimate. **Exit:** Andrew says
  Square is done. Then delete the test coupons (below) and resume Clover at Phase 3a.
- Out of scope: Clover, Toast, a pilot allowlist (Andrew: every partner, §6 item 13).

### 2. Starting state (2026-10-06, ~19:40 ET)
- `main` HEAD `12bfa6b` = `origin/main`, deployed to production as `dpl_6ngtBVrxU4PGScpA1nYB21hGXRqp` (git push
  auto-deploys production; no CLI deploy needed). Smoke after that deploy: `/info` 200, `/api/owner/pos` 404
  (flag off), `POST /api/webhooks/square` 503 (no signature key yet) — all as expected.
- Uncommitted: R5 code + tests (see R5 handoff), and docs: this file, R5 handoff, both plan status lines,
  `docs/square-go-live-runbook.md`, and `CLAUDE.md` (POS latest-handoff pointer). `clover-spike/` untracked:
  never `git add -A`.
- **Vercel production env added 2026-10-06 by the agent** (non-secret): `SQUARE_ENVIRONMENT=production`,
  `SQUARE_WEBHOOK_NOTIFICATION_URL=https://hightopchallenge.com/api/webhooks/square`. Still missing (Andrew
  pastes): `POS_TOKEN_KEY`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_WEBHOOK_SIGNATURE_KEY`,
  then `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED=true`. Check names only with `vercel env ls production`.
- **Production data written 2026-10-06 (Andrew's 2h go-ahead):** two pilot coupons for Andrew's `users` row
  `ecaececc-7b47-4d8d-9a5c-f28e44f976de` at `venue-pacific-street`, expiring 2026-10-20 23:32 UTC, expiry
  notices pre-stamped:
  - $2 gift card: campaign `73e4694e-e348-49e2-9bdd-e887a30c05a1` ("TEST — Square pilot $2 gift card (delete
    me)"), redemption `c7ff3f9d-31a2-4572-b16b-1a9b29f3c6fa`.
  - $1 off menu prize (`prize_menu_item='other'`, name "Pilot test item", `dollar` 1): campaign
    `18659244-50f1-4542-9ea5-2aec8a5efdce`, redemption `1c8eb198-3a84-4383-9016-4f8d36dcc840`.
  - Both campaigns are `is_active=false`, `venue_ids={hc-cbz-live}` (same shape as the 2026-10-05 $25 test coupon).
  - **Undo:** check `pos_reward_applications` for rows with those redemption ids, then delete the redemptions,
    then the campaigns. Deleting a real Square gift card is not possible; a $2 card on Andrew's own account is the
    accepted cost.
- The old $25 test coupon (redemption `643500aa-…`) is already redeemed with `redeemed_method='pos_square'` against
  a **sandbox** card (ledger `5a55f903-…`), so it can't mint a real card. A production server will refuse to show it
  (environment mismatch). All three Pacific Street `pos_connections` rows are sandbox and `revoked`.

### 3. Decisions
- Andrew, 2026-10-06: R1–R4 commit/push/deploy approved ("make the one commit … push it and deploy"); 2h go-ahead
  ("I'm giving the go-ahead for the real-money pilot"); refused-reconnect gap: "Let's plan something to fix this"
  → R5.
- §6 item 14 (pilot merchant) was **assumed** = the recommended option (Andrew's own seller account + iPhone first,
  then a friendly bar), because Andrew asked for simple next steps rather than questions. He can override.
- The agent added only the two non-secret env vars. Secrets are Andrew's to paste (plan §2g).

### 4. Files
- No 2h code. R5 code: see its handoff. Docs listed in §2.

### 5. Facts and traps
- **The flag push is the redeploy.** Andrew sets the env vars first, THEN the agent pushes R5. If R5 were pushed
  before the flag exists, a second redeploy would be needed (`NEXT_PUBLIC_*` is build-time). If Andrew wants it on
  with no new commit, use "Redeploy" on the current production deployment in the Vercel dashboard.
- `vercel deploy` from the CLI was `BLOCKED` before (2b handoff §5); production deploys come from `git push`.
- Webhook stays 503 until `SQUARE_WEBHOOK_SIGNATURE_KEY` exists; after it, an unsigned POST must be 401.
- A Square **developer** account and a Square **seller** account are different; the seller account is what Andrew
  connects. It needs an ACTIVE US location in USD (the 2c eligibility rule). What else Square's onboarding asks for
  (bank details, card-processing setup) is unverified; record what Andrew hits.
- The menu-prize discount is created in Andrew's Square catalog on first coupon open (2d, name = identity).
- Reading production data: `node --env-file=.env.local <script>` from the project folder; resolve
  `@supabase/supabase-js` via `createRequire(process.cwd() + "/package.json")` when the script lives in the
  scratchpad. Never print token columns.

### 6. Verified
- R5 gates: tsc, lint, 3,439 tests: see R5 handoff. `npm run build` on the R5 tree: **succeeded** (exit 0).
- Nothing has run against production Square yet.

### 7. Open questions for Andrew
1. Steps 1–3 above (console, key, secrets), then "go".
2. OK to commit + push R5 with that "go" (it is the redeploy).
3. Privacy-policy page yes/no; Square's answers on eGift fees and OAuth review.
4. Override of the §6 item 14 assumption, if any.

### 8. Next steps for the agent (Opus 5.5; **high** for anything touching live money, else medium)
1. On "go": `vercel env ls production` → confirm all 7 names present (names only). Stage R5 + docs by name,
   commit, push. Watch the auto-deploy (`vercel ls --prod`, then `vercel inspect <url>` until Ready).
2. Smoke (runbook §3): unsigned `POST /api/webhooks/square` → 401; `/api/owner/pos` → 401 signed out (not 404);
   ask Andrew to "Send test event" in the Square console and look for a `[PosSquare] webhook-…` log line
   (Vercel MCP `get_runtime_logs` or the dashboard).
3. After Andrew's steps 6–8: read (names/ids only) `pos_connections` for `venue-pacific-street` (production row,
   `active`, location set), `pos_reward_applications` for redemption `c7ff3f9d-…` (`succeeded`,
   `external_detail.balance_cents` = 100 after the $1 sale), the menu coupon's `redeemed_method = 'guest_confirm'`.
   Record which entry methods worked (typed / scanned). Update plan §2h and write the next handoff.
4. Then Step 2 (first partner bar), and the two-week cost comparison against the plan's estimate.
