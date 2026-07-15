# NFL Pick 'Em — Phase 1 Validation & Findings

> **Status:** Phase 1 (Architecture) complete. This document records what was *verified against the live codebase* on 2026-07-14, corrects claims in `NFL_PICKEM_PHASE1_ARCHITECTURE.md` that no longer match reality, and surfaces one decision that must be made before Phase 2.

## ✅ Resolved decisions (2026-07-14)
1. **Structure → separate `/nfl-pickem` silo (plan Option B).** Rationale from product owner: NFL Pick 'Em may become the *replacement* for the legacy unified Pick 'Em, which could then be retired. So the silo is not throwaway duplication — it's the candidate successor. Build the parallel route/components/lib/API per the plan's §1.7, but **share the `pickem_picks` table and `settlePendingPickEmPicks()`** (Decision 1 still holds — one pick table, one settlement path).
2. **Lock → per-game at kickoff.** Each game locks at its own start time via the existing `isPickLocked` semantics. **No `nfl_pickem_weeks` table is required for lock times** — weeks and locks are derived on the fly.

**Net effect on scope:** Phase 2 (database) is effectively a **no-op** — `pickem_picks` already allows `'nfl'` and per-game locking needs no new tables. `nfl_pickem_user_weeks` (weekly stats, FR-11) stays **deferred** (P1). The real work is Phase 3 (silo lib + API that fixes the week-range bug) and Phase 4 (silo components).

---

## How to read this
The original `NFL_PICKEM_PHASE1_ARCHITECTURE.md` was written before (or independently of) the current state of `lib/pickem.ts`. Several of its "NEW feature / No existing support" assessments are stale: **NFL is already wired into unified Pick 'Em as a sport slug with a working week selector.** This changes the scope of Phases 2–7 significantly. The findings below are the source of truth going forward.

---

## 1. Verified claims (plan was correct)

| Plan claim | Verified location | Result |
|---|---|---|
| `nfl` is a declared `PickEmSportSlug` | `lib/pickem.ts:7` | ✅ Correct |
| NFL sport entry has `isInSeason: false`, `isClickable: false` | `lib/pickem.ts:299–304` | ✅ Correct (gated off) |
| BDL NFL path mapping exists | `lib/pickem.ts:228–229` (`americanfootball_nfl` **and** `nfl` → `/nfl/v1/games`) | ✅ Correct |
| `pickem_picks` table exists and `sport_slug` allows `'nfl'` | `supabase/migrations/20260427113000_add_pickem_tables.sql` + constraint now `('nba','mlb','nhl','soccer','nfl','mma','tennis')` after `20260514123000` / `20260524113000` | ✅ Correct — **no schema change needed for NFL** |
| `/api/pickem/games` accepts `weekStartDate` | `app/api/pickem/games/route.ts:9,21` | ✅ Correct |
| `/api/pickem/picks` accepts `weekStartDate` | `app/api/pickem/picks/route.ts:105,158` | ✅ Correct |
| Component holds `nflWeekStartDate` state | `components/pickem/PickEmGameList.tsx:208` | ✅ Correct |

**Note on the schema doc:** the plan's Phase 1 quotes `pickem_picks` with an *inline* `CHECK` listing all 7 sports. The real migration declares `sport_slug text not null` and adds the check as a **named constraint** that was widened over three separate migrations. Functionally identical result; Phase 2 must not "recreate" the inline version.

---

## 2. Corrected claims (plan is stale — NFL is MORE built than stated)

The plan repeatedly labels the weekly model "No — new feature" / "Partial." In reality `listPickEmGames` already implements an NFL weekly path (`lib/pickem.ts:1725–1785`):

- Fetches NFL events across a **±horizon** (`-7d` to `+140d`) — `lib/pickem.ts:1729–1736`.
- Buckets every game into a **Thursday-anchored week** via `daysSinceThursday = (day - 4 + 7) % 7` — `lib/pickem.ts:1744–1754`.
- Produces `weekOptions` (labeled `Week N (Mon D - Mon D)`) and `selectedWeekStartDate`, honoring a requested `weekStartDate` or falling back to the next future week — `lib/pickem.ts:1757–1783`.
- The component **already renders a "NFL Week:" `<select>`** driven by these options — `components/pickem/PickEmGameList.tsx:1025–1046`, and passes the chosen week to both games (`:374–375`) and picks (`:587`) requests.

**Implication:** FR-1/FR-2/FR-3/FR-4 (display a week, navigate weeks, default to current week, past weeks) are **partially implemented already**, not greenfield. The remaining work is *fixing and enabling* this path, not building a parallel one.

---

## 3. 🔴 Confirmed bug in the existing weekly path (blocks FR-1)

`listPickEmGames` selects a full 7-day week range for the BDL fetch (`fromIso`/`toIso`, `lib/pickem.ts:1779–1780`) **but then collapses `date` to the single week-start Thursday** (`date = startIso.slice(0, 10)`, `:1781`). Downstream, every fetched event is filtered against that single day:

```ts
// lib/pickem.ts:1802–1805
const localDateKey = toLocalDateKey(event.startsAt, tzOffsetMinutes);
if (localDateKey !== date) {   // date === the Thursday week-start
  continue;
}
```

**Effect:** only **Thursday** games survive; Sunday/Monday games in the same NFL week are discarded. The "week" view is really a "Thursday" view. This must be fixed in Phase 3/5 (filter by the `fromIso..toIso` range for NFL instead of by a single `date` key). This is the concrete root cause behind the plan's vague "Partial" rating for FR-1/FR-4.

---

## 4. 🟠 Lock semantics: plan contradicts existing behavior (decision needed)

- **Plan (FR-5, Decision 3):** the *whole week* locks at the **first Thursday Night Football kickoff**; requires storing a `thursday_kickoff` lock time (motivates the proposed `nfl_pickem_weeks` table).
- **Existing behavior:** `isPickLocked(startsAt)` locks **each game individually at its own kickoff** (`lib/pickem.ts:1627–1633`, `PICKEM_LOCK_GRACE_MS = 0` at `:246`). A Sunday game stays pickable until Sunday, even after Thursday's game starts.

These are different products. Per-game locking is arguably *better* (you can still pick Sunday games after TNF), and it's already built and battle-tested. Whole-week Thursday-lock is the classic "survivor/confidence pool" model and matches the plan's copy ("Picks lock at Thursday Night Football kickoff"). **This choice determines whether we need the `nfl_pickem_weeks` table at all** (see §5).

---

## 5. 🟠 Architecture fork: extend-in-place vs. separate `/nfl-pickem` silo

This is the single most important Phase 1 decision, and the plan is **internally inconsistent** about it:

- **Decision 1** chose "Extend Existing Pick 'Em" (reuse `pickem_picks`, reuse settlement) — ✅ and NFL *already lives inside* unified Pick 'Em as a sport tab.
- **Decision 4 + §1.5.2 + §1.7**, however, prescribe a **fully parallel silo**: new `/nfl-pickem` route, new `app/api/nfl-pickem/*` routes, new `components/nfl-pickem/*` (5 components), a new `nfl-pickem` `VenueGameKey`/venue card, and new `lib/nflPickEm.ts` + `lib/nflWeekUtils.ts`.

None of the silo exists today (verified: `app/nfl-pickem`, `app/api/nfl-pickem`, `components/nfl-pickem`, `lib/nflPickEm.ts`, `lib/nflWeekUtils.ts` are all absent). Building it would **duplicate ~80% of `lib/pickem.ts` and `PickEmGameList.tsx`** and create two divergent pick code paths over the same table — directly at odds with Decision 1's stated rationale ("single source of truth," "less maintenance").

`VenueGameKey` today is `"speed-trivia" | "live_trivia" | "pickem" | "bingo" | "fantasy" | "category-blitz"` (`lib/venueGameCards.ts:1`); `VENUE_HOME_GAME_KEYS` does not include `nfl-pickem` (`:223`). NFL is currently a *sport within* the existing `pickem` card, not its own game.

### Recommended path (Option A — extend in place)
Enable and finish the NFL weekly path that already exists, rather than forking:
1. Flip `isInSeason`/`isClickable` to `true` for the NFL sport entry (`lib/pickem.ts:302–303`). Note `getSportKeysForSlug` throws when `!isClickable` (`:747`), so this flip is the actual "on switch."
2. Fix the single-day filter bug (§3) so a full week renders.
3. Decide lock semantics (§4). If we keep **per-game** locking, **the proposed `nfl_pickem_weeks` table is unnecessary** — weeks and locks are derived on the fly and already work. Only the whole-week Thursday-lock model needs stored lock times.
4. Add week-navigation polish (prev/next, "current week" default, past-week results) to the existing selector.

This deletes most of Phases 2 and 4 (no new migrations, no new component tree) and concentrates effort on Phases 3/5 (fix + enable).

### Alternative (Option B — separate silo)
Follow the plan's §1.7 file structure verbatim. Higher cost, duplicated logic, two settlement paths. Only justified if NFL Pick 'Em must diverge substantially from unified Pick 'Em in UX (e.g., a dedicated season-long standings surface) that would bloat the shared component.

---

## 6. Corrected file-structure impact (vs. plan §1.7)

| Plan proposes | Reality / recommendation |
|---|---|
| `lib/nflPickEm.ts` (NEW) | Not needed under Option A — NFL logic lives in `lib/pickem.ts:1725–1785`. |
| `lib/nflWeekUtils.ts` (NEW) | Week bucketing already inline; extract to a small helper only if reused. |
| `app/nfl-pickem/*`, `app/api/nfl-pickem/*` | Not needed under Option A — `/pickem` + `/api/pickem/*` already accept `weekStartDate`. |
| `components/nfl-pickem/*` (5 files) | Not needed under Option A — `PickEmGameList.tsx` already renders the NFL week selector. |
| `20260715000000_add_nfl_pickem_weeks.sql` | Needed **only** if we adopt whole-week Thursday-lock (§4). Skip under per-game locking. |
| `20260715000100_add_nfl_pickem_user_weeks.sql` | Deferred — only for FR-11 (weekly stats), a P1. Follows `SECURE_TABLE_MIGRATION_CHECKLIST.md` if built. |
| `lib/venueGameCards.ts` add `nfl-pickem` key | Only under Option B. Under Option A, NFL surfaces via the existing `pickem` card. |

---

## 7. Phase 1 exit checklist

- [x] All existing NFL/Pick 'Em code reviewed and cited (verified line numbers, not assumed).
- [x] Architecture decisions re-validated; two corrected (Decision 3 lock semantics, Decision 4 silo-vs-extend).
- [x] Integration points identified (existing sport-slug integration; venue-card change is conditional).
- [x] File-structure impact corrected against reality (§6).
- [x] Risk assessment updated: **top risk is now building duplicate infrastructure (§5), not BDL rate limits.**
- [x] **Decisions resolved (see top of doc):** separate `/nfl-pickem` silo (sharing `pickem_picks` + settlement) + per-game kickoff locking.

---

## Direction for Phase 2 and beyond (post-decision)

- **Phase 2 (Database):** effectively a **no-op**. `pickem_picks.sport_slug` already allows `'nfl'`; per-game locking needs no lock-time storage. Do **not** create `nfl_pickem_weeks`. `nfl_pickem_user_weeks` (FR-11 weekly stats) is **deferred** (P1) — build only if/when a season-standings surface is prioritized, and follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` if so.
- **Phase 3 (Backend):** build `lib/nflPickEm.ts` (+ optional `lib/nflWeekUtils.ts`) and `app/api/nfl-pickem/{weeks,games,picks}`. The week logic can be **ported from `lib/pickem.ts:1725–1785`**, but **must fix the single-day filter bug (§3)** — filter NFL games by the `fromIso..toIso` week range, not a single `date` key. Reuse `settlePendingPickEmPicks()` and the `pickem_picks` writes so settlement stays unified.
- **Phase 4 (Frontend):** build `components/nfl-pickem/*` and the `/nfl-pickem` route. Add the `nfl-pickem` `VenueGameKey` + venue card (`lib/venueGameCards.ts`) and `inferVenueGameKeyFromPath` entry, per plan §1.5.2.
- **Legacy Pick 'Em coexistence:** the old unified Pick 'Em (with NFL gated off at `lib/pickem.ts:302–303`) stays as-is for now. Leaving NFL `isClickable: false` there avoids exposing NFL in two places while the silo is the canonical NFL surface. Retiring legacy Pick 'Em, if chosen later, is a separate migration.

**Next:** Phase 2 — confirm the no-op database conclusion, then move to Phase 3.
