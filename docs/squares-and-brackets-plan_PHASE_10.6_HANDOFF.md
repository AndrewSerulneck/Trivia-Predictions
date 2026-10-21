# Squares + Brackets plan — 10.6 handoff (2026-10-21)

Plan: `docs/squares-and-brackets-plan.md` (§4 10.6 / 10.7.1, results §25).

## For Andrew (plain English)
- **What happened:** 10.5.4 was committed and deployed to the live site (`0b5c1e7`, Vercel Ready). Then I replayed
  last March's men's and women's tournaments on a test copy of the site (a Vercel "Preview") at the hidden Hightop Test
  Bar. I jumped the clock from Selection Sunday to the final, one round at a time. Two test players filled out
  brackets through the real screens, and I made admin corrections along the way.
- **What worked:** filling out, saving drafts, copying picks from another bar, the lock, grading and venue points every
  round, Second chance, corrections (including one after the final), "No result", typing in the final score, the TV
  screen and the Results page. Every player's points add up exactly.
- **One thing failed:** in a replay where the clock is jumped forward, **no prize paid out**, and Results showed the
  brackets dated two to three weeks early. A live tournament isn't affected; it only happens in rehearsals. Without a
  fix, though, we can't rehearse prizes. The fix is a new small step, **10.7.1**. It needs one small database change
  (`supabase db push`), then a quick re-run of the prize part.
- **Needs you:**
  1. **A production redeploy, whenever you like.** I added the server switch `BRACKETS_REHEARSAL_ENABLED=true` to
     Production, but I wasn't allowed to redeploy, so it isn't active yet. Once active, the live cron runs rehearsals by
     itself. With no rehearsal running it costs one tiny database read a minute and shows nothing to players. If you'd
     rather not have it on between rehearsals, remove it in Vercel; I can't remove env vars.
  2. **The local commit of these notes** (docs only) isn't pushed. Pushing `main` deploys Production, which also turns
     the switch on.
  3. **Your phone pass (10.7)** happens on the same Preview after 10.7.1 (details below).

## For the next agent

### 1. Goal and scope
- **Next:** 10.7.1 (plan §4): a rehearsal remembers when its lock really passed, so prizes pay and Results dates
  correctly in a replay with a jumped clock. Then re-run only the prize step on the Preview. Out of scope: Squares 6.5/6.6,
  launch (10.8), any other change to the bracket rules.

### 2. Starting state
- Branch `main`, last pushed commit `0b5c1e7` (10.5.4), deployed to Production (`hightop-challenge-ju5inusc5`, Ready,
  aliases hightopchallenge.com / play.). This handoff + the plan edits are one LOCAL docs commit on top, not pushed.
- Not mine, leave out of commits: `CLAUDE.md` POS hunk, `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, deleted `design-system/project/public/info/*.png`,
  untracked `design-system/project/public/info/New Folder With Items/`, `tests/fixtures/squares/nfl-live-capture-1392308.json`.
- **Vercel env (added 2026-10-21):** Production `BRACKETS_REHEARSAL_ENABLED=true` (NOT active until a production
  redeploy). Preview, scoped to git branch `brackets-rehearsal` only: `NEXT_PUBLIC_BRACKETS_ENABLED=true`,
  `BRACKETS_REHEARSAL_ENABLED=true`.
- **Preview:** `https://hightop-challenge-h9mnbgqbj-andrewserulnecks-projects.vercel.app` from branch
  `brackets-rehearsal` = `main@0b5c1e7` + one empty commit `4aaa790` (pushed only to make Vercel build; never merge it).
  Previews have no Vercel password/SSO protection, so the URL is public, but it shows rehearsals only at hidden venues.
  To ship the 10.7.1 code to it: `git push origin main:brackets-rehearsal --force-with-lease` after the fix is on main
  (or push the fix branch there), then wait for the Preview build.
- **Database (production, shared):**
  - Rehearsal tournaments, both ARCHIVED: men's `f6728bdc-6f31-4279-9c2b-50ac71f065b6`, women's
    `53323143-b77c-4efc-999e-a0c78121c600` (season 2025). No current bracket tournament exists.
  - New hidden venue `venue-hightop-test-2` ("Hightop Test Bar 2", copy of `venue-hightop-test`, no self-serve stamp,
    so the sweeps ignore it). Kept for "copy my picks" in the re-run and phone pass.
  - Test accounts (PIN `1066`): `bktrehearsal1` account `0cfe9b8c-7fd8-40e8-a100-1eaacfbf5c60`, users
    `72144672-7506-428c-9347-421c1c3c5411` (test venue) and `13675e43-03a6-4742-b5fb-308ee72a2548` (test venue 2);
    `bktrehearsal2` account `cbdf5209-dfb8-4a43-968d-3e9a80c58cae`, user `221c4bfa-be33-4945-a8d0-c223836c2c5b` (test venue).
    No `auth.users` rows were created. Their venue points (185 / 66 / 139) and `seasonal_points_credits` rows stay.
  - Test prize `216ae2f4-42dc-42c5-bbeb-2ca5b10ce478` ("March Madness Challenge", all four brackets, $25/$15/$10 gift
    cards, no minimum, partner owner `64f046ff-a44f-47b4-acc1-94ff30288920`) — set `isActive: false` after the run, so it
    can't pay the real 2027 tournament. Create a fresh one for the re-run.
  - All writes are logged in `bracket_admin_log` with actor `claude-10.6`.

### 3. Decisions made (don't re-ask)
- User's instruction: "commit and deploy of 10.5.4, then execute 10.6". The production redeploy for the env var was
  refused by the session's permission classifier, so the Production cron did not drive the replay. The same tick code
  ran from the session instead. This tests the same sync, grading, payment and prize code; only the cron wrapper and
  scheduling weren't tested.
- F1 is NOT patched in place (plan rule since Phase 6: findings become designed sub-phases). Recommended design is in
  plan §4 10.7.1. If you choose differently, record why there.
- Rehearsals were archived at the end as the plan requires. A new rehearsal for the phone pass is cheap to create.

### 4. How the run was driven (files are in the session scratchpad; re-create from here)
- **Admin actions and ticks** call the real server code with tsx (no admin login needed), run from the repo root:
  ```ts
  // admin.ts — `node --env-file=.env.local --conditions react-server --import tsx admin.ts '<json>'` or `... tick`
  // (prefix BRACKETS_REHEARSAL_ENABLED=true; wrap globalThis.fetch to count balldontlie / supabase.co requests)
  const { parseBracketsAdminAction, runBracketsAdminAction } = await import(`${repo}/lib/bracketsAdmin`);
  const parsed = parseBracketsAdminAction(JSON.parse(arg));       // same validation as the admin route
  await runBracketsAdminAction(parsed, "claude-10.6");             // actor written to bracket_admin_log
  const { runBracketsTick } = await import(`${repo}/lib/bracketsSync`); await runBracketsTick({ now: new Date() });
  ```
  Actions used: `create` (`{"action":"create","gender":"men","season":2025,"purpose":"rehearsal","asOf":"2026-03-15T23:00:00Z"}`),
  `set_region_names`, `link_opener`, `move_lock`, `set_clock`, `override_result` (with `homeScore`/`awayScore` on the
  final), `release_result`, `archive`. A script that imports from the scratchpad needs `NODE_PATH=$PWD/node_modules`
  for plain `.cjs`, and must import repo files by absolute path. Running with `--conditions react-server` makes
  `server-only` importable.
- **Prize:** `createReward({ venueId: "venue-hightop-test", definitionId: "bracket_challenge", winCondition: "ranked_places",
  placePrizes: [{prizeKind:"gift_card",amount:25},{…15},{…10}], minPlayers: null, bracketKeys: [all four],
  createdByOwnerId })` from `lib/rewards.ts`, run with `NEXT_PUBLIC_BRACKETS_ENABLED=true` in the process env
  (`isBracketPrizeOffered`). Node's `--env-file` doesn't override variables already set.
- **Players:** Playwright 1.61.1 (install into the scratchpad; Chromium is cached in `~/Library/Caches/ms-playwright`),
  390×844 mobile context against the Preview. Cookies `tp_user_id`, `tp_venue_id`, `tp_sess` from
  `node --env-file=.env.local scripts/print-test-auth-cookies.cjs <userId> <venueId> --format raw` (the local
  `SESSION_SECRET` matches the Preview's: signed → 200, forged userId → 403). Flow: tutorial `Next`, `Next`,
  `Fill out my bracket` → tap `Men's`/`Women's` (and `Second chance`) → `Fill out my bracket` / `Keep filling it out` →
  each game is `[role="group"]` with two `aria-pressed` buttons → `Next` per step → tiebreaker input → `Save bracket`.
  Wait ≥ 1.5 s after `Next` before tapping: one run tapped during the step change and saved 12 of 15 (harness timing,
  not reproduced).
- **Opening-round links:** the replay mask hides First Four teams, so nothing auto-links. Seats found from the unmasked
  feed (`fetchBracketFeed(gender, 2025)`, match an opener's team ids to a round-1 game; seat = 2×(location−1) + 0 home /
  1 away): men's openers 1→41, 2→57, 3→49, 4→17; women's 1→41, 2→49, 3→17, 4→29. Region names used: men's
  East/South/West/Midwest (from the Elite Eight sites), women's Fort Worth 1 / Sacramento 1 / Sacramento 2 / Fort Worth 2.
- **Clock walk (men's / women's asOf):** 03-19 16:00 / 03-20 15:00 (before lock) → 03-21 06:00 / 03-22 06:00 (R64) →
  03-23 / 03-24 (R32, second chance opens) → 03-28 / 03-29 (S16) → 03-30 / 03-31 (E8) → 04-05 / 04-04 (Final Four)
  → 04-07 / 04-06 (final), all 06:00Z. One tick after each `set_clock`.

### 5. Facts and traps found
- **F1 (the failure):** see plan §4 10.7.1 and §25. `bracketRealLockMs` = lock + CURRENT offset. A `set_clock` jump
  forward of J moves the computed "real" lock J earlier. Prize eligibility and the Results date both use it.
  `prizes_settled_at` was stamped with 0 cycles, and it's settled once, so those two rehearsals can't be re-settled.
  That's why they were archived and the re-run needs a fresh tournament.
- `set_clock` / admin messages say "The sync picks it up within a minute" whenever the process has the rehearsal
  switch, i.e. also in a session process. In Production that is only true after the redeploy.
- A feed call once came back `network_error` (from the session's network). The sync simply reads again next run.
- Correction arithmetic checked: flipping a men's Elite Eight game took back that round's credits (−32 / −16 / −8) and
  repaid them at grade 2 (+48 / +24 / 0). Reverting returned every total exactly. After the final, the override set
  `next_sync_at` and the very next tick re-paid (10.1 B1 holds).
- Score guards: one score → "Enter both scores (0–200 each), or neither."; the winner with the lower score → "The
  winner's score must be higher than the loser's."; a winner the stored score contradicts → 409 "The stored score says
  the other team won: enter the corrected score too."
- Results row titles read e.g. "Men's bracket 2026 · Rehearsal"; standings carry only username, score and an `entry`
  token. No user id appeared in the timeline, standings or breakdown payloads.
- The TV picked the men's main bracket (tie on entry count with women's). `games` was empty after the final, as
  expected. The upset panel was never sampled while games were live.

### 6. Verification
- Before the 10.5.4 commit: `npm run test` → 428 files / 5,226 passed / 13 skipped / 0 failed. The verify skill's browser
  check of the bracket screen was done in this run, on the Preview, instead of on a dev server: the 10.5.4 race itself
  isn't reproducible by hand. jsdom tests cover it (159/159 bracket tests at 10.5.4).
- Every check in plan §25 "Held" was read back from the database or the Preview API, not inferred.
- Not verified: the Production cron path itself (see §3), prize coupons on Redeem Prizes, prize rows in Results, the TV
  upset panel, real phones/TV (10.7).

### 7. Open questions for Andrew
- Redeploy Production to activate the rehearsal switch (and keep it on until 10.8), or remove the env var until the
  re-run? Recommendation: redeploy and keep it. It costs about 1,440 tiny reads a day.
- `supabase db push` for the 10.7.1 migration, once it's written.
- Plan open item from 10.5.1 still stands: whether `bracket_save_entry` should also refuse picks of games already tipped
  in a late-lock window (option b).

### 8. Recommended first steps (10.7.1, Opus 5.5 · medium)
1. Read plan §4 10.7.1 and §25. Read `bracketRealLockMs` (`lib/bracketsStore.ts`), its two callers
   (`lib/bracketPrizeAwards.ts`, `lib/results/adapters/bracket.ts`), `set_clock` in `lib/bracketsAdmin.ts`, and
   `syncBracketTournament` in `lib/bracketsSync.ts`.
2. Write the migration (`supabase migration new bracket_lock_passed_at`), the stamping in `set_clock` and in the sync,
   and the tests (walked replay pays the prize). `npm run test`, `npm run test:brackets-sql`, `npx tsc --noEmit`,
   `npm run lint`.
3. After Andrew's `supabase db push` and a deploy, update the Preview branch, then re-run: new men's rehearsal, new
   prize, two entries, cross the lock, jump past the final. Check coupons on `/redeem-prizes` and the prize rows in
   Results. Archive the rehearsal and deactivate the prize.
4. Then Andrew's phone pass (checklist section B) on the Preview. He can use his God Mode account and open the hidden
   venue directly, or the `bktrehearsal1/2` accounts (PIN 1066). The Venue Home card is hidden until Mar 1, 2027, so
   open `/bracket` directly.
