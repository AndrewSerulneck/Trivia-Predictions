# Live Trivia Display media + standings — Phase 5 handoff (covers Phases 1–5)

Plan: `docs/live-trivia-display-media-and-standings-plan.md`. Written 2026-11-20.

## For Andrew (plain English)

- **What changed:** During Live Trivia, the venue TV now shows the question's picture (maps, paintings, photos)
  beside the question, and keeps it up — smaller — beside the answer. The answer screen now says "Next question"
  after questions 1–14, "Standings next" after question 15, and "Final standings next" after the last question
  of the game. A round break or final board with nobody on it says "No scores yet." instead of being blank.
  Pictures can't be tapped, dragged or long-pressed on phones or the TV. Future video clips will play muted and
  looping (no clips exist yet — that's Phase 6).
- **Review of Phases 1–4:** they were built in one session, so I re-checked all of it. The code was correct and
  matched your decisions. I found **one real bug** that the automated tests couldn't catch: if a question's
  picture link is broken, the TV showed the browser's broken-picture icon (the plan forbids that). Fixed and
  re-tested. I also made the phone picture code immune to the same kind of timing problem. The earlier session
  also never wrote its handoff note; this note covers it.
- **Is it live?** No. A pull request is open. **Needs you:** merge it. After that, Vercel deploys it.
- **Left after merge:** a look at a real TV during a game (a question with a map, the answer screen, and the
  round break).
- **Cost:** none added — no new database reads, cron, poll or paid service.

## For the next agent

### 1. Goal and scope of what's left
Phase 5 is done except the steps that need Andrew or a live game:
1. Andrew merges the PR (branch `fix/tv-question-media-standings`). Never merge it yourself.
2. Confirm the production deploy for the merge commit is READY (Vercel MCP `list_deployments` / `get_deployment`).
3. Real-TV check during a real Live Trivia game (Fire Stick / Silk if available): a picture question shows the
   picture beside the text; the reveal keeps it beside the answer and says "Next question" (Q1–14) / "Standings
   next" (Q15) / "Final standings next" (last Q of last round); the round break shows scores (or "No scores yet.").
   Then update the plan status line to "LIVE".
Out of scope: Phase 6 (first GIF/video content, hosting, bandwidth budget, `mediaUrl` field) — start only when
Andrew has a clip. Don't change the engine (`lib/liveShowdownEngine.ts`); none of this needed it.

### 2. Starting state
- Worktree `.claude/worktrees/tv-media`, branch `fix/tv-question-media-standings`, based on `origin/main` at
  `0d53d4ba`. Everything (Phases 1–5) is in one commit on that branch, pushed, with a PR to `main`.
- No database, migration, env var, cron or data change. Nothing to undo outside git.

### 3. Decisions already made (don't re-ask)
D1 fix the label only, no per-question standings, "No scores yet." on empty boards, no new reads. D2 picture stays
up, smaller, beside the answer. D3 video plays on TV and phones, muted and looping. D4 answer-in-file-name
(e.g. `/maps/geography-map-texas.png`) accepted; just make media non-interactive, no renames.

### 4. Files and how they fit
- `lib/questionMedia.ts` — `toQuestionMedia(url, credit?)` → `{ kind, url, credit, fit }` or null (only http(s)
  or root-relative URLs). The single URL → media rule for TV and phones.
- `lib/venueScreen.ts` `selectVenueScreenState` — the `live-trivia` payload gains `media` (question/reveal only),
  `questionIndex` (engine `currentQuestionIndex`, 1-based, 1–15) and `questionsPerRound` (15).
- `lib/liveTriviaShared.ts` — `LIVE_TRIVIA_QUESTIONS_PER_ROUND` (drift-tested against the engine) and
  `revealNextLabel()`.
- `lib/tvType.ts` — `questionType(len, besideMedia)`: text steps down sooner beside a picture.
- `lib/venueScreenDebug.ts` — `?mode=live-trivia` debug state now carries the Texas map.
- `components/venue-screen/TvQuestionMedia.tsx` — TV frame (fixed size). **Phase 5 fix:** `checkImage` /
  `startMutedLoop` refs check, on mount, whether the file already failed before hydration (`img.decode()` rejects
  only for broken images and resolves for SVG maps; video `error` / `NETWORK_NO_SOURCE`).
- `TvQuestionReveal.tsx` (920×690 frame beside text), `TvAnswerReveal.tsx` (720×540 beside answer, `nextLabel`),
  `LiveTriviaScreen.tsx` / `LiveTriviaRevealScreen.tsx` (pass media/label), `TvEmptyBoard.tsx` ("No scores
  yet."), `TvRoundBreak.tsx` / `TvFinalStandings.tsx` (empty board; no confetti/spotlight when no champion).
- `components/trivia/QuestionImage.tsx` — phones (Live + Speed Trivia): image or muted looping video,
  non-interactive. **Phase 5 fix:** refs mark it loaded if it finished before React listened.
- `app/trivia/live/page.tsx` — dropped the hard-coded "Map via Wikimedia Commons" credit (now "Wikimedia
  Commons" from the helper — correct for the Wikimedia paintings too).
- Tests: `tests/lib.questionMedia.test.ts`, `tests/live-trivia-display-media-contract.test.ts` (renders the real
  screens; new Phase 5 case pins the mount-time check), plus fixture updates in `tests/lib.venue-screen.test.ts`,
  `tests/venue-screen-*.test.ts`, `tests/lib.liveTriviaShared.test.ts`.

### 5. Facts and traps
- Engine: `currentQuestionIndex` is 1-based and capped at 15; `isFinalResultsWindow` = mid-game break of the last
  round. The leaderboard lists everyone who answered (even with 0 points), so "No scores yet." shows only when
  nobody answered. A game where everyone has 0 still shows a "champion" with 0 points (pre-existing, not in scope).
- Live Trivia image hosts today: 161 local `/maps/*` (PNG and SVG), 104 Unsplash, 61 Wikimedia, 1 Met Museum.
- **SSR + media events:** `onError`/`onLoad` fired before hydration are never replayed. Static-markup unit tests
  can't see this; only a real browser does.
- **Pre-existing, not fixed:** a React hydration-mismatch warning on every question/reveal screen comes from the
  countdown ring's tick marks (`CountdownRing` in `TvQuestionReveal`) — time moves between server render and
  hydration. Harmless (the ring repaints next tick); untouched by this branch.
- Browser-testing trap: Turbopack refuses a scratch copy whose `node_modules` is a symlink ("points out of the
  filesystem root"); use `next dev --webpack`.

### 6. Build / run / test — what was verified
- `npx vitest run` → 595 files passed, 1 skipped; 7,753 tests passed. `npx tsc --noEmit` clean. `npm run lint`
  clean. `npm run build` passes (run with dummy `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` since the worktree has no
  `.env.local`).
- Browser (Playwright/Chromium), from a scratchpad copy with the display page and `/api/venue-screen/state`
  swapped to fixtures (no database): 20 TV states at 1920×1080 — PNG map, SVG map, Wikimedia painting, photo,
  video, broken picture, broken video, no picture, long question beside picture, reveal Q4/Q15/last Q, long
  answer beside picture, broken picture on reveal, empty and scored round break and final; plus 4K and
  reduced-motion runs. Labels, media presence, video muted/looping/playing/no controls, `pointer-events: none`
  all checked by script; screenshots eyeballed. Phones: `QuestionImage` at iPhone 13 size, server-rendered and
  mounted-late, PNG/SVG/photo/video all visible with correct credits.
- **Unverified:** a real TV / Fire Stick Silk; real Unsplash images over the network; iOS Safari Low Power Mode
  autoplay for video (matters only once Phase 6 adds clips).

### 7. Open questions for Andrew
None blocking. Optional: on an all-zero final, show "No scores yet." instead of a 0-point champion?

### 8. Recommended next steps
1. After Andrew merges: confirm the deploy, then do the real-TV check above and set the plan status to LIVE.
2. Phase 6 only when a clip exists — model **Claude Opus 5.5 / high** per the plan table.
Model note: this Phase 5 was done by Claude Opus 5.5 (plan named Sonnet 5.5 / medium); the higher tier was used
because the session also re-reviewed Phases 1–4.
