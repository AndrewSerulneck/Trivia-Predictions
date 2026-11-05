# Share to social — Phase 10 handoff (Connect callback: the right reason, one save)

**For Andrew (plain English):** This is more behind-the-scenes work on "Post now". Partners still can't see or use
it. It fixes what happens after a partner connects their Instagram and Facebook Page:

1. **The message now gives the right reason.** If a partner switches Instagram off in Facebook's permission screen,
   we used to tell them to "switch to a professional account and link it to the Page", which they may already have
   done. Now they read: "Your Facebook Page is connected. Instagram wasn't switched on, so to post there, connect
   again and leave Instagram on." There's a matching message for the Facebook side.
2. **The save is all or nothing.** Before, Instagram could be saved and then Facebook could fail, and the partner
   was told "Couldn't connect" while half of it had in fact connected. Now both save together or neither does.
3. **An old connection that lost its permission shows "Reconnect" right away**, not only after a post fails.

Nothing is committed or deployed (branch `after-app-review`). No database change, no new setting, no cost change
worth mentioning. One thing to check later, on Hightop's own account, when Post now is switched back on (see §7).
Phase 11 (a tidy-up of the same code) can start now.

---

## For the next agent

### 1. Next phase
**Phase 11** (one connection store, one post step: refactor only, no behaviour change),
`docs/partner-social-promo-plan.md` §5.5. Model: **Opus 5.5, effort high** (§5.1). Phases 9 and 10 are both done,
so Phase 11 can start. 12 and 13 can run any time. Out of scope everywhere: re-attaching the Post now box (Andrew's
call; checklist in the Phase 8 handoff), migrations, `supabase db push`, env changes, crons, `vercel.json`.

### 2. Starting state
- Branch `after-app-review`, last commit `1e803523 docs: game themes plan`. Phase 10 is **uncommitted**, on top of
  the uncommitted Phase 5–6, 8, 9 and game-themes work (see `git status`). Nothing pushed or deployed.
- No data touched, no migration, no env var. Post now is still sealed (`SOCIAL_POST_NOW_ON_SHEET = false` in
  `lib/social/flags.ts`), so the callback answers 404 in every real environment.

### 3. Decisions made in this phase (and why)
- **The table is a pure function.** `socialConnectOutcome` and `socialConnectResult` live in
  `lib/social/socialPublishRules.ts`, so all 16 outcome pairs are unit-tested without the route. Precedence:
  1. Both `not_granted` → `missing_permissions`.
  2. Either `choose` → `choose_account`.
  3. Neither `saved` → `no_instagram`.
  4. Otherwise: Instagram `saved` → `facebook_declined` if the Facebook side was `not_granted`, else `connected`.
  5. Otherwise: Facebook `saved` → `instagram_declined` if the Instagram side was `not_granted`, else
     `facebook_only`.
  This matches every row of plan §5.4's table.
- **The reconnect mark is built but not verified against Meta.** The plan said to check with a Meta test user
  first. There is no Meta test user or Graph access here. It was built anyway, for these reasons:
  - The permissions come from `/me/permissions`, which is the app grant for that Facebook user, not one token's
    scope.
  - A Page token made from that user only has what the user granted the app.
  - The downside is small. Today a post with that token would fail with `permission` and mark the row anyway.
  Plan §5.4 "As built" says how to check it later and how to take it out.
- **The mark also runs on `missing_permissions` and `no_instagram`.** Those logins finished, and they show a
  declined permission just as clearly. It never runs on `error` (so `error` still means nothing changed). It only
  touches `status = active` rows of the same venue and the same `meta_user_id`.
- **The mark is one filtered update** (`markDeclinedReconnectNeeded`), not a load followed by
  `markSocialReconnectNeeded(id)`. One DB call instead of two, and only when a permission was declined.
- **The old savers were kept as one-line wrappers.** `saveInstagramConnection`, `savePendingInstagramChoice`,
  `saveFacebookConnection` and `savePendingFacebookChoice` now call the builders and `saveSocialConnections`, so
  the choose routes and the tests didn't change. Phase 11 can fold them into its generic versions.
- **`SOCIAL_POST_COPY.results` is typed with `satisfies Record<SocialConnectResult, string>`.** A new result
  can't ship without copy. `promoCopy.ts` now has a type-only import from `lib/social/socialTypes.ts`.

### 4. Files changed
- `lib/social/socialTypes.ts`: `SocialConnectResult` gains `instagram_declined` and `facebook_declined`.
- `lib/promo/promoCopy.ts`: the two new results' copy (exactly the plan's wording) and the `satisfies` line.
- `lib/social/socialPublishRules.ts`: added at the end, `SocialConnectOutcome`, `socialConnectOutcome` and
  `socialConnectResult`.
- `lib/social/socialConnections.ts`:
  - New: `SaveBase` (now exported) and `SocialConnectionRow`.
  - New: `ConnectedAccount`, with `instagramConnectedAccount` / `facebookConnectedAccount`.
  - New: `instagramChoicesOf` / `facebookChoicesOf`.
  - New: `connectionRow` and `pendingChoiceRow`. Encryption happens here, before any write.
  - New: `saveSocialConnections(rows)`, the one upsert.
  - New: `markDeclinedReconnectNeeded(venueId, metaUserId, providers)`.
  - The four savers are now wrappers. Columns and values are unchanged: same keys, same AAD slots
    (`social:<provider>:<venue>:page_token` / `user_token`).
- `app/api/owner/social/meta/callback/route.ts`:
  - Works out `declined`, then the per-provider outcomes.
  - Builds the rows in a `try` block, then calls `saveSocialConnections` once.
  - Then the best-effort `markDeclined()`, then `done(socialConnectResult(…))`.
  - The log line `[SocialMeta] connected` now has `{ venueId, instagram, facebook, result }`.
  - New logs: `[SocialMeta] declined-marked-reconnect`, `[SocialMeta] declined-mark-failed`.
- `tests/lib.social-publish.test.ts`:
  - New fakes:
    - A `@/lib/social/crypto` mock with `cryptoSwitch.failOn`, which makes encryption throw for one AAD slot.
    - `dbWrites`, a log of every non-select DB op with its rows.
    - `dbFaults.upsert`, which makes upserts return an error.
    - The fake upsert now accepts an array.
  - The "OAuth callback route" block now grants `pages_manage_posts`, and its Pages have `tasks: ["ANALYZE"]`.
    Without that, its Instagram-only cases would read `facebook_declined`.
  - In the Phase 6 block, "Page permission switched off" now expects `facebook_declined` (was `connected`). The plan
    asked for exactly that.
  - New tests in the Phase 6 block (marked `Phase 10`):
    - An 11-row route table.
    - A 16-pair unit test of the rules.
    - Copy present for the new results.
    - Instagram declined → the old row becomes `reconnect_needed`.
    - Another user's row, or another venue's, is left alone.
    - Both declined → nothing saved, old row marked.
    - A failing upsert → `error`, one upsert carrying both rows with identical keys, and the table unchanged.
    - On success, exactly one write.
    - An encryption throw on the Facebook row → zero writes.
- `docs/partner-social-promo-plan.md`: status line; §5.1 row 10 marked done; §5.4 "As built (Phase 10)"; §9 Phase 10
  standing rule.

### 5. Facts and traps
- **The fake DB's upsert is all-or-nothing on `dbFaults.upsert`,** like PostgREST, where one request is one
  statement. Real PostgREST bulk upserts need every row to have the same keys. Both builders return the same key
  set, and a test checks it. If you add a column to one builder, add it to the other.
- `instagramGranted` needs `instagram_basic`, `instagram_content_publish`, `pages_show_list` and
  `pages_read_engagement`. `facebookGranted` needs `pages_show_list`, `pages_read_engagement` and
  `pages_manage_posts` (`lib/social/metaConfig.ts`). So declining `pages_show_list` alone gives
  `missing_permissions`.
- `publishablePagesOf` counts a Page with `tasks === null` (Meta didn't say) as publishable. Test Pages without
  `tasks` therefore count as Facebook Pages too. That's why the Phase 5 test block now sets `tasks: ["ANALYZE"]`.
- Phase 8's trap still applies: the contract test's comment stripper treats `/*` inside a `//` comment as the start
  of a block comment.
- **Mutation check done:** with the route's old result line put back, 9 tests fail. With the new route, all 72
  pass.

### 6. How to verify (what was run)
- `npx vitest run tests/lib.social-publish.test.ts` → 72/72 pass.
- `npm run test` → 6352 pass, 13 skipped, 4 fail. The 4 failures are the MLB/NFL star-index staleness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`). They fail because of today's date, the same 4 as in the
  Phase 8 and 9 handoffs, and are unrelated.
- `npx tsc --noEmit`: clean.
- `npx eslint lib/social app/api/owner/social components/owner/social lib/promo/promoCopy.ts tests/lib.social-publish.test.ts tests/social-publish-contract.test.ts`:
  clean.
- **Not run:**
  - `npm run build`.
  - Anything against real Meta. Post now is sealed, and there's no test user here.

### 7. Open questions / residual risks (none block Phase 11)
- **To check on Hightop's own account when Post now comes back:**
  1. Connect both providers.
  2. Reconnect with Instagram switched off.
  3. Confirm the old Instagram row shows "Reconnect".
  4. Confirm a post on the old token is in fact refused.
  If it still posts, remove the two `markDeclined()` calls in the callback route. The rest of Phase 10 stands
  without them.
- A `choose` on one side with the other side declined reads `choose_account`, so the "declined" hint is lost. The
  plan's table says so on purpose. The status rows still show the declined provider as not connected (or
  "Reconnect").
- Cost: at most +1 DB write per login, and only when a permission was declined. The two upserts became one, so
  a two-provider login now makes one fewer write. No new Graph call, cron or poll.

### 8. First steps for Phase 11
1. Read plan §5.5, including the "Updated after Phase 9" bullet.
2. Read `lib/social/socialConnections.ts`. The Phase 10 builders (`connectionRow`, `pendingChoiceRow`,
   `saveSocialConnections`) are what `savePendingChoice(provider, …)` / `chooseConnection(…)` should build on.
3. Read `lib/social/socialPosts.ts` (`advanceInstagramPost`, `advanceFacebookPost`).
4. Run `npx vitest run tests/lib.social-publish.test.ts` first, to have a green baseline (72 tests).

Model: **Opus 5.5, effort high**.
