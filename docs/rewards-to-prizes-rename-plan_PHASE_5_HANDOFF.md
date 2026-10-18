# Rewards → Prizes rename — Phase 5 handoff (lock-in, docs, final gate) — FINAL PHASE

Plan: `docs/rewards-to-prizes-rename-plan.md`. Phase 5 done 2026-10-18.

## Summary for Andrew (plain English)
- **What changed:** the automatic wording test is now locked (only the verb "rewards" and non-screen text are allowed, so
  the old word can't creep back). CLAUDE.md, AGENTS.md and SYSTEM_CONTEXT.md now explain "Prize on screen, `reward` in code".
  A new phone checklist, section M, is in `docs/partner-dashboard-app-redesign-device-checklist.md`.
- **Full check passed:** typecheck, lint, all tests (4,807 pass), PWA and join tests, and the production build.
- **Live?** No. Five local commits (Phases 1–5), nothing pushed or deployed. **Pushing/deploying is your call;** deploy all at once.
- **Needs you:** (1) do checklist section M on a phone after deploy (or on a preview); (2) read the `/rules` table in the Phase 4
  handoff; (3) decide on the Advertiser Media Kit HTML (`public/brand/Hightop Challenge - Advertiser Media Kit (Standalone) (4).html`
  still says "Rewards loop"; not linked from the app, left unchanged).

## For the next agent (only if Andrew asks for follow-ups)
1. **Scope:** the rename is complete. Out of scope unless asked: code renames (Q2: skipped), historical docs, the Media Kit HTML.
2. **State:** branch `main`; commits `d3130a6`, `4847675`, `88a1f65`, `b471586`, then the Phase 5 commit. Not pushed/deployed. No data/migrations touched.
3. **Decisions:** plan §2. Test allowlist type is now `phase: "keep"` only.
4. **Files changed in Phase 5:** `tests/prizes-wording-contract.test.ts` (type narrowed, header), `CLAUDE.md` (Naming Rule line + Rewards System heading),
   `AGENTS.md` (note on "Adding a new Reward definition"), `SYSTEM_CONTEXT.md` §8 note, device checklist section M. The design-system README had no "reward" text, so it is unchanged.
5. **Traps:** the test scans string literals/JSX, not comments or identifiers. Reword rather than allowlisting new hits. Older text in SYSTEM_CONTEXT.md still says "Rewards" in prose (dated/internal; the §8 note covers it).
6. **Verified:** `npx tsc --noEmit`, `npm run lint`, `npm run test` (404 files / 4,807 passed / 13 skipped), `test:pwa-contract` 20/20, `test:god-mode-join` 59/59, `npm run build` OK. **Not verified:** any visual check on a device (checklist M).
7. **Open questions:** Media Kit HTML; Andrew to ack `/rules`.
8. **First steps:** if Andrew approves, `git push origin main` then confirm deployment; he runs section M.
