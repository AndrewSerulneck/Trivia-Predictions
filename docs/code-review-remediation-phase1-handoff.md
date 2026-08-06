# Phase 1 Handoff — Stripe `prices.create` failures no longer report as archived-price 409s

**Status:** ✅ DONE
**Date:** 2026-08-06
**Model:** Claude Opus 5 · Effort: medium
**Plan:** `docs/code-review-remediation-plan.md` Phase 1

---

## The bug

`lib/billingCustomPrice.ts` — `resolveMonthlyPriceForAmount`'s create-failure catch block.
The re-resolve-by-lookup-key path had two arms:

1. `raced.ok && raced.priceId` → another admin's create won the race; reuse their Price. (correct)
2. `raced.ok` (i.e. re-resolve succeeded but found nothing) → **unconditionally** returned a 409
   reading "An archived Stripe price already holds the key `custom_monthly_NNNN` — unarchive it…"

Arm 2 made a claim specifically about `lookup_key` uniqueness, but it fired for *any* create
failure. A rate limit, a network blip, a restricted API key, or a bad product id all produced
that 409 — so the admin went hunting in the Stripe Dashboard for a price that does not exist,
and Stripe's real error message was discarded.

## The fix

One condition, at [lib/billingCustomPrice.ts:226](lib/billingCustomPrice.ts#L226):

```ts
if (raced.ok && stripeErrorCode(error) === "resource_already_exists") {
```

`stripeErrorCode` is the pre-existing helper at line 138 (already used by `setCustomPrice`'s
`resource_missing` → 404 branch). Everything that is not a duplicate-key error now falls
through to the existing 502, which carries `error.message` — Stripe's own wording.

The comment above the branch was rewritten to say *why* the gate is there, so a future reader
doesn't "simplify" it back out.

### What deliberately did NOT change

- **The race branch still runs first**, ahead of the code check. This is load-bearing and must
  stay that way: a create that failed for *any* reason is still satisfied if the Price now
  exists at Stripe. Reordering these two would turn a rate-limited-but-actually-raced create
  into a spurious 502. There is now a regression test pinning exactly this (see below).
- The 502's message-extraction, the 409's copy, `findPriceByLookupKey`'s active-only lookup,
  and every `setCustomPrice` validation gate are untouched.
- No API route changes. `app/api/admin/billing/route.ts` already passes `status`/`error`
  straight through from `SetCustomPriceResult`, so the improved 502 surfaces to the admin UI
  with no plumbing work.

## Tests

`tests/lib.billingCustomPrice.test.ts`, inside the existing `describe("resolveMonthlyPriceForAmount")`:

| Case | Test | Result |
|---|---|---|
| (a) `resource_already_exists` + empty re-resolve | pre-existing test, unchanged | still 409 with archived-price copy |
| (b) generic create failure | **new** `it.each` over `rate_limit`, `api_error`, and an error with *no* `code` at all | 502, `error` equals Stripe's own message, and asserts the lookup key is **not** in the message |
| (c) the race case | pre-existing test, unchanged | still reuses the winner's price |
| (d) race ahead of code check | **new** — create rejects with `rate_limit` *and* re-resolve finds a price | reuses the raced price (pins the branch ordering) |

The no-`code` row in (b) matters: a plain `Error` (network/undici failure) has no `code`
property at all, and that is the most common real-world instance of this bug.

## Gate

```
npx tsc --noEmit                            → clean
npx vitest run tests/lib.billingCustomPrice.test.ts → 36 passed
npm run test                                → 168 files passed | 1 skipped
                                              1450 passed | 13 skipped | 0 failed
```

(Was 1446 passed after Phase 0; +4 is the new `it.each` × 3 rows plus the ordering test.)

No lint run this phase — Phase 5's close-out owns `npm run lint`.

## Files modified

- `lib/billingCustomPrice.ts` — the gate + rewritten comment (~8 lines)
- `tests/lib.billingCustomPrice.test.ts` — two new tests appended to the resolver describe block

No migrations. No route changes. Nothing committed (per plan: no commit unless Andrew asks).

---

## Notes for the next phase

**Phase 2 (Opus, medium) — mobile admin header collapses under the notch** is next in plan
order and is now unblocked. Things worth knowing going in:

- Phase 2 has a **hard dependency on Phase 0** (✅ done) — both edit
  `tests/admin-mobile.shell-height-chain.test.ts`. Phase 0 deliberately left the *header*
  assertion as bare `pt-[env(safe-area-inset-top)]`; **Phase 2 owns updating it** to whichever
  form it picks (`min-h-14` or `h-[calc(3.5rem+env(safe-area-inset-top))]`), keeping the
  "inset still present on the pinned chrome" intent.
- Phase 0 loosened the *nav* regex to
  `/<nav className="[^"]*pb-\[(?:calc\()?env\(safe-area-inset-bottom\)(?:\+[^)]*\))?\]/`.
  If Phase 2 wants a `calc(...)` form on the header too, mirror that regex shape rather than
  inventing a new one.
- Phase 2 must not reintroduce the R3 bug (nav pushed below the clip boundary). Re-verify the
  chain: root `h-full`, `main` `min-h-0 flex-1 overflow-y-auto`, header and nav `flex-none`.
- Phase 2 also owes a *stated conclusion* (not a speculative fix) about
  `components/admin/AdminShell.tsx:734` having no safe-area padding — desktop admin is an
  ordinary browser surface per CLAUDE.md, so "non-issue" is the likely answer; write it in the
  run log either way.
- Phase 2 and Phase 3 each add a device-checklist line that **only Andrew can close** —
  headless browsers cannot render a notch. Phase 5 must list both as open.

**Phases 3 and 4** (Sonnet, low) remain independent of everything above and of each other.

**Phase 5 close-out** still owes: full `npx tsc --noEmit` + `npm run lint` + `npm run test`,
and run-log entries. This Phase 1 resolution belongs in
`docs/billing-dollar-rate-run-log.md` (not the admin-mobile one) — it is squarely the
dollar-rate resolver.
