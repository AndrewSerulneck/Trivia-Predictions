# Share to social — Phase 9 handoff (Publishing: no false "failed", no stale writes)

**For Andrew (plain English):** This is behind-the-scenes work on "Post now" (posting straight to Instagram or a
Facebook Page). Partners still can't see or use Post now. Two problems are fixed:

1. **A slow request can no longer overwrite a post another request has taken over.** Each request now has a hard
   90-second limit, and its "hold" on a post lasts 150 seconds. Every save checks that the request still holds the
   post. If it doesn't, it stops at once and changes nothing.
2. **If Meta (Instagram/Facebook) may have posted but we never got its answer, we no longer say "failed".** The
   post waits, and we ask Meta what happened. If we still can't tell, the partner sees "We couldn't confirm this
   posted. Check your Page before posting again." That way they don't post the same thing twice.

Nothing is committed or deployed (branch `after-app-review`). No database change, no new setting, no cost change
worth mentioning. Nothing is needed from you. Phases 10 and 11 still have to be done before Post now can be switched
on for partners.

---

## For the next agent

### 1. Next phase
**Phase 10** (connect callback: the right reason, one save), `docs/partner-social-promo-plan.md` §5.4.
Model: **Opus 5.5, effort high** (§5.1). Then **Phase 11** (refactor), which must wait until 9 and 10 are both done.
Its §5.5 text was updated by this phase; read the "Updated after Phase 9" bullet. 12 and 13 can run any time.
Out of scope everywhere: re-attaching the Post now box (Andrew's call; checklist in the Phase 8 handoff),
migrations, `supabase db push`, env changes, crons, `vercel.json`.

### 2. Starting state
- Branch `after-app-review`, last commit `1e803523 docs: game themes plan`. Phase 9 is **uncommitted**, on top of the
  uncommitted Phase 5–6, Phase 8 and game-themes work (see `git status`). Nothing pushed or deployed.
- No data touched. No migration (the new error code `unconfirmed` fits `social_posts.error`, plain text with no
  check constraint, migration `20261104193338`). No env var. Post now is still sealed (`SOCIAL_POST_NOW_ON_SHEET =
  false`, `lib/social/flags.ts`), so none of this is reachable by partners.

### 3. Decisions made in this phase (and why)
Recorded in the plan §5.3 "As built (Phase 9)". In short:
- **Meta's Reels guide was checked (2026-11-04)** at `developers.facebook.com/docs/video-api/guides/reels-publishing`.
  (a) Status fields are confirmed: `video_status` ∈ uploading / upload_complete / upload_failed / processing /
  ready / error / expired. Each phase `status` ∈ not_started / in_progress / complete (examples) or completed
  (table) / error. `publish_status` ∈ draft / scheduled / published / error. The doc spells it `bytes_transfered`.
  (b) A repeated `upload_phase=finish` is **not documented**. (c) A repeated `file_url` upload to the same video id
  is **not documented** (resume is described only with an `offset` header for byte uploads).
- So, per the plan's fallback, **`resume_upload` is not built**, and the plan's `resume_finish` was replaced by
  **`send_finish`**: the poll sends the *first* finish when the upload's answer was lost and Meta shows the whole file.
  Finish is marked as sent by `external_post_id = <video id>`, written in the fenced lease-renewal write just before
  the call. Finish therefore goes out at most once without relying on (b), and the plan's `updated_at` 2-minute gate
  isn't needed (`updated_at` was not added to `COLUMNS`).
- **A Facebook Reel with a video id is failed only by Meta's own answer.** If Meta can't be asked, the Reel waits.
  That covers: connection not active, a different Page, token unreadable, status read refused or unanswered. A
  refused token on the status read still marks the connection `reconnect_needed`. Past the 1-hour TTL, Meta is
  still asked once: published → published; Meta's error → failed; otherwise `unconfirmed` (finish sent) or
  `expired` (finish never sent, so it can't be live).
  The plan only asked for "TTL with the result unknown → `unconfirmed`". The rest is the same rule applied
  consistently.
- **A stale Facebook post with no id:** a photo → `unconfirmed`. A Reel → plain `failed`: its video-id save comes
  before any upload, and that save is fenced, so the Reel was never uploaded or finished. The plan said
  `unconfirmed` for both.
- **Instagram stale no-container post: the retry-from-the-file path is kept.** `media_publish` needs the saved
  container id. That save is now fenced with no fallback, so the plan's "only if `createContainerFor` had already
  started" case can't happen.
- **`isUnsure` also counts a 2xx we couldn't use and Graph codes 1 and 2.** That's wider than the plan's "network
  or 5xx with no code", in the safe direction.
- **Recent posts advances its ≤2 open posts in parallel**, so the status route stays under 90 s.

### 4. Files changed
- `lib/social/socialPosts.ts` (main change). New internal helpers:
  - `ClaimedRow` type (status `publishing` + our `claimed_at`); `asClaimed`.
  - `moveIf(…, guard: { claimedBefore?, claimedAt? })`: still the **only** `.update(`.
  - `updateClaimed`: the fenced write. `lostClaim`: logs `[SocialPost] lost-claim`, re-reads, keeps the file.
  - `renew`: lease renewal, optionally with a patch. `toProcessing`: hand back to the poll.
  - `unsure`: logs `[SocialPost] unsure {postId, provider, step, kind, code, httpStatus}`, then `toProcessing`.
  - `claimAndFinish`, `leaseHeld`, `releaseStale` (stale publishing → processing, fenced on the claimed_at seen),
    `isOpen`, `finishSent`, and `sendReelFinish` (marker + renew → finish → processing / unsure / fail).
  - `finish()` and `fail()` now take a `ClaimedRow`, so "every caller holds a claim" is checked by the compiler.
    The `?? { ...row, container_id }` fallbacks are gone.
- `lib/social/socialPublishRules.ts`:
  - `SOCIAL_ROUTE_MAX_DURATION_S = 90`; `SOCIAL_PUBLISH_LEASE_MS` 90 000 → **150 000**.
  - `GraphError` type moved here (re-exported by `metaGraph.ts`); `isUnsure(error)`.
  - `facebookReelStep(status, { finishSent })` returns `published | wait | send_finish | failed | expired`
    (the second argument is now required).
- `lib/social/metaGraph.ts`: `noAnswer()` and `readBody()`. A 2xx whose body can't be read is `network`. Before,
  it crashed with `TypeError: null.id`, the route returned 500, and the partner was told to try again (a possible
  duplicate).
- `lib/social/socialTypes.ts`: `SocialPostErrorCode` + `"unconfirmed"`.
- `lib/promo/promoCopy.ts`: two additions to `SOCIAL_POST_COPY`.
  - `errors.unconfirmed` = "We couldn't confirm this posted. Check your Page before posting again."
  - `notConfirmed` = "Not confirmed".
- `components/owner/social/SocialPostNowPanel.tsx` (hidden): Recent posts shows "Not confirmed" for a failed +
  `unconfirmed` post.
- Routes: `export const maxDuration = 90;` in all three:
  - `app/api/owner/social/posts/[id]/publish/route.ts`
  - `app/api/owner/social/posts/[id]/route.ts`
  - `app/api/owner/social/status/route.ts` (doc comment updated too)
- Tests:
  - `tests/lib.social-publish.test.ts`:
    - The fake fetch takes `{ network: true }` (fetch rejects) and `{ cutOff: true }` (200 with half a JSON body).
    - The existing "photo left mid-publish" test now expects `unconfirmed`.
    - The rules helper passes `{ finishSent: true }`.
    - New `describe("Phase 9: …")` with 18 tests.
  - `tests/social-publish-contract.test.ts`, two new tests:
    - Lease ≥ maxDuration·1000 + 60 s; the claiming routes are exactly the three files and each exports
      `maxDuration = 90`.
    - `socialPosts.ts` has exactly one `.update(` (fenced `updateClaimed`) and no `?? { ...row` fallback.
- Docs: `docs/partner-social-promo-plan.md` changes:
  - Status line.
  - §5.1 row 9 marked done.
  - §5.3 "As built".
  - §5.5 Phase 11 bullets updated: only upload-abandon → not open → lease held is shared, and the table test's
    expectations are per provider.
  - §9 Phase 9 standing rule added; Phase 6 rule annotated.

### 5. Facts and traps
- **`external_post_id` on a Facebook Reel is the "finish sent" mark.** It is set only by `sendReelFinish` (and by
  `finish()` on publish, with the same value). Never clear it and never set it anywhere else, or finish could go
  out twice. Instagram's `external_post_id` is still just the published media id.
- To simulate a takeover in a test, set the row's `claimed_at` to another value inside a `metaRoute` handler (see
  `TAKEN` in the Phase 9 block). The fake DB compares `claimed_at` with `===`. Real Postgres compares timestamptz
  values, and we write millisecond ISO strings, so `eq("claimed_at", row.claimed_at)` round-trips.
- Phase 8's trap still applies: the contract test's comment stripper treats `/*` inside a `//` comment as the start
  of a block comment. Don't write `/**` paths in `//` comments in files those tests read.
- Mutation check done: with the old `socialPosts.ts` swapped back in, 14 of the 18 new Phase 9 tests fail. They pass
  with the new one. The 4 that pass either way don't depend on the old module: the lease test and the rules unit
  test read the new rules file; the other two pin unchanged behaviour (a no-id Reel is `failed`, a clear refusal
  still fails).
- Cost: +1–2 fenced DB writes per post (lease renewals). In rare cases +1 Graph call (`send_finish`), and +1 Graph
  call once per Facebook Reel that is still open past its hour. `maxDuration` is a cap, and waiting on Meta isn't
  billed as active CPU. No new cron, poll or paid API.

### 6. How to verify (what was run)
- `npx vitest run tests/social-publish-contract.test.ts tests/lib.social-publish.test.ts tests/lib.social-meta-callbacks.test.ts tests/lib.promo.test.ts`
  → 4 files, 112/112 pass.
- `npm run test` → 6333 pass, 13 skipped, 4 fail. The 4 are the MLB/NFL star-index staleness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`). They fail on the date, the same 4 as in the Phase 8
  handoff, and are unrelated.
- `npx tsc --noEmit` clean.
- `npx eslint lib/social app/api/owner/social components/owner/social lib/promo/promoCopy.ts tests/lib.social-publish.test.ts tests/social-publish-contract.test.ts`
  clean.
- **Not run:** `npm run build`. `export const maxDuration = <n>` is an existing pattern here
  (`app/api/admin/trivia/questions/route.ts`, `…/review-diagnostic/route.ts`).
- **Not run:** anything against real Meta. Post now is sealed, and there is no test-Page token here.

### 7. Residual risks / open questions (none block Phase 10)
- **Instagram, rare:** an unsure `media_publish` (the post may be live) that no poll resolves before the 24 h
  container TTL ends as `expired`. That needs the tab closed within ~10 s and the sheet not opened for a day. The
  same post ends as `reconnect` if the Instagram connection stops being usable before the next poll. Either way it
  would read "didn't post" although it may be live. Fixing it needs an Instagram "publish sent" mark like the
  Facebook one. Phase 7's cron (advancing open posts every 15 min) would also close it. Recommended for Phase 7 or
  a small follow-up.
- **Instagram, accepted by the plan:** after an unsure `media_publish`, a poll that still sees `FINISHED` publishes
  again. That is safe only if Meta flips the container to `PUBLISHED` quickly when the first call landed.
- **Unchanged, pre-existing:**
  - An Instagram status read refused for `rate_limit` fails the post.
  - A disconnect / deauthorize marks open posts `cancelled`, even a Reel that may already be live (deliberate since
    Phase 5).
- **When Post now comes back**, it's worth one run on Hightop's test Page of "upload answer lost → `send_finish`".
  The idea: interrupt the publish request after the upload, then let the poll finish it.

### 8. First steps for Phase 10
Read plan §5.4. Then read `app/api/owner/social/meta/callback/route.ts`, `lib/social/socialConnections.ts`
(`saveInstagramConnection`, `saveFacebookConnection`, the pending-choice savers) and the two callback `describe`
blocks in `tests/lib.social-publish.test.ts` (`OAuth callback route`, `Phase 6: one login connects…`).
Model: **Opus 5.5, effort high**.
