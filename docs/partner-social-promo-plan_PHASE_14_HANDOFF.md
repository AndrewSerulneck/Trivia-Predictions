# Share to social — Phase 14 handoff (Instagram: `media_publish` at most once)

**For Andrew (plain English):** This is more behind-the-scenes work on "Post now" (posting straight to Instagram or a
Facebook Page). Partners still can't see or use Post now. The problem fixed: if Instagram took a post but we never
heard back, a later check could have sent it again, so it could appear twice. Or Instagram could refuse the second
copy and we'd tell the partner "didn't post" when it was live. Now:

- We note that a post has been sent **before** sending it. A post with that note is never sent again.
- If Instagram still hasn't confirmed it after 10 minutes, the partner sees **"We couldn't confirm this posted. Check
  Instagram before posting again."** It used to say "Check your Page", which was wrong for Instagram.
- While building this, the same double-send gap turned up on Facebook Reels, in a rarer case. It's closed the same way.

Nothing is committed or deployed (branch `after-app-review`). No database change, no new setting, no cost change.
Nothing is needed from you. Phases 15 and 16 still have to be done before Post now can be turned on for partners.

---

## For the next agent

### 1. Next phase
**Phase 15** (connect callback: no Page to post to, stale rows), `docs/partner-social-promo-plan.md` §5.9.
Model: **Opus 5.5, effort high** (§5.1). Then **Phase 16** (Post now panel, Sonnet 5.5 medium), which must come after
15 because it shows 15's new result copy. **17** (share sheet saved handle, Sonnet 5.5 medium) can run any time.
**18** (clean-ups, Opus 5.5 medium) goes last. It touches `socialPosts.ts` (this phase's module) and the route files.
Out of scope everywhere: turning the Post now box back on (Andrew decides; the checklist is in the Phase 8 handoff),
migrations, `supabase db push`, env changes, crons, `vercel.json`.

### 2. Starting state
- Branch `after-app-review`. Last commit `1e803523 docs: game themes plan`. Phase 14 is **uncommitted**, on top of the
  uncommitted Phase 5–6, 8–13 and game-themes work (see `git status`). Nothing is pushed or deployed.
- No data touched. **No migration:** the mark reuses `social_posts.external_post_id`, and the confirm window reads
  `social_posts.updated_at`. That column already exists (`timestamptz not null default now()`, migration
  `20261104193338_social_publishing.sql`, no trigger), and only `moveIf` writes it. No env var.
- Post now is still sealed: `SOCIAL_POST_NOW_ON_SHEET = false` in `lib/social/flags.ts`, so every
  `/api/owner/social/**` route answers 404. Partners can't reach any of this.

### 3. Decisions made in this phase (and why)
They're recorded in plan §5.8, "As built (Phase 14)". In short:
- **The plan's design as written** (§5.8 rules 1–5). The mark goes in the lease-renewing write. It's cleared only on
  `not_ready`. `containerStep(statusCode, { publishSent, sinceSentMs })` returns `wait`, then `unconfirmed` after
  `SOCIAL_INSTAGRAM_CONFIRM_MS = 10 * 60_000`. `updated_at` was added to `COLUMNS`. The copy now names the provider.
- **Added: the mark is checked on the claimed row** (`publishClaimed`). Here's the race. Two polls both read
  `FINISHED` while the post is unmarked. The first claims it, sends `media_publish`, loses the answer, and puts the
  post back in `processing` with the mark. The second poll's `claim()` only checks `status = 'processing'`, so it
  succeeds on the now-marked row, and rule 3 alone would publish again. The guard catches that and returns the post
  to `processing` without calling Meta.
- **Added: the same guard in `sendReelFinish`** (Facebook). The race is the same, and it broke Phase 9's
  "finish at most once" rule. That needs the upload's answer to have been lost and two polls running together.
- **Added: a marked post never ends with a "didn't post" reason without Meta's answer.** These endings now say
  `unconfirmed` for a marked post:
  - the 24 h TTL (it used to say `expired`)
  - a connection that's gone, or now points at another account (it used to say `reconnect`)
  - a refused status read (it used to give the refusal's own reason; a refused token still flags the connection)

  This closes the Phase 9 handoff's first residual risk. Unmarked posts behave exactly as before. The Phase 11 table
  test still pins `expired` / `reconnect` for unmarked posts.
- **Added: `finish()` clears the mark on every final state.** On Instagram, `external_post_id` ends as the media id
  or null, never a container id.
- **`updated_at` is kept as the send time.** `moveIf` now writes `{ updated_at: now, ...patch }`, so a patch can keep
  it. `keepSentAt(row)` does that for the non-final writes to a marked post: `releaseStale` and the new guard.
  Known gap: in the race above, the second poll's claim moves `updated_at` forward by that poll's status read
  (seconds). That only makes the wait slightly longer, which is the safe direction. It's documented on
  `PostRow.updated_at`.

### 4. Files changed
- `lib/social/socialPublishRules.ts`
  - `SOCIAL_INSTAGRAM_CONFIRM_MS` (new).
  - `ContainerStep` gains `"unconfirmed"`.
  - `containerStep(statusCode, input: { publishSent; sinceSentMs })`: the second argument is required.
- `lib/social/socialPosts.ts` (main change):
  - Header comment: new Phase 14 paragraph.
  - `COLUMNS` and `PostRow` gain `updated_at`.
  - `moveIf`: a patch may now carry `updated_at`.
  - New `publishSent(row)`: Instagram, `external_post_id === container_id`, not null.
  - New `keepSentAt(row)`.
  - `finish`: clears an Instagram mark.
  - `fail(row, connection, graph, error = postErrorFor(kind))`: optional fourth argument.
  - `releaseStale`: keeps the send time.
  - `publishClaimed`:
    - the guard;
    - `renew(row, { external_post_id: containerId })`;
    - `not_ready` → `toProcessing(live, { external_post_id: null })`.
  - `advanceInstagramPost`:
    - `sent` and `endWithout(error)` for the TTL and connection endings;
    - a refused status read passes `"unconfirmed"` when marked;
    - `containerStep` gets `{ publishSent, sinceSentMs: now - updated_at }`;
    - the new `unconfirmed` step logs `[SocialPost] unconfirmed` and finishes as failed / `unconfirmed`.
  - `sendReelFinish`: the guard `if (finishSent(row)) return toProcessing(row);`.
- `lib/promo/promoCopy.ts`: `SOCIAL_POST_COPY.errors.unconfirmed` is now `(name: SocialName) => string`.
- `components/owner/social/SocialPostNowPanel.tsx` (hidden): `errorText` calls it with `COPY.providers[post.provider]`.
  It's the only caller; nothing else reads `COPY.errors.unconfirmed`.
- `lib/social/socialTypes.ts`: a doc comment on `SocialPostErrorCode` (`unconfirmed` now covers Instagram too).
- `tests/lib.social-publish.test.ts`:
  - The fake DB's insert sets `updated_at`, like the column default.
  - New `describe("Phase 14: Instagram media_publish at most once (plan §5.8)")` with 13 tests. They cover the plan's
    list, the two races, the three no-answer endings (`it.each`), the refused status read, and the rules and copy.
- `docs/partner-social-promo-plan.md`:
  - the status line;
  - §5.1, row 14 marked done;
  - §5.8, the new "As built (Phase 14)" section;
  - §9, the new Phase 14 standing rule.

### 5. Facts and traps
- **`external_post_id` means different things by provider and state.** On a Facebook Reel it's the "finish sent"
  mark, and later the published id (the same value). On an open Instagram post it's the "media_publish sent" mark
  (it equals `container_id`). On a published Instagram post it's the media id. Never set it anywhere else, and never
  clear it except where this phase does (`not_ready`, `finish`). Otherwise a post can go out twice.
- **`claim()` is not a compare-and-swap on the row you read.** It checks only `status` (plus the lease for a stale
  `publishing`). Any step chosen from the pre-claim row must be checked again on the claimed row before a call Meta
  can't undo. Both such calls (`publishClaimed`, `sendReelFinish`) do this now. A new one must too.
- `moveIf` is still the module's only `.update(` (contract test `tests/social-publish-contract.test.ts`). Don't write
  `?? { ...row` anywhere in `socialPosts.ts`; that test forbids it.
- Phase 8's trap still applies: the contract test's comment stripper treats `/*` inside a `//` comment as the start of
  a block comment.
- To simulate another request in a test, change `tables.social_posts[0]` inside a `metaRoute` handler (see the two
  race tests). The fake DB applies it at once.
- **Cost:** no new Graph calls; the bad case makes one fewer (no second `media_publish`). No new DB reads. The mark
  rides on the lease-renewing write that already existed, so writes are unchanged too. A marked post that's waiting
  makes the existing single status read per poll, at most about 60 in its 10 minutes, and only while the sheet is open.

### 6. How to build, run and test (what was run)
- `npx vitest run tests/social-publish-contract.test.ts tests/lib.social-publish.test.ts tests/lib.social-meta-callbacks.test.ts tests/lib.promo.test.ts`
  → 4 files, **159/159 pass**. The Phase 9 test "media_publish with … → processing; the container says PUBLISHED →
  published, media_publish sent once" still passes unchanged.
- `npm run test` → 6381 pass, 13 skipped, 4 fail. The 4 are the MLB/NFL star-index staleness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`). They fail because of today's date, are unrelated, and
  are the same 4 as in the Phase 8 and 9 handoffs.
- `npx tsc --noEmit`: clean.
- `npx eslint lib/social app/api/owner/social components/owner/social lib/promo/promoCopy.ts tests/lib.social-publish.test.ts tests/social-publish-contract.test.ts`:
  clean.
- **Mutation check.** Each change was undone one at a time in `socialPosts.ts`, then the file was restored and
  checked byte-for-byte. Every mutant fails at least one test:

  | Change undone | Tests failing |
  |---|---|
  | Instagram guard | 1 |
  | The mark | 2 |
  | Facebook guard | 1 |
  | `endWithout` | 3 |
  | `keepSentAt` in `releaseStale` | 1 |
  | `not_ready` clearing the mark | 1 |
  | `finish` clearing the mark | 3 |
  | Status-refusal reason | 1 |

- **Not run:** `npm run build` (no route or config change), and anything against real Meta (Post now is sealed and
  there's no test-Page token here).

### 7. Open questions and residual risks (none blocks Phase 15)
- **Verify when Post now comes back** (plan §5.8; not blocking). On Hightop's own account, after a publish, how soon
  does the container's `status_code` read `PUBLISHED`? Record the answer in §5.8. Lower `SOCIAL_INSTAGRAM_CONFIRM_MS`
  only if it's always immediate.
- If `media_publish` never actually reached Meta (it died after the mark), the post ends `unconfirmed`, not retried.
  The plan chose that on purpose; it's the safe direction.
- Still as before:
  - Disconnect and deauthorize mark open posts `cancelled`, even one that may be live (deliberate since Phase 5).
  - An unmarked Instagram post whose status read is refused for `rate_limit` still fails.

### 8. First steps for Phase 15
1. Read plan §5.9 and the §5.4 result table.
2. Read `lib/social/socialPublishRules.ts` (`socialConnectResult`), `app/api/owner/social/meta/callback/route.ts`
   (≈ lines 120–170) and `lib/social/socialConnections.ts` (`markDeclinedReconnectNeeded`).
3. Read the callback `describe` blocks in `tests/lib.social-publish.test.ts`: "OAuth callback route", "Phase 6: one
   login connects…", and the 16-pair table test.

Model: **Opus 5.5, effort high**.
