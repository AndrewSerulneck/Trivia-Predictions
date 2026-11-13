# Partner Business Type — Phase 1 handoff (2026-11-12)

Plan: `docs/partner-business-type-plan.md`. Phase 1 done by Claude Opus 5.5 / high effort, as the plan's table names.

## For Andrew (plain English)

- **What changed:** the database now has a place to store each partner's business type
  (Bar/Restaurant, Trivia DJ, Hotel, Movie theater, Other). All 4 existing partners are set to
  **Bar/Restaurant**, as you decided. The sign-up server can now accept and save the answer.
- **Is it live?** The **database change is live** (pushed to production 2026-11-12 with your go-ahead).
  The **code is not committed or deployed** yet. Nobody sees anything new: the sign-up screens don't ask
  the question until Phase 2.
- **What's left:** Phase 2 (the question screen in sign-up), Phase 3 (admin shows/edits it), Phase 4
  (make the answer required).
- **Needs you:** decide when to commit/deploy this code (it's safe to deploy any time — see below). One
  small question at the end (§7).

---

## For the next agent (Phase 2)

### 1. Next phase goal and scope

Phase 2 (Claude Sonnet 5.5 / medium): the wizard step `business` — new
`components/signup/steps/BusinessTypeStep.tsx`, draft field `businessType`, review-step row, step
transitions, and the trivia-DJ wording on the address step ("Your first venue" / "Where's your first
venue?"). Check at 350 px and 289 px wide. Full spec: plan §3 "Wizard" and "Address step for a trivia DJ".

**Out of scope:** admin screens (Phase 3), making the server require the type (Phase 4), any pricing or
behaviour by type, the Trivia DJs video.

### 2. Starting state

- **Branch:** `feature/venue-display-intro-stinger` (last commit `252fa61d Venue display: phase 5 game
  moments`). **Nothing from Phase 1 is committed.** That branch also carries unrelated uncommitted
  venue-display work (`components/venue-screen/*`, `tests/venue-screen-*`, `docs/tv-display-*`) — do not
  commit Phase 1 files together with it by accident; stage Phase 1 files by path (list in §4), ideally on
  its own branch off `main`.
- **Pushed / deployed:** nothing pushed to GitHub, nothing deployed to Vercel.
- **Database (production `pkmxupsayzshvpirkaav`):** migration
  `supabase/migrations/20261112214307_partner_business_type.sql` **applied** 2026-11-12 ~21:46 UTC via
  `supabase db push` (Andrew approved). Before the push, `supabase migration list` showed local and
  remote in sync, and `--dry-run` showed only this migration pending.
- **Data change:** 4 `venue_owners` rows set from NULL (column new) to `bar_restaurant`. Undo log:
  `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json` (id, name, email, previous
  value — contains partner emails; keep it out of anything public). Post-push check:
  `counts: { bar_restaurant: 4 }`, `nullRows: []`.
- **Undo:** `update public.venue_owners set business_type = null where id in (<ids from the log>);`, or
  drop the column via a NEW migration (nothing reads it yet).

### 3. Decisions already made (don't re-ask)

All of plan §2 (Andrew, 2026-11-12): five options, labels "Bar/Restaurant", "Trivia DJ", "Hotel",
"Movie theater", "Other"; no free-text box for Other; stored on the partner (`venue_owners`), not the
venue; all types behave the same; DJ address-step wording; existing partners backfilled to
`bar_restaurant`. Andrew approved the production push in this session.

Phase 1 implementation decisions:
- **Missing type is accepted** (stored as NULL) until Phase 4 — `SIGNUP_BUSINESS_TYPE_REQUIRED = false`
  in `lib/selfServeSignup.ts`. A present but unknown value is always a 400.
- **The owner insert names `business_type` only when there is a value.** So the app can be deployed
  before or after the migration without breaking signup, and an old wizard tab writes NULL by default.
- **`SignupDraft` was NOT changed in Phase 1.** `SignupDraft` is also used by the multi-venue add flow
  (`lib/addVenueFlow.ts`, `lib/venueAddition.ts`), so adding a field ripples there; that's Phase 2's call.
- `"—"` for unknown is `BUSINESS_TYPE_UNKNOWN_LABEL` / `businessTypeLabel(null)`.

### 4. Files created or changed

- `supabase/migrations/20261112214307_partner_business_type.sql` (new, applied): column
  `venue_owners.business_type text NULL`, constraint `venue_owners_business_type_check`
  (`business_type is null or in (the five)`), column comment, backfill `where business_type is null`.
- `lib/partnerBusinessType.ts` (new): `BUSINESS_TYPES`, `BusinessType`, `BUSINESS_TYPE_LABELS`,
  `BUSINESS_TYPE_UNKNOWN_LABEL`, `isBusinessType`, `parseBusinessType(value: unknown)`,
  `businessTypeLabel(value)`. Pure (no `server-only`), so the browser wizard can import it.
- `lib/selfServeSignup.ts`: added `SIGNUP_BUSINESS_TYPE_REQUIRED`, `SIGNUP_BUSINESS_TYPE_ISSUE`
  ("Pick what kind of business you are."), `SignupBusinessTypeResult`,
  `resolveSignupBusinessType(value, required = SIGNUP_BUSINESS_TYPE_REQUIRED)`.
- `app/api/owner/signup/route.ts`: `SignupBody.businessType`; after `validateSignupDraft` (so after the
  rate limiter) calls `resolveSignupBusinessType(body.businessType)` → 400 on `ok: false`; the
  `venue_owners` insert spreads `business_type` when non-null.
- `types/index.ts`: `import type { BusinessType }` at the top; `VenueOwner.businessType?: BusinessType | null`.
- `scripts/partner-business-type-backfill-log.cjs` (new, read-only): writes the undo log; `--after`
  reports remaining NULL rows. Run: `node --env-file=.env.local scripts/partner-business-type-backfill-log.cjs [--after] [--out <file>]`.
- `tests/partner-business-type-contract.test.ts` (new): list + labels; parser; **no app file outside
  `lib/partnerBusinessType.ts` spells `"bar_restaurant"`, `"trivia_dj"` or `"movie_theater"`** (scans
  `app`, `lib`, `components`, `types`; `"hotel"`/`"other"` are too common to scan); migration CHECK equals
  `BUSINESS_TYPES`; backfill shape; no enum; route uses the resolver after the limiter;
  `SIGNUP_BUSINESS_TYPE_REQUIRED === false` (Phase 4 updates this assertion).
- `tests/api.owner.signup.test.ts`: new `describe("business type …")` — valid type is written; missing
  (`undefined`, `null`, `""`, `"   "`) → 200 with no `business_type` key; unknown values → 400, no writes.
- `docs/partner-business-type-plan.md`: status line points here.

### 5. Facts and traps

- **For Phase 2 — the validate loop trap.** If you add `"business"` to `SIGNUP_STEPS` with a
  `case "business"` in `signupStepIssue` that requires a value, `validateSignupDraft` (which loops all
  steps and is the route's gate) will start **requiring** it server-side, breaking deploy skew before
  Phase 4. Keep the server gate in `resolveSignupBusinessType` only: e.g. have `validateSignupDraft` skip
  the `business` step, or have the route fill `draft.businessType` from the resolved value and skip that
  step. The client step should call `resolveSignupBusinessType(draft.businessType, true)`.
- **The wizard must send `businessType` in its POST body** (`components/signup/SignupWizard.tsx`
  `submit()` builds the body) — otherwise every new partner is NULL.
- **Other paths still create partners with NULL:** legacy `app/api/owner/auth/register/route.ts` (used
  when `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is off) and admin Activate-a-Venue (`lib/admin.ts`,
  fixed in Phase 3). Not in the plan for the legacy route — see §7.
- `supabase/migrations/Warnings` is a stray file; the CLI prints "Skipping migration Warnings…" — harmless.
- The Supabase CLI is v2.116.0 (v3.1.0 available); `supabase db push` needed `echo Y |` to confirm.
- `purgePendingSignup` / the signup sweep need no change: the column rides on the `venue_owners` row.
- The 4 production partners: Andrew Serulneck, Marc Serulneck, Sonny, Sally (ids in the undo log).

### 6. Build, run, test

- `npx vitest run tests/partner-business-type-contract.test.ts tests/api.owner.signup.test.ts` — 56 pass (9 + 47).
- Full `npm run test`: **530 files / 7,014 tests passed** (13 skipped, pre-existing).
- `npx tsc --noEmit`: clean. `npx eslint` on all changed files: clean. `npm run build` not run.
- Verified in production: column exists, all 4 rows `bar_restaurant` (script `--after`).
- **Unverified:** the CHECK constraint rejecting a bad value was not exercised against production (no
  test write to the live DB); it applied without error and the SQL is pinned by the contract test.
  No browser check (nothing visible changed).

### 7. Open questions for Andrew

- Should the legacy `/owner/register` path (used only while self-serve signup is off) also ask, or is
  NULL fine there until self-serve is on? Not in the plan; Phase 3 admin editing can fix any NULL row.

### 8. Recommended first steps for Phase 2 (Claude Sonnet 5.5 / medium)

1. Read plan §3, this note §5, and `docs/partner-self-serve-signup-plan.md` §Standing rules.
2. Read `components/signup/SignupWizard.tsx`, `components/signup/signupDraft.ts` (sessionStorage),
   `components/signup/steps/AddressStep.tsx`, `ReviewStep.tsx`, and the `SignupQuestion` button style.
3. Add `businessType: BusinessType | ""` to the draft, decide how `lib/addVenueFlow.ts` /
   `lib/venueAddition.ts` handle it, add the step, send it in `submit()`, then handle the validate-loop trap.
4. Extend `tests/api.owner.signup.test.ts` / wizard tests; check 350 px and 289 px.
