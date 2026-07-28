# NFL Pick 'Em — Code-Review Fix Plan

Addresses every finding from the 2026-07-28 review of the uncommitted NFL
Pick 'Em + Rewards working tree, plus one instance the review missed, plus the
Tuesday week-rollover change requested during planning.

**Everything here stays in UTC.** No venue-timezone or New-York-time dependence
is introduced anywhere; in fact this plan *removes* the one timezone dependency
that was causing a bug.

---

## ⚠️ One correction before anything else: 4:00 UTC only works until November 1

The requested "4:00am UTC = 12:00am Eastern" is correct — but only while Eastern
is on Daylight Time. Verified against the real 2026 calendar:

| Tuesday | 4:00 UTC is… | 5:00 UTC is… |
| --- | --- | --- |
| Sep 15 | **12:00 AM EDT** ✅ | 1:00 AM EDT |
| Oct 13 | **12:00 AM EDT** ✅ | 1:00 AM EDT |
| Nov 3 | **Mon 11:00 PM EST** ❌ | **12:00 AM EST** ✅ |
| Dec 1 | **Mon 11:00 PM EST** ❌ | **12:00 AM EST** ✅ |
| Jan 5 | **Mon 11:00 PM EST** ❌ | **12:00 AM EST** ✅ |

US Daylight Time ends **Sunday November 1, 2026** — roughly NFL Week 8. From
that point on, 4:00 UTC lands at **11:00 PM Monday**, and a Monday Night
Football game that kicked off at 8:15 PM EST **is still being played**. The week
would roll over mid-game, which is exactly the class of bug this plan exists to
fix.

### Decision: use **5:00 UTC**

`NFL_WEEK_ROLLOVER_UTC_HOUR = 5`. It lands at 1:00 AM EDT early season and
12:00 AM EST from November — **always after Monday Night Football has ended,
every week of the season**, and never dependent on a timezone library. The
constant is one line; flip it to `4` if you'd rather have exact midnight in
September and accept the November-onward shift.

---

## The core idea: one instant, three jobs

> **An NFL week owns the 7-day span from its own Tuesday 05:00 UTC to the next
> Tuesday 05:00 UTC.**

That single rule does everything asked of it:

1. **Next week's slate appears** at Tuesday 05:00 UTC — the requested rollover.
2. **Monday Night Football counts** — MNF (Tue ~00:15 UTC) falls comfortably
   inside its week's span. This is finding 1.
3. **Wednesday games count** — a Christmas-week Wednesday game sits inside the
   Tue→Tue span too, so it can't fall into a neighbouring week. This is most of
   finding 6.

It is also gapless and non-overlapping by construction: week N's span ends at
the exact instant week N+1's begins, so nothing is double-counted in season-mode
totals and nothing falls between weeks.

And because the boundary is a fixed UTC hour, **no venue timezone is consulted
anywhere** — which eliminates finding 2 structurally rather than patching it.

---

## Verification status

Every finding was independently re-verified against the code before planning.

| # | Finding | Verified | Notes |
| --- | --- | --- | --- |
| 1 | MNF picks fall outside the week window | **Confirmed** | Review listed 2 sites. **There are 5.** |
| 2 | `/games` timezone gate vs ET week list | **Confirmed** | `/weeks` fetched with no `venueId` → ET; `/games` fetched *with* `venueId` → venue zone. Real 400. Deleted, not patched — the new rule has no timezone input. |
| 3 | SportsBingoHome realtime resubscribe | **Confirmed** | `subscribedSportKeys` is `useMemo(…, [cards])` — new array identity every card poll. |
| 4 | `WeekSelector` date off-by-one | **Confirmed** | Pre-existing `formatDate`; my preview label widened its reach. |
| 5 | Preseason banner date off-by-one | **Confirmed** | Mine, newly introduced. |
| 6 | Wednesday-first weeks mis-anchor | **Confirmed real**, not just plausible | `getThursdayOfWeek(Wed)` walks back 6 days into the *previous* week. |

### Finding 1 has five sites, not two

1. `lib/nflPickEm.ts:1311` — `nflWeekRangeMs` (week + season leaderboards)
2. `lib/nflPickEmWinnerRewards.ts:~198` — `weekRange` (venue discovery + standings)
3. `lib/nflPickEm.ts:880-891` — **missed by the review**: the user-pick attach
   query in `listNFLPickEmGames`. A guest's own MNF pick doesn't render as
   selected, so the UI looks like the pick was never saved.
4. `supabase/migrations/20260715000000_add_nfl_pickem_weeks.sql:211,220` — the
   `recalculate_nfl_user_week` RPC. Needs a **new** migration replacing the
   function; the existing file is history.
5. The stored Thu→Mon week shape is what makes all four wrong. Left as-is —
   the Tue→Tue *read* window is what changes.

---

## Phases

| Phase | Scope | Model / effort |
| --- | --- | --- |
| 1 | **Week window + Tuesday rollover.** Add `NFL_WEEK_ROLLOVER_UTC_HOUR = 5` and one shared `nflWeekSpanMs(week)` returning `[Tue 05:00 UTC, next Tue 05:00 UTC)`. Replace all 5 window sites (incl. a new migration for the RPC). Replace `isNFLWeekStarted` on the picking surface with `isNFLWeekOpenForPicks` built on the same instant — used by **both** `buildNFLGameWeekOptions` and `/api/nfl-pickem/games`, so they cannot disagree. Leaderboard keeps the strict rule. Fixes findings 1, 2, most of 6, and ships the rollover. Payout-critical, so it leads. | **opus / high** |
| 2 | **Week anchoring guard (rest of finding 6).** Anchor `week_start_date` on the Thursday of the week holding the *most* games rather than the earliest kickoff, so a Wednesday opener can't drag the anchor back a week. Assert no two synced weeks' spans overlap. Re-sync prod and diff the 18 stored weeks before/after. | **opus / high** |
| 3 | **Date off-by-one (findings 4 + 5).** Extract `VenueChallengesPanel`'s `formatUpcomingDate` into a shared client util; use it in `WeekSelector` and the preseason banner. Removes `new Date("YYYY-MM-DD")` from NFL UI. | **sonnet / medium** |
| 4 | **SportsBingoHome resubscribe (finding 3).** Restore the `subscribedSportKeysKey` string dep; confirm `findRelevantSquareForEvent` is stable (or ref it) so the channel isn't torn down every card poll and stat-delta state survives. Unrelated to NFL — isolated, easy to drop. | **sonnet / medium** |
| 5 | **Verification.** Re-run the prod week sync; confirm 18 weeks intact; browser pass via the `verify` skill — Week 1 renders all 16 games incl. MNF, a pick saves and persists, an MNF pick appears on the leaderboard, the reward card reads "Upcoming · Starts Sept 10". | **opus / high** |

Each phase ends with `npm run build` + `npm test` + `npx tsc --noEmit`.

Phase 1 before Phase 2: Phase 2 can change stored `week_start_date` values, and
Phase 1's spans are computed from them.

---

---

## Phase 1 — as built (2026-07-28)

`NFL_WEEK_ROLLOVER_UTC_HOUR = 5` and `nflWeekSpanMs(week)` live in
`lib/nflPickEm.ts`; every window now derives from `week_start_date` alone
(`week_end_date` is no longer read for any pick window). Sites replaced:

1. `nflWeekRangeMs` → `nflWeekSpanMs` (week + season leaderboards). Season mode's
   week query dropped `week_end_date`.
2. `lib/nflPickEmWinnerRewards.ts` `weekRange` → `nflWeekSpanMs`.
3. `listNFLPickEmGames` user-pick attach → the span, and `.lte` → `.lt`.
4. New migration `supabase/migrations/20260728120100_nfl_week_tuesday_span.sql`
   replaces `recalculate_nfl_user_week` (explicit `AT TIME ZONE 'UTC'`, so the DB
   session's TimeZone can't move the boundary). **Not yet applied.**
5. **A sixth site the plan didn't list:** `clearNFLPick` looked the pick's week up
   with `week_start_date <= starts_at <= week_end_date`, which matches *no* week
   for an MNF pick — so clearing one left the summary stale. Now goes through a
   new `findNFLWeekContaining` helper built on the span.

`isNFLWeekOpenForPicks` replaced `isNFLWeekStarted` in `buildNFLGameWeekOptions`,
`isPreseasonPreviewWeek`, and `/api/nfl-pickem/games` — the list and the gate are
now literally the same predicate. `timeZone` is gone from all three signatures;
`/api/nfl-pickem/weeks` only resolves a venue zone in leaderboard mode now.
`isNFLWeekStarted` survives for the leaderboard's stricter rule only.

Two behaviour changes fell out of the gapless span and are intended:

- There is no longer a Tue/Wed limbo where the finished week is still "current" —
  the next week takes over at the rollover.
- A Wednesday game now counts toward the week that follows it, instead of
  falling between windows (finding 6).

Tests: `tests/lib.nfl-week-span.test.ts` (new, 11) plus an MNF leaderboard block
in `tests/lib.nfl-pickem.test.ts`. All were run against the unfixed code first
and observed to fail. `tests/lib.nfl-pickem-winner-rewards.test.ts` now passes
the REAL `nflWeekSpanMs` through its `@/lib/nflPickEm` mock via `importOriginal`,
so a wrong window can't pass there either.

`npm run build`, `npm test` (1042 passed), `npx tsc --noEmit`, `npm run lint` all clean.

**Outstanding:** the migration has not been pushed, so the RPC in the database
still uses the old Thu→Mon window (leaderboards and reward standings are already
correct — they don't read `nfl_pickem_user_weeks`).

---

## Phase 2 — as built (2026-07-28)

`syncNFLWeeks` no longer anchors on the earliest kickoff. `resolveWeekAnchorThursday`
scores every candidate Thursday the week's games suggest by **how many of those
games its own Tue→Tue span would contain**, and takes the winner (ties → the
LATER Thursday; every way this goes wrong points a week too early, never too
late). For a Wednesday-opener week the too-early Thursday scores 0 — its span has
closed before the Wednesday game starts — so the majority slate always decides.

The function was restructured into **plan → assert → write**:
`assertNoOverlappingWeekSpans` throws before a single upsert if any two weeks'
spans overlap, so a corrupt feed can't leave the table half-rewritten. Games that
fall outside their own week's span are a `console.warn`, not a throw — one
postponed game must not stop the season from syncing.

New `scripts/resync-nfl-weeks.cjs` (dry-run by default, `--apply` to write)
snapshots the stored rows to `nfl-weeks-<season>-before.json` first, then prints
a per-week before/after diff plus overlap and outside-span counts.

**Prod re-sync result (2026 season, 272 games):** all 18 weeks intact, **0
changed**, **0 overlaps**, **0 games outside their spans**. No 2026 game falls on
a **UTC** Wednesday — which is the day the anchoring math actually sees — so the
new anchor reproduces the stored dates exactly. The change is a guard, not a
correction, for this season. `--apply` was then run; only `synced_at` moved.

(Phase 5 measured the real distribution: **by UTC day** Thu 4 / Fri 20 / Sat 2 /
Sun 212 / Mon 17 / Tue 17, **by Eastern day** Wed 2 / Thu 19 / Fri 4 / Sat 2 /
Sun 228 / Mon 17. The two Eastern-Wednesday games are UTC Thursday, so
`getThursdayOfWeek` anchors them correctly and the guard never fires. It would
fire on a schedule with a true UTC-Wednesday kickoff.)

Tests: 3 added to `tests/lib.nfl-pickem-sync.test.ts` (Wednesday-opener anchor,
Wednesday opener not colliding with the previous week, overlap aborts with no
writes). All three were run against the old anchoring and observed to fail.

`npm run build`, `npm test` (1045 passed), `npx tsc --noEmit`, `npm run lint` all clean.

---

## Phase 3 — as built (2026-07-28)

Extracted `VenueChallengesPanel`'s `formatUpcomingDate` into `lib/formatCalendarDate.ts`
(renamed `formatCalendarDate`, takes an optional `Intl.DateTimeFormatOptions`
override). It parses `"YYYY-MM-DD"` components directly and builds a **local**
`Date`, never `new Date("YYYY-MM-DD")` — that string form is parsed as UTC
midnight and renders a day early for every viewer west of Greenwich.

Consumers switched:

- `VenueChallengesPanel.tsx` now imports the shared util (re-exported under its
  old local name so the call sites didn't need touching).
- `WeekSelector.tsx` (finding 4) — its own local `formatDate` deleted, all three
  call sites use the shared util.
- `NFLPickEmGameList.tsx`'s preseason-preview banner (finding 5) — swapped
  `new Date(previewWeek.weekStartDate).toLocaleDateString(...)` for the shared
  util with a `{ month: "long", day: "numeric" }` override.

`NFLTiebreakerCard.tsx` and `NFLGameCard.tsx` were checked and left alone — both
parse full ISO timestamps (`starts_at`, not a bare calendar date), which have no
off-by-one risk.

New test: `tests/lib.format-calendar-date.test.ts`. Confirmed the bug it guards
against is real by running the OLD bare-`new Date(str)` expression under
`TZ=America/Los_Angeles` — `"2026-09-10"` rendered as `"Sep 9"`.

## Phase 4 — as built (2026-07-28)

`SportsBingoHome.tsx`'s live-stats subscription effect (Channel 3) listed
**both** `subscribedSportKeys` (the array) and `subscribedSportKeysKey` (the
sorted, joined string) in its dependency array. `subscribedSportKeys` is
`useMemo(..., [cards])`, so it gets a new identity on every card poll even when
the underlying sport-key set hasn't changed — keeping it in the deps defeated
the whole point of the string key and tore the realtime channel down and
rebuilt it on every poll, clearing `liveStatsPrevByPlayerRef`'s per-player
"previous stat line" state each time and starving `classifyLiveDeltaEvent` of
the reading it needs to detect a change.

Fix mirrors the pattern the cards/squares effect (Channel 1 & 2) already uses:
the effect now depends on `subscribedSportKeysKey` only, and re-derives the
sport-key list to subscribe to by splitting that string inside the effect body
— `subscribedSportKeys` (the array) is no longer read there at all.

Confirmed `findRelevantSquareForEvent` (empty `useCallback` deps, reads
`currentCardsRef.current`) and `queueVisualEvents` are both referentially
stable, so neither needed a ref workaround.

No colocated component test existed for `SportsBingoHome` and the project has
no React Testing Library setup (no `.tsx` test files anywhere), so this was
verified by code inspection plus `npx tsc --noEmit` / `npm run lint` / `npm run
build` — all clean, no new warnings.

`npm run build`, `npm test` (1048 passed), `npx tsc --noEmit`, `npm run lint` all clean.

---

## Phase 5 — verification (2026-07-28)

### Prod week sync

Re-ran `scripts/resync-nfl-weeks.cjs 2026` (dry run) after the Phase 2 `--apply`:
**18 weeks, 0 would change, 0 overlaps** — the written state is stable and
idempotent. Pre-sync snapshot kept at `nfl-weeks-2026-before.json` (gitignored).

### Browser pass

Throwaway user at `venue-riverside` (General Saloon) plus a real
`nfl_pickem_challenge` reward created through `createReward` (not a hand-written
row), driven with Playwright at 430×940. All seeded data was deleted afterwards.

| Check | Result |
| --- | --- |
| Week 1 renders all 16 games | **16/16** home teams rendered |
| MNF present | **Denver Broncos @ Kansas City Chiefs, `2026-09-15T00:15:00.000Z`** — a Tuesday in UTC |
| A pick saves | `POST /api/nfl-pickem/picks` → **200**, card rendered with the checkmark |
| …and persists across reload | Yes — "Week 1 Summary · **1 PICKS**" after a full reload |
| MNF pick on the leaderboard | Yes, in **both** `mode=week` and `mode=season` |
| Reward card | **"NFL Pick 'Em Challenge · UPCOMING · Starts Sep 10 — get your picks in early."** |
| Week selector label | **"Week 1 · Sep 10 – Sep 14 (opens Sep 10)"** |
| Preseason banner | **"September 10"** |

Findings 4 and 5 are confirmed fixed in the browser: every date reads **Sep 10**,
never Sep 9.

**The decisive proof for the migration** is server-side, not visual. After the
pick, `nfl_pickem_user_weeks` held:

```
picks_count: 1   (pick starts_at 2026-09-15T00:15:00+00:00,
                  week_end_date  2026-09-14)
```

The old RPC window ended at `(week_end_date + 1)::timestamptz` =
`2026-09-15T00:00:00Z` — **fifteen minutes before this kickoff**. It would have
written `picks_count: 0`. The migrated function counts it.

### Scale of finding 1, measured

**17 of the 272 games in the 2026 season fall on a UTC Tuesday** — one Monday
Night Football game per week. Every one of them was outside the old window at
every one of the five (six) sites, at every venue.

### Out-of-scope issue found during verification — NOT fixed

The day-group headings on the Pick 'Em list are systematically mislabeled.
`isThursdayGame` / `isSundayGame` / `isMondayGame` in `listNFLPickEmGames` are
computed from `getUTCDay()`, so:

- **"MONDAY NIGHT FOOTBALL"** contains the 17 UTC-Monday games, which are
  *Sunday* Night Football in Eastern (verified on screen: "Dallas Cowboys @ New
  York Giants — Sun 8:20 PM" sat under that heading).
- The 17 real MNF games and the 20 real Thursday-night games (UTC Friday) both
  fall through to **"OTHER GAMES"**.
- Only 4 of the season's 19 Eastern-Thursday games get the Thursday heading.

Same UTC-vs-Eastern root cause as finding 1, but **cosmetic only** — grouping
labels, no effect on picks, scoring, leaderboards or payouts. It is pre-existing,
not introduced by this plan, and not among the six findings, so it was left
alone. Fixing it means classifying on Eastern day-of-week instead of UTC.

---

## Regression-test discipline

Phase 3 of the early-access plan produced a test that passed *even against the
buggy code*, because its mock ignored the query. Every regression test here must
be **shown to fail against the unfixed code before it is kept**. Specifically:

- MNF fixtures must use a real Tuesday-UTC kickoff (`2026-09-15T00:15:00.000Z`),
  never a convenient Monday one.
- The rollover test must assert both edges: at `Tue 04:59:59Z` the next week is
  **not** visible; at `Tue 05:00:00Z` it **is**.
- A late-season case (`2026-12-01`) must prove the rollover still lands after
  MNF once Daylight Time ends — the bug the 4-vs-5 correction above prevents.

---

## Constraints

- No `any`. Absolute `@/` imports. Tailwind only.
- New migrations only — never edit an existing one. `vercel.json` cron
  *additions* are auto-allowed by the guard hook; edits/removals are not.
- Every leaderboard/standings query keeps its `venue_id` filter.
- The one-week-early open is the only relaxation of the retention mechanic in
  `docs/nfl-pickem-improvements-plan.md`; weeks 3+ stay hidden.
- The preseason preview (`isUpcomingPreview`) stays — it's what surfaces Week 1
  *today*, in July, months before the Sept 8 rollover. The two compose: once the
  rollover arrives it takes over and the preview flag clears itself.

## Open risk

A 7-day Tue→Tue span assumes no NFL week ever contains a game outside it. True
for every 2026 week verified against balldontlie (Wed through Mon, incl. Black
Friday and Saturday slates). Phase 2's overlap assertion is the tripwire if a
future schedule breaks that.
