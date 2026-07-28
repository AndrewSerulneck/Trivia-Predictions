# Phase 5 — Leaderboard API

Read `docs/nfl-pickem-improvements-plan.md` first.

Requirement #6 (backend half): an in-game leaderboard showing every user who
has made picks, with picks / correct / wrong / points, and the ability to
expand a user to see their actual picks.

Phase 6 builds the UI against the contract you define here. Define it well.

## Scope rules

- **Venue-scoped.** Points and leaderboards are strictly per-venue in this
  product. Every query filters `venue_id`. Never aggregate across venues.
- **Only users who have made picks appear.** No zero-pick rows.
- **Two modes, both required:** `week` (a single `weekId`) and `season` (all
  weeks in a season, cumulative). The UI toggles between them.

## Pick privacy — the important part

A user must **not** be able to see another user's pick for a game that has not
kicked off yet. Picks now stay editable per-game all week, so early visibility
would let users copy the leader right up until kickoff.

Rules:

- For **another** user's picks: reveal a pick only once **that specific game**
  has kicked off. Before kickoff, the response must convey "this user has
  picked, but the selection is hidden" — the *existence* and count of the pick
  is fine to show (it drives the picks count), only the selected team is
  withheld.
- For the **requesting user's own** picks: always reveal everything.
- **Enforce this server-side by omitting the field**, not by returning the team
  and letting the client hide it. A hidden pick must not appear anywhere in the
  JSON payload. Assume the client is hostile.

## Endpoint

Add `app/api/nfl-pickem/leaderboard/route.ts` (GET), backed by a new exported
function in `lib/nflPickEm.ts` (keep data access in the lib, per the codebase's
pattern — the route stays a thin wrapper that parses params and maps errors).

Query params: `venueId` (required), `mode` (`week` | `season`, default
`week`), `weekId` (required when `mode=week`), `season` (required when
`mode=season`), and `userId` (the requesting user — drives own-pick reveal).

Suggested response shape (adjust if you find something cleaner, but document
whatever you land on in this file so Phase 6 can build against it):

```ts
{
  ok: true,
  mode: "week" | "season",
  entries: Array<{
    userId: string;
    username: string;
    picksCount: number;
    correctPicks: number;
    incorrectPicks: number;
    totalPoints: number;
    rank: number;
    isCurrentUser: boolean;
    picks: Array<{
      gameId: string;
      gameLabel: string;      // "Away vs Home"
      startsAt: string;
      selectedTeam: string | null;  // null when hidden (game not started)
      isHidden: boolean;
      status: "pending" | "won" | "lost" | "push";
      winnerTeam: string | null;
    }>;
  }>
}
```

## As-built contract (Phase 6 builds against this)

`GET /api/nfl-pickem/leaderboard`

Query params: `venueId` (required; `venue` also accepted), `mode` (`week` |
`season`, default `week`), `weekId` (required when `mode=week`), `season`
(required when `mode=season`), `userId` (optional; drives `isCurrentUser` and
own-pick reveal). Errors: `400` missing/invalid params, `404` unknown week,
`500` otherwise, all as `{ ok: false, error }`.

```ts
{
  ok: true,
  mode: "week" | "season",
  weekId: string | null,   // echoes the requested week (null in season mode)
  season: number | null,   // the week's season, or the requested season
  entries: Array<{
    userId: string;
    username: string;        // "Player <id-prefix>" if the users row has no username
    picksCount: number;
    correctPicks: number;    // status = "won"
    incorrectPicks: number;  // status = "lost"
    totalPoints: number;     // sum of reward_points over won picks
    rank: number;            // standard competition ranking: 1, 2, 2, 4
    isCurrentUser: boolean;
    picks: Array<{           // sorted by startsAt ascending
      gameId: string;
      gameLabel: string;     // "Away vs Home"
      homeTeam: string;
      awayTeam: string;
      startsAt: string;
      isHidden: boolean;
      selectedTeam?: string; // KEY IS ABSENT when isHidden — see below
      status: "pending" | "won" | "lost" | "push" | "canceled";
      winnerTeam: string | null;
      homeScore: number | null;
      awayScore: number | null;
    }>;
  }>
}
```

**Privacy, as implemented:** `selectedTeam` is *omitted from the JSON entirely*
(not sent as `null`) whenever the pick belongs to another user and that game
has not kicked off. Phase 6 must branch on `isHidden`, and treat a missing
`selectedTeam` as hidden — never assume the key exists. An unparseable
`startsAt` is treated as not-yet-started, i.e. hidden.

The matchup itself (`gameLabel` / `homeTeam` / `awayTeam`) *is* sent for hidden
picks — Phase 6 needs it to render the row, and since both sides are shown it
reveals nothing about which one was picked. `winnerTeam` is derived from the
pick's own `status`, so it is always `null` for a hidden pick.

## Implementation notes

- `nfl_pickem_user_weeks` was **not** used — the leaderboard aggregates from
  `pickem_picks` directly. That table is only written by
  `recalculate_nfl_user_week`, which only runs on a pick write (`submitNFLPickEmPick`
  / `clearNFLPick`) or a summary read for one user, so a week that settles
  without further pick activity leaves stale rows, and it holds no row at all
  for a user who has never been recalculated at that venue. The aggregation
  here reproduces the RPC's exact definitions (`won` = correct, `lost` =
  incorrect, points = reward points of won picks, which is `correct * 10` given
  `PICKEM_REWARD_POINTS`), so the leaderboard's own-user row still agrees with
  `WeeklySummary`.
- Reads are paged (`range`, 1000/page) — PostgREST truncates at 1000 rows and a
  season of picks for a busy venue exceeds that.
- Expanded picks come from `pickem_picks` filtered to
  `sport_slug = 'nfl'` + `venue_id` + the week's date range (see how
  `listNFLPickEmGames` derives `weekStartIso`/`weekEndIso`).
- Season mode: sum across weeks. Do not issue one query per user per week —
  fetch in aggregate and group in memory.
- Usernames come from `public.users`. Pick a sensible display fallback for a
  missing username rather than rendering an empty row.
- Ranking: order by `totalPoints` desc, then `correctPicks` desc, then
  `username` asc for a stable tie-break. Equal scores should share a rank.
- **Do not create a migration.** Everything needed already exists.
- No `any`. Type the row shapes explicitly, following the existing
  `PickEmPickRow` / `NFLWeekRow` patterns in the file.

## Tests

Add tests to `tests/lib.nfl-pickem.test.ts` (and/or
`tests/api.nfl-pickem.test.ts`, following whatever mocking pattern those files
already use). Cover at minimum:

- A pick for a game that has not started is **absent** from another user's
  payload but **present** in the requesting user's own.
- A pick for a started game is visible to everyone.
- Users with zero picks are excluded.
- Ranking order and tie-breaking.
- Season mode sums across weeks.
- Venue scoping: a user's picks at a different venue do not leak in.

## Acceptance

- `curl "localhost:3000/api/nfl-pickem/leaderboard?venueId=...&mode=week&weekId=...&userId=..."`
  returns ranked entries for the Phase 0 seeded users.
- Switching `mode=season` returns cumulative totals.
- Grepping the raw JSON for a not-yet-started game's team name returns nothing
  for other users' entries.
- `npm run build` and `npm test` pass.
