# Share to social — Phase 20 handoff (the right message)

**For Andrew (plain English):** Three small wording/behaviour fixes to the hidden "Post now" feature. It is still
switched off, so no partner sees any of this yet.
1. If a partner switches off Instagram in Facebook's dialog and has no Facebook Page to post to (or the mirror), the
   message now says what they switched off, instead of "switch to a professional account".
2. Instagram's hashtag / @ limits no longer block the Facebook button or the server for Facebook posts. The message
   says "Instagram allows…" so it's clear which button it is about.
3. The "Connected." / result message no longer comes back every time the sheet reopens or the page reloads, and
   Cancel on the Disconnect confirm clears an old error.

Not committed, not deployed. No database, env, cron or cost change. Nothing needed from you. Next: Phase 21 (clean-ups).

## For the next agent

1. **Next phase: Phase 21 — Clean-ups (plan §5.15)**, findings #8–#10: `chooseRoute` drops the extra `loadConnection`
   (check tests reading `body.connection` from choose first), export/reuse `META_ID`, panel `remember()` uses
   `SOCIAL_RECENT_POSTS`, drop `row.venue_id !== input.venueId` in `publishSocialPost`. Refactor only; partners should
   notice nothing. **Out of scope:** turning Post now on, Phase 7, D39, `main`, `supabase db push`, Production env.
2. **Starting state:** branch `after-app-review`, last commit `1e803523`. All Share to social work (Phases 5–20) and the
   game-themes work are uncommitted. Nothing pushed or deployed; no migration, data change or env change.
   Post now flags still off; `/api/owner/social/**` still 404.
3. **Decisions:** two new results (one per provider) instead of one shared `declined_nothing_connected`, so the copy
   can name the provider; `missing_permissions` (both declined) and `no_instagram` (none_linked twice) unchanged.
   D37 (`choose` wins) unchanged.
4. **Files changed:** `lib/social/socialTypes.ts` (two `SocialConnectResult` members); `lib/social/socialPublishRules.ts`
   (`socialConnectResult`, `socialCaptionProblem(caption, provider)`); `lib/promo/promoCopy.ts` (two results strings);
   `app/api/owner/social/posts/route.ts` (passes `provider`); `components/owner/social/SocialPostNowPanel.tsx`
   (`captionProblems` per provider, `captionMessages`, URL-strip effect, Cancel clears notice); tests
   `tests/lib.social-publish.test.ts`, `tests/components.social-post-now-panel.test.ts` (3 new); docs: plan status,
   §5.1 row 20, §5.4 table, §5.14 "As built", §9 standing rule.
5. **Traps:** the callback's `markGone` uses outcomes, not the result string, so new results needed no change there.
   Pre-existing: 4 MLB/NFL star-index date-tripwire test failures; `npm run lint` whole-repo errors only in
   `tmp/group-games-phase-4/release/`.
6. **Verified:** `npm run test` 6422 pass / 4 fail (the tripwires); `npx tsc --noEmit` clean; eslint clean on touched
   dirs/tests. Not run: `next build`, any browser or live Meta call (routes 404 while off).
   The URL strip is tested in jsdom only (`replaceState` keeps `history.state`); not checked against Next's real
   `useSearchParams` in a browser.
7. **Open questions:** none new. D39 still open.
8. **First steps:** read plan §5.15, `app/api/owner/social/_providerRoutes` / `lib/social/socialProviderRoutes.ts`
   (`chooseRoute`, `PROVIDER_ROUTE_SPECS`), grep tests for `body.connection`. Model: Sonnet 5.5, medium (plan §5.1).
