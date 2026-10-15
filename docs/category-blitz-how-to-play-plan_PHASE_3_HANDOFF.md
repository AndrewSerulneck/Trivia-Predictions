# Category Blitz How-to-Play Plan — Phase 3 Handoff (Rules popup, footer removal, lobby-flash fix)

**Date:** 2026-10-14 · **Plan:** `docs/category-blitz-how-to-play-plan.md` · **Phase 3 status:** built and tested
locally. **Not committed, not pushed, not deployed.** Phase 1 = `b1030fd`. Phase 2 (and its handoff) is still uncommitted.

## For Andrew (plain English)

- **"How to play" button.** It sits right under the "Next round starts in" countdown, on the results screen, in the
  reveal's compact countdown, and on the short wait screen before a round. Tapping it slides up a dark popup
  (same look as the Partner Manual) with the 7 rules as a numbered list. Android Back closes it.
- **The "Answers save automatically — graded when the timer runs out" line is gone.** The red error + Retry bar
  stays.
- **No more old lobby flash.** After you tap the game, a Hightop logo loader shows until the server has answered.
  The old lobby and rules list only appear when the server says the venue is on the scheduled engine.
- **FAQ updated** (every 5th round is Majority Rules; alliteration bonus).
- Not yet seen on a real phone. Nothing is live; committing/pushing is your call.

## For the next agent

### 1. Next phase
**Phase 4 — Slightly bigger letter badge** (plan §5 Phase 4, **re-scoped 2026-10-14 by Andrew: no full-width
band** — keep the badge top-left, make it slightly bigger, leave keyboard-open chrome untouched). Model: **Claude Opus 5.5, effort medium.** Read
`docs/category-blitz-mobile-keyboard-handoff.md` first. Out of scope: sleep-when-idle (Phase 5), the empty-round
cleanup (Phase 6, only after Phase 5 is deployed), release record (Phase 7).

### 2. Starting state
- Branch `category-blitz-scoring-cadence`. Only `b1030fd` is committed. **Phases 2 and 3 are uncommitted.**
- Phase 3 files — new: `components/category-blitz/CategoryBlitzRulesSheet.tsx`,
  `tests/category-blitz-rules-popup-contract.test.ts`, this handoff. Modified: `components/category-blitz/CategoryBlitzGame.tsx`,
  `components/category-blitz/IntermissionStatus.tsx`, `lib/categoryBlitzRealtime.ts`, `app/faqs/page.tsx`,
  `tests/native-back-review-fixes.test.ts`, the plan's status line.
- `components/venue/venueHubShared.tsx` and the Speed Trivia files are Andrew's unrelated work — don't stage them. Stage by path;
  never `git add -A` or `git checkout --`.
- No data touched; no production access.

### 3. Decisions (don't re-ask)
- Popup = `OwnerSheet size="card"` dark tone, unmodified. Local `useState` open, no URL mirroring.
- Rules text is read from `CATEGORY_BLITZ_RULES` (`lib/categoryBlitzHowToPlay.ts`); not restated anywhere. The FAQ
  paragraph is hand-written prose (didn't quote the array — kept it short).
- Loader: `HightopLoader variant="plain" size="lg" delayMs={0} showLabel` (the `showLabel` is required by
  `tests/owner-loader-contract.test.ts`). `delayMs={0}` because the hydrate gate is already ~one tick.

### 4. What changed
- `lib/categoryBlitzRealtime.ts`: `useCategoryBlitzSession` returns new `hasLoaded`, set `true` in `loadSession`
  right after a successful (`json.ok`) response, including a "no session" answer. It is never reset.
- `CategoryBlitzGame.tsx`:
  - phase `idle`/`lobby`: loader while `!hasLoaded && !error`; the continuous wait screen / `LobbyScreen` branch
    renders only when `hasLoaded || error` (so a failing network still shows the old UI + error rather than a
    forever-spinner).
  - `ContinuousWaitScreen` gets the button + sheet.
  - The "Answers save automatically" footer branch deleted (only the error/Retry footer remains).
- `IntermissionStatus.tsx`: button + sheet in the live countdown branch only (not the "Waiting"/"Loading categories…" branches).
- `CategoryBlitzRulesSheet.tsx` exports `CategoryBlitzRulesSheet` and `HowToPlayButton` (`tp-player-hit-target` = 44px).
- `tests/native-back-review-fixes.test.ts`: added `useModalOverlay.ts` to the audited list (it owns the Back registration for every `OwnerSheet`).

### 5. Facts and traps
- Back handling comes for free from `useModalOverlay` (`useNativeBackHandler("overlay", open ? requestClose : null)`).
- `IntermissionStatus` renders inside `RevealSequence` (compact) — the portal-based sheet escapes any transform/clip there.
- `[data-category-blitz-footer]` still exists on the error footer (the layout-debug code at `CategoryBlitzGame.tsx` ~L334 reads it).
  `scripts/verify-category-blitz-mobile-shell.cjs` doesn't reference the removed footer text.
- After the first response, `hasLoaded` never goes false again, so later transient `session = null` states can still show the lobby —
  that's the pre-existing self-heal path, not the first-open flash.
- `lib/categoryBlitz*` files trip plain `grep` as binary; use `grep -a`.

### 6. Build, run, test
- `npx tsc --noEmit` clean; eslint clean on changed files; `npx vitest run`: 372 files pass, **4,406 pass / 13 skip / 0 fail**.
- **Not verified:** `npm run build` (not run this phase), a real browser/phone, the Android Back behaviour, and the actual
  absence of a lobby flash on a live load (only a static contract test covers it). Browser-testing must use a scratchpad clone
  (`npx next dev --webpack -p 3123`, no `.env.local`; see Phase 2 handoff §5) — dev shares the production DB and `GET /api/category-blitz/sessions` creates real rounds.

### 7. Open questions for Andrew
- Commit Phases 2 + 3 now? (Branch has only Phase 1 committed.)
- Plan §7: optional daily prune of empty rounds — still unasked.

### 8. First steps for Phase 4
1. `git status`; confirm branch and uncommitted Phase 2/3 files; ask about committing.
2. Read the plan §5 Phase 4 and `docs/category-blitz-mobile-keyboard-handoff.md`.
3. The letter badge is in `CategoryBlitzGame.tsx` `AnsweringScreen` (search `CB_LETTER_BADGE_LAYOUT_ID`); keep the `layoutId` morph and `compactChrome` small badge. Change only the keyboard-closed size in `letterBadgeClassName` / the glyph class.
4. Run `scripts/verify-category-blitz-mobile-shell.cjs` afterwards.
