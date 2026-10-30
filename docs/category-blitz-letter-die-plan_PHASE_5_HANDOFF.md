# Category Blitz Letter Die — Phase 5 handoff (guardrails + edge cases)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)
- **What changed:** no change to how the game looks or behaves. I added safety tests only: three more real-game
  situations (the very first round of a session, Reduce Motion on, phone locked/tab hidden while the die lands) and a
  "guardrail" test that fails if anyone later gives the die a sound, a network request, a direct buzz, a second copy, or
  puts it on the venue TV.
- **Live?** No. Nothing committed, pushed or deployed (main is frozen for App Store review). No cost, no database change.
- **Not done:** the real-browser round-start run (`/verify`). The dev server shares the production database, so it needs a
  throwaway copy of the project; I did not set that up. The tests play the real game screen instead. Look/feel and
  haptics on a real phone are Phase 6 (yours).
- **Needs from you:** nothing now.

## For the next agent (Phase 6, Opus 5.5, high — review; then Andrew's phone pass)
1. **Goal:** fresh-eyes review of Phases 2–5 (diff of the files below), then Andrew's iPhone/Android pass incl. a Majority
   Rules round (every 5th) and a slow network. Out of scope: TV, feature flag, sound, merging to `main` (only after Apple approves).
2. **Starting state:** branch `after-app-review`, last commit `c3ecdb8a`. **Nothing from Phases 1–5 is committed.** No data,
   migration, env or cron touched. Never push `main`, deploy, `supabase db push`, or change Production env.
3. **Decisions:** plan §2 items 1–13 (item 11–13 are agent judgment calls Andrew may revisit; see Phase 4 handoff §3).
4. **Files (Phase 5):** new `tests/category-blitz-letter-die-contract.test.ts` (6 tests: single mount sites = game + dev
   panel; no `playHaptic`/vibrate in die files, `triggerAnimation(` present; no audio; no fetch/supabase; `<RoundStartReveal`
   sits behind `dieHoldsBoard`; TV files never import the die). Edited `tests/components.category-blitz-letter-die-wiring.test.ts`
   (+3 tests: lobby→first round, Reduce Motion, tab hidden mid-landing; mock now supports `lobbyCountdown`). No source changes.
5. **Traps:** the Reduce Motion test asserts no `[transform-style:preserve-3d]` element (the cube has no data attribute) —
   it is a class-name check, so it breaks if the cube's classes change. The hidden-tab test only asserts the player ends up
   with a board/reveal, not which. Global room flag needs no die code: it only remaps `venueId`, which the die never reads
   (not separately tested). Lint: `npm run lint` shows ~309 parsing errors under git-ignored `tmp/group-games-phase-4/`;
   use `npx eslint <files>`.
6. **Gates run:** `npx tsc --noEmit` clean; eslint clean on the two test files; `npm run test` 5,636 pass / 13 skipped /
   4 fail (same unrelated Bingo star-index freshness tripwires: `tests/lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}.test.ts`);
   `npm run build` exit 0. Unverified: real browser, Majority Rules timing by eye, continuous venue live, frame rate, haptics.
7. **Open questions:** Andrew's view on judgment call 11 (letter flies straight to the board badge).
8. **First steps:** read Phase 4 handoff §4–5, review the uncommitted diff (`git status`), then hand Andrew the phone checklist.
   If wanted, do the `/verify` run from a scratchpad clone with no `.env.local` (never `pkill next-server`).
