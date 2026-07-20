# Game-Filterable Leaderboard Implementation Plan

## Purpose

Add a game filter to the leaderboard so users can organize rankings by game and time period. The game dropdown should sit to the left of the existing timeframe dropdown and list every game offered on Hightop Challenge.

When users select `NFL Pick 'Em`, the timeframe dropdown should switch to NFL week options such as `Week 1`, `Week 2`, and so on. Future NFL weeks should not appear. The leaderboard should show user scores for the selected NFL week.

All implementation should match the current Hightop Challenge branding and reuse the existing leaderboard visual language.

## Current System Findings

- The standalone leaderboard page is `app/leaderboard/page.tsx`.
- The leaderboard API is `app/api/leaderboard/route.ts`.
- The main client UI is `components/leaderboard/LeaderboardTable.tsx`.
- Existing leaderboard data logic is in `lib/leaderboard.ts`.
- Current timeframe options are `today`, `week`, `month`, `year`, and `all-time`.
- `lib/leaderboard.ts` already defines a `LeaderboardGameFilter` type, but the route and UI do not currently use a game filter.
- The canonical game catalog is in `lib/venueGameCards.ts`.
- NFL Pick 'Em week support already exists through:
  - `app/api/nfl-pickem/weeks/route.ts`
  - `lib/nflPickEm.ts`
  - `nfl_pickem_weeks`
  - `nfl_pickem_user_weeks`

## Canonical Game Dropdown Options

Use the Hightop Challenge game catalog as the source of truth.

- `All Games`
- `Speed Trivia`
- `Hightop Live Trivia`
- `Category Blitz`
- `Prop Bingo`
- `Hightop Fantasy Sports`
- `Hightop Pick 'Em`
- `NFL Pick 'Em`

Recommended internal filter values:

- `all`
- `speed-trivia`
- `live-trivia`
- `category-blitz`
- `bingo`
- `fantasy`
- `pickem`
- `nfl-pickem`

## Model Recommendations

Official Kimi docs currently identify `kimi-k2.6` as the latest recommended model for stronger reasoning, agentic coding, and long-horizon software engineering work. Reference: https://platform.kimi.ai/docs/models

| Phase | Work | Best Codex Model | Intelligence Level | Best Kimi Model |
| --- | --- | --- | --- | --- |
| 1 | Planning doc and architecture lock | GPT-5 | High | `kimi-k2.6` |
| 2 | Backend leaderboard filters | GPT-5 | High | `kimi-k2.6` |
| 3 | NFL week option behavior | GPT-5 | Medium-high | `kimi-k2.6` |
| 4 | Leaderboard UI controls | GPT-5 | High | `kimi-k2.6` |
| 5 | Page wiring and defaults | GPT-5 | Medium | `kimi-k2.6` or `kimi-k2-turbo-preview` |
| 6 | Tests and verification | GPT-5 | High | `kimi-k2.6` |

## Phase 1: Planning Doc And Architecture Lock

Status: planned in this document.

Deliverables:

- Create this reference plan at `plans/game-filterable-leaderboard-plan.md`.
- Lock the intended product behavior before code changes.
- Identify the files and data sources that future phases should modify.
- Preserve the instruction that no code changes beyond this planning doc should happen until explicitly requested.

Decision-complete implementation choices:

- The leaderboard starts at `All Games` and `All Time`, matching current behavior.
- The new game dropdown appears to the left of the timeframe dropdown.
- Non-NFL filters use game plus normal timeframe.
- `NFL Pick 'Em` replaces the normal timeframe choices with started NFL weeks only.
- Future NFL weeks are hidden from the dropdown.
- Weekly NFL scores come from `nfl_pickem_user_weeks.total_points`.
- The visible controls reuse existing `LeaderboardTable` dropdown styling and Hightop design tokens.

## Phase 2: Backend Leaderboard Filters

Best Codex model: GPT-5  
Intelligence level: High  
Best Kimi model: `kimi-k2.6`

Implementation:

- Extend `app/api/leaderboard/route.ts` to accept `game` and `nflWeekId`.
- Add `parseLeaderboardGameFilter` in `lib/leaderboard.ts`.
- Extend `getLeaderboardSnapshotForVenue` to accept:
  - `game?: LeaderboardGameFilter`
  - `timeframe?: LeaderboardTimeframe`
  - `nflWeekId?: string`
- For `game=all`, preserve current aggregate behavior.
- For non-NFL individual games, aggregate points only from that game's source table.
- For `game=nfl-pickem`, ignore normal timeframe and require a valid started `nflWeekId`.

Game source mapping:

- Speed Trivia: `trivia_answers`, correct answers times 2 points.
- Hightop Live Trivia: `live_showdown_answers.points_awarded`.
- Category Blitz: `scategories_submissions.points_awarded`.
- Prop Bingo: won `sports_bingo_cards.reward_points`.
- Hightop Pick 'Em: `pickem_daily_snapshots.collected_points`.
- Hightop Fantasy Sports: `fantasy_entries.reward_points`.
- NFL Pick 'Em: `nfl_pickem_user_weeks.total_points`.

Ranking rules:

- Sort by points descending.
- Break ties by username ascending.
- Rank starts at 1.
- Exclude zero-point rows.
- Keep current fallback behavior only for unfiltered all-time aggregate mode.

## Phase 3: NFL Week Option Behavior

Best Codex model: GPT-5  
Intelligence level: Medium-high  
Best Kimi model: `kimi-k2.6`

Implementation:

- Reuse `app/api/nfl-pickem/weeks/route.ts` or add a small leaderboard-specific helper in `lib/nflPickEm.ts`.
- Return only weeks where `week_start_date` is on or before the current venue-local date.
- Include weeks with `open`, `locked`, or `complete` status once started.
- Exclude future `upcoming` weeks.
- Prefer `display_label` when present; otherwise show `Week {weekNumber}`.

Default selection:

- Select the current started week when available.
- Otherwise select the most recent started week.
- If no started weeks exist, show an empty state instead of showing future weeks.

## Phase 4: Leaderboard UI Controls

Best Codex model: GPT-5  
Intelligence level: High  
Best Kimi model: `kimi-k2.6`

Implementation:

- Update `components/leaderboard/LeaderboardTable.tsx` to support a game dropdown.
- Place the game dropdown to the left of the timeframe/week dropdown.
- Preserve the current dropdown visual style:
  - `rounded-ht-pill`
  - `bg-ht-elevated`
  - cyan/amber accent usage
  - existing focus and hover treatment
  - mobile-safe sizing
- Keep outside-click and Escape-to-close behavior for both menus.
- Update loading state when either filter changes.

Fetch behavior:

- Non-NFL request shape:

```text
/api/leaderboard?venue={venueId}&game={game}&timeframe={timeframe}&userId={userId}
```

- NFL request shape:

```text
/api/leaderboard?venue={venueId}&game=nfl-pickem&nflWeekId={weekId}&userId={userId}
```

Empty-state copy:

- Non-NFL filtered: `No users ranked yet for this game and timeframe.`
- NFL selected week: `No NFL Pick 'Em scores for this week yet.`
- No started NFL weeks: `NFL Pick 'Em weeks will appear once the season starts.`

## Phase 5: Page Wiring And Defaults

Best Codex model: GPT-5  
Intelligence level: Medium  
Best Kimi model: `kimi-k2.6` or `kimi-k2-turbo-preview`

Implementation:

- Update `app/leaderboard/page.tsx` to enable both controls on the standalone page.
- Keep the initial server render as `All Games / All Time`.
- Avoid changing embedded leaderboard instances unless they explicitly opt into controls.
- Preserve current inline ad row behavior.
- Preserve venue-specific copy and ranking layout.

## Phase 6: Tests And Verification

Best Codex model: GPT-5  
Intelligence level: High  
Best Kimi model: `kimi-k2.6`

Unit tests:

- `parseLeaderboardGameFilter` accepts known values and defaults invalid values to `all`.
- Non-NFL filtered aggregations only count the selected game.
- `All Games` retains current aggregate behavior.
- NFL weekly aggregation ranks by `nfl_pickem_user_weeks.total_points`.
- Future NFL weeks are excluded from dropdown options.

API tests:

- `/api/leaderboard` supports `game` plus `timeframe`.
- `/api/leaderboard` supports `game=nfl-pickem` plus `nflWeekId`.
- Invalid `nflWeekId` returns a safe empty result or clear error, depending on final route policy.
- Missing venue still returns the existing `venue is required` error.

Manual/browser verification:

- `/leaderboard` shows the game dropdown left of the timeframe dropdown.
- Selecting each game updates the leaderboard without layout shift.
- Selecting `NFL Pick 'Em` replaces timeframe choices with started NFL weeks only.
- Future NFL weeks do not appear.
- Mobile layout does not overlap and matches current Hightop branding.

Suggested commands:

```bash
npm run build
npx vitest run tests/lib.nfl-pickem.test.ts tests/lib.nfl-week-utils.test.ts
```

Add a new leaderboard-focused test file during the implementation phases and include it in the final verification command.

## Assumptions

- "Every game offered" means the canonical `VENUE_GAME_CARDS` list plus an `All Games` option.
- `NFL Pick 'Em` weekly scores should use `nfl_pickem_user_weeks.total_points`.
- Weeks become eligible for the leaderboard dropdown once their `week_start_date` has arrived.
- Existing all-time leaderboard behavior should remain unchanged for the default `All Games / All Time` view.
- No database migration is expected for the core feature unless testing reveals missing production indexes.
