# Fire TV plan — Phase CR1 handoff (code review, high risk)

**Date:** 2026-11-24 · **Model:** Claude Opus 5.5 / high (the reviewing session and its five review agents)

## Summary for Andrew

- **Nothing urgent.** No security hole, data leak, wrong points or lost picks today. Production has 0 NHL Pick 'Em
  picks and no duplicate picks on any game.
- **One thing is wrong on TVs right now (F14):** the Prizes slide puts "1 pts" or "100 pts" under prizes that have no
  points target (game-winner, ranked and leaderboard prizes). That's 5 of the 7 active prizes. Only the text is wrong;
  no points move. Fix: CR1.1, a small web change.
- **Pick 'Em could pay a player twice (F24):** if the sports feed changes a game's start time after someone picks, the
  game shows as "not picked", they can pick again, and both picks are paid. This was already possible for NBA, NFL and
  MLB. Since N2 it can happen for NHL too. It hasn't happened yet. Fix: CR1.2.
- **The weekly NFL snapshot job can fail silently (F36):** if the API key expires or the feed is down, the run still
  shows green and GitHub sends no email. The T2 handoff wrongly says it emails you. Fix: CR1.3, ideally before the
  first scheduled run on Tue 2026-12-01.
- **Fire TV app (F29):** if the website returns a server error, the TV may stay on the error page until someone
  presses Reload, instead of retrying on its own. Fix: CR1.7, which needs a 1.0.1 store release after Amazon approves
  1.0.0.
- Everything else is small. **43 findings in all (F7–F43). Nothing has been fixed yet:** the review was read-only.
- **Needs you:** say yes (or no) to the remedial phases CR1.1–CR1.7. I'd do them in table order. CR1.3 also asks you
  one question: should Vercel skip a build when the weekly bot only changes the snapshot file? That saves about 17
  builds a season.
- **New standing rule (you asked, 2026-11-24):** every code review now writes its fixes into the relevant plans as
  remedial phases, without asking. Doing those phases still waits for your OK. It's in `CLAUDE.md` and `AGENTS.md`.

## For the next agent

### 1. Next phase and scope
Next in the table: **CR2** (read-only review of PRs #41, #49, #38; Sonnet 5.5 / high), then **CR3**. The CR1
remedial phases **CR1.1–CR1.7** were **approved by Andrew on 2026-11-24**; he'll run them in a separate session.
- CR1.1, CR1.3, CR1.4, CR1.5 and CR1.7: in `docs/fire-tv-app-plan.md`, "Phase details".
- CR1.2 and CR1.6: in `docs/bingo-pickem-reliability-plan.md`, "Remedial phases from the CR1 code review", because
  that plan owns that code.

Out of scope for CR2: anything CR1 found. Don't re-review #36, #39, #48, #37 or #46.

### 2. Starting state
- Branch `docs/cr1-review` (from `docs/t42-merged`, which is PR #53 and still open). It changes these files:
  - `CLAUDE.md` and `AGENTS.md` (the new rule)
  - `docs/fire-tv-app-plan.md` (status line, phase table, CR step 5, findings, phase details)
  - `docs/bingo-pickem-reliability-plan.md`
  - this note
  - `docs/fire-tv-app-plan_CR1_evidence/pickem-game-id-and-grading-repro.test.ts.txt`
- Its PR is listed in the plan's status line once opened.
- No code, data or migration changes. No database writes. Only read-only production selects were run (§6).
- A scratch worktree of `main` `75b47740` (detached) was used at
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/6d559217-30cc-42c1-896e-7df0b7acbe80/scratchpad/cr`.
  It is disposable: `git worktree remove --force <path>`, or `git worktree prune` if the scratchpad was cleared.

### 3. Decisions
- D37 governs the review: read-only, findings recorded, fixes proposed as remedial phases awaiting Andrew's OK.
- **New rule (Andrew, 2026-11-24):** review findings become remedial phases automatically, in the plan that owns the
  code (`CLAUDE.md` §Code review findings become remedial phases). That's why CR1.2 and CR1.6 sit in the Pick 'Em
  reliability plan, with pointer rows in the Fire TV table. CR step 5 in the Fire TV plan was amended to match.
- Phases were numbered in recommended run order:
  - CR1.1 first: live wrong text, tiny fix.
  - CR1.2 next: points.
  - CR1.3 before the Dec 1 cron.
  - CR1.4 to CR1.6 after those.
  - CR1.7 last: it waits on Amazon.
- F12, F13 and F23 have no phase: F12 is accepted by design; F13 and F23 are style nits, to fix when those files are
  next touched.
- F42 (stale T2, T3 and N2 rows) was fixed in this review.

### 4. Files
Nothing in the app changed. Review targets, as of `main` `75b47740`:
- #36:
  - `lib/tvConnect.ts`
  - `components/venue-screen/TvConnectScreen.tsx`
  - `app/api/tv-app/*`
  - `app/api/owner/tv-app/connect/route.ts`
  - migration `20261122114719_tv_device_pairings.sql`
  - `proxy.ts:55-58`
- #39:
  - `lib/venueScreen.ts` (`selectVenueScreenState`)
  - `lib/venueScreenCarousel.ts`
  - `lib/tvSportsSnapshot.ts`
  - `lib/pickem.ts` (TV feed helpers)
  - migration `20261122174439_tv_sports_snapshot.sql`
- #48: `lib/pickem.ts` (`extractEventStartIso`, `buildPickEmGameId`, the settlement loop).
- #37: `native-tv/app/src/main/java/com/hightopchallenge/tv/{MainActivity,TvPolicy,TvBridge}.kt`, manifest and
  network security config.
- #46:
  - `.github/workflows/nfl-star-index-weekly.yml`
  - `scripts/refresh-nfl-star-index.cjs`
  - `lib/leagueSeasonStatus.ts`

### 5. Facts and traps
- Every PR was reviewed by its own Opus 5.5 / high agent. Each agent ran `/code-review high <N>` and then the plan's
  checks.
- The skill missed F36, the most important #46 finding. It came from the manual check. Keep doing both.
- **WebView callback order (F29):** current Android System WebView fires `onPageStarted` when a page commits, not
  when it starts loading. So `onReceivedHttpError` arrives *before* `onPageStarted`. Older WebViews differ, so test
  both orders. Evidence is Chromium's `AwWebContentsObserver.java`, `AwContentsClientBridge.java` and
  `AwComputedFlags.java`. It has not been seen on a real device yet.
- GitHub's default `run:` shell is `bash -e {0}`, without `pipefail`. `shell: bash` gives `-eo pipefail`.
- `challenge_campaigns.points_required_to_win` is a NOT NULL placeholder (1 or 100) for prizes that aren't points
  targets. Never display it without checking `challenge_mode` and `win_condition` (F14).
- The Pick 'Em picks map keyed by full `game_id` makes the `providerEventId` fallback dead code (F24).
- The reproduction test in `docs/fire-tv-app-plan_CR1_evidence/` asserts the *bugs*. It is stored as `.txt` so vitest
  and tsc ignore it.
- Facts checked and safe:
  - `/tv/<code>` has no rate limit (pre-existing). A 4-character display code only reveals a public venue id.
  - The `claim_tv_sports_refresh` claim is a single atomic UPDATE.
  - The TV UA can't unlock phone-app behaviour (`isNativeUserAgent` needs `HightopChallengeApp/`).

### 6. Verification and production evidence
**Checks that passed:**
- #36:
  - Grants and RLS on `tv_device_pairings` (service_role only, forced RLS).
  - No new SECURITY DEFINER function.
  - Venue id only, no partner session (D9).
  - No `auth.users` use.
  - `proxy.ts` only adds `/tv-app` to public paths; no `middleware.ts`.
  - Try demo writes nothing.
  - No cron needed: rows are cleaned on create.
  - No IDOR: the claim is checked against `venue_owner_venues`.
  - Display-code brute force gives only a public venue id.
- #39:
  - Grants.
  - `claim_tv_sports_refresh` is SECURITY INVOKER, service_role only, atomic.
  - Precedence only in `selectVenueScreenState`, matching D13, D14, D21 and D26.
  - CDN cache key includes the venue; no cookie-dependent content.
  - Missing data is null, not zero.
  - No player ids leave the server.
  - Reads are bounded.
  - No feed calls without a TV.
  - The switch works.
- #48:
  - Points only via `pay_pickem_points`.
  - No re-grade of won/lost picks.
  - Locking is correct.
  - Other leagues unchanged: 35/35 literal-id tests.
- #37:
  - Exact-host allowlist.
  - Redirects and `window.open` re-checked.
  - Only the launcher activity is exported.
  - No cleartext, backup off, file and content access off.
  - No `proceed()` on SSL errors.
  - Debugging off in release.
  - UA is per D6.
- #46:
  - `contents: write` is the only permission.
  - Secrets aren't logged.
  - No untrusted input in `run:`.
  - Concurrency group present.

**Read-only production selects (2026-11-24):**
- `tv_device_pairings`: 1 row (expired, unclaimed). 17 of 17 venues have a display code.
- `pickem_picks`:
  - 137 total.
  - 0 created since the N2 deploy (2026-11-23 22:09:44Z).
  - 0 NHL.
  - 0 duplicate user + provider-game pairs.
  - 0 provider games under more than one id.
- `pickem_prize_tiebreakers`, `pickem_venue_frozen_lines` and `pickem_game_lines`: 0 rows each.
- `tv_sports_refresh`: 17 rows, one refresh at 2026-11-23 22:28:53Z. Empty leagues were set to +30 min (F15).
- `tv_sports_games`: 38 rows, 0 at noon UTC.
- Active, unwon `challenge_campaigns`: 7. Of these:
  - 3 `progress`/`game_winner`, pts 1
  - 1 `ranked_places`, pts 1
  - 3 `leaderboard`/`points_threshold`, pts 100

  None are one-time prizes past their end date.
- Anon-key selects on `tv_sports_games` and `tv_sports_refresh` both return 42501.
- All 17 venues are `America/New_York`.

**Verified by the reviewing session itself:**
- F7 and F8: read the poll effect.
- F14 and F15: read `readPrizes` and `listPickEmTvFeedGames`.
- F24–F26: re-ran the reproduction test on `main`: 6/6 pass, asserting the bugs.
- F29: read the app's `WebViewClient`.
- F36: run 45268818494 log shows `shell: /usr/bin/bash -e {0}`.

**Still unverified:**
- F17, F28 and F34 (plausible).
- F29 on a real device.
- What BallDontLie actually sends for postponed NHL games (F26).
- Whether BallDontLie NHL rows change `start_time_utc` (F24's trigger).

### 7. Open questions for Andrew
1. ~~Approve CR1.1–CR1.7?~~ Answered 2026-11-24: all approved.
2. ~~F41~~ Answered 2026-11-24: yes, CR1.3 adds a `vercel.json` `ignoreCommand` for snapshot-only commits.
3. Do you want an edge rate limit on `/api/tv-app/pairings/status` and `/tv/<code>` (F12)? The default is no.

### 8. Recommended first steps
- For CR2: read `docs/fire-tv-app-plan.md` "Phases CR1–CR3" and the CR2 bullet list.
- Do what CR1 did: one review agent per PR, each running `/code-review high <N>` plus the plan's checks, then
  re-check the main findings yourself.
- Continue numbering at **F45** (F44 was taken by CR1.2 on 2026-11-24).
- Follow `CLAUDE.md` §Code review findings become remedial phases.
- Model: Sonnet 5.5 / high, as named in the table.
