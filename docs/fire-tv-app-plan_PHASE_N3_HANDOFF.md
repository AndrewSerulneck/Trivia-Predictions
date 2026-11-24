# Fire TV app plan — Phase N3 handoff (NHL Pick 'Em game-day check)

**Date:** 2026-11-23 (checked ~04:20Z on 2026-11-24, during the 7-game NHL slate) · **Agent:** Claude Code (Sonnet 5.5)
The check was read-only. The follow-up fix (below) is a small website change. Branch `docs/fire-tv-plan-t4`.

## Summary for Andrew
- N2 is live (PR #48 merged 2026-11-23 22:09Z) and tonight's NHL games show their **real puck-drop times** (e.g. 7:00 PM
  New York for the 00:00Z game), not 7 AM. Period labels read **"P2 10:49", "Int 2", "P3 0:00"**, not "Inn.".
- There are **no NHL picks in production**, so nothing to settle or check on old picks.
- **Not verified live:** that a pick can be placed after 7 AM and locks exactly at puck-drop. The check ran after tonight's
  games began; N2's tests cover it. Do it on tomorrow's slate if you want it seen live.
- **One oddity found** (old, not N2): the first person to open the list after a quiet spell can see out-of-date scores for
  up to a minute, because of the cache. It fixes itself. Fixed: the list now reloads once, 5 s after opening, while a game is live.

## For the next agent
**Checklist results** (production `GET https://play.hightopchallenge.com/api/pickem/games?sportSlug=nhl&date=<d>&tzOffsetMinutes=360`):
1. Real puck-drop times: **pass.** ids/startsAt e.g. `3328426__2026-11-24T00:00:00.000Z__newjerseydevils__columbusbluejackets`
   (real times 00:00Z, 00:30Z, 02:40Z, 03:00Z; matches ESPN's NHL scoreboard).
2. Open after 7 AM until puck-drop, locked after: **not seen live** (games already started). Unit-tested in
   `tests/lib.pickem-nhl-start-time.test.ts`.
3. Pre-N2 picks: **none to check.** `pickem_picks` NHL rows all-time = 0 (also 0 at 04:22Z 2026-11-24).
4. Period labels: **pass** for `date=2026-11-24`: "P2 10:49" (live), "Int 2", "P3 0:00" (final).
5. D29 can be closed.

**Oddity, diagnosed (not a date bug, not N2):** the `date=2026-11-24` request was clamped to today (2026-11-23 in
Chicago), so both requests asked for the same games. The difference was the cache. `fetchBallDontLieJson`
(`lib/balldontlie.ts`) uses `next: { revalidate: 60 }`, which serves the stored copy and refreshes it in the background.
The first request after a quiet spell got a copy from before puck-drop (no scores, not final, so the clock alone made it
"live"). A re-request showed fresh data. BallDontLie itself was correct (`dates[]` matches the ET `game_date`). This
affects every league and has been there all along. The player page re-polls every 60 s while a game is live
(`components/pickem/PickEmGameList.tsx`), so it fixes itself within a minute. Settlement only acts on "final", so a
stale copy can't grade a pick wrongly. **Fixed (Andrew said yes, 2026-11-23):** `components/pickem/PickEmGameList.tsx` (`needsFreshRecheck`,
`FRESH_RECHECK_DELAY_MS` = 5 s). After a load the player asked for (not a background poll), if any game is `live`, it
reloads once in the background. That reload reads the just-refreshed cache, so there are no extra BallDontLie calls,
only one extra `/api/pickem/games` call per open during live games. Test: `tests/components.pickem-fresh-recheck.test.ts`
(it fails with the reload disabled). `npm run test` 607 files passed; tsc and eslint clean. Website only, no store release.

**Recommended next:** T4 (Live Quick Review undo test, D35), then Amazon approval work. Optionally re-check item 2 on the
next NHL day before its first game. Scratch check script for pick counts: see the N2 handoff §6.
