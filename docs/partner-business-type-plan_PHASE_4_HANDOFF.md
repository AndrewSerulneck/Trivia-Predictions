# Partner Business Type — Phase 4 handoff (2026-11-12)

**For Andrew (plain English):** Sign-up now refuses a partner who doesn't pick a business type, on the server as
well as on screen. Nothing is committed or deployed. **Do not deploy this until the Phase 2 question screen has
been live for at least one day.** Otherwise a sign-up page that was open before that deploy would be refused
with no question to answer. Also decided: the old `/owner/register` route still saves no type (NULL); see §7.

**Changed:**
- `lib/selfServeSignup.ts`: `SIGNUP_BUSINESS_TYPE_REQUIRED = true`. `validateSignupDraft` no longer skips the
  `business` step, so the whole-draft gate and the step gate share one rule (`signupStepIssue("business")` →
  `resolveSignupBusinessType(value, true)`).
- `app/api/owner/signup/route.ts`: no code change needed. It already calls `resolveSignupBusinessType(body.businessType)`
  after the rate limiter, so a missing type now returns 400 before any account work.
- Tests updated to the new rule: `tests/partner-business-type-contract.test.ts` (asserts `true`),
  `tests/api.owner.signup.test.ts` (`VALID_BODY` now carries `businessType: "bar_restaurant"`; the "missing type
  is accepted" test became "missing type is 400"), `tests/components.signup-business-type-step.test.ts`,
  `tests/lib.signup-draft.test.ts` (`filledDraft` carries a type).
- Docs: `docs/partner-business-type-plan.md` (status line; new §8 Standing rules with the deploy gate),
  `docs/partner-self-serve-signup-plan.md` (Standing rules pointer), this note.

**Verified:** `npm run test` 531 files pass, 7,026 tests pass, 13 skipped (the first run had two
`lib.signup-draft` failures from the fixture, fixed and re-run). `npx tsc --noEmit` clean. `npx eslint` on the
changed TS files clean. No database change in this phase.
**Not verified:** no browser check. No live API check against production (deliberately; nothing is deployed).

**State:** branch `feature/venue-display-intro-stinger`, nothing committed, pushed or deployed. Stage this phase's
files by path. The branch also holds unrelated venue-display work. No Supabase change.

**Open:**
- §7 Legacy `/owner/register`: decision — **left unchanged**. It still writes NULL. It is the pre-self-serve
  route and does not show the wizard, so the question can't be asked there. Admin can set the type in Partner
  Billing. Revisit if that route stays in use after self-serve goes live.
- Deploy timing is Andrew's call, but only after Phase 2 has been live ≥ 1 day.

**Next:** nothing left in the plan except the deploy and the post-deploy check: confirm no new partner row has a
NULL `business_type` after the first day of sign-ups (`node --env-file=.env.local scripts/partner-business-type-backfill-log.cjs --after`).
