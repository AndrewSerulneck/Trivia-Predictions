# Share to social — Phase 21 handoff (clean-ups)

**For Andrew (plain English):** Tidy-up of the hidden "Post now" code. Nothing a partner could notice changed, and
it is still switched off. Picking an account/Page now does one database read fewer, and the status load does one
step in parallel instead of after. Not committed, not deployed. No database, env, cron or cost change (if anything,
slightly fewer reads). Nothing needed from you. This finishes the third code review's phases (19–21).

## For the next agent

**What changed (plan §5.15, findings #8–#10; all confirmed in code first):**
- `lib/social/socialProviderRoutes.ts` — `chooseRoute` answers `{ ok: true }` (no `loadConnection` + view after a
  pick; the panel reloads `GET /api/owner/social/status` anyway). `view` removed from `PROVIDER_ROUTE_SPECS`; the spec
  type is no longer generic. The picked id is checked with the shared `META_ID`.
- `lib/social/socialPublishRules.ts` — now exports `META_ID` (moved from `socialConnections.ts`, which imports it).
- `components/owner/social/SocialPostNowPanel.tsx` — `remember()` slices to `SOCIAL_RECENT_POSTS`; `choose` reads
  `readJson<object>` (it never used `connection`).
- `lib/social/socialPosts.ts` — `publishSocialPost` drops the impossible `row.venue_id !== input.venueId`
  (`loadPost` filters by `venue_id`; comment says so). Provider guards in the two provider steps kept.
- `app/api/owner/social/status/route.ts` — `postsLeftToday` runs alongside the two connection reads; the posts read
  still waits for both connections. Same four reads.
- Docs: plan status line, §5.1 row 21 ("Done"), §5.15 "As built".

**Verified:** `npx tsc --noEmit` clean; eslint clean on `lib/social`, `app/api/owner/social`, `components/owner/social`;
`npm run test` 6422 pass / 4 fail — the same pre-existing MLB/NFL star-index date tripwires as Phase 20. No test
needed changing (none read `body.connection` from choose). Not run: `next build`, browser, live Meta (routes 404
while the flags are off).

**State:** branch `after-app-review`, last commit `1e803523`; all Share to social work (Phases 5–21) and the
game-themes work are uncommitted. Nothing pushed/deployed. Post now flags off. Out of scope still: turning Post now
on, Phase 7 (on hold), D39 (open question: `publish_sent_at` column), `main`, `supabase db push`, Production env.

**Next:** no numbered phase is queued. Per plan §5.1, run `/code-review high` (Opus 5.5) on the uncommitted work
before Andrew is asked to commit/deploy; Andrew decides on committing and on D39.
