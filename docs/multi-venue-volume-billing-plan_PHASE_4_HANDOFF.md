# Multi-Venue Volume Billing — Phase 4 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md`. This note closes **Phase 4 (Add-a-venue UI)** and opens
**Phase 5 (Remove at end of month + Billing account view)**. Earlier handoffs (`…_PHASE_1_`, `…_PHASE_2_`,
`…_PHASE_3_HANDOFF.md`) still hold for what they describe.

---

## For Andrew (plain English)

**What changed.** The screens for **"+ Add a venue"** now exist on the Partner Dashboard. Tap the venue name at
the top → the menu shows your venues plus **+ Add a venue** at the bottom. That opens a slide-up sheet with three
screens: **(1) venue name and address** (the same address search as signup), **(2) the map circle** where players
can play, and **(3) Review & pay**, which shows "Venue number 2 · $75/mo", "New monthly total · $175/mo" and
"Charged today · $22.68 (through Oct 20)" — Stripe's own figure — and a button **"Add venue — pay $22.68 now"**.
Pay → the sheet closes, the dashboard switches to the new venue and says "…is live".

It also handles the awkward cases: a **declined card** shows a message and a "Go to Billing" link and nothing is
added or charged; a bank that wants **extra verification** gets Stripe's secure page in a new tab and the sheet
checks again when the partner comes back; a bill that **can't take a venue** (past due, set to cancel, paid by
check, custom rate) says so as soon as the sheet opens, before anything is typed.

**Is it live?** **No.** It is behind the same off switch (`NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED`), and it is
**not committed, pushed or deployed** — waiting for you. It ALSO needs the signup switch
(`NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`) on, which it already is in Vercel (Production + Preview), because the
sheet re-uses signup's address search and map.

**How I checked it.** 3,869 automated tests pass (0 fail), type-check, lint and build are clean. I also drove the
real screens in a real (headless) browser at phone size, with every billing call **faked** — I walked through
paying, a declined card, the 3-D Secure screen and a blocked bill. Nothing touched Stripe or your database. I have
**not** seen it on a real phone, or with the real Google map (my test blocked Google, so the map area was blank),
or with a real card — that is Phase 7 with you.

**Something I did wrong, and you should know.** While cleaning up my test server I ran a command that stops
"the newest Next.js server" — and it appears to have stopped **your own dev server on port 3000**. Nothing was
lost (it only serves pages), but please restart `npm run dev` if you were using it. I've added a rule to CLAUDE.md
so this doesn't happen again.

**What needs you.** (1) Say when to commit/push Phase 4 (it deploys harmlessly: the switch is off). (2) Answer the
"claim an existing venue" product question (§7 below, explained simply). Nothing else blocks Phase 5.

**What's left:** Phase 5 (Remove a venue + the Billing page as an account view), Phase 6 (admin tools), Phase 7
(copy, device pass, switch on, your live test).

---

## For the next agent (Phase 5)

### 1. Goal and scope of Phase 5

Plan §4.4 and §4.5's Billing-page half, §5 "Phase 5" (**Opus 5.5, high**): self-serve **Remove** (Stripe quantity
−1 with `proration_behavior: "none"`, `remove_at = current_period_end`, venue stays live until then, daily
`/api/cron/billing` hides it and stamps `removed_at`), **Undo**, re-anchoring when the anchor venue is removed,
the last venue can't be removed, and the **Billing page** (`app/owner/billing/page.tsx`) as an account view
(venues on the bill, band breakdown "1 × $100 · 3 × $75 = $325/mo", discount, next bill date, per-venue Remove /
Undo). **No new `vercel.json` entry.** **Out of scope:** admin tools, custom-rate semantics, drift check (Phase 6);
copy polish, device checklist, flag on (Phase 7). Do not change the money logic in `lib/venueAddition.ts`.

### 2. Starting state

- Branch `main`. Last commit `d63d720` (Phase 3, pushed to `origin/main` 2026-10-11). **Phase 4 is entirely
  uncommitted** — Andrew decides. Migration `20261011153607_venue_addition_claim.sql` **is applied** to linked
  project `pkmxupsayzshvpirkaav` (Andrew approved; `supabase db push --dry-run` showed it as the only pending one).
- **Not mine — never commit or revert:** Andrew's own uncommitted edits: `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`. Commit Phase 4 by explicit path list (§4).
- Flags: `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` is set **nowhere** (not Vercel, not tested into `.env.local`).
  `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` and `GOOGLE_MAPS_BROWSER_KEY` ARE set in Vercel (Preview + Production).
- No production data was written in Phase 4, no live Stripe object created or changed, no env var added.

### 3. Decisions already made (do not re-ask)

Plan §2 and earlier handoffs, plus these Phase 4 calls (mine, documented):

- **Three screens, not four.** `address` (name + address in one, because signup's `AddressStep` already asks the
  venue name) → `map` → `review`. `?sheet=add-venue` (no step) / `&step=map` / `&step=review`.
- **Entry point = `isAddVenueAvailable()`** (`lib/multiVenueBilling.ts`) = billing flag **AND** signup flag. Reason:
  the sheet re-uses `AddressStep`/`GeofenceStep`, whose lookups are `/api/signup/places` and `/api/signup/maps-key`,
  which 404 while signup is off. I did NOT fork them or add owner-authenticated copies (that would have meant editing
  signup components pinned by `tests/self-serve-signup-contract.test.ts`). **Trade-off:** those routes are anonymous and
  IP-rate-limited, not owner-limited. If signup is ever turned off, "+ Add a venue" disappears (by design).
- **Always a dropdown** when available, even with one venue (`Dropdown` got one optional `footerAction`; with it
  omitted the markup is byte-identical, pinned by `tests/components.dropdown-footer-action.test.ts`).
- **Up-front check.** Opening the sheet makes one `GET …/add/quote` so a refused bill (offline, custom rate, past due,
  cancelling, an add awaiting payment) is explained before anything is typed. A `stripe_unavailable` / `rate_limited`
  answer does NOT block typing. Review fetches the quote again. **Cost:** 2 Stripe previews per add attempt (+1 each
  time Review is re-entered) — rare event, owner rate limit 60/h; negligible. Plan §6 said "quote only on Review";
  this is a deliberate, tiny deviation for UX.
- **One idempotency key per Confirm** (`newAttemptKey()`), kept for that attempt; "I've paid — check now" /
  "Check again" / auto re-asks send the SAME key. A refusal clears it (next Confirm = new key). `processing` is
  re-asked automatically every 5 s up to 6 times, then a button; Stripe's page → one re-ask on tab-visible, ≥ 4 s apart.
- **Stale price guard:** if the quote is > 10 min old at Confirm, the price is refetched and the partner must confirm
  again (the server only honours a `prorationDate` ≤ 15 min old).
- **Close during a payment** doesn't ask "discard" (nothing to discard — the add continues server-side); the page
  toasts "Your venue will appear here as soon as the payment is confirmed. Refresh in a minute." (best effort: the phone
  Back gesture doesn't go through that handler).
- Only `https://*.stripe.com` hosted-invoice URLs are ever rendered as links (`isStripeHostedUrl`).
- **Venue refresh after a paid add** is `fetchOwnerVenues()` (`lib/ownerVenuesClient.ts`) — NOT named in the page file,
  because `tests/owner-dashboard-contract.test.ts` forbids the string `/api/owner/venues` in `page.tsx` (first load =
  one call). Reuse this helper after a removal.

### 4. Files created or changed

**New**
- `lib/addVenueFlow.ts` — pure: `ADD_VENUE_STEPS`, `resolveAddVenueStep`, `addVenueStepIssue` (signup's rules),
  `addVenueDraftHasAnswers`, `buildAddVenueBody`, `interpretAddVenueReply` / `interpretQuoteReply` (every server
  answer → `paid | requires_action | processing | unconfirmed | refused`), `isStripeHostedUrl`, `formatPeriodEnd`,
  `newAttemptKey`.
- `components/owner/add-venue/AddVenueSheet.tsx` — the flow: state, URL steps (`correctStep`), up-front check, quote,
  confirm / re-ask / timers, `useDiscardGuard`, footer. `AddVenueReviewStep.tsx` — presentational Review +
  `AddVenueRefusalNotice`; exports `MAX_AUTO_CHECKS`.
- `lib/ownerVenuesClient.ts` — `fetchOwnerVenues()`.
- Tests: `tests/lib.add-venue-flow.test.ts` (26), `tests/components.owner-add-venue-sheet.test.ts` (12, mocked fetch,
  signup screens stubbed), `tests/components.dropdown-footer-action.test.ts` (3), `tests/add-venue-ui-contract.test.ts` (11).

**Changed**
- `app/owner/dashboard/page.tsx` — `AddVenueHost` (own Suspense, keyed per open), dropdown `footerAction`, page-level
  `DashboardToast`, `handleVenueAdded` (refetch + switch), `openAddVenue` (`pushSheet`, never `router.push`).
- `components/ui/Dropdown.tsx` — optional `footerAction` (renders after a divider, outside the listbox; arrow keys skip it).
- `lib/ownerSheetParams.ts` — `"add-venue"` added to `OWNER_SHEET_IDS`.
- `lib/multiVenueBilling.ts` — `isAddVenueAvailable()`.
- Docs: `CLAUDE.md` (multi-venue section), plan status line + Phase 4 heading, this file.

**Commit path list for Phase 4** (when Andrew says so): `CLAUDE.md`, `app/owner/dashboard/page.tsx`,
`components/owner/add-venue/AddVenueReviewStep.tsx`, `components/owner/add-venue/AddVenueSheet.tsx`,
`components/ui/Dropdown.tsx`, `docs/multi-venue-volume-billing-plan.md`,
`docs/multi-venue-volume-billing-plan_PHASE_4_HANDOFF.md`, `lib/addVenueFlow.ts`, `lib/multiVenueBilling.ts`,
`lib/ownerSheetParams.ts`, `lib/ownerVenuesClient.ts`, `tests/add-venue-ui-contract.test.ts`,
`tests/components.dropdown-footer-action.test.ts`, `tests/components.owner-add-venue-sheet.test.ts`,
`tests/lib.add-venue-flow.test.ts`. (Never `git add -A`.)

### 5. Facts and traps

- **Andrew's `next dev` holds `.next/dev/lock`**, so a second dev server from the repo fails
  ("Unable to acquire lock"), and it was started WITHOUT my flags. **To browser-test:** `rsync -a` the repo to the
  scratchpad with ANCHORED excludes (`--exclude /node_modules --exclude /.next --exclude /.git --exclude '/.env*'
  --exclude /native --exclude /docs`; an unanchored `native` also drops `components/native`), `cp -Rc node_modules`
  (APFS clone, ~9 s), run `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED=true NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=true
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev --webpack -p 3101`
  **in the clone** (Turbopack failed to resolve `./lib/textSizeFloor` from `tailwind.config.ts` there; webpack worked).
  No `.env.local` in the clone ⇒ nothing in it can reach Stripe or the DB. Fake every `/api/owner/*` and
  `/api/signup/*` call with Playwright `page.route`. `/owner/*` is not cookie-gated by `proxy.ts`. Delete the clone after.
- **Never `pkill -f next-server` (or any broad pattern).** Phase 4's cleanup did, and it killed Andrew's dev server on
  :3000. Kill only a PID you started.
- **Dev server = live Stripe + shared DB.** Never let a dev-server test reach the real `POST /api/owner/venues/add`.
- `SlideSteps` remounts a step on every change: all form state lives in `AddVenueSheet`, not in the step components.
  A screenshot taken during the 240 ms slide shows cards clipped at the right edge — wait ~700 ms.
- `AddressStep` shows a large "Where is your venue?" heading inside a sheet already titled "Add a venue" — it is
  signup's component, left as is. Phase 7 may restyle.
- **Phase 5 must refuse (or take the same lock) while an add is in flight** on the bill (Phase 3 handoff §5): a
  Remove/Undo `subscriptions.update` with a non-empty `items` list voids a pending 3-D Secure payment.
- Phase 3's open item still stands: `venueIdsOnBill` (TS) counts `removed_at IS NULL`; the RPC counts `removed_at IS
  NULL AND remove_at IS NULL`. Align them when Remove lands.
- `npm run build` flips `next-env.d.ts` to `./.next/types/routes.d.ts` and may leave `… 2.*` iCloud copies in `.next/`:
  `sed -i '' 's#import "./.next/types/routes.d.ts";#import "./.next/dev/types/routes.d.ts";#' next-env.d.ts` and
  `find .next -name "* 2.*" -delete` (never `git checkout --`). Done after this session's build. Don't run `tsc` and
  `build` concurrently.
- `.env.local` could not be read for names this session (permission layer denied `cut`); `vercel env ls` works for names.

### 6. How to build, run and test

```
npx tsc --noEmit
npm run lint
npm run test                      # 3,869 pass / 13 skipped / 0 fail (2026-10-11; was 3,817 before Phase 4)
npm run build                     # passes; lists ƒ /api/owner/venues/add and …/add/quote
npx vitest run tests/lib.add-venue-flow.test.ts tests/components.owner-add-venue-sheet.test.ts \
  tests/components.dropdown-footer-action.test.ts tests/add-venue-ui-contract.test.ts
```
**Verified:** all of the above; a real headless-Chromium walkthrough (390×844) of paid, declined, 3-D Secure and
blocked-bill flows against mocked APIs (URL steps, browser Back/Forward, one keyed POST with the quote's
`prorationDate`, sheet closes, header switches to the new venue, no console errors); a mutation check that the
same-key tests fail if a re-ask mints a new key. **Unverified / risky:** a real phone; the real Google map and address
search (blocked in my run); a real card, decline or 3-D Secure; the "Venue added" email; the `next/link` "Go to
Billing" inside a sheet closes the sheet on navigation (assumed, not seen).

### 7. Open questions for Andrew

1. **Commit/push Phase 4?** (Safe to deploy; switch is off.)
2. **Claiming an existing venue (plain-English version).** Today, if a partner adds an address we *already have* in
   our system — e.g. an admin set that bar up earlier, or it was someone's abandoned signup — the add refuses with
   "email partnerships@…". The alternative is to let the partner *take over* that existing venue onto their bill
   automatically (what signup does for an unowned venue). Safer = keep "email us" (a person checks it really is theirs);
   riskier = a partner could attach a venue that belongs to someone else. Not blocking; current behaviour is the safe one.
   **ANSWERED 2026-10-11: Option A** — keep "email partnerships@…" (plan §2 row 11). Phase 4 committed the same day.
3. Carried: custom rate on a chain (Phase 6).

### 8. Recommended first steps for Phase 5 (Opus 5.5, high)

1. Read plan §4.4–4.5, Phase 3 handoff §5 (pending updates) and this note. `git status` — confirm Phase 4 is
   committed (ask Andrew; never commit his unrelated files). `supabase db push --dry-run` should show nothing pending.
2. Build the server side first in `lib/venueRemoval.ts` (one module, like `venueAddition.ts`): refuse while an add is in
   flight, refuse the last venue, `remove_at = current_period_end`, quantity −1 with `proration_behavior: "none"`,
   Undo = +1 (also no proration), re-anchor on removing the anchor (same transaction), cron hide job in the existing
   `/api/cron/billing`. Align `venueIdsOnBill` with the RPC's count. Mocked-Stripe tests via `tests/helpers/inMemorySupabase.ts`.
3. Then the Billing page account view; reuse `fetchOwnerVenues()` and `formatCents`; never price in a component.
4. Test any UI in the scratchpad clone (§5). Write `…_PHASE_5_HANDOFF.md` and update the plan's status line.
