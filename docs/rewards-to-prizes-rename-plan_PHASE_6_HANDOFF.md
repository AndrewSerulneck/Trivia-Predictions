# Rewards → Prizes rename — Phase 6 handoff (copy fixes from the code review)

Plan: `docs/rewards-to-prizes-rename-plan.md` (§4 "Review fixes"). Phase 6 done 2026-10-18.

## Summary for Andrew (plain English)
- **What changed:** three small wording fixes. (1) The error a partner sees when a prize's details are wrong now reads
  "Check what the winner gets: pick a prize and enter a valid amount." (it used to say "Choose what the winner gets", which
  was wrong when they *had* chosen). (2) The Official Rules disclaimer got the word "prize" back.
  (3) A load-timing script and the phone checklists now say "Offer Prizes" / "Create Prize", the labels you actually tap.
- **Live?** No. One local commit, not pushed or deployed. Push after Phase 9.
- **Needs you — please read the `/rules` sentence:**
  - Before: "…are not involved in, any contest, challenge or sweepstakes on Hightop Challenge."
  - After: "…are not involved in, any contest, **prize,** challenge or sweepstakes on Hightop Challenge."
- Still waiting on your answer to Q3 (stop committing `next-env.d.ts`) before Phase 9.

## For the next agent (Phase 7: harden the wording tripwire)
1. **Goal/scope:** plan Phase 7 only (count copies in `tests/prizes-wording-contract.test.ts`, fix its header, optional
   pre-filter in `tests/helpers/rewardWordingScan.ts`). Out of scope: Phases 8–9, pushing, deploying.
2. **State:** branch `main`, on top of `072a5a6`; Phase 6 is one local commit. Nothing pushed/deployed. No data touched.
3. **Decisions:** error constant stays ONE constant (both routes compare `message === REWARD_INVALID_PRIZE_MESSAGE`).
4. **Files changed:** `lib/rewards.ts` (constant, ~line 140); `app/rules/page.tsx` (disclaimer);
   `tests/legal-pages-contract.test.ts` (pins "any contest, prize, challenge or sweepstakes"); `scripts/measure-owner-load.cjs`
   ("Offer Prizes"); `docs/partner-dashboard-app-redesign-device-checklist.md` (lines 24, 88, 138, 139);
   `docs/prize-gift-card-redesign-device-checklist.md` (line 57); plan status line.
5. **Traps:** left alone on purpose: dated history docs, `docs/reward-descriptions-device-checklist.md:97` (dated history),
   console text in `scripts/backfill-ranked-reward.cjs` / `audit-legacy-recurring-cadences.cjs`.
6. **Verified:** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run test` 404 files / 4,807 pass / 13 skipped.
   Not run: `measure-owner-load.cjs` (needs a running `next start`; Andrew's dev server is not to be touched), build,
   pwa/god-mode (nothing they cover changed; Phase 9 runs the full gate).
7. **Open questions:** Q3 (next-env.d.ts) for Phase 9.
8. **First steps:** run the scanner once to print per-(file,text) counts, seed `count` values, then add the self-test case.
   Plan says Sonnet 5.5, medium.
