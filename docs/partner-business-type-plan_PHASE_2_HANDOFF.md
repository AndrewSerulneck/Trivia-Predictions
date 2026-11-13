# Partner Business Type — Phase 2 handoff (2026-11-12)

**For Andrew:** The sign-up wizard now opens with "What kind of business are you?" (five full-width buttons;
one tap answers and moves on; Back works). It's the new step 1 of 7. The answer is saved to the partner when
they submit, shown as a "Business" row on the review screen, and a Trivia DJ sees "Where's your first venue?"
on the address step. Not committed or deployed; only visible when `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` is on.
Not checked in a browser at 350 px / 289 px (needs the flag + a clean clone) — please eyeball it.

**Changed:** `lib/selfServeSignup.ts` (`business` first in `SIGNUP_STEPS`; `SignupDraft.businessType: BusinessType | ""`;
client `signupStepIssue("business")` requires it; `validateSignupDraft` SKIPS it so the server stays optional
until Phase 4 — the server gate is `resolveSignupBusinessType`), `lib/partnerBusinessType.ts` (`isTriviaDj`),
`components/signup/steps/BusinessTypeStep.tsx` (new), `SignupWizard.tsx` (step, POST body), `signupDraft.ts`
(persist/validate on restore), `AddressStep.tsx` (DJ wording keyed off the draft, so Back-and-change updates it),
`ReviewStep.tsx` (row), `app/api/owner/signup/route.ts` (`draftFromBody` sets the field), tests:
`components.signup-business-type-step.test.ts` (new), `components.signup-wizard-errors.test.ts` (seed draft).
The multi-venue add flow shares `SignupDraft`; its `businessType` stays "" and its address copy is unchanged.
Review row is display-only like the other rows (none were editable; Back is the edit path).

**Verified:** tsc, eslint clean; full vitest 531 files / 7,024+ tests pass.
**Next:** Phase 4 (Haiku / low): make type required in `resolveSignupBusinessType`/`SIGNUP_BUSINESS_TYPE_REQUIRED`
(update the contract-test assertion), remove the `validateSignupDraft` skip, add Standing rules, decide legacy `/owner/register`.
