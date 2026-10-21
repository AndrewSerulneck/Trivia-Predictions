# Squares + Brackets plan — 10.5.3 handoff (2026-10-21)

Plan: `docs/squares-and-brackets-plan.md` (§4 10.5.3, finding §22 R3).

## For Andrew (plain English)
- **What changed:** during a March Madness rehearsal, when you move the practice clock, the venue TV now follows on its
  next refresh (about 15 seconds) instead of up to 10 minutes later. Only rehearsals are affected.
- **Live?** Built and tested, **not committed or deployed**. No database change. Brackets are still off.
- **Also done:** 10.5.2 was committed (`fe7aad7`) and pushed (auto-deploys). Its database change
  (`20261021134157`) is **still not applied** — it needs your `supabase db push`; the app works either way.
- **Left before the rehearsal (10.6):** 10.5.4 (small).

## For the next agent
1. **Goal:** 10.5.4 (Sonnet 5.5 · low): a refused draft isn't re-sent by a waiting caller — `refusedVersionRef` in
   `persist()`, `components/bracket/BracketEditor.tsx`; tests in `tests/bracket-screen.test.ts` (plan §4 10.5.4). Out of
   scope: 10.6 rehearsal, §7 option (b), Squares.
2. **State:** branch `main`, last commit `fe7aad7` (pushed). Uncommitted and mine: `lib/bracketsTvRead.ts`,
   `tests/bracket-tv.test.ts`, the plan status line, this file. Not mine (leave out of bracket commits): `CLAUDE.md` POS
   hunk, `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, deleted
   `design-system/project/public/info/*.png`, untracked `New Folder With Items/`, `tests/fixtures/squares/nfl-live-capture-1392308.json`.
   Migration `20261021134157` NOT applied (I did not run `supabase db push`; it always needs Andrew's yes).
3. **Decisions:** as plan §4 10.5.3; offset NOT added to the revision.
4. **Change:** `lib/bracketsTvRead.ts` — venue cache field `tournaments` → `tournamentIds`; the payload maps over
   `state.tournaments` filtered to those ids, so clock/locks/winner seats are the 15 s shared read. New test in
   `tests/bracket-tv.test.ts` ("follows a rehearsal clock change at once…").
5. **Traps:** don't run `tsc` and `build` together; `git checkout -- file` wipes uncommitted work.
6. **Verified:** `npx vitest run tests/bracket-tv.test.ts` 16/16; `tsc --noEmit` and eslint on the two files clean. Full
   `npm run test` not re-run.
7. **Open:** `supabase db push` for 10.5.2; commit/deploy of 10.5.3.
8. **First steps:** read §4 10.5.4, do it, run the full suite, then 10.6 needs everything through 10.5.4 deployed.
