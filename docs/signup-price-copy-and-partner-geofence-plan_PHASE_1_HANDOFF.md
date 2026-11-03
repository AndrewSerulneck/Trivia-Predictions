# Signup price copy + partner geofence — Phase 1 handoff (2026-11-03)

**For Andrew:** the signup "Does this look right?" page and `/owner/billing/setup` no longer show "Venue Pro" or
"$100/mo". The card now says "You'll see your price on Stripe's secure checkout, where you can also enter a promo
code. Cancel anytime." and the button says "Continue to checkout". Not committed, not deployed; nothing needs you.

**For the next agent (short note — copy-only phase):** On branch `after-app-review` (last commit `8d97a95e`), all
changes are **uncommitted** (the plan file itself is also untracked). Changed: `lib/selfServeSignup.ts`
(`SIGNUP_PRICE_LABEL` deleted, replaced by `SIGNUP_CHECKOUT_COPY` `{ button, note }` — the one home of this copy),
`components/signup/steps/ReviewStep.tsx` (card is just the note), `components/signup/SignupWizard.tsx` (review label),
`app/owner/billing/setup/page.tsx` (card + button), comment rewording in `components/signup/signupMotion.ts` and
`app/api/signup/email-available/route.ts`; new `tests/signup-no-price-copy-contract.test.ts` (fails on `Venue Pro` or
`$<digit>` in the four files). Verified: `npx tsc --noEmit` clean, eslint clean on changed files, `npm run test` =
6,082 pass / 13 skip / 4 fail — the 4 are the pre-existing date-based MLB/NFL star-index staleness tripwires
(`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`), unrelated; refreshing them calls external APIs, so it was
not done. **Not verified:** no browser screenshot was taken (the change only removes elements from two cards).
Same session also slimmed the project `CLAUDE.md` (140 KB → 11 KB): feature rules now sit in a "Standing rules
(moved from CLAUDE.md, 2026-11-03)" section at the end of each plan doc — for Phase 2, read that section in
`docs/partner-self-serve-signup-plan.md` (Google Maps key rules, `lib/venueClaim.ts`). **Next:** Phase 2 (Opus 5.5,
medium) — start with `grep -rn "place_id" lib app` and `tests/self-serve-signup-contract.test.ts`, as the plan says.
