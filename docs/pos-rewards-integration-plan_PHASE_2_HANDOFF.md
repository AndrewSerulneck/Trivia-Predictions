# POS Rewards Integration — Phase 2 Handoff (Square gift cards)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 2 (Square) · **Date:** 2026-10-05 ·
**By:** Claude Opus 5.5 · **State:** code built and fully tested offline + against the Square sandbox API;
**the real "Connect Square → guest gets a card → spend it" loop has NOT run yet.** It needs Andrew's Square
app keys (below). Uncommitted, flag off.
**Next:** finish Phase 2's sandbox end-to-end check (§8 below), then Phase 3 (Clover).

---

## For Andrew (plain English)

**What changed.** Partners on Square can now hand out gift-card prizes as **real Square gift cards**:

- **Partner side:** the Point of Sale sheet's **Square** row now has a working **Connect** button. It opens Square's
  "allow Hightop Challenge?" screen and comes back connected. If their Square account has several locations, the
  sheet asks which one gives out the gift cards. There's also a **Disconnect** button, which needs two taps.
- **Guest side:** when a guest opens a **gift card** prize at a Square-connected venue, they see "Pay with a Square
  gift card". They tap **Get my Square gift card** and get a real Square gift card for the prize amount. It shows
  as a 16-digit number plus a barcode. Staff take payment → Gift card → type the number, or scan the barcode if
  they have a scanner. Square keeps track of the balance, so the guest can spend it over several visits. The
  guest can reopen it any time with **Show gift card**. It reads **Used** once it's spent.
- **Menu-item prizes** (free appetizer, % off) work exactly as before at every venue.
- If Square is down, or staff can't take gift cards, the guest taps **"Redeem the normal way"** and gets the
  usual coupon.

**One thing works differently from the plan, on purpose.** The plan said "mark the prize used when the guest
first spends the card." I made it "mark the prize used **the moment it becomes a Square gift card**."
Otherwise a guest could, in a narrow window, get both the staff discount *and* a funded gift card. It could also
leave a coupon showing "expired" in our app while its Square card still worked. The card's actual spending is
still recorded every time Square tells us about it.

**Is it live?** No. Nothing is committed, pushed or deployed. Even after a deploy, nobody sees anything until you
turn on `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` **and** add the Square app keys. No database change was needed for
this phase.

**Checked so far:** all automated checks pass (3,334 tests, typecheck, lint, build). My Square code was also run
against **Square's real sandbox**. It created a card, funded it with $25, and refused to fund it twice, so the
balance stayed $25. It read the card back (16-digit number) and confirmed what a "spend" looks like.

**What I need from you — simple steps (≈15 minutes):**

1. **Delete the Plan B test coupon** (the safety filter blocked me from deleting production rows). Either tell
   me "go ahead and delete the test coupon" and approve the prompt, or run these two lines yourself in the
   project folder:
   ```
   supabase db query --linked "delete from challenge_campaign_redemptions where id='cbb59f90-8107-4166-837e-e7d5ffaf3ffc';"
   supabase db query --linked "delete from challenge_campaigns where id='a8062067-303d-4e71-b022-fbd631e46870';"
   ```
   (It's harmless if it waits: it's hidden, unredeemed, and expires Oct 19.)
2. **Square Developer Console → your app → switch to Sandbox:**
   - **OAuth** page → **Redirect URL** → enter `http://localhost:3000/api/owner/pos/square/callback` → Save.
   - Copy the **Sandbox Application ID** (starts `sandbox-sq0idb-`) and the **Sandbox Application secret**
     (on the same OAuth page, "Show").
3. **Add four lines to `.env.local`.** Paste each one in Terminal, in the project folder, with **two** `>`:
   ```
   echo 'SQUARE_ENVIRONMENT=sandbox' >> .env.local
   echo 'SQUARE_APPLICATION_ID=<paste the sandbox application id>' >> .env.local
   echo 'SQUARE_APPLICATION_SECRET=<paste the sandbox secret>' >> .env.local
   echo 'NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED=true' >> .env.local
   ```
   (The webhook key comes later, with a preview deploy. The last line only turns the feature on on your own
   computer, not on the live site.)
4. **Then tell the next agent "keys are in, run the Square sandbox test."** It will walk you through connecting
   the sandbox account on your laptop and getting a test gift card on screen.
5. **Commit / deploy decision.** Plan B (live coupon) is ready to commit and deploy now that your phone check
   passed. Plan C Phases 1–2 can go in the same push safely, because everything is behind the off switch. Say
   "commit and deploy" (or "commit only") when you want it.
6. **Still-open decisions from the plan** (no rush, nothing blocks on them): who pays for a prize applied at the
   register (recommended: the partner, and with Square gift cards they effectively do). And whether % off prizes
   must have a dollar value when a register is connected (built as "required").

**Later, before real partners use it** (not now): production Square app keys + `vercel env add` for each, the
production Redirect URL `https://hightopchallenge.com/api/owner/pos/square/callback`, the webhook subscription
(§5), and `POS_TOKEN_KEY` in Vercel production (the Phase 1 handoff has the steps; it is **not** in Vercel yet as
far as I know: I only checked `.env.local` names).

---

## For the next agent

### 1. Goal and scope of what's next

**Finish Phase 2 (one remaining item), then Phase 3.**

- **Phase 2 remaining: the sandbox end-to-end run** (§8). Connect a Square **sandbox** seller to a test venue
  through the real OAuth flow, issue a gift card from the real wallet UI, spend it (Square sandbox Dashboard, or
  the API `REDEEM` activity like the snippet in §6), and watch the webhook record it (needs a public URL → a
  Vercel **preview** deploy with Preview env vars; localhost can't receive webhooks).
- **Phase 3 (Clover)** per plan §4. Start by asking Andrew the plan's open question: the staff-side screen shape.
  The plan recommends a small owner-authenticated "Apply a reward to a check" page.
- **Out of scope:** Toast (deferred, plan §1a); partner reporting (Phase 5); any polling cron; a migration
  (Phase 2 needed none); spend-based loyalty.

### 2. Starting state

- Branch `main`; last commit `b23ddac` at start and end. **Nothing committed** this session; Plans B (all phases)
  and C (Phases 1–2) are all uncommitted in the working tree. Nothing pushed or deployed. Production runs the
  2026-10-04 build.
- **Database:** no schema change this phase. `pos_connections` / `pos_reward_applications` exist in production
  (Phase 1's `20261004192844_pos_foundation.sql` and Plan B's `20261005123950_reward_redeem_once.sql` were applied
  2026-10-05 — confirmed this session: a query against `pos_reward_applications` succeeded). No rows were written
  to either table. **No production data changed this session.**
- **Plan B leftover:** the throwaway test coupon still exists (campaign `a8062067-303d-4e71-b022-fbd631e46870`,
  redemption `cbb59f90-8107-4166-837e-e7d5ffaf3ffc`, Brunswick Grove, $25 gift card, **unredeemed**, expires
  2026-10-19, campaign `is_active=false` in hidden room `hc-cbz-live`). I verified nothing else references it
  (0 `challenge_cycle_winners`, 0 `challenge_campaign_progress`, 0 ledger rows). My delete was **denied by the
  auto-mode classifier** ("Cloud Storage Mass Delete"). Do not retry or route around it; Andrew runs it or
  explicitly OKs it. *Option:* it is a ready-made gift-card coupon for Andrew's account at Brunswick Grove, so it
  could serve the §8 test before deletion (it's in prod, flag is off in prod, so no guest can see it).
- **Env (names only, read 2026-10-05):** `.env.local` has `SQUARE_SANDBOX_ACCESS_TOKEN`,
  `CLOVER_SANDBOX_API_TOKEN`, `CLOVER_SANDBOX_MERCHANT_ID`, `POS_TOKEN_KEY`, `SESSION_SECRET`,
  `NEXT_PUBLIC_APP_URL`. **Missing:** `SQUARE_ENVIRONMENT`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`,
  `SQUARE_WEBHOOK_SIGNATURE_KEY`, `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`. Vercel envs not checked.

### 3. Decisions made (don't re-ask)

- Andrew, 2026-10-05: the Plan B phone check passed ("Everything was done properly"); proceed to Plan C Phase 2.
- **Deviation from plan §4 Phase 2 (mine): the coupon is claimed when the card is created, not on first spend.**
  `openSquareGiftCard` runs ledger row → **prepare** (CreateGiftCard DIGITAL = PENDING, $0, worthless) →
  **claim** (`redeem_challenge_prize`, `p_method 'pos_square'`) → **fund** (ACTIVATE) → **show**. Reasons:
  1. The guest-confirm path still exists for the same coupon. Claiming through the one once-only RPC *between*
     create and fund means exactly one of {staff discount, funded card} can happen. The loser leaves only a $0
     card. The plan's version (claim on the webhook's first REDEEM) left a window for both, and closing it would
     have needed a new RPC + migration (`db push`).
  2. The RPC refuses expired coupons, so under the plan's version a card spent after the coupon's expiry date
     could never be recorded, and the wallet would hide a still-valid card as "expired".
  The webhook keeps the RPC call only as a logged backstop (`webhook-redeem-on-unclaimed-coupon`), which should
  never fire. **Phase 5 reporting must read "redeemed via pos_square" as "converted to a Square card"**; the spend
  facts are on the ledger row (`external_detail.first_redeemed_at`, `balance_cents`, `last_activity_*`).
- **Adapter contract change:** `PosAdapter.prepareReward?` (optional) + `PosApplyInput.preparedRef`
  (`lib/pos/types.ts`). Prepare must create nothing of value. Clover (Phase 3) may skip it. Clover's own ordering
  problem (discount first, then RPC: plan says "If the Clover call fails, nothing is marked redeemed") is
  Phase 3's to solve. Consider the same claim-between pattern, or a reverse on a lost claim.
- **Square `reverse` is deliberately unsupported** (returns `invalid`): Hightop never claws back a card a guest
  holds. The partner deactivates it in Square Dashboard.
- **No `CUSTOMERS_READ` scope.** Scopes: `MERCHANT_PROFILE_READ GIFTCARDS_READ GIFTCARDS_WRITE`.
- **Lazy refresh window = 7 days before expiry** (Square advises renewing weekly; access tokens last 30 days;
  code-flow refresh tokens don't expire and are reusable, so concurrent refreshes are harmless). No cron.
- **Barcode:** Square's API returns no barcode image, and Square's own eGift barcodes are documented only as
  "scannable with an attached barcode scanner". So the coupon shows the GAN large (staff type it under
  "Gift card → manual entry") **plus** a self-drawn Code 128 (set C) of the bare GAN. A keyboard-wedge scanner
  types exactly those digits. **Unverified on a real register** (§7).
- **Webhook is NOT flag-gated** (once a card exists its spending must be recorded even if the flag goes off). It
  answers 503 when `SQUARE_WEBHOOK_SIGNATURE_KEY` / URL is unset, 401 on a bad signature.
- **Environment isolation:** a `pos_connections` row whose `environment` ≠ the server's `SQUARE_ENVIRONMENT` is
  unusable (`loadSquareCredentials` → `needs_attention`, wallet ignores it, sheet shows "Reconnect needed"). This
  matters because local testing writes **sandbox** rows into the **production** database.
- Presence gate: `/api/prizes/square-gift-card` calls `maybeRequireActiveVenuePresence` exactly like
  "Confirm Redemption" (also on later "Show gift card" opens).
- Square API version pinned to **`2025-01-23`** (`SQUARE_API_VERSION`); the spike script sends the same header,
  and its 2026-10-05 run passed with it.
- Plan §6 decisions 2 (who funds) and 3 (cap required) remain **pending**; nothing in Phase 2 depends on them.

### 4. Files created / changed

**New**
- `lib/pos/squareConfig.ts` (server-only): **the only reader of `SQUARE_*`** (test-pinned). `squareAppConfig()`
  (null unless `SQUARE_ENVIRONMENT` ∈ sandbox|production + id + secret), `isSquareConfigured()`,
  `squareApiBase(env)`, `squareWebhookConfig()` (key + notification URL; URL defaults to
  `${NEXT_PUBLIC_APP_URL}/api/webhooks/square`, override `SQUARE_WEBHOOK_NOTIFICATION_URL`), `SQUARE_API_VERSION`,
  `SQUARE_OAUTH_SCOPES`.
- `lib/pos/square.ts` (server-only): plain-`fetch` REST client (no SDK — 7 endpoints didn't justify it), 10 s
  timeout, failure → `PosFailure` codes (401/403 unauthorized, 404 not_found, 429 rate_limited↻, 5xx
  provider_error↻, network↻, else invalid). OAuth: `squareAuthorizeUrl`, `exchangeSquareCode`,
  `refreshSquareAccessToken`, `revokeSquareToken` (`Authorization: Client <secret>`). Data:
  `retrieveSquareMerchant`, `listSquareLocations` (ACTIVE only), `retrieveSquareGiftCard`. `squareAdapter`:
  `prepareReward` (create, key `<ledgerKey>:create`), `applyReward` (ACTIVATE, key `<ledgerKey>:activate`,
  `buyer_payment_instrument_ids: ["hightop-challenge-prize"]`, `reference_id` = redemption id; on an
  `invalid` answer it re-reads the card and treats ACTIVE as success), `reverse` (refuses),
  `describeConnection`.
- `lib/pos/oauthState.ts` (server-only): signed (HMAC, `pos-oauth-state:` + `SESSION_SECRET`), bound
  (owner/venue/provider), single-use (nonce must equal the `tp_pos_oauth` cookie, `Path=/api/owner/pos`,
  HttpOnly, Lax, 10 min) OAuth state. No DB table. Reusable for Clover (`provider` field).
- `lib/pos/squareConnection.ts` (server-only): the only place besides `crypto.ts` that touches token columns.
  `saveSquareConnection` (updates the live row or inserts), `loadSquareCredentials` (status / environment /
  location checks, decrypt, lazy refresh, refusal → row `error`), `loadSquareTokenForSetup` (for the location
  picker), `setSquareLocation`, `disconnectSquare` (revoke at Square best-effort, then `status='revoked'`,
  `access_token_enc='revoked'`, `refresh_token_enc=null`).
- `lib/pos/squareGiftCards.ts` (server-only): `openSquareGiftCard` (the 5-step flow, each step resumable;
  ledger key `"<redemptionId>:square:apply"` via `squareApplyKey`), `attachSquareGiftCardStates` (wallet tags
  `available|issued|used`; zero queries with the flag off or no gift-card coupon, else 1 connection read + 1
  ledger read). Amount = the redemption's award-time snapshot `prize_gift_certificate_amount` (falls back to the
  live campaign only when the snapshot is null) through `prizePosValueCents`.
- `lib/pos/squareWebhook.ts` (server-only): `verifySquareSignature` (base64 HMAC-SHA256 of URL + raw body,
  constant-time), `recordSquareGiftCardActivity` (lookup ledger by `(provider, external_ref)` index; unmatched
  = partner's own gift cards → no-op; stale/duplicate events skipped; REDEEM backstop claim).
- `lib/pos/squareRoutes.ts` (server-only): `redirectToPosSheet` → `/owner/dashboard?sheet=pos&posResult=…`
  (`connected|choose_location|denied|expired|no_location|not_configured|error`).
- `lib/pos/code128.ts` (client-safe): Code 128 encoder (`code128Values`, `code128Modules`, table test-pinned).
- Routes: `app/api/owner/pos/square/connect/route.ts` (GET), `…/callback/route.ts` (GET; state verified and
  bound **before** the code exchange; cookie cleared on every outcome), `…/disconnect/route.ts` (POST),
  `…/locations/route.ts` (GET list / POST choose — POST re-lists from Square and refuses foreign ids),
  `app/api/prizes/square-gift-card/route.ts` (POST; session-bound; `Cache-Control: no-store`; codes →
  404/409/410/502/503), `app/api/webhooks/square/route.ts` (POST, `runtime = "nodejs"`).
- UI: `components/prizes/SquareGiftCardPanel.tsx` (offer → create → number + barcode + balance inside the live
  frame; issued cards load straight away; "Redeem the normal way"; Try again), `components/prizes/Code128Barcode.tsx`.
- Tests: `tests/lib.pos-square.test.ts` (17), `tests/lib.pos-square-gift-cards.test.ts` (19, in-memory
  PostgREST fake), `tests/api.square-routes.test.ts` (15), `tests/components.square-gift-card-ui.test.ts` (9).

**Changed**
- `lib/pos/types.ts`: `prepareReward?`, `PosPrepareInput`, `PosApplyInput.preparedRef`, `PosConnectionStatus.needsLocation?`.
- `lib/pos/registry.ts`: registers `square: squareAdapter`. `lib/pos/providers.ts`: Square `availability: "available"`.
- `lib/pos/connections.ts`: select list now `provider, status, merchant_name, connected_at, location_id, environment`
  (non-secret; the ids never leave the server); a provider shows "Coming soon" unless built **and** configured on
  this server (`isConnectable`); wrong-environment Square rows → `needs_attention`; `needsLocation` computed.
- `tests/lib.pos-foundation.test.ts`: select-list pin updated (deliberate; still forbids `token_enc` / `merchant_id`).
- `types/index.ts`: `ChallengeCampaignWin.squareGiftCard?`, `SquareGiftCardState`.
- `app/api/challenge-campaigns/redeem/route.ts` (wallet GET): chains `attachSquareGiftCardStates`.
- `components/prizes/PrizeWalletPanel.tsx`: gift-card coupon shows **Show gift card** (issued) / **Used**;
  issued cards survive the coupon's expiry filter; `RedeemModal` opens on the Square panel when
  `win.squareGiftCard` is set, with a "normal way" fallback; the live frame is a shared `frame()` helper.
- `components/owner/pos/PosConnectionsSheet.tsx`: `posResult` banner (`POS_RESULT_MESSAGES`), Square location
  picker, two-tap Disconnect, Reconnect link for `needs_attention`, the "menu-item prizes keep the normal coupon"
  note. `app/owner/dashboard/page.tsx`: `PosSheetHost` passes `useSearchParams().get("posResult")`.
- `scripts/pos-sandbox-spike.cjs`: sends `Square-Version: 2025-01-23`.
- Docs: `CLAUDE.md` (POS section: Square bullets), `SYSTEM_CONTEXT.md` (prize-flow lines), the plan's status
  line + an "As built" note under Phase 2, the roadmap (B3 phone check passed; C2 built), Plan B's status line.

### 5. Facts and traps

- **Square sandbox facts confirmed 2026-10-05** (spike + my adapter against the sandbox; seller "Default Test
  Account", merchant `MLKKVTJ5TKJD2`, location `LEVMVX0YN1ES4`): DIGITAL card creates as `PENDING`, balance 0,
  GAN 16 digits; ACTIVATE works without the Orders API; same create key → same card; **re-sending the ACTIVATE
  with the same key returned an error (not an idempotent replay)**, which my recovery path turned into success
  with the balance still $25 (no double funding). A new key on an active card behaves the same way. A `REDEEM`
  activity carries `gift_card_balance_money` (remaining) and `redeem_activity_details.amount_money`,
  `created_at` has 1-second resolution, and **the activity object includes `gift_card_gan`**: never log a raw
  webhook body. About six $1 to $25 test cards now exist in that sandbox account. Harmless.
- **Webhook signature uses the EXACT notification URL** configured on the Square subscription. A
  trailing-slash or host mismatch (apex vs `www`, preview host) = every event 401s. Preview deploys need
  `SQUARE_WEBHOOK_NOTIFICATION_URL` set to the preview URL and a matching subscription.
- **Redirect URL** is set in the Square Developer Console (code flow sends no `redirect_uri`). Sandbox allows
  `http://localhost:3000/...`; production needs `https://hightopchallenge.com/api/owner/pos/square/callback`.
  The owner surface stays on the apex after the domain split, so that URL survives it.
- The owner session cookie is `SameSite=Lax`, so it **is** sent on Square's top-level redirect back. The callback
  needs it (`requireOwnerAuth`).
- **Local dev = production database** (`.env.local` → project `pkmxupsayzshvpirkaav`). Connecting a sandbox
  seller locally writes a real `pos_connections` row (environment `sandbox`) on that venue. Production ignores it
  (flag off; and the environment guard if the flag is ever on with production keys). **Disconnect it in the sheet
  after testing** (marks it `revoked`, wipes tokens).
- **Auto-mode classifier misfires seen this session:** it denied (a) the production `delete` of the Plan B test
  rows ("Cloud Storage Mass Delete"), (b) a read-only `fetch` probe of Square `/v2/locations` with several
  `Square-Version` values (labelled "Mass Delete"), and (c) a plain `grep` for `resolveRewardPrize` ("Modify
  Shared Resources"). (b) and (c) look like false positives. I didn't retry any of them. For (c) I avoided the
  need by deriving the gift-card check locally (`isGiftCardKind` in `squareGiftCards.ts`). If you want the
  shared helper, it is imported at the top of `lib/challengeCampaigns.ts`.
- tsx scripts that import repo modules: static `import { x } from "@/lib/..."` failed with "does not provide an
  export named"; **`const { x } = await import("@/lib/...")` works**. Run with
  `TSX_TSCONFIG_PATH=tsconfig.json node --env-file=.env.local --conditions react-server --import tsx file.mts`.
- `.env.local` rules: append-only with `>>`; read names with
  `node --env-file=.env.local -e "console.log(Object.keys(process.env).filter(k=>/SQUARE|POS_/.test(k)))"`
  (`cut` on the file is hook-denied).
- A disconnected (or reconnected-to-another-account) venue can't show cards already issued: retrieval needs the
  issuing merchant's token. The card still works at the register. Reconnecting the **same** Square account
  restores "Show gift card". A venue **deletion** cascades its connection rows without revoking at Square.
  Acceptable; the partner can remove the app in Square Dashboard.
- If funding keeps failing after the claim, the coupon is "redeemed" (pos_square) with a $0 card until Square
  recovers. Every later tap retries the fund (idempotent). There is no un-claim RPC; support case only.
- `attachSquareGiftCardStates` may briefly show "issued" for a coupon whose create succeeded but which lost the
  claim to guest-confirm (ledger not yet marked failed). Opening it then returns `already_redeemed`, and the
  wallet closes and refreshes. Cosmetic.
- Do not run `npx tsc --noEmit` and `npm run build` at the same time.

### 6. Build / run / test: what was verified

Run 2026-10-05 after the last code edit:
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the standing `lib/sportsBingo.ts` Babel size note).
- `npm run test`: **300 files passed / 1 skipped; 3,334 tests passed / 13 skipped / 0 failed.**
- `npm run build`: success, 187 pages; lists `/api/owner/pos/square/{connect,callback,disconnect,locations}`,
  `/api/prizes/square-gift-card`, `/api/webhooks/square`.
- `npm run pos:spike -- square`: all ✓ with `Square-Version 2025-01-23`.
- My adapter against the sandbox (script deleted from the scratchpad, reproducible): prepare → replay → fund →
  replay → recovery → read back → describeConnection, all as expected (§5).

**Not verified:** the OAuth connect/callback against Square (no app id/secret yet); the wallet UI in a real
browser/phone; a webhook delivery from Square; the barcode on a real Square register scanner; `npm run
pos:spike -- clover` (Phase 3's job). The Point of Sale sheet and wallet were verified only in jsdom.

### 7. Open questions for Andrew

1. Square sandbox app id + secret + Redirect URL (the steps in his section): blocks §8.
2. Delete the Plan B test coupon (his section, step 1), or keep it one more day to use in §8.
3. Commit + deploy: Plan B now; Plan C 1–2 in the same push?
4. Plan §6 decisions 2 and 3 (still pending, non-blocking).
5. Before any real partner: production Square app (keys, Redirect URL, webhook subscription to
   `gift_card.activity.created` at `https://hightopchallenge.com/api/webhooks/square`), and `POS_TOKEN_KEY` in
   Vercel production (copy kept in a password manager: losing it forces every venue to reconnect).
6. Does any partner venue's Square register have a barcode scanner? (Decides whether the barcode matters.)

### 8. Recommended first steps (Opus 5.5, high, same as the plan)

1. Confirm Andrew added `SQUARE_ENVIRONMENT=sandbox`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`,
   `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED=true` (names only). Restart `npm run dev` after env changes.
2. **Local OAuth run:** Andrew signs into `/owner/dashboard` locally as a partner of a test venue → menu → Point
   of Sale → Square **Connect** → Square sandbox consent (he must be logged into the sandbox seller "Default Test
   Account" via the Developer Console's "Open in Square Dashboard" first, or Square shows a login) → back on the
   sheet with "Square is connected". Check the row:
   `supabase db query --linked "select venue_id, environment, status, location_id is not null as has_location, merchant_name from pos_connections"`.
3. **Guest run:** a gift-card coupon for a test account at that venue (the Plan B test coupon if not yet deleted
   is exactly that, for Andrew at `brunswick-grove`; otherwise seed one with Andrew's OK). Open `/redeem-prizes`
   → Redeem → **Get my Square gift card** → number + barcode + "$25.00 left". Verify ledger
   `status='succeeded'`, `external_ref` like `gftc:%`, and the coupon `redeemed_method='pos_square'`.
4. **Spend + webhook:** needs a preview deploy (`vercel deploy` without `--prod`; it was classifier-denied on
   2026-10-05, so Andrew runs it or explicitly OKs it). Set Preview env vars (`vercel env add … preview`):
   the four above + `POS_TOKEN_KEY` + `SQUARE_WEBHOOK_SIGNATURE_KEY` + `SQUARE_WEBHOOK_NOTIFICATION_URL=<preview
   URL>/api/webhooks/square`; subscribe the sandbox app to `gift_card.activity.created` at that URL; add the
   preview callback as an extra Redirect URL. Spend part of the card (sandbox Dashboard, or the API REDEEM call
   in this handoff's §5 shape) → check `external_detail.balance_cents` dropped and the wallet shows the new
   balance; spend the rest → wallet shows **Used**.
5. **Disconnect** the sandbox connection in the sheet afterwards (prod DB hygiene, §5).
6. Then Phase 3 (Clover): ask Andrew the staff-screen question first; run `npm run pos:spike -- clover`
   (credentials are already in `.env.local`); reuse `lib/pos/oauthState.ts`; serialise Clover's single-use
   refresh tokens (Phase 1 handoff §5).
7. End with `docs/pos-rewards-integration-plan_PHASE_3_HANDOFF.md` (or a Phase 2b note if you only finish §8) and
   update the plan's status line.
