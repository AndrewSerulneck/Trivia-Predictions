# Squares + Brackets — Phase 6.3 handoff (paying winners)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 6, sub-phase 6.3; findings F2, F7, F8, F9 in §13).
**Next:** 6.4, Sonnet 5.5 · medium.

## For Andrew (plain English)

- **What changed:** paying Super Bowl Squares winners is now safe at scale and cheaper:
  - with lots of venues, marking a quarter's winners as paid is done in batches of 150, so it can no longer get stuck
    re-sending the same payments every minute;
  - a win that can never be paid (only possible through some other bug: the player's account is gone, or the points
    already went to someone else) is set aside once, logged, and shown in the admin Squares panel as "1 result needs a
    look" — it no longer repeats forever or stops you archiving the event;
  - once the game is over and the 3-hour correction watch has ended, the every-minute job stops checking for winners
    to pay (it was making three pointless database reads a minute for the rest of Feb 1–15);
  - the same "too many in one request" problem was found and fixed in the Squares Prize lookup too.
- **Is it live?** No. Committed on this computer only. No database change this time.
- **Needs you:** push `main` and deploy when convenient. That ships 6.1 (the Pacific Street NFL prize protection — still
  wanted before **Fri Oct 23**), 6.2 and 6.3 together. The 6.2 database change is already applied (it shows in
  `supabase migration list`), so the order problem from the 6.2 note is gone.
- **Cost:** saves ≈ 4,300 database reads a day during Feb 1–15 after the game. One small read a minute remains (the
  "is there an event" check) — the plan said "zero"; that last read would need a cache and isn't worth it.

---

## For the next agent

### 1. Next phase goal and scope
**6.4 (plan §4 Phase 6 → "6.4 — Player screen after the final keeps up with a void"):** while `complete`,
`useSquaresData` reads the CDN-cached `/api/squares/score` every 5 min while visible and once on tab return; a changed
revision re-reads the board; add `gradeNo` to `squaresRevision`; pin the cadence in `tests/squares-screen.test.ts`.
**Out of scope:** 6.5–6.9. Don't change 6.1–6.3 code without a reason recorded in the plan.

### 2. Starting state
- Branch `main`. 6.3 is one commit: `feat(squares): plan 6.3 — paying winners: chunked writes, blocked results, no idle
  reads` (`git log -1 --grep "plan 6.3"`). Local `main` is **8 commits ahead of `origin/main`** (`b5c1778`): Phases
  2–5, the Phase 6 docs, 6.1, 6.2, 6.3. Nothing pushed or deployed.
- Migration `20261019142642_squares_event_lifecycle.sql` (6.2) is **applied** to `pkmxupsayzshvpirkaav` — confirmed by
  `supabase migration list` on 2026-10-19 (local = remote). Never edit it. 6.3 adds no migration: the
  `credit_blocked_at` / `credit_blocked_note` columns came with 6.2, and the existing partial index
  `squares_results_unpaid_idx (event_id) where user_id is not null and credited_at is null and voided_at is null`
  still serves the unpaid read (the added `credit_blocked_at is null` only narrows it).
- Uncommitted and NOT ours, left alone: `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `lib/pos/providers.ts`, and the POS/Toast hunk at the top of `CLAUDE.md`'s POS section (only the Squares hunk of
  `CLAUDE.md` was committed, via a hunk patch). `supabase/migrations/Warnings` is an old untracked file.
- Data: nothing read or written in production this phase (only `supabase migration list`).

### 3. Decisions made in 6.3 (with why) — don't re-ask
- **Shared chunk:** `lib/postgrestIds.ts` — `POSTGREST_ID_CHUNK = 150`, `chunkIds(ids, size?)`. Replaces
  `PRIZE_STAMP_CHUNK` in `lib/squaresPrizeAwards.ts`. Other modules' own chunk constants (`lib/signupSweep.ts`
  `IN_CHUNK`, `lib/results/playerNames.ts`) were left alone — out of scope.
- **`PAY_PER_RUN` stays 1000** (two credit RPC batches of 500); the mark-paid write is now ≤ 7 chunked updates.
- **What blocks** (`squaresCreditBlockNote`, `lib/squaresSettlement.ts`): `user_not_found` → "The player's account no
  longer exists."; `already_credited` with a visible different `existingUserId` → "This win's points were already paid
  to a different player.". `already_credited` with `existingUserId` null (a concurrent run's insert, invisible to the
  RPC's snapshot) is **retried**, not blocked. The block write is guarded `credited_at is null and credit_blocked_at is
  null`, so it is logged once (`console.error("[Squares] credit-blocked", { eventId, resultIds, note })`).
- **Blocked results don't block Archive** (F8 named that as the harm). Archive still refuses on unpaid (now excluding
  blocked) and its success message names the blocked count. There is **no "unblock" action**: fixing one needs a
  reviewed manual repair (clear `credit_blocked_at` and run settlement). Not built — no requirement and only reachable
  through another bug.
- **Idle early return:** `idleReason(event, nowMs, force)` in the tick, after the draw step: `watch_over` (completed and
  > `SQUARES_POST_FINAL_WATCH_MS`), `no_final_deadline` (not completed, > 12 h after kickoff, and no late-void watch via
  `isSquaresReopenWatchOn`), never with `force`. It returns **before** `settleSquaresWinners`. Admin void / enter
  scores / Run now still call it directly. Accepted trade-off: if the last payment attempt errored right before the
  watch ended, the result waits for an admin action; the panel's "unpaid wins" count and Archive's refusal surface it.
  An unparseable `kickoffAt` never idles (fails toward doing the work).
- **Found and fixed while here (same bug class as F2):** `listActiveSquaresPrizeCampaigns` (`lib/challengeCampaigns.ts`)
  sent every winning venue id in one `.overlaps("venue_ids", …)` (up to 500 per run). Now one read per 150 venues,
  deduped by id, sorted by `Date.parse(created_at)` (oldest first, as before). The rehearsal `venues` read is chunked
  too. Recorded in the plan's 6.3 "Built" note.

### 4. Files created or changed
- `lib/postgrestIds.ts` (new): `POSTGREST_ID_CHUNK`, `chunkIds`.
- `lib/squaresSettlement.ts`: `squaresCreditBlockNote`; `payUnpaidSquaresResults` (unpaid read excludes blocked; marks
  paid in chunks; stamps blocked results in chunks per note); `idleReason` + the tick's early return; header cost note.
- `lib/squaresPrizeAwards.ts`: `chunkIds` for both stamps and the rehearsal venues read; cost comment.
- `lib/challengeCampaigns.ts`: `listActiveSquaresPrizeCampaigns` chunked.
- `lib/squaresPrizes.ts`: `squaresPrizeCycleStart` comment (F9: a void takes back an unused coupon).
- `lib/squares.ts`: `squaresBlockedLabel` (client-safe; used by the panel and the archive message).
- `lib/squaresAdmin.ts`: `SquaresBlockedResult`, overview `counts.blocked` + `blocked` (first 10, one extra read with
  `count: "exact"`), unpaid count excludes blocked, `countBlockedResults`, archive message.
- `components/admin/sections/SquaresSection.tsx`: amber "N results need a look" box listing moment, grade, result id,
  player id, note, time.
- Tests: `tests/squares-settlement.test.ts` (fake now records selects and `.in()` sizes, and answers `user_not_found`;
  new describe "paying Squares winners (plan 6.3)": 400 winners → 3 mark writes ≤ 150; blocked stamped once, never
  re-sent, logged twice for two rows; note rules; idle runs read only `squares_events` for `watch_over` and
  `no_final_deadline`; settles during the watch and on a forced run after it). `tests/lib.postgrest-ids.test.ts` (new:
  `chunkIds`; `listActiveSquaresPrizeCampaigns` 320 venues → reads of 150/150/20, deduped, oldest first; contract that
  every `.in()`/`.overlaps()` list in `lib/squaresSettlement.ts` and `lib/squaresPrizeAwards.ts` is named `chunk`;
  `squaresBlockedLabel`).
- Docs: plan status line + 6.3 "Built" note; `CLAUDE.md` Squares bullets (6.2 marked applied; new 6.3 bullet); this file.

### 5. Facts and traps
- `creditSeasonalPoints` validates every credit before sending and refuses the WHOLE request on one invalid credit
  (e.g. a non-UUID user id). Test fixtures must use real UUIDs. In production `user_id` is a uuid FK, so this can't
  block a run, but a future bug producing an invalid credit would stall every unpaid result of the event — worth
  remembering if 6.6 re-reviews this path.
- The contract test's regex matches `.in("col", name)` / `.overlaps("col", name)` with a bare identifier; an inline
  `.in("id", [a, b])` literal would not match (fine: it's a fixed small list). If you add a new id-list read to those
  two files, name the variable `chunk` from `chunkIds`.
- `lib/squaresAdmin.ts` is `server-only`; anything the client panel needs at runtime must live in `lib/squares.ts`
  (pure) — that's why `squaresBlockedLabel` lives there.
- No test covers `lib/squaresAdmin.ts` directly (none existed before either); the overview/archive changes are checked
  by typecheck and build only.
- Production query recipe: 6.1 handoff §5 (`node --env-file=.env.local <file>.mjs`; never print `.env.local`).

### 6. Build / test (all run 2026-10-19 after the change)
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **5,043 pass / 13 skipped / 0 fail** (419 files, 418
  ran); `npm run test:squares-sql` "all checks passed"; `npm run build` succeeds. Don't run tsc and build at once.
- Focused: `npx vitest run tests/squares-settlement.test.ts tests/lib.postgrest-ids.test.ts tests/lib.squares-prize-awards.test.ts`.
- `/verify` not run: no player-facing change (admin panel only, and Squares is flagged off). Unverified: the admin
  panel box on a real deployment (6.7's rehearsal will exercise settlement end to end).

### 7. Open questions for Andrew
- Push + deploy (6.1–6.3 together; 6.1 is wanted before Fri Oct 23's trivia night at Pacific Street).
- Unchanged from 6.2: Squares prize setup before Jan 25? Recommendation: leave it.

### 8. Recommended first steps for 6.4
1. Read plan §4 "6.4" and §13 F6; `components/squares/` (`useSquaresData`), `lib/squaresView.ts` (`squaresRevision`),
   `lib/squaresScore.ts`, `tests/squares-screen.test.ts` (it pins the current cadence — change it deliberately).
2. Keep the score read CDN-cached and per-player-free (CLAUDE.md Squares Phase 3 bullet).
3. The new `credit_blocked_*` fields are admin-only; nothing on the player screen needs them.
4. Full gates, commit, `docs/squares-and-brackets-plan_PHASE_6.4_HANDOFF.md`.
Model: Sonnet 5.5, effort medium.
