# Partner Dashboard App-Style Redesign — Phase 4 Handoff

**Plan:** `docs/partner-dashboard-app-redesign-plan.md`
**Phase finished:** Phase 4, the Schedule Live Games sheet. 2026-09-30, Sonnet 5.5 (high).
**Next phase:** Phase 5, the Offer Rewards sheet. Plan's model/effort: Sonnet 5.5, **high**.
**Earlier handoffs:** `..._PHASE_1_HANDOFF.md` (sheet / drawer / step / URL blocks), `..._PHASE_2_HANDOFF.md`
(bar, menu, compact shell), `..._PHASE_3_HANDOFF.md` (dashboard section cards). All still accurate.

---

## For Andrew (plain English)

**What changed.** Scheduling a live game now happens on the dashboard, in a panel that slides up from the
bottom. No more separate Schedule page.
- Tap the **+** (or the big dashed card) on **Live Games**. One question per screen: **When does it start?**
  (date/time, number of rounds, a live "Ends around…" line, and a small "Change timezone" button) →
  **Does it repeat?** (Just once / Every day / Every week on… with day buttons) → **Review & name**
  (the name is pre-filled with "Live Trivia"; every line has a **Change** button) → **Schedule game**.
- The panel closes, the list refreshes, and a short blue confirmation line appears above the cards
  ("Live Trivia scheduled: Oct 9, 8:00 PM"). It stays until dismissed with ×.
- Tap an existing game to see its details and **Edit game** or **Cancel game**. Cancel asks
  "Are you sure?" first. If cancelling (or an edit) affects a reward tied to that game, an amber note says so
  with a **View Rewards** button — the same warning the old page showed.
- **See all** shows every upcoming game; **Past games** shows finished ones (read-only).
- The phone's Back gesture steps back one question, and closes the panel from the first one. It never
  drops you off the dashboard.
- The old address `/owner/schedule` now opens the dashboard with this panel already up, so old bookmarks and the
  "Schedule Live Trivia" link on the Rewards page still work.

**Is it live?** Committed locally, **not pushed, not deployed.** Phases 1–3 were committed first as `c182c06`.

**What's left.** Phase 5 (the rewards panel; it still says "Coming soon"), then Phase 6 (polish, "Discard this game?"
prompt, toast, copy updates, a phone checklist for you).

**What I need from you.**
1. Once deployed, try it on your phone: schedule, edit, cancel, the Back gesture, the date picker, and typing
   in the name box with the keyboard up. I checked a phone-sized browser with mocked data only.
2. A design call, optional: I kept **"Every day"** in the Repeat step. The plan's wording only lists "Just once" and
   "Every week on…", but the old form offered Daily and dropping it would remove a feature. Say the word if you
   want it gone.
3. `data/sports-bingo/{mlb,nfl}-star-index.json` are still modified in git and are **not** part of this work.
   I did not commit them.

---

## For the next agent

### 1. Phase 5 goal and scope
Plan §4f + Phase 5: host `CreateRewardWizard variant="owner"` inside the dashboard's **Rewards** `OwnerSheet`;
add two **optional** wizard props — `animateSteps?: boolean` (default false; horizontal step transitions) and
`onRequestSchedule?: () => void` (the "Schedule Live Trivia" link calls it instead of following
`scheduleLinkHref`); build a reward **detail** screen (terms, top-3 progress as today, **End reward** via the
existing `RemoveRewardDialog` logic — archive vs delete, prize counts, same copy) and a **History** screen (ended
rewards); wire the Reward → Schedule → Reward handoff; replace `app/owner/competitions/page.tsx` with
`redirect("/owner/dashboard?sheet=rewards")` (§4h). `tests/api.owner.competitions.test.ts` must stay green
unchanged; add a render test that the admin variant with no new props renders the same step markup as before
(no transition wrapper).
**Out of scope:** discard-confirm, ☰ pulse, toast component, empty-state copy review (Phase 6); server APIs;
`proxy.ts`; migrations; `vercel.json`; forking the wizard; the admin Rewards UI beyond the two opt-in props.

### 2. Starting state
- Branch `main`. HEAD after this phase = the Phase 4 commit (see `git log -1`); its parent is `c182c06`
  (Phases 1–3). Nothing is pushed or deployed.
- `git status` still shows `data/sports-bingo/{mlb,nfl}-star-index.json` modified — **not from this plan;
  never stage them** with `git add -A`. Stage files by path.
- No data, DB, env, Stripe or Vercel changes in any phase. No backups or undo logs exist or are needed.

### 3. Decisions (do not re-ask)
Plan §3 answers all stand (Andrew: "go with all of your recommended answers"; Phase 0 skipped).
Phase 4 implementation choices, and why:
- **Title is pre-filled and can't block saving.** Form state holds `title: string | null` (`null` = untouched);
  the saved title is `title.trim() || GAME_LABELS[gameType]` (`effectiveTitle`). The old form refused an empty title.
- **"Every day" kept** in the Repeat step (see Andrew's note). Options: Just once / Every day / Every week on….
  Recurrence still only exists for Live Trivia (`supportsRecurrence`); weekly still needs ≥ 1 day.
- **Timezone** defaults to the browser's zone if it is in `TIMEZONES`, else `America/New_York`
  (`pickDefaultTimezone`). Editing keeps the schedule's own zone (added to the dropdown if not in the list).
- **Game step is skipped** when one game can be scheduled (true today: `NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT`
  is on) and **always when editing**. **Repeat is skipped** for any game but Live Trivia. Pure `scheduleSteps()`.
- **Where History lives:** a quiet "Past games" button at the bottom of the first screen (Game, or When when Game
  is skipped) and on the "Upcoming games" list. Not on the dashboard card itself.
- **Edit = the same Review screen**, reached from the game's detail screen; every row has a **Change** button;
  Change → step → **Done** pops back to Review. Back from an edit's Review goes to the game's detail screen.
- **Cancel game** uses an in-sheet confirmation (not `window.confirm`), same wording as before.
- **Confirmation UI is a stopgap:** `DashboardNotice` (dismissible line above the cards). Phase 6 owns the real toast
  and the 2-second highlight ring; replace or reuse `DashboardNotice` there.
- **Reward advisory** (`rewardNotice` from POST/PATCH/DELETE) shows as an amber `DashboardNotice` with **View
  Rewards** (opens the Rewards sheet). The server builds the text (`describeCascadeReport`); never re-word it.
- **After a save or cancel** the dashboard refetches the games list once (`setGamesAttempt`), keeping current rows
  on screen until new ones arrive. It does not show the skeleton.
- **Redirect:** `/owner/schedule` is a server-component `redirect()`. It returns HTTP **200** (page + meta refresh),
  not 307: the root layout streams its shell first, so Next can only redirect through the RSC payload. Browsers
  follow it on hydration (verified). `force-dynamic` does not help (tried and reverted); a true 307 would need
  `next.config.ts` `redirects()` — not done, not needed.

### 4. Files and how they fit
| File | Role |
|---|---|
| `lib/ownerScheduleForm.ts` | **All pure schedule logic**, moved out of the old page: `durationMinutesFor`, `roundsFromWindowMinutesFor`, `TIMEZONES`, `pickDefaultTimezone`, `detectBrowserTimeZone`, `RECURRING_OPTIONS`, `scheduleGameOptions(continuousDefault)`, `scheduleSteps({gameOptions, gameType, isEditing})`, `resolveScheduleStep(...)`, `SCHEDULE_SLIDE_ORDER`, `ScheduleFormState`, `initialScheduleFormState`, `scheduleFormStateFromSchedule`, `effectiveTitle`, `repeatError`, `repeatSummary`, `endsAtLocalValue/Label`, `formatLocalDateTime`, and **`buildScheduleRequest({venueId, editingId, form})`** → `{ok, method, url, body, startIso}` or `{ok:false, error}` (POST or PATCH body identical to the old `handleSave`). |
| `components/owner/schedule/ScheduleGameFlow.tsx` | The Schedule sheet. Props: `venueId`, `nav` (the `useOwnerSheet()` result), `games` (`SectionLoad<OwnerSchedule>`), `nowMs`, `initialSchedule`, `onChanged({message, rewardNotice})`. Holds all form state, renders `OwnerSheet` + `SlideSteps` + `WizardFooter`, does the POST/PATCH/DELETE, then `onChanged` + `nav.closeSheet()`. |
| `components/owner/schedule/ScheduleStepScreens.tsx` | Presentational screens: `GameStep`, `WhenStep`, `RepeatStep`, `ReviewStep`, `AllGamesScreen`, `HistoryScreen`, `GameDetailScreen`. |
| `components/owner/schedule/ScheduleGameRow.tsx` | One game row (date chip, title, times, pills). Used by the dashboard card and the sheet lists. |
| `components/owner/dashboard/DashboardNotice.tsx` | Dismissible confirmation / advisory line. |
| `app/owner/dashboard/page.tsx` | `DashboardBody` now mounts `<ScheduleGameFlow key={scheduleSession} …/>` (a **new key on every open** so a new game never inherits old answers), `openSchedule(target?: OwnerSchedule \| "all")`, `handleScheduleChanged`, the `notice` state. Rewards is still the placeholder `OwnerSheet` (`open={sheet.sheet === "rewards"}`). |
| `app/owner/schedule/page.tsx` | Now just the redirect. |
| `components/owner/dashboard/LiveGamesSection.tsx` | Uses `ScheduleGameRow`. |
| Tests (new) | `tests/lib.owner-schedule-form.test.ts` (41: skip rules, step resolution, slide directions, form state, and the **oracle**: a verbatim copy of the old `handleSave` body-building, compared key-for-key and in order across 13 cases incl. DST days and edits), `tests/components.owner-schedule-flow.test.ts` (10 jsdom tests of the whole sheet against a fake history: create, server error, Change/Done, deep-link fallbacks, PATCH, DELETE with confirm, lists, History). `tests/owner-dashboard-contract.test.ts` +2 (redirect page is a server component; dashboard mounts the flow with a per-open key). |

**How Phase 5 should mirror this** (it is the pattern to copy):
- A `RewardsSheet`/`RewardFlow` component takes `nav`, the rewards `SectionLoad`, and `onChanged`; it renders its own
  `OwnerSheet` (it needs the footer slot) and is mounted by `DashboardBody` with a `key` that bumps per open.
- Use `SlideSteps` with a slide-order list that ranks **every** screen (see `SCHEDULE_SLIDE_ORDER` for why).
- Rewards has no `?step=` yet: the wizard's own steps (`venue → definition → terms → prize → confirm`) are internal
  state. Decide whether to drive them from the URL (Back-gesture parity, as Schedule does) or keep them internal and
  only put "detail"/"history" in the URL. If internal, the phone Back gesture will close the whole sheet instead of
  stepping back — the plan (§4d) wants step-back, so prefer wiring `useOwnerSheet().goToStep/goBack`.
- The `venue` step never shows for owners (one venue, `defaultVenueId`).
- `DashboardBody.rewardsAttempt` is the refetch counter for the rewards list (bump it in `onChanged`, like games).

### 5. Facts and traps
- **`useOwnerSheet` semantics** (Phase 1 handoff, still true): every forward move is a history entry; `goBack(prev)`
  pops history when the sheet pushed the previous entry, else rewrites in place; `closeSheet()` pops all entries
  asynchronously. `openSheet()` from an already-open sheet *stacks* depth (Rewards → Schedule handoff): closing then
  pops both. Simplest handoff: `nav.closeSheet()` then open the other sheet in `onExited`, or accept the stacked depth.
- **`ScheduleGameFlow` keys**: to open Schedule from Phase 5 code (the `onRequestSchedule` handoff and "Now offer a
  reward for it →"), call `DashboardBody.openSchedule()` — it bumps the key. Calling `nav.openSheet("schedule")`
  directly would reuse a stale flow.
- **URL step correction**: the flow calls `replaceCurrentStep(current)` in an effect when `?step=` is stale (unknown,
  skipped, or its data was lost on reload). A `null` step is left alone (means "first screen"). Copy this if Rewards
  gets URL steps.
- **`inert` / focus**: `SlideSteps` focuses the new step's `[data-step-heading]` after each change, so every screen
  needs one (`StepHeading` in `ScheduleStepScreens.tsx`). The wizard's steps will need the same or focus will jump.
- **Global button style**: bare `<button>`s in this app render with a visible outline/box. Text-link-style buttons
  look boxed (fine for standalone "Past games"; I moved "Change timezone" onto its own row for that reason).
- **The sheet's `title` changes per screen** (`Schedule a live game` / `Edit game` / `Live Games`) and the screen
  heading is separate; the h2 title and the focused h3 should not say the same words.
- **jsdom test traps** (Phase 1 handoff): no `.tsx` tests; `createElement`; stub `matchMedia` for instant slides;
  `react-hooks/refs` lint forbids reading a ref during render — even in a test harness (use state).
- **Vitest + env flags**: `isContinuousDefaultEnabled()` is read at module load. `vi.hoisted(() => { process.env…=… })`
  before the import is the way to set it (not `resetModules`, which duplicates React).
- Tooling: macOS `sed -i ''`; don't run `tsc` and `build` concurrently; `tests/api.owner.schedule.test.ts` passes
  unchanged (31 tests).

### 6. Build, run, test
```bash
npx tsc --noEmit     # clean
npm run lint         # clean
npm run test         # 2,765 pass / 13 skip / 0 fail (Phase 3 was 2,712; +53 new)
npm run build        # passes; /owner/dashboard and /owner/schedule prerender static
npm run test:pwa-contract   # 20/20
```
**Browser check recipe (used this phase; no DB writes).** `/owner/*` is public to `proxy.ts`, so no cookie is needed.
`npm run build && npx next start -p 3111`, then Playwright (`node_modules/playwright`, chromium installed) with a
390×844 mobile context and `page.route("**/api/**", …)` mocking `/api/owner/venues`, `/api/owner/schedule`
(GET/POST), `/api/owner/schedule/:id` (DELETE) and `/api/owner/competitions`; unmocked `/api/ads/slot` 404s (the one
harmless console error). Kill the server afterwards (`pkill -f "next start -p 3111"`).
**Verified in that browser:** create (When → Repeat → Review → POST body with the right `venueId`, `title`,
`endTime`, `timezone`, `gameType`, `rounds`, `recurringType`, `recurringDays`), confirmation line, list refetch,
detail → Edit → Review changes → Back → detail, Cancel with confirm → DELETE → amber reward note, See all, Past
games (and its Back), timezone dropdown, `/owner/schedule` redirect, Back from a deep-linked sheet lands on the plain
dashboard, `?step=review` with nothing filled in corrects to `when`, phone Back steps back / forward / closes.
**Not verified:** a real phone (iOS `datetime-local`, on-screen keyboard covering the Name box, safe areas, the
slide animations' feel, landscape); the **Game step in a browser** (the flag hides Category Blitz here — covered by
unit + jsdom tests only); screen-reader announcements; behaviour against the real API (all mocked — the server
routes are unchanged and their own tests pass).

### 7. Cost
No new endpoints, tables, crons or third-party calls. One extra `GET /api/owner/schedule` after each save or cancel
(the dashboard's list refresh). Opening the sheet itself makes no requests (it reuses the dashboard's list). At tens
of partner venues the difference is unmeasurable.

### 8. Open questions for Andrew
- Keep "Every day" in Repeat? (Assumed yes.)
- Nothing blocking Phase 5.

### 9. Recommended first steps for Phase 5 (Sonnet 5.5, high)
1. Read plan §4f + Phase 5, this file §4–5, the Phase 1 handoff's "How a Phase 3–5 host wires a flow sheet".
2. Read `components/rewards/CreateRewardWizard.tsx` (1,211 lines, **shared with admin** — do not fork) and
   `app/owner/competitions/page.tsx` (`RemoveRewardDialog`, `CompetitionList`, `fetchRewardContext`, `submitReward`).
   Move `fetchRewardContext`/`submitReward`/`RemoveRewardDialog` into shared modules or the new flow rather than
   duplicating them; keep the old page working until the redirect replaces it.
3. Add `animateSteps` / `onRequestSchedule` to the wizard as optional props; write the admin-unchanged render test
   *first* (snapshot today's step markup for the admin variant), then implement.
4. Build the Rewards sheet + detail + History, thread the tapped reward from `RewardsSection`'s `onOpen(item?)`
   (currently discards it) through `DashboardBody`, wire `rewardsAttempt` refetch, and the schedule handoff via
   `openSchedule()`.
5. Replace `app/owner/competitions/page.tsx` with the redirect; update `tests/owner-dashboard-contract.test.ts`
   (the "keeps the list helpers in lib/" test reads that page) and add its own redirect assertion.
6. Gates as in §6, a mocked-API browser pass as in §6, then `..._PHASE_5_HANDOFF.md`, the plan's status line, commit
   by path.
