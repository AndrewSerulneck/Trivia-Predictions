# Phase 7i handoff: player screens — the held report sheet, the Current Events tab (2026-11-20)

## For Andrew

- **What changed:**
  - **Live report sheet:** when the next question starts while the "What's wrong?" sheet is open, it shrinks to a small
    "Finish report" button above the answer box (it no longer covers the answer or Submit). Tap it to reopen with your
    note still there. Tapping outside (or Escape) never throws a typed note away; only the X does. When the sheet
    closes, the cursor goes back to the answer box.
  - **Safer sheet:** a slow send can no longer close a newer sheet; the game ending clears any open report; a loading
    screen no longer loses a half-typed note.
  - **Current Events tab:** a player whose browser has no saved user id now gets the same tab list as everyone else
    (before, the tab stayed hidden for them).
  - **Cheaper:** a failed "is Current Events visible" read is remembered for 60 s instead of retried on every request.
- **Live?** No. Committed on `fix/second-review-remedials`, not pushed (7j ships).
- **Cost:** $0. One fewer database read per request when the read has failed; the quota route's two reads now run together.
- **Needs you:** nothing. **Not done:** the real-browser check of the Live page (see §6). Worth a quick look on a real
  Live game at phone width once deployed: open a report, let the next question start, finish the report.

## For the next agent

### 1. Next phase and scope
- **7j** (Sonnet 5.5 / medium): plan §4 "Phase 7j". Includes inherited 7h step 4 (sync the writer repo) and applying the
  three unapplied migrations (`20261119193552`, `20261120145222`, `20261120151403`) with Andrew's OK.
- Out of scope here: nothing in 7i touched migrations, workflows or the writer.

### 2. Starting state
- Branch `fix/second-review-remedials`; 7i committed on top of 7h (`ca3a9390`). Nothing pushed. No data touched.
- Untracked, not ours: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`,
  `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`.

### 3. Decisions
- D46 default taken (not asked): shrink to a "Finish report" bar, draft kept, outside tap never deletes text.
- **Outside tap / Escape on an untouched sheet still closes it**; with typed text (and not yet sent) it does nothing.
  The X is an explicit discard. The bar is an inline pill in the answering panel, not a fixed bar.
- **Game-end reset also clears `reportedKeys`** (the plan said "the held report").
- The hook holds the sent flag in the draft (`sent`) so a remount mid-"Sent." doesn't allow a second send.

### 4. Files
- `components/trivia/ReportQuestionSheet.tsx`: new `useHeldReport()` → `{ held, minimized, draft, setDraft, reportedKeys,
  open(key, target), onSent(key), close, dismiss, minimize, restore, clearAll }` (all `useCallback`, timer in a ref,
  cleared on unmount/close/open). `ReportSheet` is now controlled (`draft`, `onDraftChange`, `onSent`, `onClose`,
  `onDismiss`). `ReportQuestionSheet` props are `{ questionId; className? }` (Live branch deleted).
- `app/trivia/live/page.tsx`: uses the hook; effects minimize on a new `activeKey`, return focus to `answerInputRef`
  when the sheet leaves, `clearReport()` in the game-ended branch; "Finish report" button above the answer input.
- `components/trivia/TriviaGame.tsx`: Speed call updated to the new props.
- `components/trivia/TriviaAppFrame.tsx`: fetches `/api/trivia/quota` with no `userId` when none is stored.
- `app/api/trivia/quota/route.ts`: `Promise.all([hidden, quota])`; no user id → `quota: null`.
- `lib/speedTriviaCategoryVisibility.ts`: failed read cached 60 s (`FAILED_TTL_MS`), good read 5 min.
- Tests: `tests/components.report-question-sheet.test.ts` (rewritten around the hook), new
  `tests/components.trivia-app-frame-hidden-categories.test.ts`, `tests/api.speed-trivia-current-events.test.ts`.

### 5. Traps
- Lint rule `react-hooks/refs` forbids writing a ref during render: refs are synced in effects.
- The Live page has early returns for loading/no-state: the sheet unmounts there; the draft survives in the hook.
- Never `git checkout -- <file>`, `git stash`, `git reset`.

### 6. Verified
- `npx tsc --noEmit` clean; eslint clean on changed files; `npm run test`: 592 files passed, 1 skipped; 7,726 tests
  passed, 13 skipped (before the last lint-only tweaks; the report-sheet file re-run: 13 pass); `npm run build` succeeds.
- **NOT verified: the browser check** the plan asks for (Live page, scratchpad clone, mocked routes, 350 px). The Live
  page needs a large mocked engine state; the behaviour is covered by hook tests only. Also unverified: the
  "Finish report" bar's look.

### 7. Open questions
- None.

### 8. First steps for 7j
1. Stay on the branch; read plan §4 "Phase 7j" and 7h handoff §1 (writer-repo sync).
2. Optionally browser-check the Live report flow first, if Andrew wants it before shipping.
3. Model: Sonnet 5.5 / medium.
