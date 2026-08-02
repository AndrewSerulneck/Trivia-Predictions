# Code Review Round 3 — Fixes Plan

Addresses the seven findings from the `/code-review` pass over
`git diff main...HEAD` on branch `billing-guard-and-discounts` (run 2026-08-02,
26 commits, ~105 files).

That review cleared the surfaces the last two rounds hardened — the
`classifyBillingRow` / `readStripeTruth` guard matrix, the webhook creation gate
and `runFirstSyncFollowers` symmetry, `invoiceSubscriptionId`'s fallback chain,
the offline discount mirror-only contract, `setCustomPrice`'s validation chain,
and the new game-settings auth/venue-scoping. What follows is only what it newly
found.

**Related docs:** `docs/billing-review-round2-plan.md` (round 2, done),
`docs/billing-open-issues-plan.md` (inventory — this doc adds items **X** and
**Y**), `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`,
`docs/billing-run-log.md`.

## Phase table

| # | Phase | Model | Effort | Depends on | Status |
|---|-------|-------|--------|-----------|--------|
| 0 | Baseline | Haiku 4.5 | Low | — | ✅ done |
| 1 | Kickoff line-lock race 500s the games API | Sonnet 5 | Low | 0 | ✅ done |
| 2 | Line refresh takes down standard-mode venues | **Opus 5** | Medium | 1 | ✅ done |
| 3 | Odds query truncates later games | Sonnet 5 | Low-Medium | 2 | ✅ done |
| 4 | Spread picks stall `pending` forever | **Opus 5** | Medium-High | 3 | ✅ done |
| 5 | `customer.discount.deleted` wipes a live discount | **Opus 5** | Medium | 0 | ✅ done |
| 6 | Abandoned-signup sweep misses past 100 | Sonnet 5 | Low | 0 | ✅ done |
| 7 | Legal notice silently dropped from most routes | Sonnet 5 | Low | 0 (+ a user decision) | ✅ done |
| 8 | Verification + close-out | Sonnet 5 | Medium | 1–7 | ✅ done |

**Phases 1→2→3→4 are one dependency chain** — they all touch the NFL spread-line
path and each changes what the next one sees. Do them in order, in one worktree.
**Phases 5, 6, 7 are independent** of that chain and of each other; they can run
in parallel worktrees.

**Severity order if you only do some of it:** 4 → 2 → 1 → 3 → 5 → 6 → 7.
Finding 4 silently leaves real players' picks unsettled forever (no error
anywhere); finding 2 is loud but takes down NFL Pick 'Em for venues that never
opted into spread mode; finding 5 is a silent money-display defect on a live
discount. Finding 7 is a compliance question, not a bug, and needs a decision
before code.

---

## Phase 0 — Baseline

**Model: Haiku 4.5 · Effort: Low**

- `npx tsc --noEmit`, `npm run lint`, `npm run test` — record the counts. Last
  known green (round 2 Phase 4): **152 files / 1261 passed / 13 skipped**.
- Confirm the working tree is clean apart from the two advertising PNGs and
  `docs/category-blitz-claude-code-handoff.md`.
- Note the starting SHA in `docs/billing-run-log.md` so each phase below is a
  separate revertible commit.

---

## Phase 1 — The kickoff line-lock must not 500 on a concurrent request

**Model: Sonnet 5 · Effort: Low** — the correct implementation already exists
in this same file; this is copying it, not designing it.

**Finding:** `lib/nflPickEm.ts:1111`. Inside `refreshNFLPickEmGameLines`, the
"game has kicked off, stamp `locked_at`" update ends in `.single()`:

```ts
const { data, error } = await supabaseAdmin
  .from("nfl_pickem_game_lines")
  .update({ locked_at: lockedAt })
  .eq("game_id", gameId)
  .is("locked_at", null)      // ← conditional: matches only if not yet locked
  .select(...)
  .single<NFLPickEmGameLineRow>();

if (error || !data) {
  throw new Error(error?.message ?? "Failed to lock NFL Pick 'Em game line.");
}
```

The `.is("locked_at", null)` makes this a compare-and-set. Two requests hitting
the games list at kickoff both pass the in-memory `existing?.lockedAt` check,
both issue the update, and the **loser matches zero rows** — which `.single()`
turns into PGRST116, which this code turns into a throw, which the route's catch
turns into a 500. The loser did nothing wrong: the row *is* locked, by the
winner, which is the desired end state.

**The fix already exists in this file.** `lockNFLPickEmGameLineForSettlement`
(`lib/nflPickEm.ts:1040–1056`) performs the identical compare-and-set correctly:

```ts
  .maybeSingle<NFLPickEmGameLineRow>();

if (error) { throw ... }            // a real DB error still throws
if (data) return mapGameLineRow(data);   // we won the race

const reloaded = await getNFLPickEmGameLine(gameId);   // we lost — read it back
return reloaded?.lockedAt ? reloaded : null;
```

**Work:** make the block at 1105–1117 use the same shape — `maybeSingle`, throw
only on a genuine `error`, and on a null `data` re-read the row and use the
winner's value for `linesByGameId`. Keep the distinction the sibling makes: a
zero-row match is *success by another writer*, a DB error is still a failure.

Add a comment noting the two sites are deliberately parallel, so a future edit to
one prompts a look at the other.

**Tests:** `tests/lib.nfl-pickem-game-fetch.test.ts` — a kickoff refresh whose
lock update matches zero rows (simulating the lost race) must resolve to the
already-locked row and **not** throw; a real DB error must still throw. Assert
the reload actually happened rather than that the call merely didn't throw —
otherwise the test passes against a silent `continue`.

---

## Phase 2 — A spread-line problem must not take down standard-mode venues

**Model: Opus 5 · Effort: Medium** — small diff, but it decides the failure
policy for a hot read path, and the "which venues does this even apply to"
scoping question has a wrong answer that looks right.

**Finding:** `lib/nflPickEm.ts:1247`. `refreshNFLPickEmGameLines` is awaited
unconditionally on every games-list request:

```ts
const gameLines = await refreshNFLPickEmGameLines(games, {
  season: week.season,
  weekNumber: week.weekNumber,
});
```

Three separate problems ride on that one line:

1. **It throws.** Any DB error inside — including Phase 1's race, and any
   `upsert` failure — propagates to the route's catch and 500s the whole NFL
   Pick 'Em games API.
2. **It runs for every venue**, including venues on **standard** (straight-up)
   scoring, which never read a spread line. A spread-line failure therefore
   breaks Pick 'Em for venues that never opted into the feature.
3. **It costs a provider fetch plus up to ~16 sequential writes per page load**,
   on a path a player hits every time they open the games list.

**Work:**

1. **Scope it to venues that need it.** The games route already resolves the
   venue's scoring mode (`lib/venueGameSettings.ts`); pass it down and skip the
   refresh entirely for standard-mode venues. Careful: the *lock* half of this
   function is what freezes a line at kickoff, and a venue could be switched from
   standard to spread mid-week — decide explicitly whether skipping the refresh
   for a standard venue can leave a line unlocked that a later spread settlement
   needs, and say so in a comment. (`lockNFLPickEmGameLineForSettlement` exists
   precisely so settlement can lock lazily on its own — confirm that covers it
   rather than assuming.)
2. **Make it non-fatal.** Wrap the call so a failure degrades to "no lines this
   request" — the games list still renders, spreads are simply absent — instead
   of 500ing. Log at `warn` with the week and the error. The precedent for this
   policy is `sweepAbandonedIncompleteSubscriptions`
   (`app/api/owner/billing/checkout/route.ts:49`), whose header states the
   reasoning for log-and-proceed on a safety-net call; state the equivalent
   reasoning here rather than copying the comment.
3. **Do not silently swallow a spread-mode venue's missing line.** For a
   *spread* venue the absent line is a real degradation, not a nothing —
   decide whether the response should carry a flag the UI can use to say
   "spreads unavailable" rather than rendering as if the game had no line. If
   that is out of scope, note it as a follow-up rather than leaving it implicit.

**Tests:** `tests/api.nfl-pickem-games-route.test.ts` — standard-mode venue makes
**no** odds fetch and **no** line writes; a throwing refresh on a spread venue
still returns 200 with games; a spread venue still gets lines on the happy path.

---

## Phase 3 — The odds query must not truncate later games

**Model: Sonnet 5 · Effort: Low-Medium** — well-specified; the only real work is
picking the paging bound.

**Finding:** `lib/nflPickEm.ts:987`. `fetchNFLSpreadLinesFromBDL` requests the
season+week odds feed with `per_page: 100` and a **4-page cap**:

```ts
const rows = await fetchBallDontLieList<BDLNFLOdds>("/nfl/v1/odds", query, 4);
```

That is 400 rows. But the endpoint returns **one row per game per sportsbook** —
roughly 16 games × 15+ vendors — so a full week can exceed the cap, and the
games whose rows sort last simply never appear in the returned map. They get no
line, silently. Combined with Phase 4's finding, a game truncated here produces
picks that can never settle.

**Work:**
1. Raise the bound so a full week fits with headroom, and derive it from the
   real shape (games × books) with a comment showing the arithmetic, rather than
   picking a round number. Keep a cap — an unbounded loop against a paid provider
   API on a request path is not acceptable either.
2. Prefer narrowing the query over paging harder if the provider supports it —
   check whether the odds endpoint accepts a book/market filter, since we only
   consume spreads and `pickBetterSpreadLine` already collapses vendors by
   priority. Filtering server-side is strictly better than fetching 15 books to
   discard 14.
3. **Detect truncation rather than absorbing it.** If the cap is hit, log a
   warning naming the week — silent truncation is what made this invisible.

**Tests:** `tests/lib.nfl-pickem-game-fetch.test.ts` — a paged provider response
spanning more than one page yields lines for **every** requested game id,
including one whose rows land on the last page; hitting the cap logs.

---

## Phase 4 — Spread picks must not stall `pending` forever

**Model: Opus 5 · Effort: Medium-High** — the code change is small; deciding
*what a spread pick with no line settles to* is a product judgment with no
reversible-by-default answer, and it touches the settlement path that awards
points.

**Finding:** `lib/pickem.ts:2429–2437`. In the settlement sweep:

```ts
if (nflScoringMode === "spread") {
  if (homeScore === null || awayScore === null) {
    continue;                       // ← no scores: skip
  }
  const line = await getLockedNFLLine(row.game_id);
  if (!line) {
    continue;                       // ← no line: skip, forever
  }
```

Both `continue`s leave the pick `pending` with **no fallback and no deadline**.
The sweep re-runs, takes the same branch, and skips again — permanently. A
`nfl_pickem_game_lines` row only exists if someone loaded that week's games page
*before kickoff* **and** balldontlie had odds for that game at that moment
(and, per Phase 3, if the game wasn't truncated out of the response). None of
those are guaranteed, and nothing retroactively creates the row: after kickoff
`refreshNFLPickEmGameLines` skips the game entirely (`if (hasKickedOff) continue`).

So a real player's pick can sit `pending` forever, never scored, with no error
raised anywhere.

**Work:**

1. **Decide the fallback and write down why.** The options, with the tradeoff
   stated rather than hidden:
   - **Settle straight-up** (treat as standard scoring). Every pick resolves and
     players get points, but a player who picked *against* the spread is graded
     on a rule they didn't play by — that is arguably worse than not scoring.
   - **Void the pick** (a `void`/`push` status, no points either way). Honest —
     we can't grade what we didn't record — and symmetric across players. Needs
     a status the schema and UI can represent; check whether `pickem_picks.status`
     already has one before inventing it.
   - **Keep pending, but bounded** — escalate to one of the above after a
     staleness window (the sweep already computes `staleFinalizeMs` for the
     scores case; reuse that clock rather than adding a second one).

   **Recommendation: void after the existing staleness window**, so a
   transiently-missing line still has time to be settled correctly by a later
   run, and a permanently-missing one resolves honestly instead of silently.
   Confirm the schema supports it before committing to it.
2. **Apply the same reasoning to the null-scores `continue` at 2429.** It has
   the identical shape and the identical permanent-stall failure mode; a game
   that never gets scores from the provider is the same problem. Do not fix one
   and leave the other.
3. **Make the stall observable.** Whatever the policy, log when a spread pick is
   skipped for a missing line, with the game id — this defect was invisible
   because nothing ever said anything.
4. **Check the reward accrual path.** `lib/nflPickEmRewardAccrual.ts` awards
   1 point per correct pick on a separate sweep; confirm whatever terminal status
   you choose is one it correctly ignores (a voided pick must not accrue).

**Tests:** extend the NFL settlement tests — a spread pick whose line row is
missing resolves to the chosen terminal state (not `pending`) once past the
staleness window; **before** that window it stays `pending` (the retry must
survive); a voided pick accrues no reward points; the normal spread path with a
line present is unchanged.

**Risk:** this writes terminal state onto real players' picks. The staleness
window is what keeps a transient provider gap from voiding a gradeable pick —
do not drop it for simplicity.

---

## Phase 5 — `customer.discount.deleted` must verify *which* discount died

**Model: Opus 5 · Effort: Medium** — same class as round 2's work: a silent
money-display defect on the discount mirror, where the wrong call keeps a
partner's page disagreeing with what Stripe bills.

**Finding:** `app/api/webhooks/stripe/route.ts:342` (`syncDiscountFromEvent`).
On a `customer.discount.deleted` event the handler clears the **entire** mirror,
matched only on `stripe_subscription_id`:

```ts
const mirror = removed ? { ...CLEARED_MIRROR } : discountMirrorFromStripe(...);
const update = supabaseAdmin.from("billing_subscriptions").update(mirror);
if (subscriptionId) {
  const { error } = await update.eq("stripe_subscription_id", subscriptionId);
```

It never checks the **deleted coupon against the mirrored one**. Stripe retries
webhooks for ~3 days, and applying a discount over an existing one *replaces*
it — emitting a delete for the old coupon and a create for the new. So a
retried or reordered `deleted` event for the **replaced** coupon wipes the
**replacement** out of the mirror, while Stripe keeps billing it. The partner's
page then shows full price against a discounted invoice.

Note the mirror-vs-Stripe direction: this is the inverse of the round-1 concern
(a mirror advertising a discount Stripe no longer applies). Here Stripe is right
and we go blank.

**Work:**
1. Before clearing, read the row's `stripe_coupon_id` and clear **only** if it
   matches the deleted discount's coupon. A mismatch means the mirror already
   moved on — ignore the event (and log it; a stale delete arriving is worth
   seeing).
2. Handle the ambiguous cases explicitly rather than by omission: a mirror with
   `stripe_coupon_id === null` marks a **locally-applied (offline) discount**
   (DISCOUNT Ph2 note 5) — a Stripe delete event must not clear that. Decide and
   comment what happens when the event's own coupon ref is unresolvable.
3. Apply the same identity check to the **customer-level fallback** below it,
   which already resolves matching rows and writes only on exactly one match —
   the coupon check belongs there too.
4. Keep the existing subscription-id match as the ownership guard; this adds a
   second condition, it does not replace the first.

**Tests:** `tests/api.webhooks.stripe-discount-sync.test.ts` — a `deleted` event
for coupon A when the mirror holds coupon B leaves the mirror **untouched**; a
`deleted` for the coupon the mirror actually holds still clears it (the
round-1/round-2 behaviour must not regress); a `deleted` against an offline
(`stripe_coupon_id === null`) row is a no-op. Verify the replace-then-retry
sequence end to end, since that is the real-world trigger.

### ✅ As-built (2026-08-02)

All four work items done; full record in `docs/billing-run-log.md` under
**"Code Review Round 3 — Phase 5"**. The shape:

- `syncDiscountFromEvent` now **reads its target row(s) before writing** on both
  branches (it previously wrote blind on the subscription branch) and writes
  **by row id**. New `deletedCouponOwnsMirror` gates a clear on
  `row.stripe_coupon_id === <the deleted event's coupon id>`; the
  subscription-id match stays as the ownership guard underneath it (item 4).
  The customer-level fallback goes through the same check (item 3).
- The deleted coupon's id is read straight off `discountCouponRef` — no
  `resolveDiscountCoupon` retrieve — so a Stripe outage can't turn "which coupon
  died" into `null` and cause a wrong clear.
- Both ambiguous cases resolve to **don't clear**, commented on the helper
  (item 2): a null `stripe_coupon_id` (nothing to clear, or an offline discount
  Stripe has no authority over) and an unresolvable event coupon ref. The
  asymmetry justifying that default: a stale mirror is self-repaired by the
  accompanying `customer.subscription.updated`; a wrongly-blanked one is not.
- A skipped clear logs a `warn` naming both coupons.
- `tests/api.webhooks.stripe-discount-sync.test.ts` 9 → 14 tests, including the
  replace-then-retry sequence end to end. Suite: **154 files / 1284 passed /
  13 skipped**, tsc + lint clean.

**For Phase 6/7:** both remain independent of everything done so far — Phase 6
touches only `app/api/owner/billing/checkout/route.ts`, and **Phase 7 is still
blocked on the user decision** in its item 1; ask before writing code for it.
Phase 8 still owes: the NFL findings written into
`docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md` (not started), and
inventory items **X** (this phase) and **Y** (Phase 6) added to
`docs/billing-open-issues-plan.md` (not started).

---

## Phase 6 — The abandoned-signup sweep must page

**Model: Sonnet 5 · Effort: Low** — the paging idiom already exists in this PR.

**Finding:** `app/api/owner/billing/checkout/route.ts:54`.
`sweepAbandonedIncompleteSubscriptions` lists **account-wide** incomplete
subscriptions with a flat `limit: 100` and no paging:

```ts
const incomplete = await client.subscriptions.list({ status: "incomplete", limit: 100 });
for (const sub of incomplete.data) {
  if (sub.metadata?.venueId?.trim() !== venueId) continue;
```

Past 100 account-wide incompletes, this venue's own abandoned subscription can
fall outside the page and be missed — reopening exactly the double-bill window
the sweep exists to close (partner completes a stale Checkout tab after paying
through a fresh one). The function's own header explains why `list` was chosen
over `search`; that reasoning is sound and unaffected — it just needs to page.

**The sibling to copy is in this same PR:** the promo-codes route
(`app/api/admin/billing/promo-codes/route.ts:85`) uses
`.list({ limit: 100, … }).autoPagingToArray({ limit: 1000 })`.

**Work:**
1. Switch to `autoPagingToArray` with an explicit ceiling, matching the
   promo-code route's shape so the two read alike.
2. Keep the existing log-and-proceed failure policy — the header already
   justifies it, and Phase 2 cites it as precedent. Do not tighten it here.
3. Consider whether the ceiling being hit deserves a warning log, on the same
   "silent truncation is what hid this" reasoning as Phase 3.

**Tests:** `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` (or the
checkout suite) — a paged list whose match sits on the **second** page is still
found and cancelled; the sweep still proceeds when the list call throws.

### ✅ As-built (2026-08-02)

All three work items done; full record in `docs/billing-run-log.md` under
**"Code Review Round 3 — Phase 6"**. The shape:

- `sweepAbandonedIncompleteSubscriptions` now chains
  `.list({ status: "incomplete", limit: 100 }).autoPagingToArray({ limit: 1000 })`
  instead of reading `.data` off one unpaged page — same shape as the
  promo-codes route's `GET` (item 1). The 1000-item cap is a runaway guard, not
  an expected boundary, matching that sibling's own comment.
- Failure policy is unchanged (item 2): the existing try/catch around the
  whole list-and-page call still logs and proceeds on any failure, so a paging
  failure and a plain list failure are covered without any new branch.
- Hitting the cap logs a `console.warn` naming the venue (item 3), on the same
  "silent truncation hid this" reasoning as Phase 3.
- `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`'s sweep describe
  block moved its `stripeList` mocks (including the shared `beforeEach`
  default) from `{ data: [...] }` to `{ autoPagingToArray: () => [...] }`, and
  gained one new case: the venue's own abandoned subscription sitting behind
  100 filler subscriptions for other venues is still found and cancelled.
  Suite: **154 files / 1285 passed / 13 skipped**, tsc + lint clean.

**For Phase 7/8:** Phase 7 remains independent and **still blocked on the user
decision** in its item 1 — ask before writing code for it. Phase 8 still owes
everything the Phase 5 handoff listed (the NFL findings write-up, inventory
items X and Y in `docs/billing-open-issues-plan.md`, the god-mode tripwire once
Phase 7 lands, and the Phases 1–4 browser pass) — none of that was touched by
this phase.

---

## Phase 7 — Decide whether the legal notice should have been narrowed

**Model: Sonnet 5 · Effort: Low** — trivial code either way. **Blocked on a
product/compliance decision, which is why it is its own phase.**

**Finding:** `components/ui/AppShell.tsx:49`. Commit `35115fc` ("Fix Category
Blitz mobile shell") changed the legal-notice condition:

```ts
// before
{!isAdmin && !isFullscreen ? ( … legalNotice … )}
// after
const showLegalNotice = !isAdmin && isVenueHome;   // /venue/:id only
```

The footer carrying the geofence / commercial-license notice therefore no longer
renders on `/info`, `/join`, `/owner/*`, or any other non-admin route — it now
appears only on the venue home page. Nothing else in that commit is about legal
copy; the change came in alongside `showShellDecor` and `mainClassName` as part
of a layout refactor, with no comment and no mention in the commit message.

That pattern — a compliance-surface reduction bundled silently into a layout
commit — is what makes this worth a decision rather than a fix.

**Work:**
1. **Ask first: was the narrowing intended?** This plan cannot answer it. If the
   notice is only legally required where a user is inside a venue's geofence,
   `isVenueHome` may be exactly right and all this phase needs is a comment
   saying so, so the next reader doesn't "restore" it.
2. If it was **not** intended, restore the prior condition
   (`!isAdmin && !isFullscreen`) and add a comment stating where the notice must
   appear and why, so a future layout refactor can't quietly drop it again.
3. Either way, leave a comment. The absence of one is what let this through.

**Tests:** if restored, a small render test asserting the notice appears on a
non-venue, non-admin, non-fullscreen route — cheap, and it turns the invariant
into something CI enforces.

### ✅ As-built (2026-08-02)

**Decision (user, this session): the narrowing was NOT intended.** Restored
`components/ui/AppShell.tsx:49` to the pre-`35115fc` condition.

- Extracted the condition into an exported pure function,
  `shouldShowLegalNotice(pathname)`, in `components/ui/AppShell.tsx`, rather
  than restoring it as an inline `useEffect`/render-body expression. This
  project has **no DOM-rendering test harness** (no `jsdom`, no
  `@testing-library/react`, no `.test.tsx` files anywhere, `vitest.config.ts`
  is `environment: "node"` and only globs `tests/**/*.test.ts`) — extracting
  to a plain function makes the invariant unit-testable without standing up
  that infra, which would have been disproportionate to a one-line fix.
  `isVenueHome` (only ever used to feed the old condition) was deleted rather
  than kept dead.
- Added a comment on `shouldShowLegalNotice` itself documenting why this
  exists and that it must not be narrowed again without a fresh, explicit
  compliance decision (work item 3).
- **New test:** `tests/components.app-shell-legal-notice.test.ts` (5 cases) —
  shows on `/join`, `/owner/billing`, `/redeem-prizes`; suppressed on
  `/info` (itself a fullscreen route — a subtlety worth flagging: the
  regression's *practical* blast radius was narrower than the finding first
  suggested, since `/info` and `/join`'s game sub-routes were already
  fullscreen-suppressed pre-regression; the routes it actually newly hid the
  notice from are `/join` itself, `/owner/*`, and any other plain non-admin
  route not in `FULLSCREEN_PATHS`); suppressed on `/venue/:id` (fullscreen);
  suppressed on admin routes and fullscreen game routes.
- **Found and fixed a stale tripwire while running the suite:**
  `tests/category-blitz-mobile-shell-contract.test.ts`'s
  `"keeps the legal notice venue-home-only..."` case asserted the exact
  buggy strings (`isVenueHome`, `!isAdmin && isVenueHome`) — it had locked
  the regression in as a contract instead of catching it. Rewrote it to
  assert against `shouldShowLegalNotice` / the restored call site instead.
  Worth noting for Phase 8's write-up: this is the second round-3 finding
  (after Phase 5/6's silent failures) that survived specifically *because* a
  test enforced the wrong behavior, not because no test existed.
- Full suite: **155 files / 1290 passed / 13 skipped**, tsc + lint clean.
  `npm run test:god-mode-join` also run per CLAUDE.md (AppShell sits in the
  join-flow shell) — 5 files / 34 passed, unaffected (the tripwire's static
  guard checks geolocation-before-server-profile ordering, not this file).

**For Phase 8:** all seven phases are now done. Phase 8 still owes, per the
Phase 6 handoff plus this phase's addition:
1. The NFL findings write-up in
   `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md` (not started).
2. Inventory items **X** (`customer.discount.deleted` identity check, Phase 5)
   and **Y** (abandoned-signup sweep paging, Phase 6) added to
   `docs/billing-open-issues-plan.md` and closed, U/V/W convention.
3. The Phases 1–4 browser pass via the `verify` skill (standard-mode +
   spread-mode venue games list; confirm a settlement run leaves no pick
   `pending` past staleness) — not yet done.
4. `npm run test:god-mode-join` — already run and green above; Phase 8 can
   skip re-running it unless later work touches the join shell again.
5. Consider (not required, but cheap while there) noting in
   `docs/code-review-round3-plan.md` or the run log that the mobile-shell
   contract test had a false-positive tripwire, in case other `.test.ts`
   files in this suite assert exact buggy source strings the same way —
   worth a `grep -rl "toContain(\"const show"` sweep if there's appetite,
   but that is new scope, not part of this plan's seven findings.
6. Live Stripe pass for Phases 5/6 remains optional per the Phase 8 spec —
   mocked-SDK tests already cover both and the live harness cost note from
   round 2 Phase 4 still applies.
7. Ask the user to re-run `/code-review` once Phase 8 closes out — it's
   user-invoked, cannot be launched from a session.

---

## Phase 8 — Verification + close-out

**Model: Sonnet 5 · Effort: Medium**

1. `npx tsc --noEmit`, `npm run lint`, `npm run test` green.
2. **`npm run test:god-mode-join`** — Phase 7 touches `AppShell`, which is in the
   shell of the join flow. CLAUDE.md requires this tripwire after touching that
   area; run it even if the change looks purely cosmetic.
3. **Phases 5 and 6 need no live Stripe** — mocked-SDK tests cover both, and the
   round-2 Phase 4 experience is that the live harness costs far more than it
   returns for logic already pinned by tests. If a live pass is wanted anyway,
   read `docs/billing-run-log.md`'s round-2 Phase 4 section first: **the
   permission classifier now blocks the agent from running
   `node --env-file=.env.local …` at all**, so every seed/read/cleanup step has
   to be run by hand. Budget for that or skip it deliberately.
4. **Phases 1–4 want a real browser pass**, not just unit tests — the failure
   modes are "the games list 500s" and "a pick never resolves," which are
   end-to-end symptoms. Use the `verify` skill against a throwaway venue: load
   the NFL Pick 'Em games list for a **standard**-mode venue and a **spread**-mode
   venue, and confirm a settlement run leaves no pick `pending` past the
   staleness window.
5. Append a run-log section per phase with per-check pass/fail lines, in
   `docs/billing-run-log.md` (the NFL phases too — it is the shared run log for
   this branch, despite the name).
6. Add items **X** (`customer.discount.deleted` identity check) and **Y**
   (abandoned-signup sweep paging) to `docs/billing-open-issues-plan.md`'s
   inventory table and close them, following the U/V/W convention. The NFL
   findings belong in
   `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`, not the billing
   inventory — record them there.
7. Ask the user to re-run `/code-review` — it is user-invoked and cannot be
   launched from a session.

### ✅ As-built (2026-08-02)

All seven work items done; full record in `docs/billing-run-log.md` under
**"Code Review Round 3 — Phase 8"**. Summary:

1. `npx tsc --noEmit` / `npm run lint` / `npm run test` clean —
   **155 files / 1290 passed / 13 skipped**, unchanged from Phase 7.
2. `npm run test:god-mode-join` **5 files / 34 passed** — re-run per
   CLAUDE.md's post-`AppShell`-touch rule.
3. Live Stripe pass for Phases 5/6 skipped deliberately, as the plan allows —
   mocked-SDK coverage plus round-2 Phase 4's cost precedent.
4. Browser pass done against the real BallDontLie provider (no mocks): a
   standard-mode venue's games-list returned 200 with no spread data
   attempted and measurably faster than a spread-mode venue's request
   (~0.58s vs ~1.36s, confirming Phase 2's refresh is actually skipped); the
   spread-mode venue (a throwaway `venue_game_settings` row, reverted after)
   got a spread on all 16 week-1 games with no truncation (Phase 3). Phase
   4's settlement-stall fix was verified by code inspection plus existing
   targeted unit tests rather than a live end-to-end settlement sweep — full
   reasoning in the run log.
5. Run-log section appended (this entry's source).
6. Items **X** and **Y** added and closed in
   `docs/billing-open-issues-plan.md`, U/V/W convention. The NFL findings
   (Phases 1–4) are recorded in
   `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`'s new "Round 3
   Code Review Findings" section instead, per this item's own instruction.
7. Asked below.

**Round 3 is closed — all eight phases done.**

---

## Model / effort summary

| Phase | Work | Model | Effort |
|---|---|---|---|
| 0 | Baseline | Haiku 4.5 | Low |
| 1 | Kickoff lock: `single` → `maybeSingle` + reload | Sonnet 5 | Low |
| 2 | Line refresh: scope to spread venues, make non-fatal | **Opus 5** | Medium |
| 3 | Odds query paging / filtering | Sonnet 5 | Low-Medium |
| 4 | Spread settlement fallback for a missing line | **Opus 5** | Medium-High |
| 5 | Discount-delete coupon identity check | **Opus 5** | Medium |
| 6 | Sweep auto-paging | Sonnet 5 | Low |
| 7 | Legal-notice scope decision | Sonnet 5 | Low |
| 8 | Verification + close-out | Sonnet 5 | Medium |

**Opus 5 for Phases 2, 4 and 5.** Phase 4 decides what a pick that cannot be
graded settles to — it writes terminal state onto real players' records, and
both obvious answers (grade it straight-up, leave it pending) are defensible and
wrong in different ways. Phase 2 sets the failure policy for a hot read path and
has a scoping trap (skipping the refresh for standard venues can strand a line
the settlement path later needs). Phase 5 is the same class of mirror-vs-Stripe
reasoning that rounds 1 and 2 existed to get right, and the failure is silent.

**Sonnet 5 for Phases 1, 3, 6** — each has a correct implementation already in
the tree to mirror (1042's `maybeSingle`, the promo-code route's
`autoPagingToArray`) or a single well-bounded change. **Sonnet 5 for Phase 7**,
which is a one-line change gated on a decision only the user can make.
