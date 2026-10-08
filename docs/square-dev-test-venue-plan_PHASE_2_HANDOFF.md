# Square dev testing — Phase 2 handoff (hidden test venue)

Date: 2026-10-07. Plan: `docs/square-dev-test-venue-plan.md`. Phase 2 done by Claude Sonnet 5.5 (medium).
Next: Phase 3 (first sandbox run + docs).

## For Andrew (plain English)

**What changed:** a hidden venue called **Hightop Test Bar** now exists and is attached to your partner
account. It copies Pacific Street's address, map position and time zone (Brooklyn), so the dashboard
behaves normally. Players never see it in the join list.

**Is it live?** It is in the shared database, so it exists for both dev and the live site immediately.
No code changed; nothing was committed in this phase except these notes. Pacific Street is untouched
(still visible, Square still connected).

**Checked:** your partner dashboard's venue list now returns both Pacific Street and Hightop Test Bar;
the public join list (11 venues) does not include the test venue.

**What's left:** Phase 3 — you connect Square's *sandbox* to the test venue on the dev server and try a
gift-card prize and a menu-item prize. **Needs you:** the browser steps in the plan's Phase 3.

---

## For the next agent (Phase 3)

### 1. Goal and scope
Phase 3 per `docs/square-dev-test-venue-plan.md`: Andrew connects sandbox Square to `venue-hightop-test`
on the dev server; test a gift-card prize and a $-off menu prize end to end; confirm (after Phase 1 is
deployed) the live site shows the live-site message and no nudge; add the "Testing Square on the dev
server" section to `docs/square-go-live-runbook.md` and the one-line note to the POS section of
`CLAUDE.md`. **Model/effort:** Sonnet 5.5, low–medium. **Out of scope:** code changes, Clover, touching
Pacific Street's connection, push/deploy (Andrew's call).

### 2. Starting state
- Branch `main`, last code commit `71d77f1` (Phase 1 guard), not pushed/deployed as of this phase. This
  phase's only repo changes: this note + the plan status line (check `git log -2` / `git status`).
- DB writes made in Phase 2 (live Supabase `pkmxupsayzshvpirkaav`), via a throwaway script (deleted):
  - `venues` row `id = 'venue-hightop-test'`, name/display_name "Hightop Test Bar", `hidden = true`,
    `self_serve_created_at / checkout_started_at / rehidden_at` all NULL, coords/address/street/city/
    zip/county/state/region/radius(200)/`timezone = 'America/New_York'` copied from Pacific Street
    (40.6792177, -73.9598588). Not (0,0). No screen branding copied.
  - `venue_owner_venues` row `id = '8f3a5026-a822-4a28-9c6b-c7b120bd0845'`, `owner_id =
    '64f046ff-a44f-47b4-acc1-94ff30288920'`, `venue_id = 'venue-hightop-test'`.
- No `pos_connections` row exists for the test venue yet. The only non-revoked one in the DB is Pacific
  Street's production row — **do not touch**.

### 3. Decisions
- Andrew approved the defaults (name, id, Pacific Street's location) on 2026-10-07 — don't re-ask.
- **No `billing_subscriptions` row** was created and none is needed: grep of `app/api/owner`, `app/owner`,
  `lib/requireOwnerAuth.ts`, `lib/ownerVenueList.ts`, `lib/ownerSchedule.ts`, `lib/ownerCompetitions.ts`,
  `lib/rewards.ts` found billing referenced only in `app/api/owner/billing/*`. The dashboard, schedule and
  Rewards don't gate on it. (Not tested in a browser; if Rewards creation fails for the test venue on a
  billing reason, stop and ask — never insert a fake subscription.)
- `self_serve_created_at` is deliberately NULL: keeps it out of the signup sweep and lapsed-venue
  reconciler; it shows as "admin-hidden" in the admin Hidden venues panel.

### 4. Undo (exact statements, run in this order)
```sql
delete from venue_owner_venues where id = '8f3a5026-a822-4a28-9c6b-c7b120bd0845';
delete from venues where id = 'venue-hightop-test';
```
If Phase 3 has added rewards/wins/pos_connections for the venue, delete those first (they reference the
venue id) — and for a sandbox `pos_connections` row use the app's Disconnect, not raw SQL.

### 5. Facts and traps
- Dev and live share one database; the test venue is visible to the live site's owner dashboard too (hidden
  only from the player join list). Once Phase 1 is deployed, live shows its sandbox row with the "Test
  connection from the dev server." message.
- Hidden venues aren't in the join list: open the venue by direct URL; God Mode accounts bypass the geofence
  (server-authoritative in `/api/join/profile`).
- Owner session for headless checks: cookie `tp_owner_sess` = `base64url(JSON{ownerId})` + `.` +
  HMAC-SHA256(SESSION_SECRET) base64url (see `scripts/measure-owner-load.cjs`). Never print it.
  `node --env-file=.env.local script.cjs` works for DB scripts; `.env.local` name listing may be denied.
- Square sandbox consent page is a blank white screen unless the browser is first signed into the Square
  Sandbox test account via Developer Console → Open in Square Dashboard (plan Phase 3 step 1).
- Gift card numbers (GAN) are never logged/stored.

### 6. Verification done
- Script: Pacific Street row unchanged (`hidden=false`); owner now has links to both venues.
- `GET http://localhost:3000/api/owner/venues` with the owner cookie → 200, returns
  `venue-pacific-street` and `venue-hightop-test`.
- `hidden.is.null,hidden.eq.false` filter (same as `listVenues()`) returns 11 venues, none the test venue.
- **Not verified:** the dashboard UI switcher in a browser; the Point of Sale sheet for the test venue
  (should show a normal "Connect Square" state, since no row exists).

### 7. Open questions for Andrew
- Push/deploy Phase 1? (Phase 3 step 3 needs it.)

### 8. Recommended first steps
1. `git log -3`; confirm dev server on :3000 (don't kill it); confirm the venue still exists.
2. Walk Andrew through Phase 3 step 1; he does the browser parts.
3. Ask before seeding any win for his God Mode player; delete it afterwards.
4. Write the docs lines last, once the run has actually worked.
