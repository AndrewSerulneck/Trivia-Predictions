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


---

## Standing rules (moved from CLAUDE.md, 2026-11-03)

> These rules were in the project `CLAUDE.md` until 2026-11-03 and still apply. CLAUDE.md now keeps a
> one-line pointer here. Keep this section current when the feature changes.

### Category Blitz Source of Truth
- **The game is LETTER-FIRST.** A round picks one usable letter, then draws 12 categories at random from that letter's vetted pool — so boards are freshly assembled every round and every category is guaranteed several common answers for the called letter (no single-answer traps like "P" for "A US state").
- **The pool is canonical: `data/category-blitz/category-pool.json`.** This is the library of all categories. To add categories, append them here (a `theme` tag is an optional legacy field, not used by the letter-first build). Only ADD to the pool; keep existing good categories.
- **`data/category-blitz/category-letter-index.json` is GENERATED, not hand-edited.** It is built from the pool by `npm run category-blitz:build` (`scripts/build-category-blitz-letter-index.cjs`), which asks the model, per category, which letters have an ABUNDANCE of common answers (≥3, `--threshold`), then inverts that into `letters[L] → [categories]` plus `usableLetters` (letters with ≥12 categories). After editing the pool, re-run the build. A cache (`data/category-blitz/letter-cache-abundant.json`) means only new categories are billed to the model.
- **Always follow `data/category-blitz/CATEGORY_TEST.md` when writing or evaluating categories:** Every category must pass BOTH the Is-A gate (objective, definitional) and the Letter-Coverage gate (broad). That file contains the canonical generation prompt — reuse it rather than re-deriving the rules.
- **The abundance bar is model-derived, never hand-authored.** Don't hand-edit `category-letter-index.json` or the cache; re-run `npm run category-blitz:build` (add `--dry-run` to preview per-letter counts without writing).
- **Continuous mode is the universal default, flag-gated (`NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT`).** When on, every venue runs an endless randomized continuous loop with zero admin setup — no schedule, no start/end time, no "number of rounds." A `category_blitz_continuous_config` row is an optional **per-venue override** (custom pacing/pool, or `is_active = false` to explicitly opt a venue back onto the scheduled engine); "no row" now means "on with global defaults." The flag follows the same reversible convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`: off = today's legacy scheduled behavior, fully inert. Resolver: `resolveContinuousConfig` in `lib/categoryBlitzPool.ts`; the scheduled engine (`driveVenueCategoryBlitz` / `runCategoryBlitzEngine`) stands down for any continuous venue via `standDownScheduledIfContinuous`. **The game sleeps when idle (2026-10-14):** a continuous round starts ONLY from `driveContinuousCategoryBlitz`, reached only via the game page's `GET /api/category-blitz/sessions` (no `peek`). Venue home, the admin panel and the TV only peek (`peek=1` / `peekCategoryBlitz`, never create or start anything); cron `/api/cron/category-blitz-continuous` only scores expired rounds. Tripwire: `tests/category-blitz-sleep-contract.test.ts`; plan `docs/category-blitz-how-to-play-plan.md` Phase 5. Full plan: `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md`.
- **Category Blitz cadence, bonus and rules (2026-10-14/15, `docs/category-blitz-how-to-play-plan.md`).** Majority Rules is exactly every 5th round of a session: `isReverseRound` in `lib/categoryBlitzModes.ts` (never random; the admin mode-selection control is hidden); continuous MR rounds draw from the Blend-In index. The alliteration bonus (+1, both modes, only on an answer that already scores, 2+ words all starting with the letter) lives only in `lib/categoryBlitzAlliteration.ts`. The tutorial cards and the "How to play" rules list have ONE source, `lib/categoryBlitzHowToPlay.ts` — edit copy there, not in components. The game only runs while a player has it open; venue home and the TV only peek (see the sleep rule above).
- **Global room pooling exists, flag-gated off (`NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`).** When on, every venue's Category Blitz gameplay collapses onto one shared hidden room (`hc-cbz-live`, `venues.hidden = true`, never appears in any venue list) so sparse venues clear the 3-player/2-player scoring gate. Off = today's per-venue isolation, fully inert — same reversible convention as the flags above. Single indirection point: `resolveCategoryBlitzRoomId` in `lib/categoryBlitzShared.ts`, applied ONLY at gameplay boundaries (never venue join/geofencing/`users.venue_id`). Concealed from the frontend two ways: API responses remap `session.venueId` back to the caller's real venue, and the realtime channel name is hashed (`categoryBlitzChannelName`) so the raw room/venue id never reaches the client. Per-venue challenge-campaign points still attribute correctly under pooling (read from each submission's own `venue_id`, not the pooled room's). Full plan + cutover runbook: `docs/category-blitz-global-room-plan.md`.
