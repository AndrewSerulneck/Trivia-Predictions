# Multi-Venue Volume Billing — Phase 6.8 Handoff (written 2026-10-12)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phases 6.6–6.9"). This note closes **Phase 6.8 (display rate from the
lookup key; admin role on the add ledger; shared `isMissingFunction`)** and opens **Phase 6.9 (re-review 6.6–6.8, gates,
CLAUDE.md, commit)**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_6.7_HANDOFF.md`) still hold for what they describe.

---

## For Andrew (plain English)

**What changed.**
- **Phases 6.6 and 6.7 are committed** (`f867c94`, on your Mac only — not pushed).
- **Billing screens now price a bill by the same rule the charges use.** Before, the admin list and the partner's Billing
  page treated any odd flat Stripe price as "this much per venue", even when adding a venue to that bill would be refused.
  Now only our own negotiated rates (`custom_monthly_…`) show per-venue math; any other flat price shows its amount as it is
  ("Custom monthly price" for the partner; "flat Stripe price, not per-venue — use Set rate" for you). Today both card
  bills are on the standard bands, so **nothing on screen changes**.
- **An admin "Add to their bill" on a card bill now records the venue as admin-added**, even when the payment finishes later
  (3-D Secure → Stripe's webhook). Before, it was recorded as partner-added.
- Housekeeping: one shared "is this database function missing?" check instead of four copies.

**Is it live?** The **database change is live** (you said go ahead): two new columns, applied 2026-10-12 and checked. I also
filled the new "price lookup key" column for the two card bills (Pacific Street, Carrabba's) — both read "graduated", as
expected. The **app code is not committed or deployed**; the old live app ignores the new columns, so nothing changed for
anyone. Multi-venue flag still off.

**What needs you:** nothing for 6.8. Phase 6.9 (review + commit) is next; it asks you before committing.
**One request until the app deploys:** don't use admin "Set rate" / "Back to standard pricing" — the live (old) app won't
record the new column. If you do, re-run `npm run billing:backfill-lookup-keys -- --apply` afterwards; it fixes it.

---

## For the next agent (Phase 6.9)

### 1. Goal and scope

**Phase 6.9** (plan §5, **Opus 5.5, high**): `/code-review` of the 6.6–6.8 diff (`git diff 54af6e3` covers all three once
6.8 is committed, or `54af6e3..f867c94` + the working tree before); fix or list every finding. Gates: `npx tsc --noEmit`,
`npm run lint`, `npm run test`, `npm run build` (not typecheck and build together), `npm run test:multi-venue-billing-sql`,
`tests/lib.auth-users-fk-guard.test.ts` unchanged. Update `CLAUDE.md`'s multi-venue section (rejoin from a dead bill;
anchor-home repair; lookup-key mirror + `billRateFromMirror` returns null for an unrated Price; ledger `membership_role`;
`lib/supabaseRpcErrors.ts`). Commit with an explicit path list once Andrew says. The handoff then opens Phase 7.

**Out of scope:** Phase 7 (release, device checklist, flag flip), any push.

### 2. Starting state

- Branch `main`. Local commits ahead of `origin/main`, **not pushed**: `6c5a178` (6), `a83da94` (6.1), `636410c` (6.2),
  `54af6e3` (6.3–6.5), **`f867c94` (6.6–6.7, committed 2026-10-12 on Andrew's instruction)**.
- **Phase 6.8 is uncommitted.** Commit path list (explicit, never `git add -A`):
  ```
  app/api/admin/billing/route.ts
  app/api/owner/billing/route.ts
  app/api/webhooks/stripe/route.ts
  docs/multi-venue-volume-billing-plan.md
  docs/multi-venue-volume-billing-plan_PHASE_6.8_HANDOFF.md
  lib/adminBillView.ts
  lib/billAccountView.ts
  lib/billingCustomPrice.ts
  lib/rateLimit.ts
  lib/supabaseRpcErrors.ts                      (new)
  lib/venueAddition.ts
  lib/venuePricing.ts
  lib/venueRemoval.ts
  package.json
  scripts/backfill-price-lookup-keys.cjs        (new)
  scripts/test-multi-venue-billing-sql.cjs
  supabase/migrations/20261012033356_price_lookup_key_and_addition_role.sql   (new)
  tests/api.billing-unbilled-venue-states.test.ts
  tests/api.owner.venues-add.test.ts
  tests/api.webhooks.stripe-multi-venue.test.ts
  tests/lib.admin-bill-view.test.ts
  tests/lib.bill-account-view.test.ts
  tests/lib.bill-rate.test.ts
  tests/lib.billingCustomPrice.test.ts
  tests/lib.supabase-rpc-errors.test.ts         (new)
  tests/multi-venue-billing-contract.test.ts
  ```
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `NFLPickEmRewardBanner.tsx`, `NFLTiebreakerCard.tsx`,
  `components/venue/GameIdentityPanel.tsx`, `tests/components.player-pending.test.ts`, `.vscode/settings.json`. Also leave
  the tracked stray file `supabase/migrations/Warnings` (since August; `supabase db push` skips it).
- **Data (production, project `pkmxupsayzshvpirkaav`):**
  - Migration `20261012033356_price_lookup_key_and_addition_role.sql` **applied 2026-10-12** via `supabase db push`
    (dry run first showed only this file pending). Verified through PostgREST: both columns select; 3 bills;
    `billing_venue_additions` has 0 rows.
  - Backfill **applied**: `npm run billing:backfill-lookup-keys -- --apply` wrote `hightop_venue_graduated_monthly_v1` on the
    two card bills (`595160f9-2965-44fa-8e7f-d5dfca1d9574` Carrabba's, `72b42034-0c80-4ceb-9334-1f9a6d0f087d` Pacific Street),
    both on Price `price_1UPOUD1djkdMC76XYeVsQXKl`. A re-run dry run reports "2 already right". The offline bill has no
    price, so no key. **Undo:** `update billing_subscriptions set stripe_price_lookup_key = null` (display falls back to the
    graduated-id match, identical numbers). Stripe was only read (2 `prices.retrieve`).
  - Flag `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` still off.

### 3. Decisions already made

- **`billRateFromMirror` now returns `BillRate | null`.** Rule (mirrors `billRateFromPrice`): no price → graduated; lookup key
  `hightop_venue_graduated_monthly_v1` or the configured graduated id → graduated; `custom_monthly_` key → per-venue
  `amount ÷ quantity` (null if amount ≤ 0; checked BEFORE the band fallback so a $100 custom rate isn't read as bands);
  graduated id unconfigured + amount equals the bands → graduated; else **null**. A null key on a non-graduated price
  (unbackfilled row, hand-pasted Price) is null — deliberately conservative.
- **Null display:** admin `rate: "unrated"`, `breakdown: []`, `monthlyListCents = amount_cents`, line
  `"$X/mo · flat Stripe price, not per-venue — use Set rate"` (`UNRATED_PRICE_NOTE`, `lib/adminBillView.ts`). Partner:
  `breakdown: []`, `nextMonthlyListCents = amount_cents`, label `CUSTOM_PRICE_LABEL` "Custom monthly price"
  (`lib/billAccountView.ts`). The "Venue added" email is skipped when the rate is null (it already was) — an add can't
  complete on such a bill anyway (`custom_rate` refusal). Remove/Add back buttons still show on an unrated card bill and the
  server refuses with the existing `custom_rate` copy — left as is (rare, honest).
- **Writers of the key:** the webhook (`stripe_price_lookup_key: price?.lookup_key ?? null` in the subscription upsert);
  `swapSubscriptionPrice` (new `lookupKey` param: `price.lookup_key ?? null` for Set rate, `GRADUATED_PRICE_LOOKUP_KEY` for
  Back to standard — the webhook re-mirrors Stripe's real key next sync); Grant offline clears it with `stripe_price_id`.
  **Checkout writes no price mirror** (the webhook's first sync does), so the plan's "Checkout mirrors it" needed no code.
- **`membership_role`** (`'added'|'admin'`, default `'added'`, check constraint `billing_venue_additions_membership_role_check`):
  the admin card attach sets `'admin'` in the same `updateAddition` that records `venue_id`; `completeAddition` passes
  `row.membership_role === "admin" ? "admin" : "added"` (an undefined value from an old row reads `added`). The claim RPC is
  untouched (it never names the column).
- **`lib/rateLimit.ts`** now uses the shared helper too (its copy was the same rule; the plan allowed it if trivially compatible).
  Its wrapper `isMissingFunctionError` stays so the call site is unchanged.

### 4. Files and how they fit

- `supabase/migrations/20261012033356_price_lookup_key_and_addition_role.sql` — two `add column if not exists`, an idempotent
  named check, column comments. No table/view/sequence → no grants (grants contract test passes).
- `lib/supabaseRpcErrors.ts` — `isMissingFunction(error, name?)`: `PGRST202`/`42883`, or (with `name`) a message naming the
  function. Used by `lib/venueAddition.ts`, `lib/venueRemoval.ts`, `lib/billingCustomPrice.ts`, `lib/rateLimit.ts`.
- `lib/venuePricing.ts` — `RateMirrorShape.stripe_price_lookup_key`, `billRateFromMirror` (above).
- Readers selecting the new column: `app/api/admin/billing/route.ts` (list), `app/api/owner/billing/route.ts` (→
  `loadBillAccount`), `lib/venueAddition.ts` `BILL_COLUMNS` (email rate). `ADDITION_COLUMNS` selects `membership_role`.
- `scripts/backfill-price-lookup-keys.cjs` / `npm run billing:backfill-lookup-keys` — dry run default, `--apply` writes only
  differing keys, conditional on `stripe_price_id` unchanged. Idempotent; corrects stale keys too.
- `scripts/test-multi-venue-billing-sql.cjs` — new section 6 proves the migration on PGlite (twice; defaults; claim RPC still
  inserts `added`; `admin` accepted; `anchor`/null refused; one check constraint).

### 5. Facts and traps

- **Deploy order is satisfied** (migration is live). The new app selects both columns, so it must not deploy against a
  database without them — not a concern now.
- **Stale-key window until the app deploys:** the live (old) app's price swap and webhook don't write the key. A Set rate /
  Back to standard done before the deploy leaves the backfilled `graduated` key on a bill whose price moved; since the key
  check runs before the id check, the new app would display it as bands. Fix = re-run the backfill (`--apply`), or any
  later webhook sync under the new app. Told Andrew to avoid price swaps until deploy. Phase 7 should re-run the dry run
  after the deploy as a check.
- `lib.sportsBingo.nfl-star-tilt.test.ts` ("puts stars on boards materially more often than chance") failed once in a full
  run and passed in the next — statistical flake, unrelated.
- Older traps still hold: `npm run build` flips `next-env.d.ts` — restore with
  `sed -i '' 's#./.next/types/routes.d.ts#./.next/dev/types/routes.d.ts#' next-env.d.ts` (never `git checkout --`); don't run
  typecheck and build together; scratch scripts need `NODE_PATH="$PWD/node_modules" node --env-file=.env.local …`; the PGlite
  proof must run via `npm run test:multi-venue-billing-sql`; never POST a real add from a dev server.

### 6. Build, run, test — verified 2026-10-12

- `npx tsc --noEmit` clean; `npm run lint` clean (usual Babel size note); `npm run test`: **344 files passed, 1 skipped;
  4,096 tests passed, 13 skipped, 0 failed**; `npm run build` succeeded (202 pages), `next-env.d.ts` restored (no diff);
  `npm run test:multi-venue-billing-sql` passes; `tests/lib.auth-users-fk-guard.test.ts` unchanged.
- New/changed tests: `billRateFromMirror` matrix (custom key, unrated keys incl. null/undefined and a mid-string prefix,
  graduated by key from another env, band fallback) in `tests/lib.bill-rate.test.ts`; webhook mirrors the key
  (`tests/api.webhooks.stripe-multi-venue.test.ts`); Set rate / Back to standard mirror the key
  (`tests/lib.billingCustomPrice.test.ts`); owner account + admin list on an unrated vs custom bill
  (`tests/api.billing-unbilled-venue-states.test.ts`); labels; admin card attach writes `admin` immediately AND after 3-D
  Secure via `invoice.paid` (`tests/api.owner.venues-add.test.ts` — the existing 6.6 test had pinned the old `added`, updated);
  `tests/lib.supabase-rpc-errors.test.ts`; three contract pins.
- **Mutation checks** (restored from scratchpad copies, suite green after): completion role hard-coded `"added"` → 2 fails;
  admin attach not recording the role → 2 fails; `billRateFromMirror` treating any flat price as per-venue → 4 fails.
- **Unverified:** no browser pass of the new labels (admin screen not viewed; partner card is flag-gated); live Stripe
  behaviour of the key on a real webhook (only mocked) — Phase 7's live add will exercise it.
- **Cost:** no new queries or Stripe calls on any request path (one extra column on existing reads/writes). The backfill was a
  one-off: 2 Stripe reads, 2 row writes.

### 7. Open questions for Andrew

- Commit 6.8 in 6.9 (after the review), or now? (Path list in §2.)
- Still open from 6.7: keep the admin picker offering `removed` venues, or lapsed only?

### 8. Recommended first steps for Phase 6.9 (Opus 5.5, high)

1. `git status` / `git log origin/main..main` — confirm 6.8 is still uncommitted and `f867c94` is the tip.
2. `/code-review` over `54af6e3` → working tree (6.6–6.8). Pay attention to: the stale-key ordering in `billRateFromMirror`
   (§5), `addVenueToBill`'s dead-bill move (6.6 §3 "why not an RPC"), and the owner route's dead-bill drop (6.7).
3. Fix or list findings, run every gate in §6, update `CLAUDE.md`, write `…_PHASE_6.9_HANDOFF.md`, update the plan status
   line, and commit with an explicit path list once Andrew says.
