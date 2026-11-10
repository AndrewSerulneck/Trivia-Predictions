# Phase B4 handoff: Game Settings UI (pick windows)

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Claude Opus 5.5 did Phase B4 on 2026-11-09 at medium effort, as the
plan's table names.

## For Andrew (plain English)

- **What changed:** Game Settings (partner and admin) has a new **Pick windows** card. For each sport you choose **Always open** or
  **Set days**, then pick the day and time picks open and close (for example College Football: opens Mon 12:00 AM, closes Wed
  11:59 PM). The **Save pick windows** button saves only the sports you changed and shows "Saved."
- **The Create Prize wizard** (Pick 'Em Prize, "When does it run?") shows one line when the prize's days don't match a sport's window:
  "College Football picks are open Mon 12:00 AM – Wed 11:59 PM only (Game Settings)." If the prize's first day's picks have already
  closed, it says so instead: "College Football picks for Sat, Nov 14 closed Wed 11:59 PM." It never blocks the prize.
- **Partner Manual:** a short "Pick Windows" entry under Other Games.
- **Is it live?** No. It's held for Phase R with A2–B3. Nothing was committed, deployed or applied. **Saving a window fails until
  Phase R applies migration `20261109223743_pickem_pick_windows.sql`** (the partner sees "Pick windows are not available yet.").
- **Cost:** none to speak of. Opening the Pick 'Em Prize wizard now reads one more small settings row.
- **Checked:** all 515 test files pass, typecheck and lint are clean. **Not checked in a browser** (see below).

## For the next agent (Phase R: review + release)

### 1. Next phase goal and scope
Phase R per plan §7: `/code-review` at high over A2–B4; fix findings; `npm run test`, `npx tsc --noEmit`, `npm run lint`,
`npm run build` (not at the same time as typecheck) and the SQL proofs (`npm run test:push-sql`, `npm run test:pickem-lines-sql`,
`npm run test:pickem-frozen-lines-sql`, `npm run test:security-definer-sql`). With Andrew's go-ahead only: `supabase db push` the three
migrations, then commit and deploy. Then add a CLAUDE.md Feature rules row, check the plan's Standing rules section, and update
`SYSTEM_CONTEXT.md` §7/§8. Also do the browser check below (still never done for B2–B4).

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new is committed, pushed or deployed.
- **Andrew, 2026-11-09: A2, A3 and C1 are held for Phase R**; C2, C3, B1, B2, B3 and B4 are treated the same way.
- Earlier uncommitted work: `…_PHASE_B3_HANDOFF.md` §2 and the handoffs it lists.
- **Uncommitted, B4:**
  - new: `lib/pickemPickWindowForm.ts`, `components/gameSettings/PickWindowsPanel.tsx`,
    `tests/lib.pickem-pick-window-form.test.ts` (9 tests), `tests/components.pick-windows-panel.test.ts` (5 tests), this handoff
  - modified: `app/owner/game-settings/page.tsx`, `components/admin/sections/GameSettingsSection.tsx` (both render the panel and
    carry `pickWindows` in their settings type), `lib/pickemPrizeWizard.ts` (`pickemPrizePickWindowNotice`),
    `lib/rewardDefinitions.ts` (`PICKEM_PRIZE_PARTNER_COPY.pickWindowOutside` / `.pickWindowClosed`), `lib/rewards.ts`
    (`RewardPickEmContext.pickWindows`, read in the Pick 'Em Prize context branch), `components/rewards/CreateRewardWizard.tsx`
    (the line on the When step), `lib/partnerManual.ts` ("Pick Windows" subsection)
  - plan doc: status line, "Built (B4)" note, B4 standing rule.
- **Data:** no reads or writes. **Phase R must `supabase db push`, with Andrew's go-ahead, before the deploy:** `20261109214742`
  (C3), `20261109223743` (B1), `20261110014242` (B3).

### 3. Decisions made (don't re-ask)
- **One card, eight sports**, College Football and NFL Pick 'Em first (`PICK_WINDOW_FORM_SPORTS`), then Basketball, MLB, NHL, Soccer,
  MMA, Tennis. `nfl` = NFL Pick 'Em (B1). One "Save pick windows" button for the card; it sends only sports whose answer differs
  from what's saved. "Set days" starts from the saved window, else Mon 12:00 AM – Wed 11:59 PM.
- **One shared component with a `tone`** (owner dark tokens / admin slate), not two copies. Owner uses `Dropdown`, admin
  `AdminSelect` for the day; time is `<input type="time">` (24-hour "HH:MM", the stored format).
- A window that opens and closes at the same moment shows "Opening and closing can't be the same time." and can't be saved (the
  server refuses it too).
- **Wizard line rules:** sports in scope = scope sports plus the sport of each scoped league. "Closed" wins: the instance covering a
  game at 11:59 PM on the prize's first day (on or after today) has already closed. Otherwise "outside" when any prize weekday is not a
  day the window is open on (a close at exactly 12:00 AM leaves that day out; a range prize looks at its first 7 days). NFL Pick 'Em
  prizes are a different wizard path and get no line (the Pick 'Em Prize scope never includes `nfl`).
- Card intro: "Games still lock at kickoff. With spreads, each game's line stays fixed once shown." (B3's rule, in a partner's words.)
  The existing scoring cards' "locked line at kickoff" wording was left as is (still true for bars without a window).

### 4. Files and how they fit
- `lib/pickemPickWindowForm.ts` (pure): `PICK_WINDOW_FORM_SPORTS`, `DEFAULT_PICK_WINDOW`, `pickWindowShown`,
  `pickWindowChangesFromDrafts`, `pickWindowDraftsError`, `describePickWindow` ("Mon 12:00 AM – Wed 11:59 PM").
- `components/gameSettings/PickWindowsPanel.tsx`: props `tone`, `endpoint`, `venueId`, `saved`, `disabled`, `onSaved(settings)`,
  `onUnauthorized(code)` (owner → `ownerAuthRecoveryPath`). Keyed by venue in both parents, so switching venue drops drafts.
- `lib/pickemPrizeWizard.ts`: `pickemPrizePickWindowNotice({ scope, prizeWindow, pickWindows, today, timeZone, nowMs })`.
- `lib/rewards.ts`: Pick 'Em Prize context reads `getVenueTimezone` and `getVenueGameSettings` in parallel; a failed settings read
  gives `{}` (no line).

### 5. Facts and traps
- Saving before migration `20261109223743` is applied returns 500 "Pick windows are not available yet." (B1's fallback) — expected.
- The Dropdown import pulls `useNativeBackHandler`; the panel test mocks `@/components/navigation/nativeBackButton`.
- zsh: `echo =====` fails ("= not found"); use another separator.

### 6. Build / run / test
- `npx vitest run tests/lib.pickem-pick-window-form.test.ts tests/components.pick-windows-panel.test.ts`
- Full `npm run test`: 515 files passed, 1 skipped; 6,733 tests passed, 13 skipped. `npx tsc --noEmit` clean (outside `.next/`).
  eslint clean on every B4 file.
- **Not verified in a browser.** In R, from a scratchpad clone with no `.env.local` and mocked routes (CLAUDE.md): at 350 px, the Pick
  windows card on `/owner/game-settings` (the Opens/Closes row must not overflow: label + day + time on one line) and in admin; the
  wizard line on the When step; plus the B2 handoff §6 list and the B3 handoff §6 check (a windowed spread bar's line stays put).

### 7. Open questions for Andrew
- None new. Phase R needs his go-ahead for the three migrations and the deploy.

### 8. Recommended first steps for Phase R (Opus 5.5, high effort, per the plan's table)
1. Read every Standing rule in the plan (A1–B4) and `…_PHASE_B3_HANDOFF.md` §2 for the full uncommitted file list.
2. Run `/code-review` at high over the working tree; fix findings; rerun the full checks and SQL proofs.
3. Do the browser check (§6). Then ask Andrew before `supabase db push` and the deploy.
