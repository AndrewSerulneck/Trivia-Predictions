# Partner Dashboard App-Style Redesign — Phase 3 Handoff

**Plan:** `docs/partner-dashboard-app-redesign-plan.md`
**Phase finished:** Phase 3, the dashboard body (two section cards). 2026-09-30, Sonnet 5.5.
**Next phase:** Phase 4, the Schedule Live Games sheet. Plan's model/effort: Sonnet 5.5, **high**.
**Earlier handoffs:** `..._PHASE_1_HANDOFF.md` (sheet/drawer/step/URL building blocks) and `..._PHASE_2_HANDOFF.md` (bar, menu, compact shell). Both still accurate.

---

## For Andrew (plain English)

**What changed.** The six tiles on the Partner Dashboard are gone. In their place are two cards:
**Live Games** and **Offer Rewards**.
- With nothing scheduled, each card is a big dashed "tap to add" box with a **+**, using the wording
  from the plan ("Schedule a live game — Pick a game and a time. Your whole room plays together." and
  "Offer your guests a reward — Give a prize to top players…").
- With data, each card lists up to 3 upcoming games / active rewards, then "See all (N)" if there are
  more, then a dashed "+ Schedule another game" / "+ Offer another reward" row.
- While loading you see grey placeholder cards; if a list fails to load the card shows the error with a **Retry** button.
- Switching venue (top bar, only with 2+ venues) reloads both lists.
- Tapping a **+**, a row, or "See all" opens a slide-up panel that only says "Coming soon" for now. The real
  scheduling and reward flows arrive in Phases 4 and 5. The phone's Back gesture closes the panel.

**Is it live?** No. Nothing from Phases 1–3 is committed, pushed or deployed.

**What's left.** Phases 4–6 (scheduling flow, rewards flow, polish/review). The old Schedule and Rewards
pages still work unchanged until Phases 4/5 redirect them.

**What I need from you.**
1. Say whether to commit Phases 1–3 (I haven't, you haven't asked).
2. Once deployed, look at the dashboard on your phone (empty and with data if you can): cards, Retry, tapping
   a **+**, Back gesture closing the placeholder panel. Headless tests can't judge the look.
3. Note: the 4 "star index is stale" Bingo tests that failed in Phase 2 **passed** in this phase's full run
   (2,712 pass / 13 skip / 0 fail). `data/sports-bingo/{mlb,nfl}-star-index.json` show as modified in git
   (not by me) — someone/something refreshed them. Not part of this plan; don't commit them with it unless you mean to.

---

## For the next agent

### 1. Phase 4 goal and scope
Plan §4e + Phase 4: extract today's single `ScheduleForm` (in `app/owner/schedule/page.tsx`) into
`components/owner/schedule/ScheduleGameFlow.tsx` as steps Game → When → Repeat → Review & name, hosted in the
dashboard's Schedule `OwnerSheet` using `SlideSteps` + `useOwnerSheet` + `WizardFooter`. Step sequence is a pure
function `scheduleSteps({ gameOptions, gameType })`. Build the edit/cancel detail screen and the "History" (past
games) screen. Wire the success return (§4d: sheet slides down, list refetches, new row highlighted 2s, toast —
highlight/toast polish is formally Phase 6, but the refetch is needed now). Replace `app/owner/schedule/page.tsx`
with a server-component `redirect("/owner/dashboard?sheet=schedule")` (§4h). Keep all duration/timezone/recurrence
maths through the existing helpers; submitted bodies must match the old form's byte-for-byte in meaning; add the
equivalence test. `tests/api.owner.schedule.test.ts` must stay green unchanged.
**Out of scope:** the rewards flow (Phase 5), discard-confirm / ☰ pulse / toast component (Phase 6), server APIs,
`proxy.ts`, migrations, `vercel.json`, the `CreateRewardWizard`.

### 2. Starting state
- Branch `main`, HEAD `2694f99`. **Nothing from Phases 1–3 is committed.** Ask Andrew first; if yes commit
  together (e.g. "Partner Dashboard redesign Phases 1–3: sheet/drawer blocks, app bar, compact shell, dashboard sections").
- No data, DB, env, Stripe or Vercel changes. No backups needed.
- `git status` also shows `data/sports-bingo/{mlb,nfl}-star-index.json` modified — **not mine, do not stage them**.

### 3. Decisions (do not re-ask)
Plan §3 recommended answers all stand. Phase 3 implementation choices:
- **Section titles:** "Live Games" and "Offer Rewards" (matches the Partner Manual's "Tap Offer Rewards").
- **Home list = upcoming games / active rewards only, max 3** (`DASHBOARD_LIST_LIMIT`), "See all (N)" appears only
  when there are more than 3. Past games / ended rewards are intentionally NOT on the dashboard (decision 4: they
  belong behind a "History" link inside each sheet — Phases 4/5 build those).
- **Header round + button is hidden while loading/error/empty** (the empty card is itself the add button); it
  shows only when the list has items. The bottom dashed row is the second add affordance.
- **Rows are buttons** (not links) that call `onOpen(item?)`. Today every handler just opens the placeholder sheet:
  `sheet.openSheet("schedule" | "rewards")`. Phase 4/5 should thread the tapped item through (see §4).
- **Venue switching remounts `DashboardBody`** via `key={selectedVenueId}`, so state resets to "loading" and a late
  response for the previous venue can't land (the effects also use a `cancelled` flag). Do not replace with a ref —
  the React 19 lint rules (`react-hooks/refs`, `set-state-in-effect`, `purity`) reject ref-in-render, sync setState
  in effects, and `Date.now()` in render (that's why `gamesAsOfMs` is stamped in the fetch callback).
- Retry = set that section to loading + bump an `attempt` counter that the section's effect depends on.
- Old pages keep working and now import the shared helpers; no behaviour change there.

### 4. Files and how they fit
| File | Role |
|---|---|
| `app/owner/dashboard/page.tsx` | `OwnerDashboardPage` loads `/api/owner/venues` once, renders `barCenter` switcher (unchanged) and, inside `<Suspense>`, `<DashboardBody key={venueId} venueId>`. `DashboardBody` calls `useOwnerSheet()`, runs two parallel effects (`/api/owner/schedule?venueId=`, `/api/owner/competitions?venueId=`, both `cache: "no-store"`, 401 → `ownerAuthRecoveryPath`), renders both sections and ONE placeholder `<OwnerSheet open={sheet.sheet !== null} title=… >Coming soon.</OwnerSheet>` (title from `displaySheet` so it survives the slide-down). **Phase 4/5 replace that placeholder body.** `fetchList<T>()` is a small local helper returning `{ok,items}|{ok:false,message}|null`(null = redirecting). |
| `components/owner/dashboard/DashboardSectionCard.tsx` | Presentational pieces: `DashboardSectionCard` (header + round + button), `SectionSkeleton`, `SectionError` (Retry), `SectionEmpty` (whole-card dashed button), `SectionAddRow`, `SectionSeeAll`. |
| `components/owner/dashboard/LiveGamesSection.tsx` | Props `load: SectionLoad<OwnerSchedule>`, `nowMs`, `onAdd`, `onOpen(schedule?)`, `onRetry`. Also exports `SectionLoad<T>` and `DASHBOARD_LIST_LIMIT`. |
| `components/owner/dashboard/RewardsSection.tsx` | Same shape for `OwnerCompetition`. |
| `lib/ownerScheduleDisplay.ts` | `GAME_LABELS`, `GAME_PILL_STYLES`, `WEEKDAY_OPTIONS`, `displayWindow`, `recurrenceLabel`, `formatScheduleTime`, `dateChip`, `splitSchedules(schedules, nowMs)` → `{upcoming, past}`. |
| `lib/ownerRewardDisplay.ts` | `OwnerCompetition` type, `glyphForCompetition`, `formatDateLabel`, `formatTimeLabel`, `rewardTermsText(c)` (null for pre-Rewards competitions), `splitCompetitions` → `{active, ended}`. |
| `app/owner/schedule/page.tsx`, `app/owner/competitions/page.tsx` | Now import the helpers above instead of defining them. **Still defined locally in the schedule page (not yet moved, Phase 4 will own them):** `durationMinutesFor`, `roundsFromWindowMinutesFor`, `TIMEZONES`, `RECURRING_OPTIONS`, `ALL_GAME_TYPE_OPTIONS`/`GAME_TYPE_OPTIONS`, `ScheduleList`, `ScheduleForm`. In the competitions page: `RemoveRewardDialog`, `CompetitionList`. |
| Tests (new) | `tests/lib.owner-schedule-display.test.ts` (11), `tests/lib.owner-reward-display.test.ts` (9), `tests/owner-dashboard-contract.test.ts` (5, static: no tiles, Suspense wraps `DashboardBody`, parallel endpoints + `key`, helpers live in `lib/`, empty-state copy). |

### 5. Facts and traps
- **Phase 4 needs a list-refresh hook.** The dashboard's effects refetch only on venue change / Retry. After a
  save, Phase 4 must trigger the games refetch — simplest is lifting `setGamesAttempt((n)=>n+1)` into an
  `onChanged` callback passed to the flow. Consider whether the sheet should show its own copy of the list
  (for edit/History) — reuse `games.items` from `DashboardBody` state rather than refetching (cost rule).
  History needs the **past** list: `splitSchedules(items, nowMs).past`.
- `nowMs` for bucketing is `gamesAsOfMs` (time the list arrived), so a dashboard left open overnight won't
  re-bucket until refetch. Acceptable; say so if Phase 6 cares.
- The reward terms sentence is first-person ("I want to make 3 of these rewards available …") because that is what
  the old list showed and `renderTermsSentence` produces it. Phase 6 copy review may want a guest/partner-neutral line.
- The `GAME_TYPE_OPTIONS` constant is evaluated at module load with `isContinuousDefaultEnabled()` (a
  `NEXT_PUBLIC_` flag) — when Category Blitz is hidden only Live Trivia remains, which is what triggers the
  "skip Game step" rule in §4e.
- `OwnerSchedule` has `recurringDays` as lowercase `sun..sat`; weekly "Live Trivia only" recurrence rule lives in
  `ScheduleForm` (`supportsRecurrence = gameType === "live_trivia"`). Preserve it, including "weekly needs ≥1 day".
- The old form's title was required (`!title.trim()`), sent as-is; §4e says prefill with the game name so it can't block.
- Phase 1/2 traps still apply: `useSearchParams` needs `<Suspense>` (already done on the dashboard); step components
  remount on change so keep form state in the host; the phone Back gesture bypasses `closeGuard`; the drawer/sheets
  portal to `document.body`.
- Tooling: macOS `sed -i` needs `''`. Don't run `tsc` and `build` concurrently.

### 6. Build, run, test
```bash
npx tsc --noEmit    # clean
npm run lint        # clean
npm run test        # 2,712 pass / 13 skip / 0 fail
npm run build       # passes; /owner/dashboard prerendered static
```
**Verified:** types, lint, full test run, production build, the three new test files.
**Not verified:** anything in a real browser — section rendering with real data, skeleton→ready transitions, Retry,
venue switch reload, placeholder sheet open/close and Back gesture, `+` button sizing. No render test for the
section components (they're presentational; logic is in the tested `lib/` helpers). Phase 4 should drive the
dashboard in a real browser once the flow exists (`verify` skill; needs an owner session cookie — see
`lib/ownerAuth*`/`tests` for how owner cookies are minted).

### 7. Open questions for Andrew
- Commit Phases 1–3 now?
- Nothing blocking.

### 8. Recommended first steps for Phase 4 (Sonnet 5.5, high)
1. Read plan §4d, §4e, Phase 4; Phase 1 handoff (SlideSteps / `useOwnerSheet` semantics: `goToStep`, `goBack`,
   `replaceCurrentStep`, `resolveStep`); this file; `app/owner/schedule/page.tsx` `ScheduleForm` (lines ≈ 300–600 now).
2. Write `scheduleSteps()` + tests first; then the equivalence test that pins the POST/PATCH bodies against the
   old `handleSave` (copy its maths into the test as the oracle before deleting the old form).
3. Build `ScheduleGameFlow`, wire it into `DashboardBody`'s sheet (replace the "Coming soon" body for `sheet==="schedule"`),
   thread the tapped schedule (edit/cancel) and a games-refetch callback, add History.
4. Replace `app/owner/schedule/page.tsx` with the redirect; update `tests/owner-dashboard-contract.test.ts`
   (its "helpers not in pages" assertion reads the schedule page — adjust it once the page is a redirect).
5. Gates as in §6; then write `..._PHASE_4_HANDOFF.md` and update the plan's status line.
