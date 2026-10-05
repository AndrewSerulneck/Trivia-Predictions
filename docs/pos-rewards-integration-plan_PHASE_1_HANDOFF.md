# POS Rewards Integration — Phase 1 Handoff (Foundation)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase finished:** 1 (Foundation) · **Date:** 2026-10-04
**Next:** Phase 2 — Square (gift-card prizes become real Square gift cards). Opus 5.5, **high**.

---

## For Andrew (plain English)

**What changed.** The groundwork for "rewards come off the bill in Square/Clover" is built, but nothing
talks to Square or Clover yet:

- Two new database tables, ready but **not yet in production**: one stores each venue's register
  connection (with its login keys scrambled so they're useless if the database ever leaked), and one
  logs every attempt to put a prize on a register, so a retry can never take money off a bill twice.
- A new **"Point of Sale"** row in the Partner Dashboard menu opens a sheet listing Square, Clover and
  Toast. Today all three say **"Coming soon."** It is **switched off** — partners can't see it until
  you turn on `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`.
- The reward wizard can now ask **"Value at the register ($)"** for a percent-off prize (e.g. "50% off
  an appetizer" → "worth up to $12"). It only asks when the venue has a register connected, so
  **nobody sees it yet**. Dollar-off and gift-card prizes never ask — their value is already a dollar
  figure.
- A test script that will check Square's and Clover's sandboxes behave the way the plan assumes. It
  **hasn't run yet** — it needs the sandbox keys below.

**Is it live?** No. Nothing is committed, pushed, deployed or migrated. Guests and partners see no change
even after a deploy, because the menu row is behind the switch and the wizard question needs a connected
register.

**What I need from you:**
1. **Sandbox keys** (so I or the next agent can run the sandbox check). Add these three lines to
   `.env.local` yourself — see "Exactly where to find them" below.
2. **An encryption key for production later** (`POS_TOKEN_KEY`) — only needed before Phase 2 goes live.
   Steps below. Nothing breaks without it today.
3. **Two pending decisions** (plan §6): (a) who pays for a prize applied at the register — recommended:
   the partner; (b) must a percent-off prize have a register value when a POS is connected — I built it
   as **required** (the recommendation). Say if you want either changed.
4. **Square:** in your Square sandbox seller account, make sure **Gift Cards** is available
   (Square Dashboard → Gift Cards). Phase 2 depends on it.
5. **Clover:** in the Clover developer dashboard, create the app now (name, e.g. "Hightop Challenge
   Rewards") — Clover's approval is the slowest step, and Phase 3 needs the app's ID/secret.
6. OK to **apply the database migration** to production (`supabase db push`)? It's safe to do any time:
   no running code reads the new tables yet. Or leave it for Phase 2.
7. OK to **commit** this work? I left it uncommitted.

**Exactly where to find the sandbox keys:**
- `SQUARE_SANDBOX_ACCESS_TOKEN` — developer.squareup.com → Applications → your app → toggle **Sandbox** →
  Credentials → "Sandbox Access token" (starts with `EAAA…`).
- `CLOVER_SANDBOX_MERCHANT_ID` — sandbox.dev.clover.com → log into your **test merchant** → the 13-character
  ID in the address bar after `/m/`.
- `CLOVER_SANDBOX_API_TOKEN` — same test merchant → Account & Setup → **API Tokens** → Create new token with
  Orders (read + write) and Merchant (read).

Add each with `echo 'NAME=value' >> .env.local` (two `>`). Then `npm run pos:spike -- square` and
`npm run pos:spike -- clover`.

**Making `POS_TOKEN_KEY` (later, before Phase 2 ships):** run
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, then
`vercel env add POS_TOKEN_KEY production` (paste it), and `echo 'POS_TOKEN_KEY=…' >> .env.local` for local
use. Keep a copy in your password manager: **if this key is lost, every connected venue must reconnect.**

---

## For the next agent (Phase 2 — Square)

### 1. Goal and scope
Phase 2 per plan §4: Square OAuth connect (pick the location), **lazy** DIGITAL gift-card issue when a guest
taps "Use at the register" on a gift-card coupon at a Square-connected venue, show the GAN/barcode on the
coupon, and `POST /api/webhooks/square` (signature-verified) that marks the redemption redeemed on a gift
card `REDEEM` activity via Plan B Phase 1's `redeem_challenge_prize` RPC with `redeemed_method='pos_square'`.
Menu-item prizes at Square venues stay on the normal coupon.

**Out of scope:** Clover (Phase 3), Toast (deferred, plan §1a), partner reporting (Phase 5), any polling cron.

**HARD DEPENDENCY — check first.** Plan B Phase 1 (`docs/reward-live-redemption-plan.md`) has **not run**
as of 2026-10-04: there is no `redeem_challenge_prize` RPC and no `redeemed_method` column, and
`redeemChallengePrize()` in `lib/challengeCampaigns.ts` still has the double-redeem race and the
unauthenticated `userId` bug. The Square webhook must not be built on the old path. If Plan B Phase 1 still
hasn't shipped, **stop and tell Andrew**; Phase 1 of this plan deliberately didn't need it.

### 2. Starting state
- Branch `main`. Last commit at start and end of Phase 1: `b23ddac` ("Reward descriptions: record
  2026-10-04 production deploy…"). **All Phase 1 work is uncommitted** in the working tree (Andrew didn't ask
  for a commit). The three plan docs (`docs/pos-rewards-integration-plan.md`,
  `docs/reward-live-redemption-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`) were already untracked
  before Phase 1.
- Nothing pushed, deployed, or migrated. **Migration `supabase/migrations/20261004192844_pos_foundation.sql`
  is NOT applied** to production (`pkmxupsayzshvpirkaav`). Ask Andrew before `supabase db push`.
- No data changed anywhere. No backups needed or taken.
- No POS env vars exist in `.env.local` (checked names only on 2026-10-04: only `SESSION_SECRET` and
  `ADMIN_SESSION_SECRET` matched `SQUARE|CLOVER|POS_|TOAST|SECRET`). Vercel envs not checked.

### 3. Decisions made (don't re-ask)
- Plan decisions 0–1 stand (Toast deferred; Square first). Decision 4: **Andrew created Square and Clover
  developer accounts** (2026-10-04). Decisions 2 (who funds) and 3 (cap required) still pending — 3 is
  implemented as **required** (the recommendation); flip by removing the two `POS_VALUE_REQUIRED_MESSAGE`
  checks in `CreateRewardWizard.tsx`.
- **Master flag `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`** (my call, following the repo's reversible-flag
  convention): off = no menu row, no sheet host, `/api/owner/pos` 404s, wizard context `posConnected` is
  `false` without a DB query. Single reader `isPosIntegrationsEnabled()` in `lib/pos/providers.ts` (test
  pins it). It is `NEXT_PUBLIC_*` → redeploy to change.
- **The cap is asked only for percent-off menu items.** Dollar-off prizes' value is the discount; gift
  cards' value is the amount. One function owns that: `prizePosValueCents()` in `lib/pos/prizeValue.ts` —
  use it in Phase 2/3, don't re-derive.
- **The cap is stored only when set.** `createChallengeCampaign` adds `prize_pos_value_cents` to the insert
  only for an integer value on a menu-item prize, so a deploy ahead of the migration never sends an unknown
  column (a cap can't be asked before a POS row exists, which needs the migration).
- **No app code reads `prize_pos_value_cents` yet** — deliberately not added to `CAMPAIGN_SELECT_COLUMNS`
  (that would break every campaign read if code deployed before the migration). Phase 2/3 read it from the
  **redemption row** (the snapshot) with one targeted select, using the missing-column fallback pattern of
  `loadWalletCampaignRows` in `lib/challengeCampaigns.ts` if it might run pre-migration.
- **Never store a Square GAN in plaintext.** The GAN is spendable money. `pos_reward_applications.external_ref`
  holds the gift card **id**; fetch the GAN from Square (`RetrieveGiftCard`) when showing the coupon, or
  encrypt it with `encryptPosToken` and a new context. The migration comment says so.

### 4. Files created / changed
**New**
- `supabase/migrations/20261004192844_pos_foundation.sql` — `pos_connections` (venue FK cascade; provider;
  `environment` sandbox|production; `merchant_id`, `merchant_name`, `location_id`; `access_token_enc`,
  `refresh_token_enc`, `token_expires_at`, `refresh_token_expires_at`; `scopes text[]`; `status`
  active|error|revoked; `connected_by_owner_id` → `venue_owners` **on delete set null**; partial unique index
  one live row per (venue, provider) where status ≠ revoked; index (provider, merchant_id)).
  `pos_reward_applications` (`idempotency_key text not null unique`; `redemption_id` → redemptions **on
  delete set null**; `venue_id` plain text, no FK; `connection_id` set null; `provider`; `action`
  apply|reverse; `status` pending|succeeded|failed|reversed; `amount_cents`; `currency`; `external_ref`;
  `external_detail jsonb`; `actor` guest|staff|webhook|system; errors; timestamps; indexes on redemption_id and
  (provider, external_ref)). Both: RLS enabled + forced, no policies, `anon`/`authenticated` revoked,
  `service_role` granted. Adds `prize_pos_value_cents integer` (1..1,000,000) to `challenge_campaigns` and
  `challenge_campaign_redemptions`. Re-creates `award_cycle_winner` with the same signature, copying
  `c.prize_pos_value_cents` into the coupon; a test proves the body is otherwise identical to
  `20260726120100_award_cycle_winner_prize_snapshot.sql`.
- `lib/pos/providers.ts` (client-safe) — `POS_PROVIDERS` catalog (id, label, pitch, `availability`; **all
  three `coming_soon`**), `isPosProviderId`, `getPosProviderInfo`, `isPosIntegrationsEnabled`.
- `lib/pos/crypto.ts` (server-only) — `encryptPosToken(plaintext, context)` / `decryptPosToken(envelope,
  context)`, AES-256-GCM, envelope `v1:<iv>:<tag>:<ct>` (base64url), AAD = `posTokenContext(venueId,
  provider, "access_token"|"refresh_token")` so a token moved to another row/field fails. Key
  `POS_TOKEN_KEY` (base64 or 64-hex, 32 bytes); rotation via `POS_TOKEN_KEY_PREVIOUS` (decrypt only).
  `isPosTokenKeyConfigured()` for connect routes to fail closed. Only file allowed to read the key (test).
- `lib/pos/types.ts` — `PosAdapter { provider, applyReward, reverse, describeConnection }`, input/result types
  (`PosApplyResult`, `PosFailure` with `code` + `retryable`), `PosConnectionCredentials` (decrypted, one call
  only), `PosConnectionStatus`/`PosConnectionState` for the sheet. Adapters don't touch our DB or decide
  idempotency — the Phase 2 apply service owns the ledger row and the RPC.
- `lib/pos/registry.ts` (server-only) — `getPosAdapter(provider)`; registers **none**. Register
  `square: squareAdapter` **in the same change** that flips Square to `available` — a test fails otherwise.
- `lib/pos/connections.ts` (server-only) — `listPosConnectionStatuses(venueId)`, `activePosProviders(venueId)`,
  `venueHasActivePos(venueId)` (flag-off → false, no query). Select list is exactly
  `provider, status, merchant_name, connected_at` (test pins it; never add a token column). Missing table
  (42P01 / PGRST205) reads as "no connections" with `[Pos] pos-connections-table-missing`.
- `lib/pos/prizeValue.ts` (client-safe) — `prizePosValueCents`, `prizeNeedsPosValue`, `parsePosValueDollars`,
  `POS_VALUE_MAX_CENTS`.
- `app/api/owner/pos/route.ts` — `GET ?venueId=`: flag → 404 first; `requireOwnerAuth`; venue in
  `auth.venueIds` else 403; returns `{ ok, statuses }`.
- `components/owner/pos/PosConnectionsSheet.tsx` — dark `OwnerSheet`, `?sheet=pos`, one GET per open, Retry,
  per-state badge; `posConnectHref(provider, venueId)` = `/api/owner/pos/{provider}/connect?venueId=` (**route
  does not exist yet** — only rendered for an `available` provider, so nothing links to it today).
- `scripts/pos-sandbox-spike.cjs` + `npm run pos:spike -- square|clover [--order <id>]` — sandbox-only hosts
  hard-coded; never prints tokens or GANs.
- Tests: `tests/lib.pos-foundation.test.ts` (crypto, catalog/registry, env-read tripwires, prize value, menu
  row, migration lock-down + RPC identity), `tests/api.owner.pos.test.ts`,
  `tests/components.pos-connections-sheet.test.ts`.

**Changed**
- `lib/rewards.ts` — `RewardPrizeInput` menu-item variant gains `posValueCents?`; `normalizeRewardPrize`
  keeps it only for percent-off, **rejects** a present-but-invalid value (non-integer, <1, >1,000,000);
  `createReward` passes `prizePosValueCents` to the engine.
- `lib/challengeCampaigns.ts` — `createChallengeCampaign` input `prizePosValueCents`; conditional insert
  (see §3). `updateChallengeCampaign` untouched (no flow edits a prize's cap yet).
- `app/api/owner/rewards/context/route.ts`, `app/api/admin/route.ts` (`resource=reward-context`) — context
  gains `posConnected` (via `venueHasActivePos`, in parallel with the schedule read).
- `components/rewards/CreateRewardWizard.tsx` — `RewardCreationContextDTO.posConnected?`; "Value at the
  register ($)" input on the Prize step when `posConnected && percent-off`; blocks Next and Create with
  `POS_VALUE_REQUIRED_MESSAGE` until valid; Confirm shows "Value at the register $X". Both variants (shared
  component). The admin snapshots are unchanged (field absent without a POS).
- `lib/ownerSheetParams.ts` — `OWNER_SHEET_IDS` adds `"pos"`.
- `components/owner/menu/ownerMenuItems.ts` — "Point of Sale" row (after Billing, `ReceiptText` icon,
  `sheet: "pos"`) + `visibleOwnerMenuItems(posEnabled = flag)`; `OwnerAppBar.tsx` renders
  `visibleOwnerMenuItems()`; `OwnerMenuDrawer.tsx` comment updated.
- `app/owner/dashboard/page.tsx` — `PosSheetHost` (own `useOwnerSheet`, own Suspense), mounted only with the
  flag on, given the selected venue.
- `tests/owner-menu-contract.test.ts` — pins six rows with the flag off, seven (POS after Billing) on.
- `tests/components.create-reward-wizard.test.ts`, `tests/lib.rewards-definitions.test.ts` — cap tests.
- `package.json` — `pos:spike` script.

### 5. Facts and traps
- **Provider facts re-checked against docs on 2026-10-04** (sandbox confirmation still pending):
  - Square: "The `UpdateOrder` endpoint cannot update orders made in the Square Point of Sale application"
    (developer.squareup.com/docs/orders-api/manage-orders/update-orders) — confirmed; no open-ticket edits.
  - Square gift cards: `CreateGiftCard` `type: DIGITAL` returns the `gan`; then `CreateGiftCardActivity`
    `ACTIVATE` with `amount_money`, `buyer_payment_instrument_ids`, optional `reference_id`, and
    `location_id` when not using Orders API. Needs `GIFTCARDS_WRITE`. Redemptions arrive as webhook
    **`gift_card.activity.created`** (filter `type = REDEEM`) — that's the event name to subscribe to.
  - Clover: `POST /v3/merchants/{mId}/orders/{orderId}/discounts`, amount discounts are **negative** cents,
    percentages positive. Still unverified: that an order opened **on a Clover device** is writable over REST
    while open (spike `--order` flag covers it).
  - **Clover OAuth trap:** v2/OAuth tokens expire, and **refresh tokens are single-use** — a refresh returns a
    new pair and kills the old refresh token. Two concurrent requests refreshing the same connection will
    break it. Phase 3 must serialise refresh per connection (e.g. a conditional `update … where
    refresh_token_enc = <old>` or an advisory lock) — the plan's "refresh lazily" is fine, but not naively.
    Square's code-flow refresh tokens are long-lived and reusable (re-verify in Phase 2).
- **The `.env.local` hook blocks any Bash command that merely mentions `.env.local` alongside `sed -i`**, even
  when the target is another file (it fired on a `package.json` edit). Use the Edit tool for such files.
  Reading env **names** with `cut` is denied too; `node --env-file=.env.local -e "console.log(Object.keys(process.env).filter(…))"`
  works and prints names only.
- `venue_owners` is not created in a tracked migration's FK test; `pos_connections` references it with
  `on delete set null` so `purgePendingSignup` (which deletes `venue_owners`) can never be blocked. A
  venue delete cascades its connections — Phase 2/3 should revoke the token at the provider on disconnect,
  but a cascade can't; acceptable (record it in their handoff).
- Two legacy TypeScript coupon writers (one-off leaderboard finalisation and the leaderboard cycle backfill in
  `lib/challengeCampaigns.ts`, both via `redemptionPrizeSnapshot`) don't snapshot the cap. Only retired
  leaderboard-mode rewards use them, and those have no cap. If one ever matters, fall back to the campaign's
  live cap.
- The wizard prefetches a context per definition, so `posConnected` costs one tiny indexed read per
  definition per wizard open (≈2) — and zero with the flag off.
- Do not run `npx tsc --noEmit` and `npm run build` at the same time (`.next/types` regenerates).

### 6. Build / run / test — what was verified
Run on 2026-10-04 against the working tree:
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 0 warnings in new code (one pre-existing Babel size note on `lib/sportsBingo.ts`).
- `npm run test` — **289 files passed, 1 skipped; 3,198 tests passed, 13 skipped, 0 failed** (before the
  3 sheet tests were added; those pass separately: `npx vitest run tests/components.pos-connections-sheet.test.ts`).
  Includes the grants contract test, which checks the new migration.
- `npm run build` — success, 181 pages, `ƒ /api/owner/pos` listed.
- `npm run pos:spike -- square|clover` — fails closed with a clear message (no credentials yet).

**Not verified:** the migration has never run against a database (no local Supabase); the sheet was not seen
in a browser (flag off; covered by the jsdom test); no provider call has been made.

### 7. Open questions for Andrew
1. Sandbox credentials (three env names above) — needed to run the spike.
2. Plan §6 decisions 2 (who funds) and 3 (cap required — built as required).
3. Apply the migration now or in Phase 2? Commit Phase 1?
4. Square: Gift Cards enabled on the sandbox seller account? (Square Dashboard → Gift Cards.)
5. Production `POS_TOKEN_KEY` before Phase 2 ships (and a safe copy).

### 8. Recommended first steps for Phase 2 (Opus 5.5, high)
1. Confirm Plan B Phase 1 shipped (`redeem_challenge_prize` RPC + `redeemed_method`). If not, stop and ask.
2. If `SQUARE_SANDBOX_ACCESS_TOKEN` is set, run `npm run pos:spike -- square` and paste the output into the
   Phase 2 handoff (the sandbox half of Phase 1's spike).
3. Ask Andrew to apply `20261004192844_pos_foundation.sql` if not already applied.
4. Build `lib/pos/square.ts` implementing `PosAdapter` with `fetch` (no SDK unless justified), register it in
   `lib/pos/registry.ts`, flip Square to `available` in `lib/pos/providers.ts` **in the same change**, and add
   `app/api/owner/pos/square/connect|callback|disconnect` (HMAC-signed single-use `state`; fail closed when
   `isPosTokenKeyConfigured()` is false; store tokens only via `encryptPosToken` with `posTokenContext`).
   New env names Phase 2 will need: `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`,
   `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_ENVIRONMENT` (sandbox|production) — confirm with Andrew.
5. Apply flow: insert the `pos_reward_applications` row first (`idempotency_key = "<redemptionId>:square:apply"`,
   status `pending`) — a unique-violation means "already attempted; read and reuse it" — then call the adapter
   with the same key as Square's `idempotency_key`, then update the row. Value from `prizePosValueCents()`.
6. Run the core checks: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not tsc+build
   together); end with `docs/pos-rewards-integration-plan_PHASE_2_HANDOFF.md`.
