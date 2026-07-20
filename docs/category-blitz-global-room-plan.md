# Category Blitz Global Room — Plan & Cutover Runbook

**Purpose:** pool every venue's Category Blitz gameplay into one shared hidden room so sparse venues have enough concurrent players to actually score (standard rounds need 3+, reverse rounds need 2+ — see `minPlayersToScore` in `lib/categoryBlitz.ts`), without breaking geofencing, without revealing to players that venues share a room, and while staying instantly reversible back to per-venue isolation.

**Status when this was written:** Phases 0–4 shipped and verified (in-process integration test + real-browser check). The flag is **OFF** — nothing is live. Phases 5 (this doc) and 6 (a `scoreRound` DB-mock regression harness) are the only work left, and neither blocks going live.

---

## 0. Mental model (read first)

- **There is ONE switch:** `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`. Off (default) = today's per-venue-isolated behavior, byte-for-byte — pinned by `tests/lib.category-blitz-shared.test.ts`'s "flag off (unset): identity" case. On = every venue's gameplay collapses onto one hidden room, `hc-cbz-live`.
- **The single indirection point is `resolveCategoryBlitzRoomId(venueId)`** in `lib/categoryBlitzShared.ts`. It is applied ONLY at Category Blitz gameplay boundaries — never near venue join, geofencing, or a user's `users.venue_id` membership, which have no notion of "room" at all and are structurally untouched by this feature.
- **Concealment has two layers**, both server-side:
  1. Every sessions API response remaps `session.venueId` back to the caller's real venue before returning (`app/api/category-blitz/sessions/route.ts`), so the payload never says `hc-cbz-live`.
  2. The realtime channel name is FNV-1a **hashed** (`categoryBlitzChannelName` in `lib/categoryBlitzShared.ts`), so even the one string that does reach the client as a literal identifier can't be reversed back to a venue or room id.
- **Points stay correct under pooling.** `users.points` is already global (not venue-scoped), so nothing changes there. Per-venue **challenge-campaign** progress is venue-scoped — Phase 3 fixed `scoreRound` to attribute each player's campaign points to *their own* venue (read from their submission's `venue_id`, captured at submit time from the real page they're on) rather than the pooled room's venue.
- **Reversal is always instant:** set the flag back to `false` and redeploy. No data migration, no code revert. The hidden room's session/rounds simply stop being driven (see §4).

---

## 1. What's pooled vs. what stays real (contract)

Defined by everywhere `resolveCategoryBlitzRoomId` is (and is NOT) called:

**Pooled when the flag is on** (room id substituted for venue id):
- `app/api/category-blitz/sessions/route.ts` — GET (session drive/read + presence registration) and POST (manual admin session creation).
- `lib/venueScreen.ts`'s `getCategoryBlitzInput` — the venue TV display reads the same pooled game so phones and the TV agree.

**Always real, never pooled** (no call to the resolver anywhere near these):
- Venue join, geofencing, `/api/join/profile`, `listVenues()` (`lib/venues.ts`) — no "room" concept exists in this code at all.
- A player's own `users.venue_id` — a player still belongs to their real venue.
- `category_blitz_submissions.venue_id` — set from the client's own page venue at submit time (`components/category-blitz/CategoryBlitzGame.tsx`'s `submitAnswers` → `POST /rounds/[id]/submit` → `submitAnswer`). This is what makes Phase 3's per-venue challenge-campaign attribution possible — the submission always knows the player's real venue even though the round it belongs to is the pooled room's round.
- `category_blitz_session_participants.venue_id` — deliberately written as the **room** id under pooling (`registerSessionPresence` is called with `venueId: roomId`), because this table's only consumer is the `participantCount` scoring gate, which is exactly what pooling exists to fix.

---

## 2. The hidden room (already provisioned, Phase 0)

Migration `supabase/migrations/20260719120000_category_blitz_global_room_venue.sql` (**applied**):

- Adds `venues.hidden boolean not null default false`.
- Seeds venue row `hc-cbz-live` (`hidden = true`) — this id is deliberately opaque (not `"global-room"` or similar) so that even if it somehow leaked, it wouldn't announce what it is.
- Seeds a `category_blitz_continuous_config` row for `hc-cbz-live` (`is_active = true`, 180s round / 180s intermission) so the room runs its own endless loop independent of `NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT`.

`lib/venues.ts`'s `listVenues()` filters `.or("hidden.is.null,hidden.eq.false")`, so `hc-cbz-live` can never appear in any venue picker, join flow, or geofenced list — confirmed live: `curl`-ing the sessions endpoint and inspecting `listVenues()` output both come back clean. `getVenueById` is intentionally NOT filtered (internal FK lookups still need it), but nothing player-facing calls `getVenueById("hc-cbz-live")`.

---

## 3. Verification already done (Phase 4)

Two verification passes, both against the real DB and real code — see conversation history for full output, summarized here:

1. **In-process integration** (real `sessions/route.ts` GET handler + real `lib/categoryBlitz.ts` engine functions + real Supabase, flag toggled via `process.env` since it's read at call time): 15/15 assertions passed both flag states — same pooled session/round across two different venues, 3rd-party player pooling clears the scoring gate, concealment remap confirmed, no `hc-cbz-live`/`global` substring anywhere in response payloads, and flag-off reversal produces fully separate sessions again.
2. **Real browser** (Chromium via Playwright, cookies signed with `scripts/print-test-auth-cookies.cjs`, against a live `next dev` on :3000, flag off): page loads past the auth gate, client calls `/api/category-blitz/sessions`, receives a hashed `realtimeChannel`, no leak in payload or rendered DOM. The one console error observed (`403` on `/api/venue-presence/heartbeat`) is the pre-existing geofence presence heartbeat rejecting a test user with no real geolocation — unrelated to this feature.

All seeded test data (venues, users, sessions) was torn down after each run; the DB was left in its pre-verification state.

**Not yet covered by an automated regression test:** the Phase 3 `scoreRound` per-submission venue attribution fix (no existing test harness mocks `scoreRound`'s submissions/users/LLM-validation DB calls). This is Phase 6, tracked separately — it does not block going live, since Phase 4's manual verification and the code's own reasoning (grouping by `sub.venue_id`, a column no other code touches) both check out.

---

## 4. Cutover (flip the room ON)

1. Confirm the Phase 0 migration is applied (§2) — it already is as of this writing.
2. Set `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM=true` and redeploy (or set locally in `.env.local` for a dev-server test — never commit it there).
3. **Smoke test** (mirrors the Phase 4 verification, now against the live flag):
   - Two players at two different real venues both see the same round (same letter, same 12 categories, same countdown).
   - `playerCount` / the invite-banner "Playing with N friends" reflects players from *both* venues.
   - A round with 3+ pooled players (mixed across venues) scores real points instead of "insufficient_players".
   - Network tab: the sessions response's `session.venueId` is each caller's *own* venue, never `hc-cbz-live`; `realtimeChannel` is a short hashed string, not a recognizable venue/room id.
   - Venue TV screens at two different venues show the same board.
   - A player's points still land in the right per-venue challenge-campaign progress (if any active campaigns are running) — check `applyChallengeCampaignPoints` was called with their real venue, not the room's.
4. **If anything is off:** set `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM=false` and redeploy — instantly back to per-venue isolation, verified in Phase 4 to fully reverse (separate sessions resume immediately on the next poll/cron tick). No data cleanup is required: the hidden room's session simply stops being driven and ages out like any other session once nothing polls it.

---

## 5. When to flip it back off

The whole point of this feature is temporary: once individual venues have enough concurrent players on their own to clear the 3-player (standard) / 2-player (reverse) scoring gate, pooling is no longer needed and narrows the experience back to being venue-local (which is the intended long-term design once volume supports it). Flip `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM=false` and redeploy — see §4 step 4, this is the same one-flag reversal, no different whether done a day or a year after cutover.

---

## 6. Related work

- Phase 6 (tracked, not blocking): build a `scoreRound` DB-mock test harness and pin the Phase 3 per-submission venue-attribution fix as an automated regression test.
- The room reuses the continuous-mode engine (`docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md`, memory `project_category_blitz_continuous_mode`) — it is simply one more continuous-mode venue from the engine's point of view, just one that every player is quietly routed into.
