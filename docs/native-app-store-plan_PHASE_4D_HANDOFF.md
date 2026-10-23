# Native app plan — Phase 4d handoff ("Invite a friend" placements)

## For Andrew (plain English)
"Invite a friend" now appears in four places: under the game cards on the venue home, on the Live Trivia and
Category Blitz end-of-game screens (beside "Create story"), under any leaderboard with 3 or fewer players
(and in its empty state), and as a quiet row in the account menu. It opens the phone's share sheet (website:
browser share, else copies the link) with the same message as before. Built, tested, **not committed, not pushed,
not deployed**. No server calls, no new cost. Still needs your eyes on a phone (see below).

## For the next agent
1. **Scope done:** 4d only. Out of scope: sign-in screens, `/owner/*`, `/tv`, analytics, copy changes.
2. **State:** branch `main`, uncommitted. Unrelated pre-existing dirty files (design-system pngs, docs/pos-*, lib/pos/providers.ts) are NOT mine.
3. **Decisions:** reuse `ShareLinkButton` + `INVITE_FRIEND_PAYLOAD` (`lib/nativeShare.ts`); other win screens (Pick 'Em, Bingo, Fantasy, Squares, Bracket, prizes) were NOT given an invite button — only the two Phase-4B-named games (Live Trivia x2 sites, Category Blitz final). Add to `ShareWinButton` surfaces only if Andrew asks.
4. **Files:** new `components/social-share/InviteFriendButton.tsx` (`tone="venue"` uses theme tokens via `!` overrides because venue screens have a light theme; `tone="game"` for always-dark game screens). Used in `components/venue/VenueGamesPanel.tsx`, `components/leaderboard/LeaderboardTable.tsx` (`SHORT_BOARD_MAX = 3`), `components/navigation/AccountMenuList.tsx`, `components/category-blitz/CategoryBlitzGame.tsx`, `app/trivia/live/page.tsx`. Tripwire: new test in `tests/native-share-haptics-contract.test.ts`.
5. **Traps:** the leaderboard table is also the Category Blitz-independent venue board; the prompt shows for any filter/timeframe with <=3 rows. `InviteBanner` in CategoryBlitzGame (solo banner) was left as is.
6. **Verified:** `npx tsc --noEmit` clean, eslint clean on touched files, full Vitest 442 files / 5436 pass / 13 skipped. NOT verified visually (no browser/phone pass).
7. **Open:** Andrew phone pass — venue home spacing, drawer row, short leaderboard, light theme look when its flag is on.
8. **Next:** commit if approved; remaining plan items need paid accounts (4c, 5) or Andrew's device checklist section J.
