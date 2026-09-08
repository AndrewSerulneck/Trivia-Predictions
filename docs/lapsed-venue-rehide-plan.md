# Lapsed Venue Re-Hide — Plan

**Goal:** when a partner stops paying, their venue stops appearing to players —
automatically, at the right moment, and reversibly.

**Closes:** the one accepted-scope gap left open by
`docs/partner-self-serve-signup-plan.md` ("Re-hiding a lapsed subscriber's venue
— out of scope per the plan. A cancelled subscriber's venue stays visible.").

**Status:** Phases 0–4 are **DONE** (2026-09-08), and Phase 5's **tripwires** +
cutover runbook edits landed with Phases 3–4. The only thing left is the manual
Stripe-test-mode end-to-end (Andrew's — nothing headless proves it) and flipping
`VENUE_REHIDE_ENABLED` after a dry-run week. Each phase's as-built section below
carries its handoff. Drafted 2026-09-08 immediately after Phase 8 of the
self-serve signup plan, while the billing model was in context.

> **SUPERSEDED AS THE ACTIVE QUEUE by `docs/self-serve-signup-review-fixes-plan.md`.**
> That plan's code review (15 findings, same day) turned up Finding #3 — a
> missed `maybeRevealVenue` leaves a paying partner permanently invisible with no
> repair path — which forces this plan's reconciler earlier than expected.
> **Phases 0 and 1 below (the flag, the `rehidden_at` migration, and
> `lib/venueVisibility.ts`) are absorbed into that plan's Phase 3** and must not
> be built twice. Phases 2–5 below survive unchanged and become its Phase 9.
> Read this document for the design reasoning and the truth table; take the
> sequencing from the review-fixes plan.

> **Sequencing:** this plan is deliberately queued BEHIND (a) the self-serve
> signup code review and (b) the flag flip. It touches
> `app/api/webhooks/stripe/route.ts`, the most-hardened file in the repo, and it
> should land on a reviewed baseline rather than tangled with nine phases of
> unreviewed signup work. There is also no urgency: nobody can lapse until
> somebody subscribes, and then only at the end of a paid period — a month of
> runway, minimum.

---

## 0. Decisions (locked 2026-09-08 by Andrew)

| Question | Decision |
| --- | --- |
| Partner cancels | **Re-hide at period end, not at cancellation.** They paid through the period; they keep it. |
| Payment fails | **Re-hide at period end, not on the failure.** A declined card is a retry, not a departure. |
| Failed payment later retries successfully | **Nothing happens — they were never hidden.** They are a paying customer again. |
| Partner resubscribes after being hidden | Venue comes back automatically on first paid sync of the new subscription. |
| Scope of the automatic action | **Self-serve venues only** (`self_serve_created_at is not null`), the exact mirror of `maybeRevealVenue`. Admin-activated venues are ops-managed and get a **report**, not an automatic hide — see §4 Phase 3. |
| How hard is "hidden" | **Soft.** It removes the venue from the player join list. Players already inside keep playing. See §3. |

### The decisions are already Stripe's native semantics

This is the most important fact in the plan, and it is what makes the feature
small. Both of Andrew's rules describe what Stripe already does on its own:

- **Cancel** → Stripe keeps the subscription `active` with
  `cancel_at_period_end = true` until the period actually ends, and only then
  fires `customer.subscription.deleted`. "Wait for period end" is not something
  we implement; it is something we refrain from short-circuiting.
- **Payment fails** → Stripe moves the subscription to `past_due` and keeps
  retrying on its dunning schedule. A successful retry returns it to `active`.
  Exhausted retries end in `canceled`.

And `classifyBillingRow()` in `lib/billing.ts:44` **already encodes exactly this
distinction**, for exactly this reason:

```
active    → { live: true,  reason: "active"   }
past_due  → { live: true,  reason: "past_due" }   // card declined, Stripe still retrying
otherwise → { live: false, reason: "cancelled" }
```

So the entire feature reduces to one sentence:

> **Hide a venue exactly when `classifyBillingRow(row).live === false`.
> Restore it when that flips back.**

No new date math. No new state machine. No polling Stripe for period ends. If
you find yourself writing `if (current_period_end < now)` anywhere in this
plan's implementation, stop — you have reimplemented something Stripe already
told us.

---

## 1. What already exists (do not rebuild)

- **`classifyBillingRow()`** — `lib/billing.ts:44`. The live/not-live predicate,
  already shared so call sites stop re-deriving it and drifting. This plan is
  its fourth consumer, not a fifth definition.
- **`maybeRevealVenue()`** — `app/api/webhooks/stripe/route.ts:510`. The
  un-hide half, already shipped and tested
  (`tests/api.webhooks.stripe.reveal-venue.test.ts`). Its guard, its idempotency
  contract and its never-throws contract are the template the hide half copies.
- **`runFirstSyncFollowers()`** — `route.ts:476`. The place followers hang off a
  write that really happened. Re-hide is NOT a first-sync follower (it fires on
  the opposite transition), but its "never throw, never fail the webhook"
  discipline is the same.
- **`upsertSubscription()`'s stale-event guard** — `route.ts:215`. A late/retried
  event for a replaced subscription already returns `SKIPPED`. Re-hide inherits
  this for free by hanging off the upsert result, not the raw event.
- **`/api/cron/billing`** — already daily, already `isCronAuthorized`, already
  owns the one lapse path that has no webhook (expiring offline/check grants).
  The reconciler belongs here, not in a new cron.
- **`venues.hidden`** — read in exactly one place, `lib/venues.ts:137,150`
  (`listVenues`). Verified 2026-09-08.
- **`self_serve_created_at`** — the provenance stamp that keeps every venue
  predicate off the two Category Blitz global rooms.

## 2. The gap

Nothing ever sets `venues.hidden` back to `true`. `maybeRevealVenue` is a
one-way door: a venue revealed on first payment stays in the player join list
forever, whether or not anyone is still paying for it.

There is also a lapse path with **no webhook at all** — an offline/check grant
expiring, which `/api/cron/billing` flips to `cancelled` itself. A webhook-only
solution would miss it entirely.

---

## 3. What "hidden" actually does (verified, and it is softer than it sounds)

`venues.hidden` is read in **one** place: `listVenues()` in `lib/venues.ts`.
Confirmed by grep 2026-09-08 — no other lib, route, or component filters on it.

Consequences, all deliberate and all accepted:

- A hidden venue **disappears from the join-flow venue list.** No new player can
  find or join it. This is the business outcome the feature is for.
- A player who **already joined** keeps their `users.venue_id` and keeps
  playing. `/api/join/profile` does not filter on `hidden`.
- A **direct venue URL** still resolves.
- The **owner dashboard, billing pages and the venue TV screen are unaffected** —
  which is required, or a lapsed partner could not reach the Resubscribe button
  that fixes their own problem.
- `listVenues()` is **cached** (`readCachedVenues()`), so a re-hide is not
  instant for players. Minutes, not milliseconds.

This is the right default: a lapsed partner's regulars are not ejected
mid-trivia-night, and every reversal path stays open. **Harder enforcement
(blocking direct URLs, ejecting joined players, dark-screening the TV) is
explicitly out of scope** and should not be added without its own decision — it
turns a quiet commercial nudge into a customer-facing outage.

---

## 4. Phases

### Phase 0 — Foundations ✅ DONE 2026-09-08
**Model: Sonnet 5 · Effort: Low**

> **Absorbed into Phase 3 of `docs/self-serve-signup-review-fixes-plan.md` and
> shipped there.** `isVenueRehideEnabled()` lives in `lib/venueVisibility.ts` and
> the migration is `supabase/migrations/20260908130000_venues_rehidden_at.sql`.
> **The migration is written but NOT pushed** — nothing in Phase 3 reads the
> column, so it gates nothing until this plan's Phase 3 (= review-fix Phase 9).
> Push and verify it before that code ships. Do not redo this phase.

- **Flag `VENUE_REHIDE_ENABLED`**, single reader `isVenueRehideEnabled()` in a
  new `lib/venueVisibility.ts`. Off = today's behavior, fully inert.
  - **Deliberately NOT `NEXT_PUBLIC_*`.** Every consumer is server-side (webhook
    + cron), so the flag is read at request time and flips **without a
    redeploy** — unlike `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`, whose
    build-time inlining is a documented footgun. Do not add the prefix out of
    habit.
  - Reuse the `truthy()` convention (`1|true|yes|on`) from `lib/domainSplit.ts`.
- **Migration** (new timestamped file):
  - `venues.rehidden_at timestamptz null` — set when THIS feature hides a row,
    cleared when it restores one.
  - **Why a column is genuinely needed** (it is not bookkeeping): it is the only
    thing that distinguishes *"we hid this because they lapsed"* from *"an admin
    hid this on purpose."* Without it, the Phase 3 reconciler's restore half
    would fight an admin who deliberately hid a venue whose billing happens to
    be live. **Only ever restore a row we hid.**
  - Follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` conventions (this is an
    `ADD COLUMN IF NOT EXISTS` on an existing table, so no new RLS work).

**Verify:** `npx tsc --noEmit`, migration applies.

---

### Phase 1 — The predicate, as a pure module ✅ DONE 2026-09-08
**Model: Sonnet 5 · Effort: Medium**

> **Absorbed into Phase 3 of `docs/self-serve-signup-review-fixes-plan.md` and
> shipped there.** `lib/venueVisibility.ts` exports `shouldRevealVenue`,
> `shouldRehideVenue` and `shouldRestoreVenue` — all three implemented (not
> stubbed) and pinned by the truth table below in
> `tests/lib.venue-visibility.test.ts` (26 cases). Only `shouldRevealVenue` has a
> caller so far: the reveal-repair reconciler in `/api/cron/billing`. **Phase 2
> and Phase 3 below call the other two as they stand; do not rewrite them.** Read
> the review-fix plan's Phase 3 handoff before starting — in particular, whatever
> un-hides a venue must clear `rehidden_at`, which nothing does yet.

All truth in one testable, dependency-free place before anything calls it.

`lib/venueVisibility.ts`:

- `shouldRehideVenue(venue, billing)` → `boolean`. True iff **all** of:
  1. `billing` exists and `classifyBillingRow(billing).live === false`
  2. `venue.hidden === false`
  3. `venue.self_serve_created_at !== null` — **load-bearing**, same reason as
     `maybeRevealVenue`: it is what keeps this off the two Category Blitz global
     rooms and every admin-activated venue.
  4. `billing.billing_method === "stripe"` — an offline grant on a self-serve
     venue is an ops decision; Phase 3 reports it rather than acting.
- `shouldRestoreVenue(venue, billing)` → `boolean`. True iff **all** of:
  1. `billing` exists and `classifyBillingRow(billing).live === true`
  2. `venue.hidden === true`
  3. `venue.rehidden_at !== null` — **we only restore what we hid.**
- Both pure, both synchronous, both take plain row shapes. No Supabase, no
  Stripe, no `server-only`.

**The truth table this phase must pin**, one test case each:

| Stripe status | our `status` | `classifyBillingRow` | Action |
| --- | --- | --- | --- |
| `active` | `active` | live | none |
| `active`, `cancel_at_period_end` | `active` | live | **none — this is the "wait for period end" decision** |
| `past_due` | `past_due` | live | **none — this is the "failed payment" decision** |
| `past_due` → retry succeeds → `active` | `active` | live | **none — the "retry succeeded" decision** |
| `unpaid` | `past_due` | live | none |
| `canceled` | `cancelled` | not live | **hide** |
| `incomplete_expired` | `cancelled` | not live | hide |
| `paused` | `cancelled` | not live | hide |
| offline grant expired by `/api/cron/billing` | `cancelled` | not live | Phase 3 report only (fails the `billing_method` clause) |
| new subscription after a hide | `active` | live | **restore** |
| admin hid it by hand (`rehidden_at` null) | any | any | **never restore** |

**Verify:** `npm run test` + new `tests/lib.venue-visibility.test.ts` covering
every row above.

---

### Phase 2 — The webhook follower ✅ DONE 2026-09-08
**Model: Opus 5 · Effort: Medium-High** *(most-hardened file in the repo)*

`maybeRehideVenue(sub)` in `app/api/webhooks/stripe/route.ts` — the exact mirror
of `maybeRevealVenue`, and written to the same four contracts:

1. **Never throws.** A failure here must not fail the webhook; Stripe would
   retry the whole event and re-drive billing sync over a cosmetic problem.
   `try/catch` + `console.error`, same as its twin.
2. **Idempotent.** The `hidden = false` clause in the `UPDATE` predicate matches
   nothing on a retry.
3. **Guarded on provenance.** `.not("self_serve_created_at", "is", null)` —
   copy the load-bearing comment from `maybeRevealVenue` verbatim, including the
   global-rooms warning.
4. **Hangs off the upsert result, not the raw event** — so it inherits the
   stale-subscription-id guard for free.

**Where it fires:** the `customer.subscription.updated` / `.deleted` branch,
after `upsertSubscription` returns `applied: true`, when the freshly-written
status is not live. Concretely, `runFirstSyncFollowers` gets a sibling —
something like `runStateChangeFollowers(result, sub)` — rather than being
overloaded; reveal and re-hide fire on opposite transitions and sharing one
entry point would make both harder to read.

**Also in this phase — the restore half.** `maybeRevealVenue` already un-hides
on first paid sync, so a resubscribe works today. Extend it to **also clear
`rehidden_at`** in the same write, or the row stays marked as "we hid this" and
Phase 3's reconciler inherits stale provenance.

**Explicitly do NOT:**
- Compute or compare `current_period_end`. Stripe's status already is the answer.
- Touch `upsertSubscription`'s creation gate, stale guard, or discount mirror.
- Delete the `billing_subscriptions` row on cancellation — see Risk #1.

**Verify:** `npm run test` + new `tests/api.webhooks.stripe.rehide-venue.test.ts`.
Do not modify `tests/api.webhooks.stripe.reveal-venue.test.ts`; it must keep
passing untouched, and that is a meaningful signal.

#### Phase 2 — AS BUILT (2026-09-08, Opus 5) ✅

**Status: complete.** `npm run test` 2295 passed / 233 files (was 2268 / 232),
`npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean,
`npm run test:god-mode-join` 34 passed. Nothing committed.

**The feature is INERT on this deploy.** `VENUE_REHIDE_ENABLED` is absent, and
with it absent `maybeRehideVenue` reads the flag and returns before touching
anything. The one behavior change that ships unconditionally is the restore half
— `maybeRevealVenue` now also writes `rehidden_at: null` — which is a no-op
against today's production, where **no row has a non-null `rehidden_at`**
(nothing has ever written it).

##### What was built

**1. `maybeRehideVenue(result, sub)` in `app/api/webhooks/stripe/route.ts`** —
the mirror of `maybeRevealVenue`, to the same four contracts:

| Contract | How |
| --- | --- |
| Never throws | `try/catch` + `console.error`, `[stripe-webhook] rehide-venue-failed` / `-threw`. |
| Idempotent | `.eq("hidden", false)` in the UPDATE predicate — a Stripe retry matches no row. |
| Guarded on provenance | `.not("self_serve_created_at", "is", null)`, plus `.or("latitude.neq.0,longitude.neq.0")`. |
| Hangs off the upsert result | Takes `UpsertResult`, so the stale-subscription-id guard is inherited for free. |

The write is `{ hidden: true, rehidden_at: new Date().toISOString() }` — one
statement, because hiding without stamping makes the hide permanent.

**2. `runStateChangeFollowers(result, sub)`** — the sibling the plan asked for,
not an overload of `runFirstSyncFollowers`. Called from the
`customer.subscription.updated` / `.deleted` branch **on both halves**: Stripe
ends a cancelled subscription with `.deleted`, but a subscription can also reach
a dead status (`canceled`, `incomplete_expired`, `paused`) via `.updated`. It is
deliberately **not** called from `checkout.session.completed` — the creation gate
only ever writes `active`/`trialing` there, so a re-hide would be dead code
pretending to be a safety net.

**3. `UpsertResult` gained `status: string | null`** — the local status actually
written to the mirror. The follower must not re-derive it from `sub.status`: the
delete branch forces `cancelled` regardless of the payload, and
`mapStripeSubscriptionStatus` folds several Stripe statuses into each of ours. A
follower deciding on the mirror row has to read the value the mirror got.

**4. The restore half.** `maybeRevealVenue`'s update is now
`{ hidden: false, rehidden_at: null }`. A partner who lapses and resubscribes
arrives here as a **first sync of a new subscription id** and matches this
predicate every bit as well as `shouldRestoreVenue` would; un-hiding without
clearing the stamp leaves a *visible* venue still marked "we hid this".

##### The one deviation from the plan: `isBillingLapsed`

The plan (and Phase 3's handoff #3) says Phase 9's callers use
`shouldRehideVenue` **as it stands**. The webhook cannot: `shouldRehideVenue`
takes a venue row, and this follower deliberately **never reads one** — like its
twin it expresses the venue half as SQL filters on the UPDATE, which is exactly
what makes it idempotent and race-free. Passing a synthetic venue object to
satisfy the signature would have been dishonest.

So `lib/venueVisibility.ts` gained **`isBillingLapsed(billing)`**, the billing
half on its own, and `shouldRehideVenue` is now literally
`isBillingLapsed(billing) && venue.hidden === false && isSelfServeVenueRow(venue)`.

**This is a decomposition, not a change to the truth table.** Behaviour is
identical, and `tests/lib.venue-visibility.test.ts` (26 cases) passes
**untouched** — which is the signal that it is. The point stands: the webhook
asks the module rather than writing `status !== "active"` at the call site.

##### The safety chain nobody should break

`shouldRestoreVenue` carries **no provenance clause and no placeholder clause**.
"We only restore what we hid" stands in for both — and that is only true because
every path that *writes* `rehidden_at` refuses a stamp-null venue and refuses a
`(0, 0)` placeholder. `maybeRehideVenue` enforces both as SQL filters. A doc
block on `shouldRestoreVenue` now says this in the module, and
`tests/api.webhooks.stripe.rehide-venue.test.ts` pins both filters.

##### Tests

**`tests/api.webhooks.stripe.rehide-venue.test.ts` (new, 27 cases).** Harness
copied from the reveal test (the builder records **filters**, not just the
payload — a test that only checked `{ hidden: true }` would pass with both guards
deleted). Grouped by what would hurt most if it broke:

- **The three no-action decisions** — the whole product judgment, and all three
  are just Stripe's semantics left alone: `active` + `cancel_at_period_end` does
  **not** hide (they paid through the period), `past_due` does **not** hide (a
  declined card is a retry), and `past_due → active` does nothing (they were
  never hidden). Plus `unpaid`, which our mirror also calls `past_due`.
- **The flag**: unset = zero venue writes *while the billing mirror still syncs*
  (the flag gates visibility, never the money); and a test that flips
  `process.env` mid-run and gets different behaviour from the same event, which
  is what "no `NEXT_PUBLIC_`, so it flips without a redeploy" actually means.
- **Hiding**: `.deleted` hides; `canceled` / `incomplete_expired` / `paused` via
  `.updated` hide; `rehidden_at` is a parseable timestamp in the *same* payload;
  all four filters present.
- **Refusals**: a stale event for a replaced subscription, a cancelled
  subscription that was never tracked (creation gate wrote nothing — the signup
  sweep owns that case), missing `venueId`, and `checkout.session.completed`.
- **Never fails the webhook**: error, throw, and zero-rows-matched all 200.
- **Restore**: a resubscriber's reveal writes `{ hidden: false, rehidden_at: null }`.
- **Four static guards**: no `current_period_end` in the re-hide body; it calls
  `isBillingLapsed(` and contains no bare status comparison; it hangs off
  `result.applied`; and **no `billing_subscriptions` delete anywhere in the
  route** (Risk #1 — a re-hidden venue is `hidden = true` AND stamped, two of the
  three clauses of the signup sweep's DELETE predicate; the billing row is the
  third and only thing left).

**One assertion changed in `tests/api.webhooks.stripe.reveal-venue.test.ts`.**
The plan says leave that file untouched, but the same phase mandates clearing
`rehidden_at` in `maybeRevealVenue`, which necessarily changes its payload. So
`toEqual({ hidden: false })` became `toEqual({ hidden: false, rehidden_at: null })`,
with a comment saying why. Every other assertion in that file is intact and green.

##### Verified against production, not assumed

- `venues.rehidden_at` **exists** (the Phase 3 migration is pushed) — read back
  live, no error. This matters: `maybeRevealVenue`'s `rehidden_at: null` write is
  **not** flag-gated, so a database without the column would break the reveal.
- Production has exactly **two** hidden venues (`category-blitz-global-room`,
  `hc-cbz-live`), both `(0, 0)`, both `self_serve_created_at` null, both
  `rehidden_at` null.
- **Three** `billing_subscriptions` rows: two `active`/`stripe`, one
  `cancelled`/`offline` (`venue-garden-state-bar`). That cancelled row is not
  self-serve-stamped and is offline-billed, so it fails two independent clauses —
  **nothing in production can be hidden by this code even with the flag on.**

##### Handoff to Sonnet 5 for the rest of Phase 9

Phase 2 is done. What is left is re-hide plan **Phases 3, 4 and 5**. Read
`docs/self-serve-signup-review-fixes-plan.md` §3 Phase 3's as-built notes too —
its handoff items #4, #5 and #6 are still open and are yours.

1. **THE BUG WAITING FOR YOU — `repairMissedVenueReveals` still writes
   `{ hidden: false }` with no `rehidden_at: null`.** This is Phase 3's handoff
   item #2, and I closed only the `maybeRevealVenue` half of it (the plan scoped
   Phase 2 to the webhook). Now that `maybeRehideVenue` actually stamps the
   column, the cron reveal job can un-hide a venue and leave it marked "we hid
   this". Fix it in `lib/venueVisibilitySync.ts` — one key — and note that
   `tests/api.cron.billing.reveal.test.ts:190` asserts
   `toEqual({ hidden: false })` and will need the same one-word update.
   **Rule, no exceptions: whatever un-hides a venue clears `rehidden_at`.**

2. **Your restore job must carry the guards `shouldRestoreVenue` does not.**
   That predicate is only `live billing && hidden && rehidden_at` — deliberately
   no provenance clause, no `(0, 0)` clause. Its safety rests entirely on the
   hide path refusing to stamp anything it should not, which `maybeRehideVenue`
   does in SQL. Your restore scan/UPDATE must do the same:
   `.not("self_serve_created_at", "is", null)` and
   `.or("latitude.neq.0,longitude.neq.0")`. Do **not** "simplify" by trusting the
   stamp alone.

3. **Order the reconciler's jobs: restore, then hide, then report.** Restore
   before hide, so a venue that is live-billing-and-stamped is not evaluated by
   both in one run. `shouldRehideVenue` requires `hidden === false` and
   `shouldRestoreVenue` requires `hidden === true`, so they cannot both hold for
   the same row anyway — but the ordering keeps a single run's log readable.

4. **`isBillingLapsed` exists now.** Your hide job has real venue rows in hand,
   so call **`shouldRehideVenue`**, not `isBillingLapsed` — the latter is the
   billing half only and exists for the one caller that has no venue row.

5. **Extend the cron response as a sibling key**, e.g.
   `{ ok, offlineExpired, venueReveal, venueRehide }` — do not overload
   `venueReveal`. (Phase 3 handoff #5.)

6. **Copy the richer Supabase mock** from `tests/api.cron.billing.reveal.test.ts`
   — a builder missing `not` / `in` / `order` / `limit` / `or` makes the
   reconciler throw into the route's catch and your test passes for the wrong
   reason. That is exactly what `tests/api.cron.billing-offline-expiry.test.ts`
   was doing before Phase 3. (Phase 3 handoff #6.)

7. **Phase 5's `tests/venue-rehide-contract.test.ts`: MOVE, don't copy.** Six
   static guards live at the bottom of `tests/lib.venue-visibility.test.ts` and
   four more at the bottom of `tests/api.webhooks.stripe.rehide-venue.test.ts`.
   Consolidate; do not write third copies. The sweep-interaction guard (Risk #1)
   now exists in **two** forms — "the sweep still excludes venues with billing
   rows" (in the visibility test) and "the webhook never deletes a billing row"
   (in the re-hide test). Keep both; they guard opposite ends of the same rule.

8. **The `report` job (Phase 3 §3) is the part with no code yet and the most
   product value.** Lapsed **admin-activated** venues — live-billing false,
   `self_serve_created_at is null` — get counted and logged and **nothing else**.
   Resist widening job 1 to cover them; that is a separate decision behind its
   own flag, and `venue-garden-state-bar` (cancelled, offline) is the one real
   row that will show up in it on day one.

9. **Phase 4's admin badge reads `hidden && rehidden_at`.** Both are now real
   columns with real writers. The UI copy must be honest about the override: an
   admin who manually un-hides a lapsed venue will see it re-hidden on the next
   cron run unless the *billing* is fixed. Say that; don't imply the override
   sticks.

10. **CLAUDE.md's "Venue Visibility" section needs one line changed.** It
    currently reads *"Re-hide / restore (`VENUE_REHIDE_ENABLED`, server-side, no
    `NEXT_PUBLIC_`) are Phase 9 — not wired yet. `venues.rehidden_at` exists
    (migration live) and is written by nothing today."* The second sentence is
    now false: **`maybeRehideVenue` writes it** (flag-gated) and
    `maybeRevealVenue` clears it (not flag-gated). Update it when your half
    lands, in the present tense.

11. **Nothing is committed.** Phase 2 added
    `tests/api.webhooks.stripe.rehide-venue.test.ts` and modified
    `app/api/webhooks/stripe/route.ts`, `lib/venueVisibility.ts` and
    `tests/api.webhooks.stripe.reveal-venue.test.ts`.

12. **Cutover is unchanged and is Andrew's**: deploy with `VENUE_REHIDE_ENABLED`
    absent → read a week of `[VenueRehide]` dry-run lines from the cron → set the
    flag (no redeploy needed — it is server-side). The webhook follower goes live
    the moment the flag is set, so **do not set it before the reconciler's
    dry-run week has been read**: the webhook has no dry-run mode. The real
    end-to-end (subscribe in Stripe test mode, cancel, confirm the venue survives
    to period end and vanishes after) is manual and only Andrew can close it.

---

### Phase 3 — The daily reconciler
**Model: Sonnet 5 · Effort: Medium**

Webhooks get missed, and **one lapse path has no webhook at all** (an offline
grant expiring, which `/api/cron/billing` flips itself). The reconciler is what
makes the feature eventually-correct rather than best-effort.

Extend **`/api/cron/billing`** (already daily, already authorized, already owns
the offline-grant expiry that happens two statements earlier in the same
handler). Do **not** add a new cron route or a `vercel.json` entry.

Three jobs, in this order:

1. **Hide** every venue where `shouldRehideVenue` holds. Bounded
   (`MAX_PER_RUN`, abort-over-cap like `sweepAbandonedSignupVenues`), one log
   line per venue.
2. **Restore** every venue where `shouldRestoreVenue` holds. Same bounds.
3. **Report** — count, and log, lapsed **admin-activated** venues (live-billing
   false, `self_serve_created_at is null`) **without touching them.** This is the
   business value for the ops-managed half of the estate without the blast
   radius of an automatic hide on venues nobody promised this behavior for. If
   the report is consistently boring for a month, widening job 1 to cover them
   is a one-clause change behind its own flag.

**Ship log-only first**, exactly as `/api/cron/signup-sweep` did: jobs 1 and 2
respect `VENUE_REHIDE_ENABLED`, and `?dryRun=1` forces report-only regardless.
Read a week of log lines before enabling.

**Verify:** `npm run test` + `tests/api.cron.billing.rehide.test.ts`. Existing
`/api/cron/billing` coverage must pass untouched.

#### Phase 3 — AS BUILT (2026-09-08, Sonnet 5) ✅

**Status: complete.** `npm run test` 2315 passed / 235 files (was 2295 / 233),
`npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean,
`npm run test:god-mode-join` 34 passed, `npm run test:venue-fk-guard` 2 passed.
Nothing committed. **The feature is INERT on this deploy** — `VENUE_REHIDE_ENABLED`
is absent, so the cron's restore + re-hide jobs run in dry-run and write nothing;
only the read-only report job and the (already-shipped) reveal repair do
anything.

##### `lib/venueVisibilitySync.ts` — three new jobs + `reconcileLapsedVenues`

| Export | What it does |
| --- | --- |
| `reconcileLapsedVenues({ dryRun })` | The entry point. Runs **restore → re-hide → report**, in that order (handoff #3). Returns `{ dryRun, enabled, wrote, restore, rehide, report, errors }`. `wrote = isVenueRehideEnabled() && !dryRun` — flag off OR `?dryRun=1` ⇒ restore + re-hide log what they *would* do and write nothing. |
| `reportLapsedAdminVenues()` | Read-only. Counts admin-activated (stamp-null), still-visible venues whose billing our mirror calls `cancelled`. Never writes. Always runs, flag or no flag. |
| `REHIDE_MAX_PER_RUN` / `RESTORE_MAX_PER_RUN` (25) | **Abort-over-cap** on the *actionable* set (not the scan). A pile this size is a billing-sync fault, not real churn — the job does nothing and logs loudly. Contrast the reveal repair, which *defers* over its cap because un-hiding a payer is always safe. |
| `LAPSED_ADMIN_REPORT_LIMIT` (1000) | Bound on the report's `billing_subscriptions` scan. |

`loadBillingByVenue()` was extracted and is now shared by the reveal-repair,
re-hide and restore jobs — the "pick the live row out of a duplicate pair"
tie-break is written once (§2's root cause is a rule written twice).

**`isBillingCancelled(billing)` was added to `lib/venueVisibility.ts`** for the
report job only. It is deliberately a mirror-status read (`status === "cancelled"`),
NOT a `classifyBillingRow` call: `classifyBillingRow` reports an *active* offline
grant as not-live merely because it has no Stripe object, so `!isBillingLive`
would flag every currently-granted offline venue as "lapsed". `status ===
"cancelled"` — which our mirror folds every finished Stripe status and every
expired offline grant into — does not. The Phase 5 contract test's bare-status
guard exempts `cancelled` for exactly this reason (it still bans `active` /
`past_due`, which are `classifyBillingRow`'s to judge).

##### The reconciler runs BEFORE the reveal repair — and why the restore job still earns its place

`repairMissedVenueReveals` (Phase 3 of the review-fixes plan, no flag) already
un-hides **every** `hidden + paying + self-serve + not-placeholder` venue, and it
now clears `rehidden_at` too. That is a strict superset of what
`shouldRestoreVenue` matches. So the standalone restore job is *not* the only
thing that brings a resubscriber back — but it is kept, and the cron calls
`reconcileLapsedVenues` **before** `repairMissedVenueReveals`, because:

- it is the **intent-specific** path: its log line says "billing live again", not
  "the webhook missed this";
- it **aborts** over cap where the reveal repair defers;
- it guarantees the `rehidden_at` clear happens under the restore-specific guards.

Re-hide (acts only on NOT-live billing) and the reveal repair (acts only on live
billing) are disjoint, so ordering them together is safe.

##### `repairMissedVenueReveals` bug fixed (Phase 2 handoff #1)

Its UPDATE was `{ hidden: false }` — it did not clear `rehidden_at`. Now
`{ hidden: false, rehidden_at: null }`, matching `maybeRevealVenue`.
`tests/api.cron.billing.reveal.test.ts:190` updated to
`toEqual({ hidden: false, rehidden_at: null })`.

##### `/api/cron/billing` response shape

`{ ok, offlineExpired, venueReveal, venueRehide }` — `venueRehide` is a **sibling
key**, never overloaded onto `venueReveal` (handoff #5). Each reconciler is in
its own try/catch and resolves to `{ threw }` on fault; neither can fail the
cron. `?dryRun=1` forces report-only for **both**.

##### Tests

- **`tests/api.cron.billing.rehide.test.ts`** (new, 17 cases) drives the jobs
  through the real route: flag-off dry-run vs flag-on write; `past_due` / `active`
  / expired-offline / stamp-null / `(0,0)` all left alone (the admin one lands in
  the report); restore + un-stamp; admin-hidden (`rehidden_at` null) never
  restored; fail-closed billing read; **abort-over-cap**; per-venue write error
  doesn't stop the loop; `?dryRun=1` writes nothing with the flag on; 401. Its
  Supabase mock honours the scan filters faithfully (`hidden` eq, `rehidden_at` /
  `self_serve_created_at` not-null, the `(0,0)` `.or`) so a job cannot "pass" by
  dropping a filter.
- **`tests/venue-rehide-contract.test.ts`** (new — Phase 5's file, created here).
  The ten static guards from `tests/lib.venue-visibility.test.ts` and
  `tests/api.webhooks.stripe.rehide-venue.test.ts` were **MOVED** here (handoff
  #7 — not copied; both source files now carry a one-line "moved to the contract
  file" note where the block was). New guards this phase adds: every un-hide in
  `venueVisibilitySync.ts` clears `rehidden_at` (no `update({ hidden: false })`
  literal); the reveal-repair function body specifically does not read the flag
  (the module now imports it for the re-hide job, so the old whole-file guard
  would misfire); the re-hide + restore writes re-assert the stamp + `(0,0)`
  guards; `VENUE_REHIDE_ENABLED` is read comment-stripped in exactly one file;
  re-hide aborts (not defers) over cap.
- `tests/lib.venue-visibility.test.ts` — the 26-case truth table is **untouched**;
  only the static-guard `describe` block moved out. Its count drops to 21.
- `tests/api.cron.billing.reveal.test.ts` — one assertion changed (the
  `rehidden_at: null` payload); `reconcileLapsedVenues` also runs in every case
  now and is a no-op there (all venues are either unstamped-for-restore or
  billing-active-so-not-lapsed).

##### Docs updated

`CLAUDE.md` "Venue Visibility" section (re-hide/restore are wired + flag-gated +
log-only; `rehidden_at` writers/clearers; the admin "Hidden venues" panel —
updated again by Phase 4); `SYSTEM_CONTEXT.md` (cron "two jobs" → three,
lifecycle line to present tense); `docs/self-serve-signup-runbook.md` (stale
"OUTSTANDING migration" para corrected — it was pushed 2026-09-08; §8 rewritten
with the cutover + reversal SQL).

##### Handoff — Phase 4 followed immediately (see its as-built below)

1. **The report job is the untested-in-anger part.** It logs
   `[VenueVisibility] lapsed admin-activated venue=…`. On day one the one real
   row is `venue-garden-state-bar` (cancelled, offline). If the report is boring
   for a month, widening the re-hide job to cover admin venues is a one-clause
   change behind its **own** flag — a separate decision, not this phase.
2. **Nothing is committed.** The full file list is in Phase 4's as-built below.
3. **Cutover is Andrew's** (see Phase 2 handoff #12 and the runbook §8): deploy
   flag-absent → read a week of `[VenueVisibility]` dry-run lines from the cron →
   set `VENUE_REHIDE_ENABLED` → the manual Stripe-test-mode end-to-end
   (subscribe, cancel, confirm the venue survives to period end and vanishes
   after).

---

### Phase 4 — Admin visibility and manual override
**Model: Sonnet 5 · Effort: Low-Medium**

Ops must be able to see and reverse this, or the first support ticket is
unanswerable.

- Admin venue list: a **"Hidden — lapsed"** badge for `hidden && rehidden_at`,
  distinct from a plain admin-hidden venue.
- **Manual unhide clears `rehidden_at`.** This is what makes an admin override
  stick — the reconciler will not re-hide a row whose billing is still not live
  unless... it will, actually, so the override needs to be honest: either the
  admin re-grants access (fixing the billing row, the real fix) or the hide
  returns tomorrow. Say that in the UI copy rather than pretending otherwise.
- `docs/self-serve-signup-runbook.md` §8 loses "re-hiding is out of scope" and
  gains a pointer here.

**Verify:** `npm run test`, `npm run lint`, `npx tsc --noEmit`.

#### Phase 4 — AS BUILT (2026-09-08, Sonnet 5) ✅

**Status: complete.** `npm run test` 2322 passed / 236 files (was 2315 / 235),
`npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean. Nothing
committed.

##### What was built — a panel, not a new section

Phase 3's handoff called this "no substrate": `listVenues()` filters hidden rows
out of the admin console, and there is no admin venues GET route. Rather than
stand up a whole new admin section (meta type + nav group + dynamic renderer +
mobile allowlist), it went in as a **panel at the bottom of the existing Venues
section** — the natural place an ops person already goes.

**`lib/admin.ts` — two new exports:**

| Export | What it does |
| --- | --- |
| `listHiddenVenues()` | Every `venues.hidden = true` row, joined to `billing_subscriptions` for a status label, classified **`lapsed`** (`rehidden_at` set — the reconciler hid it), **`admin-hidden`** (hidden, no stamp), or **`system-room`** ((0,0) placeholder — the two Category Blitz global rooms). Sorted lapsed → admin-hidden → system-room, then by name. |
| `restoreLapsedVenue(venueId)` | Manual override. `UPDATE venues SET hidden = false, rehidden_at = null` guarded by `.eq("hidden", true).not("rehidden_at","is",null).not("self_serve_created_at","is",null).or("latitude.neq.0,longitude.neq.0")` — so it acts ONLY on a genuine lapsed row and can never publish an admin-hidden venue or a global room. Returns `{ restored: false, reason: "not-lapsed" }` when the guard matches nothing. **Deliberately billing-agnostic** — that is what a manual override is; the doc comment and the UI both say the reconciler re-hides it next run if billing is still not live. |

**`app/api/admin/route.ts`:** `GET ?resource=hidden-venues` → `listHiddenVenues`;
`POST { resource: "venue-visibility", action: "restore", id }` → `restoreLapsedVenue`
(409 with `{ restored: false }` when it is not a lapsed row).

**`components/admin/sections/HiddenVenuesPanel.tsx`** (new) — fetches on mount,
badges each row, shows the billing status, and renders **Restore (unhide)** only
on `lapsed` rows. Copy states plainly that restoring only un-hides and the
durable fix is a live subscription. Rendered from `VenuesSection`'s list view
(one import + one `<HiddenVenuesPanel />`).

**`Venue` in `types/index.ts` was NOT widened** (Phase 3 handoff #3) — the panel
has its own `HiddenVenueRow` type; `hidden` / `rehidden_at` / `self_serve_created_at`
still do not ride on `Venue`.

**Mobile:** the panel lives in the desktop `VenuesSection` only. `MobileVenuesSection`
is a separate component; adding it there is a small follow-up, not a blocker for
the flag flip (an admin on desktop can see and reverse everything).

##### Tests — `tests/admin.hidden-venues.test.ts` (new, 7 cases)

Classification + ordering; `[]` short-circuits before the billing read; both
reads fail loudly; the restore writes `{ hidden: false, rehidden_at: null }` with
all four guard filters; a non-lapsed row returns `{ restored: false }`; blank id
rejected; write error propagates. (Watch the `beforeEach` idiom — `() => { mocks.from.mockReset(); }`
with braces; a bare `() => mocks.from.mockReset()` returns the mock, which vitest
then invokes as a teardown hook and calls `from(undefined)`.)

##### Deliberately NOT done

Mobile panel; a contract tripwire for the admin route (the behavioural test
covers the guard, and `restoreLapsedVenue`'s SQL guard is the real safety); any
change to `Venue`. Nothing committed.

---

### Phase 5 — Tripwires, docs, cutover
**Model: Sonnet 5 · Effort: Medium**

- **`tests/venue-rehide-contract.test.ts`** — static guards, in the house style
  of `tests/self-serve-signup-contract.test.ts`:
  - **The sweep-interaction tripwire (highest value in this plan — see Risk #1).**
    `lib/signupSweep.ts` still excludes any venue with a `billing_subscriptions`
    row. Assert the exclusion query is present. If someone ever "cleans up"
    cancelled billing rows, re-hidden venues become sweep-eligible and real
    venues with real history get deleted seven days later.
  - `VENUE_REHIDE_ENABLED` read in exactly one file, `lib/venueVisibility.ts`.
  - `lib/venueVisibility.ts` imports `classifyBillingRow` and does not
    re-implement the live/not-live predicate (no bare `=== "active"` /
    `=== "past_due"` comparison).
  - Both webhook followers carry the `self_serve_created_at` guard.
  - No `current_period_end` comparison in the re-hide path.
- Full suite: `npm run test`, `npm run test:venue-fk-guard`,
  `npm run test:god-mode-join` (the join flow reads the venue list this plan
  writes to).
- **Cutover:** migration → deploy with `VENUE_REHIDE_ENABLED` absent → read a
  week of `[VenueRehide]` dry-run log lines → set the flag. Reversal is removing
  the flag; already-hidden rows are restored by clearing `rehidden_at`, so
  record that one-line SQL in the runbook.
- **Manual verification Andrew owns:** one real end-to-end in Stripe test mode —
  subscribe, cancel, confirm the venue stays visible through period end, confirm
  it disappears from the join list after. Nothing headless proves this.

---

## 5. Model / effort summary

| Phase | Model | Effort | Status |
| --- | --- | --- | --- |
| 0 · Foundations | Sonnet 5 | Low | ✅ done (absorbed into review-fix Phase 3) |
| 1 · The predicate | Sonnet 5 | Medium | ✅ done (absorbed into review-fix Phase 3) |
| 2 · Webhook follower | **Opus 5** | Medium-High | ✅ done 2026-09-08 |
| 3 · Daily reconciler | Sonnet 5 | Medium | ✅ done 2026-09-08 |
| 4 · Admin visibility | Sonnet 5 | Medium | ✅ done 2026-09-08 (desktop panel; mobile is a follow-up) |
| 5 · Tripwires + cutover | Sonnet 5 | Medium | tripwires + runbook ✅ done 2026-09-08; manual Stripe-test-mode e2e is Andrew's |

Opus for the phase that touches the billing webhook. The reconciler was
re-assigned to Sonnet by `docs/self-serve-signup-review-fixes-plan.md` §3 Phase 9
once its Phase 3 had already built the reconciler's scaffolding, scan, bounds and
fail-closed reads — Phase 3 here is now the mechanical job of adding two more
jobs to a shape that exists. Everything else was always mechanical.

## 6. Risks

1. **The signup sweep could delete a re-hidden venue. THE SHARPEST EDGE HERE.**
   Re-hiding sets `hidden = true` on a row that also has `self_serve_created_at`
   set — two of the three clauses of `sweepAbandonedSignupVenues`'s delete
   predicate. The **only** thing standing between a lapsed customer's venue and
   permanent deletion seven days later is the third clause: *"no
   `billing_subscriptions` row for the venue."* That holds today because a
   cancelled subscriber keeps their row — a fact `lib/signupSweep.ts:146`
   documents but which was written before anything could re-hide a venue. Phase
   5's tripwire exists for this. **Never delete a `billing_subscriptions` row on
   cancellation.**
2. **Hiding the wrong venue.** The `self_serve_created_at` guard is what keeps
   this off the Category Blitz global rooms; dropping it would pull an internal
   pooling room in and out of the player list. Same guard, same reason, as
   `maybeRevealVenue`.
3. **Fighting an admin.** Without `rehidden_at`, a reconciler that restores any
   live-billing hidden venue would un-hide venues an admin hid deliberately.
   Restore only what we hid.
4. **Reimplementing Stripe's clock.** Any `current_period_end` arithmetic in the
   hide path is a bug in waiting — dunning windows, proration and grace periods
   are Stripe's to model, and its status already reflects them.
5. **Webhook regression.** `app/api/webhooks/stripe/route.ts` is the
   most-hardened file in the repo, with six existing test files over it. Phase 2
   adds one follower and touches nothing else; every existing webhook test must
   pass untouched.
