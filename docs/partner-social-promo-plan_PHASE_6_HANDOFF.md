# Share to social: Phase 6 handoff (Facebook Page "Post now")

**For Andrew:** partners can now post a Post or a Reel to their **Facebook Page**, as well as to Instagram, from
the same "Post now" box. One Facebook login connects both. As you chose, the box is **still hidden**: the Share to
social sheet looks exactly as it does today. Nothing is committed, deployed or switched on, and no database change
was needed (the Phase 5 tables already allowed Facebook). Facebook Stories are not offered. Also in this change: the
Instagram handle tick no longer says "Add yours". Cost: no change. Each sheet open is still one status request (it
now covers both), and posting to both means two posts out of the same 10-a-day limit. Nothing needs you until you
want Post now back on the sheet. When you do, try a real Post and Reel on the Hightop Facebook Page (runbook
§"Phase 6 setup").

## For the next agent

### 1. Next phase
**Phase 7, Post later + weekly** (Opus 5.5, xhigh), **on hold** (plan D32/D35) until Andrew wants automatic posting.
Phase 7 needs the Post now box back on the sheet first (as one small option, D32), and his go-ahead for the
15-minute cron in `vercel.json` (D15). Out of scope until then: rendering `SocialPostNowPanel` anywhere.
Still open before any deploy: `/code-review high` on Phases 1–6, a real Meta test of Phases 5–6, and music picks.

### 2. Starting state
- Branch `after-app-review`. Last commit `1e803523` (docs: game themes plan). **Phase 6 is uncommitted**, and so are
  the Phase 5 follow-ups (D32–D34) and the game-themes work. Nothing pushed or deployed.
- No migration. `20261104193338_social_publishing.sql` (applied 2026-11-04) already has `provider in ('instagram',
  'facebook')` on both tables. No data was written. Env: unchanged (`NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED` is not set
  anywhere, so every `/api/owner/social/**` route answers 404).
- Main is frozen for the App Store review: never push `main`, `supabase db push`, or change Production env without Andrew.

### 3. Decisions (don't re-ask)
- **D35 (Andrew, 2026-11-04):** build Phase 6 and add it to the hidden Post now box; the sheet stays as it is.
- Claude's calls: **Facebook = Post + Reel only** (the Pages API has `photo_stories`, but the plan's table says "Later,
  optional"); one status route `GET /api/owner/social/status` for both providers (it replaces `GET …/instagram`, so a
  sheet open stays one request); a **separate disconnect per provider**; the daily cap (10 per venue per 24 h) is
  shared across providers; Instagram and Facebook choices are **independent** (several Pages → a Page picker even if
  Instagram connected); a Page qualifies when its `tasks` include `CREATE_CONTENT` or `MANAGE` (or Meta returns no
  `tasks`); a Facebook Reel that hasn't finished within **1 h** is failed (`SOCIAL_FACEBOOK_REEL_TTL_MS`); on a
  reconnect, a provider that no longer qualifies keeps its old row (Meta's refusal then marks it "Reconnect").

### 4. Files
- `lib/social/metaGraph.ts`: `fetchMetaPages` (one `/me/accounts` call with `tasks` + Instagram), `instagramAccountsOf`,
  `publishablePagesOf`; `fetchInstagramAccounts` now wraps them. New: `publishFacebookPhoto` (`POST /{page}/photos`
  `url`, `caption`, `published=true` → `post_id`), `startFacebookReel`, `uploadFacebookReel` (rupload, hosted
  `file_url`, `Authorization: OAuth` header), `finishFacebookReel` (`video_state=PUBLISHED`, `description`),
  `fetchFacebookReelStatus` (`fields=status,permalink_url`).
- `lib/social/socialPublishRules.ts`: Facebook error codes in `classifyGraphError` (80001, 324, 368, 1363xxx),
  `facebookReelStep`, `SOCIAL_FACEBOOK_REEL_TTL_MS`, `safeFacebookPermalink`.
- `lib/social/socialConnections.ts`: `loadFacebookConnection`, `facebookConnectionView`, `facebookPageToken`,
  `saveFacebookConnection`, `savePendingFacebookChoice`, `chooseFacebookPage`, `disconnectFacebook`;
  `markInstagramReconnectNeeded` renamed to `markSocialReconnectNeeded`.
- `lib/social/socialPosts.ts`: state-machine diagram for Facebook in the file; `createFacebookPost`,
  `publishFacebookPost`, `advanceFacebookPost`; route-facing `publishSocialPost`, `pollSocialPost`,
  `listRecentSocialPosts` (both providers). `pollInstagramPost` and `listRecentInstagramPosts` were removed.
- `lib/social/socialTypes.ts`: `FacebookConnectionView`, `FacebookPageChoice`, `SocialStatusResponse`,
  `providerSupportsFormat`, `SocialPostView.provider`, `SocialConnectResult` `facebook_only`.
- `lib/social/metaConfig.ts`: `META_FACEBOOK_REQUIRED_PERMISSIONS`.
- Routes: new `app/api/owner/social/status/route.ts` (GET), `…/facebook/route.ts` (DELETE),
  `…/facebook/choose/route.ts` (POST). `…/instagram/route.ts` is DELETE only now. `…/posts` accepts `provider:
  "facebook"` (Story → 400); `…/posts/[id]` and `…/publish` dispatch by the post's provider. The callback
  (`…/meta/callback`) connects each provider whose permissions were granted, logs as `[SocialMeta]`.
- UI: `components/owner/social/InstagramPostPanel.tsx` → **`SocialPostNowPanel.tsx`** (git mv), one row per provider,
  per-provider sending state and Reel poll. Not rendered anywhere. Copy: `SOCIAL_POST_COPY` in
  `lib/promo/promoCopy.ts`, rewritten for both providers.
- Also: `ShareToSocialSheet.tsx` handle tick shows no value until a handle is saved; `addHandle` copy removed.
- Tests: `tests/lib.social-publish.test.ts` (+13 Phase 6 tests: photo, double tap, dead-request photo never retried,
  Reel start/upload/finish/poll, errors + reconnect, token slot, disconnect/deauthorize, Recent posts, posts route,
  rules, callback for both / Page picker / Facebook-only / Instagram-only; flag-off list now 10 handlers);
  `tests/social-publish-contract.test.ts` (+1: Facebook permissions, token only in the upload header).
- Docs: plan status, D35, §5.1 row, §9 Phase 6 rule; runbook §"Phase 6 setup".

### 5. Facts and traps
- Meta docs read 2026-11-04 (docs show v27.0; we call v26.0, `META_GRAPH_VERSION`): photo `message` is deprecated,
  use `caption`; photos ≤10 MB (our 8 MB limit applies); Reels 9:16, 3–90 s, 24–60 fps, AAC 48 kHz 128 kbps+ (ours
  fits); **30 API Reels per Page per 24 h**; the hosted file URL must be fetchable by `facebookexternalhit/1.1`, and
  fbcdn URLs are rejected.
- **Unverified:** whether Supabase signed URLs pass Meta's `facebookexternalhit` fetch (robots.txt); whether
  rupload needs `appsecret_proof` when "Require App Secret" is on; the Reel status shape in practice (Meta's examples
  mix "complete"/"completed"; both are handled); `permalink_url` on the video (it may be relative, which is handled,
  or missing, which shows no link); Meta's docs also say `upload_phase` "complete" in one table but "finish" in the
  enum and examples. We send "finish".
- A Facebook photo left `publishing` by a request that died is **failed** with "Couldn't post", even though it may
  be on the Page. That's on purpose: retrying could post it twice.
- `.env.local` was not touched.

### 6. Build, run, test
- `npx tsc --noEmit` clean; `npx eslint lib/social app/api/owner/social components/owner/social lib/promo/promoCopy.ts`
  plus the two test files clean; `npx vitest run`: 485 files pass, only the 4 known stale sports-bingo snapshot tests
  fail (same as before Phase 6).
- Not run: `npm run build` (it shares `.next` with Andrew's dev server). Not seen in a browser (the panel isn't rendered).
  No real Meta call made.

### 7. Open questions / waiting on Andrew
1. When to bring Post now back on the sheet (D32/D35). Then a real test on the Hightop Page and Instagram.
2. From Phase 5: redirect URIs in Meta, the flag on a Preview, the Terms "posting on your behalf" clause, the Meta app icon.

### 8. First steps for the next agent
If Andrew wants Post now back: render `<SocialPostNowPanel>` in `ShareToSocialSheet.tsx` only when
`isSocialPublishEnabled()` is on, as one small option under Share / Download (D32). Restore the dashboard's
`?socialResult` / `socialVenue` read (removed in the D33 follow-up), and update the contract test that forbids the
panel on the sheet. Then go through the real-account checks in §5 "Unverified". Phase 7 only after that (Opus 5.5, xhigh).
