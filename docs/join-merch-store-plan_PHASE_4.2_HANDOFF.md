# Join Merch Store — Phase 4.2 Handoff

## For Andrew (plain English)

Phase 4.2 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed (two code-review fixes about the phone's Back button):
- **Reloading on a later screen no longer "eats" a Back tap (F3).** Before: in the store, if you went
  Shop → Review and then reloaded the page, the store showed the Shop (the cart is empty after a
  reload), but your first Back tap seemed to do nothing, because the Shop now sat in the browser
  history twice. Now the store steps back to the Shop's own entry, so one Back closes it. The same
  bug existed in **Schedule Live Games** (e.g. reload on the Review screen) and **Offer Rewards**
  (e.g. reload on one reward's screen, or partway through creating a reward). Those are fixed the
  same way.
- **"Back to store" is cleaner (F4).** It used to put a meaningless `step=shop` into the web address
  for an instant before fixing it. Now it goes straight to the plain store address. You won't see a
  difference.

Your answers are recorded in the plan as decisions 9–11: no contact line on the "Ordering opens
soon" note, product descriptions stay as they are, and the "6 × $4" line stays. (That line is on
the Review screen for Table Tents and Card Sets: "6 × $4" means 6 tents at $4 each, shown above
the $24.00 total for that line.)

Checked: typecheck, lint, the full test suite (only the same 3 old, unrelated failures) and the
production build all pass. I also tested it in a real browser (Chromium) against the built app, for
both the store and Schedule: reload on a later screen, then one Back closes the panel, with no
extra page reload.

Needs from you: nothing. No questions are open.

One finding for you: the 3 "old, unrelated" test failures were earlier blamed on a setting in your
local environment file. That was wrong. They fail because the reward wizard's first question was
reworded in commit `75563ec` ("Which game should the reward be tied to?") and three tests still
expect the old wording ("Which reward?"). It's a one-line test fix each, outside this plan. I didn't
change it; say so if you want it done.

---

## For the next agent (Phase 4.3)

Read `docs/join-merch-store-plan.md` §5 "Phase 4.3" first (finding **F6**). Earlier handoffs:
`docs/join-merch-store-plan_PHASE_1_HANDOFF.md` … `_PHASE_4.1_HANDOFF.md`. The Phase 3 handoff's
"Facts and traps" (global form CSS, the `fetch(` tripwire reading comments, the Playwright stub
recipe, `PIPESTATUS` in zsh) still apply, **except its trap 7's diagnosis of the 3 failing tests,
which is wrong** (see §5 trap 1 below).

### 1. Next phase's goal and scope

**Phase 4.3 (Opus 5.5, medium): each step starts at the top, for every sheet (F6).**
`OwnerSheet` (`components/owner/sheet/OwnerSheet.tsx`) owns the scroll body but never resets it when
`SlideSteps` changes step. The store works around it with a store-only DOM walk:
`scrollParent()` + `ScrollToTopOnArrival` in `components/owner/store/MerchStoreSheet.tsx` (~lines
70–92, rendered at the top of both panes in `renderStep`). Fix per the plan: give `OwnerSheet` a ref on
its scroll body and an optional `scrollKey` prop, where a change sets `body.scrollTop = 0`. Pass
`scrollKey={current}` from the store, Schedule (`ScheduleGameFlow.tsx`, `current`) and Rewards
(`RewardsFlow.tsx`, `step` or `screen` — pick deliberately: the wizard slides its own steps inside the
one "wizard" pane, so `step` resets per wizard step and `screen` only per pane). Delete
`ScrollToTopOnArrival` and `scrollParent`. The dark `OwnerSheet` snapshots
(`tests/__snapshots__/components.owner-sheet.test.ts.snap`) must stay byte-identical. Test: a changed
`scrollKey` resets `scrollTop`; an unchanged one doesn't.

**Out of scope:** F7 global CSS (4.4), F8–F10 cleanups (4.5), the device checklist/docs/commit (4.6),
any API route, table, migration, Stripe, feature flag, `fetch(` under `components/owner/store/`, product
wording (decisions 8 and 10), the contact line (decision 9) and the "6 × $4" line (decision 11).

### 2. Starting state

- Branch `main`, HEAD `75563ec10b743da4f739562cf837f30bc1d43938` ("Partner Dashboard Revamp").
  **No commits from Phases 1–4.2.** The 4 source PNGs and 4 WebPs under `public/store/` are staged;
  everything else is unstaged or untracked. No push, deploy, Vercel env change, database read or
  write, or migration has happened in any phase.
- Pre-existing unrelated edits from before this plan: `AGENTS.md`, `SYSTEM_CONTEXT.md`,
  `docs/nfl-pickem-reward-phase3.md`, and parts of `CLAUDE.md`. Don't revert them. Ask Andrew before
  committing them together (Phase 4.6).
- Never `git checkout -- <file>` or `git stash` here (user memory: it destroyed work before). To undo
  your own edit, edit it back.
- No background processes running (`next start -p 3123` was used for the browser check and killed
  with `pkill -f "next start -p 3123"`). No temp files left in `tests/` (two throwaway test files and
  one stray snapshot they created were deleted; `git status --short tests | grep zz` is empty).

### 3. Decisions made in Phase 4.2 (don't re-ask)

- **Andrew's answers (2026-10-01), now plan decisions 9–11:** Q2 — no contact line, leave
  `MERCH_ORDER_CONTACT = null`; Q3 — product descriptions stay as they are, Andrew edits them later;
  "6 × $4" on Review stays ("I don't know what this means, but just leave it for now"). Plan §8 has no
  open questions now.
- **`replaceCurrentStep` is gone; `correctStep(target)` replaces it** on `UseOwnerSheetResult`. Every
  caller of the old method was a correction (the three flows' correction effects plus the reward
  wizard's `"replace"` step change), so keeping both would have left a dead, foot-gun method.
- **Deviation from the plan's wording — pop on depth alone.** The plan said "pop when depth ≥ 2 AND
  the correction target is the previous screen". Built: pop whenever depth ≥ 2, else replace. Why:
  the history API can't read the previous entry's URL, and flows can't always know it (Rewards'
  `detail` opens from the dashboard at depth 1 or from the list at depth 2). Popping lands on a screen
  the partner really saw; if that screen lost its data too, its own correction pops again. So Schedule
  Review → Repeat → When unwinds to When, and Rewards end → detail → all unwinds to the list, one entry
  each. The visible screen during the chain doesn't flicker, because each flow resolves the same
  fallback (`current`/`step`) on every hop.
- **Why popping can't leave the sheet or land on another sheet:** it only pops at depth ≥ 2, so it
  lands at depth ≥ 1, still inside a sheet. The only way one sheet's entry sits on another's is the
  Rewards → Schedule swap (`openSchedule(undefined, true)` in `app/owner/dashboard/page.tsx` ~line
  264), and that opens Schedule with no `step`, which no flow ever corrects (Schedule and Rewards skip
  `urlStep === null`; the store's no-step is already "Shop"). This invariant is written in the
  `correctStep` doc comment. If someone adds a sheet-to-sheet swap that opens on a correctable step,
  revisit it (e.g. record a per-sheet base depth in `history.state`).
- **The hook guards against a double pop.** `history.go(-1)` is asynchronous. The reward wizard's
  correction effect depends on `onStepChange`, which is a new function every render, so it re-calls
  `correctStep` on every render until the pop lands. `useOwnerSheet` keeps `poppingFrom` (a ref,
  `"<href>|<depth>"`) and ignores calls from that same entry until a one-shot `popstate` listener
  clears it. Clearing on popstate (not never) matters: the browser's Forward back onto the spent entry
  must be corrected again. Both behaviours are pinned by tests (mutation-checked).
- **F4:** `stepBack()` and `goBack()` take `previous: string | null`; null = the sheet's first screen,
  no `step` in the URL. Only the store passes null today.

### 4. Files changed in Phase 4.2

| File | What |
|---|---|
| `lib/ownerSheetParams.ts` | `stepBack(..., previous: string \| null)` (~line 177). **New** `correctStep(history, location, sheet, target): "popped" \| "replaced"` (~line 209) with the full rationale. `replaceStep`'s doc now says flows go through `correctStep`. |
| `lib/useOwnerSheet.ts` | `UseOwnerSheetResult.replaceCurrentStep` → `correctStep(step: string \| null)`; `goBack(previous: string \| null)`. `correctStep` wraps the driver with the `poppingFrom` guard (~lines 105–130). Imports `readSheetDepth`, no longer `replaceStep`. |
| `components/owner/store/MerchStoreSheet.tsx` | Correction effect uses `nav.correctStep` (~line 106); "Back to store" calls `nav.goBack(null)` (~line 155). |
| `components/owner/schedule/ScheduleGameFlow.tsx` | Correction effect uses `nav.correctStep` (~line 131). |
| `components/owner/rewards/RewardsFlow.tsx` | Correction effect uses `nav.correctStep` (~line 105); `handleWizardStep`'s `"replace"` branch calls `nav.correctStep(next)` (~line 171). |
| `tests/lib.owner-sheet-params.test.ts` | +4 driver tests: `stepBack(null)` leaves no `step` (F4); `correctStep` replaces at depth 1 and 0; store reload on Review pops to Shop and one Back closes (F3); the Schedule chain unwinds Review → Repeat → When. |
| `tests/lib.use-owner-sheet.test.ts` | **New.** The hook against jsdom's real history: three `correctStep` calls before the pop lands → one `go(-1)`; the next lost entry is corrected in turn; on the first entry it replaces. |
| `tests/app.owner-dashboard-merch.test.ts` | New describe "sheet history (Phase 4.2)", 3 tests on the real dashboard page: F3 reload on Review while venues load (pops once, never rewrites, one Back closes); F3 browser Forward onto the spent Review is corrected again; F4 Shop → Review → Back to store never writes `step=shop`. |
| `tests/components.owner-merch-store.test.ts` | `replaceCurrentStep` → `correctStep` in the nav stub/assertions; "Back to store" expects `goBack(null)`. |
| `tests/components.owner-schedule-flow.test.ts`, `tests/components.owner-rewards-flow.test.ts` | Harness method renamed to `correctStep`, log label `replace:` → `correct:`, assertions updated. (These harnesses fake the hook with a stack; the real pop logic is tested in the files above.) |
| `docs/join-merch-store-plan.md` | Status line → this handoff, next 4.3; decisions 9–11; Phase 4.2 marked DONE with an as-built note and the deviation; §8 Q2/Q3/"6 × $4" answered. |
| `CLAUDE.md` | Join Merch status sentence (4.3–4.6 next); Partner Dashboard app-shell bullet: corrections go through `nav.correctStep()`. |

Old handoffs (`docs/partner-dashboard-app-redesign-plan_PHASE_*_HANDOFF.md`,
`docs/join-merch-store-plan_PHASE_2/3/4.1_HANDOFF.md`) still say `replaceCurrentStep`. They are
history; don't rewrite them.

### 5. Facts and traps found in Phase 4.2

1. **The 3 "pre-existing" test failures are NOT caused by `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED`.**
   Earlier handoffs (Phase 3 trap 7, Phase 4.1 §6) said so. Proven wrong: stubbing the flag off
   (`vi.stubEnv`) still fails. The cause is committed copy: `components/rewards/CreateRewardWizard.tsx`
   ~line 712 renders `"Which game should the reward be tied to?"` in sheet mode (`animateSteps`), set in
   HEAD `75563ec`, while `tests/components.create-reward-wizard.test.ts` (1) and
   `tests/components.owner-rewards-flow.test.ts` (2) still expect `"Which reward?"`. Running a throwaway
   copy of the rewards-flow test with the heading swapped passes **17/17**, which is how this phase's
   Rewards changes were verified. Fixing those tests is out of this plan's scope; I told Andrew and
   didn't change them.
2. **jsdom's `history.back()/forward()/go()` are asynchronous.** A `waitFor(() => location.search ===
   X)` right after `forward()` passes **vacuously** against the URL from before it moved. My first
   Forward test did exactly that and survived a mutant. Wait for the `popstate` that lands on the entry
   you expect (see `landedOnReview` in `tests/app.owner-dashboard-merch.test.ts` and `landOn()` in
   `tests/lib.use-owner-sheet.test.ts`).
3. **`SlideSteps` keeps the outgoing pane mounted** (it waits for an animation end that jsdom never
   fires), so "Review heading is gone" never becomes true in jsdom. Assert on the footer instead (the
   Shop's "Review order" button comes back at once).
4. **The test harness's `go()` helper pushes with `state: null` (depth 0).** So after `go("?sheet=store")`
   and Review, Review is at depth 1 and "Back to store" takes the *replace* path. That's the exact F4
   path (good for that test), but remember it when you expect a pop. App writes made via
   `replaceState`/`pushState` don't notify the mocked `useSearchParams`: call `notifyHistory()`.
5. **The venue switcher (`button "Select venue"`) only renders with 2+ venues.** With one venue, wait
   for something else.
6. **Real browser, after a reload:** the entries below the reloaded one belong to the old document, and
   I expected the correction's `go(-1)` to cause a full page load. It doesn't: in Chromium on
   `next start`, the page `load` count stays at 2 (first visit + the reload), and `/api/owner/venues`
   is fetched twice (once per load). Same for Schedule.
7. **Vitest snapshot files appear for any new test file name that renders snapshots.** My throwaway
   wrapper created `tests/__snapshots__/zz-tmp-flag-off.test.ts.snap`. Deleted. If you make temp test
   files, check `git status --short tests` afterwards.

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
npx vitest run tests/lib.owner-sheet-params.test.ts tests/lib.use-owner-sheet.test.ts \
  tests/app.owner-dashboard-merch.test.ts tests/components.owner-merch-store.test.ts \
  tests/components.owner-schedule-flow.test.ts tests/components.owner-rewards-flow.test.ts \
  tests/components.owner-sheet.test.ts tests/owner-dashboard-contract.test.ts \
  tests/owner-menu-contract.test.ts tests/navigation-controls-contract.test.ts
```

Verified 2026-10-01, end of Phase 4.2:
- `npx tsc --noEmit`: clean. `npm run lint`: clean (the usual Babel `lib/sportsBingo.ts` note).
- `npm run test`: **2,919 passed, 13 skipped, 3 failed** (was 2,911; +8 new tests). The 3 failures are
  the known ones from §5 trap 1.
- `npm run build`: exit 0; `/owner/dashboard` still `○ (Static)`.
- **Mutation checks** (each reverted by editing back; `lib/useOwnerSheet.ts` restored from a backup and
  `diff`-checked identical): `correctStep` never popping fails 2 driver + 2 page tests; the store calling
  `goBack("shop")` fails the F4 page test; removing the double-pop guard fails the hook test; never
  clearing the guard fails the Forward page test.
- **Real browser** (Chromium/Playwright, `npx next start -p 3123`, `page.route("**/api/owner/**")`
  stubs, 390×844; scripts in the scratchpad, not the repo):
  - Store: menu → Order Join Merch → +1 Table Tent → Review (depth 2) → Back to store →
    `?sheet=store`, depth 1 → Review again → **reload** → `?sheet=store`, depth 1, Shop visible,
    load count 2 → **one Back** → `/owner/dashboard`, store closed.
  - Schedule: pushed `?sheet=schedule&step=when` (1), `&step=repeat` (2), `&step=review` (3) →
    reload → `?sheet=schedule&step=when`, depth 1, heading "When does it start?", load count 2 →
    one Back → dashboard, no dialog.
  - No page errors.

**Not verified:** a real phone and a real signed-in partner session (Phase 4.6 checklist already lists
"after a reload on Review: one Back closes"). Rewards' pop chain wasn't run in a real browser (it was in
jsdom via the throwaway heading-swapped copy, and the driver/hook tests cover the mechanism).

### 7. Open questions for Andrew

None. Q1–Q4 and the "6 × $4" question are all answered (plan §8). Optional, outside the plan: whether
to fix the 3 stale reward-wizard tests (§5 trap 1).

### 8. Recommended first steps for Phase 4.3

1. Run the targeted tests above, then the four checks, to confirm §6.
2. Read `components/owner/sheet/OwnerSheet.tsx` (find the scrollable body element, and how tone/size
   change its classes) and `components/owner/sheet/SlideSteps.tsx`. Note the dark snapshot test in
   `tests/components.owner-sheet.test.ts`: the new prop must add no markup.
3. Add `scrollKey` + the ref and reset in `OwnerSheet`, with a jsdom test (set `scrollTop` on the body,
   rerender with a new key → 0; same key → unchanged).
4. Pass `scrollKey` from the three flows, delete `ScrollToTopOnArrival`/`scrollParent` from
   `MerchStoreSheet.tsx`, and run the store, schedule, rewards and owner-sheet tests.
5. Write `docs/join-merch-store-plan_PHASE_4.3_HANDOFF.md`, mark Phase 4.3 done in the plan, and point
   the status line at it.

Model/effort per the plan: **Opus 5.5, medium.**
