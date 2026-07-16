# Category Blitz: Make Continuous Mode the Universal Default

**Date:** 2026-07-15
**Status:** Phases 1–5 implemented in the working tree; Phase 6 verification underway. Migration files written but NOT yet applied to the DB (blocked by the unrelated broken NFL migration `20260715000200` — apply `20260715120000_deactivate_category_blitz_schedules.sql` in isolation, same as the continuous-mode migrations).
**Goal:** Category Blitz runs on an endless randomized loop at every venue with zero admin setup. Retire the scheduling flow (start/end time, "number of rounds") for Category Blitz entirely.

---

## Context

Continuous mode (endless randomized rounds, no schedule) was built and verified in the prior session — see `docs/CATEGORY_BLITZ_CONTINUOUS_MODE_HANDOFF.md` and the memory `project_category_blitz_continuous_mode`. It currently works, but is **per-venue opt-in**: a venue only runs continuous mode if an admin creates an active row in `category_blitz_continuous_config`. Every other venue still uses the legacy **scheduled** engine (`category_blitz_schedules` → start/end time windows), which is what's prompting "number of rounds" on `/owner/schedule` (`app/owner/schedule/page.tsx:321`, `useState(3)`).

**What we want:** flip the default so continuous is what every venue gets automatically, with no admin action required, and stop asking for a round count anywhere in the Category Blitz admin flow.

### Key design points
- The on-demand path already lazily creates + drives a continuous session the moment a player opens the game (`driveContinuousCategoryBlitz` from the sessions GET route). Defaulting every venue to "on" does **not** mean spawning sessions at N venues — it costs nothing until someone actually opens the game there.
- Roll out behind an env flag, matching the existing repo convention (`NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` in `lib/domainSplit.ts`), so this is reversible during rollout.
- Keep `category_blitz_continuous_config` rows as **optional overrides** (custom pace, or an explicit off-switch for a venue) rather than deleting the table — just change what "no row" means (currently "off", should become "on with global defaults").

### Three defaults assumed (confirm or correct before/while implementing)
1. Per-venue override rows still work; absence of a row = on with global defaults.
2. Scheduled-mode code stays in the codebase but dormant behind the flag (not deleted) for rollback safety; deleted later once confidence is high.
3. Existing `category_blitz_schedules` rows get deactivated as part of rollout, not deleted.

---

## Phases

### Phase 1 — Default-on resolver (critical path)
**Model:** Opus 4.8 · **Effort:** Medium

- Add `resolveContinuousConfig(venueId)` in `lib/categoryBlitzPool.ts`: returns the venue's override row if present and `is_active`, otherwise a **global default config** (active, with sane default round/intermission timing and a default category pool = all categories).
- Add global default constants + env flag `NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT` (or similar) gating whether "no row = on" is in effect.
- Repoint every current call site of `getContinuousConfig` to the new resolver:
  - `app/api/category-blitz/sessions/route.ts`
  - `lib/venueScreen.ts` (`getCategoryBlitzInput`)
  - `lib/categoryBlitz.ts` (`driveContinuousCategoryBlitz`, `startContinuousRound` config lookups)
- This phase alone makes continuous mode the default everywhere the flag is on — everything after is scaling/cleanup/UI.

### Phase 2 — Cron scaling
**Model:** Sonnet 5 · **Effort:** Low–Medium

- `runContinuousCategoryBlitzEngine` currently iterates `category_blitz_continuous_config` rows with `is_active = true` to find venues to drive. Once "no row" also means active, this needs to instead iterate venues that **already have an open continuous session** (`status in (lobby, active, scoring)`), so:
  - Rounds keep advancing via cron even when the current viewer's tab closes mid-round.
  - We never touch venues that have never been opened (no session exists yet) — avoids a full-venue-table sweep every minute.

### Phase 3 — Retire the Category Blitz scheduling UI
**Model:** Sonnet 5 · **Effort:** Medium

- Remove the Category Blitz option from `/owner/schedule` (`app/owner/schedule/page.tsx`) — leave Live Trivia/Pick'em/Bingo scheduling untouched, since those remain schedule-based.
- Remove/retire the Category Blitz section of the admin schedules UI (`components/admin/sections/SchedulesSection.tsx`, `components/admin/sections/CategoryBlitzSection.tsx` as applicable).
- This is the change that makes the "number of rounds" prompt disappear for Category Blitz.
- Decide what (if anything) replaces it in the admin UI — likely just the existing `CategoryBlitzContinuousSettings` / `/owner/category-blitz` page for the optional per-venue override, now framed as "customize pacing" rather than "enable continuous mode."

### Phase 4 — Neutralize the scheduled engine
**Model:** Opus 4.8 · **Effort:** Medium

- Behind the flag, make `driveVenueCategoryBlitz` / `runCategoryBlitzEngine` no-op for Category Blitz (or skip venues entirely) so the legacy scheduled engine can never create a competing session.
- Cleanly retire any currently-live scheduled sessions/schedules on flag flip so the two engines never end up racing for the same venue mid-transition.
- This is the correctness-sensitive phase — same class of risk as the Blocker A/B fixes from the continuous-mode build (session precedence, no double-driving).

### Phase 5 — Data migration + rollout
**Model:** Sonnet 5 · **Effort:** Low

- New migration: deactivate existing `category_blitz_schedules` rows (don't delete — historical reference).
- Document the new env flag in `CLAUDE.md` / `SYSTEM_CONTEXT.md` alongside the existing domain-split flag pattern.
- Apply migrations — note: as of the last session, `supabase db push` is still blocked by an unrelated broken NFL Pick'em migration (`20260715000200`, bad `advertisements.ads_page_key_valid` constraint). Either fix that first or apply this migration in isolation the same way the continuous-mode migrations were applied.

### Phase 6 — Verify
**Model:** Opus 4.8 · **Effort:** Medium

- tsc + full test suite.
- Browser verification: confirm a venue with **no** continuous_config row opens straight into a live continuous round with the ∞ badge; confirm rounds loop with default timing; confirm the scheduling UI no longer offers Category Blitz; confirm no venue can end up with both a scheduled and continuous session racing.

---

## Rollout note

Total is roughly a day of focused work. Phase 1 is the critical path — once it ships, continuous is the default everywhere the flag is on. Phases 4 and 6 carry the most correctness risk (session precedence, avoiding double-driving) and are assigned to Opus 4.8 accordingly; the rest is comparatively mechanical UI/cron work suited to Sonnet 5.
