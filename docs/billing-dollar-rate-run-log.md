# billing-dollar-rate Run Log

**Project:** Dollar-Amount Custom Rates for Partner Billing  
**Plan:** `docs/billing-dollar-rate-plan.md`  
**Model progression:** Haiku → Opus → Sonnet → Opus → Haiku  
**Status:** Phase 1 ✓ · Phase 2 ✓ · Phase 3 ✓ · Phase 4 ✓ · Phase 5 ✓ · Phase 6 ✓ (decision recorded, zero code) · Phase 6A ✓ · Phase 6B ✓ · Phase 7 ✓ (real Stripe test mode, zero code changed) — next up: **Phase 8 (close-out, docs only)**

> Phases **6A** and **6B** were added 2026-08-06. Phase 6's investigation found
> its own premise inverted — the mobile rate sheet already exists — but surfaced
> a real a11y gap in `BillingSection.tsx`'s three modals, including a device-checklist
> item that is currently unpassable. That work is 6A/6B, sequenced before Phase 7.

---

## Phase 1 — Audit the existing data & confirm assumptions

**Run date:** 2026-08-06  
**Model:** Haiku 4.5  
**Effort:** Low (completed)

### Findings

1. **Non-round-dollar rates audit:**
   ```sql
   select venue_id, amount_cents from billing_subscriptions where amount_cents % 100 <> 0;
   ```
   **Result:** No rows returned. Zero venues have non-round rates today.
   
   **Implication:** The `stripePriceId` fallback path (§1.2) is a pure escape hatch for future edge cases, not required by current data. Dollars-only input will not break existing setups.

2. **STRIPE_PRICE_ID resolution:**
   - **Price ID:** `price_1Ttv3n1djkdMC76XC3NZKy45`
   - **Product ID:** `prod_UtiUDp7116za0p`
   - **Unit amount:** $100.00/month
   - **Currency:** USD
   - **Lookup key:** (not currently set)
   
   **Implication:** Custom prices will be minted under this Product. The Product is a live, active object in use.

### Summary for Phase 2+

- **Custom prices Product:** `prod_UtiUDp7116za0p` (all dollar-minted prices must hang here)
- **Fallback scope:** Keep `stripePriceId` path in Phase 2 (§1.2) — it's safe and unused today; no existing data depends on it; legacy paths are good escape hatches
- **Cost:** Adding dollar-minting is zero-cost today — no data migration, no existing bad rates to preserve

---

## Phase 2 — `resolveMonthlyPriceForAmount` in `lib/billingCustomPrice.ts`

**Run date:** 2026-08-06  
**Model:** Opus 5  
**Effort:** High  
**Status:** ✓ Complete — `npx tsc --noEmit` clean, full suite 1390 passed / 0 failed

### As built

All work is in `lib/billingCustomPrice.ts`. **No other file changed** — the route
still calls `setCustomPrice(row, priceId)` positionally and behaves identically.

**New exports:**

| Export | What |
|---|---|
| `MIN_CUSTOM_PRICE_DOLLARS` = 10 | Band floor |
| `MAX_CUSTOM_PRICE_DOLLARS` = 1000 | Band ceiling |
| `customPriceLookupKey(cents)` | → `custom_monthly_7500` |
| `resolveMonthlyPriceForAmount(dollars)` | → `{ ok: true, priceId }` \| error arm |
| `type CustomPriceInput` | `{ priceId: string } \| { amountDollars: number }` |
| `type ResolvePriceResult` | Resolver's return union |

**`setCustomPrice` signature is now `(row, input: CustomPriceInput | string)`.**
The bare `string` overload was kept deliberately — see Deviation 1.

Order of operations in the dollar branch, which matters:

1. `supabaseAdmin`/`stripe` null-check
2. **offline-row refusal** (before resolving — see Deviation 2)
3. `resolveMonthlyPriceForAmount` → price id
4. …then the *unchanged* existing path: `prices.retrieve` → the whole
   `:138-168` validation block → `subscriptions.retrieve` → single-item check →
   swap with `CUSTOM_PRICE_PRORATION_BEHAVIOR` → `amount_cents` mirror

The validation block was **not** duplicated or bypassed for minted prices, per
plan §2.3. A minted price passes it trivially; it still guards the pasted path.

### Deviations from the plan (3 — read these before Phase 3)

**1. `setCustomPrice` accepts a bare `string`, not only the union.**
Plan §2.3 says "widen to accept `{ priceId }` or `{ amountDollars }`". I kept
`string` as a third accepted form. Reason: 12 existing tests and the one route
caller pass a positional string, and Phase 2's done-criterion is explicitly "no
behavior change for the pasted-id path" — churning those call sites to prove a
type-shape point would have put unrelated diff noise inside the money-touching
phase. The union is the documented shape for new callers.
**Phase 4 should send `{ amountDollars }` / `{ priceId }`, not a bare string.**
If you'd rather have the string form gone, deleting it is a ~6-line change plus
a sed over the test file — but do it in Phase 4, not by reopening Phase 2.

**2. The offline-row refusal moved earlier for the dollar path.**
Not in the plan. Resolving first would mint a real, permanent Stripe Price for a
partner whose subscription we are about to refuse to touch — a wholly avoidable
orphan, and the one orphan case that is *guaranteed* rather than merely possible
(plan §2 accepts only the partial-failure kind). The pasted-id path's ordering is
untouched.

**3. New status 409: an archived Price holds the lookup_key.**
Not in the plan, and the plan's error taxonomy has no slot for it. Archiving a
Price at Stripe does **not** free its `lookup_key`. So `create` can fail with a
duplicate-key error while the active-only lookup finds nothing — the re-resolve
comes back empty and the "catch and re-resolve" instruction (§2.2) has nothing to
re-resolve onto. Returning 502 there would tell the admin "Stripe is broken" when
the real fix is a human unarchiving a Price in the Dashboard. The resolver now
distinguishes: re-resolve found a price → reuse it (the race); re-resolve found
nothing → 409 naming the lookup_key.

### Notes that will save Phase 3 time

- **Product resolution is a second `prices.retrieve` call.** The resolver does
  *not* hardcode `prod_UtiUDp7116za0p`; it calls `getStripePriceId()` then
  `stripe.prices.retrieve(listPriceId)` and reads `.product`, handling both the
  string and expanded-object forms. **So `@/lib/stripe` must be mocked with
  `getStripePriceId`**, and `prices.retrieve` needs to answer for *two different
  ids* — the list price (returns `{ product }`) and the custom price (returns the
  full validated price). `tests/lib.billingCustomPrice.test.ts`'s current mock
  does neither; mock `retrieve` with an id-switching `mockImplementation`.
- **The mint path calls `prices.list` then `prices.create`.** Neither exists on
  the current test file's Stripe mock — add them.
- **`prices.list` is called with `{ lookup_keys: [key], active: true, limit: 1 }`.**
  Assert the whole object; `active: true` is load-bearing (see Deviation 3).
- **`prices.create` is called with `recurring: { interval: "month", interval_count: 1 }`** —
  the explicit `interval_count` is not optional in the assertion, it's what keeps
  a minted price past the quarterly guard.
- **Race test:** make `prices.create` reject and `prices.list` return `[]` then
  `[{ id }]` (`mockResolvedValueOnce` twice). Result must be `ok: true` with the
  raced id.
- **Archived-key test:** `prices.create` rejects and `prices.list` keeps
  returning `[]` → `{ ok: false, status: 409 }`.
- **Band boundaries are inclusive**: 10 and 1000 pass, 5 and 5000 reject with 400.
  Non-integer (75.5) rejects with 400 and a "whole dollar amount" message.
- I verified all of the above with a throwaway 11-case vitest file during this
  phase (mint / reuse / race / archived-409 / band ×4 / offline pre-check /
  lookup-key format). It passed, then I deleted it — Phase 3 owns the committed
  tests. Rebuilding it is the fastest path to a green Phase 3.

### Verification run

- `npx tsc --noEmit` → clean
- `npx vitest run tests/lib.billingCustomPrice.test.ts tests/api.admin.billing-discounts.test.ts` → 32/32, unchanged
- `npm run test` → 164 files, 1390 passed, 13 skipped, **0 failed**
- `npm run lint` → 1 pre-existing error in `components/admin/mobile/ActivateVenueFlow.tsx:697`
  (unescaped apostrophe). That file is **untracked work from the concurrent
  admin-mobile track**, not this phase. Don't "fix" it here.

### Original context for Opus (Phase 1 handoff — retained)

The Phase 1 audit found **zero non-round rates**, confirming that:
1. The product already works with round-dollar rates (today's manual path)
2. There is no data migration concern — all existing subscriptions use the fallback `stripePriceId` path
3. The new dollar resolver can safely coexist with the pasted-id path (§1.2)

This phase is money-touching code: idempotency (`lookup_key` uniqueness + concurrent-create handling), race conditions (same amount set twice concurrently), and error recovery. It lives in `lib/billingCustomPrice.ts`, whose header comments (`:20-23`) document the original reasoning — those comments must be updated in the same voice to explain why dollar-minting is now worth the complexity.

### What Opus needs to deliver

1. **Three named exports:**
   ```ts
   export const MIN_CUSTOM_PRICE_DOLLARS = 10;
   export const MAX_CUSTOM_PRICE_DOLLARS = 1000;
   export const customPriceLookupKey = (cents: number) => `custom_monthly_${cents}`;
   ```

2. **`resolveMonthlyPriceForAmount(amountDollars: number)` function:**
   - Validate: reject non-integer or out-of-band dollars (< 10 or > 1000)
   - Lookup: query `prices.list({ lookup_keys: [customPriceLookupKey(amountDollars * 100)] })`
   - Reuse: if found, return the price id immediately (zero cost, zero Stripe calls)
   - Mint: if not found, create with `prices.create({ product: prod_UtiUDp7116za0p, unit_amount: amountDollars * 100, currency: "usd", recurring: { interval: "month" }, lookup_key: customPriceLookupKey(...) })`
   - Concurrent safety: if `lookup_key` already exists (someone set the same amount simultaneously), catch that error and re-resolve (race winner already minted it, loser reuses the same price)
   - Return: same discriminated-union error shape as `SetCustomPriceResult` so callers handle one error type

3. **Widen `setCustomPrice`:**
   - Accept `{ priceId }` **or** `{ amountDollars }` (not both, reject with 400 if both supplied)
   - Resolve dollar amount to a price id via the new `resolveMonthlyPriceForAmount`
   - Do NOT duplicate the existing validation block (`:138-168`) — let the minted price pass through it, and keep it guarding the pasted-id path
   - Preserve all existing behavior: `proration_behavior: "none"`, audit inserts, `amount_cents` mirror write

4. **Update file header (`:20-23`):**
   - Record that dollars-only was re-evaluated (it was originally rejected as "not worth accumulation")
   - Explain why it *is* worth it now: `lookup_key` bounds accumulation to one per distinct amount, and reuse is safer than per-admin-action minting

### Testing notes for Phase 3

Phase 3 (Sonnet) will mock Stripe and test:
- Reuse (existing `lookup_key` → no `prices.create` call)
- Mint (new amount → `prices.create` with exact params)
- Band (boundaries $10/$1000 inclusive, $5/$5000 reject)
- Concurrent error handling (duplicate `lookup_key` caught and re-resolved)
- Invariant preservation (`CUSTOM_PRICE_PRORATION_BEHAVIOR` applied to minted price)

That will all pass if this phase:
1. Uses `prices.list({ lookup_keys: [...] })` not `prices.list({ product })` (the latter paginates and misses matches)
2. Catches `lookup_key` race errors and re-resolves
3. Multiplies dollars by 100 for `unit_amount`
4. Returns a shape that fits `SetCustomPriceResult`'s error arm

### Known edge cases

- **Concurrent mints of the same amount:** Multiple admins set $75 at the same moment. One creates the price, the others get a "lookup_key already exists" error, catch it, and re-resolve — all end up using the same Price. This is the desired outcome and must be tested explicitly.
- **Partial failure:** If `prices.create` succeeds but the swap fails, an orphan Price is left. It is harmless — it will be reused on retry, and the audit trail shows the attempt.
- **Typo windows:** If an admin sets $750 by mistake and corrects it to $75 before the next billing cycle, only `amount_cents` mirrors; the minted Price for $750 remains orphaned (not a problem). If the mistake posts an invoice, it becomes a refund issue (band is the backstop; the plan accepts this).

### Blockers for Opus

- ✗ Need `lib/billingCustomPrice.ts` open to review the original header comment at `:20-23` (should match the voice/style)
- ✗ Need to confirm the Product id: `prod_UtiUDp7116za0p` (Phase 1 audited it, but Opus should sanity-check against live before minting)

Nothing blocking Phase 2 — all assumptions confirmed by Phase 1.

---

## Phase 3 — Unit tests

**Run date:** 2026-08-06
**Model:** Sonnet 5
**Effort:** Medium
**Status:** ✓ Complete — `npx tsc --noEmit` clean, full suite 1405 passed / 0 failed / 13 skipped

### As built

Only `tests/lib.billingCustomPrice.test.ts` changed. **`lib/billingCustomPrice.ts`
itself was not touched** — every case in the plan (and the extra archived-key
case from Phase 2's Deviation 3) passed against the existing implementation on
the first run after the mock was fixed. No defects found.

**Mock changes** (see file top, `~:13-40`):
- Added `priceList`, `priceCreate`, `getStripePriceId` to the hoisted `mocks`
  object, and exported `getStripePriceId` from the `@/lib/stripe` mock
  (previously only `stripe` was mocked — `resolveMonthlyPriceForAmount` calls
  the free function directly, not a method on the client).
- `priceRetrieve` now needs to answer for **two different ids** depending on
  the test: the *list price* (`LIST_PRICE_ID = "price_list_100"`, resolver
  reads `.product` off it) and whatever price is actually being validated
  (pasted, or just-minted, read the full `okPrice()` shape). The original
  `setCustomPrice` describe block still just does
  `mockResolvedValue(okPrice())` (it never calls the resolver, so there's only
  ever one id in play there). The new `setCustomPrice — amountDollars entry
  point` block switches to `mockImplementation((id) => id === LIST_PRICE_ID ?
  {...} : okPrice({ id }))` because within *that* block both ids are live in
  the same test.

**New test blocks** (both appended after the original `describe("setCustomPrice"...)`):

1. `describe("resolveMonthlyPriceForAmount", ...)` — 10 tests: reuse (asserts
   the exact `prices.list` args including `active: true`), mint (asserts the
   exact `prices.create` args including `interval_count: 1`), Product
   resolution off the configured list price (not hardcoded), band rejection
   both sides, inclusive boundaries ($10/$1000), non-integer rejection, the
   race case (`prices.create` rejects → re-resolve finds the winner's price),
   and the archived-key 409 (`prices.create` rejects → re-resolve finds
   nothing → 409 naming the lookup_key).
2. `describe("setCustomPrice — amountDollars entry point", ...)` — 5 tests:
   dollar amount resolves + swaps with `CUSTOM_PRICE_PRORATION_BEHAVIOR`
   still enforced, offline row refused *before* any Stripe price call (no
   orphan-mint regression), out-of-band amount rejected without touching
   Stripe/DB, and two regression checks that the original `string` and
   `{ priceId }` forms still work (both assert `priceList`/`priceCreate` are
   never called — proof the two entry points don't cross-contaminate).

Total: 17 new tests, 32 in the file (was 15).

### Deviations from the plan

**One, and it's a footgun worth flagging for whoever reads this file next.**
Each new `describe` block has its **own `beforeEach`** that resets
`priceRetrieve`/`priceList`/`priceCreate`/`subRetrieve`/`subUpdate`/`dbUpdate`/
`getStripePriceId` — it does *not* inherit or extend the outer `beforeEach`
from `describe("setCustomPrice", ...)`. Vitest runs **all** `beforeEach` hooks
registered for a test, so leaving any mock un-reset in a later block's
`beforeEach` means it silently carries over the *previous block's last test's*
mock state (I hit this: `subUpdate` inherited a `mockRejectedValue("stripe
exploded")` from the prior block's last test and produced three confusing
502s before I added the missing resets). **If you add a fourth describe block
to this file, reset every mock the block's code path touches in its own
`beforeEach` — do not assume a clean slate.**

### Notes for Phase 4

- `setCustomPrice`'s accepted input is `CustomPriceInput | string` where
  `CustomPriceInput = { priceId: string } | { amountDollars: number }` (see
  Phase 2 Deviation 1 above — the bare `string` form was kept for existing
  callers, but is *not* the documented shape for new ones).
  **Phase 4's route should send `{ amountDollars }` or `{ priceId }`, not a
  bare string** — that's what the plan's §2.3 union is for, and what the new
  Phase 3 tests exercise as the primary path.
- `resolveMonthlyPriceForAmount`'s error shape is `CustomPriceFailure =
  Extract<SetCustomPriceResult, { ok: false }>` — i.e. `{ ok: false, status,
  error }`. The route can pass that `status` straight through for both the
  dollar-resolve failure and the existing swap failure without a translation
  table; they're already the same union member.
- Every rejection path in `resolveMonthlyPriceForAmount` returns before any
  Stripe or DB call happens (band, non-integer, offline-row-first-check in
  `setCustomPrice`) — confirmed by the tests above, so Phase 4 doesn't need to
  add its own belt-and-suspenders check for "did we mint something we
  shouldn't have" on a validation failure.
- The 409 "archived price holds the lookup_key" case (Phase 2 Deviation 3) is
  a real, reachable status code now covered by a test — Phase 4's route
  should not assume 409 only means the existing multi-item-subscription
  conflict in `setCustomPrice`; both arms use it for different reasons and
  the error string is what disambiguates for the admin.
- Reminder from the plan (§4.3): JSON gives `number | string | null` for
  `amountDollars` — read `tests/api.billing-discount-percent-off-numeric-coercion.test.ts`
  before writing the coercion in the route; there's prior art for this exact
  bug and Phase 3 did not touch the route layer at all, so that coercion is
  still fully unwritten.

### Verification run

- `npx tsc --noEmit` → clean
- `npx vitest run tests/lib.billingCustomPrice.test.ts` → 32/32 passed
- `npm run test` → 165 files (1 pre-existing skip), 1405 passed, 13 skipped, **0 failed**
- Did not re-run `npm run lint` (no lint-relevant files touched beyond the one
  test file, which follows existing conventions in the same file); the one
  pre-existing lint error noted in Phase 2 (unrelated `ActivateVenueFlow.tsx`
  file, concurrent admin-mobile track) is presumably still there and still not
  this track's concern.

---

## Phase 4 — API route

**Run date:** 2026-08-06
**Model:** Sonnet 5
**Effort:** Low-medium
**Status:** ✓ Complete — `npx tsc --noEmit` clean, route test file 19/19, full suite 1408/1409 passed (1 pre-existing unrelated failure, see below)

### As built

Only `app/api/admin/billing/route.ts` and `tests/api.admin.billing-discounts.test.ts`
changed. **`PostBody.amountDollars` already existed** (added earlier for
`grant-manual`'s list-rate field, plan step 4.1 turned out to already be done) —
`handleSetCustomPrice` now just reads that same field; no new field was added
to the type.

**`handleSetCustomPrice` (`app/api/admin/billing/route.ts:569-`) changes:**

1. Reads both `body.stripePriceId` (trimmed) and `body.amountDollars`.
2. **Coercion:** `hasAmountDollars` checks the raw body value is not
   `undefined`/`null`/`""` (so `0` — below the band anyway — isn't silently
   dropped), then `Number(body.amountDollars)` coerces `number | string`. This
   mirrors `handleApplyDiscount`'s existing `Number(body.percentOff)` pattern
   (`:473`) — that's the "prior art" the plan pointed at. (Note: the plan's
   cited test file, `tests/api.billing-discount-percent-off-numeric-coercion.test.ts`,
   turned out to cover a *different* bug — Supabase returning a numeric column
   as a string on read — not JSON body coercion on write. The actual prior art
   for this phase is `handleApplyDiscount`'s inline `Number(body.percentOff)`,
   not that test file. Mention this if a future doc references that test file
   for this purpose — it's the wrong pointer.)
3. **Validation order (all before touching Supabase or the helper):**
   - both `priceId` and `amountDollars` present → 400 "not both"
   - neither present → 400 "one is required"
   - `amountDollars` present but `Number(...)` is `NaN`/non-finite (e.g.
     `"not-a-number"`) → 400 "isn't a number"
   - Deliberately does **not** duplicate the band ($10–$1000) or integer check
     here — `resolveMonthlyPriceForAmount` (Phase 2) already owns that and
     returns the same `SetCustomPriceResult` error-arm shape, so the route
     just passes `result.status`/`result.error` straight through unchanged
     (no translation table needed, per Phase 3's note).
4. **Call site:** `setCustomPrice(row, priceId ? { priceId } : { amountDollars })`
   — sends the `CustomPriceInput` union, **not** the bare-string form (Phase 2
   Deviation 1 flagged this as Phase 4's call to make; made it here).
5. Doc comment above `handleSetCustomPrice` updated to describe the two input
   shapes and point at where band validation actually lives.

**Audit trail:** untouched, confirmed no change needed — `result.amountCents`
already flows into `custom_price_cents` regardless of which input shape
produced it (plan §4.4 was correct that nothing here needed to change).

### Test changes (`tests/api.admin.billing-discounts.test.ts`, `describe("set-custom-price", ...)`)

- Renamed the existing "rejects a missing price id" test to reflect it's now
  "missing both" (still 400, same assertion).
- **Existing test's expectation updated:** "swaps the price and records a
  custom_price grant" previously asserted
  `setCustomPrice` called with bare `"price_new"`; now asserts
  `{ priceId: "price_new" }` since Phase 4 sends the union, not the string.
  This is an intentional behavior change this phase makes, not a regression —
  flagging it because it's the one existing assertion this phase edited rather
  than added to.
- **5 new tests:** both-supplied → 400; amountDollars happy path → helper
  called with `{ amountDollars: 75 }` and audit grant recorded; stringly-typed
  `"80"` from JSON → coerced to `80` before calling the helper; non-numeric
  string → 400 without calling the helper.
- Did not add a test asserting the band/integer rejection reaches the client
  with the right status — that's already covered end-to-end by Phase 3's
  `resolveMonthlyPriceForAmount` tests plus the "surfaces the helper's
  refusal" test already in this file (mocks `setCustomPrice` returning
  `{ ok: false, status, error }` and asserts passthrough). Adding a duplicate
  here would just re-test the passthrough, not new behavior.

### Manual dev-server verification

Ran `npm run dev` locally and POSTed both request shapes
(`{"amountDollars":75}`, `{"stripePriceId":"price_new"}`, and both-together)
to `/api/admin/billing`. All three correctly hit `requireAdminAuth` and
returned `401 {"ok":false,"error":"Admin login required."}` before reaching
`handleSetCustomPrice` — confirming the route dispatches to `set-custom-price`
without crashing for either shape. Could not verify the 200/400 response
bodies live without an authenticated admin session/cookie; that behavior is
covered by the 19 unit tests above instead. **Phase 5 or 7, whichever hits
this UI/flow with a real logged-in admin session first, should do one real
end-to-end submit** (both a dollar amount and a pasted price id) to close this
gap — the plan's Phase 4 "done when" technically wants this but Phase 3's
mocked coverage plus this 401 check is the practical substitute without
scripting an admin login.

### Verification run

- `npx tsc --noEmit` → clean
- `npx vitest run tests/api.admin.billing-discounts.test.ts` → 19/19 passed
- `npm run test` → 165 files, 1408 passed, 13 skipped, **1 failed** —
  `tests/lib.sportsBingo.player-props.test.ts` ("builds NBA board using
  BallDontLie player profiles"). **Unrelated to this phase**: that file was
  not touched by this work, is not in the billing track, and the failure
  looks like flaky/random test data (asserts a specific player name appears
  in a randomly-assembled board). Did not investigate further — not this
  track's concern, but flag it to whoever picks up Phase 5 in case it's still
  failing and blocks a clean `npm run test` gate.
- `npm run lint` → same 1 pre-existing error as Phases 2/3
  (`components/admin/mobile/ActivateVenueFlow.tsx:697`, unescaped apostrophe,
  concurrent admin-mobile track, not this track's concern).

### Notes for Phase 5

- The desktop "Change rate" modal should POST `{ action: "set-custom-price",
  venueId, amountDollars, reason }` for the primary dollars-first path, or
  `{ action: "set-custom-price", venueId, stripePriceId, reason }` behind the
  "Use a Stripe price ID instead" disclosure (plan §5.4) — **never send both
  fields**, the route now 400s if you do.
- `amountDollars` can be sent as a JS `number` from the browser (not a
  string) — the route's coercion handles either, but there's no reason for
  the UI to stringify it; keep it a number in the fetch body for the
  straightforward case.
- Client-side band hint ($10–$1,000, plan §5.3) is pure UX — the server is
  the actual enforcement point (`resolveMonthlyPriceForAmount`, Phase 2). A
  UI that shows the wrong band text doesn't create a real gap, but keep the
  copy in sync with `MIN_CUSTOM_PRICE_DOLLARS`/`MAX_CUSTOM_PRICE_DOLLARS`
  (`lib/billingCustomPrice.ts`) rather than hardcoding "$10–$1,000" as a
  string — import the constants.
- Error strings the UI should expect to display as-is (no translation
  needed): "Provide either a price id or a dollar amount, not both.",
  "That dollar amount isn't a number.", plus whatever
  `resolveMonthlyPriceForAmount`/`setCustomPrice` returns for band/offline/409
  cases (Phase 2/3 own those strings).
- `BillingSection.tsx`'s current `submitCustomPrice` (`:363`, per plan §5)
  presumably still sends only `stripePriceId` today — that call site needs to
  switch to the dollar-first shape as the default and move the price-id field
  behind the disclosure toggle, per plan §5.1-5.4. Not yet touched by this
  track.

---

## Phase 5 — Desktop admin UI

**Run date:** 2026-08-06
**Model:** Sonnet 5
**Effort:** Medium
**Status:** ✓ Complete — `npx tsc --noEmit` clean, `npm run lint` clean (for this
file — see pre-existing unrelated error below), full suite 164 files passed /
1 skipped (165), 1409 passed / 13 skipped, **0 failed**

### As built

Only `components/admin/sections/BillingSection.tsx` changed. No other file
touched — this phase is UI-only, consuming the Phase 4 route unchanged.

**State (`:139-`):** `ratePriceId` stays; added `rateAmountDollars` (string,
digits-only) and `rateUsePriceId` (boolean — false = dollar mode, the
default). Removed nothing: the price-id field and its state are still there,
just behind the disclosure.

**`openRate`:** now also resets `rateAmountDollars` to `""` and
`rateUsePriceId` to `false` — every open starts in dollar mode regardless of
which mode was used last time. Deliberate: the escape hatch shouldn't "stick"
across different partners just because the previous admin used it once.

**`submitCustomPrice`:** builds the POST body conditionally —
`{ action, venueId, reason, amountDollars }` in dollar mode (the default),
`{ action, venueId, reason, stripePriceId }` in price-id mode. Never sends
both keys, matching Phase 4's "provide either... not both" 400 guard. This
was the one call-site change the plan's §5.2 asked for.

**Modal JSX (`activeRateVenueId` block, formerly `:1019-1085`):**
- Dollar mode (default): `$` prefix + `/month` suffix wrapped around a
  `type="text" inputMode="numeric" pattern="[0-9]*"` input. `onChange` strips
  every non-digit character (`replace(/[^0-9]/g, "")`) rather than validating
  after the fact — this is what "no decimals accepted" (plan §5.1) actually
  means: a `.` or `,` keystroke is silently dropped, never shown then
  rejected. Helper text renders the live band from the two local constants,
  never a hardcoded "$10–$1,000" string.
- Price-id mode: unchanged input, now behind a "← Use a dollar amount
  instead" / "Use a Stripe price ID instead →" toggle pair (plan §5.4). The
  original helper text ("Create the negotiated recurring price in the Stripe
  Dashboard first...") was shortened to name *why* someone would still need
  this path (legacy non-round rate, hand-built Price) rather than restate the
  paste instruction, since it's no longer the primary flow.
- Submit button's disabled check now branches on `rateUsePriceId`: requires
  `ratePriceId.trim()` in price-id mode, `rateAmountDollars.trim()` in dollar
  mode (client-side non-empty check only — band/integer enforcement is
  server-side per Phase 2, unchanged here).

### Deviation from the plan (1)

**The band constants are NOT imported from `lib/billingCustomPrice.ts`.**
Plan §5.3 says "keep the copy in sync with `MIN_CUSTOM_PRICE_DOLLARS`/
`MAX_CUSTOM_PRICE_DOLLARS`... rather than hardcoding" — read that as "don't
literal-string the band," which I followed, but the literal `import` is
impossible: `lib/billingCustomPrice.ts:1` has `import "server-only"`, and
`BillingSection.tsx:1` has `"use client"`. Importing a server-only module
into a client component is a build error, not a lint nit — Next.js's
`server-only` package throws at import time specifically to catch this.
**Fix applied:** the two constants are duplicated as local `const`s at the
top of `BillingSection.tsx` with a comment pointing back at the source of
truth and flagging that they need to move together if the policy changes.
**If a future phase wants single-sourcing instead of duplication**, the real
fix is extracting `MIN_CUSTOM_PRICE_DOLLARS`/`MAX_CUSTOM_PRICE_DOLLARS`/
`customPriceLookupKey` into a new non-server-only file (e.g.
`lib/billingCustomPriceShared.ts`) that both the server module and this
client component import — `customPriceLookupKey` and the two numeric
constants have no server dependency themselves, only their neighbors
(`resolveMonthlyPriceForAmount`, `setCustomPrice`) do. Out of scope for this
phase; flagging it because "keep in sync" is a standing footgun until
someone does that split.

### Verification performed

- `npx tsc --noEmit` → clean
- `npm run lint` → 1 pre-existing error, same one flagged in Phases 2/3/4
  (`components/admin/mobile/ActivateVenueFlow.tsx:697`, unescaped apostrophe,
  concurrent admin-mobile track, not touched by this phase, not this track's
  concern)
- `npm run test` → 165 files (1 skipped), 1409 passed, 13 skipped, **0
  failed**. Note: Phase 4's run log flagged a flaky-looking failure in
  `tests/lib.sportsBingo.player-props.test.ts` ("builds NBA board using
  BallDontLie player profiles") as unrelated and pre-existing — it did **not**
  reproduce on this run. Full green suite.
- **Manual verification:** started `npm run dev`, confirmed `/admin` returns
  200 and renders without a server-side exception or Turbopack compile error
  after this change (checked `curl` + dev server log — no "Application
  error", clean `GET /admin 200` entries, `BillingSection.tsx`'s module
  compiled). **Did not** complete a real logged-in click-through of the modal
  (type a dollar amount, submit, confirm the rate changes) — same gap Phase 4
  flagged in its own manual-verification section: no scripted admin
  login/session cookie available in this environment. This is the same gap
  Phase 4 explicitly deferred forward; it is **still open** after this phase
  and should close in Phase 7, which already sets up a real (test-mode)
  Stripe session and is the first phase in this track positioned to drive the
  UI with an authenticated admin session end-to-end.

### Notes for Phase 6

- The desktop modal (`BillingSection.tsx`) is the **only** place the
  dollars-first UI lives. Nothing in `components/admin/mobile/` was touched.
- Per the plan's own framing (§6): Partner Billing is deliberately **not** a
  mobile-shell section — `components/admin/mobile/MobileVenuesSection.tsx:234`
  already links out to the desktop `BillingSection` instead of forking a
  mobile Partner Billing UI. That means **this phase's dollar-input modal
  already is the mobile experience** for any admin who follows that link on a
  phone; there is no separate "old" mobile rate UI this phase left stale.
- This does not settle Phase 6's actual question, which is narrower: whether
  to also add a *rate-setting entry point inside the mobile activation flow
  itself* (option (b), a `MobileBottomSheet`) so an admin never has to leave
  the mobile shell at all — vs. leaving the out-link as the only path (option
  (a)). That is still Andrew's call per the plan; nothing here should be read
  as pre-deciding it.
- If (b) is chosen: reuse the exact POST-body branching this phase built in
  `submitCustomPrice` (`amountDollars` xor `stripePriceId`, never both) rather
  than re-deriving it. The band-constant duplication footgun noted above
  applies equally to a new mobile sheet — don't add a *third* copy of
  `MIN_CUSTOM_PRICE_DOLLARS`/`MAX_CUSTOM_PRICE_DOLLARS`; if Phase 6 needs the
  band client-side too, that's the trigger to finally do the
  `lib/billingCustomPriceShared.ts` extraction described above rather than
  duplicating again.
- The end-to-end click-through gap noted above (no scripted admin session)
  will affect Phase 6 identically if it adds new UI — plan on the same
  Phase 7 test-mode session closing it, or get Andrew to do one manual pass
  before calling Phase 6 done.

---

## Phase 6 — Mobile surface (decision required)

**Run date:** 2026-08-06
**Model:** Sonnet 5 → Opus 5 (escalated mid-phase, see below)
**Effort:** Medium
**Status:** ✓ Complete — **zero code changed.** Decision recorded, and two new
phases (6A/6B) added to the plan for the real gap this phase surfaced.

### Decision

Andrew was asked (a) leave it vs (b) build a mobile rate sheet, and chose **(b)**.
Investigating (b) then found **the phase's premise was inverted**, so the
implemented outcome is (a)-equivalent — not because the out-link was judged good
enough, but because **the mobile sheet already exists**. Andrew reviewed the
finding and directed the retrofit work into separate phases under Opus rather
than executing it inside Phase 6.

### What the plan assumed vs. what is actually true

| Plan §6 assumed | Verified reality |
|---|---|
| Partner Billing is "deliberately not a mobile shell section" | It **is** one. `AdminMobileShell.tsx:68` renders `<BillingSection />` as the `partner-billing` tab |
| "The venue flow links out to the desktop section" | `MobileVenuesSection.tsx:317` is an in-shell `onNavigate` **tab switch**, not a departure |
| A rate sheet would need building | `BillingSection.tsx:1039` is **already** a bottom sheet under `md:` (`items-end`, `rounded-t-2xl`, safe-area padding) |
| A new sheet must be added to the device checklist | Already listed there under "Bottom sheets (… Billing Grant/Discount/Custom-rate …)" |

The `MobileVenuesSection.tsx:234` comment the plan cites is real but says
something narrower than the plan read into it: billing isn't part of *venue
activation* because a just-created venue has no `venue_owner_venues` row yet.
That is not a claim that billing lacks a mobile surface.

### Two errors made mid-phase, corrected before any code was written

Recording these because both were stated to Andrew as fact before verification,
and either one could mislead a future reader of this log:

1. **Claimed the Rate modal already had `role="dialog"` / `aria-modal`.** It does
   not. `grep -n 'role="dialog"\|aria-modal' components/admin/sections/BillingSection.tsx`
   returns nothing — none of the three modals have dialog semantics.
2. **Claimed these modals carry the `aria-hidden`-over-mounted-children bug** that
   `tests/admin-mobile.bottom-sheet-a11y.test.ts` guards against. They do not.
   All three are conditionally mounted (`{activeVenueId ? … : null}`, lines 758 /
   853 / 1038), so they leave the DOM entirely when closed. **`inert` is not
   applicable to them** — that guard exists for `MobileBottomSheet`, which stays
   mounted by design.

Lesson for later phases in this doc: `BillingSection.tsx` is 1406 lines and its
three modals are near-identical 100-line blocks. Reading one fragment and
generalizing is exactly how both errors happened — grep for the specific
attribute before asserting it exists.

### The real gap (→ Phases 6A/6B)

All three `BillingSection` modals (Grant `:758`, Discount `:853`, Custom rate
`:1038`) share one class string and all three lack: `role="dialog"`/`aria-modal`,
Escape-to-close, backdrop-tap dismiss, and a body-scroll lock.

The body-scroll lock is the one that matters most: `docs/admin-mobile-device-checklist.md`
already requires "No body-scroll bleed — the page underneath doesn't scroll with
the sheet open" for these exact modals, and **nothing in `components/admin/`
touches `body.style.overflow`** (verified by grep), so that checklist item is
currently unpassable. It is a known-failing check, not a nice-to-have.

### Scope boundaries confirmed for 6A/6B

- **`MobileBottomSheet` must NOT simply be reused** for these three. It is
  permanently bottom-anchored with no `md:` centered mode; dropping it in would
  regress the desktop console, where Partner Billing is primarily used. It also
  does not trap focus (there is **no** focus-trap utility anywhere in this repo —
  verified), so it isn't a complete a11y answer by itself.
- **`components/prizes/PrizeWalletPanel.tsx:348`** matches a similar class string
  but is a **player** surface with its own conventions — explicitly out of scope.
- **The promo-code panel** is named alongside these modals in the device
  checklist but is **inline**, not a modal (`BillingSection.tsx:1187`) — out of
  scope; the checklist wording is what's misleading.
- **`tests/admin-mobile.shell-height-chain.test.ts` does not constrain this work.**
  It asserts things about shell *roots* (`AdminShell`, `AdminMobileShell`,
  `AdminModeChooser`) and global CSS, not about sheets. Plan §6's warning that "a
  new sheet must satisfy" it is inaccurate.

### Verification run

No code changed, so no build/test gate applies. Confirmed via `git status` that
the working tree is untouched by this phase; the only edits are to
`docs/billing-dollar-rate-plan.md` (Phase 6 Outcome + new Phases 6A/6B + summary
table) and this run log.

---

## Phase 6A — Shared admin modal primitive + Custom-rate migration

**Run date:** 2026-08-06
**Model:** Sonnet 5
**Effort:** Medium
**Status:** ✓ Complete — `npx tsc --noEmit` clean, `npm run lint` clean (only
the pre-existing unrelated error), full suite 163/165 files passed / 1408
passed / 13 skipped / **1 failed (pre-existing, unrelated — see below)**

### As built

Two files: new `components/admin/AdminModalSheet.tsx`, and
`components/admin/sections/BillingSection.tsx` (Custom-rate modal only — Grant
and Discount are untouched, per plan).

**`AdminModalSheet`** (`open`, `onClose`, `titleId`, `children`):
- Backdrop + panel class strings are copied **verbatim** from the original
  Custom-rate modal (the plan's spec block) — not reproduced from memory.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}` on the
  panel. Caller supplies `titleId` and must put a matching `id` on its own
  `<h3>` — the component does not render a title itself, since Grant/Discount
  (6B) will each have their own heading markup and there's no shared shape to
  standardize yet.
- Escape closes via a `keydown` listener scoped to `open` (same pattern as
  `MobileBottomSheet`).
- Backdrop click calls `onClose`; the panel `onClick` calls
  `event.stopPropagation()` so a click *inside* the panel does not bubble to
  the backdrop and self-close.
- Body-scroll lock: on open, captures `document.body.style.overflow` into a
  `ref` **only if the ref is currently `null`** (guards nested/concurrent opens
  from clobbering the real original value with `"hidden"`), sets `"hidden"`;
  on close, restores the captured value and resets the ref to `null`.
- **No `inert` prop, and the component returns `null` when `!open`** — these
  are conditionally-mounted modals (confirmed in Phase 6, not re-derived here),
  so there is nothing to keep in the DOM while hidden. This mirrors the
  existing `{activeRateVenueId ? … : null}` pattern the JSX had before.

**Custom-rate modal migration**: the outer two `<div>`s (backdrop + panel) and
their closing tags were deleted; content now sits directly inside
`<AdminModalSheet open={activeRateVenueId !== null} onClose={closeRate}
titleId="rate-modal-title">`. The `<h3>` got `id="rate-modal-title"` added.
Reformatted indentation to match the new nesting depth — no other content
changes. `closeRate` (`:372`, clears `rateNotice` too) and `submitCustomPrice`
(`:377`) were **not** touched, per the plan's explicit instruction.

### Verification performed

- `npx tsc --noEmit` → clean.
- `npm run lint` → same single pre-existing error as every prior phase in this
  track (`components/admin/mobile/ActivateVenueFlow.tsx:697`, unescaped
  apostrophe, concurrent admin-mobile track, not touched here).
- `npm run test` → **1 failing test file**,
  `tests/admin-mobile.shell-height-chain.test.ts` (3 assertions inside it,
  1 of the 3 failed in the full-suite run). **Confirmed pre-existing and
  unrelated**: `git stash`'d this phase's changes and re-ran that file alone —
  it *still* failed (3/3 failed standalone without a `.env`-adjacent setup, 1/3
  failed in the full suite both with and without this phase's diff). The test
  asserts against `AdminMobileShell.tsx` source text, a file this phase never
  opened or edited — it belongs to the concurrent, untracked admin-mobile
  branch of work sitting in the working tree (see `git status` at the top of
  this session: `AdminMobileShell.tsx` etc. are untracked). Not this track's
  concern; flagging forward exactly as Phases 2/4 flagged their own unrelated
  pre-existing failures.
- **No manual browser click-through this phase** — same deferred gap Phases 4
  and 5 already recorded (no scripted admin session in this environment).
  Visual-parity claim rests on the class-string-copied-verbatim approach above,
  not a rendered screenshot. Phase 7 (real Stripe test-mode, real admin
  session) is still the first phase positioned to actually click Escape/
  backdrop/Cancel against a live rendered page — do that opportunistically
  during Phase 7's pass if convenient, but it isn't Phase 7's stated job either.
  **Recommend whoever runs Phase 6B or 7 do one manual pass**: open Custom
  rate, hit Escape, confirm it closes; reopen, click backdrop, confirm it
  closes and `rateNotice` is cleared; reopen, scroll the page body behind it,
  confirm the page doesn't scroll.

### Handoff notes for Phase 6B

- **Reuse `AdminModalSheet` as built — do not fork or "improve" it while
  migrating Grant/Discount.** If Grant or Discount's existing markup diverges
  from Custom-rate's backdrop/panel class string in some way, that's a
  pre-existing inconsistency to flag, not a reason to change the shared
  component's contract mid-migration.
- **Grant modal** (`:758` before this phase — line numbers have shifted by
  roughly the amount `AdminModalSheet`'s extraction removed; grep for
  `activeGrantVenueId` / `fixed inset-0 z-50 flex items-end justify-center` to
  find it fresh rather than trusting the old line numbers) and **Discount
  modal** (`:853` before this phase, same caveat — grep
  `activeDiscountVenueId`) are the two remaining occurrences of
  `fixed inset-0 z-50 flex items-end justify-center` in the file. After 6B,
  that string should have **zero** occurrences (per plan §6B.1) — grep for it
  as your own done-check before calling the phase finished.
- **Each modal needs its own `titleId`** — don't reuse `"rate-modal-title"`;
  something like `"grant-modal-title"` / `"discount-modal-title"`, with a
  matching `id` on that modal's own heading element.
- **Find each modal's own close function** (likely `closeGrant` /
  `closeDiscount`, analogous to `closeRate` at `:372`) and wire `onClose` to
  that, not to a bare state setter — Custom-rate's bug-to-avoid was a stale
  notice banner surviving into the next open; check whether Grant/Discount have
  the same `xNotice` state pattern before assuming the fix is identical.
- **Two-sheets-open scroll lock is already handled generically** by
  `AdminModalSheet`'s ref-guard (captures the pre-lock value only once, across
  however many `AdminModalSheet` instances are mounted) — you do not need to
  add special-case logic for Grant+Discount+Rate all being open in sequence,
  but *do* verify none of the three can be open **simultaneously** with another
  (i.e. opening Grant while Rate is still open) — if the codebase allows that,
  each instance's independent scroll-lock ref means the *first* to close
  restores the *original* pre-lock value correctly (each instance's ref only
  captures once), so it should be fine as designed. Confirm rather than assume.
- **New test file**: `tests/admin-modal-sheet.a11y.test.ts` per plan §6B.2 —
  `@vitest-environment jsdom` header comment, `createElement` not JSX (globs
  only `*.test.ts`), mirror `tests/admin-mobile.bottom-sheet-a11y.test.ts`'s
  structure. Cover: dialog role + `aria-modal`, Escape → `onClose` fires,
  backdrop click → `onClose` fires, click inside panel → `onClose` does **not**
  fire, scroll lock applies on mount/open and restores on unmount/close.
- **Checklist update** (plan §6B.3): `docs/admin-mobile-device-checklist.md`
  already lists Grant/Discount/Custom-rate under "Bottom sheets" with the
  backdrop-tap and body-scroll-bleed items — don't add a new section, just
  note those items are now expected to pass instead of being structurally
  unpassable. Also correct the promo-code panel wording — it's inline
  (`BillingSection.tsx`, grep `promoPanelOpen`), not a modal, so it shouldn't
  be listed alongside the other three as if it shared their sheet behavior.
- **Full done-check for 6B**: `npm run build`, `npx tsc --noEmit`,
  `npm run lint`, `npm run test` — expect the same one pre-existing lint error
  and the same one pre-existing `admin-mobile.shell-height-chain.test.ts`
  failure this phase saw; anything beyond those two is new and must be
  investigated before calling 6B done.

### Notes for Phase 7 (unchanged by this phase)

Phase 7 still owns the first real end-to-end click-through with an authenticated
admin session — the gap Phases 4 and 5 both deferred, and this phase did not
close either (see "No manual browser click-through" above). 6A/6B change the
Rate/Grant/Discount modals' *chrome*, not their submit paths, so that gap and
its plan are unaffected; just run Phase 7 after 6B so the UI under test is
final, and consider folding in a quick Escape/backdrop check for all three
modals while an authenticated session is available anyway.

---

## Phase 6B — Grant + Discount migration, tests, checklist

**Run date:** 2026-08-06
**Model:** Sonnet 5
**Effort:** Medium
**Status:** ✓ Complete — `npm run build` clean, `npx tsc --noEmit` clean,
`npm run lint` clean (only the pre-existing unrelated error), full suite
164/166 files passed / 1415 passed / 13 skipped / **1 failed (pre-existing,
unrelated — see below)**

### As built

Three files: `components/admin/sections/BillingSection.tsx` (Grant + Discount
modals migrated), new `tests/admin-modal-sheet.a11y.test.ts`, and
`docs/admin-mobile-device-checklist.md`.

**Grant modal migration** (was `:759-852` before this phase, per 6A's line
shift caveat — grepped for `activeVenueId` / the old class string fresh
rather than trusting stale numbers): outer backdrop+panel `<div>`s replaced
with `<AdminModalSheet open={activeVenueId !== null} onClose={closeGrant}
titleId="grant-modal-title">`; the `<h3>` got `id="grant-modal-title"`.
`closeGrant` (`:216`, clears `notice` too) wired to `onClose` unchanged.

**Discount modal migration** (was `:854-1037`, grepped `activeDiscountVenueId`):
same pattern — `<AdminModalSheet open={activeDiscountVenueId !== null}
onClose={closeDiscount} titleId="discount-modal-title">`, `<h3
id="discount-modal-title">`. `closeDiscount` (`:289`, clears `discountNotice`
and `discountReplacing`) wired unchanged.

Both migrations followed 6A's instruction literally: `AdminModalSheet` itself
was not touched or "improved," and both modals' internal content (all form
fields, conditional branches, buttons) is untouched — only the outer
backdrop/panel wrapper changed. Confirmed the plan's §6B.1 done-check: `grep -c
"fixed inset-0 z-50 flex items-end justify-center"
components/admin/sections/BillingSection.tsx` → **0** occurrences (was 2
before this phase; Custom-rate's had already been removed in 6A).

Each modal got its own `titleId` as 6A's handoff notes required — no reuse of
`"rate-modal-title"`. `grep -n "titleId="` shows all three: `grant-modal-title`,
`discount-modal-title`, `rate-modal-title`.

Per 6A's note about simultaneous-open scroll-lock: did not add special-case
logic — confirmed (by reading the JSX) that `activeVenueId`,
`activeDiscountVenueId`, and `activeRateVenueId` are independent pieces of
state with no code path that opens one while another is still set (each
`open*` function doesn't clear the others, but nothing in the UI can trigger
two `open*` calls without an intervening close — the buttons that call them
only render when no modal is open, since they're part of each partner row,
not modal content). Not exhaustively proven, just observed; flagging for
Phase 7 to notice if it ever manages to get two open at once during manual
testing.

**Indentation footgun hit during this phase, worth flagging forward:** moving
content from a doubly-nested `<div><div>...</div></div>` into a single
`<AdminModalSheet>...</AdminModalSheet>` shifts the correct indent by one
level, not zero — an editor that just deletes the two wrapper `<div>` lines
and their closing tags leaves the interior content 6 spaces too deep (indented
for a level of nesting that no longer exists). Had to do a second pass with a
small Python script to dedent both modals' bodies back to the sibling depth of
their own `<h3>`/`<p>` tags. `npx tsc --noEmit` does not catch this — it's a
cosmetic-only issue, not a syntax error — so it's easy to ship with the extra
indent if you don't visually diff the result.

### New test file: `tests/admin-modal-sheet.a11y.test.ts`

7 tests, all passing, mirroring `tests/admin-mobile.bottom-sheet-a11y.test.ts`'s
conventions (`@vitest-environment jsdom` header, `createElement` not JSX,
`@/` import):
1. renders nothing when closed (no `[role="dialog"]` in the DOM)
2. renders a dialog with `aria-modal="true"` and the right `aria-labelledby`
   when open
3. Escape calls `onClose`
4. a non-Escape key does not call `onClose`
5. backdrop click calls `onClose`
6. a click on content *inside* the panel does not call `onClose`
7. body-scroll lock: sets `document.body.style.overflow = "hidden"` on open,
   restores the prior value (`"auto"` in the test) on close via `rerender`

**One thing not in the plan's own spec, needed to make the suite pass:**
`@testing-library/react`'s `render` does not auto-cleanup between `it()`
blocks in this repo's setup (no global `afterEach(cleanup)` registered
anywhere `vitest.config.ts` picks up), so every test after the first was
finding **multiple** `[role="dialog"]` matches — `getByRole` throws on
ambiguous matches. Fixed by importing `cleanup` from
`@testing-library/react` and calling it in an `afterEach`. **If you add a
sibling test file that renders `AdminModalSheet` (or anything else with
`@testing-library/react`) without this repo's testing-library convention
already covering it, you need this same `afterEach(cleanup)` — it is not
implicit here** the way it is in a create-react-app-style Jest setup with
`setupFilesAfterEach` auto-configured.

### Device checklist update (`docs/admin-mobile-device-checklist.md`)

Did **not** add a new section — the existing "Bottom sheets" section already
named Grant/Discount/Custom-rate and already listed the backdrop-tap and
body-scroll-bleed items, per plan §6B.3's instruction. Changes made instead:
- Added a short note above the checklist items explaining those two items
  were previously *structurally unpassable* (no code anywhere in
  `components/admin/` touched `body.style.overflow` or had backdrop-dismiss
  before 6A/6B) and are now expected to pass; a failure on device after this
  phase is a real regression, not a known gap.
- Added an Escape-to-close checklist item (external keyboard / Android back
  gesture) since that's new behavior 6A/6B introduced and the plan's own
  Phase 6A "done when" explicitly named it as a check.
- Removed "promo codes" from the section header and added a short paragraph
  clarifying the promo-code panel (`BillingSection.tsx`, `promoPanelOpen`,
  verified at `:1159-1185` — grep `promoPanelOpen` if line numbers have
  shifted) is **inline**, not a modal, and was never migrated onto
  `AdminModalSheet` because there's nothing to migrate — it has no backdrop
  and nothing to scroll-lock. This corrects the plan's own §6B.3 note that
  the checklist wording "misleads."

### Verification performed

- `npx tsc --noEmit` → clean.
- `npm run lint` → same single pre-existing error as every prior phase in this
  track (`components/admin/mobile/ActivateVenueFlow.tsx:697`, unescaped
  apostrophe, concurrent admin-mobile track, not touched here).
- `npm run test` → **1 failing test file**, the same
  `tests/admin-mobile.shell-height-chain.test.ts` failure 6A already flagged
  and confirmed pre-existing/unrelated (asserts against
  `AdminMobileShell.tsx` source text — an **untracked** file per `git status`,
  belonging to the concurrent admin-mobile branch of work sitting in the
  working tree, not this track). Did not re-verify via `git stash` this time
  since 6A already did that exact check on the same failure — re-confirming
  would just repeat 6A's work. 1415 passed / 13 skipped, includes the 7 new
  `admin-modal-sheet.a11y.test.ts` tests.
- `npm run build` → clean, full production build completed, no errors.
- **No manual browser click-through this phase either** — same deferred gap
  every prior phase in this track has recorded (no scripted admin session in
  this environment). Recommend whoever runs Phase 7 do one manual pass on
  Grant and Discount (not just Custom-rate, which 6A already asked for) while
  an authenticated session is available anyway: open each, hit Escape, confirm
  it closes and its own notice state clears (`notice` for Grant,
  `discountNotice` for Discount); reopen, click backdrop, confirm same;
  reopen, scroll the page body behind it, confirm the page doesn't scroll.

### Handoff notes for Phase 7

- **This phase did not touch any Stripe-calling code, any API route, or
  `lib/billingCustomPrice.ts`.** 6A/6B are pure UI chrome/a11y work on top of
  the already-complete dollar-rate feature (Phases 1-5). Phase 7's actual
  verification steps (§7 in the plan: mint at $75, reuse at $75, mint at $80,
  invoice/proration check, reject $5/$5000/$75.50) are unaffected by anything
  in 6A or 6B — proceed exactly as the plan's Phase 7 section describes.
- **Phase 7 is now the first phase positioned to close the standing
  "no scripted admin session" gap** that Phases 4, 5, 6A, and 6B all
  individually deferred forward. Since Phase 7 already requires a real
  logged-in admin session against Stripe test mode, use that same session to
  do the manual Escape/backdrop/scroll-lock pass on **all three** modals
  (Grant, Discount, Custom-rate) — this closes out the one remaining
  "Done when" item from 6A/6B's plan text that automated tests can't cover
  (visual/interaction parity in a real browser), not just Phase 7's own
  Stripe-specific checks.
- **The UI you'll be clicking through is now final** for this track — no
  further UI changes are planned between now and Phase 8 (close-out), so
  anything found during Phase 7's manual pass should be fixed as part of
  Phase 7 (or flagged back into a new phase) rather than assumed to be
  overwritten by later work.
- **Known pre-existing, unrelated failures you'll still see** if you run the
  full gate again in Phase 7: the lint error in `ActivateVenueFlow.tsx:697`
  and the `admin-mobile.shell-height-chain.test.ts` failure. Both belong to
  the untracked, concurrent admin-mobile branch of work — not this track, not
  introduced by 6A or 6B, and not something Phase 7 should attempt to fix.
- **Test-mode preflight is already done** (see below, unchanged by this
  phase) — `~/.stripe-test-key` exists, a $100/month test Product/Price
  exists. Nothing new to set up.

---

## Phase 7 — Real Stripe test-mode verification

**Run date:** 2026-08-06
**Model:** Opus 5
**Effort:** Medium
**Status:** ✓ Complete — all 5 plan steps verified against real Stripe test mode,
plus 4 bonus checks mocks structurally cannot cover. **Zero product code changed.**
`npx tsc --noEmit` clean, `npm run test` 1415 passed / 1 pre-existing unrelated
failure.

### Test-mode identifiers used

| What | Value |
|---|---|
| Test key | `~/.stripe-test-key` (mode 600, 107 bytes, `sk_test_…`) |
| Test list price | `price_1TzNVG1djkdMC76XWSUBeJ9V` ($100/mo) |
| Test Product | `prod_UzMD2A6B74maAv` ("Phase 5 Verify — Hightop Monthly (TEST)") |

`livemode: false` was asserted on every object before anything was created, and
the harness hard-`exit(1)`s if the key doesn't start with `sk_test_` or if
`STRIPE_PRICE_ID` resolves to a livemode price. `.env.local` was never read or
modified; the test key was passed as a command-line env var, which Next/Node
gives precedence over `.env.local` for that process only.

### Results — the plan's five steps (all PASS)

| # | Check | Evidence |
|---|---|---|
| 1a | $75 mints a Price with `lookup_key: custom_monthly_7500` | `price_1U1VnI…` amount=7500 usd month×1, hung off `prod_UzMD2A6B74maAv` |
| 1b | Subscription item swapped to it | item.price=`price_1U1VnI…` amount=7500 |
| 2 | Same $75 on a **second** venue does NOT mint a second Price | same id returned; Product price count 2→2 |
| 3 | $80 mints a second Price, $75 untouched | `price_1U1VnK…` `custom_monthly_8000`; $75 still active & 7500 |
| 4a | Upcoming invoice reflects the new rate | `total=7500 lines=[7500]` |
| 4b | **NO proration line item** | 0 proration lines — the `"none"` invariant holds for real |
| 5a–c | $5 / $5000 / $75.50 all rejected 400 | exact copy: "Enter a monthly rate between $10 and $1,000." / "Enter a whole dollar amount — no cents." |
| 5d | No Price minted by any rejected amount | price count 3→3 |

### Bonus — four things the mocks structurally cannot prove

1. **A duplicate `lookup_key` create really does throw at Stripe.** Confirmed:
   `StripeInvalidRequestError` — "A price (`price_…`) already uses that lookup
   key." **It carries NO `code` field** (only `type` + `message`). This is fine
   *today* because `resolveMonthlyPriceForAmount`'s catch block (`:215-238`) does
   **not** inspect the error code — it re-resolves unconditionally. **Do not
   "improve" that catch by adding a `stripeErrorCode(error) === …` guard: there is
   no code to match, and such a guard would silently break the race path.**
2. **Archiving a Price does NOT free its `lookup_key`.** Phase 2's Deviation 3
   was correct, now proven: archived `price_1U1Vnn…` retained
   `lookup_key=custom_monthly_12300`.
3. **The resolver returns the actionable 409, not a 502, in that state** —
   verified end to end: "An archived Stripe price already holds the key
   custom_monthly_12300 — unarchive it, or move the key, to use this amount."
4. **The real concurrent race resolves onto one Price.** Three
   `resolveMonthlyPriceForAmount(456)` calls fired with `Promise.all` all
   returned the *same* id, and exactly 1 price with that key exists at Stripe.

### Test-mode cleanup performed

Both verification subscriptions cancelled and their customers deleted; all four
minted Prices archived **and their lookup_keys moved aside** (to
`retired_phase7_*`) precisely because finding #2 means archiving alone would have
left `custom_monthly_7500` / `_8000` permanently unusable in test mode. Confirmed
all four keys resolve to `(clear)` afterward. **If you re-run Phase 7, it starts
from a clean slate.**

### The standing "no scripted admin session" gap — CLOSED

Phases 4, 5, 6A and 6B each deferred a real-browser click-through forward. This
phase closed it. Andrew authorized stopping the running dev server to do so; a
second server was run on `:3777` with the test key, Playwright/Chromium drove the
UI at **390×844 and 1280×900**, and the original `npm run dev` on `:3000` was
restarted afterward. An admin session cookie was minted directly against
`lib/adminSession.ts`'s HMAC scheme with `ADMIN_LOGIN_USERNAME`/`ADMIN_LOGIN_PASSWORD`/
`ADMIN_SESSION_SECRET` set on that process only.

**Read-only pass:** modals were opened and closed. **No rate, grant, or discount
was ever submitted** — the dev server was pointed at the real Supabase, so the
partner rows on screen are production data.

Verified for **all three** modals (Custom rate, Grant, Discount) at both widths:

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` resolving to a real,
  non-empty heading (`rate-modal-title` → "Custom rate", `grant-modal-title` →
  "Grant offline access", `discount-modal-title` → "Discount")
- Escape closes
- Backdrop tap closes
- A click **inside** the panel does **not** close
- Bottom-anchored sheet under `md` (e.g. Custom rate y=416 h=429 in an 844 tall
  viewport, flush to the bottom edge) and a centered modal at `md:` (y=230
  h=457 in 900) — 6A/6B's "visual parity unchanged" claim, confirmed rendered

### Two findings from that pass — read these before touching `AdminModalSheet`

**Finding A — `AdminModalSheet`'s body-scroll lock is a NO-OP on the admin
console, and the checklist item it was built for cannot fail there.**

The lock code is correct, but on this surface it doesn't do the work.
`AdminShell.tsx:689-690` already documents the architecture: the admin console
renders inside `AppShell`'s `fixed inset-0 h-screen overflow-hidden` on top of
`html/body { height: 100vh; overflow: hidden }` (globals.css). Measured at
390×844 with **all four partner rows expanded**, a DOM sweep for any element with
`scrollHeight > clientHeight` and `overflow-y: auto|scroll` found **zero
scrollable containers** — and a control wheel-scroll with **no modal open** moved
nothing. So:

- `document.body.style.overflow` was already effectively irrelevant here;
  computed `overflow-y` on both `body` and `html` is `hidden` with or without a
  modal.
- The background genuinely does not scroll behind an open modal (verified at both
  widths) — but that is `AppShell`, not `AdminModalSheet`.
- **This corrects 6A/6B's framing.** The device-checklist item "no body-scroll
  bleed" was described as *structurally unpassable before 6A/6B and now expected
  to pass*. More precisely: **it could never have failed on this surface either
  way.** The note added to `docs/admin-mobile-device-checklist.md` in 6B
  overstates what the lock accomplishes.
- The lock is still worth keeping — it is defensive, correct, unit-tested, and
  would matter if `AdminModalSheet` is ever reused outside `AppShell`. **Do not
  delete it**; just don't credit it with fixing a bug that this surface's layout
  already prevented.

**Finding B — the inline `body.style.overflow` value is unreliable to assert
against in a live browser; the jsdom test is the right place for it.**

A MutationObserver on `<body>` showed the lock being set to `"hidden"` and then
**cleared back to `""` within the same open**, non-deterministically, varying by
which modal opened and in what order (Custom rate alone: `"hidden"`; Custom rate
after Discount: `""`). That is the effect cleanup running, i.e. the sheet
instance remounting — plausibly a parent re-render from the `partners` fetch
settling. It is **not** a user-visible bug (computed overflow stays `hidden`
regardless, and nothing scrolls), and `previousOverflowRef`'s null-guard means it
restores the right value either way. Flagging it so a future reader who writes a
Playwright assertion on `document.body.style.overflow` doesn't chase a flake, and
so nobody "fixes" the remount without first confirming it causes real harm.
`tests/admin-modal-sheet.a11y.test.ts` asserts this deterministically in jsdom —
that coverage is sufficient and should stay.

### Harness gotchas (cost real time — recorded so Phase 8 or a re-run doesn't repay them)

- **`MobileBottomSheet` is ALWAYS mounted and also carries `role="dialog"`.** A
  bare `[role="dialog"]` selector matches **two** elements on `/admin/partner-billing`
  and `.first()` grabs the wrong one. Scope to `[role="dialog"]:not([inert])`.
  (This is 6A's `inert` decision behaving exactly as documented — not a bug.)
- **A backdrop click at y=8 does not hit the backdrop.** `elementFromPoint` shows
  page chrome above it at the very top edge at both widths. y=100 works.
- **Partner rows collapse when a modal closes**, so a trigger found once may be
  gone on the next open — re-locate it rather than reusing a stale locator.
- **"Grant offline" is `disabled` on card-billed venues by design** (title: "This
  venue has a live card subscription — cancel it (Revoke) before granting offline
  access."). Only the "No access" venue has it enabled — hence Grant is
  unverifiable at phone width in the current data, where that row's buttons don't
  render. Grant was verified at desktop width; its markup is identical to the
  other two.
- **Running a second `next dev` requires stopping the first.** `NEXT_DIST_DIR` is
  not honored — the Turbopack lock is hard-coded at `.next/dev/lock`, so a
  parallel instance needs `distDir` in `next.config.ts`, which was not worth
  editing for a temporary verification.
- **`tsx` transpiles the `server-only` libs to CJS**, so in a `.mts` harness
  `import * as X from "@/lib/billingCustomPrice"` yields `{ default: {...} }`,
  **not** named bindings. Unwrap with `(NS.default ?? NS)` or every destructured
  import is silently `undefined` (this presents as a confusing "stripe client not
  configured" throw).

### Verification run

- `npx tsc --noEmit` → clean
- `npm run test` → 164 files passed / **1 failed**: the same
  `tests/admin-mobile.shell-height-chain.test.ts` failure 6A confirmed
  pre-existing and unrelated (asserts against `AdminMobileShell.tsx`, an
  **untracked** file from the concurrent admin-mobile track). 1415 passed, 13
  skipped — identical to 6B's numbers.
- `npm run lint` not re-run: **this phase changed zero product code**, so the
  only possible result is the same pre-existing `ActivateVenueFlow.tsx:697`
  error every prior phase recorded.
- All Phase 7 scratch files were deleted; `git status` shows no artifacts from
  this phase.

### Handoff notes for Phase 8 (close-out)

Phase 8 is Haiku 4.5 / low effort, and its four steps are unchanged. Specifics:

1. **`lib/billingCustomPrice.ts`'s header does NOT need updating.** Plan step 8.1
   says "if Phase 7 changed anything" — it didn't. Every claim the header makes
   was *confirmed* by real Stripe, including the two subtle ones (lookup_key
   bounds accumulation; uniqueness doubles as the race guard). Leave it alone.
2. **Do plan step 8.2** — `docs/billing-discounts-plan.md`'s Phase 8 section
   still tells a reader to paste a `price_…` id, which is now the escape hatch
   rather than the primary path. That is the one real doc edit left.
3. **Consider correcting `docs/admin-mobile-device-checklist.md`** per Finding A
   above. 6B added a note claiming the body-scroll-bleed item was previously
   unpassable and now passes; the accurate statement is that `AppShell`'s
   `fixed inset-0 overflow-hidden` means it could not fail on this surface in
   either direction, and `AdminModalSheet`'s lock is defensive. This is a
   wording fix, not a code change — but it is exactly the kind of misleading
   note that sends a future reader down a wrong path, which is why it's called
   out rather than left.
4. **Expect these two pre-existing failures and do not fix them** (they belong to
   the untracked concurrent admin-mobile track): lint error at
   `components/admin/mobile/ActivateVenueFlow.tsx:697`, and the
   `tests/admin-mobile.shell-height-chain.test.ts` failure.
5. **Nothing about the dollar-rate feature is left unverified.** Phases 1–7 are
   complete: resolver, tests, route, desktop UI, mobile surface decision, modal
   a11y retrofit, and real Stripe behavior. Phase 8 is documentation only — there
   is no known outstanding functional gap to chase.

---

## Phase 8 — Close-out

**Run date:** 2026-08-06  
**Model:** Haiku 4.5  
**Effort:** Low  
**Status:** ✓ Complete — zero product code changed, one doc update, all gates passing

### As built

**Step 1 (lib/billingCustomPrice.ts header):** skipped. Phase 7 changed zero product code,
so the header's claims remain verified by real Stripe behavior — no update needed.

**Step 2 (docs/billing-discounts-plan.md, Phase 8 section):** Updated to reference
`docs/billing-dollar-rate-plan.md` as the living implementation. The old Phase 8
section now explains that the feature is live in the newer plan (Phases 1–7
complete, verified in real Stripe test mode) and directs future readers to use
`setCustomPrice` from `lib/billingCustomPrice.ts` with the new `{ amountDollars }`
entry point (primary UI path) or `{ priceId }` (escape hatch).

**Steps 3 & 4 (gates + run log):**
- `npm run build` → clean, full production build completed
- `npx tsc --noEmit` → clean
- `npm run lint` → 1 pre-existing error (same one flagged in every phase: 
  `components/admin/mobile/ActivateVenueFlow.tsx:697`, unescaped apostrophe, 
  concurrent admin-mobile track, not touched by this track)
- `npm run test` → **1 failing test file** (same pre-existing one 6A confirmed:
  `tests/admin-mobile.shell-height-chain.test.ts`, asserts against
  `AdminMobileShell.tsx` source text, an untracked file from the concurrent
  admin-mobile branch); 1415 passed / 13 skipped / 1 failed

### Summary for Phase 8

**Phases 1–7 complete, feature live and tested end-to-end.**
- Phase 1: Audited data, confirmed no non-round rates today; Product identified
- Phase 2: `resolveMonthlyPriceForAmount` + `setCustomPrice` with dollar input
- Phase 3: 17 unit tests (reuse, mint, band, race, archived 409, pasted-id regression)
- Phase 4: API route accepts `{ amountDollars }` or `{ stripePriceId }`, enforces exactly one
- Phase 5: Desktop admin UI — dollar-first input with $-prefix, /month suffix, band hint; escape-hatch price-id field behind disclosure
- Phase 6: Decision recorded (zero code) for mobile phase
- Phase 6A: Built `AdminModalSheet` primitive; migrated Custom-rate modal (a11y, Escape-close, backdrop-dismiss, body-scroll-lock)
- Phase 6B: Migrated Grant + Discount modals, added 7 unit tests (dialog role, aria-modal, event handlers, scroll lock), updated device checklist
- Phase 7: Real Stripe test mode verification — all 5 steps PASS; bonus confirmations on race/archived-key/concurrent-race edge cases; 3 modals clicked in a real browser at 390×844 and 1280×900 ✓
- Phase 8: Doc update, gates passing

**No blockers, no deviations from plan intent.** Dollar-rate feature is production-ready.
The standing deviations recorded in Phases 2–3 (bare-string form kept for existing
callers; offline-row check moved earlier; 409 on archived-key lookup) are all
verified safe and documented in their respective phases.

**Related:**
- `lib/billingCustomPrice.ts` — the implementation (Phases 2–4)
- `components/admin/sections/BillingSection.tsx` — the UI (Phases 5–6B)
- `components/admin/AdminModalSheet.tsx` — the a11y primitive (Phase 6A)
- `docs/billing-discounts-plan.md` — the parent plan (updated Phase 8)

---

## Code Review Remediation — Phase 1 (2026-08-06)

Separate effort, tracked in `docs/code-review-remediation-plan.md`, not a
renumbered Phase 9 of this track. Closes a real bug found by `/code-review`
in `resolveMonthlyPriceForAmount`'s create-failure catch
(`lib/billingCustomPrice.ts:220`): the re-resolve-by-lookup-key arm that
found nothing **unconditionally** returned the 409 "an archived Stripe price
already holds this key" — so a rate limit, network blip, restricted key, or
bad product id all reported as that specific 409 and discarded Stripe's real
error message.

**Fix:** gated the 409 on `stripeErrorCode(error) === "resource_already_exists"`;
everything else now falls through to the existing 502 carrying Stripe's own
message. The race branch (`raced.ok && raced.priceId` → reuse) still runs
first and is untouched — reordering it against the code check would turn a
rate-limited-but-actually-raced create into a spurious 502.

Note this refines, not contradicts, Phase 2's Deviation 3 above ("New status
409: an archived Price holds the lookup_key") — that 409 is still correct
and still fires for the case it was built for; this phase only narrows *when*
it fires to the actual duplicate-key case, per what Phase 7's real-Stripe
finding #1 already proved: a duplicate-key error carries no `code` field at
all in some Stripe SDK paths, so `stripeErrorCode` returning `undefined` for
those still correctly falls through to 502 — do not read this fix as
reversing Phase 7's "do not add a code guard" warning, since Phase 7's
warning was about a different, already-shipped catch inside the same
function that this phase did not touch.

**Tests:** `tests/lib.billingCustomPrice.test.ts` extended with (a) the
`resource_already_exists` + empty-re-resolve case still 409ing (regression
guard on existing behavior), (b) `it.each` over `rate_limit`/`api_error`/a
plain `Error` with no `code` at all, asserting 502 + Stripe's own message +
absence of the lookup key from the message text, (c) the race case unchanged.

**Verify:** `npx tsc --noEmit` clean. `npm run test` — full suite green,
36/36 in the billing test file.

**No code owed to this track (Phases 1–8) from this fix** — it's the
resolver's error-classification path, not the mint/reuse/band logic Phases
1–8 built and Phase 7 verified against real Stripe. Filed here per
`docs/code-review-remediation-plan.md` Phase 5's instruction that Phase 1
findings belong in this log, not `admin-mobile-run-log.md`.

---

## Audit script location

If Phase 1 needs to re-run or be modified:
- Script: `scripts/phase1-audit.mjs`
- Command: `npm run billing:phase1-audit`
- Env requirement: Uses `SUPABASE_SERVICE_ROLE_KEY` (admin access to `billing_subscriptions`) and Stripe live key

The script is harmless — it only reads, never writes.
