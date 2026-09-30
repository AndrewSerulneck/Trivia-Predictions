# Partner Dashboard App-Style Redesign — Phase 5 Handoff

**Plan:** `docs/partner-dashboard-app-redesign-plan.md`
**Phase finished:** Phase 5, the Offer Rewards sheet. 2026-09-30, Sonnet 5.5 (high).
**Next phase:** Phase 6, polish, docs, verification. Plan's model/effort: Sonnet 5.5 **medium** for polish + docs;
**Opus 5.5 high** for the final `/code-review high` pass and for judging its fixes.
**Earlier handoffs:** `..._PHASE_1_HANDOFF.md` (sheet / drawer / step / URL blocks), `..._PHASE_2_HANDOFF.md` (bar, menu,
compact shell), `..._PHASE_3_HANDOFF.md` (section cards), `..._PHASE_4_HANDOFF.md` (Schedule sheet). All still accurate.

---

## For Andrew (plain English)

**What changed.** Offering a reward now happens on the dashboard, in the same slide-up panel as scheduling. No more
separate Rewards page.
- Tap the **+** (or the big dashed card) on **Offer Rewards**. It opens straight on the questions you know from before —
  **Which reward?** → terms (how it's won, points target, how many/how often) → **Prize** → **Confirm** — but one question
  per screen, sliding sideways. Nothing about the rules changed; it is the same wizard the admin uses.
- **Tap an existing reward** to see its terms, dates and top players, with an **End reward** button. That opens the same
  "Archive — stop it, keep prizes" / "Delete anyway" choice as before, with the prize counts and the same wording.
- **See all** (or the amber "View Rewards" button from a game notice) shows every running reward, with **+ Offer another
  reward** and **Ended rewards** (read-only, with winners).
- **If the reward's game isn't scheduled yet**, the "Schedule Live Trivia" link now swaps to the Schedule panel instead of
  loading a page. After you save the game, the blue confirmation line says **"Now offer a reward for it →"**, which reopens
  the reward questions.
- The phone's Back gesture steps back one question and closes the panel from the first one; it never drops you off the
  dashboard. After creating or removing a reward, the panel closes, the list refreshes and a blue line confirms
  ("Live Trivia Challenge reward created", "Reward archived. Prizes already awarded still work.").
- The old address `/owner/competitions` now opens the dashboard with this panel already up.

**Is it live?** Committed locally, **not pushed, not deployed.**

**What's left.** Phase 6: the "Discard this reward?" prompt, the first-visit ☰ pulse, a proper toast and highlight ring,
copy updates in the Partner Manual, docs, and a phone checklist for you.

**What I need from you.**
1. Once deployed, try it on your phone: create a reward all the way through, end one (archive and delete), the "Schedule
   Live Trivia" round trip, the Back gesture, and typing in the "Custom target" / "Item name" boxes with the keyboard up.
   I only checked a phone-sized desktop browser with mocked data.
2. `data/sports-bingo/{mlb,nfl}-star-index.json` are still modified in git and are **not** part of this work. I did not
   commit them.

---

## For the next agent

### 1. Phase 6 goal and scope
Plan Phase 6: discard-confirm (decision 5), first-visit ☰ pulse (decision 2), real toast component (reuse an existing owner
toast if one exists; no new library) plus 2-second highlight ring on the new row, empty-state copy review, accessibility
pass (labels, focus order, 44px targets, contrast on dashed cards); `lib/partnerManual.ts` copy ("Tap the logo in the
top-left to open the menu, then Venue Display"; "Tap Offer Rewards on your dashboard"); docs (`docs/partner-dashboard-design.md`
new §§ for bar, drawer, section card, flow sheet; `SYSTEM_CONTEXT.md` §0; `CLAUDE.md` Navigation section: the sheet/drawer
primitives and where Sign Out now lives); `docs/partner-dashboard-app-redesign-device-checklist.md` for Andrew; gates incl.
`npm run test:pwa-contract` (only if `globals.css` changes); final `/code-review high` on Opus.
**Out of scope:** server APIs, `proxy.ts`, migrations, `vercel.json`, forking the wizard, Billing/Display/Game Settings/
Account as sheets, `/owner/category-blitz`.

### 2. Starting state
- Branch `main`. HEAD after this phase = the Phase 5 commit (`git log -1`); its parent is the Phase 4 commit (`a1e0974`).
  Nothing is pushed or deployed.
- `git status` still shows `data/sports-bingo/{mlb,nfl}-star-index.json` modified — **not from this plan; never stage
  them** with `git add -A`. Stage by path.
- No data, DB, env, Stripe or Vercel changes in any phase. No backups or undo logs exist or are needed.

### 3. Decisions (do not re-ask)
Plan §3 answers all stand (Andrew: "go with all of your recommended answers"; Phase 0 skipped). Phase 5 choices, and why:
- **Two more optional wizard props than the plan named.** The plan said `animateSteps` + `onRequestSchedule`. The Back-gesture
  rule (§4d) also needs the wizard's step in the URL, so `CreateRewardWizard` gained an opt-in **controlled step**:
  `step?: RewardWizardStep` + `onStepChange?(step, "forward" | "back" | "replace")`. Still one component, all four props
  optional; admin passes none (contract test asserts it).
- **`animateSteps` means "sheet presentation", not only motion.** It also drops the card chrome (the sheet is the card), adds
  a `[data-step-heading]` per step so `SlideSteps` can move focus, adds a heading to the Terms step (the reward's name) and
  words the first heading "Which reward?" instead of "Create Reward". Admin markup is unchanged (snapshot-pinned).
- **Wizard keeps its own inline footers** (Back / Next inside the step, scrolling with content), not the sheet's footer slot.
  The other screens (detail / end / history) get a plain Back in the sheet footer. Moving the wizard's Next into the pinned
  footer is a possible Phase 6 polish; it would need a new wizard prop and was judged not worth the shared-component risk.
- **One outer pane for the whole wizard.** The sheet's outer `SlideSteps` ranks five panes (`all, detail, end, wizard,
  history`); every wizard step maps to the `wizard` pane, whose own inner `SlideSteps` slides the steps. So there is never a
  double animation, and wizard answers survive every step change.
- **URL steps:** `?sheet=rewards` with no step = the list (`all`); `&step=definition|terms|prize|confirm` = the wizard;
  `detail`, `end`, `history`. A step whose data a reload lost is corrected in place (`replaceCurrentStep`): a reward screen
  with no reward → `all`; a wizard step needing the picked reward → `definition` (the wizard reports it as `"replace"`).
- **"+" opens on `definition` directly** (`openRewards("new")`), so the phone Back from there closes the sheet. Opened from the
  list's "+ Offer another reward", Cancel returns to the list (`addedFromList`).
- **Ended rewards are read-only rows** (winner shown), not tappable. Only active rewards open a detail screen with End reward.
- **Reward → Schedule → Reward handoff:** the wizard's link calls `onRequestSchedule` → `DashboardBody.openSchedule(undefined,
  true)` (`forReward`), stacking the Schedule sheet on the Rewards entry. Saving a game calls `closeSheet()` (pops both) and the
  success notice gets the action **"Now offer a reward for it →"** which calls `openRewards("new")` (fresh key → fresh
  wizard). Backing out of Schedule returns to the Rewards sheet (wizard state is lost after its exit, so it lands on Definition).
  Reward → Schedule wins over the old `scheduleLinkHref`; that prop is still required and now only used by admin (the owner
  host passes `/owner/dashboard?sheet=schedule` as an unused fallback).
- **Confirmation UI is still the Phase 4 stopgap** `DashboardNotice`. Phase 6 owns the toast + highlight ring.
- **Create confirmation names the reward:** `"<definition name> reward created"`, from a ref set in `onSubmit`.
  (State would be stale: the wizard calls `onCreated` from the click's closure.)

### 4. Files and how they fit
| File | Role |
|---|---|
| `lib/rewardWizardSteps.ts` | `REWARD_WIZARD_STEPS`, `RewardWizardStep`, `isRewardWizardStep`, `RewardWizardStepChange`, `guardRewardWizardStep(requested, {definition, context})`. Pure. |
| `lib/ownerRewardFlow.ts` | Sheet screens: `RewardSheetStep`, `RewardScreen`, `REWARD_SLIDE_ORDER`, `OWNER_WIZARD_STEPS`, `resolveRewardSheetStep`, `rewardScreenFor`, `RedemptionCounts`, `removeOutcomeMessage` (the old page's exact wording). Pure. |
| `lib/ownerRewardRequests.ts` | Client fetch wrappers moved out of the old page: `fetchRewardContext`, `submitReward`, `fetchRewardPrizeCounts`, `removeReward`. Same endpoints, no new ones. |
| `components/rewards/CreateRewardWizard.tsx` | **Shared with admin.** Now: its step blocks are a `renderStep(id)` (a fragment, so no new DOM); `step` is `controlledStep ?? internalStep` (guarded only when controlled); `goTo(next, change)` replaces `setStep`; a guard effect reports `"replace"`; `animateSteps` wraps `renderStep` in `SlideSteps`; `onRequestSchedule` swaps the `<a>` for a link-styled `<button>`. |
| `components/owner/rewards/RewardsFlow.tsx` | The Rewards sheet. Props: `venueId`, `venueName`, `nav` (`useOwnerSheet()` result), `rewards` (`SectionLoad<OwnerCompetition>`), `initialReward`, `onChanged({message})`, `onRequestSchedule`. Renders `OwnerSheet` + outer `SlideSteps`; owns detail/end state and the remove requests. |
| `components/owner/rewards/RewardStepScreens.tsx` | Presentational: `RewardsListScreen`, `RewardDetailScreen`, `EndRewardScreen` (old `RemoveRewardDialog` copy, in-sheet, no overlay), `RewardHistoryScreen`. |
| `components/owner/rewards/RewardRow.tsx` | One reward row; used by `RewardsSection` (dashboard card) and the sheet lists. |
| `components/owner/sheet/StepHeading.tsx` | The `[data-step-heading]` `<h3>`, moved out of `ScheduleStepScreens.tsx` and shared. |
| `app/owner/dashboard/page.tsx` | `DashboardBody` now takes `venueName`, mounts `<RewardsFlow key={rewardsSession} …/>`, has `openRewards("new" \| "all" \| reward)`, `handleRewardsChanged`, `scheduleForReward`; `notice` state is `{message, rewardNotice, offerReward}`. The placeholder sheet is gone. |
| `app/owner/competitions/page.tsx` | Now just `redirect("/owner/dashboard?sheet=rewards")` (server component; returns HTTP 200 + meta refresh, like `/owner/schedule`). |
| `components/owner/dashboard/DashboardNotice.tsx` | Action button restyled to a link (`!border-0 bg-transparent p-0`): the global button style boxed it. |
| Tests (new) | `tests/components.create-reward-wizard.test.ts` (7: **4 file snapshots of the admin variant recorded against the wizard BEFORE it was touched** — `tests/__snapshots__/components.create-reward-wizard.test.ts.snap` — plus sheet mode, `onRequestSchedule`, controlled step, reload correction), `tests/lib.owner-reward-flow.test.ts` (10), `tests/components.owner-rewards-flow.test.ts` (13 jsdom: list, ended, detail, archive, delete, failed remove, failed counts, wizard steps in history, Cancel, create, Schedule handoff, stale step). `tests/owner-dashboard-contract.test.ts` updated (+3): competitions redirect, dashboard mounts `RewardsFlow` per-open, wizard used with opt-in props and **admin passes none**. |

### 5. Facts and traps
- **Do not "refresh" the wizard snapshots to make a change pass.** They are the proof that admin markup did not change. If a
  wizard edit changes them, the admin UI changed; decide deliberately, and never `-u` blindly. If `REWARD_DEFINITIONS` or copy
  changes on purpose, update the snapshot and say so.
- **Global button style** (`app/globals.css` ~1007–1030) is un-layered CSS, so it beats Tailwind utilities: any bare `<button>`
  renders boxed. Override with Tailwind v3 important modifiers (`!border-0 !min-h-0`) — used for the wizard's schedule link
  and the notice action. The wizard's own "Cancel" (`secondaryButton`) is still boxed in the owner variant; harmless, listed
  for Phase 6's polish.
- **`useOwnerSheet` semantics** unchanged (Phase 1/4 handoffs). Opening Schedule from Rewards *stacks* depth; `closeSheet()`
  pops both. Always open Schedule/Rewards through `DashboardBody.openSchedule()` / `openRewards()` — they bump the `key` so a
  stale flow is never reused.
- **`SlideSteps` renders the outgoing pane live** for 120 ms, so `RewardsFlow` holds `wizardStep` in state (adjusted during
  render) while another pane is on screen. Do not read `step` directly for the wizard pane.
- **`react-hooks/refs` lint** forbids reading a ref during render. `submittedDefinitionId` is only read inside `onCreated`
  (an event-time callback), which is fine.
- **The wizard's Back button label is the reward's name** (`backLabel={definition.name}`), so in tests/browser
  `getByRole("button", { name: /Live Trivia Challenge/ })` matches both the definition tile and that Back button depending on
  the step.
- **`/owner/competitions` redirect returns 200**, not 307 (same reason as `/owner/schedule`; Phase 4 handoff §3).
- **jsdom test traps** (Phase 1 handoff): no `.tsx` tests; `createElement`; stub `matchMedia` for instant slides; jsdom prints
  "Not implemented: scrollTo" noise (harmless).
- Tooling: macOS `sed -i ''`; don't run `tsc` and `build` concurrently.

### 6. Build, run, test
```bash
npx tsc --noEmit            # clean
npm run lint                # clean
npm run test                # 2,798 pass / 13 skip / 0 fail (Phase 4 was 2,765; +33 new)
npm run build               # passes; /owner/dashboard, /owner/schedule, /owner/competitions prerender static
npm run test:pwa-contract   # 20/20 (globals.css not touched this phase)
```
`tests/api.owner.competitions.test.ts` and `tests/api.owner.schedule.test.ts` pass **unchanged**.
**Browser check recipe (no DB writes).** `/owner/*` is public to `proxy.ts`, so no cookie is needed. `npm run build &&
npx next start -p 3111`, then Playwright (`node_modules/playwright`, chromium installed) with a 390×844 mobile context and
`page.route("**/api/**", …)` mocking `/api/owner/venues`, `/schedule` (GET/POST), `/competitions` (GET),
`/competitions/:id` (GET counts, DELETE), `/rewards/context`, `/rewards` (POST). `pkill -f "next start -p 3111"` afterwards.
The script used this phase is scratch (not in the repo); rebuild it from this description.
**Verified in that browser:** dashboard → reward row → detail → End reward (counts, "voids 2 unredeemed prizes") → phone Back
steps end→detail→closed; Archive sends `DELETE …?mode=archive`, confirmation line, list refetch; empty state → wizard opens on
"Which reward?" at `?step=definition`; picking an unscheduled reward shows the block message and the link-styled **Schedule
Live Trivia**, which swaps to the Schedule sheet; saving a game shows "Now offer a reward for it →", which reopens the wizard;
Definition → Terms → Prize → Confirm each in the URL; phone Back from Terms returns to Definition; Create Reward POSTs, closes
and confirms; `/owner/competitions` lands on the open list; `?sheet=rewards&step=confirm` with no data is corrected to
`definition`; Ended rewards + winner; zero console errors beyond the harmless unmocked `/api/ads/slot`.
**Not verified:** a real phone (iOS keyboard covering the Custom target / Item name / Gift card amount inputs, safe areas,
the feel of the slide animations, landscape); the NFL Pick 'Em definition and the game-picker flag branch in the sheet (the
wizard code for them is untouched and the admin snapshots cover the default branch; only jsdom/browser runs of the Live
Trivia path were done); screen-reader announcements; real API behaviour (all mocked — server routes unchanged, their own tests
pass); two sheets animating at once during the Rewards→Schedule swap looked fine in Chromium, not on a device.

### 7. Cost
No new endpoints, tables, crons or third-party calls. After a create/remove the dashboard refetches one list
(`GET /api/owner/competitions`), as after a schedule save. The wizard's existing prefetch (one `GET /api/owner/rewards/context`
per reward definition, currently 2) now runs when the sheet reaches the Definition step rather than on a page load — the same
count per create attempt as the old page. The old page loaded venues again on entry; the sheet reuses the dashboard's, so a
partner who opens Rewards makes one fewer request. At tens of partner venues the difference is unmeasurable.

### 8. Open questions for Andrew
- None blocking Phase 6. (Carried from Phase 4, assumed yes: keep "Every day" in the Schedule Repeat step.)

### 9. Recommended first steps for Phase 6 (Sonnet 5.5 medium; Opus 5.5 high for the review)
1. Read plan Phase 6, this file §3–5, and the Phase 4 handoff §3 (the `DashboardNotice` stopgap you are replacing).
2. Discard-confirm: `OwnerSheet` already takes `closeGuard`. Both flows keep their answers inside the flow component (form
   state in `ScheduleGameFlow`, wizard state inside `CreateRewardWizard`), so a "has the partner entered anything?" signal needs
   either an `onDirtyChange` opt-in on the wizard or a wizard-agnostic rule (e.g. "past the Definition step"). Remember the phone
   Back gesture bypasses `closeGuard` (Phase 1 handoff §5) — decide whether to intercept `popstate`.
3. Toast + highlight ring: replace `DashboardNotice`'s success line in `app/owner/dashboard/page.tsx`; keep the amber advisory
   and the "Now offer a reward for it →" / "View Rewards" actions (they must survive the swap). New rows need an id to highlight:
   `ScheduleChange`/`RewardsChange` currently carry only `message`.
4. Copy, docs and checklist per plan Phase 6; add to the checklist the two Phase 5 unverified items (keyboard over the reward
   inputs; the Rewards→Schedule swap on a device).
5. Gates as in §6, then the final `/code-review high`, then `..._PHASE_6_HANDOFF.md` (or a final-status note), the plan's status
   line, commit by path.
