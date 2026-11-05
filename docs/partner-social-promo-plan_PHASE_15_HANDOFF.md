# Share to social — Phase 15 handoff (connect callback: no Page to post to, stale rows)

**For Andrew (plain English):** More behind-the-scenes work on "Post now" (posting straight to Instagram or a
Facebook Page). Partners still can't see or use Post now. Two things changed in what happens after a partner logs in
with Facebook to connect:

- If Instagram connected but we found no Facebook Page they're allowed to post to, the message used to just say
  **"Connected."** Now it says: **"Instagram is connected. We didn't find a Facebook Page you can post to. To post
  there, you need permission to create posts on the Page. Then connect again."**
- If a partner reconnects and we find nothing to post to on one side (no Instagram account, or no Page), an older
  connection on that side from the same Facebook login now shows **"Reconnect"** instead of still saying
  "Connected". Before, only switching a permission off did that.

Nothing is committed or deployed (branch `after-app-review`). No database change, no new setting, no cost change
(at most one extra tiny database write per login, only when something is gone). Nothing is needed from you.
Phase 16 still has to be done before Post now can be turned on for partners.

---

## For the next agent

### 1. Next phase
**Phase 16** (Post now panel: ready to come back), `docs/partner-social-promo-plan.md` §5.10. Model: **Sonnet 5.5,
effort medium** (§5.1). It comes after 15 because the panel shows 15's new result copy (`facebook_no_page` is now a
`SocialConnectResult`, so it's just one more value of `?socialResult=`). **17** (share sheet saved handle, Sonnet 5.5
medium) can run any time. **18** (clean-ups, Opus 5.5 medium) goes last.
Out of scope everywhere: turning the Post now box back on (Andrew decides; the checklist is in the Phase 8 handoff),
migrations, `supabase db push`, env changes, crons, `vercel.json`.
Open decision for Phase 16: **D38** (Caption box inside the Post now panel, default yes, plan §10). Not answered
yet; build the default.

### 2. Starting state
- Branch `after-app-review`. Last commit `1e803523 docs: game themes plan`. Phase 15 is **uncommitted**, on top of
  the uncommitted Phase 5–6, 8–14 and game-themes work (see `git status`). Nothing pushed or deployed.
- No data touched, no migration, no env var. Post now is still sealed (`SOCIAL_POST_NOW_ON_SHEET = false` in
  `lib/social/flags.ts`), so every `/api/owner/social/**` route, including the callback, answers 404.

### 3. Decisions (and why)
- Built exactly as plan §5.9. Recorded in §5.9 "As built (Phase 15)".
- **D37 kept:** a `choose` on either side still reads `choose_account`, even if the other side was declined or has
  nothing linked. A comment above `socialConnectResult` says so, so a review doesn't raise it again.
- **Same Meta user only** for the mark; a row from another Facebook user is never touched.
- **No paging on `/me/accounts`** (limit 100). A user with over 100 Pages could get a wrong "Reconnect"; accepted,
  and written as a "Trap" comment in the callback route above `const accounts =`.
- The mark is skipped entirely (no DB call) when nothing is gone.

### 4. Files changed
- `lib/social/socialTypes.ts` — `SocialConnectResult` gains `"facebook_no_page"`.
- `lib/promo/promoCopy.ts` — `SOCIAL_POST_COPY.results.facebook_no_page` (the copy above; `satisfies` forces it).
- `lib/social/socialPublishRules.ts` — `socialConnectResult`: Instagram `saved` + Facebook `none_linked` →
  `facebook_no_page`; D37 comment. New pure helpers: `SocialGoneConnection` type, `SOCIAL_GONE_REASONS`
  (`not_granted` → `"declined at reconnect"`, `none_linked` → `"no account at reconnect"`), and
  `socialGoneConnections({ instagram, facebook })`.
- `lib/social/socialConnections.ts` — `markDeclinedReconnectNeeded` **renamed** to
  `markGoneReconnectNeeded(venueId, metaUserId, gone: SocialGoneConnection[])`: one filtered update per reason
  (venue + same `meta_user_id` + `status = 'active'` + provider in that group), returns rows changed, throws on a DB
  error. No other caller existed.
- `app/api/owner/social/meta/callback/route.ts` — `markDeclined()` → `markGone(outcomes)`; called on
  `missing_permissions` (both `not_granted`) and after the upsert with this login's outcomes; never on `error`.
  Log tags now `[SocialMeta] gone-marked-reconnect` / `[SocialMeta] gone-mark-failed`. Header comment updated.
- `tests/lib.social-publish.test.ts` — fake DB gets `dbFaults.update`; the result table row and the 16-pair check now
  expect `facebook_no_page`; the old "one account: connects with the Page token" test now expects
  `facebook_no_page` (its Pages are `ANALYZE`-only); six new "Phase 15" tests (rules; Instagram `none_linked` marks
  the old IG row; Facebook `none_linked` marks the old FB row; other user / other venue untouched; both saved → no
  update; one declined + one none_linked → two updates; failing mark → `gone-mark-failed` logged, result stands).
- `docs/partner-social-promo-plan.md` — status line, §5.1 row "Done", §5.4 table row note, §5.9 "As built", §9
  Phase 10 standing rule extended.

### 5. Facts and traps
- Earlier handoffs (Phase 10, 11, 14) and plan §5.4 still mention `markDeclinedReconnectNeeded` /
  `declined-mark-failed`; those are history. The live names are `markGoneReconnectNeeded` / `gone-mark-failed`.
- **Unverified with Meta** (no test user here, same as Phase 10): that a reconnect finding no account/Page means the
  old row's token can't post. Check once on Hightop's own account when Post now comes back. If an old token still
  posts, remove the two `markGone()` calls in the callback route; the new result copy stands either way.
- The fake DB in the test applies `update` to every matching row and records each write in `dbWrites`; use
  `dbFaults.update = true` to make updates fail (reset in `beforeEach`).

### 6. Build, run, test
- `npx vitest run tests/lib.social-publish.test.ts` → 106 pass.
- `npx tsc --noEmit` → clean. `npx eslint` on the changed files → clean.
- `npm run test` → 6388 pass, 13 skipped, 4 fail. The 4 are the MLB/NFL star-index staleness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`), failing on today's date; unrelated and already noted in
  the Phase 14 handoff.
- Not run: `npm run build` (no route/page shape changed). No browser check (the callback is sealed and server-only).

### 7. Open questions for Andrew
- None new. D38 (Phase 16 caption box) is still open, default yes.

### 8. Recommended first steps for Phase 16
1. Read plan §5.10 and the Phase 8 handoff §8 checklist.
2. In `components/owner/social/SocialPostNowPanel.tsx`: read `socialResult` / `socialVenue` with
   `useSearchParams()` (show only when `socialVenue === venueId`), drop the `connectResult` and `caption` props, add
   the Caption box (D38 default) using `promoCaption(...)` and `socialCaptionProblem`, and add `catch` →
   `setNotice(COPY.results.error)` to `choose()` / `disconnect()` (keep `confirmDisconnect` open on a failed
   disconnect).
3. Extend `tests/social-publish-contract.test.ts` and add panel unit tests as §5.10 lists; run `npm run test`,
   `npx tsc --noEmit`, `npm run lint`, and `npm run build` (Suspense check for `useSearchParams`).
