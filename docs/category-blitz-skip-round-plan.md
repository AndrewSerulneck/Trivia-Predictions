# Category Blitz — Test-Mode "Skip Round" Feature

**Goal:** Let a developer, while playing Category Blitz in test mode, jump straight to a
new round without waiting out the answer countdown or the between-rounds intermission —
so iteration is fast. **Must be impossible to affect a real (non-test) session.**

---

## Phase overview

| Phase | What | Model | Effort |
|-------|------|-------|--------|
| **0** | Guardrail spec (this doc) — nail down semantics & safety invariants | Opus 4.8 | high |
| **1** | Server endpoint `POST /api/category-blitz/sessions/[id]/skip-round` | Sonnet 5 | high |
| **2** | Dev-only "Skip Round" client button, gated on test mode | Sonnet 5 | medium |
| **3** | Verification (browser via `verify` skill + curl negative tests) | Sonnet 5 | medium |
| **4** | Cleanup / doc comments | Haiku 4.5 | low |

---

## Phase 0 — Design & guardrail spec

### How the round lifecycle actually works (verified against code)

There is **no "start round" / "next round" HTTP route.** Advancement is lazy and
server-authoritative: every `GET /sessions` poll (and the cron backup) calls
`driveVenueCategoryBlitz(venueId, now)` (`lib/categoryBlitz.ts:679`), which:

1. Closes stale/idle auto sessions.
2. Scores any expired round via `scoreExpiredRoundForVenue → scoreRound`.
3. For an `auto` session in `lobby`: if `isLobbyStartDue` (`now >= starts_at`) → `startRound`.
4. For an `auto` session that's `active`: if the latest round is `complete` and
   `now >= nextRoundStartAtMs(latest)` **and** `canFitAnother` (a round still fits before
   the schedule window closes) → `startRound`; else if no time left and last round is
   complete → `endSession` (Game Over).

The client (`lib/categoryBlitzRealtime.ts`) never drives transitions itself — it compares
server timestamps (`ends_at`, `scored_at`) against `Date.now()` on a 250 ms tick, backed by
a 15 s poll and Supabase realtime broadcasts (`round_started`, `round_scored`,
`session_ended`). Whichever arrives first, they all funnel through the same phase logic.

**The two levers the whole machine keys on:**
- `category_blitz_rounds.ends_at` — when the answer timer expires (round becomes scoreable).
- `category_blitz_rounds.scored_at` — anchor for the intermission; next round is due at
  `scored_at + intermissionSeconds(testMode)` (`nextRoundStartAtMs`, `lib/categoryBlitz.ts:659`).

`scoreRound` refuses to score early: it throws if the round is `active` and
`Date.now() < ends_at - SUBMISSION_GRACE_MS` (`lib/categoryBlitz.ts:1180`).

### Chosen mechanism: nudge the two timestamps, then reuse `driveVenueCategoryBlitz`

The skip endpoint does **not** insert rounds or invent new state transitions. It moves
`ends_at` / `scored_at` into the past (exactly the values a real expiry would eventually
produce), then calls the **unmodified** `driveVenueCategoryBlitz`, which does the real work.
This preserves every existing guardrail for free:

- `startRound`'s `uq_category_blitz_rounds_session_open` unique index + `23505` recovery
  (duplicate-round race) — untouched, because we still go through `startRound`.
- `canFitAnother` schedule-window check + auto-end-after-last-round (commit `f99fee6`) —
  untouched, so skipping on the final schedule slot correctly ends the session to Game Over
  instead of stranding on the last round.
- `scoreRound`'s scoring lock + idempotency — untouched.
- Client convergence — no new client code path; the resulting `round_started` /
  `session_ended` broadcast + the existing timestamp math land the tester in the new state.

### Endpoint algorithm (`POST /api/category-blitz/sessions/[id]/skip-round`)

```
1. Load session by [id] via supabaseAdmin.
2. HARD GATE (all must hold, else 403 no-op):
     - session.test_mode === true      // read fresh from DB, NEVER from request
     - session.source === "auto"        // drive*() only advances auto sessions
     - session.status in ("lobby","active")
3. pastAnchor = now - (roundIntervalSeconds(true) + buffer) seconds
4. latest = getLatestRound(session.id)
   a. status === "lobby" (no round / not yet due):
        UPDATE sessions SET starts_at = <now-ε>   // makes isLobbyStartDue true
   b. latest exists AND latest.status !== "complete" (answering/scoring):
        UPDATE rounds SET ends_at = pastAnchor WHERE id = latest.id  // pass expiry guard
        await scoreRound(latest.id)               // scores with whatever was submitted
        UPDATE rounds SET scored_at = pastAnchor WHERE id = latest.id // collapse intermission
   c. latest.status === "complete" (reveal/results/intermission):
        UPDATE rounds SET scored_at = pastAnchor WHERE id = latest.id // collapse intermission
5. await driveVenueCategoryBlitz(session.venue_id, now)
     → fires startRound (broadcast round_started) OR endSession (broadcast session_ended)
6. Return the resulting session (+ latest round) as JSON.
```

`buffer` ≥ a few seconds so the past anchors are unambiguously "elapsed" against any clock
drift and past `SUBMISSION_GRACE_MS`.

### Safety invariants (the point of this phase)

1. **Production sessions are byte-for-byte unaffected.** The endpoint refuses any session
   with `test_mode !== true`. `test_mode` is read from the DB row, never trusted from the
   request body / query / header. (Same reasoning as the existing pin at
   `lib/categoryBlitz.ts:682-689`.)
2. **No new write path to rounds.** All round creation still flows through `startRound`;
   all scoring through `scoreRound`. The race guards remain authoritative.
3. **Schedule window still respected.** We never bypass `canFitAnother`, so auto-end logic
   and Game Over behave exactly as in real play.
4. **Idempotent under double-click.** Two concurrent skips are absorbed by `scoreRound`'s
   lock and `startRound`'s `23505` recovery — worst case is one extra harmless advance.
5. **Client button visibility ≠ authority.** The button shows on
   `isCategoryBlitzTestModeEnabled()` (client toggle), but the server independently verifies
   `session.test_mode`. Toggle-on + real session ⇒ button appears, endpoint returns 403.
   Correct posture: display convenience is client-side, safety is server-side.

### The one decision to confirm before Phase 1

**What should "skip" do about the reveal/results screens?**

- **(A) — Recommended default:** Skip collapses *both* the answer timer and the intermission,
  landing directly in the next round's answering phase. Matches the stated goal ("don't want
  to wait"). Trade-off: the reveal grading cascade + results/leaderboard for the skipped
  round are *not* shown.
- **(B):** A lighter "skip answer timer only" that scores now but still plays reveal/results,
  so the tester can inspect grading, then a second press skips the intermission.

Spec above implements **(A)**. If (B) is wanted, step 4b omits the `scored_at` nudge (score
now, but let the normal intermission/reveal run), and skipping again from the `complete`
phase (step 4c) advances past the intermission. (A) and (B) can coexist as two buttons, but
recommend shipping (A) first.

### Out of scope / explicitly not changed

- Cron engine (`runCategoryBlitzEngine`), production timers, non-test sessions.
- The `<3-player` scoring gate (a solo tester who wants real grading sets
  `CATEGORY_BLITZ_ALLOW_SOLO_SCORING=true`, unchanged).
- The stray NUL byte currently in the working-tree copy of `lib/categoryBlitz.ts` (offset
  57105) — pre-existing, unrelated, left for the author to resolve.
