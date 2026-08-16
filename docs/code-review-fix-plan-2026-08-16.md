# Code Review Fix Plan — 2026-08-16 working tree

Fixes for the four findings from the `/code-review` pass on the instant-round-start
branch (working tree: `lib/categoryBlitzRealtime.ts`, `components/category-blitz/*`,
`components/nfl-pickem/NFLPickEmGameList.tsx`, `next-env.d.ts`).

Phases are ordered cheapest-and-safest first so the two trivial ones can land
immediately and the risky realtime work is isolated in its own commit.

---

## Phase 1 — Drop the `next-env.d.ts` churn

**Finding:** `next-env.d.ts:3` flipped from `./.next/dev/types/routes.d.ts` to
`./.next/types/routes.d.ts` — a build-mode artifact captured by accident. It flips
back on the next `npm run dev`, and a clean CI checkout running `tsc --noEmit`
before any `next build` hits TS2307.

**Change:** `git checkout -- next-env.d.ts`. Nothing else. Optionally confirm the
file is already in the "generated, don't hand-edit" category and leave it alone
going forward.

**Verify:** `git status` shows the file unmodified.

**Model / effort:** Haiku 4.5 · trivial (~2 min). No judgment required — it is a
single revert.

---

## Phase 2 — NFL Pick 'Em preview-week copy

**Finding (`NFLPickEmGameList.tsx:396`):** removing the preseason early-access
notice left `previewWeekKickoffLabel` computed and never read (neither tsc nor
eslint flags it, because `previewWeek` is still consumed inside the memo). The
user-visible half is worse than the dead code: the new header says "every NFL
matchup **this week**" over a preview slate that kicks off weeks later — reachable
in mid-August via `buildNFLGameWeekOptions`'s preview branch — and the sentence
that explained the gap is gone.

**Changes:**
1. Decide the copy contract. Recommended: keep the shortened header, but make the
   "this week" phrase conditional — when `previewWeek && selectedWeekId ===
   previewWeek.id`, render the preview-aware sentence instead (reusing
   `previewWeekKickoffLabel`), otherwise the new short one. That keeps the notice's
   information without restoring the separate banner section.
2. If instead the notice is intentionally gone for good, delete
   `previewWeekKickoffLabel` **and** soften the header to week-agnostic wording
   ("Pick winners for every NFL matchup." / "Picks lock at kickoff.").
3. Strip the trailing space after "Picks lock at kickoff. " in the header string.

**Verify:** `npx tsc --noEmit`, `npx eslint components/nfl-pickem/NFLPickEmGameList.tsx`,
and eyeball the preview-week branch (mid-August, before Week 1 starts) in the app.

**Model / effort:** Sonnet 5 · low. One file, one copy decision; the only real
question is which of the two options above the product wants — ask if unsure.

---

## Phase 3 — Fix the kick's boundary-round anchoring (the real bug)

**Findings (`lib/categoryBlitzRealtime.ts:749` and `:751`)** — one root cause, two
triggers. The kick effect reads `currentRoundIdRef.current` to identify "the round
we're waiting past," but that ref is not guaranteed to still hold the round the
zeroed countdown belongs to:

- **Deferred-round race (:751):** the deferred-round effect is declared at line 469,
  so in the same flush it runs *first* and advances `currentRoundIdRef` to R2 while
  `nextRoundStartsIn` is still the stale `0`. When the grading cascade outlasts the
  intermission (short `intermission_seconds`, or test mode's 10s), the
  reveal→results commit arms the ladder against **R2 instead of R1**: all four rungs
  fire `loadSession()` during R2's answering phase, the
  `currentRoundIdRef.current !== boundaryRoundId` self-terminate can never trigger,
  and `kickedRoundIdRef === R2` then disarms the kick at R2's real boundary —
  dropping back to the 15s poll this feature exists to remove.
- **Scoring-phase burn (:749):** allowing `phase === "scoring"` to arm the kick
  burns `kickedRoundIdRef` against the *pre-scoring* anchor
  (`startedAt + duration + intermission`). If `/score` keeps returning `ok:false`
  (min-player gate), the 250ms retry loop holds "scoring" past that anchor. Once the
  round is finally scored server-side the anchor moves to `scoredAt + intermission`
  and a fresh countdown runs — but line 752 bails at its zero because the ref is
  already burned.

**Approach (recommended):** stop deriving the boundary identity from a live ref at
effect time. Instead, carry the round id alongside the countdown so the two can
never disagree:

1. Change `nextRoundStartsIn` state (or add a sibling state/ref) to carry
   `{ roundId, secondsRemaining }` — set at the same moment the countdown is
   computed in the timer effect and in the `complete`/`scoring` branches of
   `applyRound`. The kick effect then uses `state.roundId` as `boundaryRoundId`,
   which is immune to the deferred-round effect having already advanced
   `currentRoundIdRef`.
2. Keep the self-terminate check, but compare against the carried id
   (`currentRoundIdRef.current !== boundaryRoundId` still works, and now means what
   it says).
3. For the scoring burn: either (a) don't arm the kick from `phase === "scoring"`
   at all — a round that hasn't been scored yet has no trustworthy next-round
   anchor — or (b) key `kickedRoundIdRef` on `${roundId}:${anchorKind}` where
   `anchorKind` is `pre-scoring` vs `scored`, so the post-scoring countdown gets its
   own arming. Option (a) is simpler and loses little: the `round_scored` broadcast
   and the results commit both re-arm promptly. Prefer (a) unless a venue is
   observed sitting in "scoring" past its anchor with no re-arm.
4. Leave the deliberate no-cleanup design on the ladder as-is — the review confirmed
   it sound, and the comment block explaining it stays accurate.

**Tests to add to `tests/lib.category-blitz-round-boundary-kick.test.ts`:**
- Grading cascade outlasts intermission → ladder arms against **R1**, and
  self-terminates as soon as R2 lands (no `loadSession` calls during R2 answering).
- R2's own boundary still arms a fresh ladder (i.e. `kickedRoundIdRef` was not
  burned by R1's cascade).
- `/score` returns `ok:false` repeatedly past the pre-scoring anchor → once the
  round scores, the post-scoring countdown's zero still arms exactly one ladder.

**Verify:** `npx vitest run tests/lib.category-blitz-round-boundary-kick.test.ts`,
then the full `npm run test` (the 4 failures in
`tests/venue-activation.phase4-mount.test.ts` and
`tests/admin-mobile.section-registry-split.test.ts` are pre-existing and unrelated —
confirm the count is still 4). `npx tsc --noEmit` and `npx eslint` on the changed
files. Then a real two-client run with a short `intermission_seconds` in test mode
to watch a cascade-overrun boundary advance instantly rather than after 15s.

**Model / effort:** Opus 5 · high. This is concurrent-effect ordering in a hook with
refs, deferred state, and a retry ladder — exactly where a plausible-looking fix
introduces a subtler race. Budget for reading the whole hook, not just the kick
effect, and for writing the three regression tests before the fix.

---

## Phase 4 — Update the plan doc and commit

**Changes:** fold the Phase 3 outcome into
`docs/category-blitz-instant-round-start-plan.md` (the boundary-identity contract is
worth recording — it is the non-obvious invariant a future editor would break), then
commit Phases 1–3 as separate commits on a branch.

**Verify:** final `npm run test` + `npx tsc --noEmit` on the branch tip.

**Model / effort:** Sonnet 5 · low.

---

## Phase 1 — DONE (2026-08-16)

`git checkout -- next-env.d.ts` applied; `git status` confirms the file is
unmodified against HEAD. Nothing else touched. Not committed (plan says commit
Phases 1–3 together in Phase 4).

### Handoff notes for Phase 2

Exact location: [components/nfl-pickem/NFLPickEmGameList.tsx:393-399](components/nfl-pickem/NFLPickEmGameList.tsx#L393-L399)
(`previewWeek`/`previewWeekKickoffLabel` memos) and the header paragraph at
[:445](components/nfl-pickem/NFLPickEmGameList.tsx#L445):

```
Pick winners for every NFL matchup this week. Correct picks are worth 10 points. Picks lock at kickoff. 
```

Confirmed facts, so the next phase doesn't need to re-derive them:
- `previewWeekKickoffLabel` (line 396-399) is computed from `previewWeek.weekStartDate`
  via `formatCalendarDate(..., { month: "long", day: "numeric" })`, and is **not
  referenced anywhere else in the file** — grep confirms only the one definition site.
  `previewWeek` itself (line 395, `weeks.find(w => w.isUpcomingPreview)`) is still used
  elsewhere in the component, so only the *label* memo is dead — don't remove `previewWeek`.
- The header string is a single JSX text node at line 445, currently unconditional —
  it does not branch on `previewWeek` at all today.
- There is a trailing space after "kickoff." before the closing `</p>` — visible in the
  grep output above — strip it regardless of which option is chosen.
- Today's date is 2026-08-16, mid-August: the preview-week branch (`buildNFLGameWeekOptions`'s
  preview path, in `lib/nflPickEm.ts` — not re-read this session, just referenced by the
  original finding) is very likely the live branch right now, so "this week" over a
  preview slate weeks out is probably reproducible today, not just theoretical.
- Do NOT change the "10 points" figure in this string — that's the base Pick'em game's
  per-correct-pick display copy, unrelated to the separate NFL Pick'em *Reward* accrual
  (which CLAUDE.md documents as 1 point/correct pick, a different accrual path entirely
  per `docs/nfl-pickem-reward-plan.md`). Conflating the two would be a scope-creep bug.

Two copy-contract options per the plan (pick one, or ask the user if unsure):
1. **Recommended:** keep short header, but when `previewWeek && selectedWeekId === previewWeek.id`,
   render a preview-aware sentence reusing `previewWeekKickoffLabel` instead of "this week".
2. Delete `previewWeekKickoffLabel` entirely and make the header week-agnostic
   ("Pick winners for every NFL matchup." / "Picks lock at kickoff.").

Verify: `npx tsc --noEmit`, `npx eslint components/nfl-pickem/NFLPickEmGameList.tsx`,
and eyeball the preview-week branch in the running app before calling it done.

Phase 3 (the real bug, `lib/categoryBlitzRealtime.ts`) and Phase 4 (doc + commits)
are still untouched — proceed to Phase 2 first per the plan's ordering, independent
of Phase 3.

---

## Phase 2 — DONE (2026-08-16)

Took **option 1 (recommended)**: kept the dead memo alive by actually using it.
[components/nfl-pickem/NFLPickEmGameList.tsx:444-448](components/nfl-pickem/NFLPickEmGameList.tsx#L444-L448)
now branches the header paragraph on `previewWeek && selectedWeekId ===
previewWeek.id`:

```tsx
<p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-400">
  {previewWeek && selectedWeekId === previewWeek.id
    ? `Pick winners for every NFL matchup. The season kicks off ${previewWeekKickoffLabel}. Correct picks are worth 10 points. Picks lock at kickoff.`
    : "Pick winners for every NFL matchup this week. Correct picks are worth 10 points. Picks lock at kickoff."}
</p>
```

- `previewWeekKickoffLabel` (line 396-399) is no longer dead — it's the only
  consumer, so no eslint/tsc signal changes, but the value now actually reaches
  the DOM.
- Trailing space after "kickoff." is gone in both branches.
- "10 points" left untouched in both branches, deliberately — see the
  Phase 2 handoff notes above for why (it's the base game's per-pick display
  figure, not the separate NFL Pick'em Reward accrual figure).
- `previewWeek.id` exists on the week type (`lib/nflPickEm.ts:264`, `id: string`),
  confirmed by grep before using it in the comparison — not assumed.
- **Verified:** `npx tsc --noEmit` clean, `npx eslint
  components/nfl-pickem/NFLPickEmGameList.tsx` clean (both ran with zero output).
  **Not yet done:** eyeballing the preview-week branch live in the browser — today
  (2026-08-16) is mid-August so `selectedWeekId === previewWeek.id` should be the
  live default branch on first load; the next phase (or whoever runs final
  verification in Phase 4) should confirm this visually before calling the whole
  plan closed. Not blocking Phase 3, which is unrelated code.
- Not committed yet — plan says commit Phases 1–3 together in Phase 4.

### Handoff notes for Phase 3

Phase 3 is the real bug and the only phase carrying regression risk — everything
needed to start is already written above in the "Phase 3 — Fix the kick's
boundary-round anchoring" section of this doc; nothing from Phase 1 or 2 changes
its scope or approach (different files: `lib/categoryBlitzRealtime.ts` vs.
`components/nfl-pickem/NFLPickEmGameList.tsx`, no shared state). Start by reading
the whole hook in `lib/categoryBlitzRealtime.ts`, not just the kick effect at
:749/:751, per the plan's own guidance. Write the three regression tests in
`tests/lib.category-blitz-round-boundary-kick.test.ts` before the fix. After
Phase 3, Phase 4 needs: fold the boundary-identity contract into
`docs/category-blitz-instant-round-start-plan.md`, then commit Phases 1–3 as
three separate commits (next-env.d.ts revert / NFL copy fix / kick boundary fix),
then final `npm run test` + `npx tsc --noEmit` on the branch tip — and remember to
close out the still-open "eyeball preview-week branch live" verification item
from Phase 2 above.

---

## Phase 3 — DONE (2026-08-16)

Took the recommended approach (carry the round id with the countdown) plus
option **(a)** for the scoring burn (don't arm from `phase === "scoring"` at
all). All changes are in [lib/categoryBlitzRealtime.ts](lib/categoryBlitzRealtime.ts);
three regression tests added to
[tests/lib.category-blitz-round-boundary-kick.test.ts](tests/lib.category-blitz-round-boundary-kick.test.ts).

### The invariant, stated once

> **The "next round in" countdown and the round whose boundary it counts down to
> are one value, set together, never re-assembled from two sources.**

That is now enforced by the type: `nextRoundStartsIn: number | null` state was
replaced by `nextRoundCountdown: { roundId, secondsRemaining } | null`, and the
only way to set a live value is `setNextRoundCountdownFor(roundId, seconds)`.
The public hook shape is unchanged — `nextRoundStartsIn` is derived at the return
(`nextRoundCountdown?.secondsRemaining ?? null`), so no consumer changed.

### What changed, concretely

1. **`type NextRoundCountdown`** (above `CategoryBlitzSessionState`) with the
   rationale docblock.
2. **`setNextRoundCountdownFor`** — a `useCallback` that *preserves object
   identity when nothing moved*. This is load-bearing, not cosmetic: the timer
   ticks at 250ms while the countdown only changes once a second, and when the
   state was a bare number React bailed out of those no-op renders for free. A
   fresh object every tick would re-render the whole game surface 4×/second and
   re-run the kick effect on each one. Every call site that used to pass a number
   now passes `(roundId, seconds)`; every "clear" site calls
   `setNextRoundCountdown(null)` (null → null bails out on its own).
3. **The kick effect** (`lib/categoryBlitzRealtime.ts`, "Round-boundary kick"):
   - `boundaryRoundId` now comes from `nextRoundCountdown.roundId`, **not**
     `currentRoundIdRef.current`.
   - `"scoring"` removed from the kickable phases — only `"results"` and
     `"reveal"` arm, both of which imply the round IS scored and therefore that
     the anchor is the real `scoredAt + intermission` one.
   - `fire()`'s `currentRoundIdRef.current !== boundaryRoundId` self-terminate is
     unchanged and now means what it says.
   - The deliberate no-cleanup design was left alone (plan item 4).
4. **`roundRef` — one extra fix, same bug class, found while reading the hook.**
   `loadCurrentRound` calls `loadResults` *synchronously after* `applyRound`,
   inside the same flush, so `loadResults`'s `round` closure is still the
   PREVIOUS round. Anchoring the countdown on that stale round yields a spurious
   `0` (the old round's interval is long past) — which, post-fix, would arm the
   kick early against an anchor the server had already moved. `roundRef` mirrors
   `round` (via a render effect, plus a synchronous write in `applyRound` so the
   within-flush case is covered) and `loadResults` reads it instead. Side benefit:
   `loadResults` no longer depends on `round`, so its identity is now stable —
   which is exactly what the realtime-subscription effect's long comment was
   working around.

### Tests

The three tests the plan asked for are in the new
`describe("round-boundary kick anchoring")` block, driving the real hook via
`renderHook` + jsdom + fake timers, a mutable fake server behind `fetch`, and
`vi.mock("@/lib/supabase", () => ({ supabase: null }))` (realtime dormant; every
transition arrives through poll/kick//score, which is also the solo-player
reality). Pinned `Math.random` at 0.5, so a 1-player venue's jitter is exactly
100ms and kick timing is deterministic. Fake continuous pacing is 6s round / 4s
intermission so a whole round+intermission fits between two 15s polls and every
assertion window is poll-free.

1. `arms against the round that just ENDED when a cascade outlasts the intermission`
2. `still arms a fresh ladder at the NEXT round's own boundary`
3. `does not burn the arming on an unscored round's pre-scoring anchor`

**All three were verified to FAIL against the pre-fix logic** (temporarily
restoring `currentRoundIdRef.current` as `boundaryRoundId` and re-adding
`"scoring"`: 3 failed / 5 passed) and pass after (8/8). If you touch this test
file, redo that check — a test that passes both ways is worthless here.

**Timing gotcha for whoever edits these tests:** inside a single
`await act(async () => vi.advanceTimersByTimeAsync(delta))`, React does not
re-render mid-advance (its scheduler uses MessageChannel, which fake timers don't
drive), so effects only observe state at the *end* of each `advanceTo` call. That
is why the timeline is broken into small `advanceTo` steps at the moments that
matter, and why test 3 delivers the scored round via a `visibilitychange`
dispatched in its own `act` rather than via the 15s poll (a poll at t=15000
coincides with a 250ms tick whose closure is still stale, which clobbers the
countdown back to 0 and makes the assertion measure an artifact).

### Verified

- `npx vitest run tests/lib.category-blitz-round-boundary-kick.test.ts` → 8/8 pass.
- `npm run test` → **4 failed / 1460 passed / 13 skipped**, i.e. exactly the 4
  pre-existing failures the plan named (3 in `tests/venue-activation.phase4-mount.test.ts`,
  1 in `tests/admin-mobile.section-registry-split.test.ts`). Note
  `tests/lib.sportsBingo.player-props.test.ts` failed once in a parallel run and
  passes in isolation — a pre-existing flake, unrelated.
- `npx tsc --noEmit` clean, `npm run lint` clean.
- **Housekeeping:** `tsc` briefly failed on `.next/types/routes.d 2.ts`
  (`TS2300: Duplicate identifier 'LayoutProps'`) — a macOS/file-sync duplicate
  artifact inside the gitignored `.next/` build output, nothing to do with this
  change. Deleted that one file; several other `* 2.*` / `* 3` duplicates remain
  under `.next/` and may resurface. If `tsc` fails on a `.next/…` path, that's
  what it is.

### NOT verified (carry forward)

- **The real two-client run.** The plan's last verification step — a live
  two-client session with a short `intermission_seconds` in test mode, watching a
  cascade-overrun boundary advance instantly instead of after 15s — has NOT been
  done. It needs a dev server, two real browsers and live venue data; the
  regression tests cover the ordering logic but not the end-to-end feel.

### Handoff notes for Phase 4

Phase 4 is doc + commits. Everything it needs:

1. **Fold the boundary-identity contract into
   `docs/category-blitz-instant-round-start-plan.md`.** Put it in
   `### Phase 1 — Wake the server at T=0 — **BUILT**` (line ~68), which is where
   the kick itself is documented — that is the section a future editor reads
   before touching this code. The thing worth recording is the invariant quoted
   above plus its two consequences: (a) never re-derive the boundary round from
   `currentRoundIdRef` at effect time, because the deferred-round effect is
   declared first and mutates it earlier in the same flush; (b) never arm the
   kick from an unscored round, because its `startedAt + duration + intermission`
   countdown is an estimate the server abandons for `scoredAt + intermission` the
   moment grading lands. Also worth a line: `setNextRoundCountdownFor`'s identity
   preservation is a render-frequency guarantee, not a style choice.
2. **Commit Phases 1–3 as three separate commits** on a branch (currently
   everything is uncommitted on `main`; `git status` at session start showed the
   working tree already dirty with the instant-round-start feature itself, so
   **read the diff before staging — Phase 3's commit should carry only the
   boundary-anchoring change, not the whole unrelated feature if it is still
   unstaged**). Suggested split:
   - `next-env.d.ts` revert — note Phase 1 already reverted it, so there may be
     nothing to commit; confirm with `git status`.
   - `components/nfl-pickem/NFLPickEmGameList.tsx` — the preview-week copy fix.
   - `lib/categoryBlitzRealtime.ts` + `tests/lib.category-blitz-round-boundary-kick.test.ts`
     — the kick boundary fix. (The other working-tree files —
     `components/category-blitz/*`, `lib/hooks/useDelayedFlag.ts`,
     `tests/lib.use-delayed-flag.test.ts`, `docs/category-blitz-instant-round-start-plan.md`
     — are the instant-round-start feature itself, not part of this fix plan.
     Decide deliberately whether they ride along or get their own commit; do not
     sweep them in with `git add -A` without looking.)
3. **Two still-open verification items to close or explicitly defer:**
   - Phase 2's "eyeball the preview-week branch live in the browser" (today is
     mid-August, so `selectedWeekId === previewWeek.id` should be the default
     branch on first load).
   - Phase 3's two-client cascade-overrun run described above.
4. **Final `npm run test` + `npx tsc --noEmit` on the branch tip.** Expect exactly
   4 pre-existing test failures; anything else is new.

---

## Summary

| Phase | Scope | Model | Effort |
|---|---|---|---|
| 1 | Revert `next-env.d.ts` | Haiku 4.5 | Trivial |
| 2 | Pick 'Em preview-week copy + dead memo | Sonnet 5 | Low |
| 3 | Kick boundary-round anchoring (both findings) | Opus 5 | High |
| 4 | Plan doc + commits | Sonnet 5 | Low |

Phases 1 and 2 are independent of Phase 3 and can land first. Phase 3 is the only
one carrying real regression risk and should be its own commit.
