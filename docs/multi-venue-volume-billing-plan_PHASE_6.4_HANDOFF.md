# Multi-Venue Volume Billing — Phase 6.4 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phase 6.4"). This note closes **Phase 6.4** (review findings
#5, #6, #7, #8) and opens **Phase 6.5**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_6.3_HANDOFF.md`) still hold for what
they describe.

---

## For Andrew (plain English)

**What was wrong, and what changed.** All four fixes are in the admin "Link a venue to a partner" tool and the
Partner Billing list.

1. **Retrying a charge could start a second charge.** If the screen got a "something went wrong" answer *after* the
   card might already have been charged, it threw away its safety key and the next "Charge and add" looked like a
   brand-new request. Now the key is thrown away only when the answer proves nothing was charged (a clear "no": card
   declined, venue belongs to someone else, and so on). On anything unclear, the screen keeps the key and shows
   **Check again**, which asks the same question again and can't charge twice.
2. **The Partner dropdown and the bill's "anchor venue" name came from whatever you had typed in the search box.** If you
   searched for one venue, the other venue's name vanished and the Partner list shrank. Both now come from the server,
   looked up before any search.
3. **A comped (free) venue couldn't be moved onto the partner's bill.** The server could do it, but the screen never
   offered the venue. Now a comped venue shows in the list as "Bravo — free on andrew@…". Picking it fixes the partner
   (you can't pick a different one) and offers only "Add to their bill".
4. **"Back to standard pricing ($100 / $75 / $60 / $45)"** was typed by hand. It's now built from the price table, so a
   price change can't leave a stale label. A test now also fails if a dollar price is typed into any admin billing file.

**Is it live?** No. Nothing is committed (6.3 and 6.4 are both uncommitted) and there's no database change. The flag
is still off. The only user-visible parts are admin screens.

**Your question about "Grant offline" on a comped or removed venue.** See the next section. Short version: it isn't
that you *can't* grant a venue offline. The trouble is when the partner **already has a bill**. Then "Grant offline"
quietly creates a **second** bill for them, and a partner with two bills can't use "Add a venue". I recommend we simply
block that one case and point the admin at the right button. It's a small fix, and I've put it in 6.5 as the default.
**You don't have to decide anything for it to proceed.** Tell me if you'd rather leave it alone.

**What needs you:** nothing for 6.5 to start. Committing 6.3 and 6.4 is your call (path lists in §2).

### Why "Grant offline" on a comped/removed venue is a problem (simple terms)

- The system's rule is **one bill per partner**. A bill has one *anchor* venue plus any other venues attached to it.
  Pacific Street is the anchor of your bill. The test venue is "comped" = linked to you, attached to no bill.
- "Grant offline" means: "this venue pays by check; create a check-paid bill for it." For a venue that is on **no bill
  at all, and the partner has no other bill**, that is exactly right: the check bill becomes their one bill.
- But for a comped venue (or a removed one) where the partner **already has a live bill**, "Grant offline" doesn't
  attach it to the existing bill. It opens a **separate** second bill anchored on that venue.
- The consequence: the partner now has two bills. Our "Add a venue" code looks for *the* bill to add to, finds two,
  and refuses with "Choose which venue's bill to add this venue to" (`multiple_bills`), and the admin "Link a venue →
  Add to their bill" refuses the same way. The partner is stuck until someone deletes one bill by hand.
- Nothing is charged wrongly; it just creates a mess that locks the partner out of the self-serve tools.
- **Proposed fix (6.5):** when the partner already has a live bill, "Grant offline" on their comped/removed venue is
  refused with a message ("This partner already has a bill. Use Link a venue → Add to their bill"), and the button is
  hidden. A comped venue can then go onto their bill (even a check-paid bill) through the Link tool, which 6.4 just
  made possible. A removed venue goes back through the partner's own "Add back". If the partner has **no** live bill, the
  button keeps working as today. Cost: nothing at run time.

---

## For the next agent (Phase 6.5)

### 1. Goal and scope

**Phase 6.5** (plan §5, **Opus 5.5, high**): re-review and close out the whole Phase 6 + 6.1–6.4 diff.
- Run `/code-review` on it. Fix or list every new finding.
- **Fix the quote-vs-Confirm rate gap** from `…_PHASE_6.1_HANDOFF.md` §7.3 (Andrew, 2026-10-11: fix it, not waived).
- **Default decision, no need to ask Andrew again:** guard "Grant offline" on a comped or removed venue when the
  partner already has a live bill (explained above; details in §5 here). Andrew was told in plain English and does not
  have to decide.
- Update `CLAUDE.md`'s multi-venue section: the price swap is claimed under the bill lock, only `custom_monthly_` is
  per-venue, Checkout refuses a billed partner's second venue.
- Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (one at a time), plus
  `tests/lib.auth-users-fk-guard.test.ts` unchanged.
- Commit with an explicit path list **only when Andrew says**. Then write the handoff that opens Phase 7.

**Out of scope:** pushing (Andrew wants one push at the end of the plan), `supabase db push`, Phase 7 release steps.

### 2. Starting state

- Branch `main`. Commits on top of `origin/main`, **not pushed**: `6c5a178` (6), `a83da94` (6.1), `636410c` (6.2).
  Check with `git log origin/main..main`.
- **Phases 6.3 and 6.4 are uncommitted** (no migration in either). Commit paths (**explicit list, never `git add -A`**):
  - 6.3 (from its handoff): `lib/venueBilling.ts`, `lib/multiVenueBilling.ts`, `lib/adminBillView.ts`,
    `app/api/owner/billing/checkout/route.ts`, `app/api/owner/billing/route.ts`, `app/api/admin/billing/route.ts`,
    `app/owner/billing/page.tsx`, `components/admin/sections/BillingSection.tsx`,
    `tests/api.billing-unbilled-venue-states.test.ts`, `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts`,
    `tests/lib.admin-bill-view.test.ts`, `tests/multi-venue-billing-contract.test.ts`,
    `docs/multi-venue-volume-billing-plan.md`, `docs/multi-venue-volume-billing-plan_PHASE_6.3_HANDOFF.md`
  - 6.4 adds these: `lib/addVenueFlow.ts`, `lib/adminAttachFlow.ts` (new), `lib/venuePricing.ts`,
    `lib/billingCustomPrice.ts` (comment only), `components/admin/billing/LinkVenueToPartner.tsx`,
    `tests/lib.admin-attach-flow.test.ts` (new), `tests/api.owner.venues-add.test.ts`,
    `docs/multi-venue-volume-billing-plan_PHASE_6.4_HANDOFF.md`
    (and the 6.3 files above were touched again: `app/api/admin/billing/route.ts`, `lib/adminBillView.ts`,
    `components/admin/sections/BillingSection.tsx`, `tests/lib.admin-bill-view.test.ts`,
    `tests/api.billing-unbilled-venue-states.test.ts`, `tests/multi-venue-billing-contract.test.ts`).
  - Suggest committing 6.3 and 6.4 as two commits only if you can split the shared files by hunk; otherwise one commit
    "Multi-venue billing Phases 6.3–6.4" is honest and fine. Ask Andrew.
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Database / Stripe:** no migration, no writes, no Stripe calls, and no production queries in this phase.
  Migration `20261011224839` (6.1) is applied, as recorded before.
- Flag `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` is still off.

### 3. Decisions already made

- Andrew's answers: plan §2. Don't re-ask. Rate gap: fix in 6.5 (not waived). Push at the end of the plan.
- **Key rule (#5):** a refusal ends the attempt (fresh key next time) only if it is a **4xx** and not
  `addition_in_progress` (`refusalEndsAttempt`, `lib/addVenueFlow.ts`). Everything else (5xx, a dropped page, an
  unrecognised 2xx, another add holding the bill) keeps the key and shows **Check again**. A 4xx with an *admin-only*
  code (for example `venue_has_owner`) counts as a clean refusal even though the partner flow doesn't know the code.
- **One list for the Link sheet's venues:** `venues: [{ id, name, ownerId }]`. `ownerId: null` = linked to nobody;
  `ownerId` set = linked to exactly that one partner and comped there (classifier says `comped`). A venue with two
  links is never offered. The server's own re-checks in `attachVenueToOwner` are unchanged and still authoritative.
- **Owners list = every `venue_owners` row** (limit 1000, by email), as the plan said, including accounts with no venue
  yet or with unpaid-signup debris. The server refuses a bill add for an owner with no bill, so a wrong pick can't
  cost money.
- The anchor name is read from the same unfiltered `venue_owner_venues` read the list already does (zero extra reads).
  If a bill's anchor venue is not linked to any partner, `anchorVenueName` is `null` and the UI shows the venue id.

### 4. Files changed and how they fit

- **`lib/addVenueFlow.ts`**: new `refusalEndsAttempt(httpStatus, code)`. The partner sheet (`AddVenueSheet.tsx`) is
  **unchanged** and still clears its key on any refusal (see §7 item 2).
- **`lib/adminAttachFlow.ts`** (new, pure): `interpretAdminAttachReply(httpStatus, body)` → `comped | already_on_bill |
  offline_attached | paid | requires_action | processing | unconfirmed | refused`. Non-card successes are read first;
  everything else goes through the partner flow's own `interpretAddVenueReply`, then `refusalEndsAttempt` picks
  `refused` vs `unconfirmed`. `ADMIN_ADD_IN_PROGRESS_MESSAGE` replaces the partner-worded "You're already adding a venue".
- **`components/admin/billing/LinkVenueToPartner.tsx`**: now loads **both** `venues` and `owners` from
  `GET /api/admin/billing?resource=attach-options` and takes no `owners` prop. `confirm()` uses the interpreter:
  `refused` → clear key; `unconfirmed` → keep key + Check again; `requires_action`/`processing` → keep key (as before).
  Choosing a comped venue (`selectedVenue.ownerId`) fixes the partner (read-only text), forces mode "bill" and hides the
  "Free (comped)" option. `ownerId` and `mode` are **derived** (`selectedVenue?.ownerId ?? pickedOwnerId`), not synced state.
- **`components/admin/sections/BillingSection.tsx`**: `linkOwners` deleted; `billLine` uses `bill.anchorVenueName` /
  `removedFrom.anchorVenueName` (falls back to the id); the standard-pricing button label is
  `{venuePriceBandsLabel()}`.
- **`app/api/admin/billing/route.ts`**: `venueNameById` (from the unfiltered `links`) feeds `bill.anchorVenueName` and
  `removedFrom.anchorVenueName`. `attachOptions()` rewritten: three parallel reads (venues, links with `owner_id`,
  owners) + `unbilledVenueStates` for the linked, visible, non-placeholder venues that have exactly one owner; a
  classifier error is a 500 (never an empty list that silently hides comped venues).
- **`lib/adminBillView.ts`**: `AdminPartnerBill.anchorVenueName`, `AdminRemovedFrom.anchorVenueName`.
- **`lib/venuePricing.ts`**: `venuePriceBandsLabel()` (imports `formatCentsShort` from `lib/merchPricing.ts`, which has no
  imports, so the module stays pure and the `tsx` price scripts still load it; verified).
- **`lib/billingCustomPrice.ts`**: doc comment points at `VENUE_PRICE_TIERS` instead of repeating the numbers.

### 5. Facts, traps, and the "Grant offline" guard (default for 6.5)

- **Grant offline guard, what to build.** `grant-manual` (`app/api/admin/billing/route.ts`, after the owner link lookup)
  only refuses a venue that is a **non-anchor member of a bill** (`notAnchorResponse`). A comped or removed venue has no
  active membership, so it passes and opens a second bill. Add: run `unbilledVenueStates([venueId], new Map([[venueId, ownerId]]))`;
  if the state is `removed`, `comped`, or has an `ownerBillId`, refuse 409 with a clear code and the message above. Put the
  code and message in `lib/multiVenueBilling.ts` (one home for copy). In `BillingSection.tsx`, hide or disable the
  "Grant offline" button for rows where `comped` or `removedFrom` is set. **Careful:** the admin list's `comped` is only
  true when the partner has a live bill; a venue whose partner has *no* live bill must keep its Grant button. A state of
  `unbilled` with `ownerBillId: null` is allowed. Tests: refused for comped, removed, and unbilled-with-other-bill;
  allowed for a first/only bill; allowed when the partner's only other bill is cancelled; contract pin that the guard
  precedes the upsert.
- **`addition_in_progress` for the admin now means "Check again"**, not "refused". The same key can later succeed when the
  other add finishes. That is intended.
- **Admin attach `failed()` returns HTTP 500 with code `invalid_request`** (a known code). That is why the rule is
  status-based, not "known code" based. Don't change `failed()` to a 4xx.
- **Comped linked venues must be visible** (`hidden` false) to be offered: `attachVenueToOwner` refuses hidden venues
  (`venue_hidden`). Andrew's own `venue-hightop-test` is hidden, so it will **not** appear in the Link sheet. That is
  correct.
- Older traps still hold:
  - `npm run build` flips `next-env.d.ts`. Restore with
    `sed -i '' 's#./.next/types/routes.d.ts#./.next/dev/types/routes.d.ts#' next-env.d.ts`. **Never** `git checkout --` it.
  - Don't run typecheck and build together.
  - Scratch scripts need `NODE_PATH="$PWD/node_modules" node --env-file=.env.local …`.
  - No `STRIPE_GRADUATED_PRICE_ID` is set in `.env.local`.

### 6. Build, run, test: what was verified (2026-10-11)

- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note).
- `npm run test`: **342 files passed, 1 skipped; 4,020 tests passed, 13 skipped, 0 failed.**
- `npm run build`: succeeded. `next-env.d.ts` restored afterwards (no diff).
- **New and changed tests**
  - `tests/lib.admin-attach-flow.test.ts` (new, 8): `refusalEndsAttempt`, every reply kind, 4xx vs 5xx,
    `addition_in_progress`, unrecognised 2xx, and the price-bands label.
  - `tests/api.billing-unbilled-venue-states.test.ts` (+6): anchor name survives a search that hides the anchor (billed and
    removed); `attach-options` offers unlinked + comped (tagged with their owner) and nothing billed, hidden, (0,0), or
    removed; returns every owner incl. one with no venue; a classifier error is a 500.
  - `tests/api.owner.venues-add.test.ts` (+2): comped → bill (preview, charge, linked once); the SAME key re-sent after an
    unconfirmed (3-D Secure) answer returns the first attempt's state with one ledger row and one Stripe update.
  - `tests/multi-venue-billing-contract.test.ts`: the price-literal pin now covers the admin files (cents and `$` label
    spellings in code) and a Phase 6.4 block pins the key rule, the unfiltered names/owners, the shared classifier, and
    the label.
- **Mutation check:** making the "unconfirmed" branch clear the key, and making the interpreter treat every refusal as
  definitive, each failed tests (behaviour and contract). Files were restored from scratchpad copies; all pass.
- **Unverified:** the Link sheet in a real browser (locked-partner view, "Check again" flow). The logic is covered by the
  pure interpreter tests and the route tests, but nobody has clicked it. It is an admin-only light surface. The dev
  server on :3000 belongs to Andrew; browser-test from a scratchpad clone with mocked routes if needed (never POST a
  real charge from dev).

### 7. Open questions

1. Commit 6.3 and 6.4 (§2). Pushing waits for the end of the plan.
2. **Optional for 6.5:** the partner's own `AddVenueSheet.tsx` also clears its key on any refusal, including a 5xx with a
   known code (`addition_failed` 500/502, `stripe_unavailable` 503). The server's one-add-in-flight lock keeps this from
   double-charging, so it's low risk. If you touch it, use `refusalEndsAttempt(response.status, outcome.code)` and show
   its "unconfirmed" state. Not required by the plan.

### 8. Recommended first steps for Phase 6.5 (Opus 5.5, high)

1. Read plan §5 "Phase 6.5", `…_PHASE_6.1_HANDOFF.md` §7.3 (rate gap) and this note's §5 (Grant offline guard).
2. Check `git status` matches §2.
3. Build the Grant offline guard and the rate-gap fix, each with tests; update `CLAUDE.md`.
4. Run `/code-review` on the whole Phase 6 to 6.4 diff; fix or list findings.
5. All gates in sequence; restore `next-env.d.ts`; write `…_PHASE_6.5_HANDOFF.md` opening Phase 7 and update the plan's
   status line.
