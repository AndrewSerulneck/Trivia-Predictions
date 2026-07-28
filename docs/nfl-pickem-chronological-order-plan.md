# NFL Pick 'Em — Chronological Game Order Plan

## The bug

The Week 1 page renders the Sept 9 Patriots @ Seahawks game **last**, even though
it is the first kickoff of the week.

This is *not* the UTC-vs-Eastern day bug from
`docs/nfl-pickem-day-grouping-fix-plan.md` — that one is already fixed
(`getEasternDayOfWeek` in `lib/timezone.ts:39`, used at `lib/nflPickEm.ts:909`).
The remaining defect is structural: the page only knows **four** buckets, and
"Other" is hardcoded last in both places.

- `lib/nflPickEm.ts:939-953` — `dayPriority()` returns `Thursday=0, Sunday=1,
  Monday=2, everything-else=3`, and sorts by that priority *before* kickoff time.
- `components/nfl-pickem/NFLPickEmGameList.tsx:351-367` + `:463-533` — the same
  four buckets, rendered in a fixed Thursday → Sunday → Monday → Other order.

Any game that is not a Thursday, Sunday, or Monday in Eastern time — a
Wednesday/Friday/Saturday opener, an international early kickoff, a Christmas or
Black Friday game, a late-season Saturday slate — lands in "Other Games" and is
pushed to the bottom of the page no matter when it actually kicks off. Sept 9 is
a Wednesday in ET, which is exactly this case.

Note the sort is also the *only* thing wrong with the ordering **within** each
bucket: the secondary `startsAt` comparison at `:952` is already correct.

## The fix (decided)

Replace the fixed four-bucket model with **dynamic per-day sections in
chronological order**. Group by the game's actual Eastern calendar date and emit
one section per day:

```
WEDNESDAY, SEPT 9
  Patriots @ Seahawks   8:20 PM ET

THURSDAY NIGHT FOOTBALL · SEPT 10
  49ers @ Rams          8:35 PM ET

SUNDAY, SEPT 13
  ...13 games...

MONDAY NIGHT FOOTBALL · SEPT 14
  Bears @ Vikings       8:15 PM ET
```

The recognizable NFL framing is preserved as a **labeling** rule, not a
structural one: a day-section is titled "Thursday Night Football" / "Monday
Night Football" when it is the standard single-game primetime slot, "Sunday"
otherwise, and `"<Weekday>, <Mon D>"` for any other day. Sections are always
ordered by their earliest kickoff, so nothing can ever be stranded at the bottom
again.

**Every heading carries its date**, including the primetime ones
(`"Thursday Night Football · Sept 10"`). A bare weekday is unverifiable at a
glance; with the date attached, any future mismatch between the heading and the
kickoff timestamp is immediately visible instead of silent.

## Verified against the real 2026 Week 1

The current page is **not** mislabeling weekdays — that was checked against the
published schedule and the ET classification is correct:

| Kickoff (ET) | Game | Current behavior |
| --- | --- | --- |
| Wed Sept 9, 8:20 PM | Patriots @ Seahawks | correct day, **wrongly sorted last** ("Other") |
| Thu Sept 10, 8:35 PM | 49ers @ Rams (Melbourne, Netflix) | correct — Sept 10 2026 *is* a Thursday |
| Sun Sept 13, 1:00 PM | main slate | correct |
| Mon Sept 14 | MNF | correct |

So this plan is purely an **ordering + presentation** change. There is no
underlying date-data defect to chase, and the three ET booleans do not need
re-deriving. Week 1 2026 also happens to be an ideal fixture: a real Wednesday
opener is exactly the case the four-bucket model cannot express.

### Where the timezone logic lives

`lib/timezone.ts` is `import "server-only"` (line 1), so the client component
**cannot** import `getEasternDayOfWeek`. Do not work around this by
re-implementing ET day math in the component, and do not strip the `server-only`
guard.

Instead, the server computes the grouping and the client just renders it.
`listNFLPickEmGames` adds two fields to each `NFLPickEmGame`:

- `dayGroupKey: string` — the Eastern calendar date, `YYYY-MM-DD`
  (`getLocalDateKey`, already exported from `lib/timezone.ts`). The grouping
  identity.
- `dayGroupLabel: string` — the display heading for that day, per the labeling
  rule above.

`app/api/nfl-pickem/games/route.ts:71` passes `result.games` through wholesale,
so no API-shape work is needed beyond the type.

### The card clock must agree with the heading

`NFLGameCard.tsx:31-37` formats kickoff with
`new Date(iso).toLocaleTimeString(undefined, { weekday: "short", ... })` — the
**browser's** timezone, with no `timeZone` option. The section headings are built
in Eastern. For any viewer outside ET those two can disagree on the weekday: a
Monday 8:15 PM ET kickoff still reads "Mon" in Denver, but a Thursday 8:35 PM ET
kickoff reads "Thu 6:35 PM" in Denver and "Fri" for anyone east of London, under
a heading that says Thursday.

Pin the formatter to `timeZone: "America/New_York"` and label the output
`"8:35 PM ET"`. Once the time is rendered in the same zone the grouping uses, the
card and its heading agree by construction rather than by coincidence — and the
now-redundant `weekday: "short"` can be dropped from the card, since the section
heading above it already states the day and date.

This is a real, independent bug (it predates the ordering work), but it is
cheapest to fix in the same pass because it is the same "render NFL times in ET"
decision.

### Keep the three booleans

`isThursdayGame` / `isSundayGame` / `isMondayGame` stay on the type. They are
still the input to the labeling rule, and `isThursdayGame` independently drives
the card badge (`NFLGameCard.tsx:52`). `tests/lib.nfl-pickem-game-fetch.test.ts`
asserts on them directly and must keep passing unchanged.

---

## Phases

| Phase | Scope | Model / effort |
| --- | --- | --- |
| **1** | **Server: chronological sort + day-group fields.** In `lib/nflPickEm.ts`: delete the `dayPriority` tiering at `:939-953` and sort games purely by `startsAt` ascending. Add `dayGroupKey` (ET `YYYY-MM-DD` via `getLocalDateKey`) and `dayGroupLabel` to `NFLPickEmGame` (`:201-203` area) and populate both in the `.map()` at `:907`. Label rule, all dates formatted in `America/New_York`: `isThursdayGame` && that ET day has exactly one game → `"Thursday Night Football · <Mon D>"`; `isMondayGame` && exactly one game that day → `"Monday Night Football · <Mon D>"`; `isSundayGame` → `"Sunday, <Mon D>"`; otherwise `"<Weekday>, <Mon D>"`. (The single-game test is what keeps a Thanksgiving triple-header or a Week 18 Saturday doubleheader from being mislabeled as a primetime slot — compute day counts in a first pass, then label in a second.) | **sonnet / medium** |
| **2** | **Client: dynamic sections + ET card clock.** In `components/nfl-pickem/NFLPickEmGameList.tsx`, replace the `groupedGames` record (`:351-367`) with an ordered array — reduce `gamesWithOptimistic` (already server-sorted) into `{ key, label, games }[]`, preserving first-appearance order, no re-sorting on the client. Replace the four hardcoded `<section>` blocks (`:463-533`) with a single `.map()` over that array. Keep the existing heading styles: amber + 🏈 when the label starts with "Thursday Night Football", slate otherwise. Then fix `NFLGameCard.tsx:31-37` per "The card clock must agree with the heading" above — add `timeZone: "America/New_York"`, drop `weekday: "short"`, append `" ET"`. | **sonnet / medium** |
| **3** | **Tests.** Extend `tests/lib.nfl-pickem-game-fetch.test.ts` with a **real 2026 Week 1** fixture — Wed Sept 9 Patriots @ Seahawks 8:20 PM ET, Thu Sept 10 49ers @ Rams 8:35 PM ET, the Sunday Sept 13 slate incl. a Sunday-night game, Mon Sept 14 MNF. Assert the array is strictly ascending by `startsAt` and the **Wednesday game is index 0**. Label cases: Sept 10 → `"Thursday Night Football · Sept 10"`; a Thanksgiving-style three-game Thursday → the plain dated label, not the primetime one; the Sunday-night game → the same `"Sunday, …"` group as the 1pm games, not its own section. Include one fixture straddling the Nov 1 DST boundary so the ET date key is exercised in both offsets. Write these first against the unfixed code and confirm they fail. | **sonnet / medium** |
| **4** | **Verification.** `npm run build && npm test && npx tsc --noEmit && npm run lint`. Then a real-browser pass via the `/verify` skill on a seeded Week 1: confirm the Sept 9 game renders in the **first** section, sections descend chronologically, every heading shows its date, TNF keeps its 🏈 badge and amber heading, and Sunday Night Football sits inside the Sunday section. Check card times read `"8:35 PM ET"` and match their heading **with the machine clock set to a non-ET zone** (e.g. `TZ=Australia/Melbourne`) — that is the case the old formatter got wrong, and it will pass vacuously if only tested in ET. | **sonnet / low** |

Phases 1 and 2 are a single logical change (the client can't render a field the
server doesn't send yet) and are best done in one pass; the split is for
reviewability. Phase 3 can be written before Phase 1 if you prefer test-first.

## Recommended model / effort

**Sonnet across the board** — medium for Phases 1–3, low for Phase 4. This is
display-layer work with a well-understood root cause and no new API surface. The
one place that earns "medium" rather than "low" is the label rule: it needs a
two-pass count so multi-game Thursdays and Saturdays don't get primetime
headings. Opus is not warranted; reserve it for anything touching the pick
window, locking, or payout math.

## Out of scope / explicitly not touched

- **Per-game locking** (`isGameLocked`) — raw ISO comparison, timezone-blind by
  design, and the client's `Date.parse(game.startsAt) <= now` mirror at
  `NFLPickEmGameList.tsx:304`. Ordering changes cannot affect either.
- **`thursday_kickoff` / `isNFLWeekLocked` / `nflWeekSpanMs`** — computed
  independently in `syncNFLWeeks` off the raw balldontlie rows.
- **Scoring, leaderboard, tiebreaker, reward accrual** — all read picks by
  `game_id` and `starts_at`, never by day bucket or array position.
- **`NFLGameCard.tsx`'s 🏈 badge** — keeps reading `isThursdayGame` unchanged. Only
  the `formatTime` helper on that card is touched (timezone), not the badge, the
  pick buttons, the score display, or the result banner.
- **Other `toLocaleTimeString`/`toLocaleDateString` callers app-wide** — the ET
  pinning here is scoped to the Pick 'Em game card, where it has to agree with an
  ET-computed heading. Auditing every other surface for timezone correctness is a
  separate piece of work.
- **`tests/lib.nfl-pickem-tiebreaker.test.ts:164-166`** — sets the three booleans
  as plain fixture data, not derived from the classifier. No change needed.
