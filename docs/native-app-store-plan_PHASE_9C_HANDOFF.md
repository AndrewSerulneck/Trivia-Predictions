# Native app plan — Phase 9c handoff ("Share my win" on every win) — 2026-10-22

## For Andrew (plain English)
- **What changed:** a **"Share my win"** button now appears on every win screen: your prize cards (Redeem Prizes), a won Bingo board,
  Pick 'Em (a day with correct picks), NFL Pick 'Em (a finished week where you're 1st–3rd), Fantasy (a finished game where you're
  1st–3rd at the venue), Super Bowl Squares (a quarter you won) and the Bracket (finished, you're 1st–3rd). Tapping it opens the same
  picture screen as Live Trivia (ready-made designs, Story/Post, optional selfie). Live Trivia and Category Blitz keep theirs.
- **A prize picture shows the prize name only** ("I just won $15 off my tab at …!") — never the coupon code, QR or gift card number. A test fails if that ever changes.
- **Share tracking:** I widened the database check so shares from all nine games are recorded. **Applied to the live database** (you said yes; it only loosens a rule, no data touched).
- **Live?** Not yet. 9a+9b are pushed (`beebc77`). 9c is built and tested on this computer, **not committed or pushed**.
- **Needs you:** say "commit and push 9c" (the database part is already live and harmless to old code). The phone pass for these buttons goes in Phase 9f.

## For the next agent

### 1. Next phase and scope
**Phase 9d** (Opus 5.5, high): the share sheet — destinations row, "Copy caption + link", Instagram direct-share plugin (needs Andrew's Meta App ID),
tag nudge line. Out of scope here: 9e (dropped), store badges (Phase 7). Phase 4d "Invite a friend" was NOT added next to the button (4d isn't built).

### 2. Starting state
Branch `main`; 9a+9b committed+pushed as `beebc77`. 9c files are uncommitted (list in §4). Other people's uncommitted work still sits in the tree
(`.codex/`, `.firebaserc`, `.mcp.json`, `firebase.json`, POS docs, `lib/pos/providers.ts`, part of `CLAUDE.md`, deleted `design-system/project/public/info/*.png`…) — stage only 9c files;
for `CLAUDE.md` stage only the 9c hunk (`git diff -U3 CLAUDE.md`, split, `git apply --cached --recount`).
Migration `20261023004047_story_share_events_all_games.sql` was applied to production 2026-10-22 (`supabase db push`; it was the only pending migration).

### 3. Decisions
- Andrew: share tracking widened (yes). Podium-only for ranked results (1st–3rd; the non-winner wording "I finished 3rd in …" exists from 9b) — mine; widen/narrow in each screen's condition.
- Hub "prize won" card (VenueChallengesPanel) has NO button: it is a tap-to-claim card that opens the wallet, where every prize card has one.
- Pick 'Em (daily) has no weekly result, so its win moment is "a day with ≥1 correct pick" (points = Σ pick reward, default 10) — headline reads "I just won Pick 'Em at …".

### 4. Files
New: `components/social-share/ShareWinButton.tsx` (props: `gameType`+`result` OR `prize`; identity via `useSyncExternalStore` over storage, renders null if not signed in),
`tests/share-win-button.test.ts` (every win screen lists its button; no fetch/code in the button; prize payload drops code/GAN/QR; migration + route cover the registry),
`supabase/migrations/20261023004047_story_share_events_all_games.sql`, this note.
Changed: `StoryShareLauncher.tsx` (`variant: "card" | "button"`), `PrizeWalletPanel.tsx` (button OUTSIDE `data-prize-wallet-item`, which must hold only the card's own button — `tests/components.prize-wallet-card.test.ts`),
`BingoBoardCard.tsx` (won boards; no prop change so the memo comparator is untouched), `PickEmGameList.tsx`, `NFLPickEmLeaderboard.tsx`, `FantasyHome.tsx`, `SquaresGame.tsx`, `BracketStandings.tsx` (new prop `isComplete`) + `BracketGame.tsx`,
`app/api/analytics/events/route.ts` (game types now from `STORY_SHARE_GAME_TYPES`), `CLAUDE.md`, plan status lines.

### 5. Traps
- Adding a share game needs a NEW migration widening `story_share_events_game_type_valid` (the test fails until it does).
- Fantasy points are decimals; the analytics route truncates (`nullableInteger`).
- `ShareWinButton` passes `venueName` only when the screen has it (wallet); elsewhere the modal's `useShareVenue` uses the remembered hub venue (zero requests).
- The squares/bracket buttons are inside screens that already `notFound()` with their flags off.

### 6. Verified
`npx tsc --noEmit` clean; eslint clean on touched files; `npm run test` 434 files / 5,317 pass / 13 skipped; `npm run build` ok; `supabase db push --dry-run` showed only this migration, then applied.
**Not verified:** any button in a browser/phone (needs signed-in data per game); the picture for the new games on a real phone. Run `npm run share-card:render -- --sheet` after any layout change.

### 7. Open questions
Whether Andrew wants venue @handles (revive 9e) — see his tagging question answered in the session: no auto-tag is possible; a handle could be printed on the picture and put in the caption text.
The QR "ask to download, else browser" prompt would be a change to `/app` (an interstitial for phones) — not built; ask Andrew.

### 8. First steps for 9d
Read plan "Phase 9d" + the 9b/9c notes; re-check Meta's "Sharing to Stories" doc; reuse `StoryCaptureModal` (do not fork it); keep Web Share `files` + `text` without `url`.
