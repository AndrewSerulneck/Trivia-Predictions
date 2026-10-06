# POS Rewards Integration — Phase 2c Handoff (Square production hardening)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 2c · **Date:** 2026-10-06 · **By:** Claude Opus 5.5
**State:** **Done, uncommitted.** All 2c items are built and tested. The full gate passes, and the new
"Square access removed" handling was proven against Square's real sandbox with Andrew. Nothing is committed,
pushed or deployed to production. The production flag is still off. **Next:** Phase 2d (menu-item and %-off prizes
at the Square register), Opus 5.5 **high**. It starts with a question for Andrew.

---

## For Andrew (plain English)

**What changed.** The Square gift-card feature is now safer to switch on for real partners:
1. **Wrong-country Square accounts are turned away politely.** Our prizes are in US dollars. If a partner connects
   a Square account with no US location that uses dollars, we don't keep the connection, and the sheet explains why.
   As a final check, every new card's currency is verified before the guest's coupon is used up.
2. **If a partner removes our app inside Square**, Square now tells us. The connection flips to "Reconnect needed"
   straight away, instead of us finding out when the next guest's card fails. Tested for real today.
3. **One Square account for two venues is now safe.** Before, disconnecting one venue would have silently broken
   the other venue's gift cards, because Square cancels every connection for that account at once. Fixed.
4. **The "Get my Square gift card" button has a speed limit:** 30 taps per guest per hour and 300 per network per
   hour. Real guests never get near it.
5. **A new admin panel: "Stuck Square gift cards"** (Admin → Venues, at the bottom). It lists any card that got
   stuck half-way. If a guest's coupon was used up but their card never got money on it, there's a **Retry
   funding** button. It's normally empty.
6. **A dashboard warning.** If a venue's Square connection needs attention, partners see one amber line at the top
   of their dashboard with an "Open Point of Sale" link.

**Your answer (recorded):** every partner can connect Square once it's switched on (no pilot list).

**Is it live?** No. The code is on your laptop only (not committed). Production is unchanged. A test copy runs at
`hightop-square-sandbox.vercel.app` (test mode only).

**What you need to do next**
- **Nothing is urgent.** When you're ready, start a new session and say: **"Execute phase 2d of the POS plan."**
  The next agent will first ask you **how free-item and percent-off prizes should work at a Square register**:
  - (A) **Recommended.** A named discount on the partner's Square that staff tap. Partners must reconnect once to
    allow it.
  - (B) Turn those prizes into Square gift cards too.
  - (C) Leave them as the normal coupon.

  It will also ask two older questions: who pays for prizes (recommended: the partner), and whether free-item
  prizes need a dollar cap (recommended: yes).
- **Optional tidy-up, any time:** I added one more **Preview** setting in Vercel, `SQUARE_ENVIRONMENT=sandbox`. It
  only affects test copies. Keep it until Square testing ends (Phase 2h).
- Commit/push is your call. The next agent can commit when you say so.

---

## For the next agent

### 1. Next phase: goal and scope
**Phase 2d — menu-item and %-off prizes at the Square register** (plan §"Phase 2d"; Opus 5.5 **high**).
**Ask Andrew plan §6 item 12 first** (A named Square discount / B more gift cards / C plain coupon). Also settle
§6 items 2 (who funds) and 3 (dollar cap required). The build depends on these answers.
**Out of scope:** partner/staff copy (2e), reporting (2f), production keys/env/deploy (2g), Clover, Toast.

### 2. Starting state
- Branch `main`, last commit **`27f5eea`** (unchanged). **All 2c work is uncommitted.** Uncommitted from earlier
  sessions too: `CLAUDE.md`, `docs/reward-live-redemption-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `scripts/pos-sandbox-spike.cjs`, the Phase 2b/3/3a handoffs, and `clover-spike/` (27 MB, untracked, **not**
  git-ignored: don't `git add -A` it by accident). Nothing pushed. Production deploy unchanged.
- **Production DB (`pkmxupsayzshvpirkaav`):** no migration in 2c. `pos_connections` has **3 rows**, all
  `venue-pacific-street`, `sandbox`, merchant `MLKKVTJ5TKJD2`, all `status='revoked'` with tokens wiped (the 3rd
  is from the 2c live test, connected 2026-10-06 20:13:12Z). `pos_reward_applications`: 1 row, `succeeded` (the 2b
  card). The test coupon `643500aa-…` is used up (`pos_square`). The cleanup rules from the 2b handoff §2 still apply.
- **Vercel:** Preview env now has `SQUARE_ENVIRONMENT=sandbox` (added 2c), plus 2b's
  `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_NOTIFICATION_URL`. Preview deployment
  `dpl_CbZXcByfM6WTbYj1gkMDaqZNe25H` (`hightop-challenge-b28jtm2wr-…vercel.app`, built from the **2c working tree**,
  not a commit) is aliased to **`hightop-square-sandbox.vercel.app`**. Production env unchanged (no `POS_*`/`SQUARE_*`).
- Square sandbox webhook subscription `wbhk_f3e0ee82db9146278f91a2a6e413aecb` still targets the alias, events
  `gift_card.activity.created`, `.updated`, `oauth.authorization.revoked`.
- A `next dev` server (PID 78555, port 3000) from the 2b session is still running.

### 3. Decisions (don't re-ask)
- **Andrew, 2026-10-06:** §6 item 13 = **every partner** → `POS_SQUARE_PILOT_VENUE_IDS` was **not built**. Plan
  2g/2h mentions of it are moot. Ignore "widen the pilot gate".
- **Andrew, 2026-10-06:** OK for the preview deploy + `SQUARE_ENVIRONMENT=sandbox` Preview var + the live revoke
  test ("Full test, with me").
- **Mine, with reasons:**
  - **No migration / no stored currency column.** The plan said "save as `needs_attention`" and "use the stored
    currency". Instead: (a) at connect, an account with **no** eligible location is **not saved**; we revoke the
    grant (`discardSquareGrant`) and redirect `posResult=not_eligible`, because we shouldn't hold a token we can't
    use. (b) The **card's own currency** (Square returns `balance_money.currency` on the PENDING card; verified in
    the sandbox) is saved in the ledger's `external_detail.currency` and checked **before the claim**. That is
    stronger than a stored connection field, and it costs zero extra calls. `pos_connections.status` has no
    `needs_attention` value (CHECK allows `active|error|revoked`); the sheet maps `error` → "Reconnect needed".
  - **Eligible location = `currency === "USD" && country === "US"`** (`isSquareGiftCardLocation` in
    `lib/pos/square.ts`). It fails closed on missing fields. Square only operates USD in the US, so this is the
    whole intersection.
  - **Revoked webhook → `status='error'` (not `revoked`)**, tokens wiped, so the partner sees "Reconnect needed" plus
    the dashboard nudge. Matches only rows with `connected_at < revoked_at`, same merchant, same environment
    (`SQUARE_ENVIRONMENT`), not already revoked and not already wiped. One UPDATE, idempotent.
  - **Disconnect skips Square's RevokeToken when another venue is ACTIVE on the same merchant+environment.** Square
    docs: RevokeToken "revokes all of them, regardless of which token you specify". If that read fails, it also
    skips: a token left valid at Square is harmless once our copy is wiped.
  - **Rate limit buckets** live in `lib/rateLimit.ts` (`squareGiftCardUser` 30/h keyed on the user id only, via the
    new `ignoreIp` option; `squareGiftCardIp` 300/h). User first, then IP, same reasoning as `rateLimitSignupSubmit`.
    Existing bucket hashes are unchanged.
  - **Admin "Retry funding" only for `claimed_unfunded`** (coupon redeemed with `pos_square`, ledger has a card id,
    not succeeded). An admin can never turn a guest's untouched coupon into a Square card.
  - **Dashboard nudge** = new `posAttentionVenueIds` in `GET /api/owner/dashboard` (one indexed read for all the
    owner's venues; zero with the flag off; `.catch(() => [])` so it never fails the dashboard). No new HTTP request.
  - **`SQUARE_API_VERSION` stays `2025-01-23`.** Square changelogs through 2026-08-19 show nothing breaking for
    our 7 endpoints. The 2026-01-22 OAuth change is an optional `use_jwt` flag.

### 4. Files
**New:**
- `lib/pos/squareStuckClaims.ts`: `classifyStuckSquareClaim`, `listStuckSquareClaims` (not-succeeded, >15 min,
  newest 50; no card id/GAN/token returned), `retrySquareFunding(redemptionId)`.
- `components/admin/sections/PosStuckClaimsPanel.tsx`: mounted under `HiddenVenuesPanel` in `VenuesSection.tsx`.
- `tests/lib.pos-square-hardening.test.ts`: 16 tests (revoked webhook, shared-merchant disconnect, discard grant,
  nudge query, stuck claims + retry, rate-limit order/keys).

**Changed:**
- `lib/pos/square.ts`: 2xx with an empty body → retryable `provider_error`. `SquareLocation` gains
  `currency`/`country`, plus `isSquareGiftCardLocation`. `SquareGiftCard.currency`. `prepareReward` returns
  `detail.currency`. `applyReward` re-reads the card on any non-`unauthorized` failure (ACTIVE ⇒ success).
- `lib/pos/squareConfig.ts`: exports `squareEnvironment()` (`SQUARE_ENVIRONMENT` alone, for the webhook).
- `lib/pos/squareConnection.ts`: `otherActiveVenuesForMerchant` (private), shared-merchant guard in
  `disconnectSquare`, `markSquareMerchantRevoked`, `discardSquareGrant`.
- `lib/pos/squareWebhook.ts`: `recordSquareRevocation` (skips `no_merchant` / `no_environment` / `no_time`).
- `app/api/webhooks/square/route.ts`: `oauth.authorization.revoked` branch; one log line
  `[PosSquare] webhook-revoked {eventId, revokerType, changed}`.
- `lib/pos/squareGiftCards.ts`: `PRIZE_CURRENCY`, `preparedCardCurrency`, currency check between prepare and claim
  (non-USD → ledger `failed` `currency_not_supported:<CUR>`, `not_eligible`, nothing claimed).
- `app/api/owner/pos/square/callback/route.ts`: eligibility check, `not_eligible` result.
  `lib/pos/squareRoutes.ts`: adds `not_eligible`.
- `app/api/owner/pos/square/locations/route.ts`: GET returns `eligible` (not currency/country). POST refuses an
  ineligible location.
- `app/api/prizes/square-gift-card/route.ts`: `rateLimitSquareGiftCard` after the session binding, before
  presence/DB/Square work. 429 `rate_limited` / 503 `unavailable`, with `Retry-After`.
- `lib/rateLimit.ts`: two buckets, `ignoreIp` option, `rateLimitSquareGiftCard`.
- `lib/pos/connections.ts`: `venuesNeedingPosAttention(venueIds)`.
- `app/api/owner/dashboard/route.ts` + `app/owner/dashboard/page.tsx`: `posAttentionVenueIds` → `DashboardBody`
  prop `posNeedsAttention` → `DashboardNotice` ("Square needs reconnecting…", action opens `?sheet=pos`).
- `components/owner/pos/PosConnectionsSheet.tsx`: `not_eligible` message, greyed ineligible locations,
  `SQUARE_ATTENTION_TEXT` + Disconnect in the needs-attention state.
- `app/api/admin/route.ts`: GET `resource=pos-stuck-claims`. POST `{resource:"pos-stuck-claims", action:"retry",
  redemptionId}`.
- Tests updated: `tests/api.square-routes.test.ts`, `tests/lib.pos-square.test.ts` (squareStuckClaims added to the
  "never log a GAN" tripwire), `tests/lib.pos-square-gift-cards.test.ts`, `tests/api.owner.dashboard.test.ts`,
  `tests/app.owner-dashboard-one-round-trip.test.ts`, `tests/components.pos-connections-sheet.test.ts`.
- `docs/pos-rewards-integration-plan.md`: status line, 2c "as built" note, §6 item 13 answered.

### 5. Facts and traps
- **Square sandbox labels a RevokeToken-by-app as `revoker_type: "MERCHANT"`** (seen live). Don't rely on
  `revoker_type` to tell "partner removed us" from "we revoked".
- **RevokeToken accepts `merchant_id` instead of `access_token`** (with `Authorization: Client <secret>`). That's how
  the live test simulated "partner removed our app" without Andrew. Script:
  `scratchpad/revoke-merchant.cjs` (not in repo; ~15 lines; prints only status + `success`).
- Square sends nanosecond timestamps (`…00.246373287Z`). `Date.parse` handles them (ms precision).
- **Sandbox quirks seen again:** a 2xx with an empty body on CreateGiftCard (retry with the same key worked), and
  a 429 on ACTIVATE after several quick calls (the next run passed). The client now treats empty 2xx as retryable.
- **A Next.js page file can't export extra names**, so `POS_NUDGE_TEXT` in `app/owner/dashboard/page.tsx` is
  module-private.
- `rateLimitResponse()` says "Signup is temporarily unavailable…". The gift-card route builds its own response.
  Don't reuse it outside signup.
- **Flaky test (not ours):** `tests/lib.sportsBingo.nfl-star-tilt.test.ts` "puts stars on boards materially more
  often than chance" failed once in the full run, then passed 3/3 alone. It's a statistical test under load. Files untouched.
- Preview deploy recipe for an **uncommitted** tree (2b's used `git archive <sha>`):
  `git ls-files -co --exclude-standard | grep -v -E '^clover-spike/|^\.env' > list; tar -cf - -T list | tar -xf - -C <dir>`,
  copy `.vercel/repo.json` into `<dir>/.vercel/`, then `vercel deploy --yes --archive=tgz > log 2>&1` (background,
  ~3 min upload of 112 MB + ~1 min build), then `vercel alias set <url> hightop-square-sandbox.vercel.app`.
- `vercel env add NAME preview` piped from `printf` printed a confusing help/"already exists" output. The first call
  had succeeded. Verify with `vercel env ls preview`.
- `vercel logs <url>` returned nothing. The Vercel MCP `get_runtime_logs` (projectId `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`,
  teamId `team_uGVCpxcJGBQ1VdCDO0lSMRZf`, `deploymentId`, `query: "PosSquare"`) works.
- Live no-op checks of new queries: `node --env-file=.env.local --conditions react-server --import tsx <file under scripts/>`
  (the `@/` alias only resolves inside the repo; delete the temp file after).

### 6. Build / run / test: what was verified (2026-10-06)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run test` | 3,369 passed, 13 skipped, 1 failed: the unrelated star-tilt flake (passes 3/3 alone) |
| `npm run build` | OK, 187 pages |
| `npm run pos:spike -- square` (2025-01-23) | all ✓ (first run: one sandbox 429, rerun clean) |
| Sandbox probe | locations carry `country`/`currency`. PENDING card `balance_money.currency = "USD"` |
| Live DB no-ops | `markSquareMerchantRevoked` on all-revoked merchant → `changed:0`. `venuesNeedingPosAttention` → `[]`. `listStuckSquareClaims` → `[]` |
| Preview bad signature | 401 `{"error":"Invalid signature."}` (our handler, not Vercel protection) |
| **Live revoke (Andrew + agent)** | Andrew connected locally → row `active` (passed US/USD check, location auto-chosen). Agent ran RevokeToken by merchant id → Square webhook to preview within ~40 s → log `webhook-revoked {revokerType:'MERCHANT', changed:1}` → row `error`, both tokens wiped, `last_error` "Square access was removed…" |
| Partner sheet (Andrew) | Square showed the attention text + Reconnect (Andrew's paste). He then disconnected: all 3 rows `revoked`. The amber dashboard line was gone after reload |

**Not verified live:** the amber nudge's first appearance (Andrew reported only that it disappeared after the
disconnect; the page test covers its rendering), the admin panel in a browser (unit/route-tested only), a real
non-USD Square account (sandbox sellers are US), and the rate limiter against production Postgres (it reuses the
proven `claim_signup_attempt` RPC; only the hash input differs).
**Not run:** `npm run test:pwa-contract` / `test:god-mode-join` (no player-shell or join-flow changes).

### 7. Open questions for Andrew
1. §6 item 12 (2d's design): ask at 2d start. Items 2 and 3: settle in 2d. Item 14: ask at 2h.
2. Commit 2c? (He hasn't asked. Don't commit unprompted; `clover-spike/` must not be added.)

### 8. Recommended first steps for 2d (Opus 5.5, high)
1. Read this file, plan §"Phase 2d", `lib/pos/prizeValue.ts`, `components/rewards/CreateRewardWizard.tsx`
   (shared admin/owner, `posConnected`), `lib/pos/squareConfig.ts` (scopes).
2. Ask Andrew items 12, 2, 3 in one `AskUserQuestion`.
3. If (A): adding `ITEMS_READ ITEMS_WRITE` scopes means existing connections must re-consent. Store granted scopes
   (already in `pos_connections.scopes`) and show "Reconnect to enable menu prizes". Catalog calls happen per
   **connection**, not per redemption (cost note in the plan).
4. Keep the "never log a GAN/token" tripwire list up to date for any new file. Full gate at the end. Re-test on
   the preview with the recipe in §5 if the webhook or OAuth changes.
5. End with `docs/pos-rewards-integration-plan_PHASE_2d_HANDOFF.md` and update the plan status line.
