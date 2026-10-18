# Rewards → Prizes — Phase 7 handoff (wording tripwire hardened)

## For Andrew (plain English)
The automatic test that stops the word "Reward" coming back on screen had a gap: if a file already had one
allowed use of a word, a second copy of it in the same file would slip through unnoticed. It now counts copies,
so a second copy fails. The test also got faster (about 1.3 s → 0.6 s). Nothing a player or partner sees changed.
Not pushed, not deployed. Phases 8 and 9 are left (9 needs your answer to Q3 about `next-env.d.ts`).

## For the next agent (Phase 8 — Opus 5.5, medium)
1. **Goal/scope:** plan §4 "Phase 8": (a) `normalizeLandedSheet` (`lib/ownerSheetParams.ts:262`) must `replaceState`
   an alias `?sheet=rewards` to `prizes` on a depth>0 landing, keeping depth state and step, no push, return false;
   check `useOwnerSheet`; extend `tests/lib.owner-sheet-params.test.ts:350`. (b) Delete the dead `step === "reward"`
   branch in `components/owner/results/ResultsSheet.tsx:62` (+ comments at lines 46 and 60), add a test that
   `?sheet=history&step=reward` lands on the list with the step cleared. Out of scope: Phase 9, any push/deploy.
2. **Starting state:** branch `main`, Phase 7 committed locally (see `git log -1`); nothing pushed or deployed. No data touched.
3. **Decisions already made:** plan §2 (old URL values accepted forever). Q3 still open (Phase 9 only).
4. **Files changed in Phase 7:**
   - `tests/prizes-wording-contract.test.ts` — `Allowed.count?` (default 1); exported `compareCounts(hits, allowed)` returns
     `{extra, stale}`; extra = more copies than allowed (new copy), stale = fewer. Header now states exactly what is scanned.
     New self-test case for two copies / missing copy. 8 entries carry `count` 2 or 3 (seeded from a real scan).
   - `tests/helpers/rewardWordingScan.ts` — header says scripts/docs not scanned; `scanSource` returns `[]` early when the raw
     text lacks the word (skips the TS parse).
5. **Trap for Phase 8:** the allow-list entry `components/owner/results/ResultsSheet.tsx` / `"reward"` (count 1) must be
   DELETED when the branch is removed, or the stale check fails. Note `lib/results/resultsDisplay.ts` `"reward"` has count 3 — unrelated, leave it.
6. **Verification (Phase 7):** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run test` 404 files / 4,808 pass / 13 skipped / 0 fail.
   Wording test file duration 1.28 s before → 0.58 s after the pre-filter. `build`, `test:pwa-contract`, `test:god-mode-join` not run (no app code touched; Phase 9 runs the full gate).
7. **Open questions:** Q3 (`next-env.d.ts`) blocks Phase 9 item 1.
8. **First steps:** read plan Phase 8, `lib/ownerSheetParams.ts` ~250–290, `lib/useOwnerSheet.ts`, then the tests named above.
