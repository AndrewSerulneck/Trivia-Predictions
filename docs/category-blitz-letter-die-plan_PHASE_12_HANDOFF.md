# Category Blitz letter die — Phase 12 handoff (2026-10-30)

## For Andrew (plain English)

**What happened:** a fresh code review of the last round of fixes (Phases 11.1–11.4). No code was changed in this
phase, only the plan. The review found 7 more problems. The ones that matter most:

1. If a partner **extends** tonight's Category Blitz window mid-game, the die can still tumble over the final scores,
   because the game still ends at the session's original end time (the earlier fix only covered *shortening*).
2. A phone whose clock runs **more than 3 seconds fast** would see the die tumble and then vanish every round, without
   landing. This is a side effect of the late-letter fix.
3. In rare timing, an older server reply can bring back an old window end for up to 15 seconds.
4. Smaller: the overnight scheduler still uses its own copy of the "does another round fit?" rule; a duplicated
   window lookup; some extra screen redraws while the categories slide in; a number written twice.

**Is it live?** No. Everything on the letter die (Phases 1–12) is still uncommitted on `after-app-review`. No database
change, no cost change.

**What's left:** Phases 12.1–12.3 fix these (details in `docs/category-blitz-letter-die-plan.md`), then Phase 13 is
one more review plus your phone pass. **Needs you:** nothing right now. One thing to know: when a partner extends
tonight's window mid-game, the game still ends at the old time. That's how it already worked, and 12.1 doesn't change
it. Say so if you want it changed.

---

## For the next agent (Phase 12.1)

### 1. Next phase
Phase 12.1 in `docs/category-blitz-letter-die-plan.md` (§5, "Phase 12.1"): the client's "another round follows"
check, the cron engine's fit check and the open-window lookup must all agree (12-review findings 1, 4, 5). Opus 5.5,
high. Then 12.2 (Opus, high) and 12.3 (Sonnet, medium), each with its own handoff. **Out of scope:** changing when the
engine closes a session, merging (`main` is frozen until Apple approval), the venue TV, the "Next round in" copy on a
final round (parked since Phase 7; ask Andrew first).

### 2. Starting state
- Branch `after-app-review`, last commit `c3ecdb8a`. All letter-die work (Phases 1–11.4) is **uncommitted**; nothing
  is pushed or deployed. Phase 12 changed only `docs/category-blitz-letter-die-plan.md` (status line, §5 table, the
  Phase 12 section rewritten, new 12.1–12.3 and Phase 13 sections) and added this file.
- No data, migration or production access was used.

### 3. Decisions
- Per the plan's rule, every finding became a sub-phase; nothing was patched in place.
- The phone pass moved from Phase 12 to Phase 13 (the same pattern as Phases 6 → 11 and 11 → 12). Two items were
  added to its list: a phone with its clock set off (12.2a) and extending the window mid-game (12.1a). The "no flicker
  at landing" item (11.3a) is listed too.
- 12.2a gives a recommended fix (a `serverNow` field on the existing sessions response, so a clock offset applies to the
  die's lateness check only) and a smaller alternative. The 12.2 agent chooses and records the reason.
- 12.1b must not change cron behaviour for real sessions unless it proves `nextOccurrence + windowMinutes` ==
  `getCurrentOrNextScheduleWindow().windowEnd`.

### 4. Findings (all checked against the code before recording)
| # | File:line | Problem | Sub-phase |
|---|---|---|---|
| 1 | `lib/categoryBlitzShared.ts` ~189 (`anotherRoundFollows`) | Ignores the frozen `scheduledEndAt`, which the engine still closes on (`isStaleAutoSession`, `lib/categoryBlitz.ts` ~564/782) | 12.1a |
| 2 | `lib/categoryBlitzLetterDie.ts` ~132 | Arrival-based cutoff now also applies after a latched tumble, so a phone clock > 3 s fast skips every landing | 12.2a |
| 3 | `lib/categoryBlitzRealtime.ts` ~616 | `scheduleWindowEndAt` written by the last response to finish, unordered | 12.2b |
| 4 | `lib/categoryBlitz.ts` ~1984/2012 (`runCategoryBlitzEngine`) | Own fit math, ignores `testMode`, different window derivation | 12.1b |
| 5 | `lib/categoryBlitzSchedules.ts` ~276 (`openScheduleWindowEnd`) | Copies the engine's open-window lookup | 12.1c |
| 6 | `components/category-blitz/CategoryBlitzGame.tsx` ~1634–1649 | `readyRows` in `AnsweringScreen` re-renders the whole board per row during the FLIP; fallback always makes a new Set | 12.3a |
| 7 | `CategoryBlitzGame.tsx` ~1641 and ~2126 | Bare `0.2` Reduce Motion fade written twice | 12.3b |

### 5. Facts and traps
- `grep` treats `lib/categoryBlitz.ts` as binary (it contains a non-text byte) and prints nothing. Use `grep -a`.
- There is no client↔server clock-offset system anywhere in Category Blitz (checked `lib/categoryBlitzRealtime.ts`). The
  round timer, `showReveal` and the die all compare the phone's clock with server timestamps.
- `setSession` in `loadSession` has the same out-of-order race as finding 3 (pre-existing).
- Because Phases 2–11.4 are uncommitted, there is no exact git diff for "one phase". If Andrew agrees, committing each
  sub-phase on `after-app-review` (never `main`, never push without him) would let Phase 13 review an exact diff.

### 6. Build / test
No code changed in Phase 12, so no gates were run. Last known (end of 11.4): `npx tsc --noEmit` clean, eslint clean on
touched files, `npm run test` 5,682 pass / 13 skipped / 4 fail (only the 4 known Bingo star-index freshness tripwires),
`npm run build` exit 0. Gates for each 12.x sub-phase are listed in the plan. Never run typecheck and build at once.

### 7. Open questions for Andrew
- (Information only, not blocking) The engine ends a session at its original end time even if the window is extended
  mid-session. Keep it as it is?
- (Optional) May the letter-die work be committed on `after-app-review` (local only) so later reviews see exact diffs?

### 8. First steps for Phase 12.1
1. Read the plan's Phase 11.1 and 12.1 sections and `docs/category-blitz-letter-die-plan_PHASE_11.1_HANDOFF.md`.
2. Write the `anotherRoundFollows` tests first (live window vs `scheduledEndAt`, both orders, null), then the min() fix.
3. Write the `nextOccurrence + windowMinutes` vs `getCurrentOrNextScheduleWindow` equality test before touching the cron.
4. Gates, mutation check, then `…_PHASE_12.1_HANDOFF.md` and the status line.
