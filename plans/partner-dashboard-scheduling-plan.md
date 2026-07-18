# Partner Dashboard Scheduling Improvements — Plan

Covers three owner-facing asks on `/owner/schedule`:
1. Bigger date/time text on the upcoming-games list.
2. Click an upcoming game to edit it (rounds, date/time, etc).
3. Owner-side recurring games (e.g. "every Wednesday" or "every Sun/Mon/Tue"), matching what admins already have.

## Current state (confirmed in code)

- `app/owner/schedule/page.tsx`
  - `ScheduleList` renders each card; the date/time line is `formatScheduleTime(...) – formatScheduleTime(...)` at [app/owner/schedule/page.tsx:288-291](app/owner/schedule/page.tsx#L288-L291), styled `text-xs font-semibold text-ht-muted` (line 288). The month chip is `text-[10px]` (line 283); the day number uses `ht-h2` (line 284).
  - There is **no click-to-edit** — cards only have a "Cancel" (delete) button (lines 302-310). `showForm`/`ScheduleForm` (line 318+) is create-only, posting to `/api/owner/schedule`.
  - `lib/ownerSchedule.ts` merges two backends into one `OwnerSchedule` list: `lib/categoryBlitzSchedules.ts` (table `category_blitz_schedules`) and `lib/liveShowdownAdmin.ts` (table `trivia_schedules`).
- Admin already has full recurring + edit support to mirror:
  - Table `trivia_schedules` has `recurring_type` (`none|daily|weekly|monthly|yearly`) and `recurring_days text[]` (checked `sun..sat`), added via migrations `20260516170000_add_live_showdown_schedule_tables.sql`, `20260526103000_...`, `20260526114500_...`.
  - `lib/liveShowdownAdmin.ts`: `createAdminLiveShowdownSchedule`, `updateAdminLiveShowdownSchedule`, `listAdminLiveShowdownSchedules`, `deleteAdminLiveShowdownSchedule` — weekly recurrence requires ≥1 `recurring_days` entry.
  - `components/admin/sections/SchedulesSection.tsx`: `ViewMode = "list" | "create" | "edit" | "manage"` (line 355); `openEditForm(s)` (line 826) pre-fills the same form used for create, branching only the submit handler (`handleCreate` vs `handleUpdate`, line 1142); `RECURRING_OPTIONS` select (lines 1042-1054) + `WEEKDAY_OPTIONS` checkboxes (lines 1055-1083, enabled only when `recurringType === "weekly"`) is the exact recurrence UI to reuse.
  - `app/api/admin/route.ts` has the create/update handlers this all POSTs to.
- Category Blitz's recurring support lives separately in `lib/categoryBlitzSchedules.ts` (its own `CategoryBlitzRecurringType`) — but note per `project_category_blitz_continuous_default` memory, Category Blitz is moving to always-on continuous mode and is *already dropped from the owner schedule picker* when that flag is on ([app/owner/schedule/page.tsx:57-59](app/owner/schedule/page.tsx#L57-L59)). **Recommendation: scope recurrence + edit to Live Trivia only** — Category Blitz scheduling is being phased out for owners, so building recurring UI for it would likely be thrown away. Confirm with user before Phase 3 if unsure.

## Phase 1 — Bigger date/time text (cosmetic only)

- Change [app/owner/schedule/page.tsx:288](app/owner/schedule/page.tsx#L288) from `text-xs font-semibold text-ht-muted` to something like `text-sm font-bold text-ht-primary` (or `text-base` if it still needs to fit the card at narrow widths — check on a real phone width, ~375px, since this is the mobile-first Partner Dashboard).
- No API or type changes. No migration.
- **Model/effort: Haiku 4.5, low effort.** Pure Tailwind class tweak plus a visual check at mobile width.

## Phase 2 — Click-to-edit an upcoming game

Scope: owner can tap an upcoming `ScheduleList` card to open an edit form pre-filled with that game's title/date/time/timezone/rounds, and save changes. Mirrors admin's `openEditForm` pattern but as an in-place swap (card → form), not a popup — this app has no modal primitive to date.

Steps:
1. Extend the owner API: `PATCH /api/owner/schedule/[scheduleId]` (new route alongside the existing `DELETE` one), delegating to `updateAdminLiveShowdownSchedule` / the Category Blitz equivalent update fn (check `lib/categoryBlitzSchedules.ts` for an existing updater before writing a new one).
2. In `app/owner/schedule/page.tsx`: add `editingScheduleId` state; make each `ScheduleList` card (upcoming only, not past) clickable, opening `ScheduleForm` pre-filled in "edit" mode (reuse the same component, add `mode: "create" | "edit"` and an `initialSchedule` prop, same as admin does).
3. Guard: don't let editing change `gameType` (switching Category Blitz ↔ Live Trivia on an existing row doesn't make sense) — keep it fixed, editable fields are date/time/timezone/title/rounds.
4. Consider: what happens if the game is starting imminently or already live — likely disable edit within some buffer window (check what admin does, if anything, in `handleUpdate`/`updateAdminLiveShowdownSchedule` for a similar guard).

**Model/effort: Sonnet 5, medium effort.** Touches an API route, two library files, and page state; needs to correctly branch create vs edit without duplicating the form, and needs a UI decision (in-place swap position, disabling past/live games from editing).

## Phase 3 — Owner-side recurring games

Scope: give owners the same `recurring_type` + `recurring_days` controls admins have, for Live Trivia (see scoping note above re: Category Blitz).

Steps:
1. Confirm `category_blitz_schedules` recurrence support and whether Category Blitz is in scope (see note above) — ask the user to confirm this scoping decision if it's not obvious from the flag state at implementation time.
2. Extend `lib/ownerSchedule.ts` / owner create+update paths to accept `recurringType` and `recurringDays`, passing through to the same `lib/liveShowdownAdmin.ts` functions admins use (no new table columns needed — they already exist).
3. In `ScheduleForm` (owner page), add the `RECURRING_OPTIONS` select + `WEEKDAY_OPTIONS` checkbox row, copied/adapted from `components/admin/sections/SchedulesSection.tsx:1042-1083`, including the "weekly requires ≥1 day" validation.
4. Update `ScheduleList` display to show a recurrence badge (e.g. "Every Wed" / "Weekly: Sun, Mon, Tue") next to the date chip so owners can tell a recurring series apart from a one-off.
5. Decide how recurring series show in the upcoming list — does the admin side materialize each future occurrence as a row, or store one row with a rule? Check `listAdminLiveShowdownSchedules` to see how it expands recurrence into list entries, and mirror that for the owner list so Phase 2's edit-in-place also correctly targets "this occurrence" vs "the whole series" (this is the trickiest edge case — worth a quick decision with the user: edit whole series only, to keep scope small, unless admin already supports single-occurrence edits).
6. Delete/cancel semantics also need the same series-vs-occurrence decision as edit.

**Model/effort: Sonnet 5, high effort.** This is the largest piece — it reuses proven admin logic (low invention risk) but has real edge-case decisions (series vs. occurrence semantics for edit/delete/display) that need care across three layers (DB-adjacent lib functions, API, UI). Worth a short plan-mode pass before coding, and testing against real recurring rows in dev.

## Suggested order

Phase 1 → Phase 2 → Phase 3, since Phase 3's edit-a-recurring-row UX builds directly on Phase 2's edit form. Phase 1 is a quick standalone win and can ship immediately regardless of the others.
