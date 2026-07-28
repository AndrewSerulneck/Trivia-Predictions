# Phase 6 — Leaderboard UI

Read `docs/nfl-pickem-improvements-plan.md` and `docs/nfl-pickem-phase5.md`
(for the API contract) first.

Requirement #6 (frontend half): below the week's schedule, an in-game
leaderboard where each user can see every other user's picks.

## Placement

Directly **below the week's schedule** in
`components/nfl-pickem/NFLPickEmGameList.tsx`, after the last day group.

## Component

New `components/nfl-pickem/NFLPickEmLeaderboard.tsx`.

Check `components/leaderboard/LeaderboardTable.tsx` first — if it is close
enough to reuse or extend, do that rather than building a parallel
implementation. If it does not fit (it likely serves venue-wide points, not
per-game pick detail), build the new component but match its visual language.

### Rows

Each row shows: rank, username, **picks / correct / wrong / points**. Highlight
the requesting user's own row (`isCurrentUser`) so they can find themselves.
Mobile-first — this is a narrow surface, so favor a compact stat layout over a
wide table. The existing `WeeklySummary.tsx` shows the established treatment
for these four stats; stay consistent with it.

### Expansion

Tapping a row expands it to show that user's actual picks:

- Each pick: the matchup, the selected team, and its outcome
  (correct / wrong / pending), plus the final score if the game is done.
- **Hidden picks** (`isHidden: true` / `selectedTeam: null` from the API) must
  render as something like "Hidden until kickoff" — never as an empty or
  broken row. This is expected, normal state for the current week, not an
  error.
- Multiple rows may be expanded at once, or one at a time — either is fine;
  pick one and be consistent.
- Animate with framer-motion, consistent with the rest of the file.
- Make expansion accessible: real `<button>` triggers, `aria-expanded`.

### Mode toggle

A "This Week" / "Season" toggle. `This Week` follows the week currently
selected in the Phase 3 dropdown; `Season` is cumulative and ignores the
dropdown. Default to **This Week**. Keep the toggle compact — the user has
already objected to UI that wastes vertical space, so do not wrap it in its own
bordered panel.

### States

- **Loading:** use `BouncingBallLoader`, as the rest of the page does.
- **Empty** (nobody has picked yet): a short, plain message. Do not render an
  empty table shell.
- **Error:** reuse the page's existing error banner treatment rather than
  inventing a second error style.

## Data fetching

- Fetch from the Phase 5 endpoint. Refetch when the selected week changes, when
  the mode toggle changes, and after the user makes a pick (their own picks
  count should update).
- **Do not reintroduce a `router.replace` inside a fetch effect**, and do not
  put `searchParams` or `router` in a fetch effect's dependency array — Phase 4
  removed exactly that bug and it must not come back.
- Abort in-flight requests on change, following the existing
  `inFlightRequests` / `AbortController` pattern in the file.
- Do not block the schedule's render on the leaderboard request.

## Constraints

- No `any`. Type the API response explicitly; do not `JSON.parse` into
  untyped objects.
- Tailwind utilities only. Absolute `@/` imports. Arrow function component.
- Venue-scoped: pass the current `venueId`. Never render cross-venue standings.

## Acceptance

- With the Phase 0 seed, the leaderboard lists the seeded opponents ranked by
  points, excludes zero-pick users, and highlights the current user.
- Expanding another user shows their picks for started games and
  "Hidden until kickoff" for games that have not started.
- Expanding yourself shows all your own picks, including for games that have
  not started.
- The Season toggle changes the numbers; switching weeks changes the This Week
  numbers.
- Making a pick updates your own row without a full page reload.
- `npm run build` and `npm test` pass.
