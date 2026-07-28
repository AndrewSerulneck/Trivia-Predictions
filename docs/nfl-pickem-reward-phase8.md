# Phase 8 — Player-facing surfaces

Read `docs/nfl-pickem-reward-plan.md` first.

Everything so far is invisible to guests. A reward nobody knows about drives no
visits, and the 3-player minimum is a rule players must understand *before* the
week ends, not discover afterward.

## 1. Active-reward banner on `/nfl-pickem`

Add `components/nfl-pickem/NFLPickEmRewardBanner.tsx`, rendered near the top of
`app/nfl-pickem/page.tsx` (above the game list).

Data source: the venue's active campaigns with
`rewardDefinitionId === "nfl_pickem_challenge"`. Reuse the existing Rewards read
path rather than adding a new one — grep for how
`components/rewards/*` / the venue-home Rewards panel loads campaigns for a viewer
(`getChallengeCampaignSnapshotForUser` in `lib/challengeCampaigns.ts` is the likely
entry point) and follow it. If a new thin API route is genuinely needed, add
`app/api/nfl-pickem/rewards/route.ts` as a wrapper only.

Render per reward:

- Prize (reuse the existing prize-rendering helper used by the Rewards panel — do
  not re-author prize copy).
- The requirement, from the campaign's stored `rules` string.
- **Points-target rewards:** the viewer's progress — "7 of 10 picks right" — and
  how many prizes remain this cycle (`quotaRemaining` is already on
  `ChallengeCampaign`).
- **Most-picks-right rewards:** the viewer's current standing and, prominently,
  the participation state (below).

### The 3-player state must be live and specific

Show the actual count, not a static rule:

- Fewer than 3 pickers this week:
  > **2 of 3 players needed** — at least 3 people must make picks this week for a
  > winner to be crowned. Tell a friend!
- 3 or more:
  > **3 players in** — a winner will be crowned this week.

Use `NFL_WINNER_MIN_PARTICIPANTS` from `lib/nflPickEmWinnerRewards.ts` rather than
a literal `3`. The count is the distinct users with at least one pick at this
venue for the week — the leaderboard entry count already gives you this.

Also mention the tiebreaker in one line, linking to the tiebreaker card:
*"Tied on correct picks? The tiebreaker question decides it."*

## 2. Venue-home Rewards panel

Confirm NFL rewards render correctly in the existing Rewards panel with no
changes. They are ordinary `challenge_campaigns` rows, so they should — but check
for anything that assumes a Live Trivia reward (a hardcoded game label, a
schedule lookup, an icon map keyed by `requiresScheduledGame`). Fix what you find;
do not restructure the panel.

## 3. Leaderboard winner marker

In `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, mark the entry that won a
week's reward (read `challenge_cycle_winners` for that campaign + cycle, or
whatever the Rewards surfaces already use to show past winners — prefer the
existing path). A small trophy/badge on the row, plus the prize name on hover or
as a secondary line.

For a week that resolved with **no** winner because of the minimum, show a quiet
note above the standings:
> No reward this week — fewer than 3 players made picks.

This is the payoff of stating the rule up front; do not omit it.

## Constraints

- Tailwind utility classes only. No inline `style={{}}` (the pre-existing
  `fontFamily` inline style in the NFL header is grandfathered).
- Absolute `@/` imports. Arrow functions for components. No `any`.
- Mobile-first.
- Venue-scoped everywhere — never show another venue's standings or rewards.
- Do not touch `proxy.ts`, `lib/supabaseAdmin.ts`, `vercel.json`, or migrations.
- **Do not make the `/nfl-pickem` server render slower.** See the
  "Venue page SSR must stay fast" precedent: heavy queries in a server render
  caused an overlay to dismiss early and look like a redirect to login. Load the
  banner's data client-side, or keep the server query trivial.

## Tests

Extend `tests/api.nfl-pickem.test.ts` if you add a route. Cover the participation
count boundary (2 vs 3 pickers) wherever the logic lives.

## Acceptance

- `npm run build` and `npm test` pass.
- Against the Phase 0 seed with an active week-winner reward: `/nfl-pickem` shows
  the banner, the live "N of 3 players needed" state changes correctly between a
  2-picker week and a 3-picker week, and the leaderboard marks the resolved
  winner and explains a skipped week.
