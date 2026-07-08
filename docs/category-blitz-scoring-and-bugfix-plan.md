# Category Blitz — Scoring Gate, Intermission/Final Screens, and Bug Fixes

Plan compiled 2026-07-07. Covers two workstreams:
- **A. New features** — minimum player count for scoring, intermission leaderboard, final results screen.
- **B. Bug fixes** — frozen pre-round countdown, grading/answers vanishing, interrupted round-start reveal.

Root causes below are grounded in direct file/line citations from the current codebase, not speculation. Bugs should be fixed **before or alongside** Phase 3 (intermission) since Bug 3 touches the same reveal/timer interaction the intermission animation will build on.

---

## A. New Features

### Current state (for context)
- **Scoring**: `lib/categoryBlitz.ts` → `scoreRound()` (~line 736-828) computes uniqueness/validity per submission and multiplies by `POINTS_PER_UNIQUE_ANSWER`. No player-count gate exists today.
- **Player count**: `category_blitz_session_participants` tracks who's *seen* the session, but nothing computes/exposes a live count. `useCategoryBlitzSession` doesn't return one.
- **Phases**: `CategoryBlitzGame.tsx` drives `'idle' | 'lobby' | 'answering' | 'scoring' | 'results' | 'complete'`. No distinct intermission phase — the between-round beat is just `NextRoundCountdown` inside `results`.
- **Live Trivia references to copy**: intermission leaderboard lives inline in `app/trivia/live/page.tsx` (~1780-1865) using `LiveTriviaLeaderboardRow`; final podium + own-rank screen is the "Post-game results" block in the same file (~1262-1400), using `RankBadge`.
- **Animation pattern**: framer-motion `AnimatePresence`, consistently used by `RoundStartReveal`, `GradingCascade`, `NextRoundCountdown`, `SessionCompleteFireworks`.
- **No generic banner component** — convention is an inline `rounded-xl border/bg` tinted `<div>` (e.g. the rose error card in `CategoryBlitzGame.tsx` ~754-771).

### Phase 1 — Gate scoring on player count (backend)
In `scoreRound()`, compute session player count (via `category_blitz_session_participants` count for that session) and force `pts = 0` when count < 3, regardless of uniqueness/validity. Extend `CategoryBlitzAnswerReason` with `'insufficient_players'`. Add `playerCount` to `CategoryBlitzSession`/`CategoryBlitzRoundResults` types.
- **Model: Sonnet, medium effort.**

### Phase 2 — Expose player count + "invite a friend" banner
Thread `playerCount` through the relevant API routes and `useCategoryBlitzSession`. Add an amber-tinted banner (matching the existing tinted-div convention) shown whenever `playerCount <= 2`, placed in `LobbyScreen` and `AnsweringScreen`/`ResultsScreen`: "Playing solo/with 1 friend — game works fully, but you need 3+ players to score points. Invite a friend!"
- **Model: Sonnet, medium effort.**

### Phase 3 — Between-round leaderboard (intermission screen)
Build a proper leaderboard view (reusing `LiveTriviaLeaderboardRow`-style rows, sorted by session cumulative totals) as a distinct beat within `results`/before the next `RoundStartReveal`, replacing the current bare `NextRoundCountdown`. Show top N + "you're ranked #N" sticky row if the viewer is outside it, mirroring Live Trivia's pattern.
- **Model: Sonnet, medium-high effort.**
- **Do this after Bug 1 and Bug 3 fixes** — both touch the exact timer/reveal machinery this phase extends; fixing them first avoids building the new screen on top of the same race conditions.

### Phase 4 — Transition animation in/out of intermission
New enter/exit motion for the leaderboard reveal, consistent with the existing `AnimatePresence` idiom. Prototype visually first (see Web UI prompt below), then port.
- **Model: Sonnet, medium effort** for the port once the design is settled.

### Phase 5 — Final game-over screen (top 3 + own rank)
Extend `CompleteScreen` to add a podium (reuse `SessionCompleteFireworks` for celebration, model layout on Live Trivia's post-game podium block) plus a stats/comparison section: viewer's final rank, points, and how they compared to the field (rank movement, e.g. Live Trivia's ▲/▼ stat bar).
- **Model: Sonnet, medium-high effort.**

### Claude Web UI — Phase 4 only
**Recommended: Claude Opus 4.8, high effort, as a self-contained HTML/CSS/JS artifact.**

```
Design a transition animation for a trivia game's "intermission" screen — the beat between rounds where players see a leaderboard before the next round starts.

Build a self-contained HTML/CSS/JS artifact (inline styles/script, no external libraries) that demos:

1. ENTER transition: the round-results view (a simple mock card list of "answers + points") animates OUT, and a leaderboard (mock list of 5 players with rank, name, points, using placeholder data) animates IN. Should feel energetic but not distracting — this happens every round.
2. HOLD: the leaderboard sits on screen for ~4-5 seconds (simulate with a visible countdown ring or bar).
3. EXIT transition: the leaderboard animates OUT and a "next round starting..." countdown (3-2-1) animates IN.

Constraints:
- Dark theme (near-black background), single accent color (cyan or amber) for emphasis — this must work as a full-screen mobile web view.
- Keep total enter+exit under 600ms each; this repeats every round so it must not feel slow on repeat viewing.
- Use CSS transforms/opacity only (translate, scale, opacity) — no layout-thrashing properties — since this will be ported to framer-motion `AnimatePresence` variants afterward.
- Add a "Replay" button so I can re-trigger the sequence to evaluate the feel repeatedly.
- Comment the exact easing curves and durations you use for each step, so they can be copied 1:1 into framer-motion `transition` props.
```

---

## B. Bug Fixes

### Bug 1 — Pre-round countdown freezes at "5"

**Root cause**: `CategoryBlitzGame.tsx:783-787` passes `onZero` to `NextRoundCountdown` as a **new inline arrow function on every render** (`onZero={() => setCountdownDoneRoundId(results?.roundId ?? null)}`). `CategoryBlitzGame` re-renders every 250ms because the parent timer tick (`lib/categoryBlitzRealtime.ts:303-332`, `TIMER_TICK_MS = 250`) calls `setTimeRemaining`/`setNextRoundStartsIn` on that cadence. `NextRoundCountdown.tsx:27-42`'s internal ticker effect depends on `[count, onZero]` — since `onZero`'s identity changes every render, the effect tears down and reschedules its `setTimeout(…, 1000)` ~4x/second, so the pending 1-second timeout never survives long enough to fire. The digit never decrements.

Note the codebase already solved this exact class of bug for `GradingCascade` by memoizing its `answers` array (`CategoryBlitzGame.tsx:669-686`, with an explicit comment about timer re-renders stalling reveal timers) — the same fix was just never applied to `NextRoundCountdown`'s `onZero`.

**Fix**: Wrap `onZero` in `useCallback` (or move the callback reference out of the render closure, e.g. via a ref) in `CategoryBlitzGame.tsx` so its identity is stable across the 250ms timer re-renders.
- **Model: Sonnet, low-medium effort.** Small, precisely diagnosed fix — the `GradingCascade` pattern is a ready template.

### Bug 2 — Grading never completes / all answer fields show "no answer"

Three contributing issues, most direct cause listed first:

1. **`userId` mismatch at read time (most likely direct cause).** `ResultsScreen`'s per-category lookup (`CategoryBlitzGame.tsx:262-295`) does `cat.answers.find(a => a.userId === userId)` and renders `"no answer"` on a miss — exactly the reported symptom. But the client's submit call (`CategoryBlitzGame.tsx:387-395`, `AnsweringScreen.submitAnswers`) sends `{ venueId, categoryIndex, answer }` with **no `userId`/`authId` field**. The server route (`app/api/category-blitz/rounds/[id]/submit/route.ts:9-49`) only falls back to `body.userId` when the session cookie (`tp_sess`) doesn't resolve one — which only works reliably when `SESSION_SECRET` is configured and the cookie is valid. Any drift between the `userId` the server persisted on the submission and the `userId` the client (`lib/storage.ts:126`, `getUserId()`) uses to look itself up in `ResultsScreen` will blank every field. Nothing currently gates rendering `ResultsScreen` on `userId` being non-empty either (`CategoryBlitzGame.tsx:814-820` only checks `phase === "results" && results`).

2. **No retry after a failed score POST.** `lib/categoryBlitzRealtime.ts:278-298` — if the client's POST to `/api/category-blitz/rounds/[id]/score` throws or returns `ok: false`, `scoringCalledRef.current` is never reset (`lib/categoryBlitzRealtime.ts:311-313`), so the client won't retry; the player is stuck on `ScoringScreen` until the fallback poll or cron (`app/api/cron/category-blitz-score/route.ts`) eventually scores the round server-side.

3. **`scoreRound()` isn't safe against concurrent invocation.** `lib/categoryBlitz.ts:736-758` — the only idempotency guard is `status === "complete"` short-circuit plus a best-effort `status: "scoring"` update. A client-triggered score call and a cron-triggered call that both read `status: "active"` before either writes can both proceed, re-validate, and re-run `awardCategoryBlitzPoints`/`mergeCumulativeSessionTotals` (lines 847-852) — double-awarding points and double-broadcasting `round_scored`.

**Fix, in order**:
- Send `userId`/`authId` explicitly in the submit request body from `AnsweringScreen.submitAnswers`, matching whatever identity the server ultimately persists on the submission row, and use that same source consistently in `ResultsScreen`'s lookup. Add a guard so `ResultsScreen` doesn't render until `userId` is hydrated.
- Reset `scoringCalledRef.current` (with backoff) when the score POST fails, so the client retries instead of relying solely on poll/cron rescue.
- Add a proper claim/lock in `scoreRound()` (e.g. a conditional update `status: 'active' → 'scoring'` with `.select()` to confirm exactly one caller won the race) before doing any validation/point-award work, and have losers just await/read the existing result.
- **Model: Sonnet, medium-high effort.** Touches client submit payload, server route, results-screen read path, and a concurrency fix in the scoring engine — needs careful end-to-end tracing, not just a local patch.

### Bug 3 — Round-start reveal animation gets interrupted

**Root cause**: The round timer and auto-scoring trigger run independently of whatever the client is animating. `lib/categoryBlitzRealtime.ts:303-314` — the 250ms tick computes `remaining` from `endsAtRef.current` and, the instant it hits 0, calls `triggerScoringRef.current(...)`, which on success flips `phase` to `"results"`. `CategoryBlitzGame.tsx:793-812` only renders `RoundStartReveal`/`AnsweringScreen` while `phase === "answering"`; the moment `phase` changes, that block stops matching and `RoundStartReveal` unmounts outright mid-animation — its `onDone` never runs. This is most visible on short rounds or when a client's "answering" phase render starts a beat late (slow poll/broadcast delivery), leaving little runway for the reveal's letter-drop + staggered category cascade (`RoundStartReveal.tsx:16-33`) to finish before the round's real countdown expires.

The "shown once per round" guard itself (`CategoryBlitzGame.tsx:662`, keyed on `round.id`) is *not* the problem — it's correctly stable across re-renders/realtime traffic. The issue is purely the unmount race against the countdown.

**Fix**: Reserve a fixed reveal window separate from answerable time — either (a) have the server-side round `endsAt`/answerable-start account for a reveal buffer (round timer doesn't start counting down answerable time until the reveal's expected duration has elapsed), or (b) client-side, delay considering the round "expired"/eligible for auto-scoring until `RoundStartReveal`'s `onDone` has fired at least once for that `round.id`. Prefer (a) if round timing is meant to be authoritative server-side (avoids clients with slow reveals getting less real answering time); (b) is a faster, purely client-side patch if round-length precision isn't critical.
- **Model: Sonnet, medium effort** for approach (b); **medium-high** if going with (a) since it touches round-timing logic that's likely shared with scoring/cron expiry checks.

---

## Suggested execution order

1. Bug 1 (countdown freeze) — small, isolated, unblocks visual QA of everything else.
2. Bug 3 (reveal interruption) — same timer/phase machinery Phase 3/4 will build on.
3. Bug 2 (grading/answers vanish) — highest severity (players get no feedback and possibly no points), most involved.
4. Phase 1 → 2 (scoring gate + banner) — backend-first, low risk once bugs are settled.
5. Phase 3 → 4 (intermission screen + animation) — Web UI prototype for Phase 4 can happen in parallel with Phase 3 coding.
6. Phase 5 (final screen).
