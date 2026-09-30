# Partner Dashboard App-Style Redesign — Phase 1 Handoff

**Plan:** `docs/partner-dashboard-app-redesign-plan.md`
**Phase finished:** Phase 1, the shared building blocks. Finished on 2026-09-30 by Claude Opus 5.5.
**Next phase:** Phase 2, the top bar, logo menu and compact shell. Plan's model/effort: Sonnet 5.5, medium.

---

## For Andrew (plain English)

**What changed.** I built the parts that every later phase will use. None of them is on screen yet
except the Partner Manual:

- a **slide-up panel**, used for the Schedule and Rewards flows later
- a **slide-in menu** from the left, used for the logo menu in Phase 2
- a **step-by-step slider** that moves one question at a time, left or right
- **address-bar handling**, so the phone's Back gesture closes the panel or goes back one step
  instead of leaving the dashboard

The **Partner Manual** now opens through the new slide-up panel. It should look and behave the same
as before. There is one small improvement: keyboard and screen-reader focus now moves into the
manual when it opens and stays inside it until it closes.

**Is it live?** No. Nothing is committed, pushed or deployed. All the changes are only on your
Mac, in this working copy.

**What's left.** Phases 2 to 6 of the plan, as listed there. You skipped Phase 0 (the clickable
prototype).

**What I need from you.**

1. Say whether you want this committed. I didn't commit because you didn't ask me to.
2. Optional: open the Partner Dashboard on your phone once it is deployed and check that the
   Partner Manual still opens and closes the way it did. Headless tests can't judge the look.

**Your decisions.** You accepted every recommended answer in §3 of the plan. They are listed
below so no later agent asks you again.

---

## For the next agent

### 1. Phase 2 goal and scope

Build exactly what the plan's **Phase 2** section and §4a, §4b and §4g describe:

- `components/owner/OwnerAppBar.tsx`: a sticky `h-14` bar. It holds the logo menu button (40×40
  target, small logo mark and a 14px ☰ badge, `aria-label="Open menu"`, `aria-haspopup="dialog"`,
  `aria-expanded`), the venue name / switcher slot in the centre, an empty trailing slot, and a
  `leading` override for Back.
- Fill `components/owner/menu/OwnerMenuDrawer.tsx` with the six rows in §4b's order. Put them inside
  a `<nav>` in the drawer's `children`, because the drawer itself is the `role="dialog"` element.
  The order is: Venue Display, Billing, Partner Manual, Game Settings, Account Settings, a divider,
  then `SignOutButton variant="partner"` **last**, with no arrow.
- Change `OwnerShell`'s **dark** variant to the compact bar: `ExitBackButton` top-left back to
  `/owner/dashboard`, the title in the bar, no `ExplodingLogo`. **Do not change the light variant.**
- Remove `showAccountMenu` from dark sub-pages. Delete `OwnerAccountMenu` only if nothing still
  uses it. Check `/owner/billing/setup` (light variant) first.
- Update the `SignOutButton` host allowlist in `tests/navigation-controls-contract.test.ts` (around
  line 148). Add `tests/owner-menu-contract.test.ts`, pinning the six items, their order and Sign Out
  last.

**Out of scope for Phase 2:**

- the dashboard body and its section cards (Phase 3)
- the Schedule and Rewards flows (Phases 4 and 5)
- the discard confirmation, the first-visit ☰ pulse and toasts (Phase 6)
- server APIs, `proxy.ts`, migrations and `vercel.json` (never in this plan)

### 2. Starting state

- Branch `main`. The last commit is `2694f99` ("docs: add the Code review section the Phase 2
  handoff references"). That commit is from the unrelated Supabase grants work and was already the
  HEAD when this phase started.
- **Nothing from Phase 1 is committed.** Untracked and modified files:
  - modified: `app/globals.css`, `components/owner/PartnerManual.tsx`
  - new: `components/owner/sheet/{OwnerSheet.tsx,SlideSteps.tsx,sheetMotion.ts,useModalOverlay.ts}`,
    `components/owner/menu/OwnerMenuDrawer.tsx`, `lib/ownerSheetParams.ts`, `lib/useOwnerSheet.ts`,
    `tests/lib.owner-sheet-params.test.ts`, `tests/components.owner-sheet.test.ts`,
    `tests/components.owner-slide-steps.test.ts`
  - the plan itself, `docs/partner-dashboard-app-redesign-plan.md`, was untracked before this phase
    and still is. This handoff is untracked too.
- Before starting, ask Andrew whether to commit Phase 1 first. If he says yes, commit these files
  together. Use a message such as "Partner Dashboard redesign Phase 1: shared sheet, drawer, step
  and URL building blocks".
- No data, database, env var, Stripe or Vercel changes were made. There are no backups or undo logs,
  because nothing needed them.

### 3. Decisions already made (do not re-ask)

Andrew said on 2026-09-30: "go with all of your recommended answers" to plan §3, and "skip the
Phase 0 prototype". So:

1. **The menu lives only on the dashboard.** Dark sub-pages show `ExitBackButton` top-left, a small
   title and no big logo. Sign Out lives only in the menu.
2. **A ☰ badge on the logo**, pulsing once on the first visit. The flag is kept in `localStorage`
   (cosmetic; wrap reads in try/catch). The pulse itself is Phase 6. The static badge is Phase 2.
3. **Tapping an existing game or reward** opens the same sheet with Edit / Cancel game or End
   reward.
4. **The dashboard shows at most 3 upcoming games and 3 active rewards**, then "See all (N)". Past
   games and ended rewards sit behind "History" inside each sheet.
5. **Leaving a half-finished sheet asks "Discard this game?"** (Keep editing / Discard). There are
   no drafts.
6. **Venue Display, Billing, Game Settings and Account stay full pages.** Only the Partner Manual
   is a sheet.
7. **Phase 0 was skipped.** No prototype was built.

Implementation decisions made in Phase 1, and why:

- **Sheet state is written with the native `history.pushState/replaceState`, not `router.push`.**
  Closing must pop *every* entry the sheet pushed; otherwise Back after Close reopens the sheet on
  its last step. That needs a depth counter in `history.state` (`ownerSheetDepth`), and
  `router.push` can't attach state. Next 16 patches the native calls: it keeps our key, copies its
  own internals in, and updates `useSearchParams`. This was verified in
  `node_modules/next/dist/client/components/app-router.js` (`copyNextJsInternalHistoryState`,
  around lines 82 and 246–265). Native `pushState` never scrolls, which is what the plan's
  `{ scroll: false }` was for. **This is a deliberate change from the plan's wording.**
- **Deep links are normalised.** Landing on `/owner/dashboard?sheet=schedule` with depth 0 (a
  shared link, or the future `/owner/schedule` redirect) rewrites that entry to the plain dashboard
  and pushes the sheet on top. Back then closes the sheet instead of leaving the site. A reload
  mid-flow keeps its depth and is not normalised again.
- **Step transitions are sequential.** The old step slides out (120ms), then the new one slides in
  (240ms). There are never two questions on screen at once. This is the same choice
  `components/signup/SignupStepTransition.tsx` made. It uses CSS keyframes, not framer-motion, as
  the plan requires.
- **`SlideSteps` takes a `renderStep(stepId)` render prop, not `children`.** The step that is
  leaving is rendered live from the host's current state for its 120ms exit. Using a React-element
  snapshot would show stale values, and capturing one would break the `react-hooks/refs` lint rule.
- **`OwnerSheet` has two sizes.** `"card"` is the Partner Manual's exact previous look.
  `"tall"` (the default) is `h-[92svh]` on phones with a grab handle and a footer slot, for the
  flows. The Partner Manual uses `size="card"`, so its look is unchanged.
- **Overlays render through a portal to `document.body`.** Phase 2's app bar will use
  `backdrop-blur`, and `backdrop-filter` or `transform` on an ancestor turns `position: fixed` into
  "fixed to that ancestor". The portal avoids that.
- **Swipe-to-dismiss was not built.** The plan marked it optional. Close, Escape, a scrim tap and
  the phone's Back gesture all work. The grab handle is visual only.

### 4. Files and how they fit together

| File | What it is |
|---|---|
| `components/owner/sheet/sheetMotion.ts` | `SHEET_EXIT_MS` (270), `DRAWER_EXIT_MS` (240), `STEP_OUT_MS` (120), `prefersReducedMotion()`, `resolveExitMs(ms)`. Each value must match its keyframe class in `app/globals.css`. |
| `components/owner/sheet/useModalOverlay.ts` | The shared dialog mechanics. **Controlled** `open`, `onRequestClose` (runs `closeGuard` first), and `isMounted`/`isClosing` so the exit animation plays before unmount. Focus moves to the panel on open and returns to `returnFocusRef` or the opener after exit. `onExited`. A module-level **overlay stack** means Escape closes only the topmost overlay. It also provides the Tab trap, the `setScrollLock(…, "popup")` lock for the whole mounted life, and `isClient` (`useSyncExternalStore`) for SSR-safe portals. |
| `components/owner/sheet/OwnerSheet.tsx` | The slide-up sheet. Props: `open`, `onRequestClose`, `title`, `eyebrow?`, `children`, `footer?`, `closeGuard?`, `onExited?`, `returnFocusRef?`, `size?: "card" \| "tall"`, `bodyClassName?` (default `p-5`), `closeLabel?`, `titleId?`. The Close button is top-right, matching the Partner Manual. |
| `components/owner/sheet/SlideSteps.tsx` | `<SlideSteps steps current renderStep className?>`. Direction comes from the order of `steps`. A step not in the list counts as "furthest along", so opening `history` slides forward. The leaving step is `inert` and `aria-hidden`. Afterwards, focus moves to `[data-step-heading]` or the first h1–h3; the first mount does not move focus. The entrance class is removed on `animationend`, so no `transform` lingers to break fixed popovers inside a step. With reduced motion the swap is instant. Test hooks: `data-step`, `data-step-phase` (`idle`/`leaving`/`entering`) and `data-step-direction`. |
| `components/owner/menu/OwnerMenuDrawer.tsx` | A left drawer (`w-[82vw] max-w-xs`, safe-area padding, `role="dialog"`, `aria-label`). It uses the same hook. It is an **empty shell**: Phase 2 supplies the rows. |
| `lib/ownerSheetParams.ts` | Pure, with no React or DOM. `OWNER_SHEET_IDS = ["schedule","rewards"]`, `parseSheetParam`, `parseStepParam` (slug `^[a-z][a-z0-9-]{0,31}$`), `resolveStep(raw, activeSteps, extraSteps?)` (a skipped or unknown step falls back to the first active step), `nextStep`, `previousStep`, `stepDirection`, `buildSheetSearch`, `sheetHref`, `nextStepHref`. The history driver takes a `SheetHistory`-like object: `readSheetDepth`, `pushSheet`, `pushStep`, `replaceStep`, `stepBack`, `closeSheet`, `normalizeLandedSheet`. |
| `lib/useOwnerSheet.ts` | `useOwnerSheet()` returns `{ sheet, step, displaySheet, displayStep, openSheet, goToStep, replaceCurrentStep, goBack, closeSheet }`. `display*` keep their last non-null values so a closing sheet keeps its content while it slides down. It runs `normalizeLandedSheet` once on mount. |
| `components/owner/PartnerManual.tsx` | Now a trigger plus `<OwnerSheet size="card" eyebrow="Hightop Challenge" titleId="partner-manual-title" bodyClassName="space-y-6 p-5">`. New optional props: `open` and `onOpenChange` (controlled mode), `showTrigger` (default `true`) and `returnFocusRef`. The trigger markup and classes are byte-identical to before. |
| `app/globals.css` | New keyframes and classes next to the existing sheet keyframes: `animate-tp-step-in-right/left` (240ms), `animate-tp-step-out-left/right` (120ms) and `animate-tp-drawer-in` (300ms) / `-out` (240ms). All six were added to **both** reduced-motion blocks: the 1ms one right after them, and the `animation: none !important` list near the "Reduced motion changes presentation only" comment. |

**How a Phase 3–5 host wires a flow sheet** (the intended pattern):

```tsx
// inside a component rendered under <Suspense> (useSearchParams needs it in Next 16)
const nav = useOwnerSheet();
const steps = scheduleSteps({ gameOptions, gameType }); // Phase 4's pure fn, after skip rules
const step = resolveStep(nav.displaySheet === "schedule" ? nav.displayStep : null, steps, ["history"]);
// if nav.step is non-null and differs from `step` → nav.replaceCurrentStep(step) (in an event or effect)
<OwnerSheet open={nav.sheet === "schedule"} onRequestClose={nav.closeSheet} title="Schedule a live game"
  footer={<WizardFooter variant="inline" tone="dark" onBack={prev ? () => nav.goBack(prev) : undefined}
                        onNext={() => nav.goToStep(next)} />}>
  <SlideSteps steps={steps} current={step} renderStep={(id) => <ScheduleStep id={id} … />} />
</OwnerSheet>
```

The section's "+" button calls `nav.openSheet("schedule")`. Keep the flow's form state in the host
(or a component that stays mounted), **not** inside the step components. `SlideSteps` remounts a
step on every change.

### 5. Facts and traps

- **`useSearchParams()` needs a `<Suspense>` boundary** or `next build` fails. `PartnerManual`
  doesn't use the hook, so nothing needs one yet. Phase 3's dashboard body does.
- **The phone's Back gesture bypasses `closeGuard`.** The URL has already changed by the time React
  sees it. Escape, a scrim tap and Close respect the guard. If Phase 6's "Discard this game?" must
  also catch the Back gesture, it needs a `popstate` interception, such as re-pushing the entry and
  showing the confirm. That is not built. Decide in Phase 6, and don't block Phase 2 on it.
- **`stepBack` means "go back where you came from"** when the sheet pushed the previous entry
  (depth 2 or more), because it calls `history.go(-1)`. It uses the `previous` argument only when it
  has to rewrite in place (the sheet's first entry, or a deep link). Phase 4's edit mode, where
  "Change" links jump from Review to a step, therefore returns to Review on Back. That is intended.
- **Switching sheets (Rewards → Schedule, Phase 5)** with `openSheet` stacks depth. `closeSheet`
  then pops both sheets' entries back to the plain dashboard. That is acceptable, but decide
  whether the handoff should `closeSheet()` and then `openSheet()` after `onExited`.
- **`closeSheet()` is asynchronous** when it calls `history.go(-n)`. The sheet's `open` becomes
  false on the following `popstate`, not synchronously.
- **jsdom quirks** (for tests):
  - jsdom has no `AnimationEvent`, so React listens for `webkitAnimationEnd` there. Fire both names
    (see `tests/components.owner-slide-steps.test.ts`).
  - jsdom has no `matchMedia`. `prefersReducedMotion()` catches the error and returns false. Stub
    `window.matchMedia` to test reduced motion.
  - "Not implemented: Window's scrollTo()" log lines come from `lib/scrollLock.ts` restoring scroll.
    They are harmless.
- **The Vitest glob is `tests/**/*.test.ts`, so there is no `.tsx`.** Component tests use
  `createElement`. Pass `children` as the third argument and cast the props object (see the
  existing `tests/admin-mobile.bottom-sheet-a11y.test.ts` pattern).
- **Lint rules that shaped the code:** `react-hooks/set-state-in-effect` and `react-hooks/refs`.
  All "prop changed → state" logic uses React's adjust-state-during-render pattern, as
  `SignupStepTransition` does. Keep it that way.
- **`app/owner/dashboard/page.tsx` renders `<PartnerManual>` in two branches** (multi-venue
  dropdown and single-venue card, around lines 140 and 150). Only one branch renders at a time.
  Phase 2 removes both and opens the manual from the drawer with
  `<PartnerManual showTrigger={false} open={…} onOpenChange={…} returnFocusRef={logoButtonRef} />`.
  Close the drawer first, then open the manual. Two overlays can be open at once, and the overlay
  stack handles Escape correctly, but it looks cluttered.
- `framer-motion` is installed, but it is deliberately **not** used here.

### 6. Build, run and test

Commands (from the repo root, Node from the user's shell):

```bash
npx tsc --noEmit                      # clean
npm run lint                          # clean (only the usual Babel "deoptimised styling" note for lib/sportsBingo.ts)
npx vitest run tests/lib.owner-sheet-params.test.ts tests/components.owner-sheet.test.ts tests/components.owner-slide-steps.test.ts   # 47 tests, all pass
npm run test                          # 2,679 pass / 13 skip / 4 FAIL — see below
npm run build                         # passes
npx vitest run tests/pwa-contract.test.ts tests/navigation-controls-contract.test.ts   # pass (globals.css changed)
```

Don't run `tsc` and `build` at the same time, because `build` regenerates `.next/types`.

**The 4 failing tests in `npm run test` were not caused by this phase.** They are date-based
staleness tripwires on committed Bingo snapshots:

- `tests/lib.sportsBingo.nfl-star-index.test.ts`
- `tests/lib.sportsBingo.nfl-star-index-freshness.test.ts`
- `tests/lib.sportsBingo.mlb-star-index.test.ts`
- `tests/lib.sportsBingo.mlb-star-index-freshness.test.ts`

The committed star-index snapshots' `generatedAt` is now too old for in-season sports. They import
nothing this phase touched. The fix is to regenerate the snapshots (`npm run bingo:stars:nfl` /
`bingo:stars:mlb`, which call live APIs and write repo files). That is outside this plan, so tell
Andrew rather than doing it unasked.

**Verified:**

- Pure URL/step logic and the history driver, run against a fake browser history (28 tests).
- `OwnerSheet`: portal, labelled modal, focus in and back, scroll lock through the exit, close
  requests (Escape, Close, scrim; a tap inside the panel is ignored), `closeGuard` veto, exit then
  unmount then `onExited`, reopening mid-exit, Tab trap, Escape closing only the topmost overlay,
  and the tall/card layout classes.
- `OwnerMenuDrawer` in/out.
- `PartnerManual` in uncontrolled and controlled modes.
- `SlideSteps`: direction, the sequential out-then-in order, `inert` on the leaving step,
  retargeting mid-exit, removing the entrance class, reduced motion, and heading focus.
- `next build`.

**Not verified (only a real device can confirm these):**

- The Partner Manual's look in a real browser after the refactor. The class strings are carried
  over exactly, so it should be pixel-identical.
- iOS Safari scroll lock with the portal.
- The real Back gesture driving `useOwnerSheet`. Next's patched history was read in its source, not
  exercised in a browser.
- The drawer's look.

Phase 3 or 4 should run the flow in a real browser (the `run` skill, or Playwright with an owner
session cookie) once a sheet is actually wired into the dashboard.

### 7. Open questions for Andrew

- Commit Phase 1 now? (See §2.)
- Nothing else is blocking. The discard-on-Back-gesture question in §5 is a Phase 6 decision.

### 8. Recommended first steps for Phase 2 (Sonnet 5.5, medium)

1. Read `docs/partner-dashboard-app-redesign-plan.md` §4a, §4b, §4g and Phase 2, then this handoff.
2. `git status`: confirm the Phase 1 files are present, and commit them if Andrew agreed.
3. Read `components/owner/OwnerShell.tsx`, `components/owner/OwnerAccountMenu.tsx`,
   `components/navigation/SignOutButton.tsx`, `components/navigation/ExitBackButton.tsx` and
   `tests/navigation-controls-contract.test.ts` (the SignOutButton host allowlist is near line 148).
4. Build `OwnerAppBar`. Wire `OwnerMenuDrawer` (`open` held in dashboard state, `label="Menu"`,
   rows in a `<nav>`). Open the Partner Manual from its row using controlled mode, with
   `returnFocusRef` pointing at the logo button.
5. Convert the dark `OwnerShell` variant. Remove `showAccountMenu` from dark pages. Update the
   allowlist. Add `tests/owner-menu-contract.test.ts`.
6. Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test` (expect only the 4 known star-index
   failures unless someone has refreshed the snapshots), then `npm run build`.
7. Write `docs/partner-dashboard-app-redesign-plan_PHASE_2_HANDOFF.md` and update the plan's status
   line.
