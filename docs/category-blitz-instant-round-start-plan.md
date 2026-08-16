# Category Blitz — Instant Round Start (kill the "Loading categories…" gap)

**Status: Phase 1 built. Phases 2–5 are not being pursued** — Andrew's call after reviewing
the trade-offs (see §4). The remaining phases stay documented for the record, not as a
backlog.
**Scope:** the Phase 1 kick helps continuous and scheduled venues alike; it's client-side
and doesn't care which engine is behind the endpoint.

---

## 1. Why the gap exists today

When the intermission countdown hits `00:00`, three separate delays stack up before the
player sees a board:

**(a) The next round does not exist yet — 0 to 15s, ~7.5s median.**
`startContinuousRound` (`lib/categoryBlitz.ts:2109`) inserts the round row with
`ends_at = Date.now() + roundDurationSeconds` *at insert time*. It is only called from
`driveContinuousCategoryBlitz` (`lib/categoryBlitz.ts:2206`), which itself only runs when
something calls it:

- a client GET of `/api/category-blitz/sessions` — the hook's **15s fallback poll**
  (`POLL_INTERVAL_MS`, `lib/categoryBlitzRealtime.ts:112`), or
- the Vercel cron `/api/cron/category-blitz-continuous` — **once per minute** (`vercel.json`).

Nothing fires at T=0. The countdown the player watches is a pure client-side derivation
(`nextRoundStartAtMs` = `scored_at + intermission`), and the server has no idea it elapsed
until the next poll wanders in. **This is ~95% of the perceived wait.**

**(b) A round-trip after the round is created — ~200–600ms.**
The `round_started` broadcast handler deliberately refetches `/current-round` rather than
trusting the payload (`lib/categoryBlitzRealtime.ts:676-685`).

**(c) The round-start reveal — up to 3s.**
`ROUND_START_REVEAL_MAX_MS = 3000` (`components/category-blitz/RoundStartReveal.tsx:34`).
This one is intentional showmanship (the letter drop), not a bug — but it becomes the
visible wait once (a) and (b) are gone.

The pulsing text itself is `IntermissionStatus.tsx:37` (fires whenever
`nextRoundStartsIn <= 0`) and the twin at `CategoryBlitzGame.tsx:653`.

**Answer to the question as asked: yes, this is fixable — and the real fix is not
"preload faster", it's "create the round before the countdown expires."** You cannot
prefetch a board that has not been generated yet.

---

## 2. Target architecture

Pre-create the next round **during** the intermission with an explicit future start time,
ship its board to clients a few seconds early, and let each client flip locally at T=0.
The server promotes the round independently, so no client is waiting on a network hop at
the moment of truth.

Two structural changes make this safe:

- A round row gains `starts_at` and a `pending` status. `ends_at` is computed at
  pre-creation (`starts_at + duration`), so the round's schedule is fully deterministic
  and a late promotion cannot shorten play time.
- Submissions become **time**-authoritative rather than **status**-authoritative
  (`submitAnswer`, `lib/categoryBlitz.ts:1249`), so a client that flips a few hundred ms
  before the server promotes doesn't eat a 400.

---

## 3. Phases

### Phase 1 — Wake the server at T=0 — **BUILT**

Kills delay (a) without changing the data model: when a client's countdown reaches zero it
*asks* for the round instead of waiting out its 15s poll. Median wait drops from ~7.5s to
one round-trip (~300ms) + the reveal.

**As built:**

- **The kick** — `lib/categoryBlitzRealtime.ts`, the "Round-boundary kick" effect. Fires
  `loadSessionRef.current()` when `nextRoundStartsIn` reaches `0` during `results` /
  `reveal` / `scoring`, guarded by `kickedRoundIdRef` (keyed on the round that just
  *ended*) so it runs once per boundary rather than on every 250ms tick.
- **Retry ladder** — `KICK_RETRY_DELAYS_MS = [1200, 3000, 6000]`, then it stops and lets
  the 15s poll take over. Capped on purpose: a venue whose letter has thin pool coverage
  makes `startContinuousRound` throw every time, and retrying cannot fix that.
- **No effect cleanup on the ladder** — the subtle part. `phase` legitimately changes while
  the countdown sits at zero (a settling grading cascade flips `reveal` → `results`), so an
  effect cleanup would cancel the pending rungs while `kickedRoundIdRef` — already set —
  made the re-run bail out, silently killing the ladder exactly when a slow venue needs it.
  Instead each rung re-checks `currentRoundIdRef` and self-terminates when the next round
  lands; timeouts are cleared on unmount/venue change and at the start of each new ladder.
- **Player-count-scaled jitter** — `kickJitterMs()`. The window is `200ms × playerCount`
  (capped at 3s) rather than a fixed spread, because with N clients drawing uniformly from
  `[0, k·N]` the *earliest* draw lands at ≈`k` regardless of N. A solo player waits ~100ms;
  a busy venue gets its round just as fast while the redundant kicks fan out. This is also
  what keeps `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM` safe, where one boundary would be
  shared by every player everywhere. Exported and pinned by
  `tests/lib.category-blitz-round-boundary-kick.test.ts`.
- **Herd safety net (pre-existing):** `uq_category_blitz_rounds_session_open` resolves the
  create race in Postgres (23505 → the loser returns the winner's round,
  `lib/categoryBlitz.ts:2172-2178`), and one `round_started` broadcast serves everyone else.
- **Boundary-identity invariant (fixed 2026-08-16, see `docs/code-review-fix-plan-2026-08-16.md`
  Phase 3):** the "next round in" countdown and the round whose boundary it counts down to are
  one value, set together, never re-assembled from two sources. Enforced by the type —
  `nextRoundCountdown: { roundId, secondsRemaining } | null`, set only via
  `setNextRoundCountdownFor(roundId, seconds)` — rather than reading `currentRoundIdRef.current`
  at kick-effect time. Two consequences a future editor must not undo:
  - Never re-derive the boundary round from `currentRoundIdRef` inside the kick effect — the
    deferred-round effect is declared earlier in the file and advances that ref first in the
    same flush, so by the time the kick effect runs the ref may already point at the *next*
    round.
  - Never arm the kick from an unscored round (`phase === "scoring"` was removed from the
    kickable phases). Its `startedAt + duration + intermission` countdown is only an estimate;
    the server abandons it for `scoredAt + intermission` the moment grading lands, and arming
    against the stale estimate burns `kickedRoundIdRef` before the real anchor exists.
  - `setNextRoundCountdownFor`'s identity preservation (no new object when nothing moved) is a
    render-frequency guarantee, not a style choice — the timer ticks at 250ms but the countdown
    only changes once a second, and a fresh object every tick would re-run the kick effect and
    re-render the game surface 4×/second.

**Anti-flash grace** (folded in — at ~300ms the old message flashed and vanished, reading
as a glitch rather than a status):

- `lib/hooks/useDelayedFlag.ts` — returns `active` only once it has held for `delayMs`.
  Resets during render (React's "adjusting state when a prop changes"), not from an effect:
  that satisfies `react-hooks/set-state-in-effect` and avoids leaking a stale `true` into
  the frame before the effect runs. Tested in `tests/lib.use-delayed-flag.test.ts`.
- Applied at both loading sites — `IntermissionStatus.tsx` and `ContinuousWaitScreen`
  (`CategoryBlitzGame.tsx`) — with a 600ms grace. Below that the card holds a zeroed
  countdown instead: same layout, no flicker, and honest (the timer really did hit zero).

**Verified:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` (9 new
tests; the 4 pre-existing `venue-activation` / `admin-mobile` failures are unrelated and
reproduce on a clean tree). **Not yet verified on a real device at a venue** — the thing
this change is actually about (perceived wait at a round boundary) can only be judged with
a real clock and real players.

---

### Phase 2 — Server pre-creates the next round during intermission

- **Migration** (new timestamped file): add `starts_at timestamptz` to
  `category_blitz_rounds`; allow `status = 'pending'`; **extend**
  `uq_category_blitz_rounds_session_open` to `status in ('pending','active','scoring')` so
  two concurrent drives can't pre-create two rounds.
- `startContinuousRound` gains a `startsAt` option: writes `status='pending'`,
  `starts_at`, `ends_at = starts_at + duration`, and does **not** broadcast.
- `driveContinuousCategoryBlitz`: when the latest round is `complete` and no pending round
  exists → pre-create one anchored at `scored_at + intermission`. When a pending round's
  `starts_at` has passed → promote to `active` (pure status flip) and broadcast
  `round_started`.
- **The risky part:** `getLatestRound` orders by `created_at desc`, so a pending round
  becomes "the latest round" everywhere. Every status check in `lib/categoryBlitz.ts` must
  learn about `pending` — `driveContinuousCategoryBlitz`'s `!== "complete"` branch,
  `scoreExpiredRoundForVenue`, `endVenueAutoSession`, `closeStaleAutoSession`,
  `abandonVenueAutoSession`, `skipRound`, `endContinuousSession`, `isSessionIdle`. Audit
  all of them; a missed one strands a venue.
- Cron stays as-is — it becomes a pure backstop for promotion.

> **Model: Opus 5 · Effort: high.** Schema + concurrency + rewriting the engine's status
> machine, with real "venue gets stuck forever" downside on a missed call site.

---

### Phase 3 — Ship the pending board early; clients flip locally (true zero)

- `/api/category-blitz/sessions/[id]/current-round` returns `pendingRound` alongside
  `round`, but **only inside a `PREFETCH_WINDOW_SECONDS` window** (start at 5s) before
  `starts_at`.
- Hook holds `pendingRound` in state; the existing 250ms timer promotes it locally to
  `round` + phase `answering` the instant `Date.now() >= starts_at` — zero network.
- Relax `submitAnswer` to accept a round that is `pending`/`active` **and** whose
  `starts_at` has passed, so a client that flips slightly ahead of the server's promotion
  can still submit. This is what makes the local flip safe.
- **Integrity call-out for Andrew:** prefetching the board means a player who inspects
  network traffic sees the letter and the 12 categories up to 5s early. The server's
  `starts_at` gate prevents *submitting* early, but not *thinking* early. Options: keep 5s,
  shrink to 2s (still kills the gap), or drop Phase 3 and accept Phase 1+2's ~300ms.
  **This is a product decision, not a technical one — worth deciding before Phase 3 starts.**

> **Model: Opus 5 · Effort: high.** Touches the hook's phase machine (the one place in the
> codebase with the most accumulated bug-fix scar tissue) plus the submission gate.

---

### Phase 4 — Absorb the reveal animation, and the TV screen

With (a) and (b) gone, the 3s `RoundStartReveal` *is* the wait.

- Option A (recommended): drive the reveal off `starts_at` so it begins during the final
  ~3s of intermission and the answering board is live exactly at T=0.
- Option B: leave it — it's the branded letter-drop, and 3s of animation reads very
  differently from 7s of a pulsing spinner.
- Mirror whatever lands onto the venue TV surface (`components/venue-screen/*`), which
  renders its own countdown off the same `nextRoundStartAtMs` anchor.

> **Model: Sonnet 5 · Effort: medium.** Animation timing + a second surface; low blast radius.

---

### Phase 5 — Flag, verify, roll out

- Gate the whole thing behind `NEXT_PUBLIC_CATEGORY_BLITZ_PREFETCH_ROUNDS`, following the
  repo's reversible convention (off = today's lazy creation, fully inert) — same shape as
  `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`.
- Vitest: promotion/pre-creation timing math, and engine transitions across every
  `pending` call site from Phase 2.
- Browser pass via the `/verify` skill in test mode (`TEST_MODE_SECONDS = 10`), watching
  two clients cross a round boundary — the gap is only observable with a real clock.
- Confirm the flag-off path still behaves exactly as today before flipping.

> **Model: Sonnet 5 · Effort: medium** (bump to Opus 5 / high if the Phase 2 engine tests
> get hairy).

---

## 4. Outcome

**Phase 1 shipped; Phases 2–5 were deliberately not pursued.** Phase 1 removed roughly 95%
of the wait with a single self-contained hook change — no migration, no new flag, no change
to the data model. The remaining phases would have bought under 300ms more, in exchange for
a schema migration, a `pending` status threaded through ~8 engine call sites (each a
potential "venue stuck forever" bug), and — for Phase 3 — shipping the letter and board to
clients seconds before the round opens, where anyone with devtools could read them early.

That trade wasn't worth it. Phase 4's reveal animation was left alone too: three seconds of
branded letter-drop reads as the game doing something, which is a different experience from
seven seconds of a pulsing spinner even when the clock disagrees.

**If the gap ever feels wrong again**, re-measure before reopening this. The likely
culprits are the retry ladder being exhausted (a venue with thin category-pool coverage for
some letter — check for `Failed to assemble a category board` in logs) or a genuinely slow
cold start, neither of which Phases 2–3 would have fixed.
