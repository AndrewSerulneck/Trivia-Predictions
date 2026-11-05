# Share to social — Phase 17 handoff (only a saved handle goes on the picture)

**For Andrew (plain English):** Small fix, nothing visible changes except a bug going away. In the Share to social
sheet, an Instagram handle you're still typing no longer appears on the picture and no longer redraws it (or throws
away a finished Reel) on every keystroke. It appears once you press **Save**. The starting ticks (bar name on, handle
on if saved, address off) are unchanged and now pinned by a test, so they won't be raised as a bug again (D36).
Not committed, not deployed, no database/env change, no cost change. Nothing needed from you.

**What changed:** `components/owner/social/ShareToSocialSheet.tsx` (`handle = handleOn ? savedHandle : null`, plus a
comment at the tick state), `tests/components.share-to-social-sheet.test.ts` (updated the "no handle saved" test; new
"On shared pictures choices don't set the starting ticks" test), plan §5.11 "As built" and status line.
**Verified:** sheet tests 14 pass; `npx tsc --noEmit` clean; eslint on both files clean; `npm run test` 6396 pass, 4 fail
(the known MLB/NFL star-index date tripwires). **Not run:** a 350 px browser check.
**State:** branch `after-app-review`, last commit `1e803523`; all social work still uncommitted; Post now flag still off.

## For the next agent
1. **Next phase:** 18 (`docs/partner-social-promo-plan.md` §5.12; Opus 5.5, medium): refactor only — `publishInstagramPost`
   / `publishFacebookPost` take the loaded row; shared `lib/social/socialProviderRoutes.ts` (`chooseRoute`,
   `disconnectRoute`, `PROVIDER_ROUTE_SPECS`); replace `"Facebook" : "Instagram"` ternaries with
   `SOCIAL_POST_COPY.providers[provider]`; add a contract line. Out of scope: turning Post now on, migrations, `db push`, env, crons, `vercel.json`.
2. **Traps:** no dynamic `[provider]` route segment (sealed route list); check `tests/social-publish-contract.test.ts`
   before moving `maxDuration`/guard out of route files. The 4 star-index test failures are pre-existing.
3. **Commands:** `npm run test`, `npx tsc --noEmit`, `npm run lint` (never typecheck and build together).
4. **First step:** read §5.12, then the four choose/disconnect route files under `app/api/owner/social/`.
