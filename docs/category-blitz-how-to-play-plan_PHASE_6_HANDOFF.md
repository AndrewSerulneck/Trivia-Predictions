# Category Blitz How-to-Play Plan — Phase 6 Handoff (empty-round cleanup)

**Date:** 2026-10-15 (UTC) / 2026-10-14 evening ET · **Plan:** `docs/category-blitz-how-to-play-plan.md` ·
**Phase 6 status: done.** Phases 1–5 are deployed to production; the Phase 6 delete has run against production.

## For Andrew (plain English)

- **Phases 1–5 are live.** They're on `main` and production is running them (Vercel deployment
  `hightop-challenge-l71s5p89s`, Ready at about 01:09 UTC on 2026-10-15).
- **The game now sleeps when nobody is playing.** Ten minutes after the deploy, no new rounds had started anywhere.
  The old engine started about 17 rounds every 10 minutes.
- **The old empty rounds are gone.** I deleted **193,590** Category Blitz rounds that nobody ever answered. The table
  went from 196,295 rounds to 2,705.
- **Nothing anyone played was touched.** All 219 rounds that have at least one answer are still there, and so are all
  2,093 answers. No other table was changed.
- **About 2,400 empty rounds from the last 24 hours are still there.** The rule was "only delete rounds older than a
  day", and those were made by the old engine just before the deploy. Running the same script again tomorrow clears
  them. It's safe to run any time.
- **The table has been compacted** (2026-10-14 ~22:00 ET, on your go-ahead): 114 MB → 1.6 MB. Same 2,706 rounds and
  2,093 answers before and after.
- **Needs you:** a real-phone check of the new tutorial, rules popup and bigger letter (Phase 7), and the optional
  compaction below.

## For the next agent

### 1. Next phase
**Phase 7: verification & release record** (plan §5 Phase 7). Model: **Claude Sonnet 5.5, effort low.** Full gates,
the `verify` skill end-to-end on Category Blitz, Andrew's device checklist, and the `CLAUDE.md` Category Blitz bullet
(the sleep rule is already in `CLAUDE.md` from Phase 5; add cadence `isReverseRound`, alliteration
`lib/categoryBlitzAlliteration.ts`, and the rules single source `lib/categoryBlitzHowToPlay.ts`). Out of scope: any
engine change, any further data deletion except re-running this script.

### 2. Starting state
- **Deployed:** `origin/main` = `58d57c3` (Phase 2–5 commit) on top of `9208f85` (Phase 1). These are cherry-picks of
  local `b1030fd` / `77dd92e` onto the then-current `origin/main` (`6012e2e`, which had 20 new ranked-places commits).
  The cherry-pick was clean. Before the push, on the combined tree: `tsc` clean, eslint clean on the changed files,
  `vitest` 388 files / 4,585 tests pass (13 skipped), `next build` green (204 pages).
- The Phase 6 commit (script + this handoff + plan status) goes on top of `main` the same way.
- Local branch `category-blitz-scoring-cadence` still holds the original `b1030fd` / `77dd92e` plus the Phase 6 commit;
  it has diverged from `main` (same content, different hashes). Treat `main` as the truth. The local working tree
  still holds Andrew's unrelated uncommitted work (Speed Trivia, `venueHubShared.tsx`, star indexes, etc.) — don't
  stage it, don't `git checkout --` anything.
- **Data:** 193,590 rows deleted from `category_blitz_rounds` only, 2026-10-15 ~01:22–01:30 UTC. The deleted ids are
  in the session scratchpad (`cbz-empty-rounds-deleted.log`, outside the repo; Andrew said no export was needed). No
  backup was taken (Andrew: "I don't care about this data").

### 3. Decisions already made (don't re-ask)
- Andrew authorised the delete on 2026-10-14, Category Blitz rounds only, never a round with an answer.
- Deploying = push to `main` (Vercel builds production from it). Andrew asked for this explicitly this session.
- `VACUUM (FULL, ANALYZE) public.category_blitz_rounds` **was run** on Andrew's go-ahead, 2026-10-15 ~02:00 UTC, via
  `supabase db query --linked` (the Management API accepts it; took ~3 s). 114 MB → 1,592 kB (heap 93 MB → 1,264 kB);
  rows 2,706 and submissions 2,093 unchanged. Don't repeat it for the small follow-up delete.

### 4. Files
- **New:** `scripts/cleanup-empty-category-blitz-rounds.cjs`. Dry run by default; `--apply` deletes; `--log <file>`
  (default: OS temp dir). Full scan of rounds + submissions (paged by 1,000, ordered by `id`), latest round per
  session = greatest `started_at` (ties: `created_at`, `id`). Deletes in batches of **200** (not the plan's 1,000:
  `.in()` ids go in the URL; 200 UUIDs ≈ 7.5 KB), with a fresh submissions read per batch right before the delete and
  the `status = 'complete'` / `started_at < cutoff` filters repeated in the delete itself. 250 ms pause between
  batches.
- `docs/category-blitz-how-to-play-plan.md` — status line.

### 5. Facts and traps
- **`category_blitz_submissions.round_id` is `ON DELETE CASCADE`** (migration `20260628130000_scategories.sql`, renamed
  later). Deleting a round with answers would silently delete the answers. That is why the zero-answer check is
  re-done per batch. No other table references `category_blitz_rounds` (checked migrations and every
  `from("…")` in the Category Blitz code).
- **Dry run before the apply** (cutoff `2026-10-14T01:21:32Z`):

  ```
  Total rounds:              196295
  Would delete:              193589
  Kept:                      2706
    has answers:             219  (rounds with answers: 219)
    latest of its session:   52
    not complete:            0
    started < 24 h ago:      2435
  Sessions:                  59
  ```
- **Apply** (cutoff a minute later, `01:22:31Z`): 968 batches, **193,590 deleted** (one more than the dry run because
  the 24 h cutoff moved), **0** kept by the fresh answer re-check, exit 0, about 8 minutes.
- **Dry run after:** 2,705 rounds total; 219 with answers (all kept); 52 latest-of-session; 2,421 under 24 h old;
  13 would delete (they crossed the 24 h line during the run). Submissions: 2,093.
- **Table stats after** (`supabase inspect db table-stats --linked`): `category_blitz_rounds` 93 MB table + 21 MB
  index = 114 MB, estimated rows 2,505. The size doesn't drop until a `VACUUM FULL`.
- **Phase 5 live check** (2026-10-15 01:20 UTC, ~11 min after the deploy went Ready): 0 rounds started in the last
  5 and 10 minutes; 19 in the last 20 (all before the deploy); the newest rounds all `complete` (the cron graded them).
- Turbopack refuses a symlinked `node_modules` ("points out of the filesystem root"); to build in a scratch worktree
  run `npm ci` there. A plain `node -e` from the scratchpad can't find `@supabase/supabase-js`; set
  `NODE_PATH=<repo>/node_modules`.
- Clean-checkout test failures unrelated to this work: sports-bingo star-index staleness tripwires (the committed
  snapshots are stale; Andrew's working tree has refreshed, uncommitted ones) and Speed Trivia admission tests that
  look for a local `tmp/bingo-phase4-pg` PGlite install. On the merged `main` tree everything passed.

### 6. How to run
- Re-run the cleanup (safe, idempotent): `node --env-file=.env.local scripts/cleanup-empty-category-blitz-rounds.cjs`
  (dry run), then add `--apply`. Running it on/after 2026-10-16 clears the ~2,400 pre-deploy rounds from the last day.
- Measure the round rate: `node --env-file=.env.local scripts/count-category-blitz-rounds.cjs --days 7`. Note the
  per-day history before 10-14 now shows only played rounds, because the empty ones are deleted; the Phase 5 handoff
  holds the pre-deploy baseline (~2,470 rounds/day).

### 7. Open questions for Andrew
- ~~Compact the table?~~ Done (see §3).
- Re-run the cleanup for the last ~2,400 pre-deploy empty rounds: **Andrew said yes.** A session-only reminder was set
  for 2026-10-15 21:47 ET; if that session closed, just run §6's two commands on or after that time.
- Plan §7 (still not asked): a small daily prune of empty rounds older than 7 days.
- Optional: a QR code on the TV's "Play anytime" card once `play.hightopchallenge.com` is live.

### 8. First steps for Phase 7
1. `git fetch && git log origin/main --oneline -5` — confirm the Phase 6 commit is on `main`.
2. Run the gates sequentially from a clean checkout of `main` (`npm ci` in a scratch worktree), not from Andrew's
   working tree, which has unrelated uncommitted changes.
3. Use the `verify` skill against a scratchpad clone (never `pkill next`; Andrew's `next dev` holds :3000). Remember
   that a no-peek sessions GET starts a real production round; clean up throwaway sessions afterwards.
