# Fire TV app plan — Phase N2 handoff (NHL Pick 'Em start time: the fix)

**Date:** 2026-11-23 · **Agent:** Claude Code, Opus 5.5 / high (as the plan names) · **PR:**
https://github.com/AndrewSerulneck/Trivia-Predictions/pull/48 (branch `fix/nhl-pickem-start-time`)

## Summary for Andrew

- **What changed.** NHL Pick 'Em now uses each game's real puck-drop time. Games stay open until the puck drops,
  instead of all locking at 7 AM New York. While a game is on, it shows "P2 9:22" (or "Int 2", "OT") instead of
  "Inn. 2". And a game the feed still calls "scheduled" is never graded, so the 0–0 pre-game score can't turn picks
  into ties.
- **Other leagues:** no change. Tests pin every other league's start times and game ids to their current values.
- **Is it live?** **Not yet.** PR #48 passed every check (tests, lint, both Vercel previews), but my permission to
  merge was turned down. **Needs you:** merge PR #48 (or allow me to), and Vercel deploys it.
- **Player data:** nothing to move. Production has no NHL picks at all (checked twice, last at 21:57 UTC on
  2026-11-23).
- **What's left:** N3, a quick check on the first NHL game day after it's live.

---

## For the next agent (Phase N3, or whoever finishes N2's merge)

### 1. Goal and scope

**If PR #48 is still open:** N2's only remaining step is the merge and deploy check (§8 steps 1–3). Get Andrew to
merge it, or merge it once he says yes. Re-run the production check in §6 first.

**N3 goal (after deploy):** on the first NHL game day, check the live site against the plan's N3 checklist
(`docs/fire-tv-app-plan.md` "Phase N3"): real puck-drop times, picks open after 7 AM New York until puck-drop,
"P1/P2/OT" labels, and settlement. Read-only. **Out of scope:** the follow-ups in §7.

### 2. Starting state

- Branch `fix/nhl-pickem-start-time`, pushed. Commits on top of `main` (`2e81f9a7`):
  - `4282c985` Fire TV plan: N1 done (the N1 docs that were uncommitted).
  - the N2 code commit "NHL Pick 'Em: lock and show games at the real puck-drop (N2, D33)".
  - a docs commit with this file and the plan's status line / N2 row.
- PR #48: all checks green (`validate` ×2, Vercel `hightop-challenge`, Vercel `trivia-predictions`, Preview
  Comments) on the code commit. **Not merged** at the time of writing (the merge command was refused by the agent's
  permission classifier, not by GitHub). Check `gh pr view 48`.
- Production data: untouched. No migration, no scripts that write, no backups needed, no undo log.

### 3. Decisions (already made; don't re-ask)

- **D33** (N1): real timestamp first in every league; NHL ids change; no migration. Andrew did not overrule it.
- Pre-merge check found 0 NHL picks (any status), so N1's fallback (wait or keep-the-id) is not needed.
- The "scheduled" guard checks only the score row's `status_state` (the field the score fetch already stores),
  case-insensitive, equal to `"scheduled"`. It doesn't apply to College Football, whose own gate runs first
  (`canFinalizeFromScores` is only read when `collegeGate === null`).

### 4. Files changed

- `lib/pickem.ts`
  - `extractEventStartIso`: same candidate list and order, but two passes: every non-date-only value first, then
    date-only values (`YYYY-MM-DD`, normalised to 12:00Z by `normalizeBallDontLieGameStartIso`). Used by both the
    games list (`fetchBallDontLieEventsForSportKey`) and the score fetch (`fetchScoresForSportKey`).
  - `formatTvHockeyLabel` renamed `formatHockeyPeriodLabel`; NHL rows (`provider.path.startsWith("/nhl/")`, held in
    `isHockey`) now get it as `periodLabel` too. `tvPeriodLabel` still set the same way, so the TV is unchanged.
  - `settlePendingPickEmPicks`: `feedSaysScheduled` added to `canFinalizeFromScores`.
  - `tvStartsAt` type comment updated (it described the old bug).
- `tests/lib.pickem-nhl-start-time.test.ts` (new): NHL start/id from real feed rows; open at 16:00Z and locked at
  00:00Z for a 00:00Z puck-drop (venue in New York, `tzOffsetMinutes: 300`); period labels; TV label unchanged;
  literal ids for NBA (with `datetime`, and `datetime: null` → noon), WNBA, MLB, NFL, College Football (fixture row),
  ATP, EPL, FIFA World Cup. The non-NHL cases were run against the **old** code first and passed, which proves those
  ids didn't move.
- `tests/lib.pickem-stale-pending.test.ts`: new block "a game the feed still calls scheduled is never graded (D33)":
  old-noon pick + scheduled 0–0 stays pending (verified to fail with the guard removed); a final grades won; a stale
  non-scheduled row grades lost.

### 5. Facts and traps

- MMA is not touched by `extractEventStartIso` (its own branch reads `event.date`).
- `npm run lint` locally reports ~480 errors, all in **local untracked folders**: `tmp/` (gitignored) and
  `.claude/worktrees/tv-media/`. None in tracked files; CI's lint passes. Lint just the files you change with
  `npx eslint <files>`; the full run takes over 2 minutes.
- My guess of a College Football kickoff time was wrong at first: the fixture row 457383 starts at
  `2026-10-24T19:30:00.000Z`. Read fixtures; don't assume.
- BallDontLie NHL rows: `game_date` (date-only), `start_time_utc` (full), `game_state` ("FUT", "LIVE", "OFF"),
  `status_state` ("scheduled", "in_progress", "final"), `period`, `time_remaining` ("09:22"), `in_intermission`.
  Scheduled rows have 0–0 scores, not null. The `game_state` "LIVE" and `status_state` "in_progress" values for a
  live game are from the TV code's word list, not seen live in this phase.

### 6. Build, run, test

- `npm run test` → 606 files / 7907 tests passed, 13 skipped. `npx tsc --noEmit` clean. Changed files lint clean.
- Production check (read-only; scratch script, may be gone):
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/1fbd95ff-8d35-4911-8b25-9c73af715ed8/scratchpad/n2/check.mjs`.
  It counts `pickem_picks` where `sport_key in (icehockey_nhl, nhl)` or `sport_slug = nhl`, how many are pending,
  and how many pending ids hold `T12:00:00.000Z`. Run from the repo root (it imports `@supabase/supabase-js`):
  `cp <script> ./.n2-check.mjs && node --env-file=.env.local ./.n2-check.mjs; rm -f ./.n2-check.mjs`.
  Results: `0 / 0 / 0` at 21:48Z and 21:57Z on 2026-11-23.
- **Unverified:** the live site after deploy (not deployed yet), and a real live NHL game's label.

### 7. Open items for Andrew (not N2 or N3)

1. **Merge PR #48** (blocking).
2. Follow-up from N1 §5 item 6: the 4-hour rule can still grade a game that is **live** past 4 h (MLB extra innings,
   rain delays) from its in-progress score, in any league but College Football. Guarding `in_progress` too would hold
   picks until the 8-day cancel if a feed got stuck, so it needs its own decision.
3. Small risk added by the guard: if a feed ever kept saying "scheduled" for a finished game, its picks would wait
   (up to the 8-day cancel) instead of grading. Not seen in any league's data.

### 8. Next steps

1. Confirm PR #48 is merged (`gh pr view 48 --json state`). If not, re-run the §6 check, then ask Andrew.
2. After merge, confirm the Vercel production deploy of the merge commit is Ready.
3. Update `docs/fire-tv-app-plan.md` status line / N2 row to "live" with the merge commit.
4. N3 (Haiku 5.5 / low, per the plan; Sonnet 5.5 / medium if it finds a bug): on the first NHL game day after deploy,
   open NHL Pick 'Em on production and run the plan's N3 checklist. Write `docs/fire-tv-app-plan_PHASE_N3_HANDOFF.md`.
