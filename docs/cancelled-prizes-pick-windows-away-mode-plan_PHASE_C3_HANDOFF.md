# Phase C3 handoff: Remind me + Add to calendar

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Phase C3 was done on 2026-11-09 by Claude Opus 5.5 at high effort,
which matches the plan's table.

## For Andrew (plain English)

- **What changed:** under the next Live Trivia game on Venue Home there are now two buttons. They show whether the player is at
  the bar or away.
  - **Remind me** (app only): one push **1 hour before** the game, "Live Trivia reminder" / "8:00 PM at Pacific Street.". Tap again
    to turn it off ("Reminder set" → "Remind me"). If notifications aren't on yet, the tap first shows the usual "Turn on
    notifications for…" wording (Apple's rule), and saves the reminder once they are on. The 30-minute "starts soon" push is unchanged,
    so a regular can get both.
  - **Add to calendar** (app and website): adds the game, with the bar's address and a 1-hour alert, to the phone's calendar.
- **One change from the plan:** the plan said the calendar file would be made on the phone. Inside the iPhone app, the share sheet
  has no "Add to Calendar", so a player would get stuck. Instead, a small link on our site serves the file, and the app opens it in
  Safari/Chrome, which then offers to add it. Cost: one tiny request per tap. Repeat taps for the same game are served from Vercel's
  cache for 5 minutes.
- **Cost:** negligible. One database write per Remind me tap. The existing 5-minute job reads the schedule the same number of times
  as before (it now looks 1 hour ahead instead of 30 minutes). It does one extra small step only while a game is inside the hour.
  No new scheduled job.
- **Is it live?** No. It is held for the final review-and-release phase (R) with A2–C2. It needs a new database table (migration
  `20261109214742_push_game_reminder_optins.sql`). **I did not apply it.** It goes in with your go-ahead in Phase R, before deploy.
- **Checked:** all tests pass (509 files). Checked in a browser at phone width (350 px), as an app user away from the bar and as
  a website user at the bar. Not yet tried on a real phone: the push arriving, and Safari/Chrome actually adding the event to the calendar.

## For the next agent (Phase B1: Pick-window data + rules)

### 1. Next phase goal and scope
Phase B1 per plan §7: migration for pick windows (`venue_pickem_pick_windows`, or columns on `venue_game_settings` if that keeps the
settings read to one query), pure rules in `lib/pickemPickWindow.ts`, and server enforcement in `submitPickEmPick`, the NFL Pick 'Em
picks route and `/api/pickem/prize-tiebreaker` (closed window → 409 "Picks open Mon 12:00 AM."; fail **open** on a settings read
error). Read the Pick 'Em plan's Standing rules first (`docs/pickem-college-football-and-prize-plan.md`): points only via
`pay_pickem_points`; B1 must not touch scoring. Out of scope: B2 (pick ahead/UI), B3 (frozen lines), B4 (Game Settings UI),
committing/deploying (held for R). Open question Q1 (line freeze timing) blocks B3 only.

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new committed, pushed or deployed.
- **Andrew, 2026-11-09: hold A2, A3 and C1 for Phase R.** C2 and C3 are treated the same. Don't commit or deploy.
- Uncommitted from A2/A3/C1/C2: see `…_PHASE_C2_HANDOFF.md` §2 and the handoffs it lists.
- **Uncommitted, C3:**
  - new: `supabase/migrations/20261109214742_push_game_reminder_optins.sql` (**not applied**), `lib/gameReminderOptIns.ts`,
    `app/api/push/game-reminders/route.ts`, `lib/liveTriviaCalendar.ts`, `app/api/trivia/live/calendar/route.ts`,
    `lib/liveTriviaReminders.ts`, `components/venue/LiveTriviaReminderRow.tsx`
  - modified: `lib/push/gameReminders.ts`, `lib/liveShowdownEngine.ts` (new export `findUpcomingScheduleOccurrence`, next to
    `findStartingOccurrences`), `lib/nativePush.ts` (new `PUSH_ASK_INLINE_EVENT`), `components/push/PushPermissionCard.tsx` (hides on
    `PUSH_ENABLED_EVENT` / `PUSH_ASK_INLINE_EVENT`), `components/venue/venueHubShared.tsx` (`LiveTriviaStatus.scheduleId?`),
    `components/venue/VenueHubClient.tsx` (sets `scheduleId` from `/api/trivia/live/state`'s `nextSchedule.id`; passes `venueId` to the
    panel), `components/venue/VenueGamesPanel.tsx` (renders the row inside the Live Trivia card, keyed by game)
  - tests: new `tests/api.push.game-reminders.test.ts` (9), `tests/lib.live-trivia-calendar.test.ts` (8),
    `tests/components.live-trivia-reminder.test.ts` (7), `tests/lib.live-trivia-upcoming-occurrence.test.ts` (2); added a "Remind me"
    block to `tests/lib.push.test.ts` (4) and `tests/push-notifications-contract.test.ts` (4); `scripts/test-push-sql.cjs` now loads the
    new migration and proves the claim.
  - plan doc: status line, §6 C3 cost row, C3 phase note, C3 standing rule; this handoff.
- No data, env var or production read/write. **Phase R must `supabase db push` this migration (with Andrew's go-ahead) before
  deploying**, or Remind me taps return 500 ("Couldn't save that.") and the sweep logs `[Push] opt-in-reminders-failed` every 5
  minutes while a game is inside the hour (the 30-minute push is unaffected; the two halves are isolated).

### 3. Decisions made (don't re-ask)
- **Lead time 1 hour** (plan §4; Q2 unanswered, so the default stands). `OPT_IN_REMINDER_LEAD_MS` in `lib/push/gameReminders.ts`.
- **Which game:** the next Live Trivia game only (that is all Venue Home shows). Keyed exactly like the 30-minute ledger:
  `(schedule_id, occurrence_date)` in the schedule's own timezone; the server derives `occurrence_date`, never the browser.
- **Claim pattern:** per opt-in row (`reminded_at` stamped by the RPC under row locks), not a second row in `push_game_reminders`. That
  table's primary key is `(schedule_id, occurrence_date)` and already belongs to the 30-minute push. A late opt-in (made after the hour
  began) is still sent on the next run, at most 5 minutes later.
- **Audience:** every live (not disabled) phone of the opt-in's profile or its account, **ignoring the "Group games starting" switch**,
  because the player asked for this one push. There is no idle-days filter either. One push per phone per game (deduped in TypeScript).
- **Copy:** title "Live Trivia reminder", body = `gameReminderBody` ("8:00 PM at Pacific Street."), path
  `venuePushPath(venueId, "games")`. No "Tap to…" (C2 rule). Buttons: "Remind me" / "Reminder set" / "Add to calendar"; errors
  "Couldn't save that." / "This game has changed." / "Couldn't open your calendar.".
- **Apple 4.5.4:** if push is off on this phone, Remind me never calls `enablePush` directly. It first shows `PUSH_COPY.askBody` +
  "Turn on"/"Not now" inline (the same words as the push card), because turning push on also turns on the promotional `news`
  switch. While that inline ask is open, the push card hides itself (no double ask), and it also hides once push is on.
- **No presence check on the route.** Remind me exists for players who are away (C1). The route still requires the signed-in
  profile's `users.venue_id` to equal the bar (C1's "open" switches the session to that bar's profile), so a player can only set
  reminders at bars they joined. This is a deliberate exception to the D8 rule ("every player write route presence-checks"). D8 covers
  game writes; the contract test pins that this route has no presence call.
- **Button state is remembered on the phone** (localStorage `htc:live-trivia-reminders:v1`, ≤20 future entries), so drawing Venue Home
  costs no request. A second "on" is ignored by the server (upsert `ignoreDuplicates`). Another phone of the same player shows
  "Remind me" until tapped (harmless).
- **Add to calendar = server-served `.ics`** (see the plain-English note). The calendar route is public. The same schedule id and
  start are already public via `/api/trivia/live/state`. Only `venueId`, `scheduleId` and `start` are read from the URL; every word
  in the file comes from the schedule and venue rows, so the link can't serve attacker text from our domain. The event has a 1-hour
  `VALARM`. Its UID is stable per game, so adding it twice updates the same event. In the app it opens via `openInSystemBrowser`.
  If that fails, it shows an error and **never** loads the file inside the web view (an iPhone has no way back from a raw file page).

### 4. Files and how they fit
- `supabase/migrations/20261109214742_push_game_reminder_optins.sql`: table `push_game_reminder_optins` (PK user_id+schedule_id+
  occurrence_date; FKs `users` and `trivia_schedules` ON DELETE CASCADE, so a cancelled game or a deleted player takes the rows;
  partial index on unclaimed rows per game; RLS forced; service_role only) + `claim_game_reminder_optins(uuid[], text[])` SECURITY
  DEFINER (arrays zipped, ≤200 games, revoke public/anon/authenticated, grant service_role).
- `lib/gameReminderOptIns.ts` (server-only): `saveGameReminderOptIn` (profile's venue check → `findUpcomingScheduleOccurrence` →
  upsert) and `removeGameReminderOptIn`. It is the only writer of the table (contract test).
- `app/api/push/game-reminders/route.ts`: POST `{venueId, scheduleId, startsAt, userId?}` → `{ok, occurrenceDate, startsAt}`; 403 for
  wrong venue or forged user, 409 for "no such game", 503 without `SESSION_SECRET`. DELETE `{scheduleId, occurrenceDate, userId?}`.
- `lib/liveShowdownEngine.ts` `findUpcomingScheduleOccurrence(venueId, scheduleId, startMs, nowMs)`: one `loadScheduleRows(venueId)`
  read, matching the occurrence start within ±1 min, future only.
- `lib/push/gameReminders.ts` `sendLiveGameStartPushes`: one `findStartingOccurrences(now, 60 min)` read. The ≤30-minute games go to
  `sendStartsSoonPushes` (unchanged logic); all games inside the hour go to `sendOptInReminderPushes` (RPC → FCM). Dead phones from
  both halves are disabled once. The report gains `optIn: {games, claimed, sent, failed, error?}`. The cron route is unchanged (it
  returns the report as before).
- `lib/liveTriviaCalendar.ts` (pure): `liveTriviaCalendarPath`, `venueCalendarLocation`, `buildLiveTriviaIcs` (RFC 5545 escaping,
  75-octet folding, CRLF). `app/api/trivia/live/calendar/route.ts` serves it (`s-maxage=300`; 404 when the game isn't on).
- `lib/liveTriviaReminders.ts` (client): copy, localStorage memory, `setGameReminder` / `clearGameReminder`.
- `components/venue/LiveTriviaReminderRow.tsx`: the two pills plus the inline consent. It is rendered by `VenueGamesPanel` inside the
  Live Trivia countdown card when the next game is upcoming (not live) and has a schedule id, with `key` = game.

### 5. Facts and traps
- `tests/push-notifications-contract.test.ts` requires `const path = venuePushPath(occurrence.venueId, "games");` to stay in
  `lib/push/gameReminders.ts`. Both senders use that exact line. Only `lib/nativePush.ts` may contain the string `"FirebaseMessaging"`,
  so components use `isPushAvailable()` (not `useHasNativeCapability("FirebaseMessaging")`).
- A global CSS rule (`button:not(:disabled)` → `font-weight: 600`) beats Tailwind's `font-black` on a `<button>`. Put bold text in a
  `<span>`, as the other Venue Home buttons do.
- The `react-hooks/set-state-in-effect` lint rule forbids resetting state in an effect: the row resets per game through its React `key`.
- `openInSystemBrowser` only accepts `https://` URLs. Against a local `http://localhost` server the app path falls back to the error
  message (expected locally).
- `/api/*` is public in `proxy.ts`, so Safari opening the calendar link without cookies works.
- In the push SQL proof, the `users` stub's ids 5–9 are used by later sections; C3 uses `id(10)` and `id(201)`.
- Browser recipe used (same as C1): `rsync -a` with anchored excludes (`/.env*`, `/.next`, `/node_modules`, `/.git`, `/native`,
  `/output`, `/assets`) to the scratchpad, `cp -Rc node_modules`, then `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9
  NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev --webpack -p 3101`. App mode is faked with an init-script `window.Capacitor`
  (`isNativePlatform`, `isPluginAvailable` for `FirebaseMessaging`/`HightopShell`, `nativePromise`). Script:
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/91f37f3f-bef1-43f5-9bc8-90b775025cbd/scratchpad/c3-browser.mjs`
  (`node c3-browser.mjs 350 app away` / `350 web here`). Only my PIDs were killed; port 3000 was not running.

### 6. Build / run / test
- `npx vitest run tests/api.push.game-reminders.test.ts tests/lib.live-trivia-calendar.test.ts tests/components.live-trivia-reminder.test.ts tests/lib.live-trivia-upcoming-occurrence.test.ts tests/lib.push.test.ts tests/push-notifications-contract.test.ts`
- `npm run test:push-sql` (PGlite): passes. It proves once-only claim, account + profile phones, switch ignored, dead phone excluded,
  other games/dates untouched, a phoneless opt-in still stamped, array guards, cascades and service_role-only grants.
- Full `npm run test`: 509 files passed, 1 skipped; 6,643 tests passed, 13 skipped. `npx tsc --noEmit` is clean outside `.next/`. eslint is
  clean on every C3 file.
- Browser (mocked, 350 px): app away shows "Remind me" + "Add to calendar". The tap with push off shows the consent once (the push
  card hides), Turn on → `POST /api/push/devices` then `POST /api/push/game-reminders` → "Reminder set" (filled). The website at the bar
  shows "Add to calendar" only. No horizontal scroll (`scrollWidth` 350).
- **Not verified:** a real push arriving 1 hour before (needs the migration applied + a real phone); iPhone Safari / Android Chrome
  adding the `.ics` from the app's link-out; `npm run build` (Phase R); concurrent sweep runs against real Postgres (row-lock behaviour
  is standard READ COMMITTED re-check, not provable in PGlite).

### 7. Open questions for Andrew
None new. Q1 (blocks B3), Q2 (lead time: default 1 hour stands, built as such), Q4 (revisit "you're near" after C3's opt-in numbers:
count rows in `push_game_reminder_optins` a few weeks after release) are still open. **Phase R needs his go-ahead to apply migration
`20261109214742`.**

### 8. Recommended first steps for Phase B1 (Opus 5.5, high effort)
1. Read the plan's B1 section and §4 ("No window = today's behaviour", window shape), plus the Pick 'Em plan's Standing rules.
2. Read `lib/venueGameSettings.ts`, `/api/owner/game-settings`, `submitPickEmPick` in `lib/pickem.ts`, the NFL Pick 'Em picks route
   and `/api/pickem/prize-tiebreaker` to choose table vs columns (keep the settings read to one query).
3. Write the pure `lib/pickemPickWindow.ts` with DST tests (`zonedDateTimeToUtcMs`) before touching enforcement. Write the migration
   with service_role grants; do **not** `supabase db push`.
