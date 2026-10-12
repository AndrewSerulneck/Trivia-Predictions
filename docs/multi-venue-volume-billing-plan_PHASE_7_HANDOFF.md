# Multi-venue billing — Phase 7 (release) handoff, 2026-10-12

## For Andrew (plain English)
6.8 + 6.9 are committed (`284266b`, local only, NOT pushed). I prepared the release: a checklist
(`docs/multi-venue-billing-device-checklist.md`) and a new "More than one venue" section in the Partner
Manual (`lib/partnerManual.ts`). **Nothing is live**: no push, no Vercel flag change, no redeploy. What's left
needs you: push, set the flag, redeploy, and add then remove a real second venue on your own card.
Decisions: two-step dead-bill move stays as is; the admin picker keeps offering venues taken off a bill
(so an admin can put back one a partner removed by mistake — on the bill it left).

## For the next agent
1. **Scope:** release only. Out of scope: new billing features, a dead-bill-move RPC, hiding removed venues from the admin picker.
2. **State:** branch `main`, last commit `284266b`; ahead of origin by 6.3–6.9 commits, none pushed. Migration `20261012033356` already applied to production; lookup-key backfill already applied to the two card bills. UNCOMMITTED: `lib/partnerManual.ts`, the checklist, this note. Unrelated dirty files (Fantasy/NFL/GameIdentityPanel/player-pending test/.vscode) are not mine — never commit them with billing.
3. **Traps:** the manual section ships on push while the flag is still off — flip the flag right after deploy. `NEXT_PUBLIC_*` needs Redeploy. Dev and prod share one DB/Stripe: never test add/remove from a dev server. Do not push without Andrew's word.
4. **Verified:** `tsc` clean; 334 billing tests and `owner-dashboard-contract` pass. Not run: full `npm test`, build, any browser look.
5. **First steps:** confirm commit with Andrew → run `npm run test` + `npm run build` → push → Vercel flags + Redeploy → Andrew does checklist §A → dry-run `npm run billing:backfill-lookup-keys` → report cost/usage vs. plan §6.
