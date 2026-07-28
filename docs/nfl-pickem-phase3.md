# Phase 3 — Week dropdown (past + current only)

Read `docs/nfl-pickem-improvements-plan.md` first.

Requirement #4: replace the horizontal card strip with a compact dropdown.

## Product rule — read carefully

The dropdown lists **past weeks and the current week only. Never future
weeks.** This is deliberate: the product's goal is to bring users back to the
bar each week to make that week's picks. Letting them pick the whole season in
one sitting defeats that. Do not "helpfully" add upcoming weeks.

Concretely: **a week is selectable iff its `week_start_date` is on or before
today.** A week becomes available on its own Thursday, not before. This rule
also gracefully handles Tue/Wed (outside any Thu–Mon window) — the most
recently started week remains selected.

The user always **lands on the current week** (the latest week whose
`week_start_date <= today`), and may use the dropdown to look back at prior
weeks' schedules and their own selections.

## Required changes

### Filtering — do it server-side

In `app/api/nfl-pickem/weeks/route.ts` (the `mode === "game"` branch, not the
leaderboard branch), exclude weeks whose `week_start_date` is in the future
before building `weekOptions`. Server-side is the right layer: it keeps the
rule in one place and prevents a future week's id from being pokeable via the
`?week=` query param.

Also harden `app/api/nfl-pickem/games/route.ts`: if a caller passes a `weekId`
for a week that has not started, reject it rather than serving the games. A
client-only filter is not sufficient given `?week=` is user-controllable.

`currentWeekId` should be the latest started week. Note `getCurrentNFLWeek`
returns the week *containing* today, which is null on Tue/Wed — so define the
landing week as "latest week with `week_start_date <= today`" and use that for
defaulting. (`getCurrentNFLWeek` was recently fixed for an off-by-one on the
final day; leave that fix in place.)

### Replace `WeekSelector.tsx`

Rewrite `components/nfl-pickem/WeekSelector.tsx` as a dropdown.

- **No wrapper `<section>`/box, no "SELECT WEEK" heading.** The user
  explicitly called out that the box wastes vertical space. The dropdown sits
  directly above the week's schedule.
- Use a native `<select>` unless there is a strong reason not to — it gets
  correct mobile behavior (iOS wheel picker), accessibility, and keyboard
  support for free, and this is a mobile-first surface. Style it with Tailwind
  utilities to match the amber-on-slate treatment
  (`#fde68a` accent, `bg-slate-900`, `border-[#fde68a]/30`).
- Each option label should carry the week label and its date range, e.g.
  `Week 4 · Sep 25 – Sep 29`. Mark the current week, e.g. a `(Now)` suffix —
  option elements cannot hold badges.
- Prefer `getNFLWeekDisplayLabel`'s output (already returned by the API as
  `label`) over re-deriving `Week {n}`, so preseason/postseason labels render
  correctly.
- Keep the component's `weeks` / `selectedWeekId` / `onSelect` prop contract.
- Delete the now-unused framer-motion import and the per-card
  hover/tap animation code.

### `NFLPickEmGameList.tsx`

- Default selection: the API's `currentWeekId`. Fall back to the most recent
  week in the list. Remove the existing `find(w => !w.isLocked)` fallback —
  with per-game locking, week-level `isLocked` is no longer a meaningful way
  to choose a default.
- The `initialWeekId` prop (from `?week=`) should still win when present *and*
  valid — but if it names a week not in the allowed list, ignore it and fall
  back to the current week rather than rendering an error.
- The "NFL weeks are not available yet" empty state currently has an empty
  `<p>`. Either give it real copy or remove the empty paragraph.

## Acceptance

- The week control is a dropdown with no surrounding box or heading, sitting
  immediately above the schedule.
- With the Phase 0 seed (2 past weeks + 1 current), the dropdown lists exactly
  3 weeks and lands on the current one.
- A future week is absent from the dropdown, and requesting it directly via
  `/api/nfl-pickem/games?weekId=<future>` is rejected.
- Selecting a past week shows that week's schedule and the user's saved picks.
- `npm run build` and `npm test` pass.
