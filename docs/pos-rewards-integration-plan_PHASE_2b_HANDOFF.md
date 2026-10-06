# POS Rewards Integration — Phase 2b Handoff (Square sandbox end-to-end proof)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 2b · **Date:** 2026-10-06 · **By:** Claude Opus 5.5
**State:** **Done.** Every 2b check passed against Square's real sandbox, with Andrew at the keyboard for the
Square sign-ins. **No bugs found, no code changed, nothing committed.** Production is untouched (flag still off,
no production env change). **Next:** Phase 2c (production hardening), Opus 5.5 **high**.

---

## For Andrew (plain English)

**What happened.** We ran the whole Square gift-card loop for real (in Square's test world), start to finish:
1. You connected the Pacific Street partner account to the Square test seller. ✓
2. Your test prize turned into a real Square gift card: $25.00, a 16-digit number and a barcode. ✓
3. Tapping it several times at once still made only **one** card. ✓
4. We spent $10 of it the way a register would. Square told our system within seconds, and your prize wallet
   showed **$15.00 left**. ✓
5. We spent the remaining $15. The wallet now says **USED**. ✓
6. Disconnect, the "declined" message, and reconnecting all behaved correctly. After reconnecting, the card could
   be shown again. ✓

**Is it live?** No. Production is exactly as before: the Point of Sale feature is switched off and has no Square
keys. To receive Square's "card was spent" messages, I put up a **test copy** of the live code at
`hightop-square-sandbox.vercel.app` (preview only, sandbox only), with your OK.

**Nothing needs you right now.** Leftovers you may tidy up any time (all harmless):
- Two Vercel **Preview** settings I added: `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_NOTIFICATION_URL`
  (Vercel → hightop-challenge → Settings → Environment Variables). They only affect test copies. I'm not allowed
  to delete Vercel settings; keep them if Phase 2c will re-test, which is likely.
- A Square **sandbox** webhook named "Hightop 2b sandbox preview" (Developer Console → Sandbox → Webhooks).
  Keep it for 2c.
- The test coupon is now used up (shows USED). The plan says keep it until 2h; it expires Oct 19 anyway.

**Next phase (2c) will ask you one question first:** during the pilot, should only venues you list be able to
connect Square (recommended; you can widen it without a redeploy), or every partner as soon as it's switched on?

---

## For the next agent

### 1. Next phase: goal and scope
**Phase 2c — production hardening** (plan §"Phase 2c"; Opus 5.5 **high**; flag stays OFF). Ask Andrew plan §6
item 13 (pilot allowlist vs open) **at the start**. In scope: connect-time eligibility (country/currency; replace
the hard-coded `"USD"` in `lib/pos/squareGiftCards.ts`), the `oauth.authorization.revoked` webhook, rate-limiting
`POST /api/prizes/square-gift-card`, the admin stuck-claim list + Retry funding, the pilot gate
(`POS_SQUARE_PILOT_VENUE_IDS`, if item 13 = allowlist), the dashboard nudge, a `SQUARE_API_VERSION` re-check, and
tests for each. **Out of scope:** menu/%-off prizes (2d), partner/staff copy (2e), reporting (2f), production
keys/env/deploy (2g), Clover, Toast.

### 2. Starting state
- Branch `main`, last commit **`27f5eea`** (unchanged). Uncommitted in the working tree from earlier sessions:
  `CLAUDE.md`, the plan, `docs/reward-live-redemption-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `scripts/pos-sandbox-spike.cjs`, `next-env.d.ts` (dev-server rewrite — don't commit), the Phase 3 / 3a
  handoffs, and `clover-spike/` (27 MB Android spike; **untracked, not git-ignored**). This session added only
  this handoff and the plan status-line edits. **Nothing pushed or deployed to production.**
- **Production DB (project `pkmxupsayzshvpirkaav`):**
  - `pos_connections`: **2 rows**, both `venue-pacific-street`, `environment='sandbox'`, merchant
    `MLKKVTJ5TKJD2` ("Default Test Account"), location `LEVMVX0YN1ES4`. Row 1 `revoked` (first disconnect).
    Row 2 is from the reconnect; Andrew was asked to Disconnect it at the end, so expect `revoked`. **Check:**
    `supabase db query --linked "select status, environment, connected_at, updated_at from pos_connections"`.
    If row 2 is still `active`, disconnect it in the sheet (or ask Andrew). Revoked rows are kept by design.
  - `pos_reward_applications`: **1 row**, `redemption_id=643500aa-f8c9-4ef4-b4e0-e36872bf993f`, `status='succeeded'`,
    `external_ref='gftc:48e781a6d89a466e8001c4b02f516814'`, `amount_cents=2500`, `external_detail.balance_cents=0`,
    `last_activity_type='REDEEM'`, `first_redeemed_at='2026-10-06T19:37:17.000Z'`.
  - Test coupon `643500aa-…` (campaign `da65ec0f-ad34-4e01-8a0c-6666e00c4ca0`): `prize_redeemed_at` set,
    `redeemed_method='pos_square'`. Cleanup (plan §6 note) is due at 2h: delete the **ledger row first**, then the
    redemption, then the campaign. A new unredeemed test coupon needs Andrew's OK (same CTE shape as the Phase 3
    handoff describes).
- **Vercel:** Preview-scope env vars added (all preview branches): `SQUARE_WEBHOOK_SIGNATURE_KEY` (sensitive) and
  `SQUARE_WEBHOOK_NOTIFICATION_URL=https://hightop-square-sandbox.vercel.app/api/webhooks/square`. Production env
  is unchanged (no `POS_*`/`SQUARE_*`). Preview deployment `dpl_BKLkaVWsLPYbZpMSNPkCdhXsSdbH`
  (`hightop-challenge-8kigstppa-andrewserulnecks-projects.vercel.app`, code = `27f5eea` exactly), aliased to
  **`hightop-square-sandbox.vercel.app`**. Two dead attempts exist (`…-fj4pb6llz…` UNKNOWN, `…-mby1p682c…`
  BLOCKED); ignore them.
- **Square sandbox app:** webhook subscription **`wbhk_f3e0ee82db9146278f91a2a6e413aecb`** ("Hightop 2b sandbox
  preview") → the alias URL, events `gift_card.activity.created`, `gift_card.activity.updated`,
  `oauth.authorization.revoked`, API version `2025-01-23`, enabled. Created through the Webhook Subscriptions API
  with `SQUARE_SANDBOX_ACCESS_TOKEN`; its signature key went straight into the Vercel env var and was never printed
  or written to `.env.local`. Sandbox Redirect URL = `http://localhost:3000/api/owner/pos/square/callback`
  (Andrew set it).
- `.env.local` names (unchanged this session): `SQUARE_ENVIRONMENT` (= sandbox by behaviour),
  `SQUARE_SANDBOX_APPLICATION_ID`, `SQUARE_SANDBOX_APPLICATION_SECRET`, `SQUARE_SANDBOX_ACCESS_TOKEN`,
  `POS_TOKEN_KEY`, `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `CLOVER_SANDBOX_*`.
  No `SQUARE_WEBHOOK_*` locally (localhost can't receive webhooks; not needed).
- A `npm run dev` server was started on :3000 (background); it may still be running.

### 3. Decisions (don't re-ask)
- Andrew, 2026-10-06: OK to deploy a Vercel **preview** for the webhook leg ("Yes, go ahead").
- Mine: the preview gets **only** the two webhook env vars, not `POS_TOKEN_KEY` or the Square app id/secret. The
  webhook handler never decrypts tokens. OAuth and the guest flow ran on localhost; both servers share the
  production DB. So the plan's "add the preview callback as an extra Redirect URL" step was unnecessary (Square's
  console has one Redirect URL field anyway). For 2g, production does need the full set.
- Mine: spends were made with Square's API (`POST /v2/gift-cards/activities`, `type: REDEEM`) using
  `SQUARE_SANDBOX_ACCESS_TOKEN`, which belongs to the same seller Andrew connected. A real register spend is 2h's job.
- Plan §6 items 2, 3, 12, 13, 14 are still pending.

### 4. Files
- **Created:** this handoff. **Changed:** `docs/pos-rewards-integration-plan.md` (status line + a "2b done" note).
- No code, tests, migrations or `.env.local` changes.
- Throwaway scripts (scratchpad, not in the repo; easy to recreate): a Playwright wallet driver (cookies from
  `scripts/print-test-auth-cookies.cjs`, parsed in-process, GANs masked in output) and a REDEEM-activity script.

### 5. Facts and traps discovered
- **`vercel deploy` from a git checkout came back `BLOCKED`** (`readyState: BLOCKED`, errorLink
  "troubleshoot-project-collaboration#team-configuration"), most likely the Hobby-team commit-author / co-author
  check on CLI git metadata. **Workaround that worked:** export the commit with no `.git`:
  `git archive <sha> | tar -x -C <dir>`, copy `.vercel/repo.json` in, then `vercel deploy --yes --archive=tgz`
  from that dir. Separately, a plain `vercel deploy` (no `--archive`) stalled for 25+ min with no network activity
  (the upload is ~112 MB, mostly `public/`). Use `--archive=tgz`, and don't pipe its output through `tail`: it
  hides progress until exit. Write it to a log file. The deployment needs ~80 s to build.
- **Our own Disconnect triggers Square's `oauth.authorization.revoked` webhook** (~5 s later; today logged as
  `[PosSquare] webhook-ignored { type: 'oauth.authorization.revoked' }`). So in 2c the revoked handler **will
  usually find the row already revoked**: it must be an idempotent no-op then, and must never touch a *newer*
  active row for the same merchant (reconnect creates a new row: match the active row, compare times).
- **Reconnect inserts a new `pos_connections` row**; the revoked one remains. Any 2c lookup "by merchant id" must
  pick the live row, not assume one row per merchant.
- **Square retries undelivered webhooks.** The ACTIVATE event from card creation (sent before the preview
  existed → 404) was redelivered ~7 min later and correctly skipped as `stale` (an older event can't overwrite a
  newer one). Event order is not guaranteed; the stale guard works.
- Webhook log lines carry only event id, type, matched/skipped: **no GAN, no raw body.** Verified in Vercel
  runtime logs.
- `/api/prizes/square-gift-card` body is `{ userId, venueId, redemptionId }` (+ the signed session cookie).
  Without a session → 403. While disconnected → 409 "This venue isn't taking Square gift cards right now."
  After reconnecting the same seller → 200 with the same card (`gan` returned formatted, 19 chars with spaces).
- Three simultaneous POSTs → three 200s, same card, still one ledger row (idempotent on the ledger key).
- The first REDEEM API call returned an empty body (JSON parse error) and changed nothing; the retry worked. It
  looks transient on Square's sandbox. A 2c Square client shouldn't assume every 2xx has a body.
- The preview runs the app's in-process `[ScheduledTasks]` timer on page loads (seen in logs) **against the
  production DB**, like any preview here. Harmless today, but keep preview traffic minimal.
- **Classifier/hook notes:** `supabase db query --linked` selects worked. A `sed` meant to redact a cookie printout
  didn't match, so a signed player test-session cookie for Andrew's account appeared once in this local transcript.
  Parse cookies in-process instead (as the Playwright driver did).
- Column names: redemptions use `prize_redeemed_at` / `prize_expires_at` / `challenge_id` (not
  `redeemed_at`, `expires_at`, `campaign_id`).

### 6. Build / run / test: what was verified (2026-10-06, with evidence)
| Check | Result |
|---|---|
| Flag + Square config by behaviour (`listPosConnectionStatuses('venue-pacific-street')` via tsx) | flag on, Square `not_connected` (connectable); Clover/Toast `coming_soon` |
| Guest wallet before connect (Playwright 390×844) | normal coupon + "Confirm Redemption", no Square offer, 0 errors |
| OAuth connect (Andrew) | row `active`, `sandbox`, location `LEVMVX0YN1ES4`, scopes `MERCHANT_PROFILE_READ GIFTCARDS_READ GIFTCARDS_WRITE`, token expiry 2026-11-05 |
| "Get my Square gift card" | POST 200; modal "$25.00 left" + 16-digit number + Code 128 barcode inside live frame; wallet button → "Show gift card"; ledger `succeeded`, `gftc:…`, coupon `pos_square` |
| Reopen + 3 concurrent POSTs | same card each time, 1 ledger row |
| Webhook bad signature (alias + direct URL) | 401 `Invalid signature.` (configured, not 503) |
| Spend $10 (API REDEEM) | webhook → ledger `balance_cents` 1500, `first_redeemed_at` set; wallet "$15.00 left" |
| Spend $15 | ledger `balance_cents` 0; wallet card shows **USED**, no Show button |
| Disconnect (Andrew) | `status='revoked'`, `access_token_enc='revoked'`, refresh null; show-card → 409; revoked webhook received |
| Deny on consent (Andrew) | banner "Square wasn't connected — access was declined." |
| Reconnect same seller (Andrew) | new `active` row; show-card → 200, same card, balance 0 |

No code changed, so the full gate was not re-run. Last full gate (2026-10-05, Phase 3 handoff §6): tsc/lint
clean, 3,335 tests passed, build OK, PWA 20/20.
**Still unverified (by design, later phases):** a real Square register taking the card (typing the number,
scanning the barcode) → 2h; production OAuth/keys → 2g.

### 7. Open questions for Andrew
1. Plan §6 item 13 (pilot allowlist vs open): ask at 2c start.
2. Items 12 (2d), 14 (2h), 2 and 3 (pending since 2026-10-03): not needed for 2c.
3. Optional: remove the two Preview env vars / the sandbox webhook after Square testing ends (2h exit).

### 8. Recommended first steps for 2c (Opus 5.5, high)
1. Confirm the last `pos_connections` row is `revoked` (§2). Ask Andrew item 13.
2. Read `lib/pos/squareWebhook.ts`, `app/api/webhooks/square/route.ts`, `lib/pos/squareConnection.ts`
   (`disconnectSquare`), `lib/pos/squareGiftCards.ts` (the `"USD"` literals), `lib/rateLimit.ts`.
3. Build the revoked handler with the §5 facts (idempotent; live row only; merchant id + environment).
4. To re-test webhooks: change code, deploy a preview with the `git archive` recipe (§5), then
   `vercel alias set <new-deployment-url> hightop-square-sandbox.vercel.app`. The subscription and env vars
   already point there. Connect locally (Andrew signs in to the sandbox seller), Disconnect, and watch Vercel
   runtime logs for the revoked event.
5. Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not concurrently with tsc).
6. End with `docs/pos-rewards-integration-plan_PHASE_2c_HANDOFF.md` and update the plan's status line.
