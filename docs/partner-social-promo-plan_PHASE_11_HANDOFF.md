# Share to social — Phase 11 handoff (One connection store, one post step)

**For Andrew (plain English):** This was a tidy-up of the hidden "Post now" code. Partners still can't see or use
it. The Instagram and Facebook halves had near-identical copies of the same code (how a connection is loaded,
how its key is read, how a partner picks an account). There is now one copy that works for both, so a fix made to
one can't be forgotten on the other. Nothing a partner sees changed. The one small rule change: a saved "pick your
Instagram account" list now only accepts Meta's numeric account ids, which is what Meta always sends anyway.

Nothing is committed or deployed (branch `after-app-review`). No database change, no new setting, no cost change.
Nothing needs you. Phase 12 (the share sheet's "couldn't load your address" message) and Phase 13 (two lines of
docs) can start any time.

---

## For the next agent

### 1. Next phase
**Phase 12** (share sheet: details load error + helper rename), `docs/partner-social-promo-plan.md` §5.6.
Model: **Sonnet 5.5, effort medium** (§5.1). **Phase 13** (game-themes rule wording, §5.7): **Haiku 5.5, low**.
They're independent of each other and of Phase 11. With 8–11 done, the code-side blockers to turning Post now on
are cleared, but turning it on is Andrew's call (checklist in the Phase 8 handoff) and still needs Meta setup and
`/code-review high` first. Out of scope: re-attaching the Post now box, migrations, `supabase db push`, env
changes, crons, `vercel.json`.

### 2. Starting state
- Branch `after-app-review`, last commit `1e803523 docs: game themes plan`. Phase 11 is **uncommitted**, on top
  of the uncommitted Phase 5–6, 8, 9, 10 and game-themes work (see `git status`). Nothing pushed or deployed.
- No data touched, no migration, no env var. Post now is still sealed (`SOCIAL_POST_NOW_ON_SHEET = false` in
  `lib/social/flags.ts`), so every `/api/owner/social/**` route answers 404 in real environments.
- Model used for this phase: Opus 5.5, as the plan names.

### 3. Decisions made in this phase (and why)
- **No wrappers kept.** The plan allowed keeping the old names "only if that makes the diff much smaller". It
  wouldn't have: only ~15 test call sites and 6 routes used them. All of these are gone: `loadInstagramConnection`,
  `loadFacebookConnection`, `instagramPageToken`, `facebookPageToken`, `saveInstagramConnection`,
  `saveFacebookConnection`, `savePendingInstagramChoice`, `savePendingFacebookChoice`, `chooseInstagramAccount`,
  `chooseFacebookPage`, `disconnectInstagram`, `disconnectFacebook`, and the types `InstagramConnection` /
  `FacebookConnection`.
- **No `savePendingChoice(provider, …)`.** The plan listed it, but nothing in production saves one pending row:
  the callback batches `pendingChoiceRow`s into one upsert. Tests build rows the same way the callback does
  (`connectionRow` / `pendingChoiceRow` + `saveSocialConnections`).
- **The spec is smaller than the plan's sketch.** `PROVIDERS` holds `label`, `parseChoice` and `fetchChoices`.
  - `idOfChoice` became one `choiceId(choice)` that works on either choice shape. That avoids generic gymnastics
    and is the same in effect.
  - `toChoice` stayed as the callback's `instagramChoicesOf` / `facebookChoicesOf`, because those take Meta's raw
    shapes, which the store doesn't otherwise see.
- **`advanceCommon(row, nowMs)` takes no connection or spec.** After Phase 9, only three steps are shared
  (upload-abandon → not open → lease held), and none of them uses a connection. Each provider's order after that
  is untouched (plan §5.5 "Updated after Phase 9").
- **`createInstagramPost` / `createFacebookPost` → one `createSocialPost(input)`.** The provider and account id
  come from `input.connection`. Once the connection type was unified, the posts route could make a single
  `loadConnection(venueId, provider)` call. The route's unreachable "`created` is null" branch went with it.
  `publishInstagramPost` / `publishFacebookPost` were left as they are (out of #8's scope).
- **Facebook's `pageId` field → `accountId` (from `external_account_id`, not `page_id`).** Every Facebook row
  has `page_id = external_account_id`: both are set from the Page id by `facebookConnectedAccount`, and were in
  Phase 6 too. Nothing was ever deployed, so no row can differ.
- **Route log tags were left alone.** `[SocialInstagram]` / `[SocialFacebook]` in the routes are correct for their
  route. The plan's complaint was Facebook paths *inside* `socialConnections.ts` logging as `[SocialInstagram]`.
  Those now log as `[SocialConnections]` with `provider`.

### 4. Files changed
- `lib/social/socialConnections.ts` (rewritten middle; 451 → 399 lines):
  - New:
    - `SocialChoice<P>`, `SocialConnection<P>`, `ProviderSpec<P>` and `PROVIDERS`.
    - `choiceId` and `parseChoices` (applies `META_ID`).
    - `loadConnection`, `connectionToken`, `chooseConnection`, `disconnectConnection` (renamed from the private
      `disconnectProvider`, now exported).
    - The `LOG` prefix.
  - `pendingChoiceRow` is now generic over the provider, so its `choices` are typed to that provider.
  - Unchanged: `connectionRow`, `saveSocialConnections`, `markSocialReconnectNeeded`,
    `markDeclinedReconnectNeeded`, `deleteSocialMedia`, `removeMetaUserSocialConnections`, the views, and the
    `*ConnectedAccount` / `*ChoicesOf` helpers.
- `lib/social/socialPosts.ts`:
  - New: `advanceCommon` and `createSocialPost`.
  - Uses `SocialConnection<"instagram" | "facebook">`, `connectionToken` and `connection.accountId`.
  - `advanceInstagramPost` / `advanceFacebookPost` start with `advanceCommon`.
- Routes:
  - `app/api/owner/social/posts/route.ts`: one `loadConnection` + `createSocialPost`.
  - `status/route.ts`.
  - `instagram/route.ts` and `facebook/route.ts`: `disconnectConnection`.
  - `instagram/choose/route.ts` and `facebook/choose/route.ts`: `chooseConnection` + `loadConnection`.
  - The callback route didn't change.
- `tests/lib.social-publish.test.ts`:
  - **Old tests:** only call sites changed (function names; the setup helpers `connectVenue`, `connectFacebook`
    and the pending-choice test build rows with `connectionRow` / `pendingChoiceRow`). No expected value changed.
  - **New, two `describe` blocks at the end (14 tests):**
    - AAD slots pinned as literal strings for both providers and both fields.
    - The numeric-id rule on both providers.
    - Instagram choose through the generic path (`not_found` makes no Graph call; the pick's Page token lands in
      the Instagram slot).
    - A refused token while choosing → `reconnect`, logged as
      `[SocialConnections] choose-fetch-failed { provider }`.
    - A 5-case × 2-provider prelude table through `pollSocialPost`: abandoned upload, lease held, past every TTL,
      another account, disconnected. Each case checks the status, the error and the number of Meta calls.
- `docs/partner-social-promo-plan.md`:
  - The status line.
  - §5.1 row 11 marked done.
  - A note in §5.4 that Phase 11 removed the wrappers.
  - §5.5 "As built (Phase 11)".
  - The §9 Phase 11 standing rule.

### 5. Facts and traps
- **Per-provider differences that are intentional (don't "fix" them):**
  - Past the TTL, Instagram fails `expired` with no Graph call. A Facebook Reel with a video id asks Meta once and
    then ends `expired`, or `unconfirmed` if its finish was sent.
  - A wrong account or a missing connection fails an Instagram post `reconnect`. The same Facebook Reel waits
    (`processing`) until it's past the TTL.
  - The prelude table pins all of these.
- `PROVIDERS` uses the mapped type `{ [P in SocialProvider]: ProviderSpec<P> }`, so `PROVIDERS[provider]`, with
  `provider: P`, types correctly in generic code (TS 5.9). `parseChoices` assigns
  `PROVIDERS[provider].parseChoice` to a `ProviderSpec<P>["parseChoice"]` variable so the generic carries
  through.
- `parseChoices` now skips a non-object entry. The old code would have thrown on a `null` entry. Stored data never
  has one.
- The test fakes are unchanged from Phase 10 (`dbWrites`, `dbFaults`, `cryptoSwitch`).
- Phase 8's trap still applies: the contract test's comment stripper treats `/*` inside a `//` comment as the start
  of a block comment.
- **Mutation checks done** (each change reverted by exact string replace, not git):
  - Instagram's TTL moved into `advanceCommon` → 1 test fails.
  - The lease check dropped → 3 fail.
  - The old "any non-empty id" rule → 1 fails.
  - The old Facebook log tag → 1 fails.

### 6. How to verify (what was run)
- `npx vitest run tests/lib.social-publish.test.ts` → 86/86 pass (72 before + 14 new).
- `npx vitest run tests/social-publish-contract.test.ts tests/lib.social-meta-callbacks.test.ts` → pass.
- `npm run test` → 6366 pass, 13 skipped, 4 fail. The 4 failures are the MLB/NFL star-index staleness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`). They fail because of today's date, are the same 4 as in
  the Phase 8–10 handoffs, and are unrelated.
- `npx tsc --noEmit`: clean.
- `npx eslint lib/social app/api/owner/social components/owner/social tests/lib.social-publish.test.ts tests/social-publish-contract.test.ts`:
  clean.
- **Not run:**
  - `npm run build`.
  - Anything against real Meta. Post now is sealed and there's no test user.

### 7. Open questions / residual risks
- None new. The Phase 10 item still stands: when Post now comes back, check on Hightop's own account that
  declining Instagram at reconnect really stops the old token (Phase 10 handoff §7).
- Cost: unchanged. The posts route reads one connection, as before (it used to read only the requested provider's
  too).

### 8. First steps for Phase 12
1. Read plan §5.6.
2. Read `components/owner/social/ShareToSocialSheet.tsx` (the details effect, about line 246) and
   `components/owner/share/ShareDetailsPanel.tsx` (the `getVenueShareDetails` client helper, about line 50).
3. Run `npx vitest run tests/components.share-to-social-sheet.test.ts` first, to get a green baseline.
4. Check the sheet at 350 px when done (CLAUDE.md: nothing under 12 px, theme tokens, `min-h-11` for the Try again
   button).

Model: **Sonnet 5.5, effort medium**.
