# Category Blitz — Schedule Change Fix Plan

## Diagnosis (validated ✅)

### Bug 1: Deleting a schedule leaves the game session running

[`deleteSchedule()`](lib/categoryBlitzSchedules.ts:144-152) sets `is_active = false` on the schedule row. It has no awareness of running game sessions. The existing auto session continues because:

- [`isStaleAutoSession()`](lib/categoryBlitz.ts:391-394) checks the session's original `scheduledEndAt` — still in the future → returns `false`
- [`isIdleAutoSession()`](lib/categoryBlitz.ts:403-408) requires 50 min of inactivity → returns `false`
- [`driveVenueCategoryBlitz()`](lib/categoryBlitz.ts:531) checks for an open schedule → `null` (schedule was deleted) → **no new rounds fire, session is stuck**
- Session only ends when original `scheduledEndAt` passes

### Bug 2: Editing the start time doesn't affect the running session

[`updateSchedule()`](lib/categoryBlitzSchedules.ts:117-141) only updates the schedule's DB row. The running auto session is completely unaffected:

- Session's `scheduledEndAt` still reflects the **original** window end
- Next round time is calculated from last round's `started_at` + `ROUND_INTERVAL_SECONDS` (10 min) [`lib/categoryBlitz.ts:538`](lib/categoryBlitz.ts:538)
- Changing the schedule's start time doesn't reset the intermission timer

### Safety confirmation

✅ Both [`deleteSchedule()`](lib/categoryBlitzSchedules.ts:144) and [`updateSchedule()`](lib/categoryBlitzSchedules.ts:117) are called ONLY from their API route handler in [`app/api/category-blitz/schedules/[id]/route.ts`](app/api/category-blitz/schedules/[id]/route.ts) — no other callers exist.

✅ [`endSession()`](lib/categoryBlitz.ts:661-678) broadcasts `session_ended` to all connected clients, so players see the game-over screen cleanly.

✅ [`closeStaleAutoSession()`](lib/categoryBlitz.ts:417-425) scores the active round before ending — no submissions lost. My new function will follow the same pattern.

✅ [`getActiveSession()`](lib/categoryBlitz.ts:343-354) returns sessions of any source (auto or manual). I will filter to `source === "auto"` only, so manual admin sessions are never ended by schedule changes.

---

## Phases

### Phase 1 — Add `endVenueAutoSession()` to [`lib/categoryBlitz.ts`](lib/categoryBlitz.ts)

**What:** A new exported function that ends any active auto session for a given venue, scoring the active round first.

**Why:** Shared building block for both DELETE and PATCH routes. Keeps the pattern in one place.

**Where:** Insert after [`closeStaleAutoSession()`](lib/categoryBlitz.ts:425) (around line 426).

**Logic:**
```
1. getActiveSession(venueId) — null? → no-op
2. session.source !== "auto"? → no-op (manual sessions untouched)
3. getLatestRound(session.id) — active? → scoreRound() first
4. endSession(session.id) — broadcasts session_ended to clients
```

**Safety:**
- `.catch()` on `scoreRound` so scoring failure never blocks session end
- Only touches auto sessions — manual sessions are never affected

> **Files changed:** 1 (`lib/categoryBlitz.ts`)

---

### Phase 2 — Update `deleteSchedule()` to return the venue ID

**What:** Modify [`deleteSchedule()`](lib/categoryBlitzSchedules.ts:144) to look up the schedule's `venue_id` before soft-deleting, and return it to the caller.

**Why:** The API route needs the venue ID to call `endVenueAutoSession()`. This can't be done from `categoryBlitzSchedules.ts` because it would create a circular import with `categoryBlitz.ts`.

**Change:** Return type changes from `Promise<void>` to `Promise<string | null>`. Fetch `venue_id` in a SELECT before the UPDATE.

> **Files changed:** 1 (`lib/categoryBlitzSchedules.ts`)

---

### Phase 3 — Update DELETE route to end sessions after deleting

**File:** [`app/api/category-blitz/schedules/[id]/route.ts`](app/api/category-blitz/schedules/[id]/route.ts)

**What:** After `deleteSchedule()` returns, call `endVenueAutoSession(venueId)` to end any running auto session.

**Why:** This is the fix for Bug 1 — deleting a schedule now immediately stops the running game instead of leaving players stranded.

**Change:** Import `endVenueAutoSession` from `categoryBlitz.ts`, use returned `venueId`.

> **Files changed:** 1 (`app/api/category-blitz/schedules/[id]/route.ts`)

---

### Phase 4 — Update PATCH route to end sessions after start-time change

**File:** [`app/api/category-blitz/schedules/[id]/route.ts`](app/api/category-blitz/schedules/[id]/route.ts)

**What:** After `updateSchedule()` completes, compare the old `startTime` with the new one. If they differ, call `endVenueAutoSession(venueId)` so the next client poll creates a fresh session from the updated schedule.

**Why:** This is the fix for Bug 2 — changing the start time now causes the game to restart from a fresh lobby/round cycle instead of continuing on the old cadence.

**Only when start time changes:** If the admin only changes the title or timezone, the session is NOT ended — no unnecessary disruption.

**Change:** Fetch the current schedule before updating, compare `startTime`, conditionally end session.

> **Files changed:** 1 (`app/api/category-blitz/schedules/[id]/route.ts`)

---

### No changes needed

- **Cron engine** (`runCategoryBlitzEngine`, [`lib/categoryBlitz.ts:1297`](lib/categoryBlitz.ts:1297)) — already handles ending stale sessions correctly. After an API route ends the session, the cron's next tick simply won't find anything to close.
- **Admin UI** (`CategoryBlitzSection.tsx`) — the existing "Live session" panel already shows the session status and refreshes on 15s poll. After the API call succeeds, the next poll shows the ended state. No UI changes needed.
- **Types** — no new types needed; `CategoryBlitzSession` and `CategoryBlitzSchedule` already have everything required.

---

## Risk assessment

| Risk | Mitigation |
|---|---|
| Ending session mid-round loses submissions | `endVenueAutoSession` scores active round first |
| Manual sessions accidentally ended | Filter: `session.source !== "auto"` → no-op |
| Circular import between modules | API route handles both concerns; no cross-import needed |
| PATCH title-only change ends session needlessly | Only end session when `startTime` actually changes |
| Race: cron + API both try to end same session | `endSession` is idempotent; DB update on completed session is a no-op |
