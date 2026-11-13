# Partner Business Type Plan — "What kind of business are you?" at sign-up

**Status:** Phases 1–3 released 2026-11-13 (migration applied 2026-11-12; 4 partners backfilled to `bar_restaurant`).
Admin Activate-a-Venue item dropped (it creates venues, not partners). **Phase 4 (make the type required) waits until
the sign-up question has been live ≥ 1 day.** Latest handoff: `docs/partner-business-type-plan_PHASE_3_HANDOFF.md`.
Each phase ends with a handoff note `docs/partner-business-type-plan_PHASE_<N>_HANDOFF.md`; update this line to point at the latest one.

---

## 1. What we're building (plain English)

Hightop Challenge is no longer only for bars and restaurants. Trivia DJs, hotels and movie theaters are
signing up too (the "Trivia DJs" ad, 2026-11-12, markets straight to DJs). Sign-up gets **one new question,
on its own screen**: *What kind of business are you?*

- Bar/Restaurant
- Trivia DJ
- Hotel
- Movie theater
- Other

Everything else works the same for every type: same price, same dashboard, same "+ Add a venue". The answer
is stored so that later we *can* price, report or market by type. Nothing reads it for behaviour in this plan.

A trivia DJ signs up exactly like a bar owner, then adds each client venue with "+ Add a venue" (the
multi-venue billing plan). Prizes are agreed between the DJ and each venue, as they already are between any
partner and its guests; Hightop never honours prizes.

## 2. Decisions already made (Andrew, 2026-11-12)

1. Ask at sign-up. **Five options: Bar/Restaurant (one option, not two), Trivia DJ, Hotel, Movie theater, Other.**
2. All types operate the same. The answer only lets us tell customers apart later (pricing, reporting).
3. Keep this separate from the Trivia DJs video work.
4. Label is **"Trivia DJ"** (not "Trivia DJ / host"). US spelling **"Movie theater"**.
5. **"Other" is just the option** — no "What kind?" text box.
6. **The address step reads differently for a trivia DJ** (they enter their first client venue): see §3.
7. **Every existing partner is Bar/Restaurant** (all are bars except Carrabba's, a restaurant with a bar).
   Backfill them all to `bar_restaurant` in the Phase 1 migration.

## 3. Design

**Where it is stored: the partner, not the venue.** A DJ is a kind of *customer*; their venues are bars.
New column `venue_owners.business_type text NULL` with a check constraint on the five values
(`bar_restaurant`, `trivia_dj`, `hotel`, `movie_theater`, `other`). The same migration backfills every
existing row to `bar_restaurant` (Andrew, 2026-11-12: all existing partners are bars or a restaurant with a bar).
Before the backfill, list the rows it will change (id, name, email, current value) and keep that list as the
undo log next to the handoff. After it, `NULL` should only appear on an unpaid pending signup made by an
old browser tab during the deploy skew (below) — treat `NULL` as unknown, never as Bar/Restaurant.

**One home for the list:** `lib/partnerBusinessType.ts` — the values, their on-screen labels, a parser
(`parseBusinessType(value): BusinessType | null`) and the label lookup. No other file spells the list
(contract test).

**Wizard:** a new first step `business` in `SIGNUP_STEPS` (`lib/selfServeSignup.ts`), before `name`: the
partner taps one of five big buttons and the wizard advances (no Next needed on a tap; Back works as on
every step). Draft field `businessType: BusinessType | ""`, persisted to sessionStorage like the others.
The review step shows it as one row, editable like the other rows. Copy: heading
"What kind of business are you?" and the five labels — nothing else (product copy rule).

**Address step for a trivia DJ** (`components/signup/steps/AddressStep.tsx`, today eyebrow "Your venue",
title "Where is your venue?"): when `businessType === "trivia_dj"`, eyebrow "Your first venue", title
"Where's your first venue?". The helper and field stay the same. Every other type keeps today's copy.
The geofence and review steps are unchanged (they are about the venue, which is right for a DJ too).
After sign-up a DJ adds more venues with "+ Add a venue" (multi-venue billing).

**Server:** `validateSignupDraft` requires a valid type; `POST /api/owner/signup` writes it in the existing
`venue_owners` insert (`app/api/owner/signup/route.ts`, `.insert({ auth_id, email, name })` →
`+ business_type`). **Deploy skew:** for the first release the server accepts a missing type (writes
`NULL`) so a wizard already open in someone's browser can still submit; Phase 4 makes it required.

**Admin:** show the type wherever a partner is listed for ops (admin billing partner list,
`app/api/admin/billing/route.ts` + its screen), with "—" for `NULL`. An admin can set or change it there.
Admin Activate-a-Venue (`components/admin/mobile/ActivateVenueFlow.tsx`) gets the same five options as a
required choice when it creates a new partner, so no new partner is `NULL`.

**Cost:** one text column on an existing insert and existing admin reads. No new queries, crons or API calls.

## 4. Phases

| Phase | What | Model / effort | Why |
|---|---|---|---|
| 1 | Migration (`venue_owners.business_type` + check constraint + backfill every existing row to `bar_restaurant`), `lib/partnerBusinessType.ts`, `types/index.ts`, server validation + insert in `POST /api/owner/signup` (type optional for now), contract tests. `supabase db push` only with Andrew's go-ahead, migration before app. | Claude Opus 5.5 / high | Migration on production + the signup route that creates `auth.users` / `venue_owners` rows (auth-adjacent; standing rules in the signup plan). |
| 2 | Wizard step `business` (new `components/signup/steps/BusinessTypeStep.tsx`), draft field, review-step row, step transitions, the trivia-DJ address-step wording; check at 350 px and 289 px wide. | Claude Sonnet 5.5 / medium | Well-specified UI on an existing wizard pattern. |
| 3 | Admin: show + edit the type in the partner list; required choice in Admin Activate-a-Venue. | Claude Sonnet 5.5 / medium | Small admin UI + one admin write, behind existing admin auth. |
| 4 | Make the type required server-side (after Phase 2 has been live ≥ 1 day), add the Standing rules section below, update the signup plan's pointer, release notes. | Claude Haiku 5.5 / low | Mechanical one-line change + docs. |

## 5. Traps to know before starting

- **Read the signup plan's "Standing rules" first** (`docs/partner-self-serve-signup-plan.md` §Standing rules).
  An unpaid signup is not an account; the new column rides on the same pending row and is deleted with it by
  `purgePendingSignup` (no change needed — it is a column on `venue_owners`, not a new table).
- `venue_owners` already exists, so no new grants are needed; but if anything new is created (a view, an
  enum type), follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`. Prefer `text` + `CHECK` over a Postgres
  enum (adding a value later is a one-line constraint swap, not an enum migration).
- Existing migrations are read-only history: this is a NEW migration (`supabase migration new partner_business_type`).
- `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` gates the wizard; nothing here adds a flag.
- No text under 12 px; one accent; the five buttons follow the existing signup button style (`SignupQuestion`).
- The DJ address-step wording keys off the draft's `businessType`; a DJ who goes Back and changes the
  type must see the address step's title change with it (no stale copy).

## 6. Open questions for Andrew

None — all answered 2026-11-12 (§2).

## 7. Out of scope

Different prices, dashboards, or game lists by type; any player-facing change; the Trivia DJs video.
