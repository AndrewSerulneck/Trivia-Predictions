# Fire TV plan — Phase CR2 handoff (code review, display and release)

**Date:** 2026-11-25 · **Model:** three Claude Sonnet 5.5 / high review agents (as the plan names), coordinated and
re-checked by a Claude Opus 5.5 session.

## Summary for Andrew

- **Nothing urgent.** No security hole, leaked secret, data leak, wrong points or lost picks. The release script never
  prints the Amazon secret or token, and can't upload an unsigned or debug-signed app.
- **Nothing was changed.** The review only reads code. It found 22 things (F45–F66), all small.
- **TV screens (CR2.1):**
  - If the pick count fails to load, the Pick 'Em board says "No picks yet" instead of showing nothing (F45).
  - When two games score between polls, only one score flash plays (F46).
  - A carousel slide can be cut short when a slide drops out between polls (F49).
  - For about half a second during a fade, two "Get the app" QRs can show (F51).
  - The Live Trivia finish confetti passes over the corner QR (F52).
  - All of it is cosmetic.
- **The Fire TV release command (CR2.2):** if a release fails partway (wrong key, network blip during upload), it
  leaves the version number raised. It can also leave a half-made release open on Amazon, which blocks the next try
  until it's deleted in the Amazon console (F55–F57). Nothing bad reaches Amazon. **This should be fixed before the
  1.0.1 release (CR1.7)**, which uses this command.
- **Small fixes (CR2.3):**
  - A test that is meant to stop the TV keyboard bug coming back doesn't actually catch it (F64).
  - The privacy page's TV-app paragraph says we keep the connected venue, but we delete it the moment the TV connects
    (F65).
- **Needs you:**
  1. Say yes or no to CR2.1, CR2.2 and CR2.3. I'd do CR2.2 first, since the 1.0.1 release depends on it.
  2. One question: the corner QR sits a little higher on the idle slides (above the ticker) than on Live Trivia. Is that
     fine? I think so.

## For the next agent

### 1. Next phase and scope
Next in the table: **CR3**, a read-only review of PRs #43 (T1), #45 (T3), #47 (flavor-squares timeout) and #50
(Pick 'Em stale-load recheck), on Sonnet 5.5 / medium. Its checklist is in `docs/fire-tv-app-plan.md` under "Phases
CR1–CR3". Its last step asks Andrew whether every future code phase should end with `/code-review high`.

CR2.1, CR2.2 and CR2.3 are **awaiting Andrew's OK**; don't start them without his yes.

Out of scope for CR3: everything CR1 and CR2 reviewed (#36, #39, #48, #37, #46, #41, #49, #38, `release.cjs`).

### 2. Starting state
- The review ran on `main` `7105f5f7` (2026-11-25). No code was changed and no database was written. The only
  production access was one read-only `select` on `challenge_campaigns`: all 7 active prizes have a non-blank name.
- The docs are on branch `docs/cr2-review`, in one commit on top of `7105f5f7`. It changes `docs/fire-tv-app-plan.md`
  (status line, CR2 row, new rows CR2.1–CR2.3, "CR2 review findings", phase details CR2.1–CR2.3) and adds this note.
  It's a docs-only PR, so Vercel and CI skip it (`scripts/vercel-ignore-build.cjs`, `ci.yml` `paths`).
- The scratchpad worktrees the agents used are removed. Their repro tests were throwaway and are not in the repo. The
  phase details describe each test again.

### 3. Decisions made
- CR2 followed CR1's method. There was one agent per PR, each running `/code-review high <N>` and then the plan's CR2
  checks. The review session then re-read the code behind every finding recorded as verified.
- Findings start at **F45**, because F44 was taken by CR1.2.
- All findings are in code this plan owns, so no other plan got a phase.
- CR2.2 needs **no store release**. It changes only the release tooling and a Gradle build guard, not the app that
  ships. CLAUDE.md's auto-release rule is about shell changes that alter the app. If Andrew reads it otherwise, a release
  would be 1.0.1 anyway, which is CR1.7.
- CR2.2 is ordered **before CR1.7**, because CR1.7's release runs this script.
- F54 (hard-coded hex colours in venue-screen files) gets no phase. It matches the folder's existing convention: convert
  the colours when the files are next touched.

### 4. Files reviewed
- **#41:** `components/venue-screen/TvPickEmBoard.tsx`, `TvAllTimeLeaderboard.tsx`, `TvSlideCanvas.tsx` and
  `usePickEmScoreFlash.ts`; `lib/tvPickEmBoard.ts`; `app/api/admin/route.ts` (`venue-display-codes`);
  `components/admin/sections/VenuesSection.tsx`.
- **#49:** `TvCarousel.tsx`, `TvTicker.tsx`, `TvAppDock.tsx`, `TvIdleAttract.tsx`, `TvLiveTriviaPregame.tsx`,
  `TvNextLiveTriviaSlide.tsx`, `TvPrizesSlide.tsx`, `IdleVenueScreen.tsx`, `LiveTriviaIntermissionScreen.tsx`,
  `VenueScreenClient.tsx` and `TvDemo.tsx`; `lib/tvCarousel.ts`, `lib/venueScreenCarousel.ts`, `lib/tvAppDemo.ts` and
  `lib/venueScreenTiming.ts`.
- **#38 and Phase 8b:** `native-tv/scripts/release.cjs`, `native-tv/scripts/create-upload-key.cjs`,
  `native-tv/app/build.gradle.kts`, `components/venue-screen/TvConnectScreen.tsx`, `app/privacy/page.tsx`,
  `docs/fire-tv-store/listing.md`, the store images and `tests/tv-app-contract.test.ts`.

### 5. Facts and traps
- **The rotation is stateless.** `carouselSlideAt(slides, elapsed)` is `slides[floor(elapsed / 15 s) % slides.length]`.
  Any change in which slides are non-empty moves the visible slide (F49). The fix has to keep "a poll tick never moves
  it" (`tests/venue-screen-carousel.test.ts`).
- **The score flash is detected in `TvCarousel`, not in the slide.** The hook has to stay mounted while slides rotate.
  `useFxMoment` claims each token once per page load, so re-entering a slide never replays it.
- **In `release.cjs`, `fail()` calls `process.exit(1)`.** Any `fail()` below `main()` skips every `catch` and every
  revert. That is the root of F55 and F56.
- **The script never commits the version bump.** `native-tv/app/build.gradle.kts` on `main` is vc1 / 1.0.0, which
  matches the release in review. After a real release, the bump must be committed, or the next run reuses the code
  (F57).
- **Not checked against Amazon:**
  - what `GET /edits` returns while a release is in review (F58);
  - what `validate` returns on errors (F59);
  - whether deleting an edit is allowed.
  The agents were told not to call Amazon. CR2.2 step 1 is a single read-only check.
- **`build.gradle.kts` without the key files** builds the release unsigned, not debug-signed. The release script
  catches this through `apksigner`; a manual build doesn't (F63).
- **`TvConnectScreen.tsx` was changed later by CR1.5.** The Phase 6 keyboard fix is still there (focus goes to
  `boxesRef`, at about line 233).

### 6. Checks that passed (evidence)
- **Display: game moments.** Both run only through FX keys: the score flash through `useFxMoment(flash.token)` in
  `TvPickEmBoard`, and the idle burst through a `useFx` key `idle:<slot>`. There are no direct `burst` or `shower`
  calls in the new slides.
- **Display: nothing replays on a poll.**
  - A token is `pickem-score:<key>:<away>-<home>`, and the gate marks a repeat as `duplicate`.
  - The first look flashes nothing (`detectScoreFlash(null, …)`).
  - The rotation counts from `useState(nowMs)` at mount, with `key={active}` stable.
  - The ticker keyframes are value-stable.
- **Display: no player runtime or ads.** `isVenueDisplayPath` is unchanged, and
  `tests/venue-display-no-ads-contract.test.ts` passes. Neither PR imports `lib/ads`.
- **Display: precedence and the data switch.**
  - Neither PR touched `selectVenueScreenState`.
  - `TV_CAROUSEL_DATA_ENABLED` is in a `server-only` file. When off, it returns `EMPTY_CAROUSEL` before any read and
    never schedules a sports refresh.
  - Reads happen only when the screen would be idle. Try demo uses fixtures and writes nothing (`poll={false}`).
- **D15:** only `TvCarousel` mounts the ticker. Board games are skipped only while the Pick 'Em slide is on, because the
  board and the ticker share `TV_PICKEM_BOARD_SIZE` = 4.
- **D16:**
  - The corner QR shows on carousel slides 1–4 and on Live Trivia intermission and final.
  - Slide 5 has the big QR. The pre-game has its own step-1 QR, and the corner is off there.
  - There is none on questions, reveals, Category Blitz, Squares, Bracket or Connect.
  - The board slides have no QR (a test asserts this).
  - The only overlap is F51.
- **D10:** the name is in full everywhere. The `Hightop<br/>Challenge` wordmark is one name on two lines, and a test
  pins it.
- **D20 / D23:** the order is `TV_CAROUSEL_ORDER`, at 15 s per slide. Empty slides are skipped. With every slide empty,
  only `["app"]` remains. The index can't go out of range.
- **D28:** no progress bar (a test asserts this).
- **Text size:** the smallest new size is 22 design px, ×1.2. Nothing is under 12 px.
- **Code style:** arrow functions, `@/` imports, no `any`. Inline styles appear only under `components/venue-screen/*`.
- **No player id leaves the server.** `TvPickEmLeader` is `{rank, username, wins, losses}` and `TvAllTimeEntry` is
  `{rank, username, points}`.
- **Admin route.** `venue-display-codes` sits after `requireAdminAuth`. It is one bounded `select id, display_code`.
- **Cost.** No new polling. The carousel rotates on the client, and there are no extra reads beyond Phase 9's bounded
  reads. Timers are cleared on unmount.
- **`release.cjs`: secrets.** 11 mocked runs never printed the sentinel secret or token. The secret was not printed even
  when the mocked token error echoed it.
- **`release.cjs`: signing and exits.**
  - It runs `clean` before `assembleRelease`.
  - `apksigner verify` throws on an unsigned APK, and the SHA-256 is compared with `CERT_SHA256`, which matches the
    README fingerprint.
  - An open edit stops it before the bump. A 404 from `GET /edits` fails closed.
  - Every failure path exits 1.
- **Keys stay out of the repo.**
  - `build.gradle.kts` reads the signing files from `~/Library/Application Support/Hightop Challenge/signing/`, with no
    debug fallback.
  - `git log --all` shows no keystore, `.pem` or `.apk` was ever committed.
  - `native-tv/.gitignore` covers them.
- **`create-upload-key.cjs`** refuses to overwrite and uses modes 0700 / 0600. Passwords go through `-storepass:env`,
  never argv, and it prints only paths and the public fingerprint.
- **Store pack.** The image sizes and the D22 icon are right, and the listing uses the full name (D10).
  `tests/tv-app-contract.test.ts` passes (21 tests).

### 7. How to build, run and test
- Nothing to build for this phase.
- The remedial phases use `npm run test`, `npm run lint` and `npx tsc --noEmit`. Never run typecheck and build at the
  same time.
- CR2.2's tests mock `fetch` and `child_process` through a preload file. Never run `npm run fire-tv:release` for real
  in CR2.2.
- Unverified:
  - F51 was checked by reading the code, not by rendering it.
  - F58 and F59 depend on Amazon's API behaviour.
  - F66 depends on how a real device's keyboard behaves.

### 8. Open questions for Andrew
1. Approve CR2.1, CR2.2 and CR2.3? Each one is a yes or no.
2. The corner QR sits at `bottom: 130` on carousel slides (above the ticker) and `bottom: 44` on Live Trivia. Is that
   fine for D16's "one fixed spot"?

### 9. Recommended first steps
- **CR3:** start from up-to-date `main`. For each of #43, #45, #47 and #50, read the PR and its handoff, then run
  `/code-review high <N>`. Then prove in a scratchpad worktree that each new test fails without its fix, as T4.1 did.
  Number findings from **F67**. Model: Sonnet 5.5 / medium.
- **If Andrew approves CR2.2:** do it before CR1.7, starting with its step 1, the read-only shape check of `GET /edits`.
