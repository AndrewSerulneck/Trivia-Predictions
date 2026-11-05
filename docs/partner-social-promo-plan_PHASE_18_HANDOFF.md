# Share to social — Phase 18 handoff (clean-ups: one read, one choose route, one name)

**For Andrew (plain English):** Tidy-up only; nothing a partner sees changes, and Post now is still switched off.
Posting now reads the post from the database once instead of twice, the four near-identical "pick an account" /
"disconnect" server files now share one piece of code, and "Instagram" / "Facebook" names come from one list. This
finishes Phases 14–18. Not committed, not deployed, no database/env/cron change, cost slightly lower (one fewer read
per Post now). Nothing needed from you. Suggested next step: one `/code-review high` of all the uncommitted
Share to social work before you decide to commit it.

**What changed:**
- `lib/social/socialPosts.ts` — `publishInstagramPost` / `publishFacebookPost` take `{ row, connection }`, no longer
  call `loadPost`, and are no longer exported. `publishSocialPost` loads once, checks `row.venue_id`, passes the row.
- `lib/social/socialProviderRoutes.ts` (new, server-only) — `chooseRoute(provider)`, `disconnectRoute(provider)`,
  `PROVIDER_ROUTE_SPECS` (body key, wording, view, log tag; names from `SOCIAL_POST_COPY.providers`).
- `app/api/owner/social/{instagram,facebook}/route.ts` and `…/choose/route.ts` — one line each over the shared handlers.
  URLs unchanged; no dynamic `[provider]` segment.
- `app/api/owner/social/posts/route.ts` — `SOCIAL_POST_COPY.providers[provider]` instead of the inline ternary.
- `tests/lib.social-publish.test.ts` — direct provider calls switched to `publishSocialPost`.
- `tests/social-publish-contract.test.ts` — sealing test accepts the one-line shared-handler form and checks each
  shared handler opens with `guardOwnerSocialVenue`; new test bans `"Facebook" : "Instagram"` ternaries under
  `app/api/owner/social/`.
- Plan: status line, §5.1 row 18 "Done", §5.12 "As built".

**Verified:** all error strings, status codes and log tags compared by hand with the old route files (identical);
social tests 121 pass; `npx tsc --noEmit` clean; eslint on changed files clean; `npm run test` 6397 pass, 4 fail (the
known MLB/NFL star-index date tripwires, pre-existing). **Not run:** a live call to the routes (they 404 while Post
now is off; the 404s are tested).

**State:** branch `after-app-review`, last commit `1e803523`; all social work (Phases 5–18) still uncommitted; Post
now flag (`SOCIAL_POST_NOW_ON_SHEET`, `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED`) still off.

## For the next agent
1. **Update 2026-11-05:** the review below was run; its findings are Phases 19–21 (plan §5.13–§5.15). Start with
   Phase 19 (Opus 5.5, xhigh). Original note: Next useful step: `/code-review high` (Opus 5.5, high — plan §5.1 "Any phase's final
   code review") over the uncommitted social + game-themes work, then ask Andrew about committing. Phase 7 (Post
   later + weekly) stays on hold until Andrew asks. Out of scope without Andrew: turning Post now on, `main`,
   `supabase db push`, Production env.
2. **Traps:** the sealing test in `tests/social-publish-contract.test.ts` recognises a route as gated only if it calls
   `guardOwnerSocialVenue(`, or `isSocialPostNowLive()` + `requireOwnerAuth(`, or is exactly
   `export const POST|DELETE = chooseRoute|disconnectRoute("instagram"|"facebook");`. Keep that shape. The 4
   star-index failures are date-based and unrelated.
3. **Commands:** `npm run test`, `npx tsc --noEmit`, `npm run lint` (never typecheck and build together).
