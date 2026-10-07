# Square review fixes: Phase R5 handoff (refused reconnect retires the old connection)

**Date:** 2026-10-06 · **Plan:** `docs/square-review-fixes-plan.md` (Phase R5) · **By:** Claude Opus 5.5

## Summary for Andrew (plain English)

- **What changed:** suppose a venue reconnects Square and we refuse it because none of that Square account's
  locations can issue our gift cards (for example, the location was closed). The venue's **old** connection to
  that same account now switches to **"Reconnect needed"**. It no longer says "Connected" while gift cards fail.
  Guests at that venue get the normal coupon, and staff use "Confirm Redemption", until the partner fixes their
  Square location and reconnects.
- **What did not change:** a refused connection to a *different* Square account leaves the old one working. Other
  venues on the same Square account are untouched. Nothing is ever revoked at Square by this change.
- **One trade-off:** while a venue shows "Reconnect needed", a guest who already has a Square gift card from that
  venue can't reopen it in our app. The card still works at the register. Every "Reconnect needed" state already
  behaves this way.
- **Is it live?** No. It is built and tested but **not committed**. It ships in the same push that turns the
  Square switch on (your OK needed).
- **Cost:** none in normal use. No extra Square calls, and one small database write only when a reconnect is refused.

---

## For the next agent

### 1. Goal and scope
- R5 is the last phase of this plan. It answers R4 open question 3. Out of scope: catching a location that closes
  *without* a reconnect (needs a Square read per card open; revisit only if the 2h pilot shows it).

### 2. Starting state
- Branch `main`. HEAD `12bfa6b` (R1–R4), pushed to `origin/main`; Vercel's git integration auto-deployed it to production as
  `dpl_6ngtBVrxU4PGScpA1nYB21hGXRqp` (aliases `hightopchallenge.com`, `play.hightopchallenge.com`), Ready 2026-10-06
  ~19:31 ET. Flag `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` still unset in production.
- **R5 is uncommitted** in: `lib/pos/squareConnection.ts`, `app/api/owner/pos/square/callback/route.ts`,
  `tests/lib.pos-square-hardening.test.ts`, `tests/api.square-routes.test.ts`, plus docs (this file, the fix plan,
  `docs/pos-rewards-integration-plan.md`, its 2h handoff, `docs/square-go-live-runbook.md`, `CLAUDE.md`).
  `clover-spike/` is untracked and is NOT part of any commit: stage by name.
- No migration. No data change from R5 (the 2h pilot coupons are separate; see the 2h handoff).

### 3. Decisions
- Andrew, 2026-10-06: "Let's plan something to fix this as well." The plan and the build are both in this session.
  The fix is small, and the flag-on redeploy has to happen anyway.
- Flip to `error`, not `location_id = null`. A null location would show the picker, and here the account has no
  location to pick. `error` gives "Reconnect needed", which is the true next step.
- Keep the token, so `discardSquareGrant`'s own-row rule still blocks a revoke (pinned by a test).

### 4. Files
- `lib/pos/squareConnection.ts`: new export `markSquareLocationIneligible({ venueId, merchantId, environment })`.
  It is one `update … eq(venue_id, provider, merchant_id, environment, status='active') … select('id')`. It logs
  `[PosSquare] reconnect-location-ineligible` when a row changed, and `[PosSquare] ineligible-save-failed` on error.
- `app/api/owner/pos/square/callback/route.ts`: called in the `no_location` branch and, after `discardSquareGrant`,
  in the `not_eligible` branch.
- Tests: see the plan's R5 "Tests" paragraph.

### 5. Facts and traps
- The callback's `listSquareLocations` returns ACTIVE locations only, which is why "no eligible location" proves
  the saved one is unusable.
- `loadSquareCredentials` requires `status = 'active'` for both new cards AND "Show gift card". That causes the
  trade-off above.
- The `not_eligible` sheet banner ("…this account wasn't connected. Guests keep the normal coupon.") is now true
  for a reconnect as well. The copy is unchanged.

### 6. Verified (2026-10-06)
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **305 files passed, 1 skipped; 3,439 passed,
  13 skipped, 0 failed** (R4 was 3,437; +2). `npm run build` succeeded (exit 0).
- Not verified live: needs a real Square account with a closed location. Not run through `/code-review`. It is
  small enough that a self-review was done; run `/code-review` on it if you want belt and braces.

### 7. Open questions for Andrew
- OK to commit and push R5 together with the flag-on deploy (the push is what redeploys).

### 8. Next steps
- Continue with `docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md`.
- Commit message suggestion: `POS: refused Square reconnect retires the old connection (R5); 2h pilot docs`.
