# Category Blitz letter die — Phase 13 handoff (2026-10-30)

## For Andrew (plain English)
**What changed:** all the letter-die work so far (Phases 1–12.3) is now saved as one local commit on
`after-app-review` (`2899a9d6`). It is not pushed and not live. Then a fresh code review checked the last round of
fixes. It found 10 possible problems. After checking each one against the code: 7 are real, 1 is probably real, and
1 can't happen in practice (nobody types fast enough). The last one, and one of the real ones, are older game
behaviour, so they're questions for you (below). None of this changes the database or costs anything. One fix
(13.3a) actually saves one database read per player poll.

**The real problems, in plain terms:**
- A new clock reading that arrives while the die is landing can make the die vanish mid-bounce (13.1a).
- The phone-vs-server clock reading is slightly off when the server is slow, which makes the die a little more likely
  to skip its landing (13.1b).
- When one game reload fails quickly, a good reload that arrives after it is thrown away, so "Failed to connect"
  stays up for up to 15 s (13.2a).
- An old reload that lands just after the game ends can briefly bring the ended game back (13.2b, probable).
- Small cleanups: one duplicate database read per poll, a timing mismatch that only affects test-mode games, and an
  out-of-date comment (13.3).

**Is it live?** No. `main` stays frozen until Apple approves the app.

**What's left:** Phases 13.1–13.3 (fixes), then Phase 14 (one more review, then your phone pass; the checklist is in
the plan).

**Needs you (not blocking 13.1–13.3):**
1. **When a partner extends tonight's game window mid-game** (finding 1): the engine can start a round just before the
   game's original end time and then cut it off about 2 minutes early. This happened before the letter die too.
   Recommended: (a) never start a round that won't finish before the original end time (free, so an extended window
   still ends at the old time, as it does today). Alternative: (b) editing tonight's schedule really extends the open
   game (one extra database write per edit). Reply "a", "b" or "leave it".
2. **Phone clock set wrong** (finding 3): on a phone whose clock is more than 3 s fast, if the die is skipped (e.g. you
   switched apps), the Majority Rules banner and the start-of-round reveal don't play. This was already true before the
   letter die. Fix it now (free), or leave it?

---

## For the next agent (Phase 13.1)

### 1. Next phase
Phase 13.1 in `docs/category-blitz-letter-die-plan.md` (die clock: latch the offset at arrival; NTP-style reading with
`serverReceivedAtMs`), then 13.2 and 13.3, each its own sub-phase with its own handoff
(`…_PHASE_13.<N>_HANDOFF.md`) and **its own local commit on `after-app-review`**. **Out of scope:** findings 1 and 3
until Andrew answers (see "Open for Andrew" in plan §Phase 13); moving the round timer onto the server clock; pushing;
merging to `main`.

### 2. Starting state
- Branch `after-app-review`. `2899a9d6` "Category Blitz letter die (Phases 1–12.3)" sits on `c3ecdb8a`. Not pushed, not
  deployed. The plan update and this handoff are committed on top as `docs: Category Blitz letter die Phase 13 …`;
  the working tree is clean.
- No database, Supabase, Vercel or production access was used. No data changed.
- `/verify` was invoked before the commit, but its browser steps were **not** run: they seed `auth.users`, `users` and a
  session into the shared production DB (dev = prod DB). The automated gates were run instead (see §6). Ask Andrew
  before seeding anything.

### 3. Decisions made
- Andrew (2026-10-30): commit the letter-die work locally on `after-app-review` so reviews see an exact diff. Keep
  doing that per sub-phase; never `main`, never push.
- Finding 10 rejected: row i is ready at 0.45 + 0.06·i s (`lib/categoryBlitzMotion.ts`: delay 0.15, stagger 0.06,
  duration 0.3). Return-into-an-inert-row needs a tap + type + Return inside 60 ms.
- Findings 1 and 3 → Andrew's decision, not sub-phases. Both are existing behaviour that 12.1a/12.2a deliberately left
  out of scope.
- Finding 5 is recorded as plausible: it is a narrowed version of an existing race. Fix it anyway in 13.2b (cheap).
- The plan's text for 13.1–13.3 holds the exact fixes, file/line pointers and tests. Line numbers are as of `2899a9d6`.

### 4. Files changed in this phase
- `docs/category-blitz-letter-die-plan.md`: status line; §Phase 13 rewritten (review record, Open for Andrew), new
  §Phase 13.1–13.3, the phone pass moved to new §Phase 14.
- This handoff.
- Commit `2899a9d6`: 48 files, all letter-die work (see `git show --stat 2899a9d6`), including the CLAUDE.md line that
  exempts `LetterDieRoll.tsx` from the no-inline-style rule.

### 5. Facts and traps
- The review was a single pass with no verify step. I checked every finding myself against the code. The key code:
  `dieStage` re-reads the offset every frame (`lib/categoryBlitzLetterDie.ts` ~142); the `LetterDieRoll` effect deps
  include `serverClockOffsetMs` (line ~393); `serverNowMs: Date.now()` is stamped in the final `NextResponse.json` of
  `app/api/category-blitz/sessions/route.ts` (~151) while `now` is taken at entry; `appliedLoadSeqRef` advances before the
  `ok` check (`lib/categoryBlitzRealtime.ts` ~639, ~710).
- The route already read `listSchedules` twice per poll before the letter die (old route line 98–100), so 13.3a is a cost
  saving, not a regression fix.
- `lib/categoryBlitz.ts` contains a non-text byte: use `grep -a`.
- Don't run `tsc` and `npm run build` at the same time (`.next/types`).

### 6. Build / test (2026-10-30, sequential, before the commit)
`npx tsc --noEmit` clean; eslint clean on every changed/added `.ts`/`.tsx`; `npm run test` 5,712 pass / 13 skipped / 4
fail (only the 4 known Bingo star-index freshness tripwires); `npm run build` succeeded. Not verified: real device,
real browser.

### 7. Open questions
Findings 1 and 3 (above, and plan §Phase 13 "Open for Andrew"). Carried over: extending tonight's window mid-game still
ends the game at the old time (finding 1 is the round-level effect of the same thing).

### 8. First steps for Phase 13.1
1. Read plan §Phase 13.1 and this handoff. 2. 13.1a: add the latched offset beside `letterArrivedAtMs` in
`LetterDieRoll`'s latches; test with a changing offset prop during landing. 3. 13.1b: add `serverReceivedAtMs` to the
route reply (the existing `now`); extend `nextDieClockSample` with the NTP formula and an old-server fallback; tests in
`tests/lib.category-blitz-letter-die.test.ts` and `tests/api.category-blitz-sessions.test.ts`. 4. Mutation-check, run
the gates, commit locally, write the 13.1 handoff. Model: Opus 5.5, effort high (as for 12.x).
