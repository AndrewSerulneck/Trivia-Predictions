# Phase 5 — Create Reward wizard UI

Read `docs/nfl-pickem-reward-plan.md`, `docs/nfl-pickem-reward-phase3.md`
(the scope model) and `docs/nfl-pickem-reward-phase4.md` (the context DTO) first.

`components/rewards/CreateRewardWizard.tsx` (~969 lines) is used by **both** the
admin Rewards section (`components/admin/sections/ChallengesSection.tsx`) and the
Partner Dashboard (`app/owner/competitions/page.tsx`) via a
`variant: "admin" | "owner"` prop. **Do not fork it.** Both hosts get this feature
from the same edit.

Its steps today: `"venue" | "definition" | "terms" | "prize" | "confirm"`.

## What changes

### Definition step

The NFL Pick 'Em Challenge tile appears automatically from `REWARD_DEFINITIONS`.
Verify the tile renders with its `accent: "pickem"` mapped to the right
`ht-game-*` token, and that the "schedule it first" block (which is Live-Trivia
specific) does **not** render for a definition whose `requiresScheduledGame` is
`null`. When `context.nflSeason` is absent/unavailable, show the NFL equivalent
block instead, using `REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE`.

### Terms step — NFL branch

For the NFL definition, replace the Live Trivia terms sentence with two controls:

**1. Win condition** (two cards, mutually exclusive):
- **"Points target"** — "Guests win by getting a set number of picks right."
- **"Most picks right"** — "The guest with the most correct picks wins."

**2. How long it runs** (two cards, mutually exclusive — **exactly these two**,
no week-range picker, no multi-week selector):
- **"Every week"** — "A new contest every NFL week. {weeksRemaining} weeks left
  this season."
- **"Whole season"** — "One contest, decided at the end of the season. Runs
  Week {fromWeek} through the end of the season."

Then, conditionally:

- Points target selected → threshold input (using the definition's
  `thresholdOptions` / `defaultThreshold` / `thresholdStep: 1`, labeled in
  **picks**, e.g. "Get 10 picks right") **and** the quantity control
  (`REWARD_QUANTITY_OPTIONS`).
- Most picks right selected → **no quantity control at all.** Render fixed
  copy: *"1 winner"* (per week, or for the season). The quantity is locked by the
  server; showing an editable control the server will reject is worse than not
  showing one.

### The 3-player rule must be unmissable

For the "Most picks right" condition, render a persistent notice on **both** the
terms step and the confirm step:

> **At least 3 guests must make picks** at your venue that week (or that season)
> for a winner to be crowned. If fewer than 3 play, no reward is given out.

Style it as an informational callout, not a disabled-state warning — it is a rule,
not an error.

### Confirm step

Use `describeNFLWeekScope` from `lib/nflPickEmRewardWeeks.ts` for the readback
sentence — do not re-author the copy in the component. Include the tiebreaker
explanation (the describe function already emits it for game-winner scopes) and
the 3-player notice.

### Submission

Send `nflWeekScope` in the create body. Do **not** send a `cadence` or a
`winnerQuota` for a game-winner NFL reward — Phase 4 derives both server-side and
discards client values. Sending them anyway is harmless but misleading; omit them.

## Where the Live Trivia path must not change

Every branch you add must be gated on the selected definition being
`nfl_pickem_challenge`. The Live Trivia terms sentence, its game picker (behind
`NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED`), and its cadence rules are untouched.
If a shared helper needs a parameter to serve both, add the parameter with the
Live Trivia value as the default.

## Constraints

- Tailwind utility classes only. No inline `style={{}}`. Design tokens from
  `lib/themeTokens.ts`.
- Absolute `@/` imports. Arrow functions. No `any`.
- Mobile-first — the Partner Dashboard is a mobile surface; the two-card choosers
  must stack cleanly at narrow widths.
- Do not touch `proxy.ts`, `lib/supabaseAdmin.ts`, `vercel.json`, or migrations.

## Tests

Component tests if the repo has a pattern for them (check `tests/` for existing
wizard coverage). At minimum add logic-level tests for whatever pure helpers you
extract, and verify by build + the Phase 9 browser pass.

## Acceptance

- `npm run build` and `npm test` pass.
- In both the admin Rewards section and `/owner/competitions`, the NFL Pick 'Em
  Challenge tile appears, the two-choice scope control renders, "Most picks right"
  hides the quantity control and shows "1 winner", and the 3-player rule is
  visible on both the terms and confirm steps.
- No week-range or multi-week selector exists anywhere in the UI.
