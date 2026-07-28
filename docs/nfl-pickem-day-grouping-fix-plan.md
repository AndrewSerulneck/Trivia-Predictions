# NFL Pick 'Em — Day-Grouping Fix Plan

Fixes the cosmetic-only bug found during Phase 5 verification of
`docs/nfl-pickem-code-review-fixes-plan.md`: the Pick 'Em page's day-group
headings ("THURSDAY NIGHT FOOTBALL" / "SUNDAY" / "MONDAY NIGHT FOOTBALL" /
"OTHER GAMES") and the game-card badge ("🏈 Thursday Night" vs "NFL") are
computed from the kickoff's **UTC** day-of-week, not Eastern. NFL kickoffs
cross midnight UTC on almost every slot, so the classification is
systematically wrong:

| Real slot (Eastern) | Kickoff (ET) | UTC day | Currently labeled |
| --- | --- | --- | --- |
| Thursday Night Football | ~8:15 PM Thu | **Friday** | falls to "Other" |
| Sunday Night Football | ~8:20 PM Sun | **Monday** | mislabeled "Monday" |
| Monday Night Football | ~8:15 PM Mon | **Tuesday** | falls to "Other" |

Measured against the real 2026 schedule (272 games): only 4 games all season
are UTC-Thursday (the early Thanksgiving slate) — the weekly TNF game itself
never gets the Thursday heading today. Confirmed in-browser during Phase 5:
"Dallas Cowboys @ New York Giants — Sun 8:20 PM" rendered under "MONDAY NIGHT
FOOTBALL."

**This is display-only.** `isThursdayGame`/`isSundayGame`/`isMondayGame` on
`NFLPickEmGame` feed exactly two places — `NFLPickEmGameList.tsx`'s grouping +
sort order, and `NFLGameCard.tsx`'s badge text — confirmed by grep across
`lib/` and `app/`. They do **not** feed lock time (`isGameLocked` uses the raw
`starts_at` timestamp directly), `thursday_kickoff` (computed independently in
`syncNFLWeeks` off the raw balldontlie rows), `nflWeekSpanMs`/week anchoring,
scoring, or any leaderboard/reward path. No payout logic is touched.

## The DST trap to avoid

Do **not** fix this with a fixed UTC-offset shift (`getUTCDay()` ± 4/5 hours).
That is exactly the bug the `NFL_WEEK_ROLLOVER_UTC_HOUR = 5` decision in the
code-review-fixes plan was written to avoid — a fixed offset is correct for
half the season and wrong for the other half across the Nov 1 DST boundary.
Use a real timezone-aware day extraction, the same pattern `getLocalDateKey` in
`lib/timezone.ts` already uses (`Intl.DateTimeFormat` with
`timeZone: "America/New_York"`), not hand-rolled arithmetic.

## Phases

| Phase | Scope | Model / effort |
| --- | --- | --- |
| 1 | **Eastern day-of-week helper + reclassify.** Add a small helper (e.g. `getEasternDayOfWeek(date: Date): number`, 0–6) built on `Intl.DateTimeFormat(..., { timeZone: "America/New_York", weekday: "short" })` — not offset arithmetic. Replace the three `dayOfWeek === N` checks in `listNFLPickEmGames` (`lib/nflPickEm.ts:~930`) with it. Regression tests: real 2026 fixtures for TNF (Thu 8:15pm ET → UTC Friday), SNF (Sun 8:20pm ET → UTC Monday), MNF (Mon 8:15pm ET → UTC Tuesday), and one case straddling the Nov 1 DST boundary in both directions, run against the unfixed code first to confirm each currently fails. | **sonnet / low** |
| 2 | **Verification.** Re-run the Phase 5 Playwright pass (or a lighter version of it) against a seeded Week 1: confirm the real Thursday-night game now gets the "Thursday" heading and 🏈 badge, the real Monday-night game gets "Monday," and Sunday Night Football (currently mislabeled Monday) now correctly groups under "Sunday." Re-run `npm run build && npm test && npx tsc --noEmit && npm run lint`. | **sonnet / low** |

Both phases are small enough to combine into one pass if preferred — the
split exists mainly so verification can be skipped or deferred independently
of the code change.

## Out of scope / explicitly not touched

- `thursday_kickoff` / week lock time (`isNFLWeekLocked`) — separate
  computation, already correct for its purpose (a UI indicator, not the actual
  per-game lock).
- Per-game locking (`isGameLocked`) — uses the raw ISO timestamp, timezone-blind
  by design, unaffected.
- `nflWeekSpanMs`, week anchoring, leaderboard windows, reward accrual — all
  independent of these three booleans.
- The hardcoded fixture in `tests/lib.nfl-pickem-tiebreaker.test.ts:164-166`
  sets `isThursdayGame`/`isSundayGame`/`isMondayGame` directly as plain test
  data (not derived from the classification function), so it needs no change.

## Recommended model / effort

**Sonnet, low effort**, for both phases. This is a narrow, well-contained fix:
one new helper function, three call-site swaps, and a handful of fixture-based
unit tests — no schema changes, no new API surface, no scoring/leaderboard
logic. Opus is unnecessary here; reserve it for anything touching the pick
window or payout math again.
