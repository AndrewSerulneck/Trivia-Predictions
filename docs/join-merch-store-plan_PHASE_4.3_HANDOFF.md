# Join Merch Store — Phase 4.3 Handoff

## For Andrew (plain English)

Phase 4.3 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed:
- **Every screen in a dashboard panel now opens at the top (F6).** Before: if you scrolled down the
  long store list and went to Review, Review could open part-way down. The store had a private
  workaround; Schedule Live Games and Offer Rewards had the same problem with no fix. Now the shared
  panel itself scrolls back to the top whenever the screen changes, for all three.
- **The three stale reward-wizard tests now expect your new heading** "Which game should the reward
  be tied to?" (they still expected "Which reward?"). The whole test suite now passes with **zero
  failures** for the first time in this plan.
- **The reward choice buttons now show just the game's name: "Live Trivia" and "NFL Pick 'Em"**
  (your request mid-phase). Your earlier edit had changed the heading but not the buttons, which
  still said "… Challenge". The reward's stored name is unchanged ("Live Trivia Challenge"), so the
  next screen's title, the Back button label, the "reward created" message and existing rewards all
  read as before. This applies to both the Partner Dashboard and the admin page (they share one
  wizard).

Checked: typecheck, lint, full tests (2,925 pass, 0 fail), production build. Not checked on a real
phone yet (that's Phase 4.6's checklist).

Needs from you: nothing.

---

## For the next agent (Phase 4.4)

Read `docs/join-merch-store-plan.md` §5 "Phase 4.4" first (finding **F7**). Earlier handoffs:
`docs/join-merch-store-plan_PHASE_1_HANDOFF.md` … `_PHASE_4.2_HANDOFF.md`. The Phase 3 handoff's
"Facts and traps" (global form CSS, the `fetch(` tripwire reading comments, the Playwright stub
recipe, `PIPESTATUS` in zsh) and the Phase 4.2 handoff §5 traps 2–7 still apply. Phase 4.2's trap 1
(3 failing tests) is **resolved** — see §5 below.

### 1. Next phase's goal and scope

**Phase 4.4 (Opus 5.5, high): light panel without `!important` patches (F7).** `app/globals.css`
has unlayered `button:not(:disabled) { border…; font-weight: 600 }` and
`input, select, textarea { border: 1px solid #334155 !important; … }` plus a cyan `:focus` border.
On the white store panel these are fought with `!` utilities scattered across `OwnerSheet` (light
tone: `TONE.light.title` `!text-slate-900`, `TONE.light.closeSurface` `!border-slate-300`, in
`components/owner/sheet/OwnerSheet.tsx` ~lines 100–110), `QuantityStepper`, `CoasterPackSelect` and
`MerchOrderBar` (under `components/owner/store/`). Preferred fix per plan: give the light panel an
`ht-light-surface` class and exclude it from the global rules with `:where(:not(.ht-light-surface *))`
so specificity is unchanged elsewhere; then remove the `!` utilities. Before landing, diff the
compiled CSS and confirm dark sheets, admin and a player page are unaffected (dark snapshots +
screenshots). Fallback: keep the `!`s and add a static test that every control under
`components/owner/store/` carries them.

Note: `TONE.light.title` uses `!text-slate-900` because `.ht-h2` is unlayered CSS — that one is not
the form-CSS problem; decide deliberately whether F7 covers it.

**Out of scope:** F8–F10 cleanups (4.5), the device checklist/docs/commit (4.6), any API route,
table, migration, Stripe, feature flag, `fetch(` under `components/owner/store/`, product wording
(decisions 8 and 10), the contact line (decision 9), the "6 × $4" line (decision 11).

### 2. Starting state

- Branch `main`, HEAD `75563ec10b743da4f739562cf837f30bc1d43938` ("Partner Dashboard Revamp").
  **No commits from Phases 1–4.3.** The 4 source PNGs and 4 WebPs under `public/store/` are staged;
  everything else is unstaged or untracked. No push, deploy, Vercel env change, database read/write
  or migration in any phase.
- Pre-existing unrelated edits from before this plan: `AGENTS.md`, `SYSTEM_CONTEXT.md`,
  `docs/nfl-pickem-reward-phase3.md`, parts of `CLAUDE.md`. Don't revert them; ask Andrew before
  committing them together (Phase 4.6).
- **New in this phase and outside the merch plan** (Andrew asked for them directly; commit them with
  4.6 but mention them separately): the reward-wizard test-wording fix and the game-name buttons
  (files in §4).
- Never `git checkout -- <file>` or `git stash` here (user memory: it destroyed work before). To undo
  your own edit, edit it back or restore from a scratchpad copy.
- No background processes running; no temp files in `tests/`.

### 3. Decisions made in Phase 4.3 (don't re-ask)

- **`scrollKey` is a string prop on `OwnerSheet`; a change resets the body's `scrollTop` to 0.**
  Implemented with `useLayoutEffect` (reset before the arriving step paints) keyed on `[scrollKey]`.
  A fresh open needs no reset (the body is newly mounted at 0), and the sheet unmounts after its
  exit, so reopening starts at the top too. The ref adds no attribute: dark snapshots are unchanged
  (the existing snapshot tests ran without `-u` and passed), and a new test asserts identical markup
  with and without `scrollKey`.
- **Rewards keys on `step`, not `screen`.** The reward wizard slides its own steps (definition →
  terms → …) inside one `"wizard"` pane, and each is mirrored to the URL, so `step` changes per
  wizard step and each starts at the top. Commented at the call site in `RewardsFlow.tsx`.
- **Store and Schedule key on `current`** (the resolved display step).
- **The reset happens when the step changes, i.e. while the outgoing pane is still sliding out**, so
  the outgoing pane jumps to its top during the slide. The deleted store workaround did the same
  (reset on the arriving pane's mount), so behaviour is unchanged for the store. If Andrew notices it
  on a phone, the alternative is resetting on `SlideSteps`' animation end — not done.
- **Andrew (2026-10-01): the heading "Which game should the reward be tied to?" is the wording he
  wants**; tests were updated to it.
- **Andrew (2026-10-01): the definition option buttons show only the game name, no "Challenge".**
  Built as a new required `gameName` field on `RewardDefinition` (`lib/rewardDefinitions.ts`:
  "Live Trivia", "NFL Pick 'Em"), rendered only on the option buttons. `name` was **not** changed
  because it is also stored as the campaign name and used as the terms-step heading, the wizard's
  Back label and the summary. Adding a future reward now needs a `gameName` too (typecheck enforces
  it); AGENTS.md's "add a reward" steps don't mention it yet — Phase 4.6 can add one line.

### 4. Files changed in Phase 4.3

| File | What |
|---|---|
| `components/owner/sheet/OwnerSheet.tsx` | Header comment "STEPS START AT THE TOP"; prop `scrollKey?: string`; `bodyRef` + `useLayoutEffect` reset (~lines 148–153); `ref={bodyRef}` on the scrolling body div. |
| `components/owner/store/MerchStoreSheet.tsx` | Deleted `scrollParent` and `ScrollToTopOnArrival` (and the `useRef` import); `renderStep`'s Review branch no longer needs a fragment; `<OwnerSheet scrollKey={current}>`. |
| `components/owner/schedule/ScheduleGameFlow.tsx` | `<OwnerSheet scrollKey={current}>`. |
| `components/owner/rewards/RewardsFlow.tsx` | `<OwnerSheet scrollKey={step}>` with a one-line comment. |
| `tests/components.owner-sheet.test.ts` | New describe "OwnerSheet scrollKey (… Phase 4.3, F6)": changed key resets to 0; same key leaves 480; adds no markup. |
| `lib/rewardDefinitions.ts` | **Outside plan.** New `gameName` field + values. |
| `components/rewards/CreateRewardWizard.tsx` | **Outside plan.** Option buttons render `def.gameName` (~line 725). |
| `tests/components.create-reward-wizard.test.ts` | **Outside plan.** Heading expectation → new wording; one option click selector `/Live Trivia Challenge/` → `/Live Trivia$/` (line ~116 area uses `/Live Trivia/` already). Line 182 still clicks `/Live Trivia Challenge/` — that's the wizard's **Back** button, labelled with `definition.name`. |
| `tests/__snapshots__/components.create-reward-wizard.test.ts.snap` | **Outside plan.** Admin "definition" snapshot updated with `-u`; the only diff is the two button labels. |
| `tests/components.owner-rewards-flow.test.ts` | **Outside plan.** 3 heading expectations → new wording; option clicks → `button(/Live Trivia$/)`. Line 308 keeps `/Live Trivia Challenge/` (the Back button). |
| `docs/join-merch-store-plan.md` | Status line → this handoff, next 4.4; Phase 4.3 marked DONE with an as-built note. |
| `CLAUDE.md` | Join Merch status sentence (4.4–4.6 next) + "use `scrollKey`, don't hand-roll a scroll reset". |

### 5. Facts and traps found in Phase 4.3

1. **The 3 long-standing test failures are fixed** (stale "Which reward?" expectations). `npm run
   test` should now show **0 failed**; any failure is new and yours.
2. **`/Live Trivia/` as a button selector is ambiguous after the definition step**: the wizard's Back
   button is labelled "Live Trivia Challenge" and the schedule link "Schedule Live Trivia". The option
   buttons' accessible name is "🧠 Live Trivia", so `/Live Trivia$/` targets them precisely.
3. **The scroll body is the element with `.overflow-y-auto` inside `[role="dialog"]`** — the new tests
   find it that way. If F7 or anything else changes that class, update the helper `body()` in
   `tests/components.owner-sheet.test.ts`.
4. jsdom lets you set `scrollTop` on any element and reads it back, which is what makes the reset
   testable without layout.

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
npx vitest run tests/components.owner-sheet.test.ts tests/components.owner-merch-store.test.ts \
  tests/components.owner-schedule-flow.test.ts tests/components.owner-rewards-flow.test.ts \
  tests/components.create-reward-wizard.test.ts tests/app.owner-dashboard-merch.test.ts \
  tests/owner-dashboard-contract.test.ts tests/owner-menu-contract.test.ts \
  tests/navigation-controls-contract.test.ts
```

Verified 2026-10-01, end of Phase 4.3:
- `npx tsc --noEmit`: clean. `npm run lint`: clean (the usual Babel `lib/sportsBingo.ts` note).
- `npm run test`: **2,925 passed, 13 skipped, 0 failed** (was 2,919 + 3 failing; +3 new scrollKey tests).
- `npm run build`: exit 0; `/owner/dashboard` still `○ (Static)`.
- **Mutation checks** (OwnerSheet restored from a scratchpad copy, `diff`-checked identical): deps
  `[]` (never resets on change) fails the reset test; no deps (resets every render) fails the
  unchanged-key test.

**Not verified:** a real browser or phone. The reset is covered in jsdom only. Phase 4.6's device
checklist should include: scroll the store list down → Review opens at the top; same for Schedule
(When → Repeat → Review) and Offer Rewards (wizard steps). Also check the new game-name buttons on
the reward wizard (Partner Dashboard and admin).

### 7. Open questions for Andrew

None.

### 8. Recommended first steps for Phase 4.4

1. Run the targeted tests and the four checks to confirm §6.
2. Read `app/globals.css`'s global `button`, `input, select, textarea` and `:focus` rules, and grep
   for `!border-`, `!font-`, `!text-` under `components/owner/store/` and in `OwnerSheet.tsx`'s
   `TONE.light`.
3. Build the CSS before/after (`npm run build`, then diff the emitted CSS under `.next/static/css/`)
   to prove the `:where(:not(.ht-light-surface *))` change touches only the intended rules.
4. Screenshot pass (`/owner/dashboard` dark sheets, `/admin`, one player page) per the plan; the
   Playwright stub recipe is in the Phase 3 handoff.
5. Write `docs/join-merch-store-plan_PHASE_4.4_HANDOFF.md`, mark 4.4 done in the plan, point the
   status line at it.

Model/effort per the plan: **Opus 5.5, high.**
