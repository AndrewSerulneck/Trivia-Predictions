# Join Merch Store — Phase 4.1 Handoff

## For Andrew (plain English)

Phase 4.1 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed (three code-review fixes from Phase 4):
- **Each venue has its own cart (F1).** Before, if a partner with two venues picked coasters for
  Venue A and then switched to Venue B, the same cart quietly showed "Ships to Venue B". Now each
  venue keeps its own cart: B starts empty, and switching back to A shows A's picks again. Closing
  and reopening the store on the same venue still keeps the cart. A page reload still empties it.
- **"Order Join Merch" always opens the store (F2).** Before, the menu row did nothing while the
  dashboard was still loading, or for an account with no venue. Now the store always opens. With no
  venue, partners can still browse, see prices and download the **free QR code**. "Review order"
  stays greyed out with a short reason: "Loading your venue…" while loading, or "Ordering needs a
  venue on your account." when there's none.
- **Removed a hidden navigation shortcut (F5).** A leftover code path could jump to a store link in
  a way the project's rules forbid. It was unreachable, so you won't see a difference. It's deleted
  now, and a test stops it from coming back.

Checked: typecheck, lint, the full test suite (only the same 3 old, unrelated failures) and the
production build all pass. I also ran all three scenarios in a real browser (Chromium) with fake
partner data: no venue, slow loading, and two venues. Everything behaved as described and there
were no errors.

Needs from you: nothing for Phase 4.2. Still open, and not blocking: Q2 (a contact line for the
"Ordering opens soon" note) and Q3 (real product wording).

---

## For the next agent (Phase 4.2)

Read `docs/join-merch-store-plan.md` §5 "Phase 4.2" first (findings **F3** and **F4**). Earlier
handoffs: `docs/join-merch-store-plan_PHASE_1_HANDOFF.md` … `_PHASE_4_HANDOFF.md`. The Phase 3
handoff's "Facts and traps" (global form CSS, the `fetch(` tripwire reading comments, the Playwright
stub recipe, the 3 pre-existing test failures, `PIPESTATUS` in zsh) still apply.

### 1. Next phase's goal and scope

**Phase 4.2 (Opus 5.5, high): sheet history.**
- **F4:** widen `UseOwnerSheetResult.goBack(previous: string | null)` and
  `stepBack(…, previous: string | null)` in `lib/ownerSheetParams.ts` so `null` means "the sheet's
  first screen, no `step`". Call `nav.goBack(null)` in `MerchStoreSheet`. It is still
  `nav.goBack("shop")` at `components/owner/store/MerchStoreSheet.tsx:153`.
- **F3:** when the step being corrected sits at depth ≥ 2 and the correction target is the previous
  screen, **pop** (`history.back()`) instead of replacing. Implement it once in `lib/useOwnerSheet.ts`
  (e.g. `correctStep(target)`) and use it from the store's correction effect
  (`MerchStoreSheet.tsx:105–109`). Then check whether Schedule (`ScheduleGameFlow.tsx`) and Rewards
  (`RewardsFlow.tsx`) have the same duplicate-entry problem. Switch them too if they do, or record
  why not.

**Out of scope:** F6 scroll reset (4.3), F7 global CSS (4.4), F8–F10 cleanups (4.5), the device
checklist/docs/commit (4.6), and any API route, table, migration, Stripe, feature flag, `fetch(`
under `components/owner/store/`, or product wording.

### 2. Starting state

- Branch `main`, HEAD `75563ec10b743da4f739562cf837f30bc1d43938` ("Partner Dashboard Revamp").
  **No commits from Phases 1–4.1.** The 4 source PNGs and 4 WebPs under `public/store/` are staged;
  everything else is unstaged or untracked. No push, deploy, Vercel env change, database read or
  write, or migration has happened in any phase.
- Pre-existing unrelated edits from before this plan: `AGENTS.md`, `SYSTEM_CONTEXT.md`,
  `docs/nfl-pickem-reward-phase3.md`, and parts of `CLAUDE.md`. Don't revert them. Ask Andrew before
  committing them together (Phase 4.6).
- Never `git checkout -- <file>` or `git stash` here (user memory: it destroyed work before). To
  undo your own edit, edit it back.
- No background processes running. `next start -p 3123` was used for the browser check and then
  killed (`pkill -f "next start -p 3123"`).

### 3. Decisions made in Phase 4.1 (don't re-ask)

- **Cart lifetime = page lifetime, keyed by venue.** `Record<venueId, MerchCart>` in a hook
  (`useVenueMerchCart`) that the page calls. This keeps the plan §1 default ("survives close/reopen,
  reload empties") and adds "one per venue". Plan §1's defaults bullet was updated.
- **The no-venue cart is its own bucket (`NO_VENUE_CART_KEY = ""`)** and does **not** move into a
  venue that loads later. Moving a cart between venues is exactly what F1 removed. The only cost: a
  partner who picks something in the ~second before venues load loses those picks. That's
  acceptable (look-only store, and after a reload the cart is empty anyway).
- **Copy when Review is off for lack of a venue:** "Loading your venue…" (venues still loading) and
  "Ordering needs a venue on your account." (loaded, none). It's shown in the order bar's existing
  `aria-live` region: in place of "Choose a quantity…" when the cart is empty, and as a small line
  under the subtotal when it isn't. The function is `merchStoreVenueBlock()`.
- **Review needs a venue as well as items.** `resolveMerchStoreStep(rawStep, canReview)`: the second
  parameter is now `cartHasItems && venue !== null`. So `&step=review` with no venue lands on the
  Shop, and the existing correction effect drops the step.
- **The store host has its OWN `useOwnerSheet()` instance** (`MerchStoreHost`) rather than sharing
  DashboardBody's. That's safe because `normalizeLandedSheet` is idempotent (it is a no-op once the
  entry's depth is > 0) and `displayStepFor`'s memory is per instance (the store only reads
  `"store"`). It sits in its own `<Suspense fallback={null}>` (Next 16 `useSearchParams` rule).
  The build still prerenders `/owner/dashboard` as static (`○`).
- **F5: off the dashboard, a sheet row now does nothing**, plus a dev-only `console.warn`
  (`[OwnerAppBar] "<sheet>" sheet row used off /owner/dashboard; ignored.`). It's unreachable today
  because the drawer only renders when no `leading` is passed, and only the dashboard does that.

### 4. Files created or changed in Phase 4.1

| File | What |
|---|---|
| `lib/useVenueMerchCart.ts` | **New.** `useVenueMerchCart(venueId: string \| null): [cart, setCart]`. State `Record<string, MerchCart>`. The setter is `useCallback`-bound to the key at creation, so a functional update only writes that venue. Returns a frozen shared `EMPTY_CART` for a venue with no cart (stable reference). An update returning the same object is a no-op. Exports `NO_VENUE_CART_KEY = ""`. |
| `app/owner/dashboard/page.tsx` | `DashboardBody` no longer takes or renders merch (props `venueId`, `venueName` only). New `MerchStoreHost` (line ~282): calls `useOwnerSheet()` and renders `<MerchStoreSheet nav={sheet} venue venueLoading cart onCartChange>`. The page calls `useVenueMerchCart(selectedVenue?.id ?? null)` (line ~325) and renders `<Suspense fallback={null}><MerchStoreHost venue={selectedVenue ?? null} venueLoading={loading} …/></Suspense>` **after** the loading / no-venue / body conditional, so it's on every branch. |
| `components/owner/store/MerchStoreSheet.tsx` | `venue: MerchVenueRef \| null`, new optional `venueLoading`. New export `merchStoreVenueBlock(venue, venueLoading)`. `resolveMerchStoreStep`'s 2nd param renamed `canReview`. `renderStep` renders Review only when `venue` is set. Passes `unavailableReason={venueBlock}` to the order bar. Header comment explains page-level hosting. |
| `components/owner/store/MerchOrderBar.tsx` | New optional `unavailableReason`. It disables Review and is shown in the live region (`<p data-order-unavailable>` under the subtotal when the cart has items). |
| `components/owner/OwnerAppBar.tsx` | `openDashboardSheet(sheet)` has no `navigate` parameter: it pushes in place on `/owner/dashboard`, otherwise warns (dev) and returns. `sheetHref` import removed. Header comment updated. The only router call left is `router.push(href)` for link rows. |
| `tests/lib.use-venue-merch-cart.test.ts` | **New.** 4 tests: a stable empty cart; A/B isolation and A restored; a stale setter for A never writes B; the no-venue bucket isn't inherited. |
| `tests/app.owner-dashboard-merch.test.ts` | **New.** Renders the **real** `app/owner/dashboard/page.tsx` in jsdom with stubbed `fetch` and a history-reactive `useSearchParams` mock. F1: two venues, pick → Review "Ships to Alpha Tap" → switch → B empty → B's Review "Ships to Bravo Bar" → back to A, pack still 250, Review lines `["HTC-CST-RND-250"]`. F2: no venue (store + free QR, Review disabled); slow venues ("Loading your venue…" → enabled after load). |
| `tests/components.owner-merch-store.test.ts` | New describe "with no venue (Phase 4.1, F2)" with 6 tests: `merchStoreVenueBlock`, store + QR links with no venue, Review stays off with items, loading copy, `&step=review` with no venue → Shop + `replaceCurrentStep(null)`, and with a venue no reason is shown. |
| `tests/owner-dashboard-contract.test.ts` | Replaced the old "hosted in the Suspense-wrapped body" test with two: the store is hosted by the page (DashboardBody has no merch; `MerchStoreHost` uses `useOwnerSheet()`; it renders after the conditional in its own Suspense; it passes `venue={selectedVenue ?? null}` / `venueLoading={loading}`), and the cart is per venue (`useVenueMerchCart(selectedVenue?.id ?? null)`, no `useState<MerchCart>`). |
| `tests/owner-menu-contract.test.ts` | New rule: `OwnerAppBar.tsx` contains no `sheetHref`, and its only `router.push/replace(...)` is `router.push(href)`. |
| `tests/components.owner-app-bar.test.ts` | "off the dashboard … navigates" became "off the dashboard, a sheet row does nothing": no push, URL and history length unchanged, one warning. |
| `docs/join-merch-store-plan.md` | Status line; §1 default "one cart per venue"; Phase 4.1 marked DONE with an as-built note. |
| `CLAUDE.md` | Join Merch section: status sentence (4.2–4.6 next) plus one bullet: one cart per venue, store hosted by the page, no `router.push` of sheet URLs. |

### 5. Facts and traps found in Phase 4.1

1. **Mocking `next/navigation` for a real-page test: `useRouter` must return ONE stable object.**
   The dashboard's fetch effects depend on `[router]` (the page's venue load, and DashboardBody's
   `onUnauthorized` `useCallback`). A factory like `useRouter: () => ({ push: vi.fn(), … })` makes a
   new object on every render, which refetches and re-renders forever. It shows up as a 5-second
   test timeout inside `act()`, with no error. Took a while to find; see the comment in
   `tests/app.owner-dashboard-merch.test.ts`.
2. **A history-reactive `useSearchParams` mock** lives in that same test: `useSyncExternalStore` over
   `popstate` plus a manual `notifyHistory()` after a native `pushState`/`replaceState`. The app's
   history writes (via `lib/ownerSheetParams.ts`) don't notify on their own, so the test calls
   `notifyHistory()` after clicking Review. **For F3's jsdom test, reuse this harness** (the plan asks
   for "real `history` in jsdom: push two entries, reload-equivalent remount with an empty cart, one
   Back closes the sheet"). jsdom's `history.back()` fires `popstate` asynchronously, so wait for it
   with `waitFor`.
3. The new page test prints many "The current testing environment is not configured to support
   act(...)" lines on stderr. That's harmless noise (the file doesn't set
   `IS_REACT_ACT_ENVIRONMENT`), and all assertions run.
4. **F3 now also fires while venues load.** A reload on `?sheet=store&step=review` sees `venue = null`
   (and an empty cart), so the correction effect runs on the first render, before venues arrive.
   Phase 4.2's pop-vs-replace logic must handle depth ≥ 2 the same in either case. The no-venue
   correction path is pinned by the store test "a &step=review URL with a cart but no venue lands
   on the Shop".
5. **There are now two `useOwnerSheet()` instances on the dashboard** (DashboardBody's and
   MerchStoreHost's). If 4.2 adds state to the hook (e.g. remembering a pending pop), make sure it
   stays per-instance-safe, or move the store onto a shared instance. Today both read the URL, and
   only `normalizeLandedSheet` runs on mount (idempotent).
6. Mutation-checked: making `useVenueMerchCart` ignore the venue (a constant key) fails 3 hook tests
   and the F1 page test. Reverted by editing back, not with git.
7. The browser screenshot of the loading state looks dim because it was taken mid slide-in. It isn't
   a bug.

### 6. Build, run and test

Sequential (never typecheck concurrently with build):
```
npx tsc --noEmit
npm run lint
npm run test
npm run build > build.log 2>&1; echo $?
```
Targeted:
```
npx vitest run tests/app.owner-dashboard-merch.test.ts tests/lib.use-venue-merch-cart.test.ts \
  tests/components.owner-merch-store.test.ts tests/lib.merch-pricing.test.ts tests/lib.join-qr.test.ts \
  tests/owner-dashboard-contract.test.ts tests/components.owner-sheet.test.ts \
  tests/navigation-controls-contract.test.ts tests/owner-menu-contract.test.ts \
  tests/lib.owner-sheet-params.test.ts tests/components.owner-app-bar.test.ts
```

Verified 2026-10-01, end of Phase 4.1:
- `npx tsc --noEmit`: clean. `npm run lint`: clean (the usual Babel `lib/sportsBingo.ts` note).
- `npm run test`: **2,911 passed, 13 skipped, 3 failed** (was 2,896 before; +15 new tests). The 3
  failures are the known pre-existing ones: `tests/components.create-reward-wizard.test.ts` ×1 and
  `tests/components.owner-rewards-flow.test.ts` ×2, from `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` in
  the local env.
- `npm run build`: exit 0; `/owner/dashboard` still `○ (Static)`.
- **Real browser** (Chromium/Playwright, `npx next start -p 3123`, `page.route("**/api/owner/**")`
  stubs, 390×844). The script lives in the scratchpad, not the repo. Recreate it from this list:
  - **No venues:** Open menu → Order Join Merch opens the store (`?sheet=store`). +1 Table Tent →
    Review disabled, with "Ordering needs a venue on your account." under "$4.00". Browser Back
    closes it (no stray entry).
  - **Venues delayed 2.5 s, deep link `?sheet=store`:** "Loading your venue…", then Review enabled
    after load.
  - **Two venues:** 250 pack on Alpha → Review "Ships to Alpha Tap" → Close → switch to Bravo →
    menu → store: pack "None", "Choose a quantity…" → Close → switch to Alpha → store: pack "250".
  - No page errors in any of them.

**Not verified:** a real phone and a real signed-in partner session (Phase 4.6 checklist; add "store
with no venue" and "cart per venue" there, as the plan already says).

### 7. Open questions for Andrew

None new. Still open: Q2 (`MERCH_ORDER_CONTACT` contact line), Q3 (product wording, deferred on
purpose), and whether the unit items' "6 × $4 = $24.00" should also go (Phase 4 handoff §7). None
block 4.2.

### 8. Recommended first steps for Phase 4.2

1. Run the targeted tests above, then the four checks, to confirm §6.
2. Read `lib/ownerSheetParams.ts` (`stepBack`, `replaceStep`, `readSheetDepth`, `closeSheet`) and
   `lib/useOwnerSheet.ts`. Then read how `ScheduleGameFlow.tsx` and `RewardsFlow.tsx` correct a
   stale step (search for `replaceCurrentStep`).
3. F4 first (small): widen `goBack`/`stepBack` to accept `null`, switch the store to
   `nav.goBack(null)`, update `tests/lib.owner-sheet-params.test.ts` and the store test that expects
   `goBack("shop")` (`tests/components.owner-merch-store.test.ts`, "Back to store steps back to the Shop").
4. F3: write the jsdom history test first (reuse the harness from
   `tests/app.owner-dashboard-merch.test.ts`, trap 2), then add `correctStep` to `useOwnerSheet` and
   use it from the store. Decide for Schedule/Rewards based on what their tests show.
5. Write `docs/join-merch-store-plan_PHASE_4.2_HANDOFF.md`, mark Phase 4.2 done in the plan, and
   point the status line at it.

Model/effort per the plan: **Opus 5.5, high.**
