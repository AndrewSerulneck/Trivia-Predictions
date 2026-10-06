# POS Rewards Integration — Plan C (Square and Clover; Toast deferred)

**Status:** Phases 1–2 **committed (`27f5eea`) and deployed to production 2026-10-05 with the switch OFF**
(`NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` unset in Vercel, so nobody sees it). Square sandbox app keys verified
2026-10-05; the browser run (connect → gift card → spend → webhook) still needs Andrew at the keyboard.
**Phase 3 (Clover) re-planned 2026-10-05 as a Clover register app** (Andrew: "Build the Clover register app now. A
scannable code on the coupon is OK."): sub-phases **3a–3f** below. **Phase 3a partly done 2026-10-06** (toolchain, test app, server-side token proof via
`billing_info` ✓); device checks **blocked** by Clover's broken GDE emulator sign-in → Dev Kit / Clover support
(handoff: `docs/pos-rewards-integration-plan_PHASE_3a_HANDOFF.md`). A throwaway $25 gift-card test coupon exists at `venue-pacific-street`
(§6 note). Clover handoff: `docs/pos-rewards-integration-plan_PHASE_3a_HANDOFF.md`.
**Phase 2 deviation:** the coupon is marked redeemed when it becomes a Square gift card, not on the first spend
(Phase 2 handoff §3).
**Re-ordered 2026-10-06 (Andrew): "Since I don't want to order a Clover dev kit, let's focus on becoming fully
functional in Square first, then we'll move on to Clover and Toast."** Clover (Phase 3) is **paused** after the
partial 3a. Next work is the Square track, **Phases 2b–2h** below (sandbox proof → hardening → menu-item prizes →
partner/staff instructions → reporting → production setup → real-money pilot). **Phase 2b DONE 2026-10-06**
(full sandbox loop passed: connect → card → spend → webhook → Used; no bugs, no code change). **Phase 2c BUILT
2026-10-06, uncommitted** (eligibility, revoked webhook proven live in the sandbox, rate limit, admin stuck-claim
list, dashboard nudge; no pilot gate per Andrew). **Phase 2d BUILT 2026-10-06, uncommitted** (menu-item prizes → one
ready-made Square discount per prize; register cap optional; partners reconnect once). **Next: 2e** (partner and
staff instructions). Latest handoff: `docs/pos-rewards-integration-plan_PHASE_2d_HANDOFF.md`.
(Written 2026-10-03.) **Scope decision 2026-10-03 (Andrew): Square and Clover
only. Toast is DEFERRED** — see §1a. Phase 0 (Andrew's business setup, §4) is partly done:
developer accounts exist; §6 decisions 2–3 are still open. **Square first** (Andrew, 2026-10-03). Phase 1 did not need
Plan B; **Phase 2 onward needs Plan B Phase 1** (the once-only redeem RPC). **Handoffs:** each phase ends with `docs/pos-rewards-integration-plan_PHASE_<N>_HANDOFF.md`
(global rule in `~/.claude/CLAUDE.md`). Update this status line to point at the latest handoff.
**Part of:** `docs/rewards-trust-and-pos-roadmap.md` (Plan C of three).

---

## 1. Summary (plain English, for Andrew)

Goal: when a guest wins a reward, the bar can take it off the guest's bill **inside their own
register**, with no manual math and a record on both sides.

The three systems are very different, so "apply to the check" means something different for each:

| POS | What we can really do | Guest / staff experience | Main blocker |
|---|---|---|---|
| **Toast** (deferred, §1a) | Plug into Toast's built-in **Rewards button** (Toast's loyalty integration). Toast asks *our* server what rewards a guest has; staff tap Redeem; it shows on the check as a discount. | Best of the three. Staff press Rewards on the Toast screen, scan the guest's live QR, tap Redeem. | **Toast must approve us as an integration partner** — an application and certification, prioritized by how many Toast restaurants ask for us. Can take months. |
| **Clover** | Our own small app on the Clover register adds a discount to the **open order** (re-planned 2026-10-05, Phase 3). | Staff open the guest's order, tap our app, scan the coupon's QR or type its code, tap Apply; the discount appears on the Clover check. No staff phones, no staff logins. | Clover must **approve our app** for the Clover App Market (demo video + review) before other merchants can install it. |
| **Square** | Square's API **cannot edit an open ticket rung up on the Square register.** It *can* create real **Square gift cards**. So gift-card prizes become real Square eGift cards the register accepts like any gift card. | Guest's coupon shows a Square gift card barcode; staff scan it as payment. Balance and redemption are automatic. Menu-item prizes (free appetizer) keep today's coupon flow. | Each partner must have Square Gift Cards turned on. Gift cards are a liability on the partner's books (they fund the prize anyway). |

Things to know up front:
- **Every connection is per venue.** Each partner clicks "Connect Square/Clover/Toast" in the
  Partner Dashboard and approves access in their POS account (standard OAuth).
- **"Free appetizer"-type prizes need a dollar cap** for POS use (registers discount money, not
  menu ideas). The reward wizard will ask "Up to how much?" when the partner has a POS connected.
- **Plan B Phase 1 comes first.** It makes "redeemed" a once-only database action, which the
  Square webhook relies on so a gift card can't be spent twice in our records.
- **If the POS is down or not connected,** the normal coupon (with Plan B's live motion) still
  works. Nothing gets worse.
- **Order:** Square (no approval gate, fastest) → Clover. If most partners use Clover, swap them —
  tell the agent in Phase 0. **2026-10-06: Square is finished to production first (Phases 2b–2h), then Clover
  resumes at 3a, then Toast.**

## 1a. Why Toast is deferred (Andrew, 2026-10-03 — decided, don't re-ask)

Toast can't realistically be built or tested without either passing its partner application or
working alongside a friendly Toast restaurant that grants developer access through its own
account. With no proof of concept yet, Toast is unlikely to approve us. Square and Clover have
open developer portals with no barrier to entry, so we build there first, prove the reward-to-check
flow with real partners, and only then apply to Toast's partner program with that evidence
(redemption counts, partner names, a demo). Phase 4 below is kept as a sketch for that day; no
agent should start it, and no Toast application is part of Phase 0.

---

## 2. Facts found while planning (verify in Phase 1; APIs change)

- **Square:** `UpdateOrder` cannot update orders created in the Square Point of Sale app; POS orders
  only become readable via API once paid. → no "apply to open check" on Square.
  Gift Cards API: create `DIGITAL` card, then `CreateGiftCardActivity` type `ACTIVATE` with
  `amount_money` + `buyer_payment_instrument_ids` (+ optional `reference_id`) when the purchase was
  not processed through Square's Orders API. Needs `GIFTCARDS_WRITE` (+ `CUSTOMERS_READ` to link a
  customer). Redemption at the register updates the balance automatically; gift card activity
  webhooks tell us it was used. Sources: developer.squareup.com/docs/orders-api/manage-orders/update-orders,
  developer.squareup.com/docs/gift-cards/using-gift-cards-api.
- **Clover:** REST v3 supports order-level and line-item discounts on orders
  (`/v3/merchants/{mId}/orders/{orderId}/discounts`; amount discounts are negative cents, percentages
  positive). Apps must pass Clover's approval (functional video, permissions, REST config, webhooks
  review) to be installable by other merchants. Sources: docs.clover.com/docs/working-with-orders,
  docs.clover.com/docs/developer-app-approval. **Must verify in the sandbox:** that orders opened on
  a Clover device are listable and writable via REST while still open (expected yes).
- **Toast:** Loyalty integration — Toast calls *our* HTTPS endpoints; staff find the guest's loyalty
  account (enter identifier, swipe, scan a QR, or search), Toast shows available rewards with a
  Redeem button, reward appears as a negative amount (check- or item-level). Accrual is async after
  payment. Not supported during the location's internet outages. Access only through the Toast
  Partner Integrations program (application → certification → scoped API access; demand-prioritized).
  Sources: doc.toasttab.com/doc/devguide/apiLoyaltyProgramIntegrationOverview.html,
  pos.toasttab.com/partners/integration-partner-application.
- Our side today: prizes are `challenge_campaign_redemptions` rows (prize snapshot columns:
  `prize_kind`, `prize_menu_item`, `prize_discount_kind`, `prize_discount_value`,
  `prize_gift_certificate_amount`). Redemption becomes atomic in Plan B Phase 1
  (`redeem_challenge_prize` RPC, `redeemed_method` column).

---

## 3. Architecture (shared by all three)

- `pos_connections` table: `venue_id`, `provider` (`square|clover|toast`), `merchant_id`,
  `location_id`, `access_token_enc`, `refresh_token_enc`, `token_expires_at`, `scopes`, `status`,
  `connected_by_owner_id`, timestamps. Tokens **encrypted at rest** (AES-256-GCM, key in new env var
  `POS_TOKEN_KEY`; never returned to any client). Grants per `SECURE_TABLE_MIGRATION_CHECKLIST.md`.
- `pos_reward_applications` ledger: one row per attempt (`redemption key`, provider, external ids —
  Square gift card id/GAN, Clover order+discount id, Toast transaction guid — amount, status,
  error). It is the idempotency key: a retried apply never double-discounts.
- `lib/pos/` with one adapter per provider behind a single interface
  (`applyReward`, `reverse`, `describeConnection`); routes never call a provider SDK directly.
  Use `fetch` against REST APIs unless an official SDK is clearly lighter — justify in the handoff.
- OAuth routes `app/api/owner/pos/[provider]/connect|callback|disconnect` behind `requireOwnerAuth`
  + venue access; `state` parameter HMAC-signed and single-use.
- **Cost rules:** no polling crons. Provider calls happen only when staff act (apply) or when a
  provider calls us (webhook, Toast loyalty). Token refresh happens lazily on use (refresh when
  < 24 h left), not on a schedule. Estimated: 2–4 provider calls per redemption; at today's volume
  (6 redemptions ever) that is effectively free; at 100 venues × 20 redemptions/week ≈ 8k calls/month.
  Webhook endpoints log one line per event; no per-event full-table reads.

---

## 4. Phases

### Phase 0 — Business setup (Andrew; start now, no agent)
1. List which POS each current and near-term partner uses → decides provider order.
2. **Toast:** nothing now (deferred, §1a). Do keep a list of Toast venues that ask for this — Toast
   prioritizes applications by customer demand, so that list is the future application's evidence.
3. **Clover:** create a Clover developer account (sandbox is free); later Phase 3 needs a demo video.
4. **Square:** create a Square developer account + sandbox app (instant).
5. Decide (§6): who funds prizes (partner — recommended, it's their promotion), dollar caps for
   menu-item prizes, and whether a Square partner without gift cards just keeps the normal coupon.
6. Ask your accountant whether promotional gift cards need anything on the partner side (they are
   the partner's liability, not ours).

### Phase 1 — Foundation (no provider live yet)
**Model / effort:** Opus 5.5, **high**.
- Migrations: `pos_connections`, `pos_reward_applications` (+ grants, + contract test passes).
- `lib/pos/crypto.ts` (token encryption), `lib/pos/types.ts` (adapter interface), `lib/pos/registry.ts`.
- Reward prize model: add optional `prize_pos_value_cents` (the "up to $X" cap) to
  `challenge_campaigns` and the redemption snapshot; wizard asks for it only when the venue has a
  connected POS and the prize is a menu item (shared `CreateRewardWizard`, both variants).
- Partner Dashboard: menu row "Point of Sale" → `OwnerSheet` listing Square / Clover / Toast with
  status ("Connect", "Connected to {merchant name}", "Coming soon").
- Sandbox spike notes recorded in the handoff for each provider (confirm §2 facts with real calls).

### Phase 2 — Square (gift card prizes become real Square gift cards)
**Model / effort:** Opus 5.5, **high**.
- OAuth connect (scopes: `GIFTCARDS_READ`, `GIFTCARDS_WRITE`, `MERCHANT_PROFILE_READ`, and
  `CUSTOMERS_READ` only if linking customers). Pick the Square location during connect.
- Issue **lazily**: when the guest opens a gift-card coupon at a Square-connected venue and taps
  "Use at the register," create + activate a `DIGITAL` gift card for the prize amount (idempotent on
  the ledger), show its barcode/GAN on the coupon (inside Plan B's live coupon frame). Don't mint cards for prizes nobody
  uses.
- Webhook `POST /api/webhooks/square` (signature-verified): on gift card `REDEEM` activity, mark our
  redemption redeemed via Plan B Phase 1's `redeem_challenge_prize` RPC with `redeemed_method='pos_square'`.
  **As built (2026-10-05):** the coupon is claimed through that RPC *when the card is created* (between creating
  the unfunded card and funding it), so the webhook only records spending; it keeps the RPC call as a backstop.
  Why: Phase 2 handoff §3.
- Menu-item prizes at Square venues: unchanged (normal coupon + guest confirm). Note it on the partner sheet.

### Square to production — Phases 2b–2h (added 2026-10-06; do these before resuming Clover)

**Goal (Andrew, 2026-10-06):** "I want rewards to be redeemable at subscriber businesses that use Square." Done
means: a real partner on Square connects in the Partner Dashboard, every prize a guest wins there can be taken at
the Square register with a record on both sides, the partner can see what was redeemed, and it runs in production
with real money. No hardware purchase is needed: Square's register app is free on an iPhone/iPad.

**What is already built (Phase 2, live in production with the switch off):** Square connect/disconnect + location
picker, gift-card prizes → real Square eGift cards (guest taps "Get my Square gift card"; staff take payment →
Gift card → type or scan the number), the signed webhook that records spending, environment isolation
(sandbox rows are ignored by a production server). **What is missing:** none of it has run end to end yet (OAuth,
wallet in a browser, a webhook delivery); menu-item and %-off prizes still use only the plain coupon; no
production Square app, keys or webhook subscription; nothing tells partners or staff how to use it; no
redemption report.

**Gaps found while planning (2026-10-06, from the code):**
- `lib/pos/squareGiftCards.ts` hard-codes `currency: "USD"` (lines ~165, ~216). A non-US Square location would fail
  at funding, after the coupon is already claimed. Check the location's currency/country at connect time.
- `app/api/prizes/square-gift-card/route.ts` has no `rateLimit()`. Each call can create a Square card.
- `lib/pos/squareWebhook.ts` handles only gift-card activity. When a partner removes our app in Square, Square
  sends `oauth.authorization.revoked`; today we find out only when the next guest's card fails.
- A coupon claimed but never funded (Square down at the wrong moment) has no un-claim and no support view
  (Phase 2 handoff §5). Every later guest tap retries, but nobody on our side can see stuck rows.
- `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` is all-or-nothing and build-time: turning it on for a pilot shows the
  Point of Sale row to every partner.

**Cost (estimate).** Unchanged from §3 for gift cards: 3–4 Square calls when a guest opens a card (create, claim,
fund, read back), 1 read on each later "Show gift card", 1 webhook per spend. 2c adds about 1 webhook per partner
disconnect and 1–2 calls per connect (country/currency check). 2d as built: 1 Catalog search per menu-item coupon
**open** plus 1 create per new prize per Square account (≈ 3 opens × 2k menu redemptions/month at 100 venues ≈ 6k
calls/month, free), and zero DB writes. 2f reads only our own tables (ledger + redemptions, one
venue, newest 50), **zero** Square calls; balances come from what webhooks already wrote. At 100 venues × 20
redemptions/week this stays under ~10k Square calls/month (free) and well under 50k small DB operations/month.
No crons, no polling anywhere in 2b–2h.

**Handoff files:** `docs/pos-rewards-integration-plan_PHASE_2b_HANDOFF.md`, `…_PHASE_2c_HANDOFF.md`, and so on.

#### Phase 2b — Sandbox end-to-end proof (Andrew at the keyboard + agent) — DONE 2026-10-06
**As run:** the preview needed only the two webhook env vars (no OAuth on the preview, no extra Redirect URL);
the preview lives at `hightop-square-sandbox.vercel.app`. Our own Disconnect also fires
`oauth.authorization.revoked`, which matters for 2c. Evidence + traps: the Phase 2b handoff.
**Model / effort:** Opus 5.5, **medium** (mostly running and watching; switch to **high** if a real bug turns up).
**Needs Andrew:** ~30 minutes at the laptop, and an OK for a Vercel **preview** deploy (`vercel deploy` without
`--prod` was classifier-denied before; Andrew runs it or explicitly OKs it).
- Env names already in `.env.local` (checked 2026-10-06): `SQUARE_ENVIRONMENT`, `SQUARE_SANDBOX_APPLICATION_ID`,
  `SQUARE_SANDBOX_APPLICATION_SECRET`, `SQUARE_SANDBOX_ACCESS_TOKEN`, `POS_TOKEN_KEY`,
  `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`. Confirm `SQUARE_ENVIRONMENT=sandbox` by behaviour (the sheet shows Square
  as connectable), never by printing values.
- Follow the Phase 3 handoff §8 run: sandbox Redirect URL `http://localhost:3000/api/owner/pos/square/callback`;
  Andrew opens the sandbox seller ("Open in Square Dashboard") → local `/owner/dashboard` as the Pacific Street
  partner → Point of Sale → Square **Connect** → Allow → pick a location. Then as his player account →
  `/redeem-prizes` → the seeded $25 test coupon (§6 note) → **Get my Square gift card** → number + barcode +
  "$25.00 left". Check the `pos_connections` row, the ledger row (`status='succeeded'`, `external_ref like 'gftc:%'`)
  and `redeemed_method='pos_square'`.
- Webhook leg on a preview deploy: Preview env vars via `vercel env add … preview` (the Square names above with
  the **plain** names `SQUARE_APPLICATION_ID` / `SQUARE_APPLICATION_SECRET`, plus `POS_TOKEN_KEY`,
  `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_NOTIFICATION_URL=<preview URL>/api/webhooks/square` — the
  signature uses that exact URL), add the preview callback as an extra sandbox Redirect URL, subscribe the sandbox
  app to `gift_card.activity.created`. Spend $10 (sandbox API `REDEEM` activity) → ledger
  `external_detail.balance_cents` = 1500 and the wallet shows $15 left; spend the rest → wallet shows **Used**.
- Also try: Disconnect → wallet stops offering new cards but "Show gift card" behaviour matches the Phase 2 handoff
  §5 note; Reconnect the same seller → "Show gift card" works again; deny on Square's consent screen → `denied`
  banner; a second tap on "Get my Square gift card" in another tab → same card, no second card.
- Finish: **Disconnect** the sandbox connection (prod-DB hygiene). Fix any bugs found (with tests). Record every
  check with evidence in the handoff. Do **not** delete the test coupon yet (2h may reuse the pattern).

#### Phase 2c — Production hardening (code; flag stays off) — BUILT 2026-10-06 (uncommitted)
**As built** (details + evidence: `docs/pos-rewards-integration-plan_PHASE_2c_HANDOFF.md`): Andrew chose **no pilot
gate** (§6 item 13 = every partner), so `POS_SQUARE_PILOT_VENUE_IDS` was **not** built. No migration was needed:
eligibility is checked at connect (US location in USD; an ineligible grant is revoked, not stored) and the card's own
currency (from Square's create response) is checked before the claim. Also fixed: Disconnect no longer calls Square's
RevokeToken when another venue shares the same Square account (RevokeToken ends every token for that merchant), and a
2xx with an empty body is now a retryable failure. `SQUARE_API_VERSION` stays `2025-01-23` (no breaking change for our
endpoints through the 2026-08-19 changelog; spike green).
**Model / effort:** Opus 5.5, **high** (money and security paths). Ask Andrew §6 item 13 at the start.
- **Connect-time eligibility.** On callback/location choice, read the merchant's `country` and the chosen
  location's `currency` (already within `MERCHANT_PROFILE_READ`). Gift cards only when currency is `USD` (our prize
  amounts are dollars) and the country is one Square's Gift Cards API supports; otherwise save the connection as
  `needs_attention` with a plain message ("Square gift cards aren't available for this Square account; guests keep
  the normal coupon"). Replace the hard-coded `"USD"` with the stored currency, and refuse (before claiming) when it
  isn't USD. If 2b showed a seller who can't issue gift cards, detect that here too.
- **`oauth.authorization.revoked` webhook.** Extend `lib/pos/squareWebhook.ts`: match on merchant id + environment,
  mark that connection `revoked`, wipe tokens exactly like `disconnectSquare`. Partner sees "Reconnect needed".
  Never log the raw body. One log line per event.
- **Rate-limit `POST /api/prizes/square-gift-card`** per user (and per IP) through `rateLimit()` (`lib/rateLimit.ts`;
  add a bucket, keep its fail-closed behaviour). Generous enough for "Show gift card" reopenings (e.g. 30/hour).
- **Stuck-claim visibility.** An admin-only list (Admin → Venues or a small "POS" panel) of
  `pos_reward_applications` rows not `succeeded` and older than 15 minutes, with venue, coupon id, status, last
  error and a **Retry funding** button that calls the same idempotent `openSquareGiftCard` path. On-demand read
  only; no cron. No GAN in the UI.
- **Pilot gate (if §6 item 13 = allowlist).** Server-side `POS_SQUARE_PILOT_VENUE_IDS` (comma list, **not**
  `NEXT_PUBLIC_`, so it changes without a redeploy), one reader in `lib/pos/squareConfig.ts`. When set, only those
  venues see Square as connectable and only their coupons are offered cards; unset = everyone. The Point of Sale
  menu row itself still follows the public flag; other partners see "Coming soon".
- **Dashboard nudge.** If a venue's Square connection is `needs_attention`/`error`, show one line on the dashboard
  (from data the dashboard already loads; no new request) linking to the Point of Sale sheet.
- Re-check `SQUARE_API_VERSION` (`2025-01-23`) against Square's current version notes; bump only if a used endpoint
  changed, and rerun `npm run pos:spike -- square`.
- Tests for each item (contract tests: no GAN/token logged, rate-limited, revoked webhook signature-verified and
  idempotent). Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not concurrently with
  typecheck).

#### Phase 2d — Menu-item and %-off prizes at the Square register — BUILT 2026-10-06 (uncommitted)
**As built** (details + evidence: `docs/pos-rewards-integration-plan_PHASE_2d_HANDOFF.md`): Andrew chose a
**preset discount per prize** (a refinement of (A) below, explained to him and picked over the two generic
discounts): each menu-item prize becomes ONE catalog discount on the partner's Square, named by its terms —
"Hightop prize: 50% off Appetizer (max $12)" — with the percentage and cap set, so Square does the math. **No
migration:** the name is the identity; when a guest opens the coupon, `POST /api/prizes/square-discount` searches
the partner's catalog for it and creates it if missing (first use, or the partner deleted it). The coupon shows
staff the name; staff then confirm as today (once-only RPC, `guest_confirm`). Scopes gained `ITEMS_READ
ITEMS_WRITE`; older connections show "Reconnect Square" and gift cards keep working meanwhile; a reconnect keeps the
chosen location. §6 item 2 = partner funds; item 3 = cap **optional** (blank = no limit). Live sandbox check of the
catalog calls passed; the full OAuth + wallet click-through is still to do (handoff §6). Cost: 1 Square search per
coupon open + 1 create per new prize per merchant; no DB writes.
**Model / effort:** Opus 5.5, **high**. **Ask Andrew §6 item 12 first** — the build depends on the answer; also
settle §6 items 2 and 3 here (they've been pending since 2026-10-03).
Square's API can't put a discount on an open register ticket (§2), so the options are:
- **(A) Named Square discount (recommended).** At connect, create (and re-ensure on use, in case the partner deletes
  them) two catalog discounts on the partner's Square: "Hightop Challenge prize ($)" (`VARIABLE_AMOUNT`) and
  "Hightop Challenge prize (%)" (`VARIABLE_PERCENTAGE`). The guest's coupon at a Square venue tells staff exactly
  what to tap: "Square: Discounts → Hightop Challenge prize (%) → 50% (up to $12)". Staff then confirm the coupon
  as today (one tap, once-only RPC). The partner's Square reports count the discount by name. Needs the extra
  `ITEMS_READ ITEMS_WRITE` scopes, so **existing connections must re-consent**: the sheet shows "Reconnect to
  enable menu prizes"; gift cards keep working meanwhile. Keeps the prize's menu restriction.
- **(B) Turn dollar-valued prizes into Square gift cards too.** "$5 off an entrée" or a capped "50% off appetizer
  (up to $12)" becomes a $5 / $12 eGift card, same flow as gift-card prizes. Fully automatic at the register, but
  the guest can spend it on anything, across visits. Could be a per-reward opt-in in the wizard (variant-shared
  `CreateRewardWizard`, both hosts).
- **(C) Leave them as plain coupons** (today). Staff key a manual discount. Nothing to build; Square has no record.
- Whatever is chosen: the wizard's "value at the register" question (`prizeNeedsPosValue`, `lib/pos/prizeValue.ts`)
  should be asked when the venue has a **Square** connection, and §6 item 3 decides whether it's required. Tests,
  admin + owner wizard snapshots stay green, full gate.

#### Phase 2e — Partner and staff instructions
**Model / effort:** Sonnet 5.5, **medium** (writing + small UI). Opus 5.5 only if a code change touches the
redemption path.
- Point of Sale sheet: a short Square setup checklist (connect → pick location → "send this to your staff") and,
  once connected, a **"How staff take a prize"** card with the exact Square register taps for gift cards (Charge →
  Gift card → manual entry / scan) and, per 2d, for menu prizes.
- A printable one-page staff sheet (a static page under `/owner/*` with print styles, or a PDF in `public/`) the
  partner can tape by the register. Plain words, big type, screenshots of the Square app if Andrew supplies them.
- Partner Manual: a "Point of Sale (Square)" section. `/info`: at most one line ("Works with your Square register")
  only if Andrew wants it, with no Square logo or branding (Square's brand rules; we're not a Square partner).
- Guest coupon copy at Square venues: one line telling the guest what to say to staff ("Pay with this Square gift
  card").
- Tests: copy snapshot / contract tests where the sheet already has them; navigation tripwire stays green.

#### Phase 2f — Partner reporting (the Square slice of Phase 5)
**Model / effort:** Sonnet 5.5, **medium**; then Opus 5.5 **medium** runs `/code-review high` on the 2c–2f diff.
- Partner Dashboard: **"Rewards redeemed"** list for the selected venue: date, guest username, prize, how
  (`guest confirm` / `Square gift card`), and for Square cards the amount, balance left and last used (from the
  ledger's `external_detail`, written by webhooks). Newest 50, one bounded query per open, no Square calls. Read
  `redeemed_method='pos_square'` as "converted to a Square gift card", not "spent" (Phase 2 handoff §3).
- Owner route behind `requireOwnerAuth` + venue access; never returns a GAN, gift card id or merchant id.
- Phase 5 below keeps the Clover/Toast parts of reporting.

#### Phase 2g — Production setup and go-live review (Andrew + agent)
**Model / effort:** Sonnet 5.5, **medium** for the checklist and env work; Opus 5.5 **high** runs
`/code-review high` and `/security-review` on everything Square since `27f5eea` **before** the flag turns on.
- **Andrew (Square Developer Console → the app → Production):** copy the production Application ID and secret; set
  Redirect URL `https://hightopchallenge.com/api/owner/pos/square/callback`; create a webhook subscription at
  `https://hightopchallenge.com/api/webhooks/square` for `gift_card.activity.created` and
  `oauth.authorization.revoked` and copy its signature key. Confirm with Square (support or docs) that issuing eGift
  cards through the API costs the seller nothing extra, and that a production OAuth app needs no Square review
  unless listed on the Square App Marketplace (we aren't listing now). Optional: ask the accountant (Phase 0 item 6).
- **Vercel production env** (`vercel env add <NAME> production`; Andrew pastes values; never `vercel env pull`):
  `POS_TOKEN_KEY` (a **fresh** 32-byte key, not the laptop's: keep it in a password manager; losing it forces every
  venue to reconnect), `SQUARE_ENVIRONMENT=production`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`,
  `SQUARE_WEBHOOK_SIGNATURE_KEY`, `POS_SQUARE_PILOT_VENUE_IDS` (if 2c built it), then
  `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED=true` **last**, then a production redeploy (`NEXT_PUBLIC_*` is build-time).
  Andrew approves the deploy.
- Agent: check the privacy policy mentions connecting a partner's POS and storing its access encrypted; update the
  copy if not (Andrew approves wording). Smoke test after deploy: `/api/owner/pos` answers for a signed-in owner;
  `POST /api/webhooks/square` with a bad signature → 401 (not 503); Square shows "Connect" in the sheet.
- Write `docs/square-go-live-runbook.md`: the steps above, how to turn it back off (unset the public flag +
  redeploy; issued cards keep working and the webhook keeps recording, by design), and where the logs are.

#### Phase 2h — Real-money pilot (no hardware)
**Model / effort:** Opus 5.5, **medium**. Ask Andrew §6 item 14 at the start.
- **Step 1, Andrew's own Square:** a free production Square seller account (or a friendly partner's, §6 item 14),
  the free Square register app on his iPhone, connected to Pacific Street in production. With Andrew's OK, seed a
  small real gift-card coupon ($1–$5) for his player account (same shape as the §6 test coupon). Guest flow on his
  phone → card → in the Square app, ring a custom $1 sale → Gift card → type the number (and try scanning the
  barcode with the app's camera, if it offers that) → check the webhook landed, the balance, the wallet. Repeat
  for a menu prize per 2d. Record which entry methods worked; this closes the Phase 2 "unverified on a real
  register" item.
- **Step 2, first real partner bar on Square:** connect, hand the staff sheet (2e), watch the ledger, the admin
  stuck-claim list (2c) and `[Square…]` logs for two weeks. Compare Square calls, webhook count and DB operations
  with the cost estimate above and report differences. Fix what staff hit.
- **Exit:** Andrew says Square is done → widen the pilot gate (unset `POS_SQUARE_PILOT_VENUE_IDS`), delete the test
  coupons (§6 note), then resume Clover at Phase 3a.

### Phase 3 — Clover register app (decided 2026-10-05; sub-phases 3a–3f)

**PAUSED 2026-10-06** (Andrew: no Clover Dev Kit for now; Square first). 3a stopped part-way: see its handoff.
Resume only after Phase 2h's exit; re-ask §6 item 8 then.

**Andrew, 2026-10-05:** "Build the Clover register app now. A scannable code on the coupon is OK." This replaces
the original Phase 3 (a web "apply to check" page on the Partner Dashboard), which Andrew rejected because staff
must not use their own phones or log in to the Partner Dashboard. **Do not build that web page.** His requirement,
verbatim: *"I want staff to be able to use a Clover (or Square or Toast) device to scan a coupon or enter a code on
the reward to apply the reward to the customer's check… I don't want staff to have to use their own phones, and I
don't want staff to have to log in to the Partner Dashboard (that is for managers and bar owners only)."*
Square already meets this (Phase 2: staff scan the Square gift card at the register). Toast meets it natively
(deferred Phase 4). Clover needs our own app on the register. Sandbox facts so far: Phase 3 handoff §5.

**How it works (target design; Phase 3a confirms the unverified parts)**
1. **Once per bar (manager):** in the Partner Dashboard's Point of Sale sheet, the manager taps Clover → **"Link a
   Clover register"** and gets a 6-digit pairing code (10 minutes, single use). They install "Hightop Challenge"
   from the Clover App Market, open it on the register, and type the code. That binds the Clover merchant to the
   venue (a `pos_connections` row). No staff account, no web OAuth, no stored Clover tokens.
2. **The coupon:** at a venue with a linked Clover, the guest's live coupon (Plan B's `LiveCouponFrame`, inside
   `RedeemModal`) also shows a **QR** and a **short typed code** (`XXXXX-XXXXX`). Other venues' coupons are unchanged.
3. **At the register (staff):** staff open the guest's order, tap our app's button on Clover's order/payment
   screen (`ACTION_MODIFY_ORDER`, which hands us the order id), and scan the QR or type the code. The app shows
   "Andrew · $25 gift card · apply $25.00 to this check?" Staff tap **Apply**. The discount appears on the Clover
   check. **Undo** is available for 5 minutes.
4. **Who decides:** our server. Every scan is checked server-side: the code must belong to an unredeemed, unexpired
   coupon **at the venue this Clover is linked to**. A used coupon is refused, so a screenshot is worthless after
   use. Once-only goes through `redeem_challenge_prize` (`p_method 'pos_clover'`), exactly as Square does.

**Design decisions (agent's, with reasons; revisit only if Phase 3a disproves a fact)**
- **The device proves who it is with Clover's own token.** The app calls `CloverAuth.authenticate()` each time
  (Clover says never store it on the device) and sends the token + merchant id as a Bearer header. The server
  checks it with one Clover REST call, caches "valid" in memory for 10 minutes keyed by a SHA-256 of the token,
  and never stores or logs the token. Phase 3a must find a call that proves the token is **our app's** for **that
  merchant** (candidate: an `/v3/apps/{appId}/merchants/{mId}/…` read). If none exists, the pairing binding plus
  rate limits are the fallback, and the handoff must say so plainly.
- **The discount is written on the device, the claim on the server.** Order: server writes a ledger row (UNIQUE
  idempotency key = redemption id + Clover order id) → claims the coupon via the RPC → returns the discount to
  apply (name, amount in cents) → the app adds it with `OrderConnector.addDiscount` (amounts are negative cents) →
  the app reports the Clover discount id → server marks the ledger row `succeeded`. Why on the device: it works on
  orders opened on the register (REST on device-opened orders is still unverified), the register updates at once,
  and the device knows the order total (REST-built orders had no `total`). If the app dies mid-way, retrying the
  same order returns the same instruction (idempotent) instead of claiming again.
- **Undo and failure need a release.** New service-only RPC `release_challenge_prize(p_redemption_id, p_method)`:
  un-redeems only when `redeemed_method = p_method` and it was redeemed under 5 minutes ago (guarded, single
  UPDATE, same style as `redeem_challenge_prize`). The app deletes the Clover discount first, then calls release.
  Claim-first-then-release fails toward "guest temporarily can't use the coupon", never "two discounts".
- **The coupon code** is a new column `challenge_campaign_redemptions.redeem_code`: 10 characters of Crockford
  base32 (no 0/O/1/I/L confusion), UNIQUE, generated by the database (volatile default, so existing rows are
  backfilled by the same migration). Static per coupon: the server decides, so it needn't rotate. Treat it like a
  Square GAN: shown only to its winner, never logged in full (log the last 3 characters).
  QR payload `HTC1:<code>` (our prefix, so the app ignores other barcodes). A wrong-venue code answers the same
  "not found here" as a made-up code: never reveal that it exists elsewhere.
- **Device routes live under `/api/pos/clover/device/*`**, not `/api/owner/*`, and never use `requireOwnerAuth`
  (staff have no login). Check that `proxy.ts` lets them through, as it does `/api/webhooks/square`. They are
  flag-gated (`isPosIntegrationsEnabled()`) and rate-limited per merchant and per IP through `rateLimit()`.
- **Production refuses sandbox tokens**, and a sandbox build talks only to a preview deploy (build-time base URL).

**Cost (estimate; measure in 3d).** Per apply: 1 Clover token check (often cached) + about 4 database operations
(lookup, ledger insert, claim RPC, ledger update). No crons, no polling, no webhooks. At 100 venues × 20
redemptions/week ≈ 8,000 applies/month ≈ ≤8,000 Clover calls and ~32,000 small DB operations: negligible. Undo adds
one release call. Clover App Market listing is free for a free app.

**Handoff files:** `docs/pos-rewards-integration-plan_PHASE_3a_HANDOFF.md`, `…_PHASE_3b_HANDOFF.md`, and so on.

#### Phase 3a — Spike and toolchain (no product code)
**Model / effort:** Opus 5.5, **high**. **Needs Andrew first:** (1) in the Clover sandbox developer dashboard,
create an **Android app** with permissions Read orders, Write orders, Read inventory (the order connector needs it), Read merchant (and Read employees only if we
show the server's name); (2) decide test hardware (§6 item 8). Barcode scanning cannot be tested on an emulator.
- Install the Android command-line tools + SDK (the Mac has JDK 21; no Android SDK, `adb` or Gradle yet). Build a
  throwaway "hello" app with `clover-android-sdk` and sideload it onto the sandbox device/emulator.
- Verify, and record each with evidence in the handoff:
  1. `CloverAuth.authenticate()` returns a token + merchant id; find the server-side REST call that proves the
     token is **our app's** for **that merchant**.
  2. An `ACTION_MODIFY_ORDER` activity shows a button on the Register order/payment screen and receives
     `Intents.EXTRA_ORDER_ID`. Note what Clover OS / Android version the devices run (sets `minSdk`).
  3. Scanning a QR **and** a Code 128 (`lib/pos/code128.ts` already draws one) **from a phone screen** with the
     device's camera / scanner, received through Clover's barcode broadcast (`BarcodeResult`). Pick the coupon's
     symbology from the result.
  4. `OrderConnector.addDiscount` on an order **opened on the device** shows on the Register check immediately and
     survives payment; deleting it works; `Order.getTotal()` is available before payment.
  5. Rerun `npm run pos:spike -- clover --order <device-opened id>` (its ✓ on "list open orders" is not trustworthy).
- **Stop and report to Andrew** if (1) or (4) fails; the design above changes.

#### Phase 3b — Website side (flag OFF; deployable on its own)
**Model / effort:** Opus 5.5, **high**.
- Migrations (grants per `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; `supabase db push` asks Andrew):
  `redeem_code` column + unique index + backfill; `release_challenge_prize` RPC (service role only);
  `pos_device_pairings` (venue_id, owner id, code **hash**, expires_at, used_at). Check whether `pos_connections`'
  token columns are NOT NULL; a Clover link stores none. Never edit an existing migration.
- `lib/pos/cloverDevice.ts`: `verifyCloverDeviceToken` (the 3a call + 10-minute in-memory cache),
  `resolveCloverVenue(merchantId)`, pairing create/consume, and the coupon summary/claim/confirm/release logic.
  One file reads the Clover app id / env vars (follow `lib/pos/squareConfig.ts`).
- Routes `app/api/pos/clover/device/{pair,lookup,claim,confirm,release}/route.ts`. `lookup` returns only what
  staff need: guest username, prize description, amount to apply (in cents), expiry. Prize → amount through
  `prizePosValueCents()` (`lib/pos/prizeValue.ts`); gift card = its amount; %-off and menu items follow §6 item 3.
- Partner Dashboard Point of Sale sheet: Clover row → "Link a Clover register" (pairing code + countdown + install
  steps), linked merchant name, **Unlink**. Owner routes stay behind `requireOwnerAuth`.
- Live coupon: QR (`qrcode.react`, already installed) + grouped code, only when the coupon's venue has an active
  Clover link and the flag is on. Lives inside `LiveCouponFrame`; the wallet list stays calm. Guest-side
  "Confirm Redemption" stays as the fallback; both paths go through the same RPC.
- Tests: route contract (no `requireOwnerAuth`, flag-gated, token and full code never logged, rate-limited),
  code generator, RPC race tests in the style of `scripts/test-reward-redeem-once.cjs` (two claims at once; release
  only by its own method and inside 5 minutes), coupon render tests. Full gate: typecheck, lint, `npm run test`,
  build, `npm run test:pwa-contract`.

#### Phase 3c — The Clover app (sandbox build)
**Model / effort:** Opus 5.5, **high**. Folder per §6 item 7 (recommended `clover-app/` in this repo).
- Kotlin, `clover-android-sdk`, smallest dependency set. Server base URL fixed at build time (preview vs production).
- Screens: **Link** (manager types the pairing code; one time), **Scan** (opens from the order screen with the
  order id; camera/scanner + a big "Type code" keypad), **Confirm** (guest, prize, amount, order total; plain
  warning when the prize exceeds the check, per §6 item 9), **Done** with **Undo** for 5 minutes, and plain-English
  errors ("Already used on Oct 4", "Expired", "Not a Hightop Challenge code", "This register isn't linked yet").
- Opened from the launcher without an order: tell staff to open it from the guest's order instead.
- Never store the Clover token; call `CloverAuth.authenticate()` per request (it can take up to 60 s: show progress).
- JVM unit tests for code parsing and the apply/undo state machine; a debug APK the next phase can install.

#### Phase 3d — End-to-end on the sandbox device + review
**Model / effort:** Opus 5.5, **high**, then `/code-review high` and `/security-review` on the web and app diffs.
- Preview deploy with Preview env vars (flag on). Use the seeded test coupon (§6 note) on Andrew's Pacific Street
  account. Cases: scan; type; wrong venue; used; expired; double tap; two registers at once; Wi-Fi off mid-apply
  then retry; undo; undo after 5 minutes (refused); app reinstall + relink; unlink then scan (refused).
- Write `docs/clover-register-app-device-checklist.md` (Andrew runs it). Measure Clover calls and DB operations
  per apply against the estimate above.

#### Phase 3e — Clover App Market submission (Andrew + agent)
**Model / effort:** Sonnet 5.5, **medium** (writing), Opus 5.5 for any code fixes from review.
- Andrew: production Clover developer account approval, the signing keystore (**back it up: losing it means the
  app can never be updated**), the demo video, the listing price (§6 item 10).
- Agent: listing text, permission justifications, privacy-policy check, signed release build steps, production app
  id → env var names (values added by Andrew; `.env.local` is append-only). Respond to Clover's review notes.

#### Phase 3f — First real Clover bar (pilot)
**Model / effort:** Opus 5.5, **medium**.
- Production env vars + redeploy (`NEXT_PUBLIC_*` is build-time). One partner bar links its register; watch the
  ledger and `[CloverDevice]` logs for two weeks; compare usage with the cost estimate; fix what staff hit.

### Phase 4 — Toast (native Rewards button) — DEFERRED (§1a); do not start
Start only after (a) Square/Clover redemptions are live at real partners, (b) Andrew has applied to
the Toast partner program with that proof and been accepted, or a Toast restaurant has granted
developer access. Re-plan this phase then; the sketch below is a starting point only.
**Model / effort:** Opus 5.5, **high** (security- and contract-heavy).
- Implement Toast's loyalty integration endpoints per their spec at approval time (lookup /
  inquire, redeem, reverse, accrue-as-no-op). Guest identifier = the Plan B live QR payload (so a
  screenshot still fails) with a fallback to username search if Toast's flow requires it.
- Map our prizes to Toast check- or item-level discounts; enforce once-only via the Plan B RPC
  (`redeemed_method='pos_toast'`); reverse un-redeems.
- Pass Toast certification; per-restaurant enablement through Toast.

### Phase 5 — Partner reporting + review
**Model / effort:** Sonnet 5.5, **medium**, then Opus 5.5 **medium** for `/code-review high` and
`/security-review`.
- Partner Dashboard: "Rewards redeemed" list (date, guest, prize, how redeemed, POS reference). **The list itself
  is built in Phase 2f for Square; here, add Clover/Toast rows to it.**
- Device checklist per provider (`docs/pos-rewards-integration-device-checklist.md`), using each
  sandbox and, when available, one real partner. Compare actual provider-call counts and webhook
  volume with §3's estimate and report differences.

---

## 5. Out of scope
Toast (deferred, §1a). Earning points from purchases (spend-based loyalty), selling gift cards, menu
sync, any other POS.

## 6. Andrew's decisions (Phase 0)
0. **Toast deferred; Square + Clover first** — decided 2026-10-03 (§1a).
1. Square first or Clover first? **Square first** (Andrew, 2026-10-03).
2. Who funds a prize applied at the POS? **The partner** (Andrew, 2026-10-06). Hightop never moves money.
3. For menu-item prizes, require a dollar cap when a POS is connected? **Optional** (Andrew, 2026-10-06; the
   recommendation was "required"). The wizard asks "Most it takes off at the register ($, optional)"; blank = no
   limit. Phase 3 (Clover) must treat a null cap as "no cap", not "can't go on a POS".
4. Clover / Square developer accounts created: **yes** (Andrew, 2026-10-04). Sandbox keys not yet added to `.env.local` — see the Phase 1 handoff.
5. Clover: build our own register app now — **yes** (Andrew, 2026-10-05). The web staff page is dropped.
6. A scannable code (QR + typed code) on the coupon — **OK** (Andrew, 2026-10-05). Agent's scoping: shown only at
   venues with a linked Clover register; every other coupon stays code-free as Plan B built it.
7. Where the Android code lives: `clover-app/` in this repo (recommended: one place, one history) or a separate
   repo. _pending — ask at Phase 3c start._
8. Test hardware: a Clover Dev Kit device (needed to test scanning and the real Register screen) or emulator only.
   Recommendation: a Dev Kit. **Andrew, 2026-10-06: no Dev Kit for now** — Clover paused; re-ask when Clover resumes.
9. A prize bigger than the check (a $25 prize on a $15 tab): apply up to the check total with a warning to staff,
   the rest is forfeited (recommended), or refuse. _pending — ask at Phase 3b start._ (Square gift cards keep a
   balance; a Clover discount can't.)
10. Price of the app on the Clover App Market. Recommendation: free (partners already pay us). _pending — 3e._
11. **Square to production before Clover and Toast** — decided 2026-10-06 (Phases 2b–2h).
12. Menu-item and %-off prizes at Square venues: (A) named Square discount + staff confirm (recommended), (B) turn
    dollar-valued prizes into Square gift cards, or (C) plain coupon as today. **Andrew, 2026-10-06: a preset
    discount per prize** (A, with one ready-made discount per prize instead of two fill-in ones). Built in 2d.
13. Square pilot: a server-side venue allowlist so only pilot venues can connect, or open to every partner the day
    the flag turns on. **Andrew, 2026-10-06: every partner** (no allowlist built).
14. Pilot merchant for real-money testing: Andrew's own free Square seller account + the free Square app on his
    iPhone (recommended first), then a friendly partner bar. _pending — ask at 2h start._

**Test coupon (seeded 2026-10-05 with Andrew's OK, "Ok to create a test coupon"):** campaign
`da65ec0f-ad34-4e01-8a0c-6666e00c4ca0` ("TEST — POS gift card / Clover check (delete me)", `is_active=false`,
`venue_ids={hc-cbz-live}`, gift card $25) and redemption `643500aa-f8c9-4ef4-b4e0-e36872bf993f` for Andrew's
`users` row `ecaececc-7b47-4d8d-9a5c-f28e44f976de` at `venue-pacific-street`, expires 2026-10-19 15:53 UTC, expiry
notices pre-stamped. Delete when Square + Clover testing is done (redemption first, then campaign; check
`pos_reward_applications` for rows pointing at it first).
