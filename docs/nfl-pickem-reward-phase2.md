# Phase 2 — Tiebreaker UI

Read `docs/nfl-pickem-reward-plan.md` and `docs/nfl-pickem-reward-phase1.md`
(the module contract) first.

Surface the Phase 1 tiebreaker question to players on `/nfl-pickem`, and show
answers on the leaderboard once they're no longer secret.

## API route

Add `app/api/nfl-pickem/tiebreaker/route.ts`:

- `GET` — params `venueId`, `weekId`, `userId`. Returns the tiebreaker game
  (matchup label, kickoff), the requesting user's own current guess, and whether
  it is still editable.
- `POST` — body `{ venueId, weekId, userId, predictedTotal }`. Calls
  `submitTiebreakerGuess`. Map a post-kickoff rejection to **409**, a bad
  `predictedTotal` to **400**, unknown week to **404**.

Keep the route a thin wrapper — all data access stays in
`lib/nflPickEmTiebreaker.ts`, matching how `app/api/nfl-pickem/leaderboard/route.ts`
wraps `getNFLPickEmLeaderboard`. Resolve the acting user server-side the same way
the sibling NFL routes do (see `lib/serverSession.ts` usage in
`app/api/nfl-pickem/picks/route.ts`); do not trust a client-supplied `userId` for
the write.

## Player UI

New component `components/nfl-pickem/NFLTiebreakerCard.tsx`, rendered by
`components/nfl-pickem/NFLPickEmGameList.tsx` **below the week's slate of games**.

Copy requirements — the label must make the purpose unmistakable:

- Heading: **"Tiebreaker"**
- Sub-line: **"If you tie for the most correct picks this week, this decides the
  winner."**
- Question: **"How many total points will be scored in {Away} at {Home}?"**
  (the week's last game, plus its kickoff time)
- Numeric input, 0–200, with a Save action.

States to handle:

- **Not yet answered** — prompt, enabled input.
- **Answered, still open** — shows the saved number, editable, with a "Locks at
  {kickoff}" note.
- **Locked** (game kicked off) — read-only readback of the saved number, or
  "You didn't answer the tiebreaker" if none.
- **No active week-winner reward at this venue** — still render the card. The
  question is cheap, and hiding it would mean a reward created mid-week finds
  nobody has answered. (If you disagree after reading the code, note the reason
  in the run log rather than silently changing it.)

Follow the optimistic-update pattern already established in
`NFLPickEmGameList` (set local state before awaiting the network; do **not** add
a blocking spinner overlay — see finding #2 in
`docs/nfl-pickem-improvements-plan.md`, which was specifically fixed).

## Leaderboard integration

In `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, show each entry's tiebreaker
answer **only once the tiebreaker game has kicked off** — before that, the API
omits it, so branch on the key's absence exactly as the existing code branches on
`isHidden` for picks. Never assume the key exists.

Display it as a small secondary line on the entry (e.g. "Tiebreaker: 47"), and
once `actual_total` is settled, mark the closest guess among tied leaders.

## Constraints

- Tailwind utility classes only — no inline `style={{}}` (the pre-existing
  `fontFamily` inline style in the NFL header is grandfathered; leave it).
- Absolute `@/` imports. Arrow functions for components. No `any`.
- Do not touch `proxy.ts`, `lib/supabaseAdmin.ts`, `vercel.json`, or existing
  migrations.

## Tests

Extend `tests/api.nfl-pickem.test.ts` for the new route: 409 after kickoff, 400 on
out-of-range input, and that a GET for user A never contains user B's
unrevealed guess.

## Acceptance

- `npm run build` and `npm test` pass.
- Against the Phase 0 seed, `/nfl-pickem` renders the tiebreaker card below the
  slate for the current week, saves a guess, and shows it locked for a week whose
  last game has already kicked off.
