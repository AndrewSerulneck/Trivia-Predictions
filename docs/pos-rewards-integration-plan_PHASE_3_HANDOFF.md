# POS Rewards Integration — Phase 3 Handoff (Clover: ON HOLD, re-plan needed)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 3 (Clover) · **Date:** 2026-10-05 ·
**By:** Claude Opus 5.5 · **State:** Phase 3 **not built**. At the phase-start question, Andrew described a
different design (staff use the POS device itself), so the plan's Phase 3 must be re-planned before any code.
Plan B and Plan C Phases 1–2 were **committed and deployed** this session.

---

## Update, 2026-10-05 (later the same day): Clover decided, test coupon created

**For Andrew:** You chose to build the Clover register app now, and said a scannable code on the coupon is OK. The
plan now has six Clover steps (3a–3f) in `docs/pos-rewards-integration-plan.md`. In short: a manager links the
register once with a 6-digit code from the Partner Dashboard; staff open the guest's order on the Clover, tap our
app, scan the coupon (or type its code), and tap Apply. Our server decides every scan, so a used coupon is refused.
Nothing was built or deployed in this update; only the plan changed (not committed).

You had already deleted the old Brunswick Grove test coupon. **A new one is in place** for the Square test and later
the Clover test: $25 gift card, your account at **Pacific Street** (your partner venue), hidden, expires Oct 19.

**Before Phase 3a can start, two things from you:**
1. In the Clover **sandbox** developer dashboard, create an **Android app** (permissions: Read orders, Write
   orders, Read inventory, Read merchant).
2. Decide test hardware: a **Clover Dev Kit** device (recommended; scanning and the real Register screen can't be
   tested on an emulator) or emulator only.
Also open, asked at later steps: where the app's code lives (3c), what happens when a prize is bigger than the
check (3b), and the App Market price (3e). The Square browser test (§8 below) can now use the new coupon.

**For the next agent:**
- Decisions (verbatim, 2026-10-05): "Ok to create a test coupon." / "Create additional phases to Build the Clover
  register app now. A scannable code on the coupon is OK." Recorded as plan §6 items 5–6; open items 7–10 there.
- **Supersedes** item 3 of "What I need from you", §1's "wait for his Clover decision", §7 questions 1–2 below, and
  the §8 step-3 note about needing a coupon. The plan's Phase 3 section is now the spec; the "Revised direction"
  text was folded into it.
- Test coupon (production): campaign `da65ec0f-ad34-4e01-8a0c-6666e00c4ca0`, redemption
  `643500aa-f8c9-4ef4-b4e0-e36872bf993f`, `winner_user_id = ecaececc-7b47-4d8d-9a5c-f28e44f976de` (Andrew at
  `venue-pacific-street`), `prize_kind='gift_card'`, 25, expires 2026-10-19 15:53 UTC, expiry notices pre-stamped,
  campaign `is_active=false`, `venue_ids={hc-cbz-live}`. Inserted with one `supabase db query --linked` CTE (the
  classifier allowed it). Verified with the real `listChallengeCampaignWinsForUser({ userId, venueId })` (it takes
  an object): the wallet lists it. Clean-up SQL is in the plan's §6 note.
- Old coupon (`a8062067-…` / `cbb59f90-…`): confirmed gone (`select` returned 0 rows).
- Research for the plan (2026-10-05, not yet verified on a device): Clover's Android `CloverAuth.authenticate()`
  token can be sent to our server and checked with a Clover REST call (Clover community guidance);
  `ACTION_MODIFY_ORDER` puts an app button on the merchant-facing payment screen and passes `Intents.EXTRA_ORDER_ID`
  (docs.clover.com/docs/intents-and-broadcasts); `OrderConnector.addDiscount` needs Read/Write orders + Read
  inventory and takes negative cents (docs.clover.com/docs/using-order-connector); `BarcodeResult` gives
  device-agnostic scanning. Local machine: JDK 21 (Homebrew) installed; **no Android SDK, `adb` or Gradle**.
- Next: Phase 3a, Opus 5.5 high, after Andrew's two setup items. Phase 3b (website side, flag off) does not
  depend on hardware and can start in parallel if Andrew wants, but it depends on 3a's answer to "how does the
  server prove the token is our app's" for its auth code, so build that piece last.

---

## For Andrew (plain English)

**Done today**
- **Plan B (live coupon) is live** on hightopchallenge.com. It went out with Plan C's Square work in one commit
  (`27f5eea`), pushed to GitHub, and Vercel deployed it (`hightop-challenge-ayzjanpqm`, Ready). Before shipping:
  all 3,335 automated tests pass, plus typecheck, lint, build and the app-install checks. A browser run of the
  prize wallet showed the live coupon working (clock, venue name, no errors).
- **The Point of Sale features are on the live site but switched off.** Vercel has no POS settings, so no partner
  or guest sees them. Checked on the live site: the POS pages answer "not found", and the Square webhook answers
  "not set up".
- **Your Square keys work.** You named them `SQUARE_SANDBOX_APPLICATION_ID` / `SQUARE_SANDBOX_APPLICATION_SECRET`.
  I taught the app to accept those names in sandbox mode (only there), so you don't need to re-add anything.
  Square recognised the app when I sent it a deliberately fake login code; it rejected only the fake code.

**Not done, and why**
- **The test coupon is still there.** Even with your OK, Claude Code's safety filter blocked the delete twice.
  Please run these two lines in Terminal, in the project folder:
  ```
  supabase db query --linked "delete from challenge_campaign_redemptions where id='cbb59f90-8107-4166-837e-e7d5ffaf3ffc';"
  supabase db query --linked "delete from challenge_campaigns where id='a8062067-303d-4e71-b022-fbd631e46870';"
  ```
  I checked: nothing else points at them. Harmless if it waits (hidden, only you can see it, expires Oct 19).
- **The Square test needs you at the keyboard.** Square's "Allow Hightop Challenge?" screen needs your Square
  sign-in, which I can't do. Steps are in §8 below (~10 minutes).
- **Clover (Phase 3) is on hold. It needs your decision.** You said staff should **scan or type the coupon on the
  Clover / Square / Toast device itself**, with no staff phones and no Partner Dashboard login. The plan's
  Phase 3 doesn't do that: it would have built a web page that staff open on a signed-in tablet. So I stopped
  before building it. Where each register stands against what you want:
  - **Square: already does it.** The prize becomes a Square gift card, and staff scan or type it on the Square
    register like any gift card.
  - **Toast: does it natively** (its Rewards button plus a scan). Still deferred until Toast accepts us.
  - **Clover: needs a small app that runs on the Clover register.** Staff open the guest's check, tap our app,
    and scan the coupon (or type its short code). The discount lands on the check. Clover supports this kind of
    app, and other loyalty companies ship one. But it is a separate Android app, tested on a Clover test device
    or emulator, and Clover must approve it before any bar can install it. That is noticeably bigger than the
    original Phase 3.
  - **Every option needs a code on the coupon.** The coupon would gain a QR plus a short code for staff to scan
    or type. That reverses Plan B's "no codes" decision, at least for venues with a connected register. It is
    still safe against screenshots: our server checks every scan, so a used coupon is refused.

**What I need from you**
1. Run the two delete lines above.
2. Do the Square test (§8).
3. **Decide on Clover.** (a) Build the Clover register app now. (b) **Recommended:** launch Square with real
   partners first, and start the Clover app once a Clover bar wants it (the same approach as Toast). (c) Build
   only the website parts now (code on the coupon, a register-facing endpoint), which Clover and Toast would both
   reuse. Also: is a scannable code on the coupon OK?
4. Still open from the plan, no rush: who pays for register-applied prizes (recommended: the partner), and must
   %-off prizes carry a dollar cap.

---

## For the next agent

### 1. Next goal and scope
- **Do not build the original Phase 3 staff web page.** Andrew rejected that shape (§3). Wait for his Clover
  decision (his section, item 3). If he picks (c), the scope is: a per-coupon redemption code + QR on the live
  coupon (only where a device integration is connected, unless he says everywhere), and a device-facing apply API
  authenticated by the POS app's merchant token (never `requireOwnerAuth`). If he picks (a), write a separate
  plan for the Android app first (new repo or `clover-app/` folder; his call).
- Phase 2's leftover item is still open: the browser run (§8).
- Out of scope: Toast (deferred), partner reporting (Phase 5), polling crons.

### 2. Starting state
- Branch `main`. **`27f5eea` pushed to `origin/main`** = Plan B (all phases) + Plan C Phases 1–2 + the
  sandbox-name fallback. Vercel production deploy `hightop-challenge-ayzjanpqm` is **Ready** (2026-10-05 ~10:40
  CDT). Doc-only edits after the commit (this note, plan/roadmap status lines, `CLAUDE.md` POS note) are
  **uncommitted**. `next-env.d.ts` shows modified because the dev server rewrote it. Not ours; don't commit it.
- **Vercel production has no `POS_*` / `SQUARE_*` / `CLOVER_*` env vars** (`vercel env ls production`, names
  only, 61 vars listed). So the POS flag is off in production, and `POS_TOKEN_KEY` is not there yet.
- **Database:** no schema change. `pos_connections` has **0 rows**. The Plan B test coupon still exists (ids in
  Andrew's section). Reference check this session: `challenge_cycle_winners` 0, `challenge_campaign_progress` 0,
  `pos_reward_applications` 0, 1 redemption row. FK columns are named `challenge_id` (not `campaign_id`).
- A `npm run dev` server was started on :3000 this session (background). It may still be running.

### 3. Decisions (don't re-ask)
- Andrew, 2026-10-05: "go ahead and delete the test coupon" (blocked by the classifier; he runs it). "Commit and
  deploy Plan B… Plan C can go in the same push because it's switched off" (done).
- **Andrew, 2026-10-05, on the Phase 3 staff screen (verbatim):** "I want staff to be able to use a Clover (or
  Square or Toast) device to scan a coupon or enter a code on the reward to apply the reward to the customers
  check… I don't want staff to have to use their own phones, and I don't want staff to have to log in to the
  Partner Dashboard (that is for managers and bar owners only)." He also picked "List + search (Recommended)" for
  finding a coupon, but that answered the old staff-screen question. Treat it as moot unless a device app needs a
  list.
- Mine: `lib/pos/squareConfig.ts` accepts `SQUARE_SANDBOX_APPLICATION_ID` / `SQUARE_SANDBOX_APPLICATION_SECRET`
  **only when `SQUARE_ENVIRONMENT=sandbox`**, and the plain names win when both are set (test added in
  `tests/lib.pos-square.test.ts`). Production must use the plain names.

### 4. Files changed this session
- `lib/pos/squareConfig.ts`: sandbox-name fallback (above). `tests/lib.pos-square.test.ts`: +1 test.
- Docs: `docs/reward-live-redemption-plan.md` (status: complete, deployed), `docs/rewards-trust-and-pos-roadmap.md`
  (B3 complete; C1/C2 deployed off; C3 on hold), `docs/pos-rewards-integration-plan.md` (status line +
  "Revised direction" under Phase 3), `CLAUDE.md` (POS section note), this handoff.

### 5. Facts and traps
- **Clover sandbox, 2026-10-05** (test merchant `E6K34ED22MSN1`, the API token in `.env.local`):
  - `GET /v3/merchants/{m}/orders?filter=state%3Dopen` works (200). The spike's "403" came only from
    `expand=employee` ("Invalid permissions for expandable fields"); `GET /employees` = 401. Showing the server's
    name needs Employees-read permission on the token / OAuth app.
  - `GET /orders/{id}?expand=discounts,lineItems` = 403 with this token, but `GET /orders/{id}` and
    `GET /orders/{id}/discounts` work.
  - **An order built over REST has no `total`.** Clover's register computes totals, so a total-based cap needs
    the line items, or must only trust device-opened orders.
  - Add order discount (`amount: -500`) and `DELETE` it both work on an open REST-created order. **Still
    unverified: an order opened on a Clover device** (rerun `npm run pos:spike -- clover --order <id>`).
  - The spike script prints ✓ for "list open orders" even on a 403 (it only logs the status). Don't trust its
    ticks there.
  - No Clover OAuth app id/secret in `.env.local` yet (only `CLOVER_SANDBOX_API_TOKEN`, `CLOVER_SANDBOX_MERCHANT_ID`).
- **Square credential check without a browser:** `exchangeSquareCode(config, "<fake>")` → 401 "Authorization code
  not found for app sandbox-sq0idb-…" means the id/secret are accepted. A wrong secret gives a different error.
- **Andrew's partner account owns only `venue-pacific-street`** (visible, real venue). He has no partner access
  to `brunswick-grove`, where the test coupon lives. So the coupon can't be used for the Square guest test unless
  the connection is made at Brunswick Grove (it can't be).
- **Classifier denials this session:** the production `delete` of the test coupon ("Modify Shared Resources"),
  even with Andrew's OK; and a `node -e` that printed a 15-char prefix of `SQUARE_APPLICATION_ID` ("Credential
  Materialization"). Names-only listing works:
  `node --env-file=.env.local -e "console.log(Object.keys(process.env).filter(k=>/SQUARE|POS_|CLOVER/.test(k)).sort().join('\n'))"`.
  `git push origin main` was allowed.
- To run a browser check without printing cookies: write
  `scripts/print-test-auth-cookies.cjs <userId> <venueId> --format playwright` to a scratch file and parse it
  inside the Playwright script.

### 6. Verification (2026-10-05, before the commit)
- `npx tsc --noEmit` clean; `npm run lint` clean (standing `sportsBingo.ts` Babel note); `npm run test`
  **300 files / 3,335 passed / 13 skipped / 0 failed**; `npm run build` success (187 pages);
  `npm run test:pwa-contract` 20/20.
- Playwright (390×844, dev server, Andrew's test cookies): `/redeem-prizes` lists the test coupon; Redeem opens
  the live coupon with clock, date, "Brunswick Grove" and the staff hint; all API calls 200; zero console/page
  errors. Confirm was **not** pressed.
- Live site after deploy: `/info` 200, `/api/owner/pos` 404, `POST /api/webhooks/square` 503,
  `POST /api/prizes/square-gift-card` (empty body) 400.
- **Unverified:** Square OAuth connect, the guest gift-card flow in a browser, the webhook, and Clover
  device-opened orders.

### 7. Open questions for Andrew
1. Clover direction: (a) / (b, recommended) / (c) in his section, and whether a scannable code on the coupon is OK.
2. For the Square guest test: OK to seed a throwaway $25 gift-card coupon for his player account at
   `venue-pacific-street` (his partner venue), deleted afterwards? (He runs the delete if the filter blocks it.)
3. Plan §6 decisions 2 and 3 (unchanged, non-blocking).

### 8. Square sandbox browser run (Andrew + agent)
1. Square Developer Console → the app → **Sandbox** → OAuth → Redirect URL =
   `http://localhost:3000/api/owner/pos/square/callback` → Save. Then click **Open in Square Dashboard** on the
   sandbox test account, so the browser is signed in to the sandbox seller.
2. `npm run dev` (restart it if `.env.local` changed). In the same browser, open
   `http://localhost:3000/owner/login`, sign in as the partner, then go to Dashboard → menu → **Point of Sale** →
   Square **Connect** → Allow. You should land back on the sheet with "Square is connected" (pick a location if
   asked). Check:
   `supabase db query --linked "select venue_id, environment, status, location_id is not null as has_location, merchant_name from pos_connections"`.
3. Guest side needs a gift-card coupon at that same venue (question 2). Open `/redeem-prizes` → Redeem →
   **Get my Square gift card** → 16-digit number + barcode + "$25.00 left". Ledger check: `status='succeeded'`,
   `external_ref like 'gftc:%'`, coupon `redeemed_method='pos_square'`.
4. Spend and webhook need a preview deploy plus Preview env vars (Phase 2 handoff §8 step 4).
5. **Disconnect** in the sheet afterwards. It's a sandbox row in the production database, on a real venue.

### 9. Recommended next steps
Opus 5.5, high. Get Andrew's answers (§7). Finish §8 with him. Then either write the Clover device-app plan or
build option (c), whichever he picks. End with a new handoff and update the plan's status line.
