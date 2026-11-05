# Share to social — Phase 19 handoff (nothing that may be live is hidden or posted twice)

**For Andrew (plain English):** Three safety fixes to the hidden "Post now" feature. Post now is still switched
off, so no partner sees any of this yet.
1. **Disconnect no longer hides a post that may already be on Instagram or Facebook.** Before, tapping Disconnect
   (or removing the app in Facebook) marked every unfinished post "cancelled", even one Meta may already have
   published. Now such a post shows "Not confirmed", and the partner is told to check Instagram/Facebook before
   posting again. Posts that can't have gone out are still cancelled. Either way the picture and caption are
   deleted, as the privacy policy says.
2. **A server hiccup after the post was sent no longer says "Try again".** Before, if the post went out and then
   our own database write failed, the partner was told "Couldn't post. Try again", and trying again would post
   it twice. Now the screen says "Instagram is processing your post…", waits for Meta's answer, and keeps the Post
   button off until it has one. The same now happens if the phone loses the connection at that moment (I added
   this one; it wasn't in the plan).
3. **The code that turns Post now back on can't wire it up wrong any more.** Before, the instructions in the code
   would have sent a Reel to Instagram as a Story picture. They now go through one small tested helper.

Not committed, not deployed. No database, env, cron or cost change: Disconnect does the same or fewer database
writes. Nothing needed from you. Two small choices I made beyond the plan are under "Open questions" below. Next:
Phase 20 (partner-facing wording).

## For the next agent

### 1. Next phase: Phase 20 — The right message (plan §5.14)
Third review #4, #5, #6: the connect result when one provider is declined and the other has nothing linked
(`socialConnectResult`), the Instagram-only caption limits applied per provider (`socialCaptionProblem(caption,
provider)`), and the connect-result notice that comes back on every remount (drop `socialResult` / `socialVenue`
from the URL; Cancel clears the notice). Confirm each finding against the code before changing anything.
**Out of scope:** turning Post now on (`SOCIAL_POST_NOW_ON_SHEET`, `NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED`), Phase 7,
D39 (`publish_sent_at` column, needs a migration), anything on `main`, `supabase db push`, Production env.
Phase 21 (clean-ups #8–#10) comes after 20.

### 2. Starting state
- Branch `after-app-review`. Last commit `1e803523` (docs: game themes plan). **All Share to social work from
  Phases 5–19 is uncommitted**, along with the game-themes work. Nothing pushed or deployed.
- No migration, no data change, no script run, no env change. Post now flags are still off, and every
  `/api/owner/social/**` route still answers 404 (Phase 8 seal).

### 3. Decisions already made (don't re-ask)
- **Any `publishing` post counts as "may be live"** at Disconnect, as the plan says, even an Instagram or Facebook
  Reel post that hasn't been marked yet (its next fenced write would fail, so it can't actually go live). The cost
  is an over-cautious "Not confirmed" in a rare case. In return the rule doesn't rely on every future Meta call
  having its own mark.
- **The claim counts as "after the claim"** for `unsure`: a claim write whose answer is lost may still have landed,
  and Recent posts would later take the stale lease over and publish the post.
- **Beyond the spec (§5.13 "As built" explains why):** (a) the panel also polls when the publish answer is lost on
  the client (`publishUnclear`: fetch throws, or a body with no `error`, e.g. Vercel's 504); (b) "Still processing"
  after the 5-minute poll keeps the Post button off for the same media (before, it turned it back on).
- The unconfirmed update on Disconnect clears `external_post_id` for both providers. A Facebook Reel's video id is
  still in `container_id`, so nothing is lost, and the Instagram mark (a container id) never outlives the post, as
  `finish()` does.
- The privacy text (`app/privacy/page.tsx:89`, "until they are published or cancelled") was **not** changed: files
  are still deleted at the same moment.

### 4. Files changed
- `lib/social/socialPublishRules.ts`: new `SocialPostMarks` (minimal row shape), `publishSent` (moved from
  socialPosts), `finishSent` (moved, now also checks `provider === "facebook"`), and `socialPostMayBeLive`.
- `lib/social/socialPosts.ts`: imports those (local copies removed). New `publishFromClaim(row, steps)` wraps
  claim + provider steps; a throw → `{ ok: false, code: "unsure", postId }` + `[SocialPost] publish-unsure` log.
  `PublishOutcome` gained that variant. `publishInstagramPost` / `publishFacebookPost` call it. Header comment
  has a Phase 19 paragraph.
- `lib/social/socialConnections.ts`: `cancelOpenPosts` → `endOpenPosts(connectionIds)` (one read + ≤2 by-id
  updates, fenced; returns the files of the posts it ended). New `UNCLAIMED_OPEN_STATUSES`. `removeConnections`
  calls it. A failed read now throws.
- `lib/social/socialTypes.ts`: `SocialPublishUnsureResponse`.
- `app/api/owner/social/posts/[id]/publish/route.ts`: `unsure` → 500 `{ ok: false, error: "We couldn't confirm
  the post yet.", code: "unsure", postId }`. The catch (pre-claim only) is unchanged.
- `components/owner/social/SocialPostNowPanel.tsx`: `Refusal` type, `publishUnclear`, the publish step polls
  `created.postId` on an unclear answer, `usedOne()`, `stillWaiting` disables the button, and the `postNow` guard
  for `slow` on the same blob.
- `components/owner/social/postNowProps.ts` (**new**, pure): `postNowProps(sheet: PostNowSheetState)` →
  `SocialPostNowPanelProps`.
- `components/owner/social/ShareToSocialSheet.tsx`: comment only (the mount snippet).
- Comments: `lib/social/metaCallbacks.ts`, `lib/social/socialProviderRoutes.ts` (`disconnectRoute` doc).
- Tests: `tests/lib.social-publish.test.ts` (two "Phase 19" describes, 11 tests, plus fake-DB changes),
  `tests/components.social-post-now-panel.test.ts` (5), `tests/components.post-now-props.test.ts` (**new**, 5),
  `tests/social-publish-contract.test.ts` (1 new: mount only via `postNowProps`).
- Docs: plan status line, §5.1 row 19 "Done", §5.13 "As built", §9 standing rule "(Phase 19)", and Phase 8 handoff
  checklist step 3.

### 5. Facts and traps
- **The fake DB's `maybeSingle` used to swallow errors** (`error: null` always). That's fixed, so a test can now
  fail a fenced write via `dbHooks.onUpdate = (table, patch) => (… ? "fail" : undefined)`. The hook runs before
  rows are matched, so it can also play a racing request (see "a post marked after Disconnect read it…").
- `metaRoute` may now be async, so a test can run Disconnect while Meta is "answering" media_publish.
- PostgREST can't compare two columns, so the cancel fence uses `external_post_id is null`. That is safe because on
  an open post `external_post_id` is set only by the two marks (doc comment on `socialPostMayBeLive`). Keep it that
  way: a new write that sets `external_post_id` on an open post would break the fence.
- `socialPosts.ts` must keep exactly one `.update(` (contract test). The Disconnect updates live in
  `socialConnections.ts` on purpose.
- The 4 MLB/NFL star-index test failures are date tripwires, pre-existing and unrelated.

### 6. Build / test
- `npm run test`: 6419 pass, 4 fail (the star-index tripwires above). Social files: 174 pass across the six social
  test files.
- `npx tsc --noEmit` clean. `npx eslint lib/social components/owner/social app/api/owner/social app/api/social` plus
  the four touched tests: clean. `npm run lint` on the whole repo: 309 errors, **all** in the stray
  `tmp/group-games-phase-4/release/` build output (parsing `.d.cts` files), none in source. Not caused by this
  phase; leave it to Andrew. `next build` wasn't run (the panel isn't mounted anywhere).
- Not done: no live Meta call or browser run. The routes 404 while Post now is off, and Meta is faked in tests.

### 7. Open questions for Andrew
- OK to keep the two additions beyond the plan (§3, "Beyond the spec" (a) and (b))? The default is yes. Both lean
  toward "never post twice".
- Optional wording: the privacy text could say "published, failed or cancelled". The behaviour is unchanged, so
  this isn't needed.
- D39 (§10) is still open.

### 8. First steps for Phase 20
Read plan §5.14, then `socialConnectResult` (`lib/social/socialPublishRules.ts`, near the end), `socialCaptionProblem`
(top of the same file), `SocialPostNowPanel.tsx` (`captionProblem` and the `notice` state) and
`app/api/owner/social/posts/route.ts`. Read `docs/navigation-unification-plan.md` "Standing rules" before touching
the URL. Model: **Sonnet 5.5, medium** (plan §5.1).
