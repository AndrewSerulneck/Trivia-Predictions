# POS Rewards Integration — Phase 2d Handoff (menu-item prizes at the Square register)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 2d · **Date:** 2026-10-06 · **By:** Claude Opus 5.5
**State:** **Done, uncommitted.** Built, tested, and the Square calls were checked against Square's real sandbox.
Nothing is committed, pushed or deployed. The production flag is still off. **Next:** Phase 2e (partner and staff
instructions), Sonnet 5.5 **medium**. Before or at the start of 2e, run the optional sandbox click-through in §6.

---

## For Andrew (plain English)

**What changed.** Prizes like "50% off an appetizer (up to $12)", "$5 off an entrée" or "free dessert" now work
at a Square register:
1. The first time a guest opens such a coupon at a bar connected to Square, we add a ready-made discount to that
   bar's Square, named after the prize, for example **"Hightop prize: 50% off Appetizer (max $12)"**. The 50% and
   the $12 limit are already set in it, so Square does the math.
2. The guest's coupon now has a green box for staff: *"In Square, add this discount to the sale: Hightop prize:
   50% off Appetizer (max $12)."* Staff tap it in Square, then tap **Confirm Redemption** on the coupon as they do
   today. A coupon still can't be used twice.
3. If Square can't be reached, the box simply doesn't appear. The coupon works the normal way.
4. Two rewards with the same prize share one discount, so the bar's Square list doesn't fill up.
5. **Bars that connected Square before today must tap "Reconnect Square" once** in the Point of Sale panel,
   because we now ask Square for one more permission (adding discounts). Gift cards keep working meanwhile, and
   the bar doesn't have to pick its location again.
6. **The dollar limit is now optional**, as you chose. When creating a percent-off reward at a bar with a register
   connected, the form asks "Most it takes off at the register ($, optional)". Blank means no limit.

**Your answers (recorded in the plan):** a preset discount for each prize; the partner pays for prizes; the
dollar limit is optional.

**Is it live?** No. It's only on your laptop (not committed). Production is unchanged, and the Point of Sale
feature is still switched off there.

**What you need to do next**
- **Optional, about 10 minutes:** a test run in Square's sandbox to see it with your own eyes (steps in §6 below).
  I need your OK for one test coupon. Otherwise the next agent can do it with you at the start of 2e.
- **When ready:** start a new session and say **"Execute phase 2e of the POS plan."** That phase writes the partner
  and staff instructions, including the exact Square taps for these discounts.
- Committing and pushing is your call. Say "commit" when you want it. The next agent must not add `clover-spike/`.

---

## For the next agent

### 1. Next phase: goal and scope
**Phase 2e: partner and staff instructions** (plan §"Phase 2e"; Sonnet 5.5 **medium**; Opus only if the
redemption path changes). In scope: a Square setup checklist and a **"How staff take a prize"** card in the Point
of Sale sheet, covering gift cards (Charge → Gift card → type/scan) **and the 2d menu-prize discount** (find "Hightop
prize: …" under Discounts and add it to the sale or the item, then Confirm Redemption). Also a printable staff sheet,
a Partner Manual section, and one guest line at Square venues.
**Out of scope:** reporting (2f), production keys/env/deploy (2g), the real-money pilot (2h), Clover, Toast.

### 2. Starting state
- Branch `main`, last commit **`27f5eea`** (unchanged). **All 2c and 2d work is uncommitted**, along with older
  uncommitted docs (`CLAUDE.md`, `docs/reward-live-redemption-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, the
  2b/2c/3/3a handoffs) and `clover-spike/` (27 MB, untracked, **not** git-ignored: never `git add -A`).
- **No migration in 2d.** Production DB unchanged by this phase. `pos_connections` still has 3 sandbox rows for
  `venue-pacific-street`, all `revoked` (2c handoff §2). No catalog objects are left in the Square sandbox: both
  test runs deleted what they created.
- Vercel: unchanged in 2d. The preview at `hightop-square-sandbox.vercel.app` runs the **2c** tree, not 2d.
- The 2b/2c `next dev` server (PID 78555, port 3000) may still be running. It serves whatever is on disk, so it
  already has 2d's code.

### 3. Decisions (don't re-ask)
- **Andrew, 2026-10-06, §6 item 12:** first asked to explain the options in more detail, then chose **"1. Preset
  per prize"**: one ready-made discount per prize, not two fill-in ones.
- **§6 item 2:** the partner funds prizes. **§6 item 3:** the cap is **optional** (Andrew picked this over the
  recommended "required").
- **Mine, with reasons:**
  - **No table, no migration: the discount NAME is the identity.** We search the partner's catalog by exact name
    (`SearchCatalogObjects` `exact_query` on `name`, case-insensitive, deleted objects excluded) and create it when
    missing. This handles a partner deleting it (it gets recreated), and two venues on one Square account share
    one discount. It costs 1 search per coupon open, so no DB writes and no production migration approval needed.
    Trade-off: if a partner **renames** our discount, we create a fresh one with our name next time.
  - **Live campaign terms win over the coupon's snapshot**, matching what the wallet shows
    (`listChallengeCampaignWinsForUser`). `resolveRewardPrize` + `RewardPrizeSourceRow` are now **exported** from
    `lib/challengeCampaigns.ts` for that. Legacy `free_appetizer` / `wine_bottle` coupons map to "free …".
  - **Created lazily on coupon open**, not at reward creation or at connect. That way nothing is minted for unused
    prizes, and admin multi-venue rewards and connect-after-create need no special handling. Risk: the Square
    register app's catalog sync delay. It was instant via the API in the sandbox; check it on a real register in 2h.
    If it is slow, add a warm-up (e.g. ensure during the wallet GET with `after()`).
  - **Fresh random idempotency key per create.** Replaying one after the partner deleted the discount would hand
    back the deleted object. A simultaneous double-create gives two identical discounts, which is harmless.
  - **`present_at_all_locations: true`**: catalog objects are per merchant, and one account can serve two venues.
    A multi-location merchant sees it at every location.
  - **No venue-presence gate on `POST /api/prizes/square-discount`.** It returns only a discount name; Confirm
    Redemption keeps its gate. It **is** rate-limited (`squareDiscountUser` 30/h by user id, then
    `squareDiscountIp` 300/h; fails closed).
  - **Redemption is unchanged.** The coupon is still redeemed only by "Confirm Redemption" (`guest_confirm`). We
    can't know whether staff actually used the Square discount, so no new `redeemed_method` and no ledger row.
  - **Scopes:** `SQUARE_OAUTH_SCOPES` gained `ITEMS_READ ITEMS_WRITE`. Square's consent is all-or-nothing, so
    `saveSquareConnection` records `[...SQUARE_OAUTH_SCOPES]`. Old rows (3 scopes) → `needsMenuPrizeReconnect`.
  - **A reconnect keeps its location** when it's the same merchant + environment and that location is still US/USD
    (`eligibleLocationIds`). Otherwise a multi-location partner who reconnected just to grant scopes would lose gift
    cards until re-picking.
  - The green staff box renders **nothing while loading or on failure**, so the plain coupon is always the fallback.

### 4. Files
**New:**
- `lib/pos/squareDiscountSpec.ts`: `squareDiscountSpec(prize)` (pure, client-safe) → `{ name, kind
  FIXED_AMOUNT|FIXED_PERCENTAGE, amountCents, percentage, maxCents }` or null. Name format and examples are in the
  file header. **Changing the wording mints new discounts at every partner.** `SquareDiscountInput` type lives here.
- `lib/pos/squareDiscounts.ts`: `ensureSquarePrizeDiscount({userId, venueId, redemptionId})` (coupon owner/redeemed/
  expiry checks → spec → `loadSquareCredentials` → scope check → find or create) and
  `attachSquareDiscountStates(wins, venueId)` (wallet tag `squareDiscount: true`; 1 indexed read, 0 with the flag
  off or no menu coupon).
- `app/api/prizes/square-discount/route.ts`: session-bound POST, rate limit, status map like the gift-card route.
- `components/prizes/SquareDiscountHint.tsx`: the green "For staff · Square register" box (`data-square-discount`).
- `tests/lib.pos-square-discounts.test.ts`: 19 tests (spec, catalog request shapes, ensure paths, wallet tagging,
  limiter order, reconnect keeps location).

**Changed:**
- `lib/pos/square.ts`: `findSquareDiscountByName`, `createSquareDiscount` (endpoints 8 and 9).
- `lib/pos/squareConfig.ts`: scopes + `SQUARE_MENU_PRIZE_SCOPES`, `hasSquareMenuPrizeScopes`.
- `lib/pos/types.ts`: `PosConnectionCredentials.scopes`, `PosConnectionStatus.needsMenuPrizeReconnect`.
- `lib/pos/squareConnection.ts`: reads `scopes`; `saveSquareConnection` records all scopes, takes
  `eligibleLocationIds`, returns `{ ok, locationId }`.
- `app/api/owner/pos/square/callback/route.ts`: passes `eligibleLocationIds`; lands on `connected` when a location
  was kept.
- `lib/pos/connections.ts`: `scopes` added to `PUBLIC_CONNECTION_COLUMNS` (permission names, not a secret; the
  foundation tripwire was updated to the new exact string) → `needsMenuPrizeReconnect`.
- `components/owner/pos/PosConnectionsSheet.tsx`: `SQUARE_CONNECTED_TEXT`, `SQUARE_MENU_PRIZE_RECONNECT_TEXT`,
  "Reconnect Square" link, new `connected` result text.
- `lib/pos/providers.ts`: Square pitch mentions the discounts.
- `app/api/challenge-campaigns/redeem/route.ts`: chains `attachSquareDiscountStates`.
- `components/prizes/PrizeWalletPanel.tsx`: renders `SquareDiscountHint` under the coupon when `win.squareDiscount`.
- `types/index.ts`: `ChallengeCampaignWin.squareDiscount?: boolean`.
- `lib/rateLimit.ts`: two buckets + `rateLimitSquareDiscount` (existing hashes unchanged).
- `components/rewards/CreateRewardWizard.tsx`: cap optional ("Most it takes off at the register ($, optional)",
  `POS_VALUE_INVALID_MESSAGE` only for typed non-amounts). Server side (`lib/rewards.ts`) already accepted null.
- `lib/pos/prizeValue.ts`: comment says null = no cap (note for Clover).
- `lib/challengeCampaigns.ts`: exports `resolveRewardPrize`, `RewardPrizeSourceRow`.
- `scripts/pos-sandbox-spike.cjs`: new `npm run pos:spike -- square-discount` mode.
- Tests updated: `tests/lib.pos-square.test.ts` (scopes; new files in the never-log tripwire),
  `tests/api.square-routes.test.ts` (discount route, reconnect keeps location), `tests/lib.pos-foundation.test.ts`,
  `tests/components.square-gift-card-ui.test.ts` (sheet copy + wallet discount box),
  `tests/components.create-reward-wizard.test.ts` (optional cap), `tests/lib.pos-square-gift-cards.test.ts` (fixture).
- Docs: plan status line + 2d "as built" + §6 items 2/3/12; `CLAUDE.md` POS section (new bullet, latest handoff).

### 5. Facts and traps
- **Sandbox-verified 2026-10-06** (`npm run pos:spike -- square-discount`, plus a temporary script that called our
  own `findSquareDiscountByName` / `createSquareDiscount`, since deleted): FIXED_PERCENTAGE keeps
  `maximum_amount_money` (Square echoes `percentage: "50.0"`); exact-name search is case-insensitive and found the
  new object immediately; a truncated name doesn't match; a deleted object is not returned.
- **Not verifiable via API:** whether the Square **register app** applies the cap per item or per sale, and the
  exact taps (Discounts tab vs. tapping the item → Discounts). 2e writes the staff copy, but confirm the taps on a
  real device in 2h (or ask Andrew for screenshots). Today's coupon copy says "add this discount to the sale".
- The personal sandbox token (`SQUARE_SANDBOX_ACCESS_TOKEN`) has all scopes. That is why the spike passes even
  though no OAuth connection with ITEMS scopes exists yet.
- `PosConnectionCredentials` now **requires** `scopes`. Any new test fixture must include it (`scopes: []`).
- The sheet test for the connected Square row lives in `tests/components.square-gift-card-ui.test.ts`, not in
  `tests/components.pos-connections-sheet.test.ts`.
- Earlier traps still apply (2c handoff §5): sandbox empty 2xx, 429s after quick calls, `rateLimitResponse()` is
  signup-worded, `vercel logs` empty (use the MCP `get_runtime_logs`).

### 6. Build / run / test: what was verified (2026-10-06)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run test` | 302 files, **3,398 passed**, 13 skipped, **0 failed** |
| `npm run build` | OK, 188 pages (new `ƒ /api/prizes/square-discount`) |
| `npm run pos:spike -- square-discount` | all ✓; everything it created was deleted |
| Our client vs sandbox | find → null, create → id + name, find (upper-cased) → same id, delete 200, find → null |

**Not verified yet:** the full browser flow (OAuth reconnect granting ITEMS scopes → the sheet's reconnect prompt
going away → a guest opening a menu coupon → green box → discount visible in the sandbox Square Dashboard), and
the Square register app (2h). `npm run test:pwa-contract` / `test:god-mode-join` were not run (no player-shell or
join-flow changes).

**Sandbox click-through (needs Andrew; ~10 min; his OK for a test coupon):**
1. Local dev (`npm run dev` or the running PID 78555), `.env.local` already has the sandbox Square keys and
   `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`. Sandbox Redirect URL `http://localhost:3000/api/owner/pos/square/callback`
   is already set.
2. Andrew opens the sandbox seller dashboard, then `/owner/dashboard` as the Pacific Street partner → Point of Sale
   → Square **Connect** → Allow (the consent now lists item/catalog access) → the row says Connected with
   `SQUARE_CONNECTED_TEXT` and no "Reconnect Square".
3. With Andrew's OK, seed a menu-item test coupon for his `users` row `ecaececc-7b47-4d8d-9a5c-f28e44f976de` at
   `venue-pacific-street`, same shape as the plan §6 test coupon: an inactive campaign with `prize_kind='menu_item'`,
   `prize_menu_item='appetizer'`, `prize_discount_kind='percent'`, `prize_discount_value=50`,
   `prize_pos_value_cents=1200`, and a redemption copying those snapshot columns plus `prize_pos_value_cents`.
4. As the player → `/redeem-prizes` → Redeem → the green box shows "Hightop prize: 50% off Appetizer (max $12)".
   Check the sandbox Square Dashboard → Items → Discounts for it. Delete it there, reopen the coupon, and it
   reappears (re-created). Tap Confirm Redemption → redeemed (`guest_confirm`).
5. Clean up: Disconnect; delete the test redemption and then the campaign; delete the sandbox discount.

### 7. Open questions for Andrew
1. OK to seed a menu-item test coupon for the §6 click-through? (Not asked yet.)
2. Commit 2c + 2d? (Not asked. Don't commit unprompted.)
3. For 2e: does he have Square register screenshots for the staff sheet? (Plan 2e mentions them.)
4. §6 item 14 (pilot merchant) is still for 2h.

### 8. Recommended first steps for 2e (Sonnet 5.5, medium)
1. Read this file, plan §"Phase 2e", `components/owner/pos/PosConnectionsSheet.tsx` (copy constants
   `SQUARE_CONNECTED_TEXT`, `SQUARE_MENU_PRIZE_RECONNECT_TEXT`, `SQUARE_ATTENTION_TEXT`), and
   `components/prizes/SquareDiscountHint.tsx` + `SquareGiftCardPanel.tsx` (the guest/staff wording to stay
   consistent with).
2. Offer Andrew the §6 click-through first if it hasn't been done. It is the cheapest way to see the real Square
   screens the instructions describe.
3. Keep copy in exported constants and pin them in the existing sheet tests. Navigation tripwire
   (`npm run test`) must stay green. If any `/owner/*` printable page is added, use `OwnerShell backTo` and no
   hand-rolled back link.
4. Full gate at the end (typecheck, lint, test, build; not typecheck concurrently with build). Write
   `docs/pos-rewards-integration-plan_PHASE_2e_HANDOFF.md` and update the plan status line + `CLAUDE.md` latest
   handoff pointer.
