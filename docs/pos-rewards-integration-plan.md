# POS Rewards Integration — Plan C (Square and Clover; Toast deferred)

**Status:** **Phase 2 (Square) built 2026-10-05 — uncommitted, flag off, not yet tested end-to-end with a
connected sandbox account (needs Andrew's Square app keys).** Latest handoff:
`docs/pos-rewards-integration-plan_PHASE_2_HANDOFF.md`. Phase 1 (Foundation) done 2026-10-04 (its migration and
Plan B Phase 1's redeem RPC were applied to production 2026-10-05). **Next:** finish Phase 2's sandbox
end-to-end check (handoff §8), then Phase 3 (Clover). **Phase 2 deviation:** the coupon is marked redeemed when
it becomes a Square gift card, not on the first spend (handoff §3).
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
| **Clover** | Add a discount straight onto an **open order** through Clover's API. | Staff pick the guest's open tab from a list and tap Apply; the discount appears on the Clover check. Needs a staff-side screen, which Plan B no longer builds — decide its shape at the start of Phase 3. | Clover must **approve our app** for the Clover App Market (demo video + review) before other merchants can install it. |
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
  tell the agent in Phase 0.

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

### Phase 3 — Clover (discount onto the open check)
**Model / effort:** Opus 5.5, **high**.
- OAuth connect (orders read/write, merchant read); refresh tokens handled lazily.
- **Open question at phase start (ask Andrew):** Plan B no longer builds a staff screen, but a
  Clover discount needs one — a guest must not see the venue's list of open tabs. Options: a small
  owner-authenticated "Apply a reward to a check" page on the Partner Dashboard (staff type the
  guest's username or pick from today's unredeemed winners), or revive Plan B §6's parked staff
  scan. Recommendation: the small page.
- That staff screen gets **"Apply to Clover check"**: list the venue's
  open Clover orders (newest first; show table/tab name, server, total, opened time), staff pick one,
  we POST an order-level discount ("Hightop Challenge: $25 gift card" — amount = prize value capped
  by `prize_pos_value_cents` and by the order total), then call the `redeem_challenge_prize` RPC with
  `redeemed_method='pos_clover'`. If the Clover call fails, nothing is marked redeemed.
- Undo within 5 minutes ("Remove from check") deletes the Clover discount and reverses our row.
- Andrew records the Clover app-approval demo video from the sandbox; agent prepares the submission
  text and permission justifications. Distribution to other merchants waits on approval.

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
- Partner Dashboard: "Rewards redeemed" list (date, guest, prize, how redeemed, POS reference).
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
2. Who funds a prize applied at the POS? Recommendation: the partner. _pending_
3. For menu-item prizes, require a dollar cap when a POS is connected? Recommendation: yes. _pending_
4. Clover / Square developer accounts created: **yes** (Andrew, 2026-10-04). Sandbox keys not yet added to `.env.local` — see the Phase 1 handoff.
