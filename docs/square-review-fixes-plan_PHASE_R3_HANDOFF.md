# Square review fixes — Phase R3 handoff (shared helpers and one read)

**Date:** 2026-10-06 · **Plan:** `docs/square-review-fixes-plan.md` · **Phase done:** R3 (findings #6, #7, #9)

## Summary for Andrew (plain English)

- **What changed:** tidy-up only. Nothing a guest or partner sees is different.
  - The two places that load a guest's coupon for Square (gift card and menu-item discount) now share one loader, so
    "is this coupon really theirs?" has a single answer.
  - Opening the prize wallet at a Square venue used to read the venue's Square connection twice if it held both a
    gift card and a menu-item coupon. It now reads it once, and not at all when there is nothing to badge.
  - The "user first, then IP" rate limit and the owner POS "flag + sign-in + own venue" check were copy-pasted. Each
    now lives in one place.
- **Is it live?** No. Nothing is committed, pushed or deployed, and the POS switch stays off in production.
- **What's left:** R4 only (your decision on finding #10, the final code and security reviews, then one commit,
  push and deploy with your OK).
- **Needs you:** nothing for R3. R4 starts by asking you the #10 question.
- **Cost:** down slightly. The wallet saves 1 small database read (and one serial round trip) per load at a Square
  venue holding both coupon kinds. It never adds a read.

---

## For the next agent

### 1. Next phase goal and scope
- **R4** (finding #10 + re-review gate; Opus 5.5, high). Read the plan's R4 section. In order:
  1. `AskUserQuestion` for #10: (A) narrow the CLAUDE.md/plan rule (recommended) or (B) add a ledger row for
     catalog discounts. Apply the choice.
  2. `/code-review high` on the whole R1–R4 diff, plus `/security-review`. Fix what is confirmed, record dismissals.
  3. Full gates, then **with Andrew's OK** one commit (`POS: Square review fixes (R1–R4) before 2h, flag still off`),
     push, and an approved deploy. The flag stays off.
  4. Update `docs/pos-rewards-integration-plan.md` status + a note under Phase 2g.
- **Out of scope:** flipping `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`, any `vercel env` write, any migration, Phase 2h.

### 2. Starting state
- Branch `main`, last commit `1130914`. **Nothing from R1–R3 is committed.** Untracked `clover-spike/` and
  `docs/pos-rewards-integration-plan.md`'s one pre-existing line change are not ours; leave them (R4 should not
  `git add -A` blindly; stage the Square files and docs by name).
- Data: none changed. R3 ran no production queries.

### 3. Decisions made (and why)
- **`loadOwnedCoupon` takes a `readFailedLog` label** (`"coupon-read-failed"` for gift cards,
  `"discount-coupon-read-failed"` for discounts) so the existing log lines are unchanged.
- **The two `SQUARE_ERROR_MESSAGE` strings were NOT merged.** They differ on purpose ("Please try again in a minute."
  vs "Staff can still take the prize off by hand."), and behaviour must not change. Each file keeps its own
  constant. What is shared is `squareFail(code, message)` and `NO_PRIZE_MESSAGE` from `lib/pos/squareCoupon.ts`;
  each file's `fail` is now a typed alias of `squareFail`.
- **Expiry and already-redeemed stay at the call sites.** The gift-card path still runs the resume branch
  (`prize_redeemed_at`) *before* the expiry check, so a redeemed, expired card still shows. `isCouponExpired()` is the
  only shared piece (a one-liner).
- **#6 uses a lazy memoised loader instead of the plan's "read once up front, pass the result".** The route builds
  `squareWalletConnectionLoader(venueId)` and passes it to both attach functions as an optional third parameter.
  Each calls it only once it has a coupon it would act on; the loader reads at most once. This keeps the "zero
  queries when nothing to attach" property without the route having to duplicate each function's candidate
  predicate (which would drift). Omit the parameter and each function makes its own loader, so every old caller and
  test is unchanged.
- **The connection select is `id, location_id, scopes`** with the same `venue_id` / `provider=square` /
  `status=active` / `environment` filters as before (the plan's list also named `status`/`environment`; they are
  filtered on, so selecting them adds nothing). A read error is logged once as `[PosSquare] wallet-connection-read-failed`
  (the discount path used to log `wallet-discount-connection-read-failed`; no test or doc referenced either).
- **#9 guard:** `guardOwnerPosVenue(request, venueId)` in `lib/pos/ownerPosGuard.ts`. Order: flag 404 → owner auth
  (thrown response passed through) → empty venue 400 → foreign venue 403; same bodies as before. Used by
  `locations` (GET/POST), `redeemed`, `app/api/owner/pos/route.ts` and `square/disconnect`, all of which matched
  exactly. **Not used:** `square/connect` (auth failure *redirects* to `/owner/login`, and its venue check is a
  single combined 403) and `square/callback` (redirect-style failures, state verification) — different shapes.
  `disconnect` now reads its JSON body before the guard (as `locations` POST already did); the flag/auth responses
  are unchanged because the guard still runs flag → auth before looking at the venue id.
- **#9 limiter:** `rateLimitUserThenIp(request, userId, userBucket, ipBucket)` in `lib/rateLimit.ts`;
  `rateLimitSquareGiftCard` / `rateLimitSquareDiscount` are one-line wrappers with the same names, signatures,
  buckets and user-first order.

### 4. Files created or changed
- **New:** `lib/pos/squareCoupon.ts` (`loadOwnedCoupon`, `isCouponExpired`, `squareFail`, `NO_PRIZE_MESSAGE`,
  `SquareCouponFailCode`); `lib/pos/squareWalletConnection.ts` (`readSquareWalletConnection`,
  `squareWalletConnectionLoader`, types); `lib/pos/ownerPosGuard.ts`; `tests/lib.pos-square-shared-helpers.test.ts`.
- `lib/pos/squareGiftCards.ts` — `openSquareGiftCard` uses the loader/`isCouponExpired`; `attachSquareGiftCardStates`
  takes the optional `loadConnection`.
- `lib/pos/squareDiscounts.ts` — same two changes for `ensureSquarePrizeDiscount` / `attachSquareDiscountStates`.
- `app/api/challenge-campaigns/redeem/route.ts` — builds one loader, passes it to both attach calls.
- `lib/rateLimit.ts` — `rateLimitUserThenIp` + wrappers.
- `app/api/owner/pos/route.ts`, `redeemed/route.ts`, `square/locations/route.ts`, `square/disconnect/route.ts` — use the guard.
- `tests/lib.pos-redeemed-rewards.test.ts` — the one existing test changed: it source-greps the redeemed route for
  `isPosIntegrationsEnabled()` / `requireOwnerAuth` / `auth.venueIds.includes(venueId)`. Those strings moved to the
  guard, so the test now asserts the route calls `guardOwnerPosVenue(request, venueId)` and the guard holds the
  three checks. Every other existing test is untouched.
- Status lines: `docs/square-review-fixes-plan.md`, `docs/pos-rewards-integration-plan.md`.

### 5. Facts and traps
- `tests/api.square-routes.test.ts` mocks `@/lib/rateLimit` and `@/lib/pos/squareGiftCards` etc. wholesale; it needed no change.
- Static source-grep tests exist for these routes (see `tests/lib.pos-redeemed-rewards.test.ts`). If R4 moves more
  text, run `npm run test` and expect this class of failure.
- `lib/pos/squareStuckClaims.ts` has its own coupon reads (admin list); deliberately not folded into `loadOwnedCoupon`
  (no ownership check there).
- Do not run `tsc` and `npm run build` at the same time (`.next/types` is regenerated).

### 6. Build, run, test — what was verified (2026-10-06, final R3 code, with R1+R2 present)
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note on `lib/sportsBingo.ts`).
- `npm run test`: **305 files passed, 1 skipped; 3,434 tests passed, 13 skipped, 0 failed** (R2 ended at 3,419; +15
  new tests in `tests/lib.pos-square-shared-helpers.test.ts`).
- `npm run build`: succeeded.

**New tests** (`tests/lib.pos-square-shared-helpers.test.ts`): `loadOwnedCoupon` (own coupon; someone else's /
another venue's / missing all `not_found`; `22P02` → `not_found`; other error → `unavailable` + log);
`isCouponExpired`; the loader reads nothing until asked and once for many callers; flag off → no read, read error →
`{ ok: false }`; **a venue with both coupon kinds makes exactly one `pos_connections` read** and both coupons still get
their badge; nothing to attach → zero reads; failed read leaves both lists untouched; `rateLimitUserThenIp` order and
"a denied user never claims the IP bucket"; `guardOwnerPosVenue` 404 / thrown response / 400 / 403 / ok.

**Unverified:** nothing runs against a real Square or a browser (flag off). Behaviour parity rests on the existing
gift-card, discount, hardening, route and wallet tests all passing unchanged.

### 7. Open questions for Andrew
None from R3. Still open for R4: #10 (A narrow the rule / B add a ledger row), and commit/push/deploy approval. The
R2 open point (a refused reconnect keeps an old, possibly now-ineligible location) is still for Andrew to weigh before 2h.

### 8. Recommended first steps for R4
- Opus 5.5, high. Ask #10 first. Then run `/code-review high` and `/security-review` over `git diff` + the untracked
  Square files (`lib/pos/squareClaim.ts`, `squareCoupon.ts`, `squareWalletConnection.ts`, `ownerPosGuard.ts`, the new
  tests, the three handoffs and the plan). Stage by name, not `git add -A` (`clover-spike/` is not ours).
