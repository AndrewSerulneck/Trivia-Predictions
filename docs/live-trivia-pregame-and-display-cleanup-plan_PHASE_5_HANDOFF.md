# Phase 5 handoff: remove Link a TV

## For Andrew
- **What changed:** the old TV pairing feature is gone from the code: its page component, three API routes, helper
  libraries and two test files. Nothing you see on screen changes (Phase 4 already replaced the page).
- **Live?** No. Nothing is pushed or deployed. Phase 4 is committed (`b2c42e89`); Phase 5 is committed on top.
- **Database:** untouched. The old `tv_pairing_codes` table still exists on purpose. It is dropped by a new migration
  only after the code is deployed (otherwise the old live site would query a missing table). That needs your go-ahead.
- **Left:** Phase 6 (verify, PR, deploy, drop the table, Fire Stick check, standing rules, docs).

## For the next agent (Phase 6: verify and release) — Opus 5.5 / high is not required; Sonnet 5.5 / medium

1. **Scope:** plan §4 Phase 6. Out of scope: new features.
2. **Starting state:** branch `feature/live-trivia-pregame-display`; Phase 4 = `b2c42e89`, Phase 5 = the commit after it.
   Not pushed, not deployed. PR #16 (Phase 1) still open. Production DB has the Phase 4 `display_code` migration;
   `tv_pairing_codes` still exists and is unused by code.
3. **Decisions:** keep `/tv` web-only (`lib/nativeLinkOut.ts`); drop migration only after the deploy is live, `db push` only with Andrew's go-ahead.
4. **Files:** deleted `components/venue-screen/TvPairingDisplay.tsx`, `lib/tvPairing.ts`, `lib/tvPairingShared.ts`,
   `app/api/tv-pair/route.ts`, `app/api/tv-pair/[code]/route.ts`, `app/api/owner/tv-pair/claim/route.ts`,
   `tests/lib.tvPairing.test.ts`, `tests/api.tv-pair.test.ts`. Edited comments/tests: `lib/useKeepScreenAwake.ts`,
   `lib/nativeLinkOut.ts`, `lib/ownerCompetitionTemplates.ts`, `tests/proxy.behavior.test.ts` (now asserts `/tv` and `/tv/H91A` are public),
   `tests/venue-screen-brand-chrome-contract.test.ts`, `docs/venue-display-hype-and-intro-stinger-plan.md` (§8 keep-awake line).
   `proxy.ts`, `lib/domainSplit.ts`, `lib/nativeAppLinks.ts`, `app/in-app-notice/[page]/page.tsx` needed no change (already current/generic).
5. **Traps:** `grep -rn "tv_pairing\|tvPairing\|tv-pair\|Link a TV\|TvPairing"` still hits migration history, older
   docs/handoffs, `docs/*/frame-times` logs, the untracked `tests/* 2.ts` duplicates (not ours, leave) and
   `tests/display-code-contract.test.ts` (a `not.toMatch` assertion, intended). Stale `.next/types` may break `npx tsc --noEmit` in the main
   checkout (see Phase 4 handoff §5); use a clean clone. Dev server on :3000 is Andrew's.
6. **Verified:** `npm run test` 538 files passed / 7,084 tests; eslint on edited files clean; grep shows no code importer of deleted modules.
   **Not run:** `npx tsc --noEmit`, `npm run lint` (whole repo), `npm run build` (Phase 6 does these).
7. **Open for Andrew:** Fire Stick paste check; wording sign-off (Phase 4); go-ahead for the drop-table `db push` after deploy.
8. **First steps:** run the Phase 6 checks in order (tests, tsc in a clean clone, lint, build, never tsc+build together);
   scratchpad browser pass; PR + `/code-review`; after deploy is live, `supabase migration new drop_tv_pairing_codes`
   with `drop table if exists public.tv_pairing_codes;` and ask before `db push`.
