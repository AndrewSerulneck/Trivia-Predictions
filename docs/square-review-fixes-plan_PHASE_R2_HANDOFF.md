# Square review fixes — Phase R2 handoff (Square connection safety)

**Date:** 2026-10-06 · **Plan:** `docs/square-review-fixes-plan.md` · **Phase done:** R2 (findings #2, #5, #4)

## Summary for Andrew (plain English)

- **What changed:**
  - **Reconnecting Square can no longer break a working connection.** If a partner reconnects and their Square
    account now fails our checks (no US-dollar location), we used to hand the new permission back to Square.
    Square treats that as "end everything this app has for this account", which also killed the venue's
    existing, working connection. Now, if the venue (or another venue on the same Square account) is already
    connected, we just drop the new permission unused.
  - **The dashboard's "Square needs reconnecting" line now only appears for Square problems.** Before, a future
    Clover problem would have shown the Square wording.
  - **A greyed-out location now gives the right reason:** "(must be a US location using US dollars)" instead of
    always "(not US dollars)".
- **Is it live?** No. Nothing is committed, pushed or deployed, and the POS switch stays off in production.
  Phase R4 does the one commit for all four phases.
- **What's left:** R3 (shared-code tidy-up), then R4 (your decision on finding #10, the final reviews, then
  commit/push/deploy with your OK).
- **Needs you:** nothing for R2.
- **Cost:** no change. The reconnect check is still one small database read, only when a Square account is
  refused. The dashboard read got slightly narrower.

---

## For the next agent

### 1. Next phase goal and scope
- **R3** (findings #6, #7, #9; Sonnet 5.5, high): shared `loadOwnedCoupon`, one `pos_connections` read per wallet
  load, `rateLimitUserThenIp`, shared owner POS guard. Behaviour must not change. Full scope in the plan.
- **R4** is always last (Andrew's #10 decision, `/code-review high` + `/security-review`, commit with approval).
- **Out of scope for every phase:** committing (until R4 with Andrew's OK), pushing, deploying, flipping
  `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`, any `vercel env` write, any migration.

### 2. Starting state
- Branch `main`, last commit `1130914`. **Nothing from R1 or R2 is committed.**
- Uncommitted R1 work is still present and untouched by R2 (see the R1 handoff §4). Pre-existing untracked
  `clover-spike/` is not ours; leave it.
- Data: none changed. R2 ran no production queries.

### 3. Decisions made (and why)
- **#2 — Square RevokeToken semantics (checked 2026-10-06 against
  https://developer.squareup.com/reference/square/oauth-api/revoke-token):** "If an account has more than one
  OAuth access token for your application, this endpoint revokes all of them, regardless of which token you
  specify." Passing `merchant_id` is the same (whole authorization). There is an optional
  `revoke_only_access_token: true` that ends only the given access token and leaves the authorization alive.
  We do **not** use it (our `revokeSquareToken` in `lib/pos/square.ts` sends `{ client_id, access_token }`
  only), so every revoke we send ends the merchant's whole authorization for our app.
- **Rule implemented in `discardSquareGrant`:** skip the revoke when either
  - **this venue** has any **non-revoked** row (`active` *or* `error`) for the same `merchant_id` + environment
    → logs `[PosSquare] discard-skipped-own-connection` `{ venueId }`; or
  - **another venue** has an **`active`** row for that merchant + environment (unchanged behaviour)
    → logs `[PosSquare] discard-skipped-shared-merchant` `{ venueId, otherVenues }` (new log; before it returned
    silently); or
  - the read failed → skip silently after `[PosSquare] shared-merchant-read-failed` (unchanged).
  Own `error` rows count as "ours" on purpose (the plan says "non-revoked"): leaving an unused grant at Square is
  harmless, revoking a connection we might still recover is not. Other venues' `error` rows still don't block,
  matching `disconnectSquare`.
- **One read, not two.** New private `liveConnectionsForMerchant()` selects `venue_id, status` for
  provider + merchant + environment, `status <> 'revoked'`, and splits own/others in memory. Uses the existing
  `pos_connections_provider_merchant` index. `otherActiveVenuesForMerchant` is unchanged and still used by
  `disconnectSquare`.
- **Not done (considered):** using `revoke_only_access_token: true` to kill just the refused grant's access
  token instead of skipping. It would be slightly tidier but changes the Square call shape for no real gain (the
  dropped grant is never stored and Square tokens expire in 30 days). Candidate for a later phase only if
  Andrew wants it; the same option could let `disconnectSquare` revoke one venue's token on a shared merchant.
- **#5:** `venuesNeedingPosAttention` (`lib/pos/connections.ts`) now has `.eq("provider", "square")` with a
  comment that Clover (Phase 3) must add its own provider-specific nudge. No per-provider copy built.
- **#4:** label text only, matches the server refusal in `app/api/owner/pos/square/locations/route.ts`
  (`NOT_ELIGIBLE_LOCATION`). No API change.

### 4. Files changed in R2
- `lib/pos/squareConnection.ts` — new `liveConnectionsForMerchant()`; `discardSquareGrant()` rewritten with the
  rule above and a doc comment citing the Square docs.
- `lib/pos/connections.ts` — `venuesNeedingPosAttention()`: Square-only filter + comment.
- `components/owner/pos/PosConnectionsSheet.tsx` L127 — ineligible label.
- `tests/lib.pos-square-hardening.test.ts` — 3 new tests (below).
- `tests/components.pos-connections-sheet.test.ts` — expected label updated.
- Status lines: `docs/square-review-fixes-plan.md`, `docs/pos-rewards-integration-plan.md`.

### 5. Facts and traps
- **Open point, deliberately not built (per plan):** a venue whose reconnect was refused as `not_eligible`
  keeps its old connection. That connection's saved location may itself now be ineligible (e.g. the merchant
  switched it to CAD). Gift-card issuance would then fail at Square / the currency check rather than at our
  eligibility gate. Worth a decision before or during 2h; nothing in R2 changes it.
- The callback route (`app/api/owner/pos/square/callback/route.ts` L79–86) still calls `discardSquareGrant`
  only on `not_eligible`. `tests/api.square-routes.test.ts` mocks `discardSquareGrant`, so it asserts the call,
  not the revoke decision; the revoke decision is tested at lib level.
- The hardening test mock's `.returns()` is a no-op passthrough, so `liveConnectionsForMerchant` works there
  unchanged.
- Do not run `tsc` and `npm run build` at the same time (`.next/types` is regenerated).

### 6. Build, run, test — what was verified (2026-10-06, final R2 code, with R1 changes present)
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note on `lib/sportsBingo.ts`).
- `npm run test`: **304 files passed, 1 skipped; 3,419 tests passed, 13 skipped, 0 failed** (R1 ended at 3,416;
  +3 new R2 tests).
- `npm run build`: succeeded.
- Targeted: `npx vitest run tests/lib.pos-square-hardening.test.ts tests/components.pos-connections-sheet.test.ts
  tests/api.square-routes.test.ts tests/api.owner.pos.test.ts tests/app.owner-dashboard-one-round-trip.test.ts
  tests/lib.pos-square.test.ts tests/lib.pos-square-gift-cards.test.ts` → 7 files, 118 tests passed.

**New tests (`tests/lib.pos-square-hardening.test.ts`):**
1. "discardSquareGrant never revokes when this venue already holds a connection to that merchant" — own `active`
   row → no revoke call + the `discard-skipped-own-connection` log; own `error` row → no revoke call.
2. "discardSquareGrant still revokes when the venue's only rows are revoked, for another merchant, or another
   environment" — plus another venue's `error` row → exactly one revoke.
3. "ignores another provider's error row" (dashboard nudge) — a Clover `error` row flags nothing.
The existing "unless another venue uses that merchant" discard test stays green unchanged. Tests 1 and 3 fail
on the pre-R2 code (old code excluded the venue's own row; old nudge had no provider filter).

**Unverified:** a real Square sandbox reconnect-refusal round trip (needs a non-US sandbox account); the UI label
in a browser (the flag is off; covered by the component test).

### 7. Open questions for Andrew
None new from R2. Plan questions still open: #10 (A/B) at the start of R4; commit/push/deploy approval at the
end of R4. The §5 open point (refused reconnect keeps an old, possibly ineligible location) is for Andrew to
weigh before 2h, not a blocker for R3.

### 8. Recommended first steps for R3
- Sonnet 5.5, high. Re-read `lib/pos/squareGiftCards.ts` as it is now (R1 changed it; the R1 handoff §4 lists
  what moved, including `lib/pos/squareClaim.ts`). R2 did not touch that file.
- `lib/pos/squareConnection.ts` changed in R2 only inside the discard section; R3's #9 guard work is in
  `app/api/owner/pos/**` and doesn't touch it.
